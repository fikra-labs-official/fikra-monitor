// The HUD summary's locality tag. The 2026-08-20 QA hunt caught the HUD calling
// out landmarks on other continents — NEAR SACRE-COEUR (PARIS) 2470KM while
// parked over Moscow — because the NEAR bound was 2,500 km. These pin the metro
// bound, both sides of it, and the SECTOR fallback that already worked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composeLocalityTag, NEAR_POI_MAX_KM } from './hudLocality.js';

const ALCATRAZ = { poi: 'Alcatraz Island', city: 'San Francisco' };
const LINCOLN = { poi: 'Lincoln Memorial', city: 'Washington DC' };
const SACRE_COEUR = { poi: 'Sacré-Cœur', city: 'Paris' };

test('the NEAR bound is metro scale, not continental', () => {
  assert.equal(NEAR_POI_MAX_KM, 150);
});

test('a landmark under the camera reads NEAR', () => {
  assert.equal(
    composeLocalityTag({ ...ALCATRAZ, distKm: 2.4 }, 37.8267, -122.4230),
    'РЯДОМ С ALCATRAZ ISLAND (SAN FRANCISCO) 2 КМ',
  );
  assert.equal(
    composeLocalityTag({ ...LINCOLN, distKm: 0.6 }, 38.8893, -77.0502),
    'РЯДОМ С LINCOLN MEMORIAL (WASHINGTON DC) 1 КМ',
  );
});

test('the field failures now fall through to the SECTOR readout', () => {
  // Over Moscow, 2,470 km from the nearest catalogued POI.
  assert.equal(
    composeLocalityTag({ ...SACRE_COEUR, distKm: 2470 }, 55.7558, 37.6173),
    'СЕКТОР 55,76С 37,62В',
  );
  // Over Chicago, 962 km from the Lincoln Memorial.
  assert.equal(
    composeLocalityTag({ ...LINCOLN, distKm: 962 }, 41.8781, -87.6298),
    'СЕКТОР 41,88С 87,63З',
  );
});

test('the boundary is pinned on both sides, inclusive at the bound', () => {
  const at = composeLocalityTag({ ...LINCOLN, distKm: NEAR_POI_MAX_KM }, 40, -78);
  assert.match(at, /^РЯДОМ С LINCOLN MEMORIAL/, 'exactly at the bound still reads NEAR');

  const just_under = composeLocalityTag({ ...LINCOLN, distKm: NEAR_POI_MAX_KM - 0.1 }, 40, -78);
  assert.match(just_under, /^РЯДОМ С LINCOLN MEMORIAL/);

  const just_over = composeLocalityTag({ ...LINCOLN, distKm: NEAR_POI_MAX_KM + 0.1 }, 40, -78);
  assert.match(just_over, /^СЕКТОР /, 'one step past the bound falls through');
});

test('southern and western hemispheres carry the right suffixes', () => {
  // Rio and Honolulu — the two the fallback already handled correctly in the field.
  assert.equal(composeLocalityTag(null, -22.9068, -43.1729), 'СЕКТОР 22,91Ю 43,17З');
  assert.equal(composeLocalityTag(null, 21.3069, -157.8583), 'СЕКТОР 21,31С 157,86З');
});

// The tests above all pass against a hud.js that still computes the tag inline —
// they only exercise the helper. This pins the PRODUCTION wiring: hud.js must
// import the helper, call it, and no longer carry the old 2,500 km branch.
// (hud.js itself cannot be imported here: it pulls in the `mgrs` CommonJS package,
// which Vite resolves but plain Node cannot import by named export.)
test('hud.js actually composes its summary through this helper', () => {
  const source = readFileSync(new URL('./hud.js', import.meta.url), 'utf8');
  // Boolean probes, not assert.match on the whole file — a failure here should
  // name the missing wiring, not print all of hud.js.
  const has = (pattern) => pattern.test(source);
  assert.equal(
    has(/import \{ composeLocalityTag \} from '\.\/hudLocality\.js';/),
    true,
    'hud.js must import composeLocalityTag from ./hudLocality.js',
  );
  assert.equal(
    has(/const localityTag = composeLocalityTag\(nearest, m\.latDeg, m\.lonDeg\)/),
    true,
    '_composeSummary must build its locality tag through composeLocalityTag()',
  );
  assert.equal(
    has(/distKm < 2500/),
    false,
    'the continental NEAR bound must not come back inline in hud.js',
  );
  assert.equal(
    has(/NEAR \$\{/),
    false,
    'the NEAR line must be composed in hudLocality.js, not re-inlined in hud.js',
  );
});

test('a missing or malformed nearest POI never crashes the summary', () => {
  assert.match(composeLocalityTag(null, 0, 0), /^СЕКТОР /);
  assert.match(composeLocalityTag(undefined, 0, 0), /^СЕКТОР /);
  assert.match(composeLocalityTag({ ...LINCOLN, distKm: NaN }, 10, 10), /^СЕКТОР /);
  assert.match(composeLocalityTag({ ...LINCOLN }, 10, 10), /^СЕКТОР /);
});
