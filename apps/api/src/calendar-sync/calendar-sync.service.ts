import { reportIntegrationFailure } from '../observability/error-reporter.js';
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { PrismaService } from '../database/prisma.service.js';
import type { CalendarProviderKey } from '../generated/prisma/client.js';
import { ProviderError, type CalendarProvider } from './providers.js';
import { sameContent, toContent, type EventContent } from './remote-events.js';
import { planSync, type Action } from './sync-plan.js';
import { decryptToken, encryptToken, signState, verifyState } from './token-crypto.js';

export const CALENDAR_PROVIDERS = Symbol('CALENDAR_PROVIDERS');
export type SyncSummary = { imported: number; updated: number; removed: number; sent: number; conflicts: number; skippedRecurring: number; problems: string[] };

const DAY = 86_400_000;
const STALE_CLAIM_MS = 10 * 60_000;
const emptySummary = (): SyncSummary => ({ imported: 0, updated: 0, removed: 0, sent: 0, conflicts: 0, skippedRecurring: 0, problems: [] });
const toLocalContent = (event: { title: string; description: string | null; location: string | null; isAllDay: boolean; startsAt: Date; endsAt: Date | null }): EventContent => ({ title: event.title, description: event.description, location: event.location, isAllDay: event.isAllDay, startsAt: event.startsAt, endsAt: event.endsAt });

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger('CalendarSync');
  private readonly byKey: Map<string, CalendarProvider>;

  constructor(private readonly prisma: PrismaService, @Inject(CALENDAR_PROVIDERS) providers: CalendarProvider[]) { this.byKey = new Map(providers.map((provider) => [provider.key, provider])); }

  private key(): Buffer {
    const { calendar } = readApiEnvironment();
    if (!calendar.tokenKey) throw new ServiceUnavailableException('Calendar connections need TOKEN_ENCRYPTION_KEY to be set.');
    return calendar.tokenKey;
  }
  private redirectUri() { return `${readApiEnvironment().calendar.apiPublicUrl}/api/v1/integrations/calendar/callback`; }
  private webUrl(path: string) { return `${readApiEnvironment().webBaseUrl.replace(/\/$/, '')}${path}`; }

  /** Connecting and managing calendars is for owners and administrators: the events become visible to everyone in the workspace. */
  private async manager(identity: AuthenticatedIdentity, workspaceId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const membership = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } });
    if (!membership || !['OWNER', 'ADMINISTRATOR'].includes(membership.role)) throw new ForbiddenException('Only workspace owners and administrators can connect calendars.');
    return userId;
  }

  async overview(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.manager(identity, workspaceId);
    const { calendar } = readApiEnvironment();
    const connections = await this.prisma.calendarConnection.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' }, select: { id: true, provider: true, accountEmail: true, pushEnabled: true, status: true, lastSyncedAt: true, lastError: true, createdAt: true, connectedBy: { select: { displayName: true } } } });
    const providers = (['GOOGLE', 'MICROSOFT'] as const).map((key) => ({ key, label: key === 'GOOGLE' ? 'Google Calendar' : 'Outlook Calendar', configured: this.byKey.has(key) && Boolean(calendar.tokenKey), setup: key === 'GOOGLE' ? 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET' : 'MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET' }));
    return { providers, connections, redirectUri: this.redirectUri() };
  }

  async connect(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const userId = await this.manager(identity, workspaceId);
    const body = input && typeof input === 'object' && !Array.isArray(input) ? input as { provider?: unknown; pushEnabled?: unknown } : {};
    if (body.provider !== 'GOOGLE' && body.provider !== 'MICROSOFT') throw new BadRequestException('Choose Google or Outlook.');
    const provider = this.byKey.get(body.provider);
    if (!provider) throw new ServiceUnavailableException(`${body.provider === 'GOOGLE' ? 'Google Calendar' : 'Outlook Calendar'} isn’t set up for this AVEN installation yet. An administrator needs to add its client ID and secret.`);
    const state = signState(this.key(), { workspaceId, userId, provider: body.provider, pushEnabled: body.pushEnabled === true });
    return { url: provider.authUrl(state, this.redirectUri()) };
  }

  /** Where the provider sends the browser after sign-in. Returns the page to show next; never throws to the browser. */
  async callback(query: { code?: string; state?: string; error?: string }): Promise<string> {
    const back = (params: string) => this.webUrl(`/workspace/settings/connections?${params}`);
    if (query.error) return back(`error=${encodeURIComponent(query.error === 'access_denied' ? 'You chose not to connect the calendar.' : 'The calendar service declined the connection.')}`);
    try {
      const state = query.state ? verifyState(this.key(), query.state) : null;
      if (!state || !query.code) return back('error=That sign-in link was not valid or has expired. Please try again.');
      const provider = this.byKey.get(state.provider); if (!provider) return back('error=That calendar service is not set up.');
      const membership = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: state.workspaceId, userId: state.userId } }, select: { role: true } });
      if (!membership || !['OWNER', 'ADMINISTRATOR'].includes(membership.role)) return back('error=You no longer have permission to connect calendars here.');
      const tokens = await provider.exchange(query.code, this.redirectUri());
      const key = this.key();
      const data = { connectedById: state.userId, accessTokenEnc: encryptToken(key, tokens.accessToken), refreshTokenEnc: encryptToken(key, tokens.refreshToken), expiresAt: tokens.expiresAt, pushEnabled: state.pushEnabled, status: 'ACTIVE', lastError: null };
      const connection = await this.prisma.calendarConnection.upsert({ where: { workspaceId_provider_accountEmail: { workspaceId: state.workspaceId, provider: state.provider, accountEmail: tokens.email } }, create: { workspaceId: state.workspaceId, provider: state.provider, accountEmail: tokens.email, ...data }, update: data, select: { id: true } });
      void this.syncConnection(connection.id).catch((error) => { reportIntegrationFailure('calendar', error); this.logger.warn(`First sync failed: ${error instanceof Error ? error.message : error}`); });
      return back(`connected=${state.provider.toLowerCase()}`);
    } catch (error) {
      reportIntegrationFailure('calendar', error);
      this.logger.warn(`Calendar connection failed: ${error instanceof Error ? error.message : error}`);
      return back(`error=${encodeURIComponent(error instanceof ProviderError ? error.message : 'The calendar could not be connected. Please try again.')}`);
    }
  }

  private async owned(workspaceId: string, connectionId: string) {
    const connection = await this.prisma.calendarConnection.findFirst({ where: { id: connectionId, workspaceId }, select: { id: true } });
    if (!connection) throw new NotFoundException('Calendar connection not found in this workspace.');
    return connection;
  }

  async setPush(identity: AuthenticatedIdentity, workspaceId: string, connectionId: string, input: unknown) {
    await this.manager(identity, workspaceId); await this.owned(workspaceId, connectionId);
    const pushEnabled = input && typeof input === 'object' ? (input as { pushEnabled?: unknown }).pushEnabled : undefined;
    if (typeof pushEnabled !== 'boolean') throw new BadRequestException('pushEnabled must be true or false.');
    await this.prisma.calendarConnection.update({ where: { id: connectionId }, data: { pushEnabled } });
    return { pushEnabled };
  }

  /** Disconnecting stops syncing and forgets the tokens. Events already imported stay in AVEN; they just stop updating. */
  async disconnect(identity: AuthenticatedIdentity, workspaceId: string, connectionId: string) {
    await this.manager(identity, workspaceId); await this.owned(workspaceId, connectionId);
    await this.prisma.calendarConnection.delete({ where: { id: connectionId } });
    return { disconnected: true };
  }

  async syncNow(identity: AuthenticatedIdentity, workspaceId: string, connectionId: string) {
    await this.manager(identity, workspaceId); await this.owned(workspaceId, connectionId);
    const result = await this.syncConnection(connectionId);
    return result ?? { ...emptySummary(), problems: ['A sync is already running for this calendar. Try again in a moment.'] };
  }

  /** The scheduled run: connections that haven't synced for five minutes, a few at a time. */
  async syncDue(limit = 10): Promise<number> {
    const due = await this.prisma.calendarConnection.findMany({ where: { status: 'ACTIVE', OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(Date.now() - 5 * 60_000) } }] }, orderBy: { lastSyncedAt: { sort: 'asc', nulls: 'first' } }, take: limit, select: { id: true } });
    let done = 0;
    for (const { id } of due) { try { if (await this.syncConnection(id)) done += 1; } catch (error) { reportIntegrationFailure('calendar', error); this.logger.warn(`Sync of ${id} failed: ${error instanceof Error ? error.message : error}`); } }
    return done;
  }

  private async accessToken(connection: { id: string; accessTokenEnc: string; refreshTokenEnc: string; expiresAt: Date }, provider: CalendarProvider): Promise<string> {
    const key = this.key();
    if (connection.expiresAt.getTime() - Date.now() > 60_000) return decryptToken(key, connection.accessTokenEnc);
    const fresh = await provider.refresh(decryptToken(key, connection.refreshTokenEnc));
    await this.prisma.calendarConnection.update({ where: { id: connection.id }, data: { accessTokenEnc: encryptToken(key, fresh.accessToken), refreshTokenEnc: encryptToken(key, fresh.refreshToken), expiresAt: fresh.expiresAt } });
    return fresh.accessToken;
  }

  /** Returns null when another sync of the same account is already running. */
  async syncConnection(connectionId: string): Promise<SyncSummary | null> {
    const claimed = await this.prisma.calendarConnection.updateMany({ where: { id: connectionId, OR: [{ syncingSince: null }, { syncingSince: { lt: new Date(Date.now() - STALE_CLAIM_MS) } }] }, data: { syncingSince: new Date() } });
    if (claimed.count !== 1) return null;
    const summary = emptySummary();
    try {
      const connection = await this.prisma.calendarConnection.findUnique({ where: { id: connectionId } });
      if (!connection) return summary;
      const provider = this.byKey.get(connection.provider);
      if (!provider) { summary.problems.push(`${connection.provider === 'GOOGLE' ? 'Google' : 'Outlook'} is no longer set up on this server.`); return summary; }
      let token: string;
      try { token = await this.accessToken(connection, provider); }
      catch (error) { return await this.fail(connectionId, error, summary); }
      const now = Date.now(); const window = { from: new Date(now - 30 * DAY), to: new Date(now + 180 * DAY) };
      let remote;
      try { remote = await provider.list(token, window); }
      catch (error) { return await this.fail(connectionId, error, summary); }

      const links = await this.prisma.externalEventLink.findMany({ where: { connectionId } });
      const eventIds = links.map((link) => link.eventId).filter((id): id is string => Boolean(id));
      const events = eventIds.length ? await this.prisma.calendarEvent.findMany({ where: { workspaceId: connection.workspaceId, id: { in: eventIds } } }) : [];
      const eventById = new Map(events.map((event) => [event.id, event]));
      const locals = new Map(events.map((event) => [event.id, { id: event.id, updatedAt: event.updatedAt, startsAt: event.startsAt, recurring: event.recurrence !== null }]));
      const unlinkedRows = connection.pushEnabled ? await this.prisma.calendarEvent.findMany({ where: { workspaceId: connection.workspaceId, externalLinks: { none: {} }, startsAt: { gte: window.from, lte: window.to } }, take: 500 }) : [];
      const unlinkedById = new Map(unlinkedRows.map((event) => [event.id, event]));
      const plan = planSync({ remote, links: links.map((link) => ({ id: link.id, eventId: link.eventId, externalId: link.externalId, etag: link.etag, localSyncedAt: link.localSyncedAt })), locals, unlinked: unlinkedRows.map((event) => ({ id: event.id, updatedAt: event.updatedAt, startsAt: event.startsAt, recurring: event.recurrence !== null })), pushEnabled: connection.pushEnabled, window });
      summary.skippedRecurring = plan.skippedRecurring;

      const label = provider.label; const notes: string[] = [];
      for (const action of plan.actions) {
        try { await this.apply(action, { connection, provider, token, label, eventById, unlinkedById, summary, notes }); }
        catch (error) {
          if (error instanceof ProviderError && error.kind === 'auth') throw error;
          if (error instanceof ProviderError && error.kind === 'conflict') { summary.conflicts += 1; continue; }
          summary.problems.push(error instanceof Error ? error.message.slice(0, 120) : 'An event could not be synced.');
        }
      }
      if (summary.imported + summary.updated + summary.removed + summary.sent > 0) await this.prisma.workspaceActivity.create({ data: { workspaceId: connection.workspaceId, actorId: connection.connectedById, entityType: 'CALENDAR', entityId: connection.id, message: `synced ${label}: ${[summary.imported && `${summary.imported} added`, summary.updated && `${summary.updated} updated`, summary.removed && `${summary.removed} removed`, summary.sent && `${summary.sent} sent`].filter(Boolean).join(', ')}${notes.length ? `. ${notes.slice(0, 2).join(' ')}` : ''}`.slice(0, 240) } });
      await this.prisma.calendarConnection.update({ where: { id: connectionId }, data: { lastSyncedAt: new Date(), status: 'ACTIVE', lastError: summary.problems[0] ?? null } });
      return summary;
    } catch (error) { return await this.fail(connectionId, error, summary); }
    finally { await this.prisma.calendarConnection.updateMany({ where: { id: connectionId }, data: { syncingSince: null } }).catch(() => undefined); }
  }

  /** A refused token means the person has to reconnect; anything else is retried at the next sync. */
  private async fail(connectionId: string, error: unknown, summary: SyncSummary): Promise<SyncSummary> {
    const message = error instanceof Error ? error.message.slice(0, 280) : 'The sync failed.';
    const needsAttention = error instanceof ProviderError && error.kind === 'auth';
    await this.prisma.calendarConnection.updateMany({ where: { id: connectionId }, data: { lastError: message, ...(needsAttention ? { status: 'NEEDS_ATTENTION' } : {}) } });
    summary.problems.push(message);
    return summary;
  }

  private async apply(action: Action, c: { connection: { id: string; workspaceId: string }; provider: CalendarProvider; token: string; label: string; eventById: Map<string, any>; unlinkedById: Map<string, any>; summary: SyncSummary; notes: string[] }) {
    const { connection, provider, token, summary } = c;
    switch (action.type) {
      case 'createLocal': {
        const content = toContent(action.remote);
        await this.prisma.$transaction(async (tx) => {
          const event = await tx.calendarEvent.create({ data: { workspaceId: connection.workspaceId, type: 'OTHER', ...content } });
          await tx.externalEventLink.create({ data: { connectionId: connection.id, eventId: event.id, externalId: action.remote.id, etag: action.remote.etag, localSyncedAt: event.updatedAt } });
        }).catch((error) => { if ((error as { code?: string }).code !== 'P2002') throw error; });
        summary.imported += 1; return;
      }
      case 'updateLocal': {
        const content = toContent(action.remote); const current = c.eventById.get(action.eventId);
        const event = await this.prisma.calendarEvent.update({ where: { id: action.eventId }, data: content });
        await this.prisma.externalEventLink.update({ where: { id: action.linkId }, data: { etag: action.remote.etag, localSyncedAt: event.updatedAt } });
        if (!current || !sameContent(content, toLocalContent(current))) summary.updated += 1;
        if (action.conflict) { summary.conflicts += 1; c.notes.push(`“${event.title}” was edited in both places; the newer copy from ${c.label} was kept.`); }
        return;
      }
      case 'deleteLocal': {
        await this.prisma.externalEventLink.deleteMany({ where: { id: action.linkId } });
        await this.prisma.calendarEvent.deleteMany({ where: { id: action.eventId, workspaceId: connection.workspaceId } });
        summary.removed += 1; return;
      }
      case 'pushCreate': {
        const event = c.unlinkedById.get(action.eventId); if (!event) return;
        const created = await provider.create(token, toLocalContent(event));
        // If remembering the pairing fails, take the new copy back off the calendar so the next sync can't send it a second time.
        try { await this.prisma.externalEventLink.create({ data: { connectionId: connection.id, eventId: event.id, externalId: created.id, etag: created.etag, localSyncedAt: event.updatedAt } }); }
        catch (error) { await provider.remove(token, created.id).catch(() => undefined); throw error; }
        summary.sent += 1; return;
      }
      case 'pushUpdate': {
        const event = c.eventById.get(action.eventId); if (!event) return;
        const updated = await provider.update(token, action.externalId, toLocalContent(event), action.etag);
        await this.prisma.externalEventLink.update({ where: { id: action.linkId }, data: { etag: updated.etag, localSyncedAt: event.updatedAt } });
        summary.sent += 1;
        if (action.conflict) { summary.conflicts += 1; c.notes.push(`“${event.title}” was edited in both places; the newer copy from AVEN was kept.`); }
        return;
      }
      case 'pushDelete': {
        await provider.remove(token, action.externalId);
        await this.prisma.externalEventLink.deleteMany({ where: { id: action.linkId } });
        summary.sent += 1; return;
      }
      case 'dropLink': await this.prisma.externalEventLink.deleteMany({ where: { id: action.linkId } }); return;
    }
  }
}
