# Fikra Monitor

[Release preparation audit](docs/release-audit-2026-09-13.md)

An English-language companion to the Russian [Fikra Monitor README](README.md). This is a fork of [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view), created by Bilawal Sidhu. His original [product tour](https://github.com/bilawalsidhu/gods-eye-view#readme) remains available upstream. The MIT code license preserves his copyright; bundled data, models, and media have separate terms in [LICENSE](LICENSE), [DATA_SOURCES.md](DATA_SOURCES.md), [public/models/README.md](public/models/README.md), and [docs/media/README.md](docs/media/README.md).

This is an exploratory visualization of public signals, not an authoritative operational picture. Flights, vessels, satellites, earthquakes, fires, and public cameras may be delayed or incomplete; some motion and camera poses are modeled. Do not use it for navigation, emergency response, or other safety-critical decisions.

[Русский](README.md) · [Full setup](docs/setup.en.md) · [Security](SECURITY.md) · [Data sources](DATA_SOURCES.md)

## Quick start

Install Git and **Node.js 24.14+ in the 24 LTS line** (a compatible 26 line is also supported; see `package.json`). No API key or `.env` file is needed for the first launch. The keyless globe uses available imagery and map sources; Google 3D and some live layers are optional upgrades.

Fork source: [github.com/fikra-labs-official/fikra-monitor](https://github.com/fikra-labs-official/fikra-monitor).

```bash
git clone https://github.com/fikra-labs-official/fikra-monitor.git
cd fikra-monitor
npm ci
npm run doctor
npm run dev
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). Stop with `Ctrl+C` in the terminal. To restart, run `npm run dev` from the project directory. Windows PowerShell commands are in the [full setup guide](docs/setup.en.md).

## What works

- Without extra keys: baseline maps, some aircraft feeds, satellites, earthquakes, available public cameras, radio, and selected bundled layers. Coverage depends on external services and geography.
- Optional: Google Photorealistic 3D Tiles, place search and geocoding; Cesium ion for selected imagery/terrain; OpenAI voice control and AI HUD; AISStream vessels; NASA FIRMS fires; TomTom live road flow. Without TomTom, traffic dots are labeled simulation, not live congestion.
- Also optional: OpenSky OAuth may improve flight feed access; Launch Library 2 and TfL can work keylessly with potentially tighter limits.

On the local **development server**, the bottom-right **POWER UP / Provider Settings** panel offers supported provider keys. Its **GET KEY** links open the provider's registration page. Saving a key writes this checkout's local `.env` (or Pinokio's app-scoped `pinokio/ENVIRONMENT`) and restarts the dev server. Values supplied by shell environment or Keychain are shown as externally configured and cannot be changed in the panel. The panel is unavailable in `npm run preview`. You can alternatively edit a private `.env` based on `.env.example`, then restart. See [where to obtain each key](docs/setup.en.md#3-keys-and-accounts).

## Recommended voice pairing

Our recommended setup uses one user-supplied `OPENAI_API_KEY`: [GPT-Live 1](https://developers.openai.com/api/docs/models/gpt-live-1) handles full-duplex speech, while [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra) receives [delegated map commands, search, and complex reasoning](https://developers.openai.com/api/docs/guides/live-delegation) through Responses. The current default voice engine is `live`, with the Russian masculine `meridian` voice and no visible transcript. After changing configuration, restart the dev server and check the **LIVE** badge. For the legacy mode, set `OPENAI_VOICE_ENGINE=realtime`.

This is our recommendation for this project, not a proven superiority benchmark or the cheapest option. GPT-Live 1 costs $0.05/minute, including silence; Terra usage is billed separately. The browser's 600-second voice auto-close is an app setting, not a provider cap. Check [current prices](https://developers.openai.com/api/docs/pricing) before use.

## Keys, costs, and exposure

`GOOGLE_MAPS_API_KEY` and `CESIUM_ION_TOKEN` are sent to the browser and **visible in developer tools**. Apply provider restrictions. A separate `GOOGLE_MAPS_SERVER_API_KEY` is preferred for server-side Places API (New), Geocoding API, and Street View Static API: keep it private and restrict its API scope. Do not assume a laptop has a fixed outbound IP. Other secrets (`OPENAI_API_KEY`, `AISSTREAM_API_KEY`, `FIRMS_MAP_KEY`, etc.) stay on the local server, but local clients can still consume quotas. This fork deliberately supports only loopback access, not LAN sharing or public hosting.

Google Maps Platform and OpenAI API usage are billed separately from a ChatGPT subscription. Check [current OpenAI API pricing](https://developers.openai.com/api/docs/pricing) and each provider's current prices and quotas. Set provider-side limits and alerts before sustained use; in-app estimates and throttles are not guaranteed billing caps. Never commit `.env`, keys, diagnostic logs, or screenshots containing secrets.

## Verification and contributions

```bash
npm run build
npm test
npm run check:publication
```

Separately run `npm run preview` to inspect the build locally; stop it with `Ctrl+C`. The publication check inspects the **current working tree and index** for common private files and key patterns. It cannot certify that past Git commits are secret-free, nor does it prove browser behavior, provider availability, or data freshness. See [CONTRIBUTING.md](CONTRIBUTING.md) for contributions and [SECURITY.md](SECURITY.md) for private vulnerability reporting.

This fork is not an official service of Google, Cesium, OpenAI, NASA, or other providers. Keep in-app attribution and review source licenses before redistribution or commercial use.
