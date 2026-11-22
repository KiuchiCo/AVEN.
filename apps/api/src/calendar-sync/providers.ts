import { reportIntegrationFailure } from '../observability/error-reporter.js';
import type { CalendarOAuth } from '../config/api-environment.js';
import { fromAllDayDates, toAllDayDates, type EventContent, type RemoteEvent } from './remote-events.js';

/** `auth`: the provider no longer accepts our tokens. `conflict`: the copy changed since we read it. `retry`: try again later. `fatal`: won't work on retry. */
export class ProviderError extends Error {
  constructor(message: string, readonly kind: 'auth' | 'conflict' | 'retry' | 'fatal') { super(message); }
}
export type Tokens = { accessToken: string; refreshToken: string; expiresAt: Date };
export type Window = { from: Date; to: Date };

export interface CalendarProvider {
  readonly key: 'GOOGLE' | 'MICROSOFT';
  readonly label: string;
  authUrl(state: string, redirectUri: string): string;
  exchange(code: string, redirectUri: string): Promise<Tokens & { email: string }>;
  refresh(refreshToken: string): Promise<Tokens>;
  list(accessToken: string, window: Window): Promise<RemoteEvent[]>;
  create(accessToken: string, content: EventContent): Promise<{ id: string; etag: string }>;
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
  if (response.status === 403 && /insufficient|forbidden|scope/i.test(detail)) throw new ProviderError(detail || 'AVEN was not given permission to use this calendar.', 'auth');
  if (response.status === 412 || response.status === 409) throw new ProviderError('This event changed on the calendar.', 'conflict');
  if (response.status === 429 || response.status >= 500) throw new ProviderError(detail || 'The calendar service is busy.', 'retry');
  throw new ProviderError(detail || `The calendar service refused the request (${response.status}).`, 'fatal');
}
const form = (values: Record<string, string>) => new URLSearchParams(values).toString();
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };
const hour = 3_600_000;

// ---- Google Calendar --------------------------------------------------------------------------------------

export class GoogleCalendar implements CalendarProvider {
  readonly key = 'GOOGLE' as const; readonly label = 'Google Calendar';
  constructor(private readonly config: CalendarOAuth) {}

  authUrl(state: string, redirectUri: string) {
    const query = form({ client_id: this.config.clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email https://www.googleapis.com/auth/calendar.events', access_type: 'offline', prompt: 'consent', state });
    return `${this.config.authUrl}?${query}`;
  }
  async exchange(code: string, redirectUri: string) {
    const { body } = await call(this.config.tokenUrl, { method: 'POST', headers: FORM, body: form({ code, client_id: this.config.clientId, client_secret: this.config.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
    if (!body?.access_token || !body.refresh_token) throw new ProviderError('Google did not return a refresh token, so AVEN could not stay connected.', 'fatal');
    const email = this.emailFrom(body.id_token);
    if (!email) throw new ProviderError('Google did not say which account this is.', 'fatal');
    return { accessToken: body.access_token as string, refreshToken: body.refresh_token as string, expiresAt: expires(body.expires_in), email };
  }
  private emailFrom(idToken: unknown): string | null {
    try { return String(JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8')).email ?? '').toLowerCase() || null; } catch { return null; }
  }
  async refresh(refreshToken: string) {
    const { body } = await call(this.config.tokenUrl, { method: 'POST', headers: FORM, body: form({ refresh_token: refreshToken, client_id: this.config.clientId, client_secret: this.config.clientSecret, grant_type: 'refresh_token' }) });
    if (!body?.access_token) throw new ProviderError('Google did not return a new access token.', 'auth');
    return { accessToken: body.access_token as string, refreshToken: (body.refresh_token as string | undefined) ?? refreshToken, expiresAt: expires(body.expires_in) };
  }
  private headers(token: string) { return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }; }
  private toRemote(item: Json): RemoteEvent {
    const cancelled = item.status === 'cancelled';
    const allDay = Boolean(item.start?.date);
    const range = allDay ? fromAllDayDates(item.start.date, item.end?.date) : { startsAt: new Date(item.start?.dateTime ?? 0), endsAt: item.end?.dateTime ? new Date(item.end.dateTime) : null };
    return { id: String(item.id), etag: String(item.etag ?? item.updated ?? ''), title: String(item.summary ?? ''), description: item.description ?? null, location: item.location ?? null, isAllDay: allDay, startsAt: range.startsAt, endsAt: range.endsAt, updatedAt: new Date(item.updated ?? Date.now()), cancelled };
  }
  async list(token: string, window: Window) {
    const out: RemoteEvent[] = []; let page: string | undefined;
    for (let i = 0; i < 40; i += 1) {
      const query = form({ singleEvents: 'true', showDeleted: 'true', timeMin: window.from.toISOString(), timeMax: window.to.toISOString(), maxResults: '250', ...(page ? { pageToken: page } : {}) });
      const { body } = await call(`${this.config.apiBase}/calendars/primary/events?${query}`, { headers: this.headers(token) });
      for (const item of (body?.items ?? []) as Json[]) if (item.id && (item.status === 'cancelled' || item.start)) out.push(this.toRemote(item));
      page = body?.nextPageToken; if (!page) break;
    }
    return out;
  }
  private payload(content: EventContent): Json {
    const times = content.isAllDay
      ? (() => { const d = toAllDayDates(content.startsAt, content.endsAt); return { start: { date: d.start }, end: { date: d.endExclusive } }; })()
      : { start: { dateTime: content.startsAt.toISOString(), timeZone: 'UTC' }, end: { dateTime: (content.endsAt ?? new Date(content.startsAt.getTime() + hour)).toISOString(), timeZone: 'UTC' } };
    return { summary: content.title, description: content.description ?? '', location: content.location ?? '', ...times };
  }
  async create(token: string, content: EventContent) {
    const { body } = await call(`${this.config.apiBase}/calendars/primary/events`, { method: 'POST', headers: this.headers(token), body: JSON.stringify(this.payload(content)) });
    return { id: String(body?.id), etag: String(body?.etag ?? body?.updated ?? '') };
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
