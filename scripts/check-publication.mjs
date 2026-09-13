#!/usr/bin/env node
// ponytail: Git supplies the publication inventory; this checks current files and any changed index blobs.
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stagedOnly = process.argv.slice(2).includes('--staged');
if (process.argv.slice(2).some((arg) => arg !== '--staged')) {
  console.error('Usage: node scripts/check-publication.mjs [--staged]');
  process.exit(2);
}

function git(args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { maxBuffer: 64 * 1024 * 1024 });
  } catch {
    throw new Error('Git inventory or staged blob could not be read');
  }
}

function names(args) {
  return git([...args, '-z']).toString('utf8').split('\0').filter(Boolean);
}

function indexModes() {
  const modes = new Map();
  for (const entry of git(['ls-files', '--stage', '-z']).toString('utf8').split('\0').filter(Boolean)) {
    const match = entry.match(/^(\d{6}) [0-9a-f]{40,64} [0-3]\t([\s\S]+)$/);
    if (!match) throw new Error('Git index entry could not be parsed');
    modes.set(match[2], match[1]);
  }
  return modes;
}

function fileRule(file) {
  const parts = file.replaceAll('\\', '/').split('/');
  const normalized = parts.join('/').toLowerCase();
  const base = parts.at(-1).toLowerCase();
  const segments = parts.map((part) => part.toLowerCase());
  if (normalized === 'pinokio/environment') return 'pinokio-credential-store';
  if (normalized === 'pinokio/.installed') return 'local-install-marker';
  if (segments.some((part) => /^(?:\.gev-(?:logs|cache)|\.playwright-cli|artifacts|output|dist|build|coverage|screenshots?|qa-shots|playwright-report|test-results|node_modules|\.cache|\.vite|\.turbo|\.next|\.output|browser-profile|chrome-profile|chromium-profile|firefox-profile|user-data-dir|user-data|local storage|session storage|indexeddb|browsermetrics)$/.test(part))) return 'local-output-or-profile';
  if (/^\.env(?:\..+)?$/.test(base) && base !== '.env.example') return 'dotenv-file';
  if (/^(?:\.netrc|\.npmrc|id_rsa|id_ed25519|credentials\.json|client_secret[^/]*|service.account[^/]*)$/.test(base)) return 'credential-file';
  if (/\.(?:pem|key|p12|pfx|jks|keystore|sqlite|sqlite3|db|zip|7z|rar|tar|tgz|gz)$/.test(base)) return 'private-or-archive-file';
  if (/opensky/i.test(base) && /(?:credential|secret|token|cookie|auth|client)/i.test(base) && /\.(?:json|txt|csv|ini|conf|config|env|yaml|yml)$/.test(base)) return 'opensky-credential-export';
  if (/(?:screen[-_]?shot|screen[-_]?capture)/i.test(base) && /\.(?:png|jpe?g|webp|gif|avif|heic|pdf)$/.test(base)) return 'screenshot-file';
  return null;
}

function localSecrets() {
  const values = new Set();
  for (const name of readdirSync(root).filter((name) => /^\.env(?:\..+)?$/.test(name) && name !== '.env.example')) {
    let content;
    try { content = readFileSync(path.join(root, name), 'utf8'); } catch { continue; }
    for (const line of content.split(/\r?\n/)) {
      const assignment = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!assignment || !/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|CLIENT_ID|USERNAME)/i.test(assignment[1])) continue;
      let value = assignment[2].trim();
      if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
      else value = value.replace(/\s+#.*$/, '').trim();
      if (value.length >= 8 && !/^(?:your|replace|example|sample|dummy|test|placeholder|<|\$\{)/i.test(value)) values.add(value);
    }
  }
  return [...values];
}

const signatures = [
  ['openai-key', /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['gitlab-token', /\bglpat-[A-Za-z0-9_-]{20,}\b/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['private-key-block', /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
];

function contentFindings(content, secrets) {
  const findings = [];
  const lines = content.toString('utf8').split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    for (const [rule, pattern] of signatures) {
      if (pattern.test(line)) findings.push([index + 1, rule]);
    }
    if (secrets.some((value) => line.includes(value))) findings.push([index + 1, 'local-credential-value']);
    const literal = line.match(/\b(?:[A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS)|(?:apiKey|accessToken|clientSecret))\b\s*[:=]\s*['"]([^'"\s]{40,})['"]/);
    if (literal && /[A-Za-z]/.test(literal[1]) && /\d/.test(literal[1]) && !/(?:your|replace|example|sample|dummy|test|fixture|synthetic|placeholder)/i.test(literal[1])) findings.push([index + 1, 'credential-literal']);
  }
  return findings;
}

function safeName(name) {
  return name.replace(/[\x00-\x1f\x7f]/g, (character) => `\\x${character.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

try {
  const indexed = indexModes();
  const tracked = new Set(indexed.keys());
  const candidates = stagedOnly ? [] : names(['ls-files', '--others', '--exclude-standard']);
  const stagedChanges = stagedOnly ? tracked : new Set(names(['diff', '--cached', '--name-only', '--diff-filter=ACMR']));
  const secrets = localSecrets();
  const findings = [];
  const scan = (file, fromIndex) => {
    const label = safeName(file);
    const rule = fileRule(file);
    if (rule) { findings.push(`${label}:1:${rule}`); return; }
    let content;
    try {
      if (fromIndex) {
        if (!/^100(?:644|755)$/.test(indexed.get(file) || '')) { findings.push(`${label}:1:non-regular-index-file`); return; }
        content = git(['cat-file', 'blob', `:${file}`]);
      }
      else {
        const absolute = path.join(root, file);
        if (!lstatSync(absolute).isFile()) { findings.push(`${label}:1:non-regular-file`); return; }
        content = readFileSync(absolute);
      }
    } catch {
      findings.push(`${label}:1:unreadable-file`);
      return;
    }
    for (const [line, issue] of contentFindings(content, secrets)) findings.push(`${label}:${line}:${issue}`);
  };
  for (const file of new Set([...tracked, ...candidates])) {
    if (!stagedOnly) scan(file, false);
    if (stagedChanges.has(file)) scan(file, true);
  }
  if (findings.length) {
    for (const finding of findings) console.error(finding);
    console.error(`Publication check failed: ${findings.length} finding(s).`);
    process.exitCode = 1;
  } else {
    console.log(`Publication check passed: ${tracked.size} tracked, ${candidates.length} nonignored candidate files${stagedOnly ? ' (index only)' : ''}.`);
  }
  console.log('Scope: current files and changed index blobs only; Git history requires a separate full-history secret scan.');
} catch (error) {
  console.error(`Publication check could not run: ${error.message}`);
  process.exitCode = 2;
}
