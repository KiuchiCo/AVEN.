import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { AnthropicProvider, readSse } from '../dist/ai/anthropic.js';
import { LlmError } from '../dist/ai/llm.js';
import { allTools, checkToolInput, describeAction, toDocumentContent, toolNames, citedSources, clip, creditsFor, documentText, estimateTokens, isWriteTool, monthWindow, parseDecision, parseUserMessage, readTools, uniqueSources, windowHistory } from '../dist/ai/ai-rules.js';
import { agentSection, generalAgent, parseAgentInput, systemAgents } from '../dist/ai/agents.js';
import { readApiEnvironment } from '../dist/config/api-environment.js';

const sse = (...events) => events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
const textStream = (text) => sse(
  { type: 'message_start', message: { usage: { input_tokens: 120, output_tokens: 1 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  ...text.map((piece) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: piece } })),
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 15 } },
  { type: 'message_stop' },
);

async function withServer(handler, run) {
  const requests = [];
  const server = createServer((req, res) => { let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => { requests.push({ headers: req.headers, url: req.url, body: body ? JSON.parse(body) : null }); handler(req, res, requests.length); }); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { return await run(`http://127.0.0.1:${server.address().port}`, requests); } finally { server.closeAllConnections?.(); await new Promise((resolve) => server.close(resolve)); }
}
const collect = async (iterable) => { const out = []; for await (const item of iterable) out.push(item); return out; };
const request = { system: 'sys', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], tools: readTools.slice(0, 1), maxTokens: 100 };

test('SSE frames split across chunks, with CRLF, [DONE] and a malformed frame, are parsed', async () => {
  const joined = 'data: {"a":1}\r\n\r\ndata: not json\n\ndata: [DONE]\n\ndata: {"b":2}\n\n';
  const cuts = [7, 15, 16, 41, joined.length - 3];
  const stream = new ReadableStream({ start(controller) { let from = 0; for (const cut of [...cuts, joined.length]) { controller.enqueue(new TextEncoder().encode(joined.slice(from, cut))); from = cut; } controller.close(); } });
  assert.deepEqual(await collect(readSse(stream)), [{ a: 1 }, { b: 2 }]);
});

test('the provider streams text, sends the right request, and reports usage', async () => {
  await withServer((req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(textStream(['Hel', 'lo ', 'there'])); }, async (baseUrl, requests) => {
    const events = await collect(new AnthropicProvider({ apiKey: 'sk-test', model: 'claude-sonnet-5-5', baseUrl }).stream(request));
    assert.deepEqual(events.filter((e) => e.type === 'text').map((e) => e.text), ['Hel', 'lo ', 'there']);
    assert.deepEqual(events.at(-1), { type: 'usage', inputTokens: 120, outputTokens: 15 });
    assert.ok(events.some((e) => e.type === 'stop' && e.reason === 'end_turn'));
    const [sent] = requests;
    assert.equal(sent.url, '/v1/messages');
    assert.equal(sent.headers['x-api-key'], 'sk-test');
    assert.equal(sent.headers['anthropic-version'], '2023-06-01');
    assert.deepEqual([sent.body.model, sent.body.stream, sent.body.max_tokens, sent.body.system, sent.body.tools.length], ['claude-sonnet-5-5', true, 100, 'sys', 1]);
  });
});

test('tool calls arrive as complete objects even when their JSON is streamed in pieces', async () => {
  const body = sse(
    { type: 'message_start', message: { usage: { input_tokens: 50, output_tokens: 1 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Let me check.' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'search_workspace', input: {} } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"que' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: 'ry":"launch"}' } },
    { type: 'content_block_stop', index: 1 },
    { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'toolu_2', name: 'get_briefing', input: {} } },
    { type: 'content_block_stop', index: 2 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 40 } },
    { type: 'message_stop' },
  );
  await withServer((req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(body); }, async (baseUrl) => {
    const events = await collect(new AnthropicProvider({ apiKey: 'k', model: 'm', baseUrl }).stream(request));
    assert.deepEqual(events.filter((e) => e.type === 'tool_use'), [{ type: 'tool_use', id: 'toolu_1', name: 'search_workspace', input: { query: 'launch' } }, { type: 'tool_use', id: 'toolu_2', name: 'get_briefing', input: {} }]);
    assert.deepEqual(events.at(-1), { type: 'usage', inputTokens: 50, outputTokens: 40 });
  });
});

