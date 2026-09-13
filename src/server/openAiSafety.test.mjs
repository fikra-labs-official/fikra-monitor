import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { openAiRealtimeProxy } from '../../vite.config.js';

async function invoke(handler, method = 'GET') {
  const req = Readable.from([Buffer.from('{}')]);
  Object.assign(req, { method, url: '/', headers: {}, socket: { remoteAddress: '127.0.0.1' } });
  let result;
  const headers = {};
  const res = { statusCode: 200, setHeader: (key, value) => { headers[key.toLowerCase()] = value; }, end(body) { result = { status: this.statusCode, headers, body: JSON.parse(body) }; } };
  await handler(req, res);
  return result;
}

test('OpenAI failures cannot echo provider key material; successful short-lived token is no-store', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'synthetic-private-value';
  t.after(() => { globalThis.fetch = previousFetch; if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; });
  const routes = new Map();
  openAiRealtimeProxy().configureServer({ middlewares: { use: (route, handler) => routes.set(route, handler) } });
  globalThis.fetch = async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(JSON.stringify({ error: { message: 'synthetic-private-value', code: 'insufficient_quota' } }), { status: 429 });
  };
  const failed = await invoke(routes.get('/api/realtime/token'));
  assert.equal(failed.status, 429);
  assert.equal(failed.body.error.code, 'insufficient_quota');
  assert.equal(JSON.stringify(failed).includes('synthetic-private-value'), false);
  globalThis.fetch = async () => new Response(JSON.stringify({ value: 'synthetic-ephemeral', expires_at: 123 }), { status: 200 });
  const success = await invoke(routes.get('/api/realtime/token'));
  assert.equal(success.headers['cache-control'], 'no-store');
  assert.equal(success.body.value, 'synthetic-ephemeral');
  globalThis.fetch = async () => new Response('{}', { status: 200 });
  const emptySummary = await invoke(routes.get('/api/openai/hud-summary'), 'POST');
  assert.equal(emptySummary.status, 502);
  assert.equal(emptySummary.body.summary, null);
  assert.ok(emptySummary.body.error);
});
