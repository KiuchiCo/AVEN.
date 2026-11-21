'use client';

import { useAuth } from '@clerk/nextjs';
import { FavouriteStar } from './favourites';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useT } from '../i18n';
import type { Key } from '../i18n/en';
import { useWorkspaceSession } from './workspace-shell';
import { PageHeader } from './ui';
import { Icon } from './home-icons';

type Property = { id: string; name: string; type: string; relatedDatabaseId?: string; formula?: string; rollupRelationId?: string; rollupPropertyId?: string; rollupFunction?: string };
const isComputed = (property: Property) => property.type === 'formula' || property.type === 'rollup';
const rollupFunctionLabels = [['count', 'db.rf.count'], ['sum', 'db.rf.sum'], ['average', 'db.rf.average'], ['min', 'db.rf.min'], ['max', 'db.rf.max']] as const;
type RecordValues = Record<string, string | number | boolean | null | string[]>;
type DatabaseRecord = { id: string; values: RecordValues; updatedAt: string };
type ViewLayout = 'TABLE' | 'BOARD' | 'GALLERY' | 'CALENDAR' | 'LIST' | 'TIMELINE' | 'CHART';
type SavedView = { id: string; name: string; filterQuery: string; sortPropertyId: string; sortDirection: 'ASC' | 'DESC'; layout: ViewLayout; groupByPropertyId: string; datePropertyId: string; chartPropertyId: string };
type WorkspaceDatabase = { id: string; name: string; description: string | null; properties: Property[]; records: DatabaseRecord[]; views: SavedView[] };

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const statuses = ['Planning', 'In progress', 'On track', 'At risk', 'Completed'];
const propertyTypes = [
  { value: 'text', label: 'db.pt.text' as Key },
  { value: 'number', label: 'db.pt.number' as Key },
  { value: 'checkbox', label: 'db.pt.checkbox' as Key },
  { value: 'date', label: 'db.pt.date' as Key },
  { value: 'status', label: 'db.pt.status' as Key },
  { value: 'relation', label: 'db.pt.relation' as Key },
  { value: 'formula', label: 'db.pt.formula' as Key },
  { value: 'rollup', label: 'db.pt.rollup' as Key },
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
  const t = useT();
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [databases, setDatabases] = useState<WorkspaceDatabase[]>([]);
  const wantedDatabase = useSearchParams().get('db') ?? '';
  const [selectedId, setSelectedId] = useState(wantedDatabase);
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
  const [rollupRelationId, setRollupRelationId] = useState('');
  const [rollupFunction, setRollupFunction] = useState('count');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkPropertyId, setBulkPropertyId] = useState('');
  const [bulkValue, setBulkValue] = useState('');
  const [showRelationMap, setShowRelationMap] = useState(false);
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
      throw Object.assign(new Error(body?.message ?? 'AVEN could not complete that request.'), { status: response.status });
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
  const numericProperties = selected?.properties.filter((property) => property.type === 'number' || isComputed(property)) ?? [];
  const rollupRelations = selected?.properties.filter((property) => property.type === 'relation') ?? [];
  const rollupTargets = databases.find((database) => database.id === rollupRelations.find((relation) => relation.id === rollupRelationId)?.relatedDatabaseId)?.properties.filter((property) => property.type === 'number') ?? [];
  const bulkProperties = selected?.properties.filter((property) => ['text', 'number', 'checkbox', 'date', 'status'].includes(property.type)) ?? [];
  const bulkProperty = bulkProperties.find((property) => property.id === bulkPropertyId) ?? bulkProperties[0];
  const activeSelection = selected ? selectedIds.filter((id) => selected.records.some((record) => record.id === id)) : [];
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
  function editableValues(values: RecordValues): RecordValues {
    return Object.fromEntries(Object.entries(values).filter(([propertyId]) => { const property = selected?.properties.find((item) => item.id === propertyId); return property && !isComputed(property); }));
  }

  function propertyValueLabel(property: Property, value: RecordValues[string]) {
    if (property.type === 'rollup' && typeof value === 'number') return String(Number(value.toFixed(2)));
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
      lines.push(properties.map((property) => csvCell(record.values[property.id] == null ? '' : String(record.values[property.id]), (property.type === 'number' || isComputed(property)))).join(','));
    }
    const file = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selected.name.replace(/[^a-z0-9-_]+/gi, '-').toLocaleLowerCase() || 'aven-database'}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setError('');
    setNotice(t('db.exported', { n: visibleRecords.length }));
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
        if (isComputed(property)) throw new Error('Formula and rollup columns are calculated automatically and cannot be imported.');
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
      setNotice(t('db.imported', { n: result.imported }));
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

  async function updateDatabase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`/workspaces/${workspace.id}/databases/${selected.id}`, {
        method: 'PATCH', body: JSON.stringify({ name: form.get('databaseName'), description: form.get('databaseDescription') }),
      });
      await reload();
      setNotice(t('db.detailsSaved'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update the database.'); }
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
        if (isComputed(property)) return [property.id, undefined];
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
        method: 'PATCH', body: JSON.stringify({ name: form.get('propertyName'), type: form.get('propertyType'), relatedDatabaseId: form.get('relatedDatabaseId'), formula: form.get('formula'), rollupRelationId: form.get('rollupRelationId'), rollupFunction: form.get('rollupFunction'), rollupPropertyId: form.get('rollupPropertyId') || undefined }),
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
    setDraft(editableValues(record.values));
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !editingId) return;
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/databases/${selected.id}/records/${editingId}`, {
        method: 'PATCH', body: JSON.stringify({ values: draft, baseUpdatedAt: selected.records.find((record) => record.id === editingId)?.updatedAt }),
      });
      setEditingId('');
      await reload();
    } catch (reason) {
      if ((reason as { status?: number }).status === 409) { setEditingId(''); setError('Someone else changed this record while you were editing. The latest version has been loaded—review it and edit again.'); await reload(); }
      else setError(reason instanceof Error ? reason.message : 'Could not update the record.');
    }
    finally { setBusy(false); }
  }

  async function deleteRecord(record: DatabaseRecord) {
    if (!selected) return;
    const titleProperty = selected.properties.find((property) => property.id === 'name') ?? selected.properties.find((property) => property.type === 'text');
    const title = String(record.values[titleProperty?.id ?? ''] ?? t('db.untitled'));
    if (!window.confirm(t('db.confirmDelete', { title }))) return;
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/databases/${selected.id}/records/${record.id}`, { method: 'DELETE' });
      if (editingId === record.id) setEditingId('');
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete the record.'); }
    finally { setBusy(false); }
  }

  async function duplicateRecord(record: DatabaseRecord) {
    if (!selected) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`/workspaces/${workspace.id}/databases/${selected.id}/records/${record.id}/duplicate`, { method: 'POST' });
      await reload();
      setNotice(t('db.duplicated'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not duplicate the record.'); }
    finally { setBusy(false); }
  }

  async function bulkApply(clear: boolean) {
    if (!selected || !bulkProperty || !activeSelection.length) return;
    let value: string | number | boolean | null = null;
    if (!clear) {
      if (bulkProperty.type === 'number') { value = Number(bulkValue); if (!Number.isFinite(value)) { setError('Enter a valid number.'); return; } }
      else if (bulkProperty.type === 'checkbox') value = bulkValue === 'true';
      else value = bulkValue;
    } else if (bulkProperty.id === 'name') { setError('Record names cannot be cleared.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`/workspaces/${workspace.id}/databases/${selected.id}/records/bulk-update`, { method: 'POST', body: JSON.stringify({ recordIds: activeSelection, values: { [bulkProperty.id]: value } }) });
      setNotice(activeSelection.length === 1 ? t('db.updatedOne') : t('db.updatedN', { n: activeSelection.length }));
      setSelectedIds([]); setBulkValue('');
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update the selected records.'); }
    finally { setBusy(false); }
  }

  async function bulkDelete() {
    if (!selected || !activeSelection.length) return;
    if (!window.confirm(activeSelection.length === 1 ? t('db.confirmBulkOne') : t('db.confirmBulkN', { n: activeSelection.length }))) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`/workspaces/${workspace.id}/databases/${selected.id}/records/bulk-delete`, { method: 'POST', body: JSON.stringify({ recordIds: activeSelection }) });
      setNotice(activeSelection.length === 1 ? t('db.deletedOne') : t('db.deletedN', { n: activeSelection.length }));
      setSelectedIds([]);
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete the selected records.'); }
    finally { setBusy(false); }
  }

  async function moveBoardRecord(recordId: string, nextStatus: string) {
    if (!selected || !boardPropertyId) return;
    const record = selected.records.find((item) => item.id === recordId);
    if (!record || record.values[boardPropertyId] === nextStatus) return;
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/databases/${selected.id}/records/${record.id}`, {
        method: 'PATCH', body: JSON.stringify({ values: { ...editableValues(record.values), [boardPropertyId]: nextStatus === 'No status' ? null : nextStatus }, baseUpdatedAt: record.updatedAt }),
      });
      await reload();
    } catch (reason) {
      if ((reason as { status?: number }).status === 409) { setError('Someone else changed this record. The latest version has been loaded—try the move again.'); await reload(); }
      else setError(reason instanceof Error ? reason.message : 'Could not move this record.');
    }
    finally { setBusy(false); }
  }

  return (
    <div className="workspace-section-page connected-page database-page">
      <PageHeader eyebrow={t('act.eyebrow', { name: workspace.name })} title={t('nav.databases')} description={t('db.desc')} />
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <div className="database-toolbar">
        <label className="database-picker">{t('db.workspaceDb')}<span><span className="rd-tile rd-tile--sm"><Icon name="database" size={18} /></span><select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setEditingId(''); setSelectedViewId(''); setFilterQuery(''); setSortPropertyId('updatedAt'); setSortDirection('desc'); setViewLayout('TABLE'); setGroupByPropertyId('status'); setCalendarDatePropertyId(''); setChartPropertyId(''); }} disabled={!databases.length}>
          {databases.length ? databases.map((database) => <option key={database.id} value={database.id}>{database.name}</option>) : <option value="">{t('db.createFirst')}</option>}
        </select></span></label>
        <span>{selected ? t(selected.records.length === 1 ? 'db.recordOne' : 'db.recordMany', { n: selected.records.length }) : t('db.startSimple')}</span>
      </div>

      <div className="database-layout">
        <form className="productivity-form database-create" onSubmit={createDatabase}>
          <h2><span className="rd-tile rd-tile--lg"><Icon name="database" size={26} /></span>{t('db.createTitle')}</h2>
          <p>{t('db.createHint')}</p>
          <label>{t('db.name')}<input name="name" required maxLength={160} placeholder={t('db.namePh')} /></label>
          <label>{t('db.description')} <span>{t('doc.optional')}</span><textarea name="description" rows={4} maxLength={500} placeholder={t('db.descPh')} /></label>
          <button type="submit" disabled={busy}>{busy ? t('set.saving') : <><Icon name="plus" size={18} />{t('db.create')}</>}</button>
        </form>

        <section className="database-table-card" aria-label={selected?.name ?? t('db.recordsAria')}>
          {loading ? <p className="productivity-message">{t('db.loading')}</p> : !selected ? (
            <div className="database-empty"><span aria-hidden="true">▤</span><h2>{t('db.firstTable')}</h2><p>{t('db.firstTableHint')}</p></div>
          ) : <>
            <div className="database-table-heading"><div><p className="workspace-eyebrow">{t('db.viewWord', { layout: t(`db.l.${viewLayout.toLowerCase()}` as Key).toLocaleUpperCase() })}</p><h2>{selected.name} <FavouriteStar kind="DATABASE" entityId={selected.id} /></h2><p>{selected.description || t('db.defaultDesc')}</p></div><span className="rd-pill rd-pill--sand">{t('db.recordMany', { n: selected.records.length })}</span></div>
            <form className="database-add-property" key={`${selected.id}:${selected.name}:${selected.description ?? ''}`} onSubmit={updateDatabase} aria-label={t('db.editDetails')}>
              <label>{t('db.name')}<input name="databaseName" required maxLength={160} defaultValue={selected.name} /></label>
              <label>{t('db.description')}<input name="databaseDescription" maxLength={500} defaultValue={selected.description ?? ''} /></label>
              <button type="submit" disabled={busy}>{busy ? t('set.saving') : t('db.saveDetails')}</button>
            </form>
            <form className="database-add-property" onSubmit={createProperty}>
              <label>{t('db.newProperty')}<input name="propertyName" required maxLength={80} placeholder={t('db.propertyPh')} /></label>
              <label>{t('db.type')}<select name="propertyType" value={newPropertyType} onChange={(event) => setNewPropertyType(event.target.value)}>{propertyTypes.map((type) => <option key={type.value} value={type.value}>{t(type.label)}</option>)}</select></label>
              {newPropertyType === 'relation' && <label>{t('db.relatedDb')}<select name="relatedDatabaseId" required defaultValue=""><option value="" disabled>{t('db.chooseDb')}</option>{databases.filter((database) => database.id !== selected.id).map((database) => <option key={database.id} value={database.id}>{database.name}</option>)}</select></label>}
              {newPropertyType === 'formula' && <label className="database-formula-input">{t('db.formula')}<input name="formula" required maxLength={500} placeholder="[Quantity] * [Unit price]" /><small>{t('db.formulaHint')}</small></label>}
              {newPropertyType === 'rollup' && (rollupRelations.length === 0 ? <p className="database-rollup-hint">{t('db.rollupHint')}</p> : <>
                <label>{t('db.relation')}<select name="rollupRelationId" required value={rollupRelationId} onChange={(event) => setRollupRelationId(event.target.value)}><option value="" disabled>{t('db.chooseRelation')}</option>{rollupRelations.map((relation) => <option key={relation.id} value={relation.id}>{relation.name}</option>)}</select></label>
                <label>{t('db.summarise')}<select name="rollupFunction" value={rollupFunction} onChange={(event) => setRollupFunction(event.target.value)}>{rollupFunctionLabels.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
                {rollupFunction !== 'count' && <label>{t('db.numberProperty')}<select name="rollupPropertyId" required defaultValue=""><option value="" disabled>{rollupTargets.length ? t('db.chooseProperty') : t('db.noNumberProps')}</option>{rollupTargets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></label>}
              </>)}
              <button type="submit" disabled={busy}>{busy ? t('db.adding') : <><Icon name="plus" size={16} />{t('db.addProperty')}</>}</button>
            </form>
            <div className="database-view-controls" aria-label={t('db.viewControls')}>
              <label>{t('db.savedView')}<select value={selectedViewId} onChange={(event) => applyView(event.target.value)}><option value="">{t('db.customView')}</option>{selected.views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}</select></label>
              <label>{t('db.layout')}<select value={viewLayout} onChange={(event) => { const layout = event.target.value as ViewLayout; setViewLayout(layout); setSelectedViewId(''); if ((layout === 'CALENDAR' || layout === 'TIMELINE') && !calendarDatePropertyId) setCalendarDatePropertyId(dateProperties[0]?.id ?? ''); }}><option value="TABLE">{t('db.l.table')}</option><option value="LIST">{t('db.l.list')}</option><option value="BOARD" disabled={!statusProperties.length}>{t('db.l.board')}</option><option value="GALLERY">{t('db.l.gallery')}</option><option value="CALENDAR" disabled={!dateProperties.length}>{t('db.l.calendar')}</option><option value="TIMELINE" disabled={!dateProperties.length}>{t('db.l.timeline')}</option><option value="CHART" disabled={!statusProperties.length}>{t('db.l.chart')}</option></select></label>
              {(viewLayout === 'BOARD' || viewLayout === 'CHART') && <label>{t('db.groupBy')}<select value={boardPropertyId} onChange={(event) => { setGroupByPropertyId(event.target.value); setSelectedViewId(''); }}>{statusProperties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>}
              {(viewLayout === 'CALENDAR' || viewLayout === 'TIMELINE') && <label>{t('db.calendarDate')}<select value={calendarPropertyId} onChange={(event) => { setCalendarDatePropertyId(event.target.value); setSelectedViewId(''); }}>{dateProperties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>}
              {viewLayout === 'CHART' && <label>{t('db.measure')}<select value={chartValuePropertyId} onChange={(event) => { setChartPropertyId(event.target.value); setSelectedViewId(''); }}><option value="">{t('db.recordCount')}</option>{numericProperties.map((property) => <option key={property.id} value={property.id}>{t('db.sumOf', { name: property.name })}</option>)}</select></label>}
              <label>{t('db.filter')}<input type="search" value={filterQuery} onChange={(event) => { setFilterQuery(event.target.value); setSelectedViewId(''); }} placeholder={t('db.filterPh')} /></label>
              <label>{t('db.sortBy')}<select value={sortPropertyId} onChange={(event) => { setSortPropertyId(event.target.value); setSelectedViewId(''); }}>
                <option value="updatedAt">{t('db.updated')}</option>
                {selected.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select></label>
              <label>{t('db.order')}<select value={sortDirection} onChange={(event) => { setSortDirection(event.target.value as 'asc' | 'desc'); setSelectedViewId(''); }}><option value="asc">{t('db.asc')}</option><option value="desc">{t('db.desc2')}</option></select></label>
              <span className="database-view-count">{filterQuery.trim() ? t('db.countOf', { shown: visibleRecords.length, total: selected.records.length }) : t('db.recordMany', { n: selected.records.length })}</span>
              <button type="button" className={`database-relation-toggle${showRelationMap ? ' is-active' : ''}`} onClick={() => setShowRelationMap((current) => !current)}><Icon name="link" size={16} />{t('db.relations')}</button>
            </div>
            {showRelationMap && <section className="database-relation-map" aria-label={t('db.relationMap')}>
              <div className="database-relation-map__node is-current"><span>{t('db.thisDb')}</span><strong>{selected.name}</strong><small>{t('db.recordMany', { n: selected.records.length })}</small></div>
              {selected.properties.filter((property) => property.type === 'relation').map((property) => {
                const related = databases.find((database) => database.id === property.relatedDatabaseId);
                const links = selected.records.reduce((total, record) => total + (Array.isArray(record.values[property.id]) ? (record.values[property.id] as string[]).length : 0), 0);
                return <div className="database-relation-map__edge" key={property.id}><span aria-hidden="true">⟶</span><div><small>{t('db.links', { name: property.name, n: links })}</small><div className="database-relation-map__node"><span>{t('db.relatedDbCaps')}</span><strong>{related?.name ?? t('db.unavailable')}</strong><small>{t('db.recordMany', { n: related?.records.length ?? 0 })}</small></div></div></div>;
              })}
              {!selected.properties.some((property) => property.type === 'relation') && <p className="database-gallery-empty">{t('db.addRelationHint')}</p>}
            </section>}
            {notice && <p className="database-import-notice" role="status">{notice}</p>}
            <form className="database-csv-tools" onSubmit={importCsv}>
              <span className="rd-tile"><Icon name="upload" size={20} /></span><label>{t('db.importCsv')}<input name="csvFile" type="file" accept=".csv,text/csv" required /></label>
              <button type="submit" disabled={busy}>{busy ? t('db.importing') : <><Icon name="download" size={16} />{t('db.importRows')}</>}</button>
              <button type="button" onClick={exportCsv} disabled={busy}><Icon name="upload" size={16} />{t('db.exportVisible', { n: visibleRecords.length })}</button>
              <small>{t('db.csvHint')}</small>
            </form>
            <form className="database-save-view" onSubmit={saveCurrentView}>
              <label>{t('db.saveView')}<input value={viewName} onChange={(event) => setViewName(event.target.value)} required maxLength={80} placeholder={t('db.viewNamePh')} /></label>
              <button type="submit" disabled={busy || ((viewLayout === 'BOARD' || viewLayout === 'CHART') && !boardPropertyId) || ((viewLayout === 'CALENDAR' || viewLayout === 'TIMELINE') && !calendarPropertyId)}>{busy ? t('set.saving') : t('db.saveViewBtn')}</button>
              {selectedView && <button type="button" disabled={busy} onClick={() => void deleteSelectedView()}>{t('db.deleteView', { name: selectedView.name })}</button>}
            </form>
            {viewLayout === 'LIST' ? <div className="database-list" aria-label={t('db.recordList')}>
              {visibleRecords.map((record) => {
                const titleProperty = selected.properties.find((property) => property.id === 'name') ?? selected.properties.find((property) => property.type === 'text') ?? selected.properties[0];
                return <article className="database-list__row" key={record.id}>
                  <div><h3>{String(record.values[titleProperty?.id ?? ''] ?? t('db.untitled'))}</h3><p>{selected.properties.filter((property) => property.id !== titleProperty?.id).slice(0, 3).map((property) => `${property.name}: ${propertyValueLabel(property, record.values[property.id])}`).join(' · ')}</p></div>
                  <time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(record.updatedAt))}</time>
                </article>;
              })}
              {!visibleRecords.length && <p className="database-gallery-empty">{selected.records.length ? t('db.noMatch') : t('db.addToSee')}</p>}
            </div> : viewLayout === 'CHART' && boardPropertyId ? <section className="database-chart" aria-label={t('db.statusChart')}>
              <div className="database-chart__heading"><h3>{chartValuePropertyId ? t('db.sumOf', { name: numericProperties.find((property) => property.id === chartValuePropertyId)?.name ?? '' }) : t('db.recordCount')}</h3><span>{t('db.by', { name: statusProperties.find((property) => property.id === boardPropertyId)?.name ?? '' })}</span></div>
              <div className="database-chart__rows">{chartValues.map((item) => <div className="database-chart__row" key={item.group}>
                <span>{item.group}</span><div><i style={{ width: `${(item.value / maxChartValue) * 100}%` }} /></div><strong>{item.value}{chartValuePropertyId ? '' : ` / ${item.count}`}</strong>
              </div>)}</div>
              {!visibleRecords.length && <p className="database-gallery-empty">{selected.records.length ? t('db.noMatch') : t('db.addToSee')}</p>}
            </section> : viewLayout === 'TIMELINE' && calendarPropertyId ? <section className="database-timeline" aria-label={t('db.timeline')}>
              <header className="database-calendar__header">
                <button type="button" aria-label={t('db.prevMonth')} onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button>
                <h3>{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(calendarMonth)}</h3>
                <button type="button" aria-label={t('db.nextMonth')} onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button>
              </header>
              {(() => {
                const monthKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}`;
                const monthDays = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
                const records = visibleRecords.filter((record) => calendarDateKey(record.values[calendarPropertyId]).startsWith(`${monthKey}-`)).sort((left, right) => calendarDateKey(left.values[calendarPropertyId]).localeCompare(calendarDateKey(right.values[calendarPropertyId])));
                const ticks = [...new Set([1, 8, 15, 22, monthDays])];
                const titleProperty = selected.properties.find((property) => property.id === 'name') ?? selected.properties.find((property) => property.type === 'text') ?? selected.properties[0];
                return <>
                  <div className="database-timeline__axis"><span>{selected.properties.find((property) => property.id === calendarPropertyId)?.name}</span><div>{ticks.map((day) => <time key={day} style={{ left: `${((day - 1) / Math.max(1, monthDays - 1)) * 100}%` }}>{day}</time>)}</div><span>{t('db.date')}</span></div>
                  {records.map((record) => {
                    const dateKey = calendarDateKey(record.values[calendarPropertyId]);
                    const day = Number(dateKey.slice(-2));
                    return <div className="database-timeline__row" key={record.id}>
                      <strong>{String(record.values[titleProperty?.id ?? ''] ?? t('db.untitled'))}</strong>
                      <div className="database-timeline__track"><i style={{ left: `${((day - 1) / Math.max(1, monthDays - 1)) * 100}%` }} /></div>
                      <time dateTime={dateKey}>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${dateKey}T12:00:00`))}</time>
                    </div>;
                  })}
                  {!records.length && <p className="database-gallery-empty">{selected.records.length ? t('db.noDated') : t('db.addDated')}</p>}
                </>;
              })()}
            </section> : viewLayout === 'GALLERY' ? <div className="database-gallery" aria-label={t('db.gallery')}>
              {visibleRecords.map((record) => {
                const titleProperty = selected.properties.find((property) => property.id === 'name') ?? selected.properties.find((property) => property.type === 'text') ?? selected.properties[0];
                return <article className="database-gallery-card" key={record.id}>
                  <div className="database-gallery-card__cover" aria-hidden="true"><span>AVEN</span></div>
                  <div className="database-gallery-card__content">
                    <h3>{String(record.values[titleProperty?.id ?? ''] ?? t('db.untitled'))}</h3>
                    <div className="database-gallery-card__fields">{selected.properties.filter((property) => property.id !== titleProperty?.id).slice(0, 4).map((property) => <p key={property.id}><span>{property.name}</span>{property.type === 'checkbox' ? (record.values[property.id] ? t('db.yes') : t('db.no')) : propertyValueLabel(property, record.values[property.id])}</p>)}</div>
                    <small>{t('db.updatedOn', { date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(record.updatedAt)) })}</small>
                  </div>
                </article>;
              })}
              {!visibleRecords.length && <p className="database-gallery-empty">{selected.records.length ? t('db.noMatch') : t('db.addToSee')}</p>}
            </div> : viewLayout === 'CALENDAR' && calendarPropertyId ? <section className="database-calendar" aria-label={t('db.calendarAria')}>
              <header className="database-calendar__header">
                <button type="button" aria-label={t('db.prevMonth')} onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button>
                <h3>{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(calendarMonth)}</h3>
                <button type="button" aria-label={t('db.nextMonth')} onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button>
              </header>
              <div className="database-calendar__weekdays">{(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const).map((day) => <span key={day}>{t(`cal.wd.${day}` as Key)}</span>)}</div>
              <div className="database-calendar__grid">{calendarDays.map((day) => {
                const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                const recordsForDay = visibleRecords.filter((record) => calendarDateKey(record.values[calendarPropertyId]) === key);
                const titleProperty = selected.properties.find((property) => property.id === 'name') ?? selected.properties.find((property) => property.type === 'text');
                return <section className={`database-calendar__day${day.getMonth() !== calendarMonth.getMonth() ? ' is-outside' : ''}`} key={key}>
                  <time dateTime={key}>{day.getDate()}</time>
                  <div>{recordsForDay.map((record) => <article className="database-calendar__record" key={record.id} title={String(record.values[titleProperty?.id ?? ''] ?? t('db.untitled'))}>
                    <strong>{String(record.values[titleProperty?.id ?? ''] ?? t('db.untitled'))}</strong>
                    {statusProperties[0] && <small>{String(record.values[statusProperties[0].id] ?? t('db.noStatus'))}</small>}
                  </article>)}</div>
                </section>;
              })}</div>
            </section> : viewLayout === 'BOARD' && boardPropertyId ? <div className="database-board" aria-label={t('db.boardAria')}>
              {boardGroups.map((group) => {
                const groupRecords = visibleRecords.filter((record) => String(record.values[boardPropertyId] ?? 'No status') === group);
                return <section className="database-board-column" key={group} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const recordId = event.dataTransfer.getData('text/plain'); if (recordId) void moveBoardRecord(recordId, group); }}>
                  <header><h3>{group}</h3><span>{groupRecords.length}</span></header>
                  <div className="database-board-cards">{groupRecords.map((record) => <article className="database-board-card" key={record.id} draggable={!busy} onDragStart={(event) => event.dataTransfer.setData('text/plain', record.id)}>
                    <strong>{String(record.values.name ?? record.values[boardPropertyId] ?? t('db.untitled'))}</strong>
                    {selected.properties.filter((property) => property.id !== 'name' && property.id !== boardPropertyId).slice(0, 3).map((property) => <p key={property.id}><span>{property.name}</span>{propertyValueLabel(property, record.values[property.id])}</p>)}
                  </article>)}</div>
                </section>;
              })}
            </div> : <>
              {activeSelection.length > 0 && <div className="database-bulk-bar" role="region" aria-label={t('db.bulkAria')}>
                <strong>{t('db.selected', { n: activeSelection.length })}</strong>
                <label>{t('db.set')}<select value={bulkProperty?.id ?? ''} onChange={(event) => { setBulkPropertyId(event.target.value); setBulkValue(''); }}>{bulkProperties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
                {bulkProperty?.type === 'status' ? <select aria-label={t('db.newValue')} value={bulkValue} onChange={(event) => setBulkValue(event.target.value)}><option value="">{t('db.chooseStatus')}</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
                  : bulkProperty?.type === 'checkbox' ? <select aria-label={t('db.newValue')} value={bulkValue} onChange={(event) => setBulkValue(event.target.value)}><option value="">{t('db.choose')}</option><option value="true">{t('db.yes')}</option><option value="false">{t('db.no')}</option></select>
                  : <input aria-label={t('db.newValue')} type={bulkProperty?.type === 'number' ? 'number' : bulkProperty?.type === 'date' ? 'date' : 'text'} value={bulkValue} maxLength={bulkProperty?.type === 'text' ? 2000 : undefined} onChange={(event) => setBulkValue(event.target.value)} />}
                <button type="button" disabled={busy || !bulkProperty || bulkValue === ''} onClick={() => void bulkApply(false)}>{t('db.apply')}</button>
                <button type="button" disabled={busy || !bulkProperty} onClick={() => void bulkApply(true)}>{t('db.clearValue')}</button>
                <button type="button" className="database-bulk-delete" disabled={busy} onClick={() => void bulkDelete()}>{t('db.deleteSelected')}</button>
                <button type="button" onClick={() => setSelectedIds([])}>{t('db.clearSelection')}</button>
              </div>}
              <div className="database-table-scroll"><table className="database-table"><thead><tr><th><input type="checkbox" aria-label={t('db.selectAll')} checked={visibleRecords.length > 0 && visibleRecords.every((record) => selectedIds.includes(record.id))} onChange={(event) => setSelectedIds(event.target.checked ? visibleRecords.map((record) => record.id) : [])} /></th>{selected.properties.map((property) => <th key={property.id}>{property.name}</th>)}<th>{t('db.updated')}</th><th><span className="sr-only">{t('db.actions')}</span></th></tr></thead>
              <tbody>
                {visibleRecords.map((record) => <tr key={record.id}>
                  <td className="database-select"><input type="checkbox" aria-label={t('db.selectRecord')} checked={selectedIds.includes(record.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, record.id] : current.filter((id) => id !== record.id))} /></td>
                  {editingId === record.id ? <>
                    {selected.properties.map((property) => <td key={property.id}>{isComputed(property) ? <span className="database-formula-value">{property.type === 'rollup' ? 'Σ' : 'ƒ'} {propertyValueLabel(property, record.values[property.id])}</span> : property.type === 'relation' ? <select aria-label={property.name} multiple size={3} value={Array.isArray(draft[property.id]) ? draft[property.id] as string[] : []} onChange={(event) => setDraft((current) => ({ ...current, [property.id]: Array.from(event.target.selectedOptions, (option) => option.value) }))}>{(databases.find((database) => database.id === property.relatedDatabaseId)?.records ?? []).map((target) => <option key={target.id} value={target.id}>{String(target.values.name ?? 'Untitled record')}</option>)}</select> : property.type === 'status' ? <select aria-label={property.name} value={String(draft[property.id] ?? '')} onChange={(event) => setDraft((current) => ({ ...current, [property.id]: event.target.value || null }))}><option value="">{t('db.chooseStatus')}</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select> : property.type === 'checkbox' ? <input aria-label={property.name} type="checkbox" checked={Boolean(draft[property.id])} onChange={(event) => setDraft((current) => ({ ...current, [property.id]: event.target.checked }))} /> : <input aria-label={property.name} type={property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : 'text'} value={draft[property.id] == null ? '' : String(draft[property.id])} maxLength={property.type === 'text' ? 2000 : undefined} onChange={(event) => setDraft((current) => ({ ...current, [property.id]: event.target.value === '' ? null : property.type === 'number' ? Number(event.target.value) : event.target.value }))} />}</td>)}
                    <td>{t('db.editing')}</td><td><form className="database-row-actions" onSubmit={saveRecord}><button type="submit" disabled={busy}>{t('db.save')}</button><button type="button" onClick={() => setEditingId('')}>{t('db.cancel')}</button></form></td>
                  </> : <>
                    {selected.properties.map((property) => <td key={property.id}>{property.type === 'status' ? <span className="database-status">{String(record.values[property.id] ?? '—')}</span> : property.type === 'checkbox' ? (record.values[property.id] ? t('db.yes') : t('db.no')) : propertyValueLabel(property, record.values[property.id])}</td>)}
                    <td>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(record.updatedAt))}</td><td><div className="database-row-actions"><button className="database-row-edit" type="button" onClick={() => startEdit(record)}><Icon name="edit" size={15} />{t('db.edit')}</button><button className="database-row-edit" type="button" onClick={() => void duplicateRecord(record)} disabled={busy}><Icon name="copy" size={15} />{t('db.duplicate')}</button><button className="database-row-edit" type="button" onClick={() => void deleteRecord(record)} disabled={busy}><Icon name="trash" size={15} />{t('db.delete')}</button></div></td>
                  </>}
                </tr>)}
                {!selected.records.length && <tr><td colSpan={selected.properties.length + 3} className="database-table-empty">{t('db.emptyTable')}</td></tr>}
                {selected.records.length > 0 && !visibleRecords.length && <tr><td colSpan={selected.properties.length + 3} className="database-table-empty">{t('db.noMatch')}</td></tr>}
              </tbody></table></div></>}
            <form className="database-add-record" onSubmit={createRecord}>
              {selected.properties.filter((property) => !isComputed(property)).map((property) => <label key={property.id}>{property.name}{property.type === 'relation' ? <select name={property.id} multiple size={3}>{(databases.find((database) => database.id === property.relatedDatabaseId)?.records ?? []).map((target) => <option key={target.id} value={target.id}>{String(target.values.name ?? 'Untitled record')}</option>)}</select> : property.type === 'status' ? <select name={property.id} defaultValue={property.id === 'status' ? 'Planning' : ''}><option value="">{t('db.chooseStatus')}</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select> : property.type === 'checkbox' ? <input name={property.id} type="checkbox" /> : <input name={property.id} type={property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : 'text'} maxLength={property.type === 'text' ? 2000 : undefined} placeholder={property.id === 'name' ? t('db.recordNamePh') : undefined} required={property.id === 'name'} />}</label>)}
              <button type="submit" disabled={busy}>{busy ? t('db.adding') : t('db.addRecord')}</button>
            </form>
          </>}
        </section>
      </div>
    </div>
  );
}