test('provider failures become safe, specific errors', async () => {
  for (const [status, kind, pattern] of [[401, 'auth', /API key/], [403, 'auth', /API key/], [429, 'rate_limit', /rate limiting/], [529, 'overloaded', /unavailable/], [500, 'overloaded', /unavailable/], [400, 'request', /could not process/]]) {
    await withServer((req, res) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'secret-detail' } })); }, async (baseUrl) => {
      await assert.rejects(collect(new AnthropicProvider({ apiKey: 'k', model: 'm', baseUrl }).stream(request)), (error) => error instanceof LlmError && error.kind === kind && pattern.test(error.message) && !error.message.includes('sk-') && (status !== 400 || error.message.includes('secret-detail')), String(status));
    });
  }
});

test('an error event mid-stream and an unreachable server are reported without leaking details', async () => {
  await withServer((req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(sse({ type: 'message_start', message: { usage: { input_tokens: 1, output_tokens: 1 } } }, { type: 'error', error: { type: 'overloaded_error', message: 'internal' } })); }, async (baseUrl) => {
    await assert.rejects(collect(new AnthropicProvider({ apiKey: 'k', model: 'm', baseUrl }).stream(request)), (e) => e instanceof LlmError && e.kind === 'overloaded' && !e.message.includes('internal'));
  });
  await assert.rejects(collect(new AnthropicProvider({ apiKey: 'k', model: 'm', baseUrl: 'http://127.0.0.1:1' }).stream(request)), (e) => e instanceof LlmError && e.kind === 'network');
});

test('aborting the request stops the stream', async () => {
  await withServer((req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(sse({ type: 'message_start', message: { usage: { input_tokens: 1, output_tokens: 1 } } })); }, async (baseUrl) => {
    const controller = new AbortController();
    const pending = collect(new AnthropicProvider({ apiKey: 'k', model: 'm', baseUrl }).stream({ ...request, signal: controller.signal }));
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(pending, (e) => e.name === 'AbortError' || /abort/i.test(String(e)));
  });
});

test('credits: one per 1,000 tokens across input and output, at least one', () => {
  assert.deepEqual([creditsFor(0, 0), creditsFor(1, 1), creditsFor(500, 500), creditsFor(500, 501), creditsFor(12_000, 3_000)], [1, 1, 1, 2, 15]);
  assert.equal(creditsFor(-5, 10), 1);
  assert.equal(estimateTokens('abcdefgh'), 2);
});

test('the monthly window runs from the first of this month to the first of next (UTC)', () => {
  const { start, end } = monthWindow(new Date('2026-12-31T23:59:59Z'));
  assert.deepEqual([start.toISOString(), end.toISOString()], ['2026-12-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z']);
});

test('member input is validated', () => {
  assert.equal(parseUserMessage({ text: '  hello  ' }), 'hello');
  for (const body of [undefined, {}, { text: '' }, { text: '   ' }, { text: 5 }, { text: 'x'.repeat(8001) }, []]) assert.throws(() => parseUserMessage(body), BadRequestException);
  assert.equal(parseDecision({ decision: 'confirm' }), 'confirm');
  for (const body of [{}, { decision: 'yes' }, null, 'confirm']) assert.throws(() => parseDecision(body), BadRequestException);
});

test('tool inputs from the model are checked, normalised and never trusted', () => {
  const id = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
  assert.deepEqual(checkToolInput('search_workspace', { query: ' launch ' }), { ok: true, value: { query: 'launch' } });
  assert.equal(checkToolInput('search_workspace', { query: 'a' }).ok, false);
  assert.equal(checkToolInput('search_workspace', {}).ok, false);
  assert.deepEqual(checkToolInput('list_tasks', {}).value, { status: 'open', assignedToMe: false, dueWithinDays: undefined, projectId: undefined, limit: 25 });
  for (const bad of [{ status: 'later' }, { assignedToMe: 'yes' }, { dueWithinDays: -1 }, { dueWithinDays: 1.5 }, { limit: 100 }, { projectId: 'not-a-uuid' }]) assert.equal(checkToolInput('list_tasks', bad).ok, false, JSON.stringify(bad));
  assert.equal(checkToolInput('list_tasks', { projectId: id, limit: 5, dueWithinDays: 7 }).ok, true);
  assert.equal(checkToolInput('get_document', { documentId: id }).ok, true);
  assert.equal(checkToolInput('get_document', { documentId: "x'; DROP TABLE" }).ok, false);
  assert.equal(checkToolInput('get_document', {}).ok, false);
  assert.equal(checkToolInput('list_projects', { status: 'weird' }).ok, false);
  assert.equal(checkToolInput('delete_everything', {}).ok, false);
});

