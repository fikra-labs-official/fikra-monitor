const GOOGLE_GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const MAX_RESPONSE_BYTES = 1024 * 1024;
const ALLOWED_PARAMS = new Set(['address', 'latlng', 'bounds', 'language']);
const GOOGLE_STATUSES = new Set([
  'OK', 'ZERO_RESULTS', 'OVER_DAILY_LIMIT', 'OVER_QUERY_LIMIT',
  'REQUEST_DENIED', 'INVALID_REQUEST', 'UNKNOWN_ERROR',
]);

function coordinates(value) {
  const parts = String(value || '').split(',');
  // Cesium emits full-precision doubles, including scientific notation near zero.
  if (parts.length !== 2 || parts.some((part) => part.length > 32 || !/^-?\d{1,3}(?:\.\d{1,20})?(?:e[+-]?\d{1,2})?$/i.test(part.trim()))) return null;
  const [lat, lng] = parts.map(Number);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return `${lat},${lng}`;
}

export function geocodingParams(searchParams) {
  for (const key of searchParams.keys()) {
    if (!ALLOWED_PARAMS.has(key) || searchParams.getAll(key).length !== 1) return null;
  }
  const address = searchParams.get('address')?.trim();
  const latlng = searchParams.get('latlng');
  if (Boolean(address) === Boolean(latlng)) return null;
  const params = new URLSearchParams();
  if (address) {
    if (address.length > 300 || /[\x00-\x1f\x7f]/.test(address)) return null;
    params.set('address', address);
  } else {
    const point = coordinates(latlng);
    if (!point) return null;
    params.set('latlng', point);
  }
  const bounds = searchParams.get('bounds');
  if (bounds !== null) {
    if (!address || bounds.length > 100) return null;
    const pair = bounds.split('|');
    if (pair.length !== 2) return null;
    const sw = coordinates(pair[0]);
    const ne = coordinates(pair[1]);
    if (!sw || !ne || Number(sw.split(',')[0]) > Number(ne.split(',')[0])) return null;
    params.set('bounds', `${sw}|${ne}`);
  }
  const language = searchParams.get('language') || 'ru';
  if (!/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(language)) return null;
  params.set('language', language);
  return params;
}

async function boundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('empty_response');
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('response_too_large');
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function reply(res, code, payload) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export function googleGeocodingProxy({
  fetchImpl = globalThis.fetch,
  getApiKey = () => process.env.GOOGLE_MAPS_SERVER_API_KEY || process.env.GOOGLE_MAPS_API_KEY,
  allowRequest = () => true,
} = {}) {
  const install = (middlewares) => {
    middlewares.use('/api/google/geocode', async (req, res) => {
      const empty = { status: 'UNKNOWN_ERROR', results: [] };
      if (req.method !== 'GET') return reply(res, 405, { ...empty, status: 'INVALID_REQUEST' });
      let params;
      try {
        params = geocodingParams(new URL(req.url, 'http://localhost').searchParams);
      } catch {
        params = null;
      }
      if (!params) return reply(res, 400, { ...empty, status: 'INVALID_REQUEST' });
      const key = String(getApiKey() || '').trim();
      if (!key) return reply(res, 503, { ...empty, status: 'REQUEST_DENIED', configured: false });
      if (!allowRequest(req, res)) return;
      params.set('key', key);
      try {
        const upstream = await fetchImpl(`${GOOGLE_GEOCODING_URL}?${params}`, {
          signal: AbortSignal.timeout(6000),
          redirect: 'error',
        });
        if (!upstream.ok) return reply(res, 502, empty);
        const data = await boundedJson(upstream);
        const status = GOOGLE_STATUSES.has(data?.status) ? data.status : 'UNKNOWN_ERROR';
        return reply(res, 200, {
          status,
          results: status === 'OK' && Array.isArray(data.results) ? data.results.slice(0, 12) : [],
        });
      } catch (error) {
        return reply(res, error?.name === 'TimeoutError' ? 504 : 502, empty);
      }
    });
  };
  return {
    name: 'google-geocoding-proxy',
    configureServer(server) { install(server.middlewares); },
    configurePreviewServer(server) { install(server.middlewares); },
  };
}
