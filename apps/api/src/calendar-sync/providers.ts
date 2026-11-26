import { createHash } from 'node:crypto';
import { reportIntegrationFailure } from '../observability/error-reporter.js';
import type { CalendarOAuth } from '../config/api-environment.js';
import { fromAllDayDates, toAllDayDates, type EventContent, type RemoteEvent } from './remote-events.js';

/** `auth`: the provider no longer accepts our tokens. `conflict`: the copy changed since we read it. `retry`: try again later. `fatal`: won't work on retry. */
export class ProviderError extends Error {
  constructor(message: string, readonly kind: 'auth' | 'conflict' | 'retry' | 'fatal') { super(message); }
}
export type Tokens = { accessToken: string; refreshToken: string; expiresAt: Date; /** The permissions the provider says it granted, as it reports them (a space-separated list). */ scopes?: string };
export type Window = { from: Date; to: Date };
export type Changes = { events: RemoteEvent[]; syncToken: string | null; incremental: boolean };

export interface CalendarProvider {
  readonly key: 'GOOGLE' | 'MICROSOFT';
  readonly label: string;
  authUrl(state: string, redirectUri: string): string;
  exchange(code: string, redirectUri: string): Promise<Tokens & { email: string }>;
  refresh(refreshToken: string): Promise<Tokens>;
  /** Best effort: tells the provider to forget this grant. Not every provider offers it. */
  revoke?(refreshToken: string): Promise<void>;
  list(accessToken: string, window: Window): Promise<RemoteEvent[]>;
  /**
   * Optional incremental reading. With a sync token only what changed since the last read comes back (`incremental: true`, and deletions arrive as `cancelled`).
   * Without one, or when the provider says the token has expired, the whole window is read and a new token is returned when the provider gives one.
   */
  changes?(accessToken: string, window: Window, syncToken: string | null): Promise<Changes>;
  /** `key` makes sending safe to repeat: the provider copy gets an id derived from it, so a retry after a lost answer finds the copy instead of making a second one. */
  create(accessToken: string, content: EventContent, key?: string): Promise<{ id: string; etag: string }>;
  /** The provider id a copy made with `create(…, key)` gets, so AVEN can recognise its own copy if the answer to that request was lost. */
  idForKey?(key: string): string;
  /** Whether a provider id looks like one made by `idForKey`. */
  isSentCopy?(id: string): boolean;
  update(accessToken: string, id: string, content: EventContent, etag: string | null): Promise<{ etag: string }>;
  remove(accessToken: string, id: string): Promise<void>;
}

type Json = Record<string, any>;
const expires = (seconds: unknown) => new Date(Date.now() + (typeof seconds === 'number' ? seconds : 3600) * 1000);

async function call(url: string, init: RequestInit & { allow?: number[] }): Promise<{ status: number; body: Json | null }> {
  let response: Response;
  try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) }); }
  catch (error) { reportIntegrationFailure('calendar', error, { kind: 'network' }); throw new ProviderError('The calendar service could not be reached.', 'retry'); }
  const body = await response.json().catch(() => null) as Json | null;
  if (response.ok || init.allow?.includes(response.status)) return { status: response.status, body };
  reportIntegrationFailure('calendar', new Error(`The calendar service answered ${response.status}`), { status: response.status });
  const detail = String(body?.error_description ?? body?.error?.message ?? body?.error ?? '').slice(0, 160);
  if (response.status === 401 || (response.status === 400 && /invalid_grant/.test(String(body?.error)))) throw new ProviderError(detail || 'The calendar account needs to be reconnected.', 'auth');
  if (response.status === 403 && /scope/i.test(detail)) throw new ProviderError(url.includes('googleapis.com') ? GOOGLE_MISSING_SCOPE : 'AVEN was not given permission to use this calendar. Disconnect and connect it again.', 'auth');
  if (response.status === 403 && /insufficient|forbidden/i.test(detail)) throw new ProviderError(detail || 'AVEN was not given permission to use this calendar.', 'auth');
  if (response.status === 412 || response.status === 409) throw new ProviderError('This event changed on the calendar.', 'conflict');
  if (response.status === 429 || response.status >= 500) throw new ProviderError(detail || 'The calendar service is busy.', 'retry');
  throw new ProviderError(detail || `The calendar service refused the request (${response.status}).`, 'fatal');
}
const form = (values: Record<string, string>) => new URLSearchParams(values).toString();
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };
const hour = 3_600_000;

// ---- Google Calendar --------------------------------------------------------------------------------------