test('create_task input is normalised, and only known fields survive', () => {
  const ok = checkToolInput('create_task', { title: ' Call supplier ', priority: 'HIGH', dueAt: '2026-12-01', secret: 'ignored', status: 'COMPLETED' });
  assert.equal(ok.ok, true);
  assert.deepEqual(Object.keys(ok.value).sort(), ['dueAt', 'priority', 'title']);
  assert.equal(ok.value.title, 'Call supplier');
  assert.equal(ok.value.dueAt, '2026-12-01T00:00:00.000Z');
  for (const bad of [{}, { title: '' }, { title: 'x'.repeat(201) }, { title: 'a', priority: 'URGENTISH' }, { title: 'a', dueAt: 'soon' }, { title: 'a', projectId: 'nope' }, { title: 'a', description: 'x'.repeat(5001) }]) assert.equal(checkToolInput('create_task', bad).ok, false, JSON.stringify(bad));
});

test('exactly four tools can change things, none of them read tools, and every tool has a schema', () => {
  assert.deepEqual(allTools.filter((tool) => isWriteTool(tool.name)).map((tool) => tool.name).sort(), ['create_document', 'create_event', 'create_task', 'update_task']);
  for (const tool of allTools) assert.ok(tool.name && tool.description && tool.input_schema.type === 'object');
  assert.equal(readTools.some((tool) => isWriteTool(tool.name)), false);
});

test('long tool output is clipped and sources are de-duplicated', () => {
  assert.equal(clip('short'), 'short');
  assert.match(clip('x'.repeat(20_000)), /truncated, 8000 more characters/);
  const a = { type: 'task', id: '1', title: 'A', href: '/a' };
  assert.deepEqual(uniqueSources([a, { ...a }, { ...a, type: 'project' }]).map((s) => s.type), ['task', 'project']);
});

test('citations include only sources the answer actually mentions', () => {
  const sources = [{ type: 'task', id: '1', title: 'Launch checklist', href: '' }, { type: 'task', id: '2', title: 'Unrelated', href: '' }, { type: 'document', id: '3', title: 'Q4 plan', href: '' }, { type: 'task', id: '4', title: 'ab', href: '' }];
  assert.deepEqual(citedSources(sources, 'The LAUNCH CHECKLIST is due Friday; see the Q4 plan. ab').map((s) => s.id), ['1', '3']);
  assert.deepEqual(citedSources(sources, 'Nothing relevant.'), []);
});

test('document text is flattened from blocks or passed through for older plain text', () => {
  const blocks = JSON.stringify({ format: 'aven-doc-v1', blocks: [{ type: 'HEADING_1', text: 'Plan' }, { type: 'PARAGRAPH', text: 'Intro' }, { type: 'TODO', text: 'Ship', checked: true }, { type: 'TODO', text: 'Test', checked: false }, { type: 'DIVIDER', text: '' }, { type: 'BULLET', text: 'Item' }, { type: 'PARAGRAPH', text: '  ' }] });
  assert.equal(documentText(blocks), '# Plan\nIntro\n[x] Ship\n[ ] Test\n---\n- Item');
  assert.equal(documentText('just old text'), 'just old text');
});

const text = (role, t) => ({ role, kind: 'text', blocks: [{ type: 'text', text: t }] });
const call = (id) => ({ role: 'assistant', kind: 'text', blocks: [{ type: 'tool_use', id, name: 'get_briefing', input: {} }] });
const result = (id) => ({ role: 'user', kind: 'tool_result', blocks: [{ type: 'tool_result', tool_use_id: id, content: '{}' }] });

test('history keeps matched tool pairs and starts on a member message', () => {
  const turns = [text('user', 'q1'), call('a'), result('a'), text('assistant', 'answer'), text('user', 'q2')];
  assert.equal(windowHistory(turns).length, 5);
  assert.equal(windowHistory(turns, 3)[0].content[0].text, 'q2');
  assert.deepEqual(windowHistory([result('x'), text('assistant', 'orphan'), text('user', 'q')]).map((m) => m.role), ['user']);
});

test('history drops a tool call whose result is missing, so the provider never sees an unmatched pair', () => {
  const broken = windowHistory([text('user', 'q1'), call('a'), text('user', 'q2'), text('assistant', 'fine')]);
  assert.equal(broken.some((m) => m.content.some((b) => b.type === 'tool_use')), false);
  const partial = windowHistory([text('user', 'q'), { role: 'assistant', kind: 'text', blocks: [{ type: 'tool_use', id: 'a', name: 'x', input: {} }, { type: 'tool_use', id: 'b', name: 'y', input: {} }] }, result('a')]);
  assert.equal(partial.some((m) => m.content.some((b) => b.type === 'tool_use')), false);
});

