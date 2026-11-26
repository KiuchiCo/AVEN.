import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { GeminiProvider, geminiContents, geminiSchema } from '../dist/ai/gemini.js';
import { LlmError } from '../dist/ai/llm.js';

const frames = (...chunks) => chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\r\n\r\n`).join('');
async function withServer(handler, run) {
  const requests = [];
  const server = createServer((req, res) => { let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => { requests.push({ headers: req.headers, url: req.url, body: body ? JSON.parse(body) : null }); handler(req, res); }); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { return await run(`http://127.0.0.1:${server.address().port}`, requests); } finally { server.closeAllConnections?.(); await new Promise((resolve) => server.close(resolve)); }
}
const collect = async (iterable) => { const out = []; for await (const item of iterable) out.push(item); return out; };
const provider = (baseUrl) => new GeminiProvider({ apiKey: 'g-secret', model: 'gemini-2.5-flash', baseUrl });
const tools = [
  { name: 'search_web', description: 'search', input_schema: { type: 'object', additionalProperties: false, $schema: 'x', properties: { query: { type: 'string', minLength: 2, maxLength: 200, description: 'q' }, n: { type: 'integer', minimum: 1 } }, required: ['query'] } },
  { name: 'list_projects', description: 'no args', input_schema: { type: 'object', properties: {} } },
];
const request = { system: 'be brief', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], tools, maxTokens: 123 };

test('Gemini: sends the key in a header (not the URL), the system prompt, tools, and streams text with usage', async () => {
  await withServer((req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(frames(
    { candidates: [{ content: { role: 'model', parts: [{ text: 'Hel' }] } }] },
    { candidates: [{ content: { role: 'model', parts: [{ thought: true, text: 'private reasoning' }, { text: 'lo' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 5, thoughtsTokenCount: 3 } },
  )); }, async (baseUrl, requests) => {
    const events = await collect(provider(baseUrl).stream(request));
    assert.deepEqual(events.filter((e) => e.type === 'text').map((e) => e.text), ['Hel', 'lo']);
    assert.deepEqual(events.at(-1), { type: 'usage', inputTokens: 40, outputTokens: 8 });
    assert.deepEqual(events.find((e) => e.type === 'stop'), { type: 'stop', reason: 'end_turn' });
    const [sent] = requests;
    assert.equal(sent.url, '/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse');
    assert.equal(sent.headers['x-goog-api-key'], 'g-secret'); assert.ok(!sent.url.includes('g-secret'));
    assert.deepEqual(sent.body.systemInstruction, { parts: [{ text: 'be brief' }] });
    assert.equal(sent.body.generationConfig.maxOutputTokens, 123);
    assert.deepEqual(sent.body.contents, [{ role: 'user', parts: [{ text: 'hi' }] }]);
  });
});

test('Gemini: tool schemas are reduced to what Gemini accepts, and a tool with no arguments sends no parameters', () => {
  const [search, none] = sent(tools);
  assert.deepEqual(search.parameters, { type: 'object', properties: { query: { type: 'string', description: 'q' }, n: { type: 'integer', minimum: 1 } }, required: ['query'] });
  assert.equal('parameters' in none, false);
  assert.deepEqual(geminiSchema({ type: 'array', items: { type: 'object', additionalProperties: true, properties: { a: { type: 'string', pattern: 'x' } } } }), { type: 'array', items: { type: 'object', properties: { a: { type: 'string' } } } });
  function sent(list) { return list.map((tool) => { const p = geminiSchema(tool.input_schema); return { name: tool.name, ...(p.properties && Object.keys(p.properties).length ? { parameters: p } : {}) }; }); }
});

test('Gemini: a tool call becomes a tool_use event, and the conversation maps back with the call matched by name', async () => {
  await withServer((req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(frames(
    { candidates: [{ content: { role: 'model', parts: [{ text: 'Let me look. ' }, { functionCall: { name: 'search_web', args: { query: 'aven' } } }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4 } },
  )); }, async (baseUrl, requests) => {
    const events = await collect(provider(baseUrl).stream(request));
    const call = events.find((e) => e.type === 'tool_use');
    assert.equal(call.name, 'search_web'); assert.deepEqual(call.input, { query: 'aven' }); assert.ok(call.id);
    assert.deepEqual(events.find((e) => e.type === 'stop'), { type: 'stop', reason: 'tool_use' });
    const next = await collect(provider(baseUrl).stream({ ...request, messages: [...request.messages, { role: 'assistant', content: [{ type: 'tool_use', id: call.id, name: call.name, input: call.input }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: call.id, content: 'found' }] }] }));
    assert.ok(next.length);
    assert.deepEqual(requests[1].body.contents.slice(1), [
      { role: 'model', parts: [{ functionCall: { name: 'search_web', args: { query: 'aven' } } }] },
      { role: 'user', parts: [{ functionResponse: { name: 'search_web', response: { result: 'found' } } }] },
    ]);
  });
  assert.deepEqual(geminiContents([{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'bad', is_error: true }] }])[0].parts[0].functionResponse.response, { error: 'bad' });
});

test('Gemini: failures become safe messages, tell a quota apart from a rate limit, and never repeat the request', async () => {
  const fail = (status, error) => withServer((req, res) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error })); }, async (baseUrl, requests) => {
    const outcome = await collect(provider(baseUrl).stream(request)).then(() => null, (e) => e);
    assert.equal(requests.length, 1, 'no automatic retry');
    return outcome;
  });
  const bad = await fail(400, { message: 'API key not valid. Please pass a valid API key. g-secret', status: 'INVALID_ARGUMENT' });
  assert.ok(bad instanceof LlmError); assert.equal(bad.kind, 'auth'); assert.match(bad.message, /GOOGLE_AI_API_KEY/); assert.ok(!bad.message.includes('g-secret'));
  const quota = await fail(429, { message: 'You exceeded your current quota, please check your plan', status: 'RESOURCE_EXHAUSTED' });
  assert.equal(quota.kind, 'rate_limit'); assert.match(quota.message, /free-tier quota/);
  const slow = await fail(429, { message: 'Too many requests', status: 'RESOURCE_EXHAUSTED' });
  assert.equal(slow.kind, 'rate_limit'); assert.doesNotMatch(slow.message, /free-tier quota/);
  const missing = await fail(404, { message: 'models/x is not found for API version v1beta', status: 'NOT_FOUND' });
  assert.equal(missing.kind, 'request'); assert.match(missing.message, /AI_MODEL/);
  assert.equal((await fail(503, { message: 'The model is overloaded', status: 'UNAVAILABLE' })).kind, 'overloaded');
  assert.equal((await fail(400, { message: 'Invalid JSON payload', status: 'INVALID_ARGUMENT' })).kind, 'request');
  const network = await collect(provider('http://127.0.0.1:1').stream(request)).then(() => null, (e) => e);
  assert.equal(network.kind, 'network');
});

test('Gemini: a blocked prompt is reported, and cancelling stops the stream', async () => {
  await withServer((req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(frames({ promptFeedback: { blockReason: 'SAFETY' } })); }, async (baseUrl) => {
    await assert.rejects(collect(provider(baseUrl).stream(request)), (e) => e instanceof LlmError && e.kind === 'request');
  });
  await withServer(() => { /* never answers */ }, async (baseUrl) => {
    const controller = new AbortController();
    const pending = collect(provider(baseUrl).stream({ ...request, signal: controller.signal }));
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(pending, (e) => e.name === 'AbortError');
  });
});