/** What AVEN asks Google for: sign-in identity, and read/write of calendar events. AVEN only touches events on the person's primary calendar, which this scope covers. */
export const GOOGLE_SCOPES = 'openid email https://www.googleapis.com/auth/calendar.events';
/** Google lets people untick individual permissions on its consent screen, so a token can come back without the one AVEN needs. Either of these lets AVEN read and write events. */
const GOOGLE_EVENT_SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar'];
export const googleScopesAllowEvents = (granted: unknown) => typeof granted === 'string' && granted.split(/\s+/).some((scope) => GOOGLE_EVENT_SCOPES.includes(scope));
const GOOGLE_MISSING_SCOPE = 'Google did not give AVEN permission to see and edit your calendar events. Disconnect, connect again, and keep the calendar permission ticked on Google’s screen.';

export class GoogleCalendar implements CalendarProvider {
  readonly key = 'GOOGLE' as const; readonly label = 'Google Calendar';
  constructor(private readonly config: CalendarOAuth) {}

  authUrl(state: string, redirectUri: string) {
    const query = form({ client_id: this.config.clientId, redirect_uri: redirectUri, response_type: 'code', scope: GOOGLE_SCOPES, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
    return `${this.config.authUrl}?${query}`;
  }
  async exchange(code: string, redirectUri: string) {
    const { body } = await call(this.config.tokenUrl, { method: 'POST', headers: FORM, body: form({ code, client_id: this.config.clientId, client_secret: this.config.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
    if (!body?.access_token || !body.refresh_token) throw new ProviderError('Google did not return a refresh token, so AVEN could not stay connected.', 'fatal');
    // Stop here if Google left the calendar permission out: saving the connection would only fail on the first sync.
    if (!googleScopesAllowEvents(body.scope)) throw new ProviderError(GOOGLE_MISSING_SCOPE, 'fatal');
    const email = this.emailFrom(body.id_token);
    if (!email) throw new ProviderError('Google did not say which account this is.', 'fatal');
    return { accessToken: body.access_token as string, refreshToken: body.refresh_token as string, expiresAt: expires(body.expires_in), email, scopes: String(body.scope).slice(0, 500) };
  }
  private emailFrom(idToken: unknown): string | null {
    try { return String(JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8')).email ?? '').toLowerCase() || null; } catch { return null; }
  }
  async refresh(refreshToken: string) {
    const { body } = await call(this.config.tokenUrl, { method: 'POST', headers: FORM, body: form({ refresh_token: refreshToken, client_id: this.config.clientId, client_secret: this.config.clientSecret, grant_type: 'refresh_token' }) });
    if (!body?.access_token) throw new ProviderError('Google did not return a new access token.', 'auth');
    if (typeof body.scope === 'string' && !googleScopesAllowEvents(body.scope)) throw new ProviderError(GOOGLE_MISSING_SCOPE, 'auth');
    return { accessToken: body.access_token as string, refreshToken: (body.refresh_token as string | undefined) ?? refreshToken, expiresAt: expires(body.expires_in) };
  }
  /** Google's revocation endpoint sits beside its token endpoint. Failure is ignored: the tokens are deleted from AVEN either way. */
  async revoke(refreshToken: string) {
    try { await fetch(this.config.tokenUrl.replace(/\/token$/, '/revoke'), { method: 'POST', headers: FORM, body: form({ token: refreshToken }), signal: AbortSignal.timeout(8000) }); } catch { /* best effort */ }
  }
  private headers(token: string) { return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }; }
  private toRemote(item: Json): RemoteEvent {
    const cancelled = item.status === 'cancelled';
    const allDay = Boolean(item.start?.date);
    const range = allDay ? fromAllDayDates(item.start.date, item.end?.date) : { startsAt: new Date(item.start?.dateTime ?? 0), endsAt: item.end?.dateTime ? new Date(item.end.dateTime) : null };
    return { id: String(item.id), etag: String(item.etag ?? item.updated ?? ''), title: String(item.summary ?? ''), description: item.description ?? null, location: item.location ?? null, isAllDay: allDay, startsAt: range.startsAt, endsAt: range.endsAt, updatedAt: new Date(item.updated ?? Date.now()), cancelled };
  }
  async list(token: string, window: Window) { return (await this.read(token, window, null)).events; }

  /** Reads the window in full, or (with a sync token) only what changed. An expired token is dropped and the window is read in full, so a stale token never blocks syncing. */
  async changes(token: string, window: Window, syncToken: string | null): Promise<Changes> {
    if (!syncToken) return this.read(token, window, null);
    const result = await this.read(token, window, syncToken);
    return result ?? this.read(token, window, null);
  }

  /** `syncToken` null: the windowed read. A token: the incremental read, or null when Google answers 410 (the token has expired). */
  private async read(token: string, window: Window, syncToken: string | null): Promise<Changes>;
  private async read(token: string, window: Window, syncToken: string): Promise<Changes | null>;
  private async read(token: string, window: Window, syncToken: string | null): Promise<Changes | null> {
    const out: RemoteEvent[] = []; let page: string | undefined; let next: string | null = null; let finished = false;
    for (let i = 0; i < 40; i += 1) {
      // With a sync token Google refuses timeMin and timeMax; the other options must match the read that produced the token.
      const common = { singleEvents: 'true', showDeleted: 'true', maxResults: '250', ...(page ? { pageToken: page } : {}) };
      const query = form(syncToken ? { ...common, syncToken } : { ...common, timeMin: window.from.toISOString(), timeMax: window.to.toISOString() });
      const { status, body } = await call(`${this.config.apiBase}/calendars/primary/events?${query}`, { headers: this.headers(token), allow: syncToken ? [410] : [] });
      if (status === 410) return null;
      for (const item of (body?.items ?? []) as Json[]) if (item.id && (item.status === 'cancelled' || item.start)) out.push(this.toRemote(item));
      page = body?.nextPageToken;
      if (!page) { next = typeof body?.nextSyncToken === 'string' ? body.nextSyncToken : null; finished = true; break; }
    }
    // Ran out of pages before the end: hand back what we have, but no token, so the next sync starts again from a full read.
    return { events: out, syncToken: finished ? next : null, incremental: syncToken !== null };
  }
  private payload(content: EventContent): Json {
    const times = content.isAllDay
      ? (() => { const d = toAllDayDates(content.startsAt, content.endsAt); return { start: { date: d.start }, end: { date: d.endExclusive } }; })()
      : { start: { dateTime: content.startsAt.toISOString(), timeZone: 'UTC' }, end: { dateTime: (content.endsAt ?? new Date(content.startsAt.getTime() + hour)).toISOString(), timeZone: 'UTC' } };
    return { summary: content.title, description: content.description ?? '', location: content.location ?? '', ...times };
  }
  idForKey(key: string) { return `avn${createHash('sha1').update(key).digest('hex')}`; }
  isSentCopy(id: string) { return /^avn[0-9a-f]{40}$/.test(id); }
  async create(token: string, content: EventContent, key?: string) {
    // Google lets the caller choose the event id (lowercase a-v and 0-9). Sending the same id twice is refused with 409, which tells us the first attempt did land.
    const id = key ? this.idForKey(key) : undefined;
    const { status, body } = await call(`${this.config.apiBase}/calendars/primary/events`, { method: 'POST', headers: this.headers(token), body: JSON.stringify({ ...(id ? { id } : {}), ...this.payload(content) }), allow: id ? [409] : [] });
    if (status !== 409) return { id: String(body?.id), etag: String(body?.etag ?? body?.updated ?? '') };
    const existing = (await call(`${this.config.apiBase}/calendars/primary/events/${encodeURIComponent(id!)}`, { headers: this.headers(token), allow: [404] })).body;
    if (existing && existing.status !== 'cancelled') return { id: String(existing.id), etag: String(existing.etag ?? existing.updated ?? '') };
    // The id was used once and that copy is gone (Google never lets a deleted id be reused): make a fresh copy with an id of Google's choosing.
    const fresh = await call(`${this.config.apiBase}/calendars/primary/events`, { method: 'POST', headers: this.headers(token), body: JSON.stringify(this.payload(content)) });
    return { id: String(fresh.body?.id), etag: String(fresh.body?.etag ?? fresh.body?.updated ?? '') };
  }
  async update(token: string, id: string, content: EventContent, etag: string | null) {
    const { body } = await call(`${this.config.apiBase}/calendars/primary/events/${encodeURIComponent(id)}`, { method: 'PUT', headers: { ...this.headers(token), ...(etag ? { 'If-Match': etag } : {}) }, body: JSON.stringify(this.payload(content)) });
    return { etag: String(body?.etag ?? body?.updated ?? '') };
  }
  async remove(token: string, id: string) {
    await call(`${this.config.apiBase}/calendars/primary/events/${encodeURIComponent(id)}`, { method: 'DELETE', headers: this.headers(token), allow: [404, 410] });
  }
}

// ---- Microsoft Outlook (Graph) ----------------------------------------------------------------------------

export class MicrosoftCalendar implements CalendarProvider {
  readonly key = 'MICROSOFT' as const; readonly label = 'Outlook Calendar';
  constructor(private readonly config: CalendarOAuth) {}
  private readonly scope = 'offline_access Calendars.ReadWrite User.Read';

  authUrl(state: string, redirectUri: string) {
    return `${this.config.authUrl}?${form({ client_id: this.config.clientId, response_type: 'code', redirect_uri: redirectUri, response_mode: 'query', scope: this.scope, prompt: 'select_account', state })}`;
  }
  private async tokens(values: Record<string, string>, previousRefresh?: string) {
    const { body } = await call(this.config.tokenUrl, { method: 'POST', headers: FORM, body: form({ client_id: this.config.clientId, client_secret: this.config.clientSecret, scope: this.scope, ...values }) });
    if (!body?.access_token || !(body.refresh_token ?? previousRefresh)) throw new ProviderError('Microsoft did not return the tokens AVEN needs.', 'fatal');
    return { accessToken: body.access_token as string, refreshToken: (body.refresh_token as string | undefined) ?? previousRefresh!, expiresAt: expires(body.expires_in) };
  }
  async exchange(code: string, redirectUri: string) {
    const tokens = await this.tokens({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
    const { body } = await call(`${this.config.apiBase}/me?$select=mail,userPrincipalName`, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    const email = String(body?.mail ?? body?.userPrincipalName ?? '').toLowerCase();
    if (!email) throw new ProviderError('Microsoft did not say which account this is.', 'fatal');
    return { ...tokens, email };
  }
  async refresh(refreshToken: string) { return this.tokens({ refresh_token: refreshToken, grant_type: 'refresh_token' }, refreshToken); }
  private headers(token: string) { return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'outlook.timezone="UTC"' }; }
  /** Graph gives UTC times without a trailing Z. */
  private utc(value: string) { return new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value.split('.')[0]}Z`); }
  private toRemote(item: Json): RemoteEvent {
    const allDay = item.isAllDay === true;
    const start = this.utc(item.start?.dateTime ?? '1970-01-01T00:00:00'); const end = item.end?.dateTime ? this.utc(item.end.dateTime) : null;
    const range = allDay ? fromAllDayDates(start.toISOString().slice(0, 10), end ? end.toISOString().slice(0, 10) : undefined) : { startsAt: start, endsAt: end };
    return { id: String(item.id), etag: String(item['@odata.etag'] ?? item.lastModifiedDateTime ?? ''), title: String(item.subject ?? ''), description: item.bodyPreview ?? null, location: item.location?.displayName ?? null, isAllDay: allDay, startsAt: range.startsAt, endsAt: range.endsAt, updatedAt: new Date(item.lastModifiedDateTime ?? Date.now()), cancelled: item.isCancelled === true };
  }
  /** The next page the provider names, only if it is on the provider's own address: the access token is sent with it, so a link elsewhere must not be followed. */
  private sameOrigin(link: unknown): string | null {
    if (typeof link !== 'string') return null;
    try { return new URL(link).origin === new URL(this.config.apiBase).origin ? link : null; } catch { return null; }
  }
  async list(token: string, window: Window) {
    const out: RemoteEvent[] = [];
    let url: string | null = `${this.config.apiBase}/me/calendarView?${form({ startDateTime: window.from.toISOString(), endDateTime: window.to.toISOString(), $top: '100', $select: 'id,subject,bodyPreview,location,start,end,isAllDay,isCancelled,lastModifiedDateTime' })}`;
    for (let i = 0; i < 40 && url; i += 1) {
      const { body } = await call(url, { headers: this.headers(token) });
      for (const item of (body?.value ?? []) as Json[]) if (item.id) out.push(this.toRemote(item));
      url = this.sameOrigin(body?.['@odata.nextLink']);
    }
    return out;
  }
  private payload(content: EventContent): Json {
    const times = content.isAllDay
      ? (() => { const d = toAllDayDates(content.startsAt, content.endsAt); return { isAllDay: true, start: { dateTime: `${d.start}T00:00:00`, timeZone: 'UTC' }, end: { dateTime: `${d.endExclusive}T00:00:00`, timeZone: 'UTC' } }; })()
      : { isAllDay: false, start: { dateTime: content.startsAt.toISOString().replace('Z', ''), timeZone: 'UTC' }, end: { dateTime: (content.endsAt ?? new Date(content.startsAt.getTime() + hour)).toISOString().replace('Z', ''), timeZone: 'UTC' } };
    return { subject: content.title, body: { contentType: 'text', content: content.description ?? '' }, location: { displayName: content.location ?? '' }, ...times };
  }
  async create(token: string, content: EventContent) {
    const { body } = await call(`${this.config.apiBase}/me/events`, { method: 'POST', headers: this.headers(token), body: JSON.stringify(this.payload(content)) });
    return { id: String(body?.id), etag: String(body?.['@odata.etag'] ?? body?.lastModifiedDateTime ?? '') };
  }
  async update(token: string, id: string, content: EventContent, etag: string | null) {
    const { body } = await call(`${this.config.apiBase}/me/events/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { ...this.headers(token), ...(etag ? { 'If-Match': etag } : {}) }, body: JSON.stringify(this.payload(content)) });
    return { etag: String(body?.['@odata.etag'] ?? body?.lastModifiedDateTime ?? '') };
  }
  async remove(token: string, id: string) { await call(`${this.config.apiBase}/me/events/${encodeURIComponent(id)}`, { method: 'DELETE', headers: this.headers(token), allow: [404, 410] }); }
}
