import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer, preview } from 'vite';

test('real dev and preview HTTP refuse private files and foreign API requests', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fikra-http-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const marker = 'PRIVATE_SYNTHETIC_TEST_MARKER';
  for (const file of ['.env', 'pinokio/ENVIRONMENT', 'public/.env', 'public/private.key', 'public/.gev-logs/test.jsonl', 'dist/.env']) {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, marker);
  }
  fs.writeFileSync(path.join(directory, 'index.html'), '<html><body>keyless test</body></html>');
  fs.writeFileSync(path.join(directory, 'dist/index.html'), '<html><body>keyless preview</body></html>');
  const previousEnv = { ...process.env };
  for (const name of ['GOOGLE_MAPS_API_KEY', 'GOOGLE_MAPS_SERVER_API_KEY', 'OPENAI_API_KEY', 'CESIUM_ION_TOKEN', 'AISSTREAM_API_KEY', 'TOMTOM_API_KEY', 'FIRMS_MAP_KEY', 'OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET', 'LL2_API_TOKEN', 'GEV_DEBUG_LOG']) process.env[name] = '';
  t.after(() => {
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  });
  const config = fileURLToPath(new URL('../../vite.config.js', import.meta.url));
  const dev = await createServer({ root: directory, configFile: config, logLevel: 'silent', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
  await dev.listen();
  t.after(() => dev.close());
  const built = await preview({ root: directory, configFile: config, logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, strictPort: false } });
  t.after(() => built.httpServer.close());
  for (const server of [dev, built]) {
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const good = await fetch(`${origin}/`);
    assert.equal(good.status, 200);
    assert.equal(good.headers.get('x-frame-options'), 'DENY');
    for (const file of ['/.env', '/%2eenv?raw', '/pinokio/ENVIRONMENT', `/@fs${directory}/.env?raw`, '/private.key', '/.gev-logs/test.jsonl']) {
      const response = await fetch(origin + file);
      assert.equal(response.status, 403, file);
      assert.equal((await response.text()).includes(marker), false);
    }
    const foreign = await fetch(`${origin}/api/realtime/token`, { headers: { Origin: 'https://example.org' } });
    assert.equal(foreign.status, 403);
    const noOrigin = await fetch(`${origin}/api/realtime/debug-log`, { method: 'POST', body: marker });
    assert.equal(noOrigin.status, 403);
    const own = await fetch(`${origin}/api/realtime/debug-log`, { method: 'POST', headers: { Origin: origin }, body: marker });
    assert.equal(own.status, 204);
    const geo = await fetch(`${origin}/api/google/geocode?address=Istanbul`);
    assert.equal(geo.status, 503);
    assert.equal((await geo.json()).configured, false);
    const traffic = await fetch(`${origin}/api/tomtom/status`);
    assert.equal(traffic.status, 200);
    assert.equal((await traffic.json()).hasKey, false);
  }
});
