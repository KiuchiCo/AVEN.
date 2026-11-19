import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('workflow engine', { skip }, () => {
  let t; let W; let runner; let hits; let receiver; let hook; let flaky;
  const notify = (message = 'done') => ({ id: 'n1', type: 'notify', message, recipients: 'creator' });
  const ws = () => `/workspaces/${W.id}`;
  let counter = 0;
  const create = async (who, body) => { const r = await t.call(who, 'POST', `${ws()}/workflows`, { name: `wf ${++counter}`, description: '', trigger: { type: 'task_status_changed', toStatus: 'COMPLETED' }, steps: [notify()], enabled: true, ...body }); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body; };
  const task = async (fields = {}) => (await t.call('wren', 'POST', `${ws()}/tasks`, { title: `Task ${++counter}`, ...fields })).body;
  const complete = (item) => t.call('wren', 'PATCH', `${ws()}/tasks/${item.id}`, { status: 'COMPLETED' });
  const runs = (workflowId) => t.prisma.workflowRun.findMany({ where: { workflowId }, orderBy: { createdAt: 'asc' }, include: { stepRuns: { orderBy: { startedAt: 'asc' } } } });
  const inbox = async (who) => (await t.call(who, 'GET', `${ws()}/activity/inbox`)).body;

  before(async () => {
    hits = []; flaky = 0;
    receiver = createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { hits.push({ path: req.url, body: b ? JSON.parse(b) : null }); if (req.url === '/bad') return res.writeHead(400).end(); if (req.url === '/flaky') { flaky += 1; return res.writeHead(flaky <= 2 ? 500 : 200).end(); } res.writeHead(200).end(); }); });
    await new Promise((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    hook = (path) => `http://127.0.0.1:${receiver.address().port}${path}`;
    t = await boot({ WORKFLOW_ALLOW_PRIVATE_WEBHOOKS: 'true' });
    for (const name of ['wren', 'sol', 'gwen']) await t.user(name);
    W = await t.workspace('wren'); await t.plan(W.id, 'ENTERPRISE'); await t.member(W.id, 'sol', 'MEMBER'); await t.member(W.id, 'gwen', 'GUEST');
    const { WorkflowRunner } = await import('../../dist/workflows/workflow-runner.service.js');
    runner = t.get(WorkflowRunner);
  });
  after(async () => { await t?.close(); await new Promise((resolve) => receiver.close(resolve)); });

  test('completing a task runs the steps, makes the follow-up, calls the webhook and tells the assignee', async () => {
    const project = await t.prisma.project.create({ data: { workspaceId: W.id, createdById: (await t.prisma.user.findFirstOrThrow({ where: { displayName: 'wren', email: { contains: t.run } } })).id, name: 'Launch' } });
    const sol = await t.prisma.user.findFirstOrThrow({ where: { displayName: 'sol', email: { contains: t.run } } });
    const wf = await create('wren', { steps: [
      { id: 'c1', type: 'branch', condition: { field: 'task.priority', operator: 'equals', value: 'HIGH' }, then: [{ id: 'f1', type: 'create_task', title: 'Follow up: {{task.title}}', project: 'same', assignee: 'trigger', dueInDays: 3 }], else: [{ id: 'f2', type: 'notify', message: 'Low priority done', recipients: 'creator' }] },
      { id: 'n1', type: 'notify', message: '{{task.title}} is done', recipients: 'assignee' },
      { id: 'w1', type: 'webhook', url: hook('/ok'), message: 'Completed {{task.title}}' },
    ] });
    const item = await task({ title: 'Ship beta', priority: 'HIGH', projectId: project.id, assigneeId: sol.id });
    await complete(item);
    assert.equal((await runs(wf.id))[0].status, 'QUEUED');
    await runner.tick();
    const [run] = await runs(wf.id);
    assert.equal(run.status, 'SUCCEEDED');
    assert.deepEqual(run.stepRuns.map((s) => `${s.stepId}:${s.status}`), ['c1:SUCCEEDED', 'f1:SUCCEEDED', 'n1:SUCCEEDED', 'w1:SUCCEEDED']);
    const follow = await t.prisma.task.findFirstOrThrow({ where: { title: 'Follow up: Ship beta', workspaceId: W.id } });
    assert.deepEqual([follow.projectId, follow.assigneeId], [project.id, sol.id]);
    assert.ok(Math.abs(follow.dueAt.getTime() - (Date.now() + 3 * 86_400_000)) < 60_000);
    const payload = hits.find((h) => h.path === '/ok').body;
    assert.deepEqual([payload.task.title, payload.message], ['Ship beta', 'Completed Ship beta']);
    assert.ok((await inbox('sol')).some((a) => a.entityType === 'WORKFLOW' && /Ship beta is done/.test(a.message)));
  });

  test('work done by a workflow never starts another workflow', async () => {
    const watcher = await create('wren', { name: 'Watches new tasks', trigger: { type: 'task_created' } });
    const maker = await create('wren', { name: 'Makes a task', steps: [{ id: 'c1', type: 'create_task', title: 'Made by workflow' }] });
    const before = (await runs(watcher.id)).length;
    await complete(await task());
    await runner.tick();
    assert.equal((await runs(maker.id)).at(-1).status, 'SUCCEEDED');
    assert.equal((await runs(watcher.id)).length, before + 1, 'only the person-made task triggered it, not the workflow-made one');
    await t.call('wren', 'PATCH', `${ws()}/workflows/${watcher.id}`, { enabled: false });
    await t.call('wren', 'PATCH', `${ws()}/workflows/${maker.id}`, { enabled: false });
  });

  test('a wait pauses the run and it resumes later', async () => {
    const wf = await create('wren', { steps: [{ id: 'd1', type: 'delay', minutes: 60 }, { id: 'u1', type: 'update_task', priority: 'URGENT', addLabels: ['Escalated'] }] });
    const item = await task({ priority: 'LOW', labels: ['ops'] });
    await complete(item); await runner.tick();
    let run = (await runs(wf.id)).at(-1);
    assert.equal(run.status, 'WAITING');
    assert.ok(Math.abs(run.runAt.getTime() - (Date.now() + 3_600_000)) < 60_000);
    await runner.tick(new Date(Date.now() + 30 * 60_000));
    assert.equal((await runs(wf.id)).at(-1).status, 'WAITING', 'not yet');
    await runner.tick(new Date(Date.now() + 61 * 60_000));
    run = (await runs(wf.id)).at(-1);
    const after = await t.prisma.task.findUniqueOrThrow({ where: { id: item.id } });
    assert.deepEqual([run.status, after.priority, after.labels.sort()], ['SUCCEEDED', 'URGENT', ['escalated', 'ops']]);
    await t.call('wren', 'PATCH', `${ws()}/workflows/${wf.id}`, { enabled: false });
  });

  test('temporary failures are retried with a growing delay, permanent ones fail at once and are reported to the owner', async () => {
    const retrying = await create('wren', { steps: [{ id: 'w1', type: 'webhook', url: hook('/flaky') }] });
    await complete(await task()); await runner.tick();
    assert.deepEqual([(await runs(retrying.id)).at(-1).status, (await runs(retrying.id)).at(-1).attempts], ['WAITING', 1]);
    await runner.tick(new Date(Date.now() + 40_000));
    await runner.tick(new Date(Date.now() + 4 * 60_000));
    const run = (await runs(retrying.id)).at(-1);
    assert.equal(run.status, 'SUCCEEDED');
    assert.deepEqual(run.stepRuns.map((s) => s.status), ['RETRYING', 'RETRYING', 'SUCCEEDED']);
    await t.call('wren', 'PATCH', `${ws()}/workflows/${retrying.id}`, { enabled: false });

    const broken = await create('wren', { name: 'Broken hook', steps: [{ id: 'w1', type: 'webhook', url: hook('/bad') }] });
    await complete(await task()); await runner.tick();
    const failed = (await runs(broken.id)).at(-1);
    assert.deepEqual([failed.status, failed.stepRuns.length], ['FAILED', 1], 'a 400 is not retried');
    assert.match(failed.error, /HTTP 400/);
    assert.ok((await inbox('wren')).some((a) => /Broken hook/.test(a.message) && /failed/.test(a.message)), 'the owner is told');
    await t.call('wren', 'PATCH', `${ws()}/workflows/${broken.id}`, { enabled: false });
  });

  test('a run uses its owner’s permissions at the time it runs', async () => {
    const wf = await create('sol', { steps: [{ id: 'c1', type: 'create_task', title: 'Created as sol' }] });
    await t.member(W.id, 'sol', 'GUEST');
    await complete(await task()); await runner.tick();
    const run = (await runs(wf.id)).at(-1);
    assert.equal(run.status, 'FAILED');
    assert.match(run.error, /no longer has permission/);
    assert.equal(await t.prisma.task.count({ where: { title: 'Created as sol', workspaceId: W.id } }), 0);
    await t.member(W.id, 'sol', 'MEMBER');
    await t.call('sol', 'PATCH', `${ws()}/workflows/${wf.id}`, { enabled: false });
  });

  test('schedules fire once and move on, and several runners never double a run', async () => {
    const sched = await create('wren', { trigger: { type: 'schedule', frequency: 'DAILY', time: '09:00', timeZone: 'UTC' }, steps: [{ id: 'c1', type: 'create_task', title: 'Scheduled review' }] });
    assert.ok((await t.prisma.workflow.findUniqueOrThrow({ where: { id: sched.id } })).nextRunAt > new Date());
    await t.prisma.workflow.update({ where: { id: sched.id }, data: { nextRunAt: new Date(Date.now() - 60_000) } });
    await runner.tick(); await runner.tick();
    assert.equal((await runs(sched.id)).length, 1);
    assert.ok((await t.prisma.workflow.findUniqueOrThrow({ where: { id: sched.id } })).nextRunAt > new Date());
    await t.call('wren', 'PATCH', `${ws()}/workflows/${sched.id}`, { enabled: false });

    const manual = await create('wren', { trigger: { type: 'manual' }, steps: [{ id: 'c1', type: 'create_task', title: 'Batch item' }] });
    for (let i = 0; i < 10; i += 1) await t.call('wren', 'POST', `${ws()}/workflows/${manual.id}/run`, {});
    const { WorkflowRunner } = await import('../../dist/workflows/workflow-runner.service.js');
    const { ProductivityService } = await import('../../dist/productivity/productivity.service.js');
    const { LLM_PROVIDER, AI_SETTINGS } = await import('../../dist/ai/tokens.js');
    const second = new WorkflowRunner(t.prisma, t.get(ProductivityService), t.get(LLM_PROVIDER), t.get(AI_SETTINGS));
    for (let pass = 0; pass < 3; pass += 1) await Promise.all([runner.tick(), second.tick()]);
    assert.equal(await t.prisma.task.count({ where: { title: 'Batch item', workspaceId: W.id } }), 10);
    assert.equal(await t.prisma.workflowRun.count({ where: { workflowId: manual.id, status: 'SUCCEEDED' } }), 10);
  });

  test('guests cannot create or run workflows, and webhooks to internal addresses are refused', async () => {
    assert.equal((await t.call('gwen', 'POST', `${ws()}/workflows`, { name: 'g', trigger: { type: 'manual' }, steps: [notify()] })).status, 403);
    process.env.WORKFLOW_ALLOW_PRIVATE_WEBHOOKS = 'false';
    try {
      const sneaky = await t.prisma.workflow.create({ data: { workspaceId: W.id, createdById: (await t.prisma.user.findFirstOrThrow({ where: { displayName: 'wren', email: { contains: t.run } } })).id, name: 'Sneaky', enabled: true, trigger: { type: 'task_status_changed', toStatus: 'COMPLETED' }, steps: [{ id: 'w1', type: 'webhook', url: hook('/ok') }] } });
      const before = hits.length;
      await complete(await task()); await runner.tick();
      assert.equal(hits.length, before, 'no request reached the internal server');
      assert.equal((await runs(sneaky.id)).at(-1).status, 'FAILED');
      assert.equal((await t.call('wren', 'POST', `${ws()}/workflows`, { name: 'internal', trigger: { type: 'manual' }, steps: [{ id: 'w', type: 'webhook', url: 'https://169.254.169.254/latest/meta-data' }] })).status, 400);
    } finally { process.env.WORKFLOW_ALLOW_PRIVATE_WEBHOOKS = 'true'; }
  });
});