test('AI settings default safely, accept overrides, and reject unsafe values', () => {
  const base = { DATABASE_URL: 'postgresql://aven:x@localhost:5432/aven' };
  const defaults = readApiEnvironment(base);
  assert.deepEqual([defaults.aiApiKey, defaults.aiModel, defaults.aiBaseUrl, defaults.aiMonthlyCredits, defaults.aiMaxOutputTokens], [undefined, 'claude-sonnet-5-5', 'https://api.anthropic.com', 200, 2048]);
  assert.equal(readApiEnvironment({ ...base, ANTHROPIC_API_KEY: ' sk-x ', AI_MODEL: 'claude-opus-5-5', AI_BASE_URL: 'http://localhost:8080' }).aiApiKey, 'sk-x');
  for (const bad of [{ AI_BASE_URL: 'http://example.com' }, { AI_BASE_URL: 'ftp://x' }, { AI_BASE_URL: 'nonsense' }, { AI_MODEL: 'bad model!' }, { AI_MONTHLY_CREDITS: '0' }, { AI_MAX_OUTPUT_TOKENS: '99999999' }]) assert.throws(() => readApiEnvironment({ ...base, ...bad }), /Invalid API environment/, JSON.stringify(bad));
});

const taskId = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

test('update_task needs a task and at least one valid change; dueAt can be cleared with null', () => {
  assert.deepEqual(checkToolInput('update_task', { taskId, status: 'COMPLETED', extra: 'x' }).value, { taskId, status: 'COMPLETED' });
  assert.deepEqual(checkToolInput('update_task', { taskId, dueAt: null }).value, { taskId, dueAt: null });
  assert.equal(checkToolInput('update_task', { taskId, dueAt: '2026-12-01' }).value.dueAt, '2026-12-01T00:00:00.000Z');
  for (const bad of [{}, { taskId }, { taskId: 'nope', status: 'TODO' }, { taskId, status: 'DONE' }, { taskId, priority: 'MAX' }, { taskId, dueAt: 'soon' }, { taskId, dueAt: 5 }]) assert.equal(checkToolInput('update_task', bad).ok, false, JSON.stringify(bad));
});

