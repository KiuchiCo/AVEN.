'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useWorkspaceSession } from './workspace-shell';

type Property = { id: string; name: string; type: string };
type RecordValues = Record<string, string | number | boolean | null>;
type DatabaseRecord = { id: string; values: RecordValues; updatedAt: string };
type WorkspaceDatabase = { id: string; name: string; description: string | null; properties: Property[]; records: DatabaseRecord[] };

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const statuses = ['Planning', 'In progress', 'On track', 'At risk', 'Completed'];

export function DatabasesWorkspace() {
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [databases, setDatabases] = useState<WorkspaceDatabase[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState<RecordValues>({});
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
    const rows = await request(`/workspaces/${workspace.id}/databases`) as WorkspaceDatabase[];
    setDatabases(rows);
    setSelectedId((current) => rows.some((database) => database.id === current) ? current : rows[0]?.id ?? '');
  }, [request, workspace.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try { await reload(); }
      catch (reason) { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load databases.'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [reload]);

  const selected = databases.find((database) => database.id === selectedId);

  async function createDatabase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError('');
    try {
      const created = await request(`/workspaces/${workspace.id}/databases`, {
        method: 'POST',
        body: JSON.stringify({ name: form.get('name'), description: form.get('description') }),
      }) as WorkspaceDatabase;
      formElement.reset();
      await reload();
      setSelectedId(created.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the database.'); }
    finally { setBusy(false); }
  }

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/databases/${selected.id}/records`, {
        method: 'POST',
        body: JSON.stringify({ values: { name: form.get('name'), status: form.get('status') } }),
      });
      formElement.reset();
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not add the record.'); }
    finally { setBusy(false); }
  }

  function startEdit(record: DatabaseRecord) {
    setEditingId(record.id);
    setDraft({ ...record.values });
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !editingId) return;
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/databases/${selected.id}/records/${editingId}`, {
        method: 'PATCH', body: JSON.stringify({ values: draft }),
      });
      setEditingId('');
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update the record.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="workspace-section-page connected-page database-page">
      <p className="workspace-eyebrow">YOUR WORKSPACE · {workspace.name}</p>
      <h1>Databases</h1>
      <p className="workspace-section-page__description">Keep structured information beside the projects, notes, and plans it supports.</p>
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <div className="database-toolbar">
        <label>Workspace database<select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setEditingId(''); }} disabled={!databases.length}>
          {databases.length ? databases.map((database) => <option key={database.id} value={database.id}>{database.name}</option>) : <option value="">Create your first database</option>}
        </select></label>
        <span>{selected ? `${selected.records.length} ${selected.records.length === 1 ? 'record' : 'records'}` : 'Start with a simple table'}</span>
      </div>

      <div className="database-layout">
        <form className="productivity-form database-create" onSubmit={createDatabase}>
          <p className="workspace-eyebrow">NEW TABLE</p>
          <h2>Create a database</h2>
          <p>Each table starts with a name and status field. Your records stay scoped to this workspace.</p>
          <label>Database name<input name="name" required maxLength={160} placeholder="Project Pipeline" /></label>
          <label>Description <span>(optional)</span><input name="description" maxLength={500} placeholder="Track active work across the team" /></label>
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create database'}</button>
        </form>

        <section className="database-table-card" aria-label={selected?.name ?? 'Database records'}>
          {loading ? <p className="productivity-message">Loading databases…</p> : !selected ? (
            <div className="database-empty"><span aria-hidden="true">▤</span><h2>Your first table starts here</h2><p>Create a workspace database, then add records as your work takes shape.</p></div>
          ) : <>
            <div className="database-table-heading"><div><p className="workspace-eyebrow">TABLE VIEW</p><h2>{selected.name}</h2><p>{selected.description || 'A structured view of your workspace information.'}</p></div><span>{selected.records.length} records</span></div>
            <div className="database-table-scroll"><table className="database-table"><thead><tr>{selected.properties.map((property) => <th key={property.id}>{property.name}</th>)}<th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {selected.records.map((record) => <tr key={record.id}>
                  {editingId === record.id ? <>
                    {selected.properties.map((property) => <td key={property.id}>{property.type === 'status' ? <select aria-label={property.name} value={String(draft[property.id] ?? '')} onChange={(event) => setDraft((current) => ({ ...current, [property.id]: event.target.value }))}><option value="">Choose status</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select> : <input aria-label={property.name} value={String(draft[property.id] ?? '')} maxLength={2000} onChange={(event) => setDraft((current) => ({ ...current, [property.id]: event.target.value }))} />}</td>)}
                    <td>Editing</td><td><form className="database-row-actions" onSubmit={saveRecord}><button type="submit" disabled={busy}>Save</button><button type="button" onClick={() => setEditingId('')}>Cancel</button></form></td>
                  </> : <>
                    {selected.properties.map((property) => <td key={property.id}>{property.id === 'status' ? <span className="database-status">{String(record.values[property.id] ?? '—')}</span> : String(record.values[property.id] ?? '—')}</td>)}
                    <td>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(record.updatedAt))}</td><td><button className="database-row-edit" type="button" onClick={() => startEdit(record)}>Edit</button></td>
                  </>}
                </tr>)}
                {!selected.records.length && <tr><td colSpan={selected.properties.length + 2} className="database-table-empty">No records yet. Add the first one below.</td></tr>}
              </tbody></table></div>
            <form className="database-add-record" onSubmit={createRecord}>
              <label>Name<input name="name" required maxLength={200} placeholder="Website redesign" /></label>
              <label>Status<select name="status" defaultValue="Planning">{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
              <button type="submit" disabled={busy}>{busy ? 'Adding…' : '＋ Add record'}</button>
            </form>
          </>}
        </section>
      </div>
    </div>
  );
}
