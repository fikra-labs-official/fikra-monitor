# Security / Безопасность

Fikra Monitor is a local-first fork of Bilawal Sidhu's God's Eye View for exploring **public** data. It is not a hardened production service. These notes apply to the local development/preview server, not to an independently audited deployment.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue for anything exploitable.

- Use [Fikra Monitor private vulnerability reporting](https://github.com/fikra-labs-official/fikra-monitor/security/advisories/new) (**Security → Report a vulnerability**).
- For a vulnerability specific to upstream God's Eye View, use [upstream private vulnerability reporting](https://github.com/bilawalsidhu/gods-eye-view/security/advisories/new).

Include minimal reproduction steps and impact, but no API keys or sensitive logs.

## How secrets are handled

The golden rule: **secret-bearing API keys stay on the server side.** The dev/preview server brokers requests needing private credentials. Google Maps browser and Cesium ion credentials are deliberate client-side exceptions; they are visible, not secret. Server-side Google requests prefer `GOOGLE_MAPS_SERVER_API_KEY` and fall back to the browser key only for compatibility.

| Key | Where it lives | How the browser uses it |
|-----|----------------|--------------------------|
| `OPENAI_API_KEY` | Server only | The default Live engine exchanges SDP through `/api/live/session`; the fallback Realtime engine fetches a short-lived **ephemeral** token from `/api/realtime/token`. The real key never ships |
| `AISSTREAM_API_KEY` | Server only | Server holds the AISStream websocket; browser polls the same-origin `/api/ais-live` cache |
| OpenSky OAuth (`OPENSKY_CLIENT_ID/SECRET`) | Server only | Server mints + refreshes the token behind `/api/opensky` |
| `GOOGLE_MAPS_SERVER_API_KEY` | Server only | Server handles Places API (New), Geocoding API and optional Street View Static requests |
| `FIRMS_MAP_KEY`, `TOMTOM_API_KEY`, `LL2_API_TOKEN`, `TFL_APP_KEY` | Server only | Browser calls same-origin data endpoints where supported |

### Two deliberately client-side keys — restrict them

These are designed to be used directly in the browser (like a Mapbox public token). They are injected into the client bundle via Vite's `define`, so they **will** be visible in browser devtools. Scope and restrict them rather than trying to hide them:

1. **Google Maps browser key** (`GOOGLE_MAPS_API_KEY`) — loads Photorealistic 3D Tiles. Restrict allowed website origins/referrers and API scope to Map Tiles API in Google Cloud. Use a **separate server key** for Places, Geocoding and Street View Static; browser and server application restrictions cannot safely be combined in one key. The compatibility fallback to one key may fail after proper browser restrictions are applied.
2. **Cesium ion token** (`CESIUM_ION_TOKEN`, optional) — supports selected imagery/terrain and ion-hosted assets. Use an app-specific public **`assets:read`** token with URL restrictions and only the assets/scopes needed.

> Client-visible credentials are **not secrets**. Browser tools, built assets, and requests can reveal them even when `.env` is gitignored. Review `vite.config.js` and built output when changing key handling.

Never commit real keys. `.env` is gitignored; only an empty-key `.env.example` is tracked. Do not put values in commands, screenshots, issue reports, PRs, or debug logs. If a key is exposed, revoke/rotate it at the provider. `npm run check:publication` scans the current working tree and Git index for common secret patterns and private files; it **does not certify past Git history**.

The development app's **POWER UP / Provider Settings** panel accepts supported keys only from exact loopback Host/Origin requests. It writes this checkout's `.env` (or Pinokio's app-scoped `pinokio/ENVIRONMENT`), then restarts Vite. Values supplied by shell/Keychain are shown as external and cannot be changed from the panel. The panel includes a separate server Google key and is absent from `npm run preview`; editing the local environment file remains an alternative.

## Server-side proxy hardening

Data proxies in `vite.config.js` use bounded, source-specific paths. These measures reduce risk but are **not** a public-deployment security audit:

- **No arbitrary-URL fetching.** The CCTV frame proxy fetches only server-registered camera/frame URLs — clients cannot pass an upstream URL to fetch (SSRF mitigation). Other proxies target fixed upstream hosts.
- **Radio is not an audio relay.** `/api/radio/stations` contacts only allowlisted Radio Browser HTTPS hosts and paths, rejects redirects, rejects any hostname with a loopback/private/link-local/metadata/non-public A or AAAA result, and pins each TLS connection to a validated address. It returns normalized public HTTPS stream URLs; `/api/radio/click/:uuid` applies the same destination policy and accepts only station IDs from the current bounded catalog. The browser then connects directly to the broadcaster after an explicit playback action, so the broadcaster sees the listener's IP address. GEV never proxies, caches, records, or redistributes audio.
- **Bounded high-risk paths.** Request bodies and high-volume or attacker-influenced upstream responses are capped where that boundary matters; network paths use explicit timeouts or other bounded lifecycles appropriate to the feed.
- **Sanitized public failures.** Proxy handlers return controlled error messages instead of credentials or raw internal details.
- **Coalesced OAuth refresh** and cached successful responses only (OpenSky).
- **Opt-in debug logging.** `GEV_DEBUG_LOG=0` keeps voice debug logging off by default. If explicitly enabled, the server persists only a timestamp and allowlisted status, not transcripts, request payloads, URLs, or session IDs. Files are size-bounded and owner-only, but still private; `.gev-logs/` is gitignored.

## Network exposure — the operator threat model

The dev/preview server is a **key broker**. This fork intentionally confines it to the local machine:

- **Loopback by default.** `npm run dev` and `npm run preview` bind to `127.0.0.1:4173`. Closing the browser does not stop the server; `Ctrl+C` in its terminal does.
- **API admission guard.** Local API requests require a loopback socket, local Host, and matching Origin where present; state-changing requests require Origin. Forwarding/proxy headers and cross-site requests are refused. Private paths such as `.env`, Git internals, logs, caches, and credential files are blocked by the local server.
- **No LAN/public mode.** Do not set `HOST=0.0.0.0` or front this server with a tunnel/reverse proxy. This fork does not support network sharing, and the guard is not a substitute for a separately designed public service.
- **App-level throttles (opt-in):** `GEV_RATELIMIT_OPENAI_PER_MIN` and `GEV_RATELIMIT_GOOGLE_PER_MIN` cap the cost-bearing endpoints per client IP per minute (over-limit requests receive a sanitized `429`). They are **per-IP, process-local, in-memory guards** — they reset on restart and are **not billing caps**.
- **Live startup guards (always on):** at most six provider session-creation attempts per minute and one pending creation per server process, with a 20-second startup timeout. The browser closes its voice session after at most 600 seconds and does not automatically reconnect. These controls do not cap provider billing; Live bills elapsed connected time, including silence, and Terra usage is separate.
- **Use provider-side controls.** Set Google API quotas and budget alerts and OpenAI Platform usage limits, then check the current terms of every keyed provider. A budget alert is a notification, **not** an automatic spending stop. In-app throttles are not billing caps.

## Scope & expectations

- The Vite server is a **development/preview** server. Public deployment requires a separate design and hardening review; merely placing it behind a generic reverse proxy is not sufficient.
- All data shown is from **public** sources. See [DATA_SOURCES.md](DATA_SOURCES.md). Respect each provider's terms and rate limits.
- The voice agent receives feed-sourced text (place names, callsigns) as scene context. It is instructed to act only via a fixed set of app-control tools and not to execute arbitrary instructions found in data, but treat model output as untrusted and keep the tool surface limited.

## Responsible use

This is an interface for signals that are **already public**. Use it accordingly: respect privacy, follow data providers' terms, and don't represent public-data inference as authoritative intelligence.
