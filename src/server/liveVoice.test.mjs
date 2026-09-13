import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { liveSessionRequest, liveVoiceProxy, LIVE_INSTRUCTIONS } from './liveVoice.mjs';

const sdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
const tools = [{ type: 'function', name: 'fly_to_location', description: 'Fly', parameters: {
  type: 'object', properties: { query: { type: 'string' } }, required: [], additionalProperties: false,
} }];
const env = { OPENAI_API_KEY: 'test-only-not-a-real-key' };
async function fixture(t, { fetchImpl, ...options } = {}) {
  const calls = [];
  let middleware;
  const plugin = liveVoiceProxy({ tools, instructions: 'Keep Russian map policy', env,
    fetchImpl: async (...args) => {
      calls.push(args);
      return fetchImpl ? fetchImpl(...args) : Response.json({ session: { id: 'live_test', secret: 'NEVER_RETURN' },
        transport: { type: 'webrtc', sdp }, extra: 'NEVER_RETURN' });
    }, ...options });
  plugin.configureServer({ middlewares: { use(fn) { middleware = fn; } } });
  const server = http.createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { calls, request: (body = { sdp }, init = {}) => fetch(`${url}/api/live/session`, {
    method: 'POST', ...init, headers: { Origin: url, 'Content-Type': 'application/json', ...init.headers },
    body: init.method === 'GET' ? undefined : JSON.stringify(body),
  }) };
}

