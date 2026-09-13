import test from 'node:test';
import assert from 'node:assert/strict';
import { geocodingParams, googleGeocodingProxy } from './googleGeocoding.mjs';

function handlerFor(options = {}, preview = false) {
  let route;
  let handler;
  const server = { middlewares: { use(path, callback) { route = path; handler = callback; } } };
  const plugin = googleGeocodingProxy(options);
  if (preview) plugin.configurePreviewServer(server);
  else plugin.configureServer(server);
  assert.equal(route, '/api/google/geocode');
  return handler;
}

async function request(handler, url, method = 'GET') {
  const headers = {};
  const response = {
    statusCode: 200,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    end(body) { this.body = JSON.parse(body); },
  };
  await handler({ method, url }, response);
  return { code: response.statusCode, body: response.body, headers };
}

test('only bounded geocoding parameters pass to the fixed upstream', async () => {
  let upstreamUrl;
  const handler = handlerFor({
    getApiKey: () => 'server-test-key',
    fetchImpl: async (url, options) => {
      upstreamUrl = new URL(url);
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal);
      return new Response(JSON.stringify({
        status: 'OK',
        results: [{ formatted_address: 'Austin' }],
        error_message: 'never forward raw provider errors',
      }));
    },
  }, true);
  const result = await request(handler, '/?address=Austin&bounds=30,-98%7C31,-97&language=ru');
  assert.equal(result.code, 200);
  assert.deepEqual(result.body, { status: 'OK', results: [{ formatted_address: 'Austin' }] });
  assert.equal(upstreamUrl.origin, 'https://maps.googleapis.com');
  assert.equal(upstreamUrl.pathname, '/maps/api/geocode/json');
  assert.equal(upstreamUrl.searchParams.get('key'), 'server-test-key');
  assert.equal(upstreamUrl.searchParams.get('bounds'), '30,-98|31,-97');
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.doesNotMatch(JSON.stringify(result.body), /server-test-key|provider errors/);
});

test('rejects extra, repeated, overlong and invalid coordinates before fetch', async () => {
  let calls = 0;
  const handler = handlerFor({ getApiKey: () => 'test', fetchImpl: async () => { calls++; } });
  for (const url of [
    '/?address=Austin&url=http://example.com',
    '/?address=Austin&address=Paris',
    '/?address=Austin&latlng=1,2',
    '/?address=',
    `/?address=${'x'.repeat(301)}`,
    '/?latlng=91,0',
    '/?latlng=1,181',
    '/?latlng=1,2&bounds=0,0%7C1,1',
    '/?address=Austin&bounds=10,0%7C0,1',
    '/?address=Austin&language=too-long-language',
  ]) {
    assert.equal((await request(handler, url)).code, 400, url);
  }
  assert.equal((await request(handler, '/?address=Austin', 'POST')).code, 405);
  assert.equal(calls, 0);
  assert.equal(geocodingParams(new URLSearchParams('latlng=30.2,-97.7'))?.get('latlng'), '30.2,-97.7');
  assert.equal(geocodingParams(new URLSearchParams('latlng=30.123456789012345,1e-7'))?.get('latlng'), '30.123456789012344,1e-7');
});

test('missing key, upstream errors and large responses are sanitized', async () => {
  const keyless = handlerFor({ getApiKey: () => '', fetchImpl: async () => { throw new Error('should not fetch'); } });
  assert.deepEqual((await request(keyless, '/?address=Austin')).body, {
    status: 'REQUEST_DENIED', results: [], configured: false,
  });

  const failing = handlerFor({ getApiKey: () => 'test', fetchImpl: async () => { throw new Error('private-key-leak'); } });
  const error = await request(failing, '/?latlng=30,-97');
  assert.equal(error.code, 502);
  assert.deepEqual(error.body, { status: 'UNKNOWN_ERROR', results: [] });

  const oversized = handlerFor({
    getApiKey: () => 'test',
    fetchImpl: async () => new Response('x'.repeat(1024 * 1024 + 1)),
  });
  assert.equal((await request(oversized, '/?address=Austin')).code, 502);
});
