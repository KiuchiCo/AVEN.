'use client';

import { useT } from '../i18n';
import type { Key } from '../i18n/en';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useWorkspaceSession } from './workspace-shell';
import { TaskLabels } from './task-labels';
import { documentTemplates, encodeTemplate } from './documents/templates';

type Project = { id: string; name: string };
type Task = { id: string; title: string; status: string; labels: string[]; dueAt: string | null };
type DocumentRecord = { id: string; title: string; content: string; updatedAt: string; project: Project | null };
type CalendarEventType = 'MEETING' | 'FOCUS' | 'PERSONAL' | 'REMINDER' | 'OTHER';
type CalendarEvent = { updatedAt: string; id: string; title: string; description: string | null; location: string | null; type: CalendarEventType; isAllDay: boolean; startsAt: string; endsAt: string | null; recurrence: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null; recurrenceInterval: number; recurrenceUntil: string | null; recurrenceTimeZone: string | null; task: Pick<Task, 'id' | 'title'> | null; project: Project | null };
type CalendarItem = { id: string; eventId?: string; taskId?: string; title: string; startsAt: string; endsAt: string | null; kind: 'Event' | 'Deadline'; taskTitle: string | null; labels?: string[]; projectTitle?: string | null; recurrence?: string | null; eventType?: CalendarEventType; isAllDay?: boolean; location?: string | null; description?: string | null };

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

