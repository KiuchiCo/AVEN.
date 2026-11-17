'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useWorkspaceSession } from './workspace-shell';

type Project = { id: string; name: string };
type Task = { id: string; title: string; status: string };
type DocumentRecord = { id: string; title: string; content: string; updatedAt: string; project: Project | null };
type CalendarEvent = { id: string; title: string; startsAt: string; endsAt: string | null; task: Pick<Task, 'id' | 'title'> | null };

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

export function DocumentsWorkspace() {
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
      await request(`/workspaces/${workspace.id}/documents`, {
        method: 'POST',
        body: JSON.stringify({ title: form.get('title'), content: form.get('content'), projectId: form.get('projectId') || undefined }),
      });
      formElement.reset();
      await reload();
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
                <div className="connected-record__meta"><span>DOCUMENT</span>{document.project && <span className="connected-link-pill">{document.project.name}</span>}</div>
                <h3>{document.title}</h3>
                <p>{document.content || 'This document is empty.'}</p>
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
    const startValue = String(form.get('startsAt') ?? '');
    const endValue = String(form.get('endsAt') ?? '');
    try {
      await request(`/workspaces/${workspace.id}/events`, {
        method: 'POST',
        body: JSON.stringify({
          title: form.get('title'),
          startsAt: startValue ? new Date(startValue).toISOString() : '',
          endsAt: endValue ? new Date(endValue).toISOString() : undefined,
          taskId: form.get('taskId') || undefined,
        }),
      });
      formElement.reset();
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not schedule the event.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="workspace-section-page connected-page">
      <p className="workspace-eyebrow">YOUR WORKSPACE · {workspace.name}</p>
      <h1>Calendar</h1>
      <p className="workspace-section-page__description">Schedule time for your tasks and keep the plan connected.</p>
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <div className="connected-layout">
        <form className="productivity-form connected-compose" onSubmit={createEvent}>
          <h2>Schedule a task</h2>
          <label>Event title<input name="title" required maxLength={200} placeholder="Project review" /></label>
          <label>Linked task <span>(optional)</span><select name="taskId" defaultValue=""><option value="">No task</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
          <div className="productivity-form__row">
            <label>Starts<input name="startsAt" type="datetime-local" required /></label>
            <label>Ends <span>(optional)</span><input name="endsAt" type="datetime-local" /></label>
          </div>
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add to calendar'}</button>
        </form>
        <section className="connected-record-list" aria-labelledby="calendar-list-title">
          <div className="workspace-section-heading"><div><p className="workspace-eyebrow">SCHEDULED IN AVEN</p><h2 id="calendar-list-title">Scheduled events</h2></div><span>{events.length}</span></div>
          {loading ? <p className="productivity-message">Loading events…</p> : events.length === 0 ? <p className="productivity-message">No events yet. Schedule a task above to add your first calendar entry.</p> : (
            <div className="connected-record-stack">{events.map((item) => (
              <article className="connected-event" key={item.id}>
                <time dateTime={item.startsAt}><span>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(item.startsAt)).toUpperCase()}</span><strong>{new Intl.DateTimeFormat(undefined, { day: '2-digit' }).format(new Date(item.startsAt))}</strong></time>
                <div className="connected-event__body"><h3>{item.title}</h3><p>{new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(item.startsAt))}{item.endsAt ? ` – ${new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(item.endsAt))}` : ''}</p>{item.task && <span className="connected-link-pill">Task · {item.task.title}</span>}</div>
              </article>
            ))}</div>
          )}
        </section>
      </div>
    </div>
  );
}
