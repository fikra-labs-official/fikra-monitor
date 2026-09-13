import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { admitLocalApi, PRIVATE_FILE_PATTERN, safeDebugRecord, safeProviderError, writeSafeDebugLog } from './localSecurity.mjs';

const request = (patch = {}) => ({ method: 'GET', socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:4173' }, ...patch });

test('API admission refuses remote, rebinding, cross-origin, proxy, and originless writes', () => {
  assert.equal(admitLocalApi(request()), true);
  assert.equal(admitLocalApi(request({ socket: { remoteAddress: '192.168.1.2' } })), false);
  for (const headers of [
    { host: 'attacker.example:4173' },
    { host: '127.0.0.1:4173', origin: 'https://attacker.example' },
    { host: '127.0.0.1:4173', origin: 'null' },
    { host: '127.0.0.1:4173', 'sec-fetch-site': 'cross-site' },
    { host: '127.0.0.1:4173', 'sec-fetch-site': 'same-site' },
    { host: '127.0.0.1:4173', 'x-forwarded-for': '127.0.0.1' },
  ]) assert.equal(admitLocalApi(request({ headers })), false);
  assert.equal(admitLocalApi(request({ method: 'POST' })), false);
  assert.equal(admitLocalApi(request({ method: 'POST', headers: { host: '127.0.0.1:4173', origin: 'http://127.0.0.1:4173' } })), true);
});

test('private config, diagnostics, caches and screenshots cannot be served', () => {
  for (const file of ['/.env', '/.env.local', '/@fs/project/.env.production', '/pinokio/ENVIRONMENT', '/.gev-logs/a.jsonl', '/artifacts/shot.png', '/output/a.txt', '/.git/config', '/secrets.pem']) {
    assert.equal(PRIVATE_FILE_PATTERN.test(file), true, file);
  }
  for (const file of ['/src/main.js', '/style.css', '/public/branding/logo.png', '/api/realtime/token']) {
    assert.equal(PRIVATE_FILE_PATTERN.test(file), false, file);
  }
});

test('diagnostics discard all untrusted strings, secrets, and conversation payloads', () => {
  const output = safeDebugRecord({ status: 'listening', event: 'secret', sessionId: 'secret', payload: { transcript: 'private conversation', apiKey: 'secret' } }, new Date(0));
  assert.deepEqual(output, { loggedAt: '1970-01-01T00:00:00.000Z', event: 'voice-diagnostic', status: 'listening' });
  assert.equal(safeDebugRecord({ status: 'secret' }).status, 'unknown');
});

test('diagnostics are opt-in, owner-only, rotate at a bound, and reject symlinks', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fikra-log-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'logs', 'realtime.jsonl');
  assert.equal(writeSafeDebugLog(file, { payload: 'secret' }), false);
  assert.equal(fs.existsSync(file), false);
  for (let i = 0; i < 5; i += 1) writeSafeDebugLog(file, { status: 'idle' }, { enabled: true, maxBytes: 180 });
  assert.ok(fs.statSync(file).size <= 180);
  assert.ok(fs.statSync(`${file}.1`).size <= 180);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const target = path.join(dir, 'untouched');
  fs.writeFileSync(target, 'must remain');
  fs.unlinkSync(file);
  fs.symlinkSync(target, file);
  assert.throws(() => writeSafeDebugLog(file, {}, { enabled: true }), /Unsafe/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'must remain');
});

test('provider errors redact both known credentials and URL/bearer secrets', () => {
  const env = { GOOGLE_MAPS_SERVER_API_KEY: 'synthetic-test-secret' };
  assert.equal(safeProviderError(new Error('bad synthetic-test-secret'), env), 'bad [redacted]');
  assert.equal(safeProviderError('https://example.org/?key=hidden&other=safe', {}), 'https://example.org/?key=[redacted]&other=safe');
  assert.equal(safeProviderError('Authorization: Bearer hidden', {}), 'Authorization: Bearer [redacted]');
});
