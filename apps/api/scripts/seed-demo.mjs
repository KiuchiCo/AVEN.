// Fills every workspace in the local database with fake (but varied) data so screens can be checked with realistic content.
//   node --experimental-strip-types scripts/seed-demo.mjs            add demo data to every workspace that has none
//   node --experimental-strip-types scripts/seed-demo.mjs --remove   delete exactly what this script added
// Every row it creates is recorded in scripts/.seed-demo-manifest.json, so removal never touches your own data.
// Not covered: files (they need stored bytes), AI conversations, billing, calendar connections.
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';

const manifestPath = fileURLToPath(new URL('./.seed-demo-manifest.json', import.meta.url));
const envText = readFileSync(fileURLToPath(new URL('../../../.env', import.meta.url)), 'utf8');
const databaseUrl = process.env.DATABASE_URL ?? /^DATABASE_URL=(.*)$/m.exec(envText)?.[1]?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL not found');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl.replace(/\?.*$/, '') }) });

const order = ['user', 'workspaceMember', 'workspaceInvite', 'project', 'projectMilestone', 'task', 'taskComment', 'taskChecklistItem', 'taskFollower', 'workspaceActivity', 'activityReceipt', 'calendarEvent', 'document', 'documentVersion', 'documentComment', 'knowledgeItem', 'workspaceDatabase', 'databaseRecord', 'databaseView', 'automationRule', 'automationRun', 'workflow', 'channel', 'channelMessage', 'whiteboard', 'projectTemplate', 'workspaceTaskView', 'favourite'];

if (process.argv.includes('--remove')) {
  if (!existsSync(manifestPath)) { console.log('Nothing to remove (no manifest).'); process.exit(0); }
  const made = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const model of [...order].reverse()) {
    const ids = made[model] ?? [];
    if (!ids.length) continue;
    if (model === 'task') await prisma.task.updateMany({ where: { id: { in: ids } }, data: { parentId: null } });
    if (model === 'channelMessage') await prisma.channelMessage.updateMany({ where: { id: { in: ids } }, data: { parentId: null } });
    const { count } = await prisma[model].deleteMany({ where: { id: { in: ids } } });
    console.log(`removed ${count} ${model}`);
  }
  unlinkSync(manifestPath); await prisma.$disconnect(); process.exit(0);
}
if (existsSync(manifestPath)) { console.log('Demo data is already seeded. Run with --remove first.'); process.exit(0); }

// Deterministic randomness so every run produces the same data.
let seed = 20261121; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (list) => list[Math.floor(rnd() * list.length)];
const day = 86_400_000; const now = Date.now();
// Task and project due dates are stored as UTC midnight (that is what the date pickers save), so the seed does the same.
const dayAt = (days) => { const d = new Date(now + days * day); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); };
const at = (days, hour = 10) => { const d = new Date(now + days * day); d.setHours(hour, Math.floor(rnd() * 4) * 15, 0, 0); return d; };

const made = {};
const mk = async (model, data) => { const row = await prisma[model].create({ data }); (made[model] ??= []).push(row.id); return row; };
const save = () => writeFileSync(manifestPath, JSON.stringify(made, null, 1));
process.on('exit', save); // even a crash part-way leaves a manifest, so --remove can clean up

const people = [
  ['Mayu Aoki', 'mayu.aoki@aven-demo.test', 'ADMINISTRATOR'], ['Riku Nakamura', 'riku.nakamura@aven-demo.test', 'MANAGER'],
  ['Sora Tanaka', 'sora.tanaka@aven-demo.test', 'MEMBER'], ['Léa Moreau', 'lea.moreau@aven-demo.test', 'MEMBER'], ['Daniel Okafor', 'daniel.okafor@aven-demo.test', 'GUEST'],
];
const users = [];
for (const [displayName, email] of people) users.push(await mk('user', { displayName, email }));

