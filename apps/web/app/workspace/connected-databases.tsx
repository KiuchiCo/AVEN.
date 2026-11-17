'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useWorkspaceSession } from './workspace-shell';

type Property = { id: string; name: string; type: string; relatedDatabaseId?: string };
type RecordValues = Record<string, string | number | boolean | null | string[]>;
type DatabaseRecord = { id: string; values: RecordValues; updatedAt: string };
type ViewLayout = 'TABLE' | 'BOARD' | 'GALLERY' | 'CALENDAR' | 'LIST' | 'TIMELINE' | 'CHART';
type SavedView = { id: string; name: string; filterQuery: string; sortPropertyId: string; sortDirection: 'ASC' | 'DESC'; layout: ViewLayout; groupByPropertyId: string; datePropertyId: string; chartPropertyId: string };
type WorkspaceDatabase = { id: string; name: string; description: string | null; properties: Property[]; records: DatabaseRecord[]; views: SavedView[] };

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const statuses = ['Planning', 'In progress', 'On track', 'At risk', 'Completed'];
const propertyTypes = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Date' },
  { value: 'status', label: 'Status' },
  { value: 'relation', label: 'Relation' },
];

function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell === '') quoted = true;
    else if (character === ',') { row.push(cell); cell = ''; }
    else if (character === '\n' || character === '\r') {
      row.push(cell); cell = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      if (character === '\r' && source[index + 1] === '\n') index += 1;
    } else cell += character;
  }
  if (quoted) throw new Error('The CSV file has an unclosed quoted field.');
  if (cell !== '' || row.length) { row.push(cell); if (row.some((value) => value !== '')) rows.push(row); }
  return rows;
}

