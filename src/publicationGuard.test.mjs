import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const checker = fileURLToPath(new URL('../scripts/check-publication.mjs', import.meta.url));

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'publication-guard-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  const put = (name, content) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  };
  const check = (...args) => spawnSync(process.execPath, [checker, ...args], { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  return { root, git, put, check };
}

test('safe template and harmless credential placeholders pass', (t) => {
  const { git, put, check } = fixture(t);
  put('.gitignore', '.env\n');
  put('.env', 'OPENAI_API_KEY="localsecret' + '12345678901234567890"\n');
  put('.env.example', 'OPENAI_API_KEY=your-key-here\nGOOGLE_MAPS_API_KEY=\n');
  put('src/deep/example.js', 'const example = "Bearer <token>";\n');
  put('src/deep/fixture.js', 'const keys = { GOOGLE_MAPS_API_KEY: "fixture-test-token123456789012345" };\n');
  git('add', '.gitignore', '.env.example');
  const result = check();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /passed/);
});

test('nonignored deep source and local env value are checked without disclosing value', (t) => {
  const { put, check } = fixture(t);
  const secret = 'localcredential' + '12345678901234567890';
  put('.env', 'SOME_API_KEY=' + secret + '\n');
  put('src/deep/nested/leak.js', 'export const accidental = "' + secret + '";\n');
  const result = check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/deep\/nested\/leak\.js:1:local-credential-value/);
  assert.doesNotMatch(result.stderr, new RegExp(secret));
});

test('tracked ignored dotenv and private filenames fail in staged mode', (t) => {
  const { git, put, check } = fixture(t);
  put('.gitignore', '.env\n');
  put('.env', 'SOME_API_KEY=private\n');
  put('backup/identity.pem', 'example\n');
  put('exports/opensky-credentials.json', '{}\n');
  git('add', '.gitignore', 'backup/identity.pem', 'exports/opensky-credentials.json');
  git('add', '-f', '.env');
  const result = check('--staged');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\.env:1:dotenv-file/);
  assert.match(result.stderr, /backup\/identity\.pem:1:private-or-archive-file/);
  assert.match(result.stderr, /exports\/opensky-credentials\.json:1:opensky-credential-export/);
});

test('changed index blob cannot be hidden by a clean working file', (t) => {
  const { git, put, check } = fixture(t);
  const key = 'sk-' + 'A'.repeat(30);
  put('src/changed.js', 'const key = "' + key + '";\n');
  git('add', 'src/changed.js');
  put('src/changed.js', 'export const okay = true;\n');
  for (const args of [[], ['--staged']]) {
    const result = check(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /src\/changed\.js:1:openai-key/);
    assert.doesNotMatch(result.stderr, new RegExp(key));
  }
});

test('real key signatures in safe-named candidates still fail', (t) => {
  const { put, check } = fixture(t);
  const google = 'AIza' + 'A'.repeat(35);
  put('.env.example', 'GOOGLE_MAPS_API_KEY=' + google + '\n');
  put('src/deep/key.txt', 'token ' + 'ghp_' + 'B'.repeat(36) + '\n');
  const result = check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\.env\.example:1:google-api-key/);
  assert.match(result.stderr, /src\/deep\/key\.txt:1:github-token/);
  assert.doesNotMatch(result.stderr, new RegExp(google));
});

test('long unfamiliar credential literals fail without echoing the value', (t) => {
  const { put, check } = fixture(t);
  const unknown = 'r4N'.repeat(15);
  put('src/unknown.js', 'const apiKey = "' + unknown + '";\n');
  const result = check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/unknown\.js:1:credential-literal/);
  assert.doesNotMatch(result.stderr, new RegExp(unknown));
});

test('local output, profiles, and screenshot candidates fail by path', (t) => {
  const { put, check } = fixture(t);
  put('artifacts/build-note.txt', 'safe\n');
  put('.playwright-cli/trace.txt', 'safe\n');
  put('docs/private-screenshot.png', 'safe\n');
  const result = check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /artifacts\/build-note\.txt:1:local-output-or-profile/);
  assert.match(result.stderr, /\.playwright-cli\/trace\.txt:1:local-output-or-profile/);
  assert.match(result.stderr, /docs\/private-screenshot\.png:1:screenshot-file/);
});

test('staged symlinks are rejected instead of trusting their target text', (t) => {
  const { root, git, check } = fixture(t);
  symlinkSync('somewhere-safe', path.join(root, 'shortcut'));
  git('add', 'shortcut');
  const result = check('--staged');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /shortcut:1:non-regular-index-file/);
});

test('forced-tracked Pinokio credential store is rejected by name', (t) => {
  const { git, put, check } = fixture(t);
  put('.gitignore', 'pinokio/ENVIRONMENT\n');
  put('pinokio/ENVIRONMENT', 'OPENAI_API_KEY=synthetic\n');
  git('add', '.gitignore');
  git('add', '-f', 'pinokio/ENVIRONMENT');
  const result = check('--staged');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pinokio\/ENVIRONMENT:1:pinokio-credential-store/);
  assert.doesNotMatch(result.stderr, /synthetic/);
});
