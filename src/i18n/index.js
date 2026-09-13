import commonMessages from './ru/common.js';
import dataMessages from './ru/data.js';
import systemMessages from './ru/system.js';
import uiMessages from './ru/ui.js';
import voiceMessages from './ru/voice.js';

export const APP_LOCALE = 'ru-RU';

const messages = Object.freeze({
  ...commonMessages,
  ...dataMessages,
  ...systemMessages,
  ...uiMessages,
  ...voiceMessages,
});

/**
 * Return a Russian UI message and replace {named} parameters.
 * A readable fallback keeps the interface usable while a new key is being added.
 */
export function t(key, params = {}, fallback = key) {
  const template = messages[key] ?? fallback;
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => (
    Object.hasOwn(params, name) ? String(params[name]) : match
  ));
}

/** Choose the correct Russian noun form for a non-negative integer. */
export function pluralRu(value, [one, few, many]) {
  const count = Math.abs(Math.trunc(Number(value) || 0));
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function formatNumberRu(value, options) {
  return new Intl.NumberFormat(APP_LOCALE, options).format(value);
}

export function hasTranslation(key) {
  return Object.hasOwn(messages, key);
}