test('Live defaults to Luna and standard pricing, preserving voice and optional tool parameters', () => {
  const result = liveSessionRequest({ sdp, tools, instructions: 'Map rules', env });
  assert.equal(result.session.model, 'gpt-live-1');
  assert.equal(result.session.delegation.responses.model, 'gpt-5.6-luna');
  assert.equal(result.session.delegation.responses.service_tier, 'default');
  assert.equal(result.session.audio.output.voice, 'meridian');
  assert.equal(result.session.store, false);
  assert.equal(result.session.delegation.responses.max_output_tokens, 2048);
  assert.equal(result.session.delegation.responses.parallel_tool_calls, false);
  assert.equal(result.session.delegation.responses.tools[0].strict, false);
  assert.deepEqual(result.session.delegation.responses.tools[0].parameters.required, []);
  assert.match(result.session.delegation.responses.instructions, /Map rules/);
  assert.equal(result.session.audio.input, undefined);
  assert.equal(result.session.type, undefined);
  assert.match(LIVE_INSTRUCTIONS, /Interruption policy/);
  assert.match(LIVE_INSTRUCTIONS, /Speak Russian/);
});
test('Terra remains an explicit server-side option, not an automatic upgrade', async (t) => {
  const { request, calls } = await fixture(t, { env: { ...env, OPENAI_LIVE_BACKEND_MODEL: 'gpt-5.6-terra' } });
  const result = await (await request()).json();
  assert.equal(result.backendModel, 'gpt-5.6-terra');
  assert.deepEqual(result.backendRates, { input: 2, cachedInput: 0.2, output: 12 });
  assert.equal(JSON.parse(calls[0][1].body).session.delegation.responses.model, result.backendModel);
});
test('unsupported model overrides fail explicitly instead of silently substituting', () => {
  assert.throws(() => liveSessionRequest({ sdp, tools, instructions: '', env: { OPENAI_LIVE_MODEL: 'typo' } }));
  assert.throws(() => liveSessionRequest({ sdp, tools, instructions: '', env: { OPENAI_LIVE_BACKEND_MODEL: 'typo' } }));
  assert.throws(() => liveSessionRequest({ sdp, tools, instructions: '', env: { OPENAI_LIVE_BACKEND_MODEL: 'constructor' } }));
});
test('session broker sends key only upstream and projects only public SDP/session fields', async (t) => {
  const { request, calls } = await fixture(t);
  const res = await request();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const result = await res.json();
  assert.deepEqual(result.session, { id: 'live_test' });
  assert.equal(result.backendModel, 'gpt-5.6-luna');
  assert.deepEqual(result.backendRates, { input: 0.2, cachedInput: 0.02, output: 1.2 });
  assert.equal(JSON.parse(calls[0][1].body).session.delegation.responses.model, result.backendModel);
  assert.equal(result.voiceUsdPerMinute, 0.05);
  assert.equal(result.maxSessionSeconds, 600);
  assert.doesNotMatch(JSON.stringify(result), /NEVER_RETURN|test-only-not-a-real-key|Map rules/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://api.openai.com/v1/live/sessions');
  assert.equal(calls[0][1].redirect, 'error');
  assert.equal(calls[0][1].headers.Authorization, `Bearer ${env.OPENAI_API_KEY}`);
});
test('foreign origin and proxy headers cannot create paid sessions', async (t) => {
  const { request, calls } = await fixture(t);
  assert.equal((await request({ sdp }, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request({ sdp }, { headers: { 'X-Forwarded-For': '127.0.0.1' } })).status, 403);
  assert.equal(calls.length, 0);
});
test('missing key and legacy mode do not call OpenAI', async (t) => {
  const missing = await fixture(t, { env: {} });
  assert.equal((await missing.request()).status, 503);
  assert.equal(missing.calls.length, 0);
  const legacy = await fixture(t, { env: { ...env, OPENAI_VOICE_ENGINE: 'realtime' } });
  assert.equal((await legacy.request()).status, 409);
  assert.equal(legacy.calls.length, 0);
});
test('rejects non-POST, wrong media type, oversized and model/prompt injection', async (t) => {
  const { request, calls } = await fixture(t);
  assert.equal((await request({}, { method: 'GET' })).status, 405);
  assert.equal((await request({}, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await request({ sdp: 'a'.repeat(70_000) })).status, 413);
  for (const body of [{}, null, [], { sdp: 'no' }, { sdp, model: 'other' }, { sdp, instructions: 'override' }]) {
    assert.equal((await request(body)).status, 400);
  }
  assert.equal(calls.length, 0);
});
test('upstream error text and thrown errors cannot leak secrets, no automatic retry', async (t) => {
  for (const fetchImpl of [
    async () => new Response(env.OPENAI_API_KEY, { status: 429 }),
    async () => { throw new Error(env.OPENAI_API_KEY); },
    async () => Response.json({ error: env.OPENAI_API_KEY }),
  ]) {
    const { request, calls } = await fixture(t, { fetchImpl });
    const res = await request();
    assert.ok(res.status >= 400);
    assert.doesNotMatch(await res.text(), /test-only-not-a-real-key/);
    assert.equal(calls.length, 1);
  }
});
test('new Live session creation is limited to six attempts per minute', async (t) => {
  const { request, calls } = await fixture(t);
  for (let i = 0; i < 6; i++) assert.equal((await request()).status, 200);
  assert.equal((await request()).status, 429);
  assert.equal(calls.length, 6);
});
test('parallel create requests are not sent to OpenAI', async (t) => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const { request, calls } = await fixture(t, { fetchImpl: () => pending });
  const first = request();
  while (!calls.length) await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await request()).status, 429);
  release(Response.json({ session: { id: 'live_test' }, transport: { type: 'webrtc', sdp } }));
  assert.equal((await first).status, 200);
});
test('duration guard is bounded and opt-in shared limit is respected', async (t) => {
  const bounded = await fixture(t, { env: { ...env, OPENAI_LIVE_MAX_SESSION_SECONDS: '999999' } });
  assert.equal((await (await bounded.request()).json()).maxSessionSeconds, 600);
  const denied = await fixture(t, { allowRequest: (_req, res) => { res.statusCode = 429; res.end(); return false; } });
  assert.equal((await denied.request()).status, 429);
  assert.equal(denied.calls.length, 0);
});
