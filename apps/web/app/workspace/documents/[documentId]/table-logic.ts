// Filtering, sorting and grouping of the records shown in a database block. Pure functions, so they are tested without a browser.
export type TableProperty = { id: string; name: string; type: string };
export type TableRecord = { id: string; values: Record<string, unknown> };
export type Sort = { property: string; direction: 'asc' | 'desc' } | null;

/** What a cell shows as text, for searching and for the group headings. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(cellText).join(', ');
  return String(value);
}

/** Keeps the records where any cell contains the words typed (all words must match somewhere in the row), ignoring case. */
export function filterRecords(records: TableRecord[], properties: TableProperty[], query: string): TableRecord[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return records;
  return records.filter((record) => { const row = properties.map((property) => cellText(record.values[property.id])).join(' ').toLocaleLowerCase(); return words.every((word) => row.includes(word)); });
}

/** Sorts a copy of the records by one property: numbers as numbers, dates and text in order, empty cells last in either direction. */
export function sortRecords(records: TableRecord[], properties: TableProperty[], sort: Sort): TableRecord[] {
  if (!sort) return records;
  const type = properties.find((property) => property.id === sort.property)?.type;
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...records].sort((a, b) => {
    const x = a.values[sort.property], y = b.values[sort.property];
    const emptyX = x === undefined || x === null || x === '', emptyY = y === undefined || y === null || y === '';
    if (emptyX || emptyY) return emptyX === emptyY ? 0 : emptyX ? 1 : -1;
    if (type === 'number') return (Number(x) - Number(y)) * factor;
    if (type === 'checkbox') return (Number(x === true) - Number(y === true)) * factor;
    return cellText(x).localeCompare(cellText(y), undefined, { numeric: true, sensitivity: 'base' }) * factor;
  });
}

/** Splits records into groups by the text of one property, in the order the values first appear; records without a value go last. */
export function groupRecords(records: TableRecord[], property: string | null): { label: string; records: TableRecord[] }[] {
  if (!property) return [{ label: '', records }];
  const groups = new Map<string, TableRecord[]>();
  for (const record of records) { const label = cellText(record.values[property]); groups.set(label, [...(groups.get(label) ?? []), record]); }
  const empty = groups.get(''); groups.delete('');
  return [...groups].map(([label, list]) => ({ label, records: list })).concat(empty ? [{ label: '', records: empty }] : []);
}

/** The value to store for an edit of one cell, from what the control reports. */
export function cellValue(type: string, raw: string | boolean): string | number | boolean | null {
  if (type === 'checkbox') return raw === true;
  const text = String(raw);
  if (type === 'number') { if (text.trim() === '') return null; const number = Number(text); return Number.isFinite(number) ? number : null; }
  return text;
}
