import fs from 'node:fs';
import path from 'node:path';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const LOCAL_SOCKETS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
export const PRIVATE_FILE_PATTERN = /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.npmrc|\.netrc|credentials\.json|ENVIRONMENT|\.git|\.gev-logs|\.gev-cache|artifacts|output|screenshots|qa-shots|\.playwright-cli)(?:\/|$)|\.(?:log|jsonl|pem|key|p12|pfx)$/i;

/** Local development brokers paid credentials; it is not a public API server. */
export function admitLocalApi(req) {
  if (!LOCAL_SOCKETS.has(req.socket?.remoteAddress)) return false;
  if (Object.keys(req.headers || {}).some((key) => /^(?:forwarded|via|x-forwarded-.+|x-real-ip|cf-connecting-ip)$/i.test(key))) return false;
  try {
    const protocol = req.socket?.encrypted ? 'https:' : 'http:';
    const authority = new URL(`${protocol}//${req.headers.host}`);
    if (!LOCAL_HOSTS.has(authority.hostname) || authority.username || authority.password || authority.pathname !== '/') return false;
    const fetchSite = req.headers['sec-fetch-site'];
    if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) return false;
    const origin = req.headers.origin;
    if (origin && origin !== authority.origin) return false;
    if (!['GET', 'HEAD'].includes(req.method) && !origin) return false;
    return true;
  } catch { return false; }
}

export function localSecurityPlugin() {
  function install(server) {
    server.middlewares.use((req, res, next) => {
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
      catch { res.statusCode = 400; res.end('Invalid path'); return; }
      if (PRIVATE_FILE_PATTERN.test(pathname) || (pathname.startsWith('/api/') && !admitLocalApi(req))) {
        res.statusCode = 403;
        res.setHeader('Cache-Control', 'no-store');
        res.end('Local request refused');
        return;
      }
      next();
    });
  }
  return { name: 'fikra-local-security', configureServer: install, configurePreviewServer: install };
}

/** Never persist client payloads, transcripts, URLs, session ids, or arbitrary strings. */
export function safeDebugRecord(record, now = new Date()) {
  const states = new Set(['idle', 'connecting', 'connected', 'listening', 'speaking', 'error', 'off', 'ready']);
  return {
    loggedAt: now.toISOString(),
    event: 'voice-diagnostic',
    status: states.has(record?.status) ? record.status : 'unknown',
  };
}

/** Opt-in, owner-only diagnostics, bounded to two files of at most 1 MiB each. */
export function writeSafeDebugLog(filename, record, { enabled = false, maxBytes = 1024 * 1024 } = {}) {
  if (!enabled) return false;
  const directory = path.dirname(filename);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const target of [directory, filename, `${filename}.1`]) {
    const stat = fs.lstatSync(target, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink() || (stat && target !== directory && !stat.isFile())) throw new Error('Unsafe diagnostic path');
  }
  const line = `${JSON.stringify(safeDebugRecord(record))}\n`;
  if ((fs.statSync(filename, { throwIfNoEntry: false })?.size || 0) + Buffer.byteLength(line) > maxBytes) {
    if (fs.existsSync(filename)) fs.renameSync(filename, `${filename}.1`);
  }
  const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW || 0), 0o600);
  try { fs.fchmodSync(fd, 0o600); fs.writeFileSync(fd, line); } finally { fs.closeSync(fd); }
  return true;
}

/** Keep provider errors useful without echoing keys embedded in URLs/messages. */
export function safeProviderError(error, env = process.env) {
  let text = String(error?.message || error || 'Request failed');
  for (const [name, value] of Object.entries(env)) {
    if (/(?:KEY|TOKEN|SECRET|PASSWORD|PASSCODE|CREDENTIAL)/i.test(name) && typeof value === 'string' && value.length >= 6) {
      text = text.split(value).join('[redacted]').split(encodeURIComponent(value)).join('[redacted]');
    }
  }
  return text.replace(/(?:sk-(?:proj-)?|ek_)[A-Za-z0-9_-]{16,}/g, '[redacted]')
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:key|access_token|api_key|token)=)[^&\s"']+/gi, '$1[redacted]').slice(0, 500);
}
