# Contributing to Fikra Monitor

Fikra Monitor is a fork of Bilawal Sidhu's [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view). Keep upstream authorship, licenses, provider attribution, and source provenance visible in every contribution.

## Getting set up

Use Node.js 24.14+ in the 24 LTS line, or a compatible 26 release (see `package.json`).

```bash
git clone https://github.com/fikra-labs-official/fikra-monitor.git
cd fikra-monitor
npm ci
npm run doctor
npm run dev
```

No key is needed for the baseline map. For optional providers, use a private local `.env` and [setup instructions](docs/setup.en.md). Never include key values in commands, test fixtures, PR descriptions, screenshots, or commits.

Open `http://127.0.0.1:4173`. The keyless app needs no `.env`; use the dev-only POWER UP panel or [setup instructions](docs/setup.en.md) for optional keys. Before sending a PR run `npm run build`, `npm test`, and `npm run check:publication`. The publication check does not inspect past Git commits. For tracking changes, run `npm run test:track` with the local dev server running. State any unrun checks and external-provider/browser limits in the PR.

## Good first contributions

The highest-leverage places to jump in:

- **🌆 Add a CCTV source pack.** Austin is the reference camera source. Adding another city means a clean public camera catalog with coordinates, attribution, and server-registered frame URLs (the proxy only fetches registered URLs — never client-supplied ones, see [SECURITY.md](SECURITY.md)). City packs are the best first lane.
- **🛰️ Add or improve a data layer.** Each layer is one self-contained module in `src/data/<layer>.js` implementing the layer interface (`init/enable/disable/update/destroy/getStats`, optional `getDetectableObjects`/`getStats`). Use an existing layer as a template.
- **🎙️ Extend voice control.** Voice tools are declared server-side (`GEV_REALTIME_TOOLS` in `vite.config.js`) and executed client-side (`src/voice/gevActions.js`). Keep the tool surface tight and the responses honest (confirm only what actually happened).
- **🎨 Add a visual style.** Styles are GLSL post-process shaders in `src/styles/`.
- **🐛 Fix bugs / improve the first-run experience.** See [docs/KNOWN-ISSUES.md](docs/KNOWN-ISSUES.md).

## Architecture in one minute

- **No framework.** Vanilla JS + [CesiumJS](https://cesium.com/platform/cesiumjs/) + [Vite](https://vitejs.dev/).
- **UI lives in `src/ui.js`** (panels, HUD, styles, the control facade). **Layer logic lives in `src/data/<layer>.js`.** Keep them separate.
- **Secrets stay server-side.** Private provider keys go through source-specific Vite endpoints in `vite.config.js`. The browser deliberately sees the Google Maps browser key and Cesium ion token, so both require restrictions. Use a separate server Google key for Places/Geocoding/Street View Static.
- `docs/CURRENT-STATE.md` is the authoritative runtime reference — read it first.

## Coding style

- ES modules, **2-space indent, single quotes, semicolons.**
- JSDoc on exported/public functions.
- Match the surrounding code — comment density, naming, and idiom.
- Prefer small, reviewable commits. Conventional-commit-style prefixes (`feat:`, `fix:`, `perf:`, `docs:`) are appreciated but not required.

## Pull requests

1. Branch off `main`.
2. Keep `npm run build` and `npm test` green; run focused browser/tracking checks where relevant and avoid new console errors.
3. If you change runtime behavior, update relevant documentation and tests in the same PR. Do not treat upstream's historical `docs/CURRENT-STATE.md` as proof of the fork's current behavior.
4. If you add or change a data source, update [DATA_SOURCES.md](DATA_SOURCES.md) with its license and attribution. **Don't add data you don't have the right to redistribute** — fetch it at runtime instead.
5. Describe what you changed and how you verified it (screenshots welcome for anything visual).

## Ground rules

- This is a tool for **public** data. Don't add scraping of sources whose terms forbid it, private/paywalled datasets, or anything that misrepresents public-data inference as authoritative intelligence.
- Be decent to each other. Assume good faith, keep it constructive.

By contributing, you agree your contributions are licensed under the project's [MIT License](LICENSE).
