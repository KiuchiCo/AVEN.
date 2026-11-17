'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useWorkspaceSession } from './workspace-shell';

type Project = { id: string; name: string };
type Task = { id: string; title: string; status: string; dueAt: string | null };
type DocumentRecord = { id: string; title: string; content: string; updatedAt: string; project: Project | null };
type CalendarEvent = { id: string; title: string; startsAt: string; endsAt: string | null; task: Pick<Task, 'id' | 'title'> | null };
type CalendarItem = { id: string; title: string; startsAt: string; endsAt: string | null; kind: 'Event' | 'Deadline'; taskTitle: string | null };

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

export function DocumentsWorkspace() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
    setBusy(true); setError('');
    try {
      const created = await request(`/workspaces/${workspace.id}/documents`, {
        method: 'POST',
        body: JSON.stringify({ title: form.get('title'), content: form.get('content'), projectId: form.get('projectId') || undefined }),
      }) as DocumentRecord;
      formElement.reset();
      router.push(`/workspace/documents/${created.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the document.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="workspace-section-page connected-page">
      <p className="workspace-eyebrow">YOUR WORKSPACE · {workspace.name}</p>
      <h1>Documents</h1>
      <p className="workspace-section-page__description">Write notes and keep them connected to project work.</p>
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <div className="connected-layout">
        <form className="productivity-form connected-compose" onSubmit={createDocument}>
          <h2>New document</h2>
          <label>Title<input name="title" required maxLength={200} placeholder="Project brief" /></label>
          <label>Project <span>(optional)</span><select name="projectId" defaultValue=""><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label>Content<textarea name="content" maxLength={20000} rows={8} placeholder="Add a note, plan, or decision…" /></label>
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save document'}</button>
        </form>
        <section className="connected-record-list" aria-labelledby="document-list-title">
          <div className="workspace-section-heading"><div><p className="workspace-eyebrow">SAVED TO AVEN</p><h2 id="document-list-title">Your documents</h2></div><span>{documents.length}</span></div>
          {loading ? <p className="productivity-message">Loading documents…</p> : documents.length === 0 ? <p className="productivity-message">No documents yet. Create your first note and optionally link it to a project.</p> : (
            <div className="connected-record-stack">{documents.map((document) => (
              <article className="connected-record" key={document.id}>
                <div className="connected-record__meta"><span>DOCUMENT</span>{document.project && <span className="connected-link-pill">{document.project.name}</span>}<Link className="connected-record__edit" href={`/workspace/documents/${document.id}`}>Open editor →</Link></div>
                <h3>{document.title}</h3><p>{documentPreview(document.content) || 'This document is empty.'}</p>
                <small>Updated {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(document.updatedAt))}</small>
              </article>
            ))}</div>
          )}
        </section>
      </div>
    </div>
  );
}

export function CalendarWorkspace() {
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(new Date()));
  const [calendarView, setCalendarView] = useState<'MONTH' | 'AGENDA'>('MONTH');
  const [startValue, setStartValue] = useState(() => {
    const nextHour = new Date(); nextHour.setMinutes(0, 0, 0); nextHour.setHours(nextHour.getHours() + 1);
    return localDateTimeValue(nextHour);
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
    const [taskRows, eventRows] = await Promise.all([
      request(`/workspaces/${workspace.id}/tasks`),
      request(`/workspaces/${workspace.id}/events`),
    ]) as [Task[], CalendarEvent[]];
    setTasks(taskRows.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED'));
    setEvents(eventRows);
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
    try {
      await request(`/workspaces/${workspace.id}/events`, {
        method: 'POST',
        body: JSON.stringify({
          title: form.get('title'),
          startsAt: submittedStart ? new Date(submittedStart).toISOString() : '',
          endsAt: endValue ? new Date(endValue).toISOString() : undefined,
          taskId: form.get('taskId') || undefined,
        }),
      });
      formElement.reset();
      setStartValue(`${selectedDate}T09:00`);
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not schedule the event.'); }
    finally { setBusy(false); }
  }

  const calendarItems: CalendarItem[] = [
    ...events.map((event) => ({ id: event.id, title: event.title, startsAt: event.startsAt, endsAt: event.endsAt, kind: 'Event' as const, taskTitle: event.task?.title ?? null })),
    ...tasks.filter((task) => task.dueAt).map((task) => ({ id: `task-${task.id}`, title: task.title, startsAt: task.dueAt as string, endsAt: null, kind: 'Deadline' as const, taskTitle: null })),
  ].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7));
  const monthDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart); date.setDate(gridStart.getDate() + index); return date;
  });
  const itemsByDate = new Map<string, CalendarItem[]>();
  for (const item of calendarItems) {
    const key = localDateKey(new Date(item.startsAt));
    itemsByDate.set(key, [...(itemsByDate.get(key) ?? []), item]);
  }
  const selectedItems = itemsByDate.get(selectedDate) ?? [];
  const selectedLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date(`${selectedDate}T12:00:00`));

  function moveMonth(offset: number) {
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(nextMonth); setSelectedDate(localDateKey(nextMonth));
  }

  function chooseDate(date: Date) {
    const key = localDateKey(date);
    setSelectedDate(key);
    const dateTime = new Date(`${key}T09:00`);
    setStartValue(localDateTimeValue(dateTime));
  }

  return (
    <div className="workspace-section-page connected-page">
      <p className="workspace-eyebrow">YOUR WORKSPACE · {workspace.name}</p>
      <h1>Calendar</h1>
      <p className="workspace-section-page__description">See task deadlines and scheduled events together, then shape your days around the work.</p>
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <div className="connected-layout">
        <form className="productivity-form connected-compose" onSubmit={createEvent}>
          <h2>Schedule time</h2>
          <label>Event title<input name="title" required maxLength={200} placeholder="Project review" /></label>
          <label>Linked task <span>(optional)</span><select name="taskId" defaultValue=""><option value="">No task</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
          <div className="productivity-form__row">
            <label>Starts<input name="startsAt" type="datetime-local" value={startValue} onChange={(event) => setStartValue(event.target.value)} required /></label>
            <label>Ends <span>(optional)</span><input name="endsAt" type="datetime-local" /></label>
          </div>
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add to calendar'}</button>
          <p className="calendar-form-hint">Pick a date on the calendar to start an event at 9:00 am that day.</p>
        </form>
        <section className="connected-record-list" aria-labelledby="calendar-list-title">
          <div className="aven-calendar">
            <div className="aven-calendar__toolbar"><div><p className="workspace-eyebrow">YOUR SCHEDULE</p><h2 id="calendar-list-title">{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month)}</h2></div><div className="aven-calendar__controls"><button type="button" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(localDateKey(today)); }}>Today</button><button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}>‹</button><button type="button" aria-label="Next month" onClick={() => moveMonth(1)}>›</button></div></div>
            <div className="aven-calendar__view-switch"><button type="button" aria-pressed={calendarView === 'MONTH'} className={calendarView === 'MONTH' ? 'is-active' : ''} onClick={() => setCalendarView('MONTH')}>Month</button><button type="button" aria-pressed={calendarView === 'AGENDA'} className={calendarView === 'AGENDA' ? 'is-active' : ''} onClick={() => setCalendarView('AGENDA')}>Agenda</button></div>
            {loading ? <p className="productivity-message">Loading your schedule…</p> : calendarView === 'MONTH' ? <>
              <div className="aven-calendar__weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}</div>
              <div className="aven-calendar__grid">{monthDays.map((date) => {
                const key = localDateKey(date); const dayItems = itemsByDate.get(key) ?? []; const isToday = key === localDateKey(new Date());
                return <button key={key} type="button" aria-pressed={selectedDate === key} className={`aven-calendar__day${date.getMonth() !== month.getMonth() ? ' is-outside' : ''}${selectedDate === key ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`} onClick={() => chooseDate(date)}>
                  <time dateTime={key}>{date.getDate()}</time><span className="aven-calendar__day-items">{dayItems.slice(0, 2).map((item) => <small className={`aven-calendar__item aven-calendar__item--${item.kind.toLowerCase()}`} key={`${item.kind}-${item.id}`}>{item.title}</small>)}{dayItems.length > 2 && <small className="aven-calendar__more">+{dayItems.length - 2} more</small>}</span>
                </button>;
              })}</div>
            </> : <div className="aven-calendar__agenda">{calendarItems.length === 0 ? <p className="productivity-message">No scheduled events or task deadlines yet.</p> : calendarItems.map((item) => <article className="aven-calendar__agenda-item" key={`${item.kind}-${item.id}`}><time dateTime={item.startsAt}>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', weekday: 'short' }).format(new Date(item.startsAt))}<small>{item.kind === 'Deadline' ? 'Due today' : new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(item.startsAt))}</small></time><span className={`aven-calendar__item aven-calendar__item--${item.kind.toLowerCase()}`}>{item.kind}</span><strong>{item.title}</strong>{item.taskTitle && <small>Task · {item.taskTitle}</small>}</article>)}</div>}
            <div className="aven-calendar__selected"><div className="project-milestones__heading"><h3>{selectedLabel}</h3><span>{selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'}</span></div>{selectedItems.length === 0 ? <p>No events or deadlines on this day.</p> : selectedItems.map((item) => <article key={`selected-${item.kind}-${item.id}`}><span className={`aven-calendar__item aven-calendar__item--${item.kind.toLowerCase()}`}>{item.kind}</span><strong>{item.title}</strong><time>{item.kind === 'Deadline' ? 'All day' : new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(item.startsAt))}{item.endsAt ? ` – ${new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(item.endsAt))}` : ''}</time></article>)}</div>
          </div>
        </section>
      </div>
    </div>
  );
}