function documentPreview(content: string) {
  try {
    const value = JSON.parse(content) as { format?: string; blocks?: { text?: string }[] };
    if (value.format === 'aven-doc-v1' && Array.isArray(value.blocks)) return value.blocks.map((block) => block.text).filter(Boolean).join(' · ');
  } catch { /* Older notes use plain text. */ }
  return content;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localDateTimeValue(date: Date) {
  return `${localDateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute, second: values.second };
}

function dateInTimeZone(parts: ZonedParts, timeZone: string) {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let timestamp = desired;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const actual = zonedParts(new Date(timestamp), timeZone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const correction = desired - represented;
    if (correction === 0) break;
    timestamp += correction;
  }
  return new Date(timestamp);
}

function localDateTimeValueInZone(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function dateKeyInZone(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function dateTimeFromInput(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return new Date(value);
  return dateInTimeZone({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]), second: 0 }, timeZone);
}

function advanceZonedParts(parts: ZonedParts, frequency: string, interval: number, anchorDay: number): ZonedParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (frequency === 'DAILY') date.setUTCDate(date.getUTCDate() + interval);
  else if (frequency === 'WEEKLY') date.setUTCDate(date.getUTCDate() + interval * 7);
  else {
    date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + interval);
    date.setUTCDate(Math.min(anchorDay, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
  }
  return { ...parts, year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function expandCalendarEvent(event: CalendarEvent, rangeStart: Date, rangeEnd: Date): CalendarItem[] {
  const first = new Date(event.startsAt);
  const duration = event.endsAt ? new Date(event.endsAt).getTime() - first.getTime() : null;
  const makeItem = (start: Date, id: string): CalendarItem => ({ id, eventId: event.id, title: event.title, startsAt: start.toISOString(), endsAt: duration === null ? null : new Date(start.getTime() + duration).toISOString(), kind: 'Event', taskTitle: event.task?.title ?? null, recurrence: event.recurrence });
  if (!event.recurrence) return first >= rangeStart && first < rangeEnd ? [makeItem(first, event.id)] : [];
  const until = event.recurrenceUntil ? new Date(event.recurrenceUntil) : first;
  const timeZone = event.recurrenceTimeZone ?? 'UTC';
  let parts = zonedParts(first, timeZone);
  let cursor = first;
  const anchorDay = parts.day;
  const occurrences: CalendarItem[] = [];
  let attempts = 0;
  while (cursor <= until && cursor < rangeEnd && attempts < 800) {
    if (cursor >= rangeStart) occurrences.push(makeItem(cursor, `${event.id}-${localDateKey(cursor)}`));
    const nextParts = advanceZonedParts(parts, event.recurrence, event.recurrenceInterval, anchorDay);
    const next = dateInTimeZone(nextParts, timeZone);
    if (next <= cursor) break;
    cursor = next; parts = nextParts; attempts += 1;
  }
  return occurrences;
}

export function DocumentsWorkspace() {
  const t = useT();
  const router = useRouter();
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [templateHint, setTemplateHint] = useState('');

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API. Check your local API setup.');
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(body?.message ?? 'AVEN could not complete that request.');
    }
    return response.json();
  }, [getToken]);

  const reload = useCallback(async () => {
    const [projectRows, documentRows] = await Promise.all([
      request(`/workspaces/${workspace.id}/projects`),
      request(`/workspaces/${workspace.id}/documents`),
    ]) as [Project[], DocumentRecord[]];
    setProjects(projectRows);
    setDocuments(documentRows);
  }, [request, workspace.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try { await reload(); }
      catch (reason) { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load documents.'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [reload]);

  async function createDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const template = documentTemplates.find((item) => item.id === form.get('template'));
    setBusy(true); setError('');
    try {
      const created = await request(`/workspaces/${workspace.id}/documents`, {
        method: 'POST',
        body: JSON.stringify({ title: form.get('title') || template?.title, content: template ? encodeTemplate(template, String(form.get('content') ?? '')) : form.get('content'), projectId: form.get('projectId') || undefined }),
      }) as DocumentRecord;
      formElement.reset();
      router.push(`/workspace/documents/${created.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the document.'); }
    finally { setBusy(false); }
  }

  async function deleteDocument(document: DocumentRecord) {
    if (!window.confirm(t('doc.confirm', { title: document.title }))) return;
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/documents/${document.id}`, { method: 'DELETE' });
      setDocuments((current) => current.filter((item) => item.id !== document.id));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete the document.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="workspace-section-page connected-page">
      <p className="workspace-eyebrow">{t('act.eyebrow', { name: workspace.name })}</p>
      <h1>{t('nav.documents')}</h1>
      <p className="workspace-section-page__description">{t('doc.desc')}</p>
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <div className="connected-layout">
        <form className="productivity-form connected-compose" onSubmit={createDocument}>
          <h2>{t('doc.newTitle')}</h2>
          <label>{t('doc.startFrom')}<select name="template" defaultValue="" onChange={(event) => { const choice = documentTemplates.find((item) => item.id === event.target.value); if (choice) setTemplateHint(choice.description); else setTemplateHint(''); }}><option value="">{t('doc.blank')}</option>{documentTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select>{templateHint && <small>{templateHint}</small>}</label>
          <label>{t('doc.title')}<input name="title" maxLength={200} placeholder={t('doc.titlePh')} required={!templateHint} /></label>
          <label>{t('doc.project')} <span>{t('doc.optional')}</span><select name="projectId" defaultValue=""><option value="">{t('doc.noProject')}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label>{t('doc.content')}<textarea name="content" maxLength={20000} rows={8} placeholder={t('doc.contentPh')} /></label>
          <button type="submit" disabled={busy}>{busy ? t('set.saving') : t('doc.save')}</button>
        </form>
        <section className="connected-record-list" aria-labelledby="document-list-title">
          <div className="workspace-section-heading"><div><p className="workspace-eyebrow">{t('doc.saved')}</p><h2 id="document-list-title">{t('doc.yours')}</h2></div><span>{documents.length}</span></div>
          {loading ? <p className="productivity-message">{t('doc.loading')}</p> : documents.length === 0 ? <p className="productivity-message">{t('doc.empty')}</p> : (
            <div className="connected-record-stack">{documents.map((document) => (
              <article className="connected-record" key={document.id}>
                <div className="connected-record__meta"><span>{t('doc.kind')}</span>{document.project && <span className="connected-link-pill">{document.project.name}</span>}<Link className="connected-record__edit" href={`/workspace/documents/${document.id}`}>{t('doc.open')}</Link><button className="connected-record__edit" type="button" disabled={busy} onClick={() => void deleteDocument(document)}>{t('wb.delete')}</button></div>
                <h3>{document.title}</h3><p>{documentPreview(document.content) || t('doc.emptyDoc')}</p>
                <small>{t('doc.updated', { date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(document.updatedAt)) })}</small>
              </article>
            ))}</div>
          )}
        </section>
      </div>
    </div>
  );
}

export function CalendarWorkspace() {
  const t = useT();
  const typeLabel = (type: string) => { const key = ({ MEETING: 'cal.t.meeting', FOCUS: 'cal.t.focus', PERSONAL: 'cal.t.personal', REMINDER: 'cal.t.reminder', OTHER: 'cal.t.other' } as Record<string, Key>)[type]; return key ? t(key) : type; };
  const kindLabel = (item: { kind: string; recurrence?: string | null; eventType?: string }) => item.recurrence ? t('cal.repeating') : item.kind === 'Deadline' ? t('cal.k.deadline') : item.eventType ? typeLabel(item.eventType) : t('cal.k.event');
  const timeText = (item: { kind: string; isAllDay?: boolean; startsAt: string }) => item.kind === 'Deadline' || item.isAllDay ? t('cal.allDay') : new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(item.startsAt));
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(new Date()));
  const [calendarView, setCalendarView] = useState<'DAY' | 'WEEK' | 'MONTH' | 'AGENDA'>('MONTH');
  const [showEvents, setShowEvents] = useState(true);
  const [showDeadlines, setShowDeadlines] = useState(true);
  const [eventTypeFilter, setEventTypeFilter] = useState<'ALL' | CalendarEventType>('ALL');
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [endValue, setEndValue] = useState('');
  const [repeatFrequency, setRepeatFrequency] = useState('');
  const [repeatUntilValue, setRepeatUntilValue] = useState('');
  const [startValue, setStartValue] = useState(() => {
    const nextHour = new Date(); nextHour.setMinutes(0, 0, 0); nextHour.setHours(nextHour.getHours() + 1);
    return localDateTimeValue(nextHour);
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [importSummary, setImportSummary] = useState<{ created: number; updated: number; unchanged: number; skipped: { title: string; reason: string }[]; notes: string[] } | null>(null);

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API. Check your local API setup.');
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      throw Object.assign(new Error(body?.message ?? 'AVEN could not complete that request.'), { status: response.status });
    }
    return response.json();
  }, [getToken]);

  const reload = useCallback(async () => {
    const [taskRows, eventRows, projectRows] = await Promise.all([
      request(`/workspaces/${workspace.id}/tasks`),
      request(`/workspaces/${workspace.id}/events`),
      request(`/workspaces/${workspace.id}/projects`),
    ]) as [Task[], CalendarEvent[], Project[]];
    setTasks(taskRows.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED'));
    setEvents(eventRows);
    setProjects(projectRows);
  }, [request, workspace.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try { await reload(); }
      catch (reason) { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load calendar events.'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [reload]);

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError('');
    const submittedStart = String(form.get('startsAt') ?? '');
    const endValue = String(form.get('endsAt') ?? '');
    const repeatUntil = String(form.get('recurrenceUntil') ?? '');
    const recurrence = String(form.get('recurrence') ?? '');
    const seriesTimeZone = editingEvent?.recurrenceTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      await request(`/workspaces/${workspace.id}/events${editingEvent ? `/${editingEvent.id}` : ''}`, {
        method: editingEvent ? 'PATCH' : 'POST',
        body: JSON.stringify({
          baseUpdatedAt: editingEvent?.updatedAt,
          title: form.get('title'),
          startsAt: submittedStart ? dateTimeFromInput(submittedStart, seriesTimeZone).toISOString() : '',
          endsAt: endValue ? dateTimeFromInput(endValue, seriesTimeZone).toISOString() : undefined,
          taskId: form.get('taskId') || undefined,
          projectId: form.get('projectId') || undefined,
          description: form.get('description') || null,
          location: form.get('location') || null,
          type: form.get('type'),
          isAllDay: form.get('isAllDay') === 'on',
          recurrence: recurrence || null,
          recurrenceInterval: Number(form.get('recurrenceInterval') ?? 1),
          recurrenceUntil: recurrence && repeatUntil ? new Date(dateTimeFromInput(`${repeatUntil}T23:59`, seriesTimeZone).getTime() + 59_999).toISOString() : null,
          recurrenceTimeZone: recurrence ? seriesTimeZone : null,
        }),
      });
      formElement.reset();
      setEditingEvent(null); setEndValue(''); setRepeatFrequency(''); setRepeatUntilValue('');
      setStartValue(`${selectedDate}T09:00`);
      await reload();
    } catch (reason) {
      if ((reason as { status?: number }).status === 409) { setEditingEvent(null); setError('Someone else changed this event while you were editing. The latest version has been loaded — open it again to make your change.'); await reload(); }
      else setError(reason instanceof Error ? reason.message : 'Could not schedule the event.');
    }
    finally { setBusy(false); }
  }

  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7));
  const monthDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart); date.setDate(gridStart.getDate() + index); return date;
  });
  const selectedLocalDate = new Date(`${selectedDate}T12:00:00`);
  const weekStart = new Date(selectedLocalDate); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const rangeStart = calendarView === 'MONTH' ? gridStart : calendarView === 'WEEK' ? weekStart : calendarView === 'AGENDA' ? new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) : new Date(selectedLocalDate.getFullYear(), selectedLocalDate.getMonth(), selectedLocalDate.getDate());
  const rangeEnd = calendarView === 'MONTH' ? new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 42) : calendarView === 'WEEK' ? new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7) : calendarView === 'DAY' ? new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() + 1) : new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() + 90);
  const calendarItems: CalendarItem[] = [
    ...events.flatMap((event) => expandCalendarEvent(event, rangeStart, rangeEnd).map((item) => ({ ...item, eventType: event.type, isAllDay: event.isAllDay, location: event.location, description: event.description, projectTitle: event.project?.name ?? null }))),
    ...tasks.filter((task) => task.dueAt && new Date(task.dueAt) >= rangeStart && new Date(task.dueAt) < rangeEnd).map((task) => ({ id: `task-${task.id}`, taskId: task.id, title: task.title, startsAt: task.dueAt as string, endsAt: null, kind: 'Deadline' as const, taskTitle: null, labels: task.labels })),
  ].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const visibleCalendarItems = calendarItems.filter((item) => item.kind === 'Event' ? showEvents && (eventTypeFilter === 'ALL' || item.eventType === eventTypeFilter) : showDeadlines);
  const weekDays = Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setDate(weekStart.getDate() + index); return date; });
  const dayHours = Array.from({ length: 24 }, (_, index) => index);
  const itemsByDate = new Map<string, CalendarItem[]>();
  for (const item of visibleCalendarItems) {
    const key = localDateKey(new Date(item.startsAt));
    itemsByDate.set(key, [...(itemsByDate.get(key) ?? []), item]);
  }
  const selectedItems = itemsByDate.get(selectedDate) ?? [];
  const selectedLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date(`${selectedDate}T12:00:00`));

  function moveMonth(offset: number) {
    const step = calendarView === 'DAY' ? 1 : calendarView === 'WEEK' ? 7 : 1;
    const nextDate = new Date(selectedLocalDate);
    if (calendarView === 'MONTH') nextDate.setMonth(nextDate.getMonth() + offset);
    else nextDate.setDate(nextDate.getDate() + offset * step);
    const nextMonth = new Date(nextDate.getFullYear(), nextDate.getMonth(), 1);
    setMonth(nextMonth); setSelectedDate(localDateKey(nextDate));
  }

  function chooseDate(date: Date) {
    const key = localDateKey(date);
    setSelectedDate(key);
    const dateTime = new Date(`${key}T09:00`);
    setStartValue(localDateTimeValue(dateTime));
  }

  function editEvent(event: CalendarEvent) {
    setEditingEvent(event);
    const timeZone = event.recurrenceTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    setStartValue(event.recurrence ? localDateTimeValueInZone(new Date(event.startsAt), timeZone) : localDateTimeValue(new Date(event.startsAt)));
    setEndValue(event.endsAt ? event.recurrence ? localDateTimeValueInZone(new Date(event.endsAt), timeZone) : localDateTimeValue(new Date(event.endsAt)) : '');
    setRepeatFrequency(event.recurrence ?? '');
    setRepeatUntilValue(event.recurrenceUntil ? event.recurrence ? dateKeyInZone(new Date(event.recurrenceUntil), timeZone) : localDateKey(new Date(event.recurrenceUntil)) : '');
    setSelectedDate(localDateKey(new Date(event.startsAt)));
    setMonth(new Date(new Date(event.startsAt).getFullYear(), new Date(event.startsAt).getMonth(), 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function removeEvent(event: CalendarEvent) {
    if (!window.confirm(event.recurrence ? t('cal.delSeries', { title: event.title }) : t('cal.delOne', { title: event.title }))) return;
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/events/${event.id}`, { method: 'DELETE' });
      if (editingEvent?.id === event.id) setEditingEvent(null);
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete the event.'); }
    finally { setBusy(false); }
  }

  async function importCalendar(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(''); setImportSummary(null);
    try {
      if (file.size > 1_000_000) throw new Error(t('cal.fileBig'));
      setImportSummary(await request(`/workspaces/${workspace.id}/events/import`, { method: 'POST', body: JSON.stringify({ ics: await file.text() }) }));
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import this calendar file.'); }
    finally { setBusy(false); }
  }

  function exportCalendar() {
    const escapeIcs = (value: string) => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AVEN//Calendar//EN', 'CALSCALE:GREGORIAN', ...visibleCalendarItems.map((item) => {
      const event = item.kind === 'Event' ? events.find((row) => row.id === item.eventId) : null;
      const localStart = localDateKey(new Date(item.startsAt));
      const localEnd = new Date(`${localStart}T12:00:00`); localEnd.setDate(localEnd.getDate() + 1);
      return ['BEGIN:VEVENT', `UID:${item.id}@aven.local`, item.isAllDay ? `DTSTART;VALUE=DATE:${localStart.replace(/-/g, '')}` : `DTSTART:${stamp(item.startsAt)}`, item.isAllDay ? `DTEND;VALUE=DATE:${localDateKey(localEnd).replace(/-/g, '')}` : item.endsAt ? `DTEND:${stamp(item.endsAt)}` : '', `SUMMARY:${escapeIcs(item.title)}`, item.description ? `DESCRIPTION:${escapeIcs(item.description)}` : '', item.location ? `LOCATION:${escapeIcs(item.location)}` : '', `CATEGORIES:${item.kind === 'Deadline' ? 'DEADLINE' : item.eventType}`, event?.project ? `RELATED-TO:${event.project.id}@aven.local` : '', 'END:VEVENT'].filter(Boolean).join('\r\n');
    }), 'END:VCALENDAR'];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'aven-calendar.ics'; anchor.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="workspace-section-page connected-page">
      <p className="workspace-eyebrow">{t('act.eyebrow', { name: workspace.name })}</p>
      <h1>{t('nav.calendar')}</h1>
      <p className="workspace-section-page__description">{t('cal.desc')}</p>
      {error && <p className="productivity-error" role="alert">{error}</p>}
      {importSummary && <div className="calendar-import-summary" role="status">
        <strong>{t('cal.importDone')}</strong> {t('cal.importCounts', { created: importSummary.created, updated: importSummary.updated, unchanged: importSummary.unchanged })}{importSummary.skipped.length ? t('cal.importSkipped', { n: importSummary.skipped.length }) : ''}.
        {importSummary.notes.map((note) => <p key={note}>{note}</p>)}
        {importSummary.skipped.length > 0 && <details><summary>{t('cal.whySkipped', { n: importSummary.skipped.length })}</summary><ul>{importSummary.skipped.map((item, index) => <li key={`${item.title}-${index}`}><strong>{item.title}</strong> — {item.reason}</li>)}</ul></details>}
        <p>{t('cal.importAgain')}</p>
        <button type="button" onClick={() => setImportSummary(null)}>{t('cal.dismiss')}</button>
      </div>}
      <div className="connected-layout">
        <form className="productivity-form connected-compose" key={editingEvent?.id ?? 'new-event'} onSubmit={createEvent}>
          <h2>{editingEvent ? t('cal.editEvent') : t('cal.schedule')}</h2>
          <label>{t('cal.title')}<input name="title" defaultValue={editingEvent?.title ?? ''} required maxLength={200} placeholder={t('cal.titlePh')} /></label>
          <div className="productivity-form__row"><label>{t('cal.type')}<select name="type" defaultValue={editingEvent?.type ?? 'MEETING'}>{['MEETING','FOCUS','PERSONAL','REMINDER','OTHER'].map((value) => <option key={value} value={value}>{typeLabel(value)}</option>)}</select></label><label>{t('cal.location')} <span>{t('doc.optional')}</span><input name="location" defaultValue={editingEvent?.location ?? ''} maxLength={250} placeholder={t('cal.locationPh')} /></label></div>
          <label>{t('cal.notes')} <span>{t('doc.optional')}</span><textarea name="description" defaultValue={editingEvent?.description ?? ''} maxLength={2000} rows={2} placeholder={t('cal.notesPh')} /></label>
          <label>{t('cal.linkedProject')} <span>{t('doc.optional')}</span><select name="projectId" defaultValue={editingEvent?.project?.id ?? ''}><option value="">{t('doc.noProject')}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label>{t('cal.linkedTask')} <span>{t('doc.optional')}</span><select name="taskId" defaultValue={editingEvent?.task?.id ?? ''}><option value="">{t('cal.noTask')}</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
          <label className="calendar-all-day"><input name="isAllDay" type="checkbox" defaultChecked={editingEvent?.isAllDay ?? false} /> {t('cal.allDayEvent')}</label>
          <div className="productivity-form__row">
            <label>{t('cal.starts')}<input name="startsAt" type="datetime-local" value={startValue} onChange={(event) => setStartValue(event.target.value)} required /></label>
            <label>{t('cal.ends')} <span>{t('doc.optional')}</span><input name="endsAt" type="datetime-local" value={endValue} onChange={(event) => setEndValue(event.target.value)} /></label>
          </div>
          <label>{t('cal.repeats')}<select name="recurrence" value={repeatFrequency} onChange={(event) => { setRepeatFrequency(event.target.value); if (!event.target.value) setRepeatUntilValue(''); }}><option value="">{t('cal.noRepeat')}</option><option value="DAILY">{t('cal.r.daily')}</option><option value="WEEKLY">{t('cal.r.weekly')}</option><option value="MONTHLY">{t('cal.r.monthly')}</option></select></label>
          {repeatFrequency && <div className="calendar-repeat-fields"><label>{t('cal.interval')}<select name="recurrenceInterval" defaultValue={editingEvent?.recurrenceInterval ?? 1}>{[1, 2, 3, 4, 6, 12].map((interval) => <option key={interval} value={interval}>{t((repeatFrequency === 'DAILY' ? (interval === 1 ? 'cal.everyDay' : 'cal.everyDays') : repeatFrequency === 'WEEKLY' ? (interval === 1 ? 'cal.everyWeek' : 'cal.everyWeeks') : (interval === 1 ? 'cal.everyMonth' : 'cal.everyMonths')) as Key, { n: interval })}</option>)}</select></label><label>{t('cal.until')}<input name="recurrenceUntil" type="date" value={repeatUntilValue} onChange={(event) => setRepeatUntilValue(event.target.value)} required /></label></div>}
          <button type="submit" disabled={busy}>{busy ? t('set.saving') : editingEvent ? editingEvent.recurrence ? t('cal.saveSeries') : t('cal.saveEvent') : t('cal.add')}</button>
          {editingEvent && <button type="button" className="calendar-cancel-edit" onClick={() => { setEditingEvent(null); setEndValue(''); setRepeatFrequency(''); setRepeatUntilValue(''); }}>{t('cal.cancelEdit')}</button>}
          <p className="calendar-form-hint">{t('cal.hint')}{editingEvent?.recurrence ? t('cal.hintSeries') : ''}</p>
        </form>
        <section className="connected-record-list" aria-labelledby="calendar-list-title">
          <div className="aven-calendar">
            <div className="aven-calendar__toolbar"><div><p className="workspace-eyebrow">{t('cal.schedEyebrow')}</p><h2 id="calendar-list-title">{calendarView === 'AGENDA' ? t('cal.coming') : calendarView === 'MONTH' ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month) : calendarView === 'WEEK' ? `${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(weekStart)} – ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6))}` : new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(selectedLocalDate)}</h2></div><div className="aven-calendar__controls"><button type="button" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(localDateKey(today)); }}>{t('cal.today')}</button><button type="button" aria-label={t('cal.prev')} onClick={() => moveMonth(-1)}>‹</button><button type="button" aria-label={t('cal.next')} onClick={() => moveMonth(1)}>›</button><button type="button" onClick={exportCalendar}>{t('cal.export')}</button><label className="calendar-import">{t('cal.import')}<input type="file" accept=".ics,text/calendar" disabled={busy} onChange={(event) => { void importCalendar(event.target.files?.[0]); event.target.value = ''; }} /></label></div></div>
            <div className="aven-calendar__view-switch">{(['DAY','WEEK','MONTH','AGENDA'] as const).map((view) => <button key={view} type="button" aria-pressed={calendarView === view} className={calendarView === view ? 'is-active' : ''} onClick={() => setCalendarView(view)}>{t(`cal.v.${view.toLowerCase()}` as Key)}</button>)}</div>
            <div className="calendar-filters"><button type="button" aria-pressed={showEvents} className={showEvents ? 'is-active' : ''} onClick={() => setShowEvents((value) => !value)}><i className="calendar-filter-dot calendar-filter-dot--event" /> {t('cal.scheduledEvents')}</button><button type="button" aria-pressed={showDeadlines} className={showDeadlines ? 'is-active' : ''} onClick={() => setShowDeadlines((value) => !value)}><i className="calendar-filter-dot calendar-filter-dot--deadline" /> {t('cal.taskDeadlines')}</button></div>
            <div className="calendar-type-filters" role="group" aria-label={t('cal.typeFilterAria')}>{(['ALL','MEETING','FOCUS','PERSONAL','REMINDER','OTHER'] as const).map((type) => <button key={type} type="button" aria-pressed={eventTypeFilter === type} className={eventTypeFilter === type ? 'is-active' : ''} onClick={() => setEventTypeFilter(type)}>{type === 'ALL' ? t('cal.allTypes') : typeLabel(type)}</button>)}</div>
            {loading ? <p className="productivity-message">{t('cal.loading')}</p> : calendarView === 'MONTH' ? <>
              <div className="aven-calendar__weekdays">{(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((day) => <span key={day}>{t(`cal.wd.${day}` as Key)}</span>)}</div>
              <div className="aven-calendar__grid">{monthDays.map((date) => {
                const key = localDateKey(date); const dayItems = itemsByDate.get(key) ?? []; const isToday = key === localDateKey(new Date());
                return <button key={key} type="button" aria-pressed={selectedDate === key} className={`aven-calendar__day${date.getMonth() !== month.getMonth() ? ' is-outside' : ''}${selectedDate === key ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`} onClick={() => chooseDate(date)}>
                  <time dateTime={key}>{date.getDate()}</time><span className="aven-calendar__day-items">{dayItems.slice(0, 2).map((item) => <small className={`aven-calendar__item aven-calendar__item--${item.kind.toLowerCase()}`} key={`${item.kind}-${item.id}`}>{item.title}</small>)}{dayItems.length > 2 && <small className="aven-calendar__more">{t('cal.more', { n: dayItems.length - 2 })}</small>}</span>
                </button>;
              })}</div>
            </> : calendarView === 'WEEK' ? <div className="aven-calendar__week-grid">{weekDays.map((date) => { const key = localDateKey(date); const dayItems = itemsByDate.get(key) ?? []; return <section key={key} className={key === localDateKey(new Date()) ? 'is-today' : ''}><button type="button" className="aven-calendar__week-date" onClick={() => chooseDate(date)}><small>{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date)}</small><strong>{date.getDate()}</strong></button>{dayItems.length ? dayItems.map((item) => <button type="button" key={`${item.kind}-${item.id}`} className={`aven-calendar__week-event aven-calendar__week-event--${(item.eventType ?? item.kind).toLocaleLowerCase()}`} onClick={() => item.kind === 'Event' && editEvent(events.find((event) => event.id === item.eventId)!)}><small>{timeText(item)}</small><strong>{item.title}</strong></button>) : <button type="button" className="aven-calendar__week-empty" onClick={() => chooseDate(date)}>＋</button>}</section>; })}</div> : calendarView === 'DAY' ? <div className="aven-calendar__day-timeline">{dayHours.map((hour) => { const hourItems = selectedItems.filter((item) => !item.isAllDay && item.kind === 'Event' && new Date(item.startsAt).getHours() === hour); const allDayItems = hour === 0 ? selectedItems.filter((item) => item.isAllDay || item.kind === 'Deadline') : []; return <div className="aven-calendar__hour" key={hour}><time>{String(hour).padStart(2, '0')}:00</time><div>{[...allDayItems, ...hourItems].map((item) => <article key={`${item.kind}-${item.id}`} className={`aven-calendar__timeline-event aven-calendar__timeline-event--${(item.eventType ?? item.kind).toLocaleLowerCase()}`}><strong>{item.title}</strong><span>{timeText(item)}{item.location ? ` · ${item.location}` : ''}{item.projectTitle ? ` · ${item.projectTitle}` : ''}</span>{item.kind === 'Event' && <button type="button" onClick={() => editEvent(events.find((event) => event.id === item.eventId)!)}>{t('cal.edit')}</button>}</article>)}<button type="button" className="aven-calendar__hour-add" aria-label={t('cal.scheduleAt', { hour })} onClick={() => { setStartValue(`${selectedDate}T${String(hour).padStart(2, '0')}:00`); document.querySelector('.connected-compose')?.scrollIntoView({ behavior: 'smooth' }); }}>＋</button></div></div>; })}</div> : <div className="aven-calendar__agenda">{visibleCalendarItems.length === 0 ? <p className="productivity-message">{t('cal.noMatch')}</p> : visibleCalendarItems.map((item) => <article className="aven-calendar__agenda-item" key={`${item.kind}-${item.id}`}><time dateTime={item.startsAt}>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', weekday: 'short' }).format(new Date(item.startsAt))}<small>{timeText(item)}</small></time><span className={`aven-calendar__item aven-calendar__item--${item.kind.toLowerCase()}`}>{kindLabel(item)}</span>{item.kind === 'Deadline' && item.taskId ? <Link className="calendar-task-link" href={`/workspace/tasks/${item.taskId}`}>{item.title}</Link> : <strong>{item.title}</strong>}{item.location && <small>{item.location}</small>}{item.projectTitle && <small>{t('cal.project', { name: item.projectTitle })}</small>}{item.taskTitle && <small>{t('cal.task', { name: item.taskTitle })}</small>}{item.kind === 'Deadline' && item.labels && <TaskLabels labels={item.labels} compact />} {item.kind === 'Event' && <div className="calendar-item-actions"><button type="button" onClick={() => editEvent(events.find((event) => event.id === item.eventId)!)}>{t('cal.edit')}</button><button type="button" onClick={() => void removeEvent(events.find((event) => event.id === item.eventId)!)}>{t('wb.delete')}</button></div>}</article>)}</div>}
            <div className="aven-calendar__selected"><div className="project-milestones__heading"><h3 suppressHydrationWarning>{selectedLabel}</h3><span>{t(selectedItems.length === 1 ? 'cal.itemOne' : 'cal.itemMany', { n: selectedItems.length })}</span></div>{selectedItems.length === 0 ? <p>{t('cal.noDay')}</p> : selectedItems.map((item) => <article key={`selected-${item.kind}-${item.id}`}><span className={`aven-calendar__item aven-calendar__item--${item.kind.toLowerCase()}`}>{item.recurrence ? t('cal.repeating') : item.kind === 'Deadline' ? t('cal.k.deadline') : t('cal.k.event')}</span><strong>{item.title}</strong><time>{timeText(item)}{item.projectTitle ? ` · ${item.projectTitle}` : ''}{item.endsAt && !item.isAllDay ? ` – ${new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(item.endsAt))}` : ''}</time>{item.kind === 'Event' && <div className="calendar-item-actions"><button type="button" onClick={() => editEvent(events.find((event) => event.id === item.eventId)!)}>{t('cal.edit')}</button><button type="button" onClick={() => void removeEvent(events.find((event) => event.id === item.eventId)!)}>{t('wb.delete')}</button></div>}</article>)}</div>
          </div>
        </section>
      </div>
    </div>
  );
}