const blocks = (...items) => JSON.stringify({ format: 'aven-doc-v1', blocks: items.map(([type, text, checked = false], index) => ({ id: `b${index}-${randomBytes(4).toString('hex')}`, type, text, checked })) });
const labelsPool = ['design', 'frontend', 'backend', 'bug', 'research', 'urgent', 'marketing', 'qa', 'docs'];
const projectSpecs = [
  ['Website Redesign', 'IN_PROGRESS', 20, 2500000, 1100000, 'Refresh the marketing site: new layout, copy and performance budget.'],
  ['Mobile App Launch', 'PLANNING', 45, 4000000, 0, 'Ship the iOS and Android apps with store listings and onboarding.'],
  ['Q4 Marketing Campaign', 'ON_HOLD', -3, 1500000, 600000, 'Paused until the budget is confirmed. Overdue on purpose to test warnings.'],
  ['Customer Onboarding', 'COMPLETED', -20, 800000, 780000, 'A finished project whose tasks are all done.'],
  ['Legacy Migration', 'ARCHIVED', -60, null, 0, 'Archived project that should not appear in active lists.'],
  ['Empty Project (no tasks)', 'PLANNING', null, null, 0, null],
];
const taskTitles = ['Design homepage hero', 'Write launch announcement', 'Fix checkout bug on Safari', 'Set up analytics events', 'Review accessibility audit', 'Draft pricing page copy', 'Create onboarding emails', 'Prepare investor update', 'Refactor settings screen', 'Interview five customers', 'Update brand guidelines', 'Plan sprint retrospective', 'Migrate image CDN', 'Write API documentation', 'Test offline mode', 'Triage support backlog', 'Prototype whiteboard templates', 'Localise the app into French', 'Benchmark page speed', 'Order team swag'];
const longTitle = 'A deliberately very long task title to check wrapping, truncation and layout in tables, boards, cards, menus and notifications across every breakpoint — 日本語のテキストも含めます';

