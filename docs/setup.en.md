# Install Fikra Monitor

[Русский](setup.ru.md) · [English README](../README.en.md)

This guide covers a local installation of [Fikra Monitor](https://github.com/fikra-labs-official/fikra-monitor). Do not use [fikra-global-monitor](https://github.com/fikra-labs-official/fikra-global-monitor) for this purpose; it is a different project.

## 1. Prepare your system

Install [Git](https://git-scm.com/downloads) and [Node.js](https://nodejs.org/en/download) 24.14+ in the 24 LTS line. The exact supported range is in `package.json`; Node 25 is outside the declared range. Check:

```bash
node --version
npm --version
git --version
```

You need a modern WebGL-capable browser and internet access for live sources. A microphone is needed only for voice.

## 2. Get and start the project

On macOS/Linux in Terminal:

```bash
git clone https://github.com/fikra-labs-official/fikra-monitor.git
cd fikra-monitor
npm ci
npm run doctor
npm run dev
```

On Windows in PowerShell:

```powershell
git clone https://github.com/fikra-labs-official/fikra-monitor.git
Set-Location fikra-monitor
npm ci
npm run doctor
npm run dev
```

If the folder already exists, skip `git clone` and enter it. If `.env` already exists, **do not overwrite it**: it may hold your keys. `npm ci` installs the versions locked in `package-lock.json`; it does not register for a service or make a paid API call. `npm run doctor` checks local setup. Open [http://127.0.0.1:4173](http://127.0.0.1:4173). Stop with `Ctrl+C` in the terminal. To restart, run `npm run dev` from the project directory.

The app should start on a non-Google base map with no keys. Google, Cesium, and OpenAI are optional for the first look. By default the server listens only on `127.0.0.1:4173`; API requests also require a loopback socket, local Host, and matching Origin. LAN mode is not supported in this fork.

## 3. Keys and accounts

In the development app, click **POWER UP** at bottom right. Provider Settings has **GET KEY** links to provider registration. Paste a key and select **SAVE**: the panel stores it in this checkout's local `.env` and restarts the dev server. A Pinokio launch writes app-scoped `pinokio/ENVIRONMENT` instead. Shell/Keychain values appear as externally managed and can only be changed where they were supplied. The panel is unavailable under `npm run preview`.

For manual setup, create `.env` from `.env.example` only if it does not already exist. On macOS/Linux: `cp -n .env.example .env`; in PowerShell: `if (-not (Test-Path .env)) { Copy-Item .env.example .env }`. Open **only your local** `.env` in an editor, put values after `=` without quotes, and never publish it. Restart `npm run dev` after manual changes. All key fields in `.env.example` are blank; leave integrations you do not need blank. Prices, allowances, and terms change: check current provider pages before enabling a key.

| Variable | Purpose | Where to obtain it |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Browser Photorealistic 3D Tiles | [Google Cloud / Map Tiles API](https://developers.google.com/maps/documentation/tile/get-api-key). Create a project, set up billing, enable Map Tiles API, and create a browser key. |
| `GOOGLE_MAPS_SERVER_API_KEY` | Server-side place search, geocoding, and fallback Street View images | Create a **separate** Google Cloud key and add it through GOOGLE MAPS SERVER in the panel or manually to `.env`; enable [Places API (New)](https://developers.google.com/maps/documentation/places/web-service/get-api-key), [Geocoding API](https://developers.google.com/maps/documentation/geocoding/cloud-setup), and [Street View Static API](https://developers.google.com/maps/documentation/streetview/cloud-setup) if used. |
| `CESIUM_ION_TOKEN` | Optional imagery and terrain stacks, including 3D assets available through ion | [Cesium ion / access tokens](https://cesium.com/learn/ion/cesium-ion-access-tokens/). Create an app-specific public `assets:read` token and check the plan's terms. |
| `OPENAI_API_KEY` | Voice and AI HUD | [OpenAI Platform / API keys](https://platform.openai.com/api-keys). API billing and limits are [separate from ChatGPT](https://openai.com/api/pricing/). |
| `FIRMS_MAP_KEY` | Live NASA FIRMS fires | [FIRMS MAP_KEY](https://firms.modaps.eosdis.nasa.gov/api/map_key/). Use the API `MAP_KEY`, not the URL of a downloaded CSV archive. |
| `AISSTREAM_API_KEY` | Live vessels | [AISStream](https://aisstream.io/documentation). Register and create an API key. |
| `TOMTOM_API_KEY` | Live traffic flow instead of labeled simulation | [TomTom Developer](https://developer.tomtom.com/how-to-get-tomtom-api-key). Check the current allowance and Traffic Flow availability for your plan. |
| `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` | Authenticated OpenSky access | [OpenSky Network](https://opensky-network.org/) and [REST API authentication](https://openskynetwork.github.io/opensky-api/rest.html#authentication). Without credentials use `OPENSKY_AUTH_MODE=anon`; after adding both credentials switch to `OPENSKY_AUTH_MODE=oauth`. |
| `LL2_API_TOKEN` | Higher Launch Library 2 allowance | [The Space Devs / Launch Library 2](https://thespacedevs.com/llapi). Baseline launch data works without a token. |
| `TFL_APP_KEY` | Higher TfL camera allowance | [TfL API portal](https://api-portal.tfl.gov.uk/). Baseline public data access can work without a key. |

Restrict the browser Google key to allowed sites and **Map Tiles API only**. Include `http://127.0.0.1:4173` for local use; it can be seen in developer tools. `CESIUM_ION_TOKEN` is browser-visible too: use URL restrictions and `assets:read`. Keep `GOOGLE_MAPS_SERVER_API_KEY` and other private keys out of browser output, screenshots, logs, and Git. Restrict the server key to needed APIs; use an IP restriction only if the server has a stable outbound IP. For compatibility, code can fall back to the browser Google key when no separate server key is set, but the recommended setup uses two differently restricted keys.

For Google and OpenAI, configure [Google Cloud budget alerts and quotas](https://cloud.google.com/billing/docs/how-to/budgets) and [OpenAI limits](https://platform.openai.com/settings/organization/limits). A budget alert alone **does not stop charges**. Recheck the provider's current enforcement controls. In-app estimates and throttles are not hard billing caps either.

## 4. Checks and troubleshooting

### Voice: GPT-Live 1 with GPT-5.6 Luna

`OPENAI_LIVE_BACKEND_MODEL=gpt-5.6-luna` selects the cost-sensitive command model. To select Terra manually, use `OPENAI_LIVE_BACKEND_MODEL=gpt-5.6-terra`, restart the server and begin a new voice session. The LIVE badge tooltip identifies the selected model. There is no automatic upgrade to Terra. Both use Standard processing, not Fast mode.

[OpenAI prices](https://developers.openai.com/api/docs/pricing), checked September 13, 2026, USD per million tokens with input context up to 272K:

| Model | Input | Cached input | Output, including reasoning |
|---|---:|---:|---:|
| GPT-5.6 Luna | $0.20 | $0.02 | $1.20 |
| GPT-5.6 Terra | $2.00 | $0.20 | $12.00 |

For example, 10,000 uncached input and 1,000 output tokens cost about $0.0032 on Luna or $0.032 on Terra. This is not a per-command quote: instructions, history and tool results count, and one command may require several requests. Above 272K input tokens, input rates double and output rates increase 1.5x; cache writes have their own higher rate. Live voice and external API charges are additional.

Luna is a reasonable starting point for place lookup, navigation and layer toggles. Terra may help with ambiguous names, complex conditions and multi-step analysis. This is an expectation based on model roles, not a measured map-agent comparison. Changing the model cannot supply missing boundaries, fix Google/TomTom failures or add unavailable 3D coverage.

The same `OPENAI_API_KEY` is used. `OPENAI_VOICE_ENGINE=live` is the default: GPT-Live 1 handles Russian conversation with the masculine `meridian` voice, while GPT-5.6 Luna handles map tools, place searches and reasoning. Spoken input is not displayed as a transcript. The short HUD summary remains a separate `OPENAI_HUD_SUMMARY_MODEL` task.

Restart the server after changing `.env`, then reload the page. The voice control should say **LIVE**. Click the microphone, grant permission, and try “Fly to Istanbul” or “Outline Andalusia, Spain”. Model choice does not create missing geographical boundaries or 3D coverage.

Click the microphone again to end the session. The browser auto-closes after 10 minutes (`OPENAI_LIVE_MAX_SESSION_SECONDS`, 60–600 seconds), and never reconnects automatically. These application guards are **not provider-side billing caps**; a browser/transport failure can leave final usage unconfirmed.

According to [OpenAI pricing](https://developers.openai.com/api/docs/pricing), checked September 13, 2026, Live costs **$0.05 per minute of open-session time**, including silence. WebRTC creation has a 15-second minimum charge credited toward session duration. Luna tokens and other provider requests are billed separately. Ten minutes therefore cost about **$0.50 for voice plus backend/provider usage**. The in-app counter is an estimate, not a billing statement. No paid voice session starts before a microphone click.

For the legacy fallback, set `OPENAI_VOICE_ENGINE=realtime`, restart and reload. Existing `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_MODEL_MINI` and `OPENAI_REALTIME_VOICE` settings remain available; the MINI toggle applies only in this fallback mode. Unavailable models are not silently substituted. See [Live delegation](https://developers.openai.com/api/docs/guides/live-delegation) and [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna).

### Verification

```bash
npm run build
npm test
npm run check:publication
```

Then `npm run preview` serves the built app locally; stop it with `Ctrl+C`. The publication check inspects the **current working tree and index** but **cannot guarantee** that previous Git commits contain no secrets. These checks do not prove external provider availability, data freshness, microphone behavior, or every browser interaction.

- `node` missing or unsupported: install a supported Node version, open a fresh terminal, and check `node --version`.
- `npm ci` fails: check connectivity, Node, and `package-lock.json`. Do not remove your `.env` or run automatic dependency fixes without reviewing them.
- Port 4173 in use: stop the other process or choose another loopback port, for example `npm run dev -- --host 127.0.0.1 --port 4174`, then open `http://127.0.0.1:4174`.
- Blank/flat globe: check WebGL, connectivity, and browser errors. Google 3D requires an enabled Map Tiles API and valid key; baseline maps may still work without it.
- `KEY REQUIRED`, `UNAVAILABLE`, or sparse flights/vessels/cameras: check the relevant key, source status, and geographic coverage. Missing data is not evidence of absent real-world objects.
- Voice unavailable: check `OPENAI_API_KEY`, API billing, microphone permission, and the local URL. A ChatGPT subscription does not automatically include API credits.

The server deliberately accepts only local access. **Do not set `HOST=0.0.0.0` or publish the dev/preview server online**: LAN/public mode is unsupported here. See [SECURITY.md](../SECURITY.md). Keep required in-app provider credits; data and model terms differ from the MIT code license: [DATA_SOURCES.md](../DATA_SOURCES.md), [LICENSE](../LICENSE).
