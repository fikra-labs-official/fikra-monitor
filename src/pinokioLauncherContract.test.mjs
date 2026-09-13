import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { access, copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { isDirectInvocation } from '../scripts/pinokio-install.mjs';
import { loadViteFromCanonicalRoot } from '../scripts/pinokio-start.mjs';

const require = createRequire(import.meta.url);

test('Pinokio start has one fail-closed launcher process', () => {
  const script = require('../pinokio/start.js');
  assert.equal(script.run[0].params.message, 'node scripts/pinokio-start.mjs');
  assert.equal(Array.isArray(script.run[0].params.message), false);
  assert.match(script.run[0].params.on[0].event, /\\\[Pinokio\\\] Ready at/);
  assert.deepEqual(script.run[0].params.env, { HOST: '127.0.0.1', PORT: '{{port}}' });
  assert.doesNotMatch(JSON.stringify(script), /\{\{env\./);
});

test('Pinokio install records success explicitly instead of trusting node_modules', async () => {
  const install = require('../pinokio/install.js');
  const fs = await import('node:fs/promises');
  const installSource = await fs.readFile(new URL('../scripts/pinokio-install.mjs', import.meta.url), 'utf8');
  assert.equal(install.run.at(-1).params.message, 'node scripts/pinokio-install.mjs');
  assert.equal(install.run[0].when, "{{!kernel.exists(cwd, 'ENVIRONMENT')}}");
  assert.match(installSource, /includeKeychain: false/);
  assert.match(installSource, /authoritativeEnvironment: true/);
  assert.match(installSource, /applyPinokioEnvironment\(\)/);
  assert.match(installSource, /Return to Pinokio and choose Start/);
  assert.equal('env' in install.run.at(-1).params, false);
  assert.doesNotMatch(JSON.stringify(install), /\{\{env\./);
});

test('Pinokio menu resolves the nested install marker and exposes each lifecycle state', async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'gev-pinokio-menu-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const launcherDir = path.join(fixture, 'app', 'pinokio');
  const launcherPath = path.join(launcherDir, 'pinokio.js');
  const markerPath = path.join(launcherDir, '.installed');
  await mkdir(launcherDir, { recursive: true });
  await copyFile(new URL('../pinokio/pinokio.js', import.meta.url), launcherPath);

  const existsCalls = [];
  const kernel = {
    exists: async (...chunks) => {
      existsCalls.push(chunks);
      try {
        await access(path.resolve(...chunks));
        return true;
      } catch {
        return false;
      }
    },
  };
  const runtime = { running: null, url: null };
  const info = {
    exists: () => assert.fail('menu must resolve the marker through kernel.exists'),
    running: (href) => runtime.running === href,
    local: () => runtime.url ? { url: runtime.url } : {},
  };
  const { menu } = require(launcherPath);
  const render = async ({ installed, running = null, url = null }) => {
    if (installed) await writeFile(markerPath, 'ready\n');
    else await rm(markerPath, { force: true });
    runtime.running = running;
    runtime.url = url;
    const items = await menu(kernel, info);
    assert.equal(items.filter((item) => item.default).length, 1);
    return items.map(({ text, href, default: isDefault = false }) => ({ text, href, default: isDefault }));
  };

  assert.deepEqual(await render({ installed: false }), [
    { text: 'Install', href: 'install.js', default: true },
  ]);
  assert.deepEqual(await render({ installed: true }), [
    { text: 'Start', href: 'start.js', default: true },
    { text: 'Update', href: 'update.js', default: false },
    { text: 'Repair installation', href: 'reset.js', default: false },
  ]);
  for (const [running, text] of [
    ['install.js', 'Installing'],
    ['update.js', 'Updating'],
    ['reset.js', 'Resetting'],
  ]) {
    assert.deepEqual(await render({ installed: true, running }), [
      { text, href: running, default: true },
    ]);
  }
  assert.deepEqual(await render({ installed: true, running: 'start.js' }), [
    { text: 'Starting', href: 'start.js', default: true },
  ]);
  assert.deepEqual(await render({
    installed: true,
    running: 'start.js',
    url: 'http://127.0.0.1:4173/',
  }), [
    { text: "Open God's Eye View", href: 'http://127.0.0.1:4173/', default: true },
    { text: 'Server', href: 'start.js', default: false },
  ]);
  assert.ok(existsCalls.length >= 7);
  const resolvedLauncherDir = realpathSync(launcherDir);
  for (const chunks of existsCalls) {
    assert.deepEqual(chunks, [resolvedLauncherDir, '.installed']);
  }
});

test('Pinokio install recognizes direct execution through a linked app directory', async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'gev-pinokio-entry-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const target = path.join(fixture, 'candidate');
  const linked = path.join(fixture, 'installed-app');
  const other = path.join(fixture, 'other-install.mjs');
  const modulePath = path.join(target, 'scripts', 'pinokio-install.mjs');
  await mkdir(path.dirname(modulePath), { recursive: true });
  await writeFile(modulePath, '');
  await writeFile(other, '');
  await symlink(target, linked, process.platform === 'win32' ? 'junction' : 'dir');

  assert.equal(isDirectInvocation(
    path.join(linked, 'scripts', 'pinokio-install.mjs'),
    modulePath,
  ), true);
  assert.equal(isDirectInvocation(other, modulePath), false);
});

test('Pinokio direct execution fallback remains exact and Update-safe', () => {
  const missing = path.join(os.tmpdir(), 'gev-missing-pinokio-install.mjs');
  const differentMissing = path.join(os.tmpdir(), 'gev-other-missing-pinokio-install.mjs');
  const updatePath = path.resolve('scripts/pinokio-update.mjs');
  const installPath = path.resolve('scripts/pinokio-install.mjs');

  assert.equal(isDirectInvocation(missing, missing), true);
  assert.equal(isDirectInvocation(differentMissing, missing), false);
  assert.equal(isDirectInvocation(updatePath, installPath), false);
  assert.equal(isDirectInvocation('', installPath), false);
});

test('Pinokio Update keeps credential values out of shell task metadata', () => {
  const update = require('../pinokio/update.js');
  assert.equal(update.run[0].params.message, 'node scripts/pinokio-update.mjs');
  assert.equal('env' in update.run[0].params, false);
  assert.doesNotMatch(JSON.stringify(update), /\{\{env\./);
});

test('Pinokio start runner emits an ANSI-independent ready URL', async () => {
  const source = await import('node:fs/promises')
    .then((fs) => fs.readFile(new URL('../scripts/pinokio-start.mjs', import.meta.url), 'utf8'));
  assert.match(source, /\[Pinokio\] Ready at http:\/\/127\.0\.0\.1:\$\{port\}\//);
  assert.match(source, /applyPinokioEnvironment\(\)/);
  assert.match(source, /loadViteFromCanonicalRoot\(\)/);
  assert.ok(
    source.indexOf('loadViteFromCanonicalRoot()') < source.indexOf('createServer({'),
  );
});

test('Pinokio start enters the canonical app root before loading Vite', async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'gev-pinokio-root-'));
  const originalCwd = process.cwd();
  t.after(async () => {
    process.chdir(originalCwd);
    await rm(fixture, { recursive: true, force: true });
  });
  const target = path.join(fixture, 'candidate');
  const linked = path.join(fixture, 'installed-app');
  await mkdir(target, { recursive: true });
  await symlink(target, linked, process.platform === 'win32' ? 'junction' : 'dir');
  const sentinel = { createServer: Symbol('createServer') };

  const loaded = await loadViteFromCanonicalRoot(linked, async () => {
    assert.equal(process.cwd(), realpathSync(target));
    return sentinel;
  });

  assert.equal(loaded, sentinel);
});

test('Pinokio keeps the supported local.url readiness key while disabling its share trigger', async () => {
  const script = require('../pinokio/start.js');
  const menuSource = await import('node:fs/promises')
    .then((fs) => fs.readFile(new URL('../pinokio/pinokio.js', import.meta.url), 'utf8'));
  assert.equal(script.run[1].method, 'local.set');
  assert.equal(script.run[1].params.url, '{{input.event[1]}}');
  assert.match(menuSource, /local\?\.url/);
  assert.equal('PINOKIO_SHARE_VAR' in script.run[0].params.env, false);
});