function csvCell(value: string, numeric = false) {
  const safe = !numeric && /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function calendarDateKey(value: RecordValues[string] | undefined) {
  if (typeof value !== 'string' || !value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function DatabasesWorkspace() {
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [databases, setDatabases] = useState<WorkspaceDatabase[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState<RecordValues>({});
  const [filterQuery, setFilterQuery] = useState('');
  const [sortPropertyId, setSortPropertyId] = useState('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [viewLayout, setViewLayout] = useState<ViewLayout>('TABLE');
  const [groupByPropertyId, setGroupByPropertyId] = useState('status');
  const [calendarDatePropertyId, setCalendarDatePropertyId] = useState('');
  const [chartPropertyId, setChartPropertyId] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedViewId, setSelectedViewId] = useState('');
  const [viewName, setViewName] = useState('');
  const [newPropertyType, setNewPropertyType] = useState('text');
  const [notice, setNotice] = useState('');
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
  const selectedView = selected?.views.find((view) => view.id === selectedViewId);
  const statusProperties = selected?.properties.filter((property) => property.type === 'status') ?? [];
  const dateProperties = selected?.properties.filter((property) => property.type === 'date') ?? [];
  const boardPropertyId = statusProperties.some((property) => property.id === groupByPropertyId) ? groupByPropertyId : statusProperties[0]?.id ?? '';
  const calendarPropertyId = dateProperties.some((property) => property.id === calendarDatePropertyId) ? calendarDatePropertyId : dateProperties[0]?.id ?? '';
  const numericProperties = selected?.properties.filter((property) => property.type === 'number') ?? [];
  const chartValuePropertyId = numericProperties.some((property) => property.id === chartPropertyId) ? chartPropertyId : '';
  const visibleRecords = selected ? selected.records
    .filter((record) => {
      const query = filterQuery.trim().toLocaleLowerCase();
      if (!query) return true;
      return selected.properties.some((property) => propertyValueLabel(property, record.values[property.id]).toLocaleLowerCase().includes(query));
    })
    .sort((left, right) => {
      const leftValue = sortPropertyId === 'updatedAt' ? left.updatedAt : left.values[sortPropertyId];
      const rightValue = sortPropertyId === 'updatedAt' ? right.updatedAt : right.values[sortPropertyId];
      const leftEmpty = leftValue === null || leftValue === undefined || leftValue === '';
      const rightEmpty = rightValue === null || rightValue === undefined || rightValue === '';
      if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1;
      let comparison = 0;
      if (typeof leftValue === 'number' && typeof rightValue === 'number') comparison = leftValue - rightValue;
      else if (typeof leftValue === 'boolean' && typeof rightValue === 'boolean') comparison = Number(leftValue) - Number(rightValue);
      else comparison = String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    }) : [];
  const boardGroups = statusProperties.length ? [...new Set([...statuses, ...visibleRecords.map((record) => String(record.values[boardPropertyId] ?? 'No status'))])] : [];
  const chartGroups = statusProperties.length ? [...new Set([...statuses, ...visibleRecords.map((record) => String(record.values[boardPropertyId] ?? 'No status'))])] : [];
  const chartValues = chartGroups.map((group) => {
    const items = visibleRecords.filter((record) => String(record.values[boardPropertyId] ?? 'No status') === group);
    const value = chartValuePropertyId ? items.reduce((sum, record) => sum + (typeof record.values[chartValuePropertyId] === 'number' ? record.values[chartValuePropertyId] as number : 0), 0) : items.length;
    return { group, count: items.length, value };
  });
  const maxChartValue = Math.max(1, ...chartValues.map((item) => item.value));
  const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const calendarGridStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1 - monthStart.getDay());
  const calendarDays = Array.from({ length: 42 }, (_, index) => new Date(calendarGridStart.getFullYear(), calendarGridStart.getMonth(), calendarGridStart.getDate() + index));
  function propertyValueLabel(property: Property, value: RecordValues[string]) {
    if (property.type !== 'relation' || !Array.isArray(value)) return value == null ? '—' : String(value);
    const related = databases.find((database) => database.id === property.relatedDatabaseId);
    return value.map((recordId) => {
      const record = related?.records.find((item) => item.id === recordId);
      return String(record?.values.name ?? record?.values[related?.properties[0]?.id ?? ''] ?? 'Linked record');
    }).join(', ') || '—';
  }

  function exportCsv() {
    if (!selected) return;
    const properties = selected.properties.filter((property) => property.type !== 'relation');
    const lines = [properties.map((property) => csvCell(property.name)).join(',')];
    for (const record of visibleRecords) {
      lines.push(properties.map((property) => csvCell(record.values[property.id] == null ? '' : String(record.values[property.id]), property.type === 'number')).join(','));
    }
    const file = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selected.name.replace(/[^a-z0-9-_]+/gi, '-').toLocaleLowerCase() || 'aven-database'}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setError('');
    setNotice(`Exported ${visibleRecords.length} visible records. Relation fields are omitted.`);
  }

  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const formElement = event.currentTarget;
    const file = (new FormData(formElement).get('csvFile')) as File | null;
    if (!file || !file.size) { setError('Choose a CSV file to import.'); return; }
    if (file.size > 1_500_000) { setError('CSV files must be 1.5 MB or smaller.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const [headerRow, ...dataRows] = parseCsv(await file.text());
      if (!headerRow?.length || !dataRows.length) throw new Error('The CSV needs a header row and at least one record.');
      const headers = headerRow.map((header) => header.trim());
      if (new Set(headers.map((header) => header.toLocaleLowerCase())).size !== headers.length) throw new Error('CSV column names must be unique.');
      const mapped = headers.map((header) => {
        const property = selected.properties.find((item) => item.name.toLocaleLowerCase() === header.toLocaleLowerCase());
        if (!property) throw new Error(`“${header}” is not a property in this database.`);
        if (property.type === 'relation') throw new Error('Relation fields are not imported from CSV. Import those links after the records exist.');
        return property;
      });
      if (dataRows.length > 500) throw new Error('Import at most 500 records at a time.');
      const rows = dataRows.map((cells, rowIndex) => {
        if (cells.length !== headers.length) throw new Error(`Row ${rowIndex + 2} has a different number of columns than the header.`);
        const values: Record<string, string | number | boolean | null> = {};
        mapped.forEach((property, columnIndex) => {
          const raw = cells[columnIndex].trim();
          if (property.type === 'number') {
            const number = raw === '' ? null : Number(raw);
            if (number !== null && !Number.isFinite(number)) throw new Error(`Row ${rowIndex + 2}: ${property.name} must be a number.`);
            values[property.id] = number;
          } else if (property.type === 'checkbox') {
            const normalized = raw.toLocaleLowerCase();
            if (raw === '') values[property.id] = null;
            else if (['true', 'yes', '1'].includes(normalized)) values[property.id] = true;
            else if (['false', 'no', '0'].includes(normalized)) values[property.id] = false;
            else throw new Error(`Row ${rowIndex + 2}: ${property.name} must be true/false, yes/no, or 1/0.`);
          } else values[property.id] = raw || null;
        });
        if (selected.properties.some((property) => property.id === 'name') && (typeof values.name !== 'string' || !values.name.trim())) {
          throw new Error(`Row ${rowIndex + 2} needs a record name.`);
        }
        return values;
      });
      const result = await request(`/workspaces/${workspace.id}/databases/${selected.id}/records/import`, {
        method: 'POST', body: JSON.stringify({ rows }),
      }) as { imported: number };
      formElement.reset();
      await reload();
      setNotice(`Imported ${result.imported} records.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import this CSV.'); }
    finally { setBusy(false); }
  }

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
      const values = Object.fromEntries(selected.properties.map((property) => {
        const raw = form.get(property.id);
        if (property.type === 'relation') return [property.id, form.getAll(property.id).filter((value): value is string => typeof value === 'string')];
        if (property.type === 'checkbox') return [property.id, raw === 'on'];
        if (property.type === 'number') return [property.id, raw === null || raw === '' ? null : Number(raw)];
        return [property.id, raw ? String(raw) : null];
      }));
      await request(`/workspaces/${workspace.id}/databases/${selected.id}/records`, {
        method: 'POST',
        body: JSON.stringify({ values }),
      });
      formElement.reset();
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not add the record.'); }
    finally { setBusy(false); }
  }

  async function createProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/databases/${selected.id}/properties`, {
        method: 'PATCH', body: JSON.stringify({ name: form.get('propertyName'), type: form.get('propertyType'), relatedDatabaseId: form.get('relatedDatabaseId') }),
      });
      formElement.reset();
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not add the property.'); }
    finally { setBusy(false); }
  }

  function applyView(viewId: string) {
    setSelectedViewId(viewId);
    const view = selected?.views.find((candidate) => candidate.id === viewId);
    if (!view) {
      setFilterQuery('');
      setSortPropertyId('updatedAt');
      setSortDirection('desc');
      setViewLayout('TABLE');
      setGroupByPropertyId(statusProperties[0]?.id ?? 'status');
      setCalendarDatePropertyId(dateProperties[0]?.id ?? '');
      setChartPropertyId('');
      return;
    }
    setFilterQuery(view.filterQuery);
    setSortPropertyId(view.sortPropertyId);
    setSortDirection(view.sortDirection.toLocaleLowerCase() as 'asc' | 'desc');
    setViewLayout(view.layout);
    setGroupByPropertyId(view.groupByPropertyId);
    setCalendarDatePropertyId(view.datePropertyId);
    setChartPropertyId(view.chartPropertyId);
  }

  async function saveCurrentView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const created = await request(`/workspaces/${workspace.id}/databases/${selected.id}/views`, {
        method: 'POST',
        body: JSON.stringify({ name: viewName, filterQuery, sortPropertyId, sortDirection: sortDirection.toLocaleUpperCase(), layout: viewLayout, groupByPropertyId: boardPropertyId, datePropertyId: calendarPropertyId, chartPropertyId: chartValuePropertyId }),
      }) as SavedView;
      setViewName('');
      await reload();
      setSelectedViewId(created.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this view.'); }
    finally { setBusy(false); }
  }

  async function deleteSelectedView() {
    if (!selected || !selectedView) return;
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/databases/${selected.id}/views/${selectedView.id}`, { method: 'DELETE' });
      setSelectedViewId('');
      setFilterQuery(''); setSortPropertyId('updatedAt'); setSortDirection('desc');
      setViewLayout('TABLE'); setGroupByPropertyId(statusProperties[0]?.id ?? 'status');
      setCalendarDatePropertyId(dateProperties[0]?.id ?? '');
      setChartPropertyId('');
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this view.'); }
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

  async function moveBoardRecord(recordId: string, nextStatus: string) {
    if (!selected || !boardPropertyId) return;
    const record = selected.records.find((item) => item.id === recordId);
    if (!record || record.values[boardPropertyId] === nextStatus) return;
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/databases/${selected.id}/records/${record.id}`, {
        method: 'PATCH', body: JSON.stringify({ values: { ...record.values, [boardPropertyId]: nextStatus === 'No status' ? null : nextStatus } }),
      });
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not move this record.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="workspace-section-page connected-page database-page">
      <p className="workspace-eyebrow">YOUR WORKSPACE · {workspace.name}</p>
      <h1>Databases</h1>
      <p className="workspace-section-page__description">Keep structured information beside the projects, notes, and plans it supports.</p>
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <div className="database-toolbar">
        <label>Workspace database<select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setEditingId(''); setSelectedViewId(''); setFilterQuery(''); setSortPropertyId('updatedAt'); setSortDirection('desc'); setViewLayout('TABLE'); setGroupByPropertyId('status'); setCalendarDatePropertyId(''); setChartPropertyId(''); }} disabled={!databases.length}>
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
            <div className="database-table-heading"><div><p className="workspace-eyebrow">{viewLayout} VIEW</p><h2>{selected.name}</h2><p>{selected.description || 'A structured view of your workspace information.'}</p></div><span>{selected.records.length} records</span></div>
            <form className="database-add-property" onSubmit={createProperty}>
              <label>New property<input name="propertyName" required maxLength={80} placeholder="Owner, budget, due date…" /></label>
              <label>Type<select name="propertyType" value={newPropertyType} onChange={(event) => setNewPropertyType(event.target.value)}>{propertyTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
              {newPropertyType === 'relation' && <label>Related database<select name="relatedDatabaseId" required defaultValue=""><option value="" disabled>Choose a database</option>{databases.filter((database) => database.id !== selected.id).map((database) => <option key={database.id} value={database.id}>{database.name}</option>)}</select></label>}
              <button type="submit" disabled={busy}>{busy ? 'Adding…' : '＋ Add property'}</button>
            </form>
            <div className="database-view-controls" aria-label="Table view controls">
              <label>Saved view<select value={selectedViewId} onChange={(event) => applyView(event.target.value)}><option value="">Custom view</option>{selected.views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}</select></label>
              <label>Layout<select value={viewLayout} onChange={(event) => { const layout = event.target.value as ViewLayout; setViewLayout(layout); setSelectedViewId(''); if ((layout === 'CALENDAR' || layout === 'TIMELINE') && !calendarDatePropertyId) setCalendarDatePropertyId(dateProperties[0]?.id ?? ''); }}><option value="TABLE">Table</option><option value="LIST">List</option><option value="BOARD" disabled={!statusProperties.length}>Status board</option><option value="GALLERY">Gallery</option><option value="CALENDAR" disabled={!dateProperties.length}>Calendar</option><option value="TIMELINE" disabled={!dateProperties.length}>Timeline</option><option value="CHART" disabled={!statusProperties.length}>Chart</option></select></label>
              {(viewLayout === 'BOARD' || viewLayout === 'CHART') && <label>Group by<select value={boardPropertyId} onChange={(event) => { setGroupByPropertyId(event.target.value); setSelectedViewId(''); }}>{statusProperties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>}
              {(viewLayout === 'CALENDAR' || viewLayout === 'TIMELINE') && <label>Calendar date<select value={calendarPropertyId} onChange={(event) => { setCalendarDatePropertyId(event.target.value); setSelectedViewId(''); }}>{dateProperties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>}
              {viewLayout === 'CHART' && <label>Measure<select value={chartValuePropertyId} onChange={(event) => { setChartPropertyId(event.target.value); setSelectedViewId(''); }}><option value="">Record count</option>{numericProperties.map((property) => <option key={property.id} value={property.id}>Sum of {property.name}</option>)}</select></label>}
              <label>Filter records<input type="search" value={filterQuery} onChange={(event) => { setFilterQuery(event.target.value); setSelectedViewId(''); }} placeholder="Search record values" /></label>
              <label>Sort by<select value={sortPropertyId} onChange={(event) => { setSortPropertyId(event.target.value); setSelectedViewId(''); }}>
                <option value="updatedAt">Updated</option>
                {selected.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select></label>
              <label>Order<select value={sortDirection} onChange={(event) => { setSortDirection(event.target.value as 'asc' | 'desc'); setSelectedViewId(''); }}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
              <span className="database-view-count">{filterQuery.trim() ? `${visibleRecords.length} of ${selected.records.length} records` : `${selected.records.length} records`}</span>
            </div>
            {notice && <p className="database-import-notice" role="status">{notice}</p>}
            <form className="database-csv-tools" onSubmit={importCsv}>
              <label>Import CSV<input name="csvFile" type="file" accept=".csv,text/csv" required /></label>
              <button type="submit" disabled={busy}>{busy ? 'Importing…' : 'Import rows'}</button>
              <button type="button" onClick={exportCsv} disabled={busy}>Export {visibleRecords.length} visible</button>
              <small>CSV uses property names as headers. Relations are left out.</small>
            </form>
            <form className="database-save-view" onSubmit={saveCurrentView}>
              <label>Save current view<input value={viewName} onChange={(event) => setViewName(event.target.value)} required maxLength={80} placeholder="e.g. Recently updated" /></label>
              <button type="submit" disabled={busy || ((viewLayout === 'BOARD' || viewLayout === 'CHART') && !boardPropertyId) || ((viewLayout === 'CALENDAR' || viewLayout === 'TIMELINE') && !calendarPropertyId)}>{busy ? 'Saving…' : 'Save view'}</button>
              {selectedView && <button type="button" disabled={busy} onClick={() => void deleteSelectedView()}>Delete “{selectedView.name}”</button>}
            </form>
            {viewLayout === 'LIST' ? <div className="database-list" aria-label="Database record list">
              {visibleRecords.map((record) => {
                const titleProperty = selected.properties.find((property) => property.id === 'name') ?? selected.properties.find((property) => property.type === 'text') ?? selected.properties[0];
                return <article className="database-list__row" key={record.id}>
                  <div><h3>{String(record.values[titleProperty?.id ?? ''] ?? 'Untitled record')}</h3><p>{selected.properties.filter((property) => property.id !== titleProperty?.id).slice(0, 3).map((property) => `${property.name}: ${propertyValueLabel(property, record.values[property.id])}`).join(' · ')}</p></div>
                  <time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(record.updatedAt))}</time>
                </article>;
              })}
              {!visibleRecords.length && <p className="database-gallery-empty">{selected.records.length ? 'No records match that search.' : 'Add a record to see it here.'}</p>}
            </div> : viewLayout === 'CHART' && boardPropertyId ? <section className="database-chart" aria-label="Database status chart">
              <div className="database-chart__heading"><h3>{chartValuePropertyId ? `Sum of ${numericProperties.find((property) => property.id === chartValuePropertyId)?.name}` : 'Record count'}</h3><span>by {statusProperties.find((property) => property.id === boardPropertyId)?.name}</span></div>
              <div className="database-chart__rows">{chartValues.map((item) => <div className="database-chart__row" key={item.group}>
                <span>{item.group}</span><div><i style={{ width: `${(item.value / maxChartValue) * 100}%` }} /></div><strong>{item.value}{chartValuePropertyId ? '' : ` / ${item.count}`}</strong>
              </div>)}</div>
              {!visibleRecords.length && <p className="database-gallery-empty">{selected.records.length ? 'No records match that search.' : 'Add a record to see it here.'}</p>}
            </section> : viewLayout === 'TIMELINE' && calendarPropertyId ? <section className="database-timeline" aria-label="Database timeline">
              <header className="database-calendar__header">
                <button type="button" aria-label="Previous month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button>
                <h3>{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(calendarMonth)}</h3>
                <button type="button" aria-label="Next month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button>
              </header>
              {(() => {
                const monthKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}`;
                const monthDays = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
                const records = visibleRecords.filter((record) => calendarDateKey(record.values[calendarPropertyId]).startsWith(`${monthKey}-`)).sort((left, right) => calendarDateKey(left.values[calendarPropertyId]).localeCompare(calendarDateKey(right.values[calendarPropertyId])));
                const ticks = [...new Set([1, 8, 15, 22, monthDays])];
                const titleProperty = selected.properties.find((property) => property.id === 'name') ?? selected.properties.find((property) => property.type === 'text') ?? selected.properties[0];
                return <>
                  <div className="database-timeline__axis"><span>{selected.properties.find((property) => property.id === calendarPropertyId)?.name}</span><div>{ticks.map((day) => <time key={day} style={{ left: `${((day - 1) / Math.max(1, monthDays - 1)) * 100}%` }}>{day}</time>)}</div><span>Date</span></div>
                  {records.map((record) => {
                    const dateKey = calendarDateKey(record.values[calendarPropertyId]);
                    const day = Number(dateKey.slice(-2));
                    return <div className="database-timeline__row" key={record.id}>
                      <strong>{String(record.values[titleProperty?.id ?? ''] ?? 'Untitled record')}</strong>
                      <div className="database-timeline__track"><i style={{ left: `${((day - 1) / Math.max(1, monthDays - 1)) * 100}%` }} /></div>
                      <time dateTime={dateKey}>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${dateKey}T12:00:00`))}</time>
                    </div>;
                  })}
                  {!records.length && <p className="database-gallery-empty">{selected.records.length ? 'No dated records match this month and filter.' : 'Add records with dates to see them here.'}</p>}
                </>;
              })()}
            </section> : viewLayout === 'GALLERY' ? <div className="database-gallery" aria-label="Database record gallery">
              {visibleRecords.map((record) => {
                const titleProperty = selected.properties.find((property) => property.id === 'name') ?? selected.properties.find((property) => property.type === 'text') ?? selected.properties[0];
                return <article className="database-gallery-card" key={record.id}>
                  <div className="database-gallery-card__cover" aria-hidden="true"><span>AVEN</span></div>
                  <div className="database-gallery-card__content">
                    <h3>{String(record.values[titleProperty?.id ?? ''] ?? 'Untitled record')}</h3>
                    <div className="database-gallery-card__fields">{selected.properties.filter((property) => property.id !== titleProperty?.id).slice(0, 4).map((property) => <p key={property.id}><span>{property.name}</span>{property.type === 'checkbox' ? (record.values[property.id] ? 'Yes' : 'No') : propertyValueLabel(property, record.values[property.id])}</p>)}</div>
                    <small>Updated {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(record.updatedAt))}</small>
                  </div>
                </article>;
              })}
              {!visibleRecords.length && <p className="database-gallery-empty">{selected.records.length ? 'No records match that search.' : 'Add a record to see it here.'}</p>}
            </div> : viewLayout === 'CALENDAR' && calendarPropertyId ? <section className="database-calendar" aria-label="Database calendar">
              <header className="database-calendar__header">
                <button type="button" aria-label="Previous month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button>
                <h3>{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(calendarMonth)}</h3>
                <button type="button" aria-label="Next month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button>
              </header>
              <div className="database-calendar__weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div>
              <div className="database-calendar__grid">{calendarDays.map((day) => {
                const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                const recordsForDay = visibleRecords.filter((record) => calendarDateKey(record.values[calendarPropertyId]) === key);
                const titleProperty = selected.properties.find((property) => property.id === 'name') ?? selected.properties.find((property) => property.type === 'text');
                return <section className={`database-calendar__day${day.getMonth() !== calendarMonth.getMonth() ? ' is-outside' : ''}`} key={key}>
                  <time dateTime={key}>{day.getDate()}</time>
                  <div>{recordsForDay.map((record) => <article className="database-calendar__record" key={record.id} title={String(record.values[titleProperty?.id ?? ''] ?? 'Untitled record')}>
                    <strong>{String(record.values[titleProperty?.id ?? ''] ?? 'Untitled record')}</strong>
                    {statusProperties[0] && <small>{String(record.values[statusProperties[0].id] ?? 'No status')}</small>}
                  </article>)}</div>
                </section>;
              })}</div>
            </section> : viewLayout === 'BOARD' && boardPropertyId ? <div className="database-board" aria-label="Records grouped by status">
              {boardGroups.map((group) => {
                const groupRecords = visibleRecords.filter((record) => String(record.values[boardPropertyId] ?? 'No status') === group);
                return <section className="database-board-column" key={group} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const recordId = event.dataTransfer.getData('text/plain'); if (recordId) void moveBoardRecord(recordId, group); }}>
                  <header><h3>{group}</h3><span>{groupRecords.length}</span></header>
                  <div className="database-board-cards">{groupRecords.map((record) => <article className="database-board-card" key={record.id} draggable={!busy} onDragStart={(event) => event.dataTransfer.setData('text/plain', record.id)}>
                    <strong>{String(record.values.name ?? record.values[boardPropertyId] ?? 'Untitled record')}</strong>
                    {selected.properties.filter((property) => property.id !== 'name' && property.id !== boardPropertyId).slice(0, 3).map((property) => <p key={property.id}><span>{property.name}</span>{propertyValueLabel(property, record.values[property.id])}</p>)}
                  </article>)}</div>
                </section>;
              })}
            </div> : <div className="database-table-scroll"><table className="database-table"><thead><tr>{selected.properties.map((property) => <th key={property.id}>{property.name}</th>)}<th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {visibleRecords.map((record) => <tr key={record.id}>
                  {editingId === record.id ? <>
                    {selected.properties.map((property) => <td key={property.id}>{property.type === 'relation' ? <select aria-label={property.name} multiple size={3} value={Array.isArray(draft[property.id]) ? draft[property.id] as string[] : []} onChange={(event) => setDraft((current) => ({ ...current, [property.id]: Array.from(event.target.selectedOptions, (option) => option.value) }))}>{(databases.find((database) => database.id === property.relatedDatabaseId)?.records ?? []).map((target) => <option key={target.id} value={target.id}>{String(target.values.name ?? 'Untitled record')}</option>)}</select> : property.type === 'status' ? <select aria-label={property.name} value={String(draft[property.id] ?? '')} onChange={(event) => setDraft((current) => ({ ...current, [property.id]: event.target.value || null }))}><option value="">Choose status</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select> : property.type === 'checkbox' ? <input aria-label={property.name} type="checkbox" checked={Boolean(draft[property.id])} onChange={(event) => setDraft((current) => ({ ...current, [property.id]: event.target.checked }))} /> : <input aria-label={property.name} type={property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : 'text'} value={draft[property.id] == null ? '' : String(draft[property.id])} maxLength={property.type === 'text' ? 2000 : undefined} onChange={(event) => setDraft((current) => ({ ...current, [property.id]: event.target.value === '' ? null : property.type === 'number' ? Number(event.target.value) : event.target.value }))} />}</td>)}
                    <td>Editing</td><td><form className="database-row-actions" onSubmit={saveRecord}><button type="submit" disabled={busy}>Save</button><button type="button" onClick={() => setEditingId('')}>Cancel</button></form></td>
                  </> : <>
                    {selected.properties.map((property) => <td key={property.id}>{property.type === 'status' ? <span className="database-status">{String(record.values[property.id] ?? '—')}</span> : property.type === 'checkbox' ? (record.values[property.id] ? 'Yes' : 'No') : propertyValueLabel(property, record.values[property.id])}</td>)}
                    <td>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(record.updatedAt))}</td><td><button className="database-row-edit" type="button" onClick={() => startEdit(record)}>Edit</button></td>
                  </>}
                </tr>)}
                {!selected.records.length && <tr><td colSpan={selected.properties.length + 2} className="database-table-empty">No records yet. Add the first one below.</td></tr>}
                {selected.records.length > 0 && !visibleRecords.length && <tr><td colSpan={selected.properties.length + 2} className="database-table-empty">No records match that search.</td></tr>}
              </tbody></table></div>}
            <form className="database-add-record" onSubmit={createRecord}>
              {selected.properties.map((property) => <label key={property.id}>{property.name}{property.type === 'relation' ? <select name={property.id} multiple size={3}>{(databases.find((database) => database.id === property.relatedDatabaseId)?.records ?? []).map((target) => <option key={target.id} value={target.id}>{String(target.values.name ?? 'Untitled record')}</option>)}</select> : property.type === 'status' ? <select name={property.id} defaultValue={property.id === 'status' ? 'Planning' : ''}><option value="">Choose status</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select> : property.type === 'checkbox' ? <input name={property.id} type="checkbox" /> : <input name={property.id} type={property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : 'text'} maxLength={property.type === 'text' ? 2000 : undefined} placeholder={property.id === 'name' ? 'Website redesign' : undefined} required={property.id === 'name'} />}</label>)}
              <button type="submit" disabled={busy}>{busy ? 'Adding…' : '＋ Add record'}</button>
            </form>
          </>}
        </section>
      </div>
    </div>
  );
}