test('create_document validates block count, types, lengths and total size', () => {
  const ok = checkToolInput('create_document', { title: ' Plan ', blocks: [{ type: 'HEADING_1', text: 'Plan' }, { type: 'PARAGRAPH', text: 'Body', extra: 1 }] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value.blocks, [{ type: 'HEADING_1', text: 'Plan' }, { type: 'PARAGRAPH', text: 'Body' }]);
  assert.equal(ok.value.title, 'Plan');
  const block = (text, type = 'PARAGRAPH') => ({ type, text });
  for (const bad of [{ title: 'x' }, { title: 'x', blocks: [] }, { title: '', blocks: [block('a')] }, { title: 'x', blocks: Array.from({ length: 101 }, () => block('a')) }, { title: 'x', blocks: [block('a', 'SCRIPT')] }, { title: 'x', blocks: [block('a', 'DIVIDER')] }, { title: 'x', blocks: [block('y'.repeat(2001))] }, { title: 'x', blocks: [{ type: 'PARAGRAPH' }] }, { title: 'x', blocks: [null] }, { title: 'x', blocks: Array.from({ length: 40 }, () => block('y'.repeat(2000))) }, { title: 'x', blocks: 'text' }]) assert.equal(checkToolInput('create_document', bad).ok, false, JSON.stringify(bad).slice(0, 80));
});

test('create_event needs a valid start, an end after it, and known type', () => {
  assert.deepEqual(checkToolInput('create_event', { title: ' Study ', startsAt: '2026-12-01T09:00:00Z', endsAt: '2026-12-01T10:00:00Z' }).value, { title: 'Study', startsAt: '2026-12-01T09:00:00.000Z', endsAt: '2026-12-01T10:00:00.000Z', type: 'MEETING' });
  for (const bad of [{ title: 'x' }, { title: 'x', startsAt: 'later' }, { title: 'x', startsAt: '2026-12-01T10:00:00Z', endsAt: '2026-12-01T09:00:00Z' }, { title: 'x', startsAt: '2026-12-01T10:00:00Z', endsAt: '2026-12-01T10:00:00Z' }, { title: 'x', startsAt: '2026-12-01T10:00:00Z', type: 'PARTY' }, { title: '', startsAt: '2026-12-01T10:00:00Z' }, { title: 'x', startsAt: '2026-12-01T10:00:00Z', location: 'y'.repeat(251) }]) assert.equal(checkToolInput('create_event', bad).ok, false, JSON.stringify(bad));
});

test('proposal cards are described from validated input', () => {
  assert.deepEqual(describeAction('update_task', { taskId, status: 'IN_PROGRESS', dueAt: null }, 'Ship it'), { summary: 'Update “Ship it”', details: ['status → in progress', 'clear due date'] });
  assert.deepEqual(describeAction('create_task', { title: 'Call', priority: 'HIGH', dueAt: '2026-12-01T00:00:00.000Z' }), { summary: 'Create task “Call”', details: ['high priority', 'due 2026-12-01'] });
  assert.deepEqual(describeAction('create_document', { title: 'Plan', blocks: [{}, {}] }), { summary: 'Create document “Plan”', details: ['2 blocks'] });
  assert.equal(describeAction('create_event', { title: 'Study', startsAt: '2026-12-01T09:00:00.000Z', location: 'Library' }).details.join(' | '), '2026-12-01 09:00 UTC | Library');
});

test('proposed blocks become an editor document with unique ids', () => {
  const doc = JSON.parse(toDocumentContent([{ type: 'HEADING_1', text: 'A' }, { type: 'BULLET', text: 'B' }]));
  assert.equal(doc.format, 'aven-doc-v1');
  assert.deepEqual(doc.blocks.map((b) => [b.type, b.text, b.checked]), [['HEADING_1', 'A', false], ['BULLET', 'B', false]]);
  assert.equal(new Set(doc.blocks.map((b) => b.id)).size, 2);
});

test('built-in agents are well formed and only use tools that exist', () => {
  const keys = [generalAgent, ...systemAgents].map((agent) => agent.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(systemAgents.map((agent) => agent.name), ['Project Manager', 'Research Analyst', 'Writing Assistant', 'Study Coach']);
  for (const agent of [generalAgent, ...systemAgents]) {
    assert.ok(agent.tools.length > 0, agent.key);
    for (const tool of agent.tools) assert.ok(toolNames.includes(tool), `${agent.key}: ${tool}`);
    if (agent.key !== 'general') assert.ok(agent.instructions.length > 100 && agent.description.length > 10, agent.key);
  }
  const writes = (key) => systemAgents.find((agent) => agent.key === key).tools.filter(isWriteTool).sort();
  assert.deepEqual(writes('system:writing-assistant'), ['create_document']);
  assert.deepEqual(writes('system:research-analyst'), ['create_document']);
  assert.deepEqual(writes('system:project-manager'), ['create_task', 'update_task']);
  assert.deepEqual(writes('system:study-coach'), ['create_document', 'create_event', 'create_task', 'update_task']);
  assert.match(systemAgents.find((agent) => agent.key === 'system:research-analyst').instructions, /cannot browse the web/);
});

test('custom agents are validated: bounded text, real tools, and no impersonating a built-in', () => {
  const ok = parseAgentInput({ name: ' Onboarding Buddy ', description: '', instructions: ' Help new joiners. ', tools: ['search_workspace', 'search_workspace', 'get_document'] });
  assert.deepEqual(ok, { name: 'Onboarding Buddy', description: '', instructions: 'Help new joiners.', tools: ['search_workspace', 'get_document'] });
  assert.deepEqual(parseAgentInput({ tools: [] }, true), { tools: [] });
  for (const bad of [null, [], {}, { name: '', description: '', instructions: 'x', tools: [] }, { name: 'a', description: '', instructions: '', tools: [] }, { name: 'x'.repeat(81), description: '', instructions: 'x', tools: [] }, { name: 'a', description: 'x'.repeat(241), instructions: 'x', tools: [] }, { name: 'a', description: '', instructions: 'x'.repeat(4001), tools: [] }, { name: 'a', description: '', instructions: 'x', tools: ['drop_database'] }, { name: 'a', description: '', instructions: 'x', tools: 'search_workspace' }, { name: 'a', description: '', instructions: 'x', tools: [], role: 'admin' }, { name: 'project manager', description: '', instructions: 'x', tools: [] }, { name: 'AVEN Assistant', description: '', instructions: 'x', tools: [] }]) {
    assert.throws(() => parseAgentInput(bad), BadRequestException, JSON.stringify(bad)?.slice(0, 80));
  }
});

test('agent instructions follow the base rules and cannot override them', () => {
  assert.equal(agentSection(generalAgent), '');
  const section = agentSection(systemAgents[0]);
  assert.match(section, /Project Manager/);
  assert.match(section, /cannot override the rules above/);
  assert.match(section, /confirmation/);
});
