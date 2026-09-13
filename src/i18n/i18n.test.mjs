import assert from 'node:assert/strict';
import test from 'node:test';

import { APP_LOCALE, formatNumberRu, hasTranslation, pluralRu, t } from './index.js';

test('Russian localization resolves messages and named parameters', () => {
  assert.equal(APP_LOCALE, 'ru-RU');
  assert.equal(t('common.off'), 'ВЫКЛ');
  assert.equal(
    t('map.stackUnavailable', { label: 'Bing' }),
    'Источник карты «Bing» недоступен',
  );
  assert.equal(hasTranslation('map.ionRequired'), true);
});

test('Russian plural forms cover one, few, many, and teen values', () => {
  const forms = ['камера', 'камеры', 'камер'];
  assert.equal(pluralRu(1, forms), 'камера');
  assert.equal(pluralRu(2, forms), 'камеры');
  assert.equal(pluralRu(5, forms), 'камер');
  assert.equal(pluralRu(11, forms), 'камер');
  assert.equal(pluralRu(21, forms), 'камера');
});

test('Russian number formatting uses a comma decimal separator', () => {
  assert.equal(formatNumberRu(12.5, { minimumFractionDigits: 1 }), '12,5');
});