for (const workspace of await prisma.workspace.findMany({ include: { members: true } })) {
  const owner = workspace.members.find((member) => member.role === 'OWNER')?.userId ?? workspace.createdById;
  const demo = (index) => users[index % users.length];
  const everyone = [owner, ...users.map((user) => user.id)];
  for (const [index, [, , role]] of people.entries()) await mk('workspaceMember', { workspaceId: workspace.id, userId: users[index].id, role });
  for (const [email, role] of [['pending.one@aven-demo.test', 'MEMBER'], ['pending.two@aven-demo.test', 'GUEST']]) await mk('workspaceInvite', { workspaceId: workspace.id, createdById: users[0].id, email, role, tokenHash: createHash('sha256').update(randomBytes(16)).digest('hex'), expiresAt: at(7) });

  // Projects, milestones, tasks.
  const projects = []; const tasks = [];
  for (const [index, [name, status, dueIn, budget, spent, description]] of projectSpecs.entries()) {
    const project = await mk('project', { workspaceId: workspace.id, createdById: demo(index).id, name, status, description, dueAt: dueIn === null ? null : dayAt(dueIn), budgetTotalCents: budget, budgetSpentCents: spent });
    projects.push(project);
    for (const [m, title] of ['Kick-off', 'First draft', 'Launch'].entries()) if (name !== 'Empty Project (no tasks)') await mk('projectMilestone', { workspaceId: workspace.id, projectId: project.id, title, dueAt: at((dueIn ?? 10) - 14 + m * 7), completedAt: status === 'COMPLETED' || (m === 0 && status === 'IN_PROGRESS') ? at(-5) : null });
  }
  const statuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'CANCELLED']; const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  for (let i = 0; i < 42; i += 1) {
    const projectIndex = i % 5; const project = projects[projectIndex];
    const status = project.status === 'COMPLETED' ? 'COMPLETED' : i === 7 ? 'CANCELLED' : statuses[Math.floor(rnd() * 4)];
    const due = i % 6 === 0 ? null : Math.floor(rnd() * 40) - 12; // some overdue, some far, some none
    const assignee = i % 4 === 0 ? owner : i % 9 === 0 ? null : pick(users).id;
    const task = await mk('task', {
      workspaceId: workspace.id, projectId: i % 11 === 0 ? null : project.id, createdById: demo(i).id, assigneeId: assignee,
      title: i === 3 ? longTitle : `${taskTitles[i % taskTitles.length]}${i >= taskTitles.length ? ` (${Math.floor(i / taskTitles.length) + 1})` : ''}`,
      description: i % 3 === 0 ? null : 'Context and acceptance criteria go here. This is placeholder text to exercise multi-line descriptions in the task page and board cards.',
      status, priority: pick(priorities), labels: [...new Set([pick(labelsPool), ...(rnd() > 0.6 ? [pick(labelsPool)] : [])])], startAt: due === null ? null : dayAt(due - 5), dueAt: due === null ? null : dayAt(due), completedAt: status === 'COMPLETED' ? at(-Math.ceil(rnd() * 10)) : null,
      ...(i % 17 === 5 ? { recurrence: 'WEEKLY', recurrenceInterval: 1 } : {}),
    });
    tasks.push(task);
  }
  for (const [i, parent] of tasks.slice(0, 6).entries()) for (const j of [0, 1]) tasks.push(await mk('task', { workspaceId: workspace.id, projectId: parent.projectId, parentId: parent.id, createdById: demo(i).id, assigneeId: pick(users).id, title: `Subtask ${j + 1} of “${parent.title.slice(0, 30)}”`, status: j ? 'TODO' : 'COMPLETED', completedAt: j ? null : at(-2), priority: 'MEDIUM', labels: [] }));
  for (let i = 10; i < 20; i += 2) await prisma.task.update({ where: { id: tasks[i].id }, data: { dependsOn: { connect: { id: tasks[i - 4].id } } } });
  for (const [i, task] of tasks.slice(0, 16).entries()) {
    await mk('taskComment', { workspaceId: workspace.id, taskId: task.id, authorId: demo(i).id, body: i % 3 === 0 ? 'Looks good to me — shipping this after review.' : 'Can we confirm the scope before Friday? I have a few edge cases to raise.', mentionedUserIds: i % 4 === 0 ? [owner] : [] });
    for (const [p, title] of ['Draft', 'Review', 'Publish'].entries()) await mk('taskChecklistItem', { workspaceId: workspace.id, taskId: task.id, createdById: demo(i).id, title, position: p, completedAt: p < i % 3 ? at(-1) : null, completedById: p < i % 3 ? demo(i).id : null });
    await mk('taskFollower', { workspaceId: workspace.id, taskId: task.id, userId: owner }).catch(() => undefined);
  }

  // Activity with notification receipts for the owner (a mix of read and unread).
  const activityLines = [['TASK', (t) => `created task “${t.title}”`], ['TASK', (t) => `completed task “${t.title}”`], ['TASK_COMMENT', (t) => `commented on “${t.title}”`], ['TASK', (t) => `assigned “${t.title}” to you`]];
  for (let i = 0; i < 36; i += 1) {
    const task = tasks[i % tasks.length]; const [entityType, text] = activityLines[i % activityLines.length]; const created = new Date(now - i * 3.1 * 3600_000);
    const activity = await mk('workspaceActivity', { workspaceId: workspace.id, actorId: demo(i).id, entityType, entityId: task.id, message: text(task).slice(0, 240), createdAt: created });
    await mk('activityReceipt', { activityId: activity.id, userId: owner, isNotificationTarget: i % 3 !== 2, readAt: i % 4 === 0 ? null : created });
  }

  // Calendar.
  const eventSpecs = [['Weekly planning', 'MEETING', 1, 10, 1, 'WEEKLY'], ['Design review', 'MEETING', 2, 14, 1], ['Deep work block', 'FOCUS', 0, 9, 3], ['Dentist', 'PERSONAL', 3, 8, 1], ['Submit expenses', 'REMINDER', 4, 17, 0], ['Launch day', 'OTHER', 12, 0, 0], ['Customer call', 'MEETING', -2, 15, 1], ['Retro', 'MEETING', 6, 16, 1, 'MONTHLY']];
  for (const [i, [title, type, offset, hour, hours, recurrence]] of eventSpecs.entries()) { const start = at(offset, hour); await mk('calendarEvent', { workspaceId: workspace.id, projectId: projects[i % 3].id, title, type, isAllDay: title === 'Launch day', description: 'Demo event', location: i % 2 ? 'Meeting room 2' : 'Video call', startsAt: start, endsAt: hours ? new Date(start.getTime() + hours * 3600_000) : null, ...(recurrence ? { recurrence, recurrenceInterval: 1 } : {}) }); }

  // Documents, knowledge, databases.
  const docs = [];
  const docSpecs = [['Product requirements', blocks(['HEADING_1', 'Product requirements'], ['PARAGRAPH', 'This document describes what we are building and why.'], ['HEADING_2', 'Goals'], ['BULLET', 'Reduce time to first project'], ['BULLET', 'Make mobile a first-class experience'], ['TODO', 'Confirm scope with design', true], ['TODO', 'Write the rollout plan'], ['CALLOUT', 'Decisions are final once the review is signed off.'], ['CODE', 'GET /api/projects?status=active'], ['DIVIDER', ''], ['QUOTE', 'Simplicity is the ultimate sophistication.'])], ['Meeting notes — design review', blocks(['HEADING_1', 'Design review'], ['NUMBERED', 'Walk through the new navigation'], ['NUMBERED', 'Agree on the empty states'], ['PARAGRAPH', 'Action items were added to the task board.'])], ['Brand guidelines', blocks(['HEADING_1', 'Brand guidelines'], ['PARAGRAPH', 'Palette: Ivory, Sand, Taupe, Bronze, Umber, Charcoal.'])], ['Empty document', ''], ['Roadmap Q1', blocks(['HEADING_1', 'Roadmap'], ['TABLE', '', false])], ['A very long document title that keeps going to test truncation in lists, breadcrumbs and the editor header area', blocks(['PARAGRAPH', 'Short body.'])]];
  for (const [i, [title, content]] of docSpecs.entries()) {
    const doc = await mk('document', { workspaceId: workspace.id, projectId: i < 3 ? projects[i].id : null, title, content, createdAt: at(-i * 3), updatedAt: at(-i) }); docs.push(doc);
    if (content && i < 3) { await mk('documentVersion', { workspaceId: workspace.id, documentId: doc.id, createdById: demo(i).id, title, content, label: 'First draft' }); await mk('documentComment', { workspaceId: workspace.id, documentId: doc.id, createdById: demo(i + 1).id, body: 'Could we tighten this section?', resolvedAt: i === 1 ? at(-1) : null }); }
  }
  const knowledge = [['Onboarding checklist', 'Steps every new hire follows in their first week.', ['onboarding', 'hr'], true], ['Coding standards', 'Naming, testing and review conventions for the codebase.', ['engineering'], true], ['Customer interview notes', 'Themes from five interviews: pricing confusion, mobile demand.', ['research'], false], ['Archived runbook', 'Old deployment steps kept for reference.', ['ops'], false]];
  for (const [i, [title, content, tags, isPinned]] of knowledge.entries()) await mk('knowledgeItem', { workspaceId: workspace.id, createdById: demo(i).id, title, content, tags, isPinned, projectId: i === 2 ? projects[0].id : null, archivedAt: i === 3 ? at(-10) : null, sourceUrl: i === 1 ? 'https://example.test/standards' : null });

  const roadmap = await mk('workspaceDatabase', { workspaceId: workspace.id, name: 'Product roadmap', description: 'Features planned for the next quarters.', properties: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'status', name: 'Status', type: 'status' }, { id: 'owner', name: 'Owner', type: 'text' }, { id: 'budget', name: 'Budget', type: 'number' }, { id: 'due', name: 'Due', type: 'date' }, { id: 'shipped', name: 'Shipped', type: 'checkbox' }] });
  const features = ['Single sign-on', 'Offline mode', 'Dark mode', 'Public API', 'Mobile widgets', 'Calendar sync', 'Smart search', 'Template gallery', 'Audit export', 'Billing portal', 'Keyboard shortcuts', 'Import from CSV'];
  for (const [i, name] of features.entries()) await mk('databaseRecord', { workspaceId: workspace.id, databaseId: roadmap.id, values: { name, status: ['Planning', 'In progress', 'Done', 'Blocked'][i % 4], owner: pick(people)[0], budget: 1000 * (i + 1), due: at(i * 6 - 10).toISOString().slice(0, 10), shipped: i % 4 === 2 } });
  for (const [name, layout, groupBy, date] of [['Board by status', 'BOARD', 'status', ''], ['Timeline', 'TIMELINE', 'status', 'due'], ['Over budget first', 'TABLE', 'status', '']]) await mk('databaseView', { workspaceId: workspace.id, databaseId: roadmap.id, name, layout, groupByPropertyId: groupBy, datePropertyId: date, sortPropertyId: name === 'Over budget first' ? 'budget' : 'updatedAt', sortDirection: 'DESC' });
  const contacts = await mk('workspaceDatabase', { workspaceId: workspace.id, name: 'Contacts', description: null, properties: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'status', name: 'Status', type: 'status' }, { id: 'company', name: 'Company', type: 'text' }, { id: 'location', name: 'Location', type: 'text' }] });
  for (const [i, [name]] of people.entries()) await mk('databaseRecord', { workspaceId: workspace.id, databaseId: contacts.id, values: { name, status: i % 2 ? 'Customer' : 'Lead', company: ['Acme', 'Globex', 'Initech'][i % 3], location: ['-33.8688, 151.2093', '51.5074, -0.1278', '35.6762, 139.6503', '40.7128, -74.0060', 'not a place'][i % 5] } });
  await mk('workspaceDatabase', { workspaceId: workspace.id, name: 'Empty database', properties: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'status', name: 'Status', type: 'status' }] });

  // Automations (rules + runs) and workflows.
  const rules = [['Mark finished tasks as urgent', 'COMPLETED', null, 'SET_TASK_PRIORITY', 'URGENT', null, true], ['Note when work starts', 'IN_PROGRESS', 'TODO', 'ADD_ACTIVITY_NOTE', null, 'Work has started on this task.', true], ['Raise priority of blocked work', 'IN_REVIEW', null, 'SET_TASK_PRIORITY', 'HIGH', null, false]];
  for (const [i, [name, toStatus, fromStatus, action, priority, activityMessage, enabled]] of rules.entries()) {
    const rule = await mk('automationRule', { workspaceId: workspace.id, createdById: demo(i).id, name, toStatus, fromStatus, action, priority, activityMessage, enabled });
    for (let r = 0; r < 3; r += 1) await mk('automationRun', { workspaceId: workspace.id, ruleId: rule.id, taskId: tasks[(i * 3 + r) % tasks.length].id, status: r === 2 && i === 0 ? 'FAILED' : 'SUCCEEDED', summary: r === 2 && i === 0 ? 'Failed: permission denied' : 'Updated 1 task', createdAt: new Date(now - (i * 3 + r) * 5 * 3600_000) });
  }
  await mk('workflow', { workspaceId: workspace.id, createdById: users[0].id, name: 'Follow up on completed tasks', description: 'Notify the creator and create a review task.', enabled: true, trigger: { type: 'task_status_changed', toStatus: 'COMPLETED' }, steps: [{ id: 'sa1', type: 'notify', message: '“{{task.title}}” is done.', recipients: 'creator' }, { id: 'sa2', type: 'create_task', title: 'Review: {{task.title}}', priority: 'MEDIUM', dueInDays: 3 }] });
  await mk('workflow', { workspaceId: workspace.id, createdById: users[1].id, name: 'Escalate urgent tasks', description: '', enabled: false, trigger: { type: 'task_created' }, steps: [{ id: 'sb1', type: 'branch', condition: { field: 'task.priority', operator: 'equals', value: 'URGENT' }, then: [{ id: 'sb2', type: 'notify', message: 'Urgent task created', recipients: 'creator' }], else: [] }] });

  // Messages.
  const channels = [];
  for (const [name, topic] of [['general', 'Company-wide announcements'], ['product', 'Roadmap and release chatter'], ['design', 'Critique, assets and inspiration'], ['qa-test', 'QA, testing, and release coordination']]) channels.push((await prisma.channel.findFirst({ where: { workspaceId: workspace.id, name } })) ?? await mk('channel', { workspaceId: workspace.id, createdById: users[0].id, kind: 'CHANNEL', name, topic }));
  const dm = await mk('channel', { workspaceId: workspace.id, createdById: owner, kind: 'DIRECT', dmKey: [owner, users[0].id].sort().join(':').slice(0, 80) });
  const group = await mk('channel', { workspaceId: workspace.id, createdById: owner, kind: 'GROUP', dmKey: `g-${randomBytes(6).toString('hex')}` });
  await prisma.channelMember.createMany({ data: [{ channelId: dm.id, userId: owner }, { channelId: dm.id, userId: users[0].id }, ...[owner, users[1].id, users[2].id].map((userId) => ({ channelId: group.id, userId }))] });
  const lines = ['Morning everyone — standup in 10.', 'Pushed the new navigation to staging.', 'Can someone review the pricing copy?', 'Looks great. One minor issue with the onboarding copy; will push a fix tomorrow.', 'Release notes drafted: see the doc.', 'Reminder: freeze starts Friday.'];
  for (const [c, channel] of [...channels, dm, group].entries()) {
    let parent = null;
    for (let m = 0; m < 9; m += 1) {
      const author = c === 4 ? (m % 2 ? owner : users[0].id) : [owner, ...users.map((user) => user.id)][(m + c) % 6];
      const message = await mk('channelMessage', { channelId: channel.id, workspaceId: workspace.id, authorId: author, body: lines[(m + c) % lines.length], createdAt: new Date(now - (9 - m) * 47 * 60_000 - c * 3600_000), editedAt: m === 3 ? new Date(now - 3600_000) : null, deletedAt: m === 5 && c === 0 ? new Date(now - 1800_000) : null });
      if (m === 3) parent = message;
    }
    if (parent) for (const r of [0, 1]) await mk('channelMessage', { channelId: channel.id, workspaceId: workspace.id, authorId: users[r].id, parentId: parent.id, body: r ? 'Thanks — confirmed.' : 'On it.', createdAt: new Date(now - 20 * 60_000 + r * 60_000) });
    await prisma.channelRead.create({ data: { channelId: channel.id, userId: owner, lastReadAt: new Date(now - (c % 2 ? 6 : 1) * 3600_000 * (c + 1)) } }).catch(() => undefined);
  }

  // Whiteboards, templates, saved views, favourites.
  const element = (type, x, y, w, h, color, text = '') => ({ id: randomBytes(5).toString('hex'), type, x, y, w, h, color, text });
  await mk('whiteboard', { workspaceId: workspace.id, createdById: users[1].id, name: 'Sprint brainstorm', content: { elements: [element('sticky', 80, 60, 180, 140, 'amber', 'Ship search'), element('sticky', 300, 60, 180, 140, 'blue', 'Fix onboarding'), element('rect', 560, 70, 220, 120, 'sand', 'Goals'), element('ellipse', 120, 280, 200, 120, 'green', 'Done'), element('text', 400, 300, 240, 60, 'charcoal', 'Retro notes')] } });
  await mk('whiteboard', { workspaceId: workspace.id, createdById: users[2].id, name: 'Empty board', content: { elements: [] } });
  await mk('projectTemplate', { workspaceId: workspace.id, createdById: users[0].id, name: 'Website launch', description: 'Standard launch checklist.', taskTemplates: [['Design', 5, []], ['Build', 15, [0]], ['Launch', 25, [1]]].map(([title, daysFromToday, dependsOnIndexes]) => ({ title, description: null, priority: 'MEDIUM', labels: [], daysFromToday, startDaysFromToday: null, dependsOnIndexes })), milestoneTemplates: [{ title: 'Design approved', daysFromToday: 7 }], useCount: 3, lastUsedAt: at(-4) });
  await mk('projectTemplate', { workspaceId: workspace.id, createdById: users[1].id, name: 'Weekly sprint', description: null, taskTemplates: [], milestoneTemplates: [] });
  await mk('workspaceTaskView', { workspaceId: workspace.id, createdById: users[0].id, name: 'My overdue work', filters: { projectId: '', search: '', status: 'ALL', priority: 'ALL', assigneeId: owner, label: '', due: 'OVERDUE', dependency: 'ALL', sort: 'DUE_ASC' } });
  await mk('workspaceTaskView', { workspaceId: workspace.id, createdById: users[1].id, name: 'Urgent and high', filters: { projectId: '', search: '', status: 'ALL', priority: 'URGENT', assigneeId: 'ALL', label: '', due: 'ALL', dependency: 'ALL', sort: 'PRIORITY' } });
  for (const [kind, entity] of [['PROJECT', projects[0]], ['DOCUMENT', docs[0]], ['DATABASE', roadmap]]) await mk('favourite', { userId: owner, workspaceId: workspace.id, kind, entityId: entity.id }).catch(() => undefined);

  save();
  console.log(`Seeded workspace ${workspace.name} (${workspace.id})`);
}
console.log('Done. Counts per table:', Object.fromEntries(Object.entries(made).map(([key, ids]) => [key, ids.length])));
await prisma.$disconnect();
