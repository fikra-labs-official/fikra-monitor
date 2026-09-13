import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { hasTranslation } from './index.js';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    if (!entry.isFile() || !entry.name.endsWith('.js')) return [];
    return [target];
  });
}

test('every literal translation key used by production code is registered', () => {
  const missing = [];
  for (const file of sourceFiles(SRC_ROOT)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bt\(\s*(['"])([^'"]+)\1/g)) {
      if (!hasTranslation(match[2])) {
        missing.push(`${path.relative(SRC_ROOT, file)}: ${match[2]}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('the static application shell stays Russian', () => {
  const htmlPath = path.resolve(SRC_ROOT, '../index.html');
  const html = readFileSync(htmlPath, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  assert.match(html, /<html lang="ru">/);
  for (const retiredCopy of [
    "GOD'S EYE VIEW",
    'ACTIVE STYLE',
    'DATA LAYERS',
    'VISUAL PRESETS',
    'Choose your first view',
    'VOICE SYSTEM ERROR',
    'Map source',
  ]) {
    assert.equal(html.includes(retiredCopy), false, `English UI copy returned: ${retiredCopy}`);
  }
});
