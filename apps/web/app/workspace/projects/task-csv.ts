export type TaskImportRow = { id?: string | null; title: string; description: string | null; status: string; priority: string; startAt?: string | null; dueAt: string | null; labels: string[]; projectId?: string | null; assigneeId?: string | null };

export function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function restoreCsvText(value: string) {
  return value.replace(/^'(?=[=+\-@\t\r])/, '');
}


export function parseTaskCsv(source: string): TaskImportRow[] {
  const text = source.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell.length === 0) quoted = true;
    else if (character === ',') { row.push(cell); cell = ''; }
    else if (character === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (character !== '\r') cell += character;
  }
  if (quoted) throw new Error('This CSV has an unclosed quoted field.');
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const nonEmpty = rows.filter((current) => current.some((value) => value.trim()));
  if (nonEmpty.length < 2) throw new Error('The CSV needs a header row and at least one task.');
  const headers = nonEmpty[0].map((header) => header.trim().toLocaleLowerCase());
  const titleIndex = headers.indexOf('title');
  if (titleIndex < 0) throw new Error('The CSV is missing the required title column.');
  if (new Set(headers).size !== headers.length) throw new Error('The CSV contains duplicate column names.');
  const hasIdColumn = headers.includes('id');
  if (hasIdColumn) {
    const requiredRoundTripColumns = ['id', 'title', 'description', 'status', 'priority', 'dueat', 'projectid', 'assigneeid', 'labels'];
    const missingColumns = requiredRoundTripColumns.filter((header) => !headers.includes(header));
    if (missingColumns.length) throw new Error(`AVEN task sync requires all export columns. Missing: ${missingColumns.join(', ')}.`);
  }
  if (nonEmpty.length - 1 > 200) throw new Error('Import no more than 200 tasks at a time.');
  const valueAt = (values: string[], name: string) => { const index = headers.indexOf(name.toLocaleLowerCase()); return index < 0 ? '' : restoreCsvText(values[index]?.trim() ?? ''); };
  const statuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'CANCELLED'];
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  const seenIds = new Set<string>();
  return nonEmpty.slice(1).map((values, index) => {
    if (values.length > headers.length) throw new Error(`Row ${index + 2} has more values than the header row.`);
    const id = valueAt(values, 'id') || null;
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error(`Task ID on row ${index + 2} is not a valid UUID.`);
    if (id && seenIds.has(id.toLocaleLowerCase())) throw new Error(`Task ID on row ${index + 2} appears more than once.`);
    if (id) seenIds.add(id.toLocaleLowerCase());
    const title = valueAt(values, 'title');
    const description = valueAt(values, 'description');
    const rawStatus = valueAt(values, 'status').toLocaleUpperCase() || 'TODO';
    const rawPriority = valueAt(values, 'priority').toLocaleUpperCase() || 'MEDIUM';
    const dueAt = valueAt(values, 'dueAt') || null;
    if (!title || title.length > 200) throw new Error(`Task on row ${index + 2} needs a title of 1–200 characters.`);
    if (description.length > 5000) throw new Error(`Description on row ${index + 2} is longer than 5,000 characters.`);
    if (!statuses.includes(rawStatus)) throw new Error(`Status on row ${index + 2} must be TODO, IN_PROGRESS, IN_REVIEW, COMPLETED, or CANCELLED.`);
    if (!priorities.includes(rawPriority)) throw new Error(`Priority on row ${index + 2} must be LOW, MEDIUM, HIGH, or URGENT.`);
    if (dueAt && !Number.isFinite(Date.parse(dueAt))) throw new Error(`Due date on row ${index + 2} is not a valid date.`);
    const startAt = valueAt(values, 'startAt') || null;
    if (startAt && !Number.isFinite(Date.parse(startAt))) throw new Error(`Start date on row ${index + 2} is not a valid date.`);
    if (startAt && dueAt && Date.parse(startAt) > Date.parse(dueAt)) throw new Error(`Start date on row ${index + 2} is after its due date.`);
    const labels = valueAt(values, 'labels').split(';').map((label) => label.trim().toLocaleLowerCase()).filter(Boolean);
    if (labels.length > 10 || labels.some((label) => label.length > 32 || !/^[\p{L}\p{N}_-]+$/u.test(label))) throw new Error(`Labels on row ${index + 2} must be up to 10 short words using letters, numbers, underscores, or hyphens.`);
    const result: TaskImportRow = { id, title, description: description || null, status: rawStatus, priority: rawPriority, dueAt, labels: [...new Set(labels)] };
    if (headers.includes('startat')) result.startAt = startAt;
    if (headers.includes('projectid')) result.projectId = valueAt(values, 'projectid') || null;
    if (headers.includes('assigneeid')) result.assigneeId = valueAt(values, 'assigneeid') || null;
    return result;
  });
}
