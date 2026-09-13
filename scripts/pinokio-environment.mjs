import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { hardenCredentialFile } from '../src/keySetupHardening.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ENVIRONMENT_FILE = path.join(ROOT, 'pinokio', 'ENVIRONMENT');

export const PINOKIO_CONFIG_FIELDS = Object.freeze([
  'GOOGLE_MAPS_API_KEY',
  'GOOGLE_MAPS_SERVER_API_KEY',
  'CESIUM_ION_TOKEN',
  'OPENAI_API_KEY',
  'AISSTREAM_API_KEY',
  'FIRMS_MAP_KEY',
  'TOMTOM_API_KEY',
  'OPENSKY_CLIENT_ID',
  'OPENSKY_CLIENT_SECRET',
  'LL2_API_TOKEN',
  'GEV_RATELIMIT_OPENAI_PER_MIN',
  'GEV_RATELIMIT_GOOGLE_PER_MIN',
  'PINOKIO_SHARE_CLOUDFLARE',
  'PINOKIO_SHARE_LOCAL',
  'PINOKIO_SHARE_VAR',
]);

const PINOKIO_DEFAULTS = Object.freeze({
  GEV_RATELIMIT_OPENAI_PER_MIN: '30',
  GEV_RATELIMIT_GOOGLE_PER_MIN: '120',
  PINOKIO_SHARE_CLOUDFLARE: 'false',
  PINOKIO_SHARE_LOCAL: 'false',
  PINOKIO_SHARE_VAR: '__gev_sharing_disabled__',
});

const PINOKIO_SHARE_SENTINEL = '__gev_sharing_disabled__';
const PINOKIO_SHARING_FIELDS = Object.freeze([
  'PINOKIO_SHARE_CLOUDFLARE',
  'PINOKIO_SHARE_LOCAL',
  'PINOKIO_SHARE_VAR',
]);

function appendEnvironmentLine(source, line) {
  const prefix = source.length > 0 && !source.endsWith('\n') ? '\n' : '';
  return `${source}${prefix}${line}\n`;
}

function detectEnvironmentEncoding(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return 'utf-16le';
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) return 'utf-16be';

  let evenNulls = 0;
  let oddNulls = 0;
  const sampleLength = Math.min(buffer.length, 512);
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] !== 0) continue;
    if (index % 2 === 0) evenNulls += 1;
    else oddNulls += 1;
  }
  const minimumNulls = Math.max(2, Math.floor(sampleLength / 16));
  if (oddNulls >= minimumNulls && oddNulls > evenNulls * 2) return 'utf-16le';
  if (evenNulls >= minimumNulls && evenNulls > oddNulls * 2) return 'utf-16be';
  return 'utf-8';
}

export function readEnvironmentSource(filepath) {
  if (!existsSync(filepath)) return '';
  const buffer = readFileSync(filepath);
  try {
    return new TextDecoder(detectEnvironmentEncoding(buffer), { fatal: true }).decode(buffer);
  } catch {
    throw new Error('Pinokio ENVIRONMENT could not be decoded as UTF-8 or UTF-16.');
  }
}

function existingSafeStore(filepath) {
  const directory = lstatSync(path.dirname(filepath));
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    throw new Error('Pinokio configuration directory must be a real directory.');
  }
  try {
    const entry = lstatSync(filepath);
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error('Pinokio ENVIRONMENT must be a regular file, not a link.');
    }
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function persistEnvironment(filepath, encoded) {
  // ponytail: the same hardened-temp/rename pattern as Provider Settings; no shared abstraction.
  existingSafeStore(filepath);
  const tmp = path.join(path.dirname(filepath), `.${path.basename(filepath)}.${randomUUID()}.tmp`);
  const fd = openSync(tmp, 'wx', 0o600);
  let complete = false;
  try {
    if (!hardenCredentialFile(tmp)) {
      throw new Error('Pinokio ENVIRONMENT could not be restricted to your account.');
    }
    let offset = 0;
    while (offset < encoded.length) {
      const count = writeSync(fd, encoded, offset, encoded.length - offset);
      if (count <= 0) throw new Error('Pinokio ENVIRONMENT could not be written completely.');
      offset += count;
    }
    fsyncSync(fd);
    complete = true;
  } finally {
    closeSync(fd);
    if (!complete) rmSync(tmp, { force: true });
  }
  try {
    renameSync(tmp, filepath);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
}

/** Persist only the non-secret controls Pinokio itself re-reads at local.set. */
export function ensurePinokioSharingBoundary(filepath = DEFAULT_ENVIRONMENT_FILE) {
  const exists = existingSafeStore(filepath);
  // A manually edited store may already be world-readable. Tighten it even
  // when the sharing block is unchanged, and refuse to proceed on ACL failure.
  if (exists && !hardenCredentialFile(filepath)) {
    throw new Error('Pinokio ENVIRONMENT could not be restricted to your account.');
  }
  const original = exists ? readFileSync(filepath) : null;
  let source = readEnvironmentSource(filepath);
  try {
    if (source) parseEnv(source);
  } catch {
    throw new Error('Pinokio ENVIRONMENT could not be parsed.');
  }

  // Pinokio re-reads this file after the child preflight. Remove every legacy,
  // blank, or duplicate control before appending one canonical safe block so
  // that its later global/app merge cannot diverge from the checked state.
  const sharingLine = new RegExp(
    `^[\\t ]*(?:${PINOKIO_SHARING_FIELDS.join('|')})[\\t ]*=.*(?:\\r?\\n|$)`,
    'gm',
  );
  source = source.replace(sharingLine, '');
  source = appendEnvironmentLine(source, [
    'PINOKIO_SHARE_CLOUDFLARE=false',
    'PINOKIO_SHARE_LOCAL=false',
    `PINOKIO_SHARE_VAR=${PINOKIO_SHARE_SENTINEL}`,
  ].join('\n'));

  let configured;
  try {
    configured = parseEnv(source);
  } catch {
    throw new Error('Pinokio ENVIRONMENT could not be parsed.');
  }

  const encoded = Buffer.from(source, 'utf8');
  if (!original || !original.equals(encoded)) {
    persistEnvironment(filepath, encoded);
  }
  return configured;
}

/** Read the app-scoped Pinokio configuration without exposing its values. */
export function readPinokioEnvironment(filepath = DEFAULT_ENVIRONMENT_FILE) {
  if (!existsSync(filepath)) return {};
  try {
    return parseEnv(readEnvironmentSource(filepath));
  } catch {
    throw new Error('Pinokio ENVIRONMENT could not be parsed.');
  }
}

/**
 * Make the app-scoped Pinokio file authoritative over Pinokio-global values.
 * Pinokio removes blank entries before merging environments, so each child
 * must restore the raw app value before diagnosis or Vite configuration.
 */
export function applyPinokioEnvironment({
  environment = process.env,
  filepath = DEFAULT_ENVIRONMENT_FILE,
} = {}) {
  const configured = ensurePinokioSharingBoundary(filepath);
  for (const field of PINOKIO_CONFIG_FIELDS) {
    environment[field] = String(configured[field] ?? PINOKIO_DEFAULTS[field] ?? '');
  }

  // Sharing is unsupported on Pinokio 8.0.40. Never let a global passcode
  // enter the child even if the host's global Pinokio environment defines it.
  environment.PINOKIO_SHARE_PASSCODE = '';
  return configured;
}
