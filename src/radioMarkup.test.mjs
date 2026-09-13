import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  googlePlacesPageSize,
  googlePlacesSearchCenter,
  normalizeNominatimBoundary,
} from '../vite.config.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ui = readFileSync(new URL('./ui.js', import.meta.url), 'utf8');
const radio = readFileSync(new URL('./data/radio.js', import.meta.url), 'utf8');
const rocketLaunches = readFileSync(new URL('./data/rocketLaunches.js', import.meta.url), 'utf8');
const realtime = readFileSync(new URL('./voice/gevRealtime.js', import.meta.url), 'utf8');
const voice = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

/** Parse the Realtime tool array out of the Vite config as real data. */
function realtimeTools() {
  const start = voice.indexOf('const GEV_REALTIME_TOOLS = [');
  const end = voice.indexOf('\n];', start);
  assert.ok(start >= 0 && end > start, 'Realtime tool schema block is missing');
  const literal = voice.slice(start + 'const GEV_REALTIME_TOOLS = '.length, end + 2);
  // The block is pure data; evaluating it beats regexing nested schemas.
  return new Function(`return ${literal};`)();
}

test('Realtime schema exposes the authoritative 29-tool inventory', () => {
  const tools = realtimeTools();
  assert.equal(tools.length, 29);
  const names = tools.map((tool) => tool.name);
  assert.equal(new Set(names).size, 29, 'tool names are unique');
  assert.ok(names.includes('set_context_mode'));
  assert.ok(names.includes('control_cockpit'));
  assert.ok(names.includes('select_nearest_aircraft'));
  assert.ok(names.includes('control_radio'));
  assert.ok(names.includes('search_places'));
  // Every tool closes its parameter object: an open schema lets the model
  // invent arguments the runner silently drops.
  for (const tool of tools) {
    assert.equal(tool.type, 'function', `${tool.name} is not a function tool`);
    assert.equal(
      tool.parameters?.additionalProperties,
      false,
      `${tool.name} does not close additionalProperties`,
    );
    assert.ok(tool.description, `${tool.name} has no description`);
  }
});

test('the counting contract is stated in the Realtime instructions', () => {
  // Owner ruling: "near" has one meaning per state, and every count names its
  // scope. Instruction text is the only place the narration rules can live, so
  // it is pinned — a silent trim here is a silent behaviour change.
  const start = voice.indexOf("'COUNTING CONTRACT");
  assert.ok(start >= 0, 'the counting contract instruction is missing');
  // One instruction per source line; the string carries escaped quotes, so take
  // the line rather than trying to match a quoted literal.
  const text = voice.slice(start, voice.indexOf('\n', start));
  assert.match(text, /Contacts is ACTIVE/, 'rule 1: active means the Contacts window');
  assert.match(text, /contactsWindow/, 'rule 1 names its mechanism');
  assert.match(text, /call set_context_mode\{mode:"contacts"\} first/);
  assert.match(text, /contactsWindow\.aircraft/);
  assert.match(text, /Contacts OFF, "nearby" means in view/, 'rule 2: off means in view');
  assert.match(text, /EVERY count names its scope in words/, 'rule 3');
  assert.match(text, /scopeLabel/, 'rule 3 names its mechanism');
  assert.match(text, /never a bare number/, 'rule 3 is stated as a prohibition too');
  assert.match(text, /VERBATIM/, 'rule 4: no estimating');
  assert.match(text, /flights layer loads where you look/, 'rule 5: the loaded-data caveat');
});

test('Realtime voice stays Russian unless another language is explicitly requested', () => {
  const start = voice.indexOf("'Understand commands in Russian and English.");
  assert.ok(start >= 0, 'the bilingual voice policy is missing');
  const text = voice.slice(start, voice.indexOf('\n', start));
  assert.match(text, /Always reply in Russian unless the user explicitly asks for another language/);
  assert.match(text, /Keep tool names, argument keys, enum values, layer IDs, panel IDs/);
  assert.match(text, /translate only the spoken reply/);
});

test('business, category, district, and admin-region requests use one atomic map action', () => {
  const businessStart = voice.indexOf("'NAMED BUSINESS SEARCH:");
  assert.ok(businessStart >= 0, 'the named-business routing rule is missing');
  const business = voice.slice(businessStart, voice.indexOf('\n', businessStart));
  assert.match(business, /company, office, cafe, restaurant, shop, hotel, clinic/);
  assert.match(business, /call annotate_map ONCE/);
  assert.match(business, /type=pin/);
  assert.match(business, /flyTo=true/);
  assert.match(business, /Do NOT call fly_to_location first/);

  const categoryStart = voice.indexOf("'CATEGORY PLACE SEARCH:");
  assert.ok(categoryStart >= 0, 'the category-place routing rule is missing');
  const category = voice.slice(categoryStart, voice.indexOf('\n', categoryStart));
  assert.match(category, /call search_places ONCE/);
  assert.match(category, /maxResults=20/);
  assert.match(category, /ranked catalogue, not a guaranteed complete registry/);
  assert.match(category, /never claim that every real-world place was found/);

  const boundaryStart = voice.indexOf("'DISTRICT BOUNDARY:");
  assert.ok(boundaryStart >= 0, 'the district-boundary routing rule is missing');
  const boundary = voice.slice(boundaryStart, voice.indexOf('\n', boundaryStart));
  assert.match(boundary, /call annotate_map ONCE/);
  assert.match(boundary, /type=area/);
  assert.match(boundary, /footprint=true/);
  assert.match(boundary, /entityKind=district/);
  assert.match(boundary, /flyTo=true/);
  assert.match(boundary, /Do NOT use type=route/);

  const adminStart = voice.indexOf("'ADMINISTRATIVE BOUNDARY:");
  assert.ok(adminStart >= 0, 'the admin-region routing rule is missing');
  const admin = voice.slice(adminStart, voice.indexOf('\n', adminStart));
  assert.match(admin, /state, province, oblast, governorate, emirate/);
  assert.match(admin, /call annotate_map ONCE/);
  assert.match(admin, /entityKind=admin_region/);
  assert.match(admin, /do NOT approximate it with a hand-drawn shape/);
});

test('search_places tool is capped to one Google Places page', () => {
  const tool = realtimeTools().find((candidate) => candidate.name === 'search_places');
  assert.ok(tool);
  assert.deepEqual(tool.parameters.required, ['query']);
  assert.equal(tool.parameters.properties.maxResults.maximum, 20);
  assert.equal(tool.parameters.properties.maxResults.minimum, 1);
  assert.match(tool.description, /capped at 20/);
  assert.match(realtime, /result\?\.action === 'search_places'/);
  assert.match(realtime, /Найдено и отмечено \$\{count\} доступных мест/);
  assert.match(realtime, /not a complete registry of every real-world place/);
});

test('global Places search accepts no center and validates an optional bias center', () => {
  assert.equal(googlePlacesSearchCenter(new URLSearchParams({ q: 'Emaar, Dubai' })), undefined);
  assert.deepEqual(
    googlePlacesSearchCenter(new URLSearchParams({ lat: '0', lon: '0' })),
    { latitude: 0, longitude: 0 },
  );
  for (const params of [
    { lat: '25' },
    { lon: '55' },
    { lat: '', lon: '' },
    { lat: '91', lon: '55' },
    { lat: '25', lon: '181' },
    { lat: 'not-a-number', lon: '55' },
  ]) {
    assert.equal(googlePlacesSearchCenter(new URLSearchParams(params)), null);
  }
});

test('Google text-search page size defaults to five and clamps explicit bulk searches to twenty', () => {
  assert.equal(googlePlacesPageSize(new URLSearchParams()), 5);
  assert.equal(googlePlacesPageSize(new URLSearchParams({ limit: '1' })), 1);
  assert.equal(googlePlacesPageSize(new URLSearchParams({ limit: '20' })), 20);
  assert.equal(googlePlacesPageSize(new URLSearchParams({ limit: '200' })), 20);
  assert.equal(googlePlacesPageSize(new URLSearchParams({ limit: 'nope' })), 5);
});

test('Nominatim boundary normalizer selects a drawable administrative polygon', () => {
  const result = normalizeNominatimBoundary([
    {
      addresstype: 'state',
      category: 'boundary',
      type: 'administrative',
      osm_type: 'relation',
      osm_id: 123,
      display_name: 'Test Region',
      geojson: {
        type: 'MultiPolygon',
        coordinates: [
          [[[20, 40], [21, 40], [21, 41], [20, 41], [20, 40]]],
          [[[30, 30], [30.1, 30], [30.1, 30.1], [30, 30.1], [30, 30]]],
        ],
      },
    },
  ], 'state');

  assert.equal(result.source, 'nominatim');
  assert.equal(result.osmId, 123);
  assert.equal(result.ring.length, 5);
  assert.deepEqual(result.ring[0], [20, 40]);
});

test('Realtime voice defaults to cedar with a low, calm delivery', () => {
  assert.match(voice, /OPENAI_REALTIME_VOICE_DEFAULT = 'cedar'/);
  assert.match(voice, /calm, low-register, masculine-sounding delivery/);
  assert.match(voice, /avoid high-pitched or theatrical intonation/);
});

test('Realtime VAD lets user speech interrupt an active response', () => {
  const start = voice.indexOf("type: 'semantic_vad'");
  assert.ok(start >= 0, 'semantic VAD configuration is missing');
  const block = voice.slice(start, voice.indexOf('\n              },', start));
  assert.match(block, /create_response: true/);
  assert.match(block, /interrupt_response: true/);
});

test('Context panel opening stays distinct from Contacts activation', () => {
  const start = voice.indexOf("'For requests to open, show, reveal, or focus a menu/panel");
  assert.ok(start >= 0, 'panel-routing instruction is missing');
  const text = voice.slice(start, voice.indexOf('\n', start));
  assert.match(text, /"Open Context" means only set_panel_open/);
  assert.match(text, /does not activate a Context sub-mode/);
  assert.match(text, /"Open Contacts" means set_context_mode\{mode:"contacts"\}/);
  assert.match(text, /expands the parent Context panel before activating Contacts/);
});

test('nearest-aircraft selection stays out of Contacts and Cockpit', () => {
  const start = voice.indexOf("'For a request to enable an aircraft layer and SELECT or FIND");
  assert.ok(start >= 0, 'nearest-aircraft selection routing instruction is missing');
  const text = voice.slice(start, voice.indexOf('\n', start));
  assert.match(text, /Turn on flights and select the closest aircraft to Austin/);
  assert.match(text, /call select_nearest_aircraft once/);
  assert.match(text, /atomically turns on the requested aircraft layer first/);
  assert.match(text, /waits for location arrival/);
  assert.match(text, /refreshes that layer for the destination viewport/);
  assert.match(text, /filters out landed\/on-ground records/);
  assert.match(text, /nearest airborne result/);
  assert.match(text, /healthy fallback feed is valid data/i);
  assert.match(text, /Do not also call fly_to_location, set_layer_visibility, analyst_query, track_entity/);
  assert.match(text, /SELECT\/FIND never implies Contacts or Cockpit/);
  assert.match(text, /set_context_mode, or control_cockpit/);

  const byName = new Map(realtimeTools().map((tool) => [tool.name, tool]));
  assert.match(byName.get('set_context_mode').description, /explicitly requests/);
  assert.match(byName.get('set_context_mode').description, /selecting an aircraft does not imply Context/i);
  assert.match(byName.get('control_cockpit').description, /explicitly requests Cockpit/);
  assert.match(byName.get('control_cockpit').description, /must not enter Cockpit/);
  assert.equal(
    byName.get('fly_to_location').parameters.properties.waitForArrival.type,
    'boolean',
  );
  const nearest = byName.get('select_nearest_aircraft');
  assert.deepEqual(nearest.parameters.required, ['layerId']);
  assert.deepEqual(nearest.parameters.properties.layerId.enum, ['flights', 'military']);
  assert.match(nearest.description, /Atomically/);
  assert.match(nearest.description, /exclude on-ground records/);
  assert.match(nearest.description, /fallback feeds remain usable/);
  assert.match(nearest.description, /does not open Contacts or Cockpit/);
});

test('the two Context/Cockpit tools pin their enums and required arguments', () => {
  const byName = new Map(realtimeTools().map((tool) => [tool.name, tool]));

  const contextMode = byName.get('set_context_mode');
  assert.deepEqual(contextMode.parameters.required, ['mode']);
  assert.deepEqual(
    contextMode.parameters.properties.mode.enum,
    ['off', 'contacts', 'flights', 'space-missions', 'missions'],
  );

  const cockpit = byName.get('control_cockpit');
  assert.deepEqual(cockpit.parameters.required, ['action']);
  assert.deepEqual(
    cockpit.parameters.properties.action.enum,
    ['enter', 'exit', 'previous', 'next', 'prev', 'status'],
  );
  assert.deepEqual(
    cockpit.parameters.properties.targetLayer.enum,
    ['flights', 'military', 'ais-live-vessels', 'military-installations'],
    'the layer filter must match the four Context cohorts exactly',
  );
  // aircraftClass is deliberately open (free-form class names), but still typed.
  assert.equal(cockpit.parameters.properties.aircraftClass.type, 'string');
  assert.equal(cockpit.parameters.properties.aircraftClass.enum, undefined);
});

test('the edited existing tools changed exactly as intended', () => {
  const byName = new Map(realtimeTools().map((tool) => [tool.name, tool]));

  // Edit 1: the Context panel became voice-addressable alongside set_context_mode.
  const panel = byName.get('set_panel_open');
  assert.deepEqual(
    panel.parameters.properties.panelId.enum,
    ['data-panel', 'location-bar', 'control-panel', 'cctv-panel', 'radio-panel', 'scene-panel', 'pp-toggles', 'global-context-panel'],
  );
  assert.deepEqual(panel.parameters.required, ['panelId', 'open']);

  // Edit 2: description only — the view state now reports Context and Cockpit.
  const viewState = byName.get('get_current_view_state');
  assert.match(viewState.description, /Context, Cockpit/);
  assert.deepEqual(viewState.parameters.properties, {});

  // Edit 3: dependent multi-tool navigation can wait for the destination view.
  const location = byName.get('fly_to_location');
  assert.equal(location.parameters.properties.waitForArrival.type, 'boolean');
  assert.match(location.parameters.properties.waitForArrival.description, /arrived=true/);
});

test('no unchanged Realtime tool definition drifts silently', () => {
  // Context/Cockpit parity, the dependent-location wait edit, the retired
  // `bing-road` stack, the new bulk Places tool, and the admin-region annotation
  // fact are the known schema changes. Everything else must be byte-identical: an unnoticed edit
  // to a shipped tool changes
  // model behavior in production with nothing in review to catch it.
  //
  // If this fails and the change was deliberate, re-derive the digest and say
  // in the mic-test brief which tools moved — the session cache busts on any
  // schema change.
  const TOUCHED = new Set([
    'set_context_mode',
    'control_cockpit',
    'set_panel_open',
    'get_current_view_state',
    'fly_to_location',
    'select_nearest_aircraft',
    'set_map_stack',
    'search_places',
    'annotate_map',
  ]);
  const unchanged = realtimeTools()
    .filter((tool) => !TOUCHED.has(tool.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  assert.equal(unchanged.length, 20);
  const digest = createHash('sha256')
    .update(JSON.stringify(unchanged))
    .digest('hex')
    .slice(0, 16);
  assert.equal(digest, '349cef3189180b06', 'an unchanged Realtime tool definition drifted');
});

test('Radio volume and mission speed share the Sharpen slider visual language', () => {
  for (const id of ['cockpit-radio-volume', 'context-radio-mini-volume', 'radio-volume']) {
    assert.match(
      html,
      new RegExp(`id="${id}"[^>]*class="gev-quantitative-slider"[^>]*type="range"`),
    );
  }
  assert.match(
    rocketLaunches,
    /id="space-mission-replay-speed" class="gev-quantitative-slider" type="range" min="0\.25" max="4" step="0\.25" value="1"/,
  );
  assert.match(rocketLaunches, /class="gev-slider-value"[^>]*data-mission-replay-speed-output/);
  assert.match(css, /\.gev-quantitative-slider\s*\{[\s\S]*?min-width: 0;[\s\S]*?height: 18px;/);
  assert.match(css, /\.gev-quantitative-slider::-webkit-slider-runnable-track\s*\{[\s\S]*?height: 3px;[\s\S]*?background: rgba\(255, 255, 255, 0\.08\);/);
  assert.match(css, /\.gev-quantitative-slider::-webkit-slider-thumb\s*\{[\s\S]*?width: 10px;[\s\S]*?height: 10px;[\s\S]*?border-radius: 50%;[\s\S]*?background: var\(--accent\);/);
  assert.match(css, /\.gev-quantitative-slider:focus-visible\s*\{[\s\S]*?outline: 1px solid/);
  assert.match(css, /\.gev-quantitative-slider:disabled\s*\{[\s\S]*?opacity: \.42;[\s\S]*?cursor: not-allowed;/);
  assert.match(css, /\.gev-slider-value\s*\{[\s\S]*?color: var\(--accent\);[\s\S]*?font-size: 9px;/);
  assert.doesNotMatch(css, /#space-mission-panel \[data-mission-replay-speed\]::-webkit-slider-thumb/);
});

test('Radio is nested inside Context with separate disclosure and power controls', () => {
  const contextStart = html.indexOf('id="global-context-panel"');
  const radioStart = html.indexOf('id="radio-panel"');
  const contextEnd = html.indexOf('\n  </aside>', contextStart);
  assert.ok(contextStart >= 0 && radioStart > contextStart && radioStart < contextEnd);
  assert.match(html, /id="radio-panel"[^>]*data-panel-id="radio-panel"/);
  assert.match(html, /aria-label="Воспроизведение радио"/);
  assert.match(html, /id="context-radio-toggle-btn"[^>]*aria-expanded="false"[^>]*aria-controls="context-radio-mini"/);
  assert.doesNotMatch(html, /id="context-radio-toggle-btn"[^>]*aria-pressed=/);
  assert.match(html, /id="context-radio-mini"[^>]*aria-label="Компактное управление радио"[^>]*hidden/);
  assert.match(html, /id="context-radio-mini-enable-btn"[^>]*aria-pressed="false"/);
  assert.match(html, /id="context-radio-details-btn"[^>]*aria-expanded="false"[^>]*aria-controls="radio-panel"/);
  assert.match(html, /id="context-radio-details-btn"[\s\S]*?<span class="material-symbols-outlined" aria-hidden="true">open_in_full<\/span>/);
  assert.match(html, /id="context-radio-mini-close-btn"[^>]*aria-label="Закрыть компактное управление радио"/);
  assert.match(html, /id="context-radio-mini-(?:prev|play|next)-btn"/);
  assert.match(html, /id="context-radio-mini-volume"/);
  assert.match(html, /id="cockpit-radio-panel"[^>]*aria-label="Компактное управление радио в кабине"[^>]*hidden/);
  assert.match(html, /id="cockpit-radio-enable-btn"[^>]*aria-pressed="false"/);
  assert.match(html, /id="cockpit-radio-(?:prev|play|next)-btn"/);
  assert.match(html, /id="cockpit-radio-volume"/);
  assert.match(html, /id="radio-tuner"[^>]*hidden/);
  assert.match(html, /id="radio-tuner-band-label">ДИАПАЗОН КАТАЛОГА/);
  assert.match(html, /id="radio-tuner-slider"[^>]*type="range"/);
  assert.match(html, /id="radio-tuner-needle"[^>]*aria-hidden="true"/);
  assert.match(html, /ФИКСИРУЕТСЯ НА ДОСТУПНЫХ СТАНЦИЯХ/);
  assert.match(html, /class="radio-tuner-scale" aria-hidden="true"><\/div>/);
  assert.match(html, /КАТАЛОГ: RADIO BROWSER/);
  assert.match(html, /После запуска аудио подключается напрямую к вещателю/);
  assert.doesNotMatch(html, /radio-(?:favicon|visualizer|spectrum)/i);
  assert.match(css, /#radio-tuner-slider::-(?:webkit-slider-thumb|moz-range-thumb)/);
  assert.match(css, /\.radio-tuner\.is-static/);
  assert.match(css, /\.radio-tuner-tick\s*\{/);
  assert.doesNotMatch(css, /radio-tuner-scale-(?:left|right)/);
  assert.match(css, /\.radio-tuner-needle\s*\{[\s\S]*?transition: left \.18s ease-out;/);
  assert.match(css, /\.radio-tuner\.is-dragging \.radio-tuner-needle,[\s\S]*?\.radio-tuner\.is-dragging \.radio-tuner-tick\s*\{\s*transition: none;/);
  assert.match(css, /\.radio-tuner\s*\{[\s\S]*?max-width: 100%;[\s\S]*?overflow: hidden;/);
  assert.match(css, /#radio-tuner-slider\s*\{[\s\S]*?max-width: 100%;[\s\S]*?touch-action: none;/);
  assert.match(css, /#title-bar\.radio-broadcasting \.title-logo::before/);
  assert.match(css, /#title-bar\.radio-broadcasting \.title-logo::after/);
  assert.match(css, /--radio-broadcast-opacity: \.17/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.radio-tuner-needle,[\s\S]*?\.radio-tuner-tick\s*\{\s*transition: none;/);
  assert.doesNotMatch(ui, /_radioTunerCameraRemove = this\.viewer\?\.camera\?\.changed/);
  assert.match(ui, /classList\.toggle\('radio-broadcasting', state\.audioState === 'playing'\)/);
  assert.match(ui, /cycleStation\(direction, \{[\s\S]*?rotate,[\s\S]*?stationIds:/);
  const cycleStart = ui.indexOf('const cycleRadio = (direction, { rotate = true } = {}) =>');
  const cycleMethod = ui.slice(cycleStart, ui.indexOf('const toggleRadio', cycleStart));
  assert.doesNotMatch(cycleMethod, /refreshTunerBand/);
  assert.match(ui, /_radioTunerBandPinnedForNavigation = true/);
  assert.match(ui, /viewer\?\.canvas\?\.addEventListener\('pointerdown', releaseNavigationBand/);
  assert.match(ui, /previewTuningStation\(station\?\.id \|\| null, \{ rotate \}\)/);
  assert.match(ui, /tunerPreview\(\{ coordinate: this\._radioTunerCoordinate, rotate: commit \}\)/);
  assert.match(ui, /radioLayer\.cancelTuning\(\)/);
  assert.match(ui, /classList\.remove\('radio-broadcasting'\)/);
  assert.match(ui, /radioLayer\.getTunerStations\(750\)/);
  assert.match(ui, /radioTunerPointerPosition\(/);
  assert.doesNotMatch(css, /#right-context-rail\s*>\s*#radio-panel/);
  assert.match(css, /#global-context-panel #radio-panel\.collapsed/);
  assert.doesNotMatch(css, /\.context-radio-dock\.active:hover \.context-radio-mini/);
  assert.doesNotMatch(css, /\.context-radio-dock\.active:focus-within \.context-radio-mini/);
  assert.match(css, /#right-context-rail #global-context-panel:not\(\.collapsed\) \.context-mode-view,[\s\S]*?#right-context-rail #global-context-panel:not\(\.collapsed\) #radio-panel\s*\{[\s\S]*?flex: 0 0 auto;/);
});

test('panel collapse is presentation-only and Radio exposes explicit voice playback controls', () => {
  const start = ui.lastIndexOf('\n  setPanelCollapsed(panelId');
  const method = ui.slice(start, ui.indexOf('toggleCleanView(forceEnabled)', start));
  assert.doesNotMatch(method, /stopRadio|stopPlayback|setEnabled\('radio'/);
  assert.match(voice, /'radio-panel'/);
  assert.match(voice, /'radio'/);
  assert.match(voice, /name:\s*'control_radio'/);
  assert.match(voice, /enum:\s*\['enable', 'disable', 'play', 'resume', 'pause', 'stop', 'next', 'previous', 'volume', 'select', 'status'\]/);
  const enableStart = ui.lastIndexOf('\n  _initRadioPanel()');
  const enableMethod = ui.slice(enableStart, ui.indexOf('\n  _renderRadioState(state)', enableStart));
  assert.doesNotMatch(enableMethod, /playSelectedRadio|togglePlayback\(\).*radio-enable/i);
  assert.match(enableMethod, /contextRadioToggleBtn/);
  assert.match(enableMethod, /contextRadioMiniEnableBtn/);
  assert.match(enableMethod, /contextRadioDetailsBtn/);
  assert.match(enableMethod, /contextRadioMiniCloseBtn/);
  assert.match(enableMethod, /contextRadioMiniPlayBtn/);
  const disclosureStart = enableMethod.indexOf('this._contextRadioToggleBtn?.addEventListener');
  const disclosureEnd = enableMethod.indexOf("this._radioFilter?.addEventListener", disclosureStart);
  const disclosureBindings = enableMethod.slice(disclosureStart, disclosureEnd);
  assert.ok(disclosureStart >= 0 && disclosureEnd > disclosureStart, 'compact Radio disclosure bindings are missing');
  assert.doesNotMatch(disclosureBindings, /toggleRadio\(this\._contextRadioToggleBtn\)/);
  assert.match(enableMethod, /toggleRadio\(this\._contextRadioMiniEnableBtn\)/);
  assert.match(disclosureBindings, /contextRadioMiniCloseBtn[\s\S]*?setRadioDisclosure\(false, \{ returnFocus: true \}\)/);
  assert.match(disclosureBindings, /contextRadioDetailsBtn[\s\S]*?setPanelCollapsed\('radio-panel', false, \{ explicit: true \}\)/);
  assert.match(
    disclosureBindings,
    /contextRadioToggleBtn[\s\S]*?!contextPanel\.classList\.contains\('collapsed'\)[\s\S]*?setRadioDisclosure\(false\)[\s\S]*?setPanelCollapsed\('radio-panel', false, \{ explicit: true \}\)[\s\S]*?_revealRadioPanelInsideContext/,
  );
  assert.doesNotMatch(disclosureBindings, /setPanelCollapsed\('radio-panel', !/);
  assert.match(ui, /setAttribute\('aria-expanded', String\(/);
  assert.match(ui, /\.hidden = !/);
  assert.doesNotMatch(method, /panelId === 'global-context-panel'[\s\S]*?this\._radioState\?\.enabled[\s\S]*?setPanelCollapsed\('radio-panel', false\)/);
});

test('expanded Context routes its Radio icon to the embedded section and keeps collapsed Context compact', () => {
  const revealStart = ui.indexOf('\n  async _revealRadioPanelInsideContext');
  const revealEnd = ui.indexOf('\n  /**', revealStart + 10);
  const revealMethod = ui.slice(revealStart, revealEnd);
  assert.ok(revealStart >= 0 && revealEnd > revealStart, 'embedded Radio reveal helper is missing');
  assert.match(revealMethod, /requestAnimationFrame\(\(\) => requestAnimationFrame/);
  assert.match(revealMethod, /scroller\.scrollTo\(\{ top: next, behavior: reducedMotion \? 'auto' : 'smooth' \}\)/);
  assert.match(revealMethod, /focus\?\.\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(revealMethod, /setEnabled|togglePlayback|selectStation|setContextMode/);

  const syncStart = ui.indexOf('\n  _syncContextRadioLauncherState()');
  const syncEnd = ui.indexOf('\n  /**', syncStart + 10);
  const syncMethod = ui.slice(syncStart, syncEnd);
  assert.ok(syncStart >= 0 && syncEnd > syncStart, 'Context Radio launcher state sync is missing');
  assert.match(syncMethod, /contextExpanded[\s\S]*?aria-controls', 'radio-panel'[\s\S]*?aria-expanded', String\(radioExpanded\)/);
  assert.match(syncMethod, /aria-controls', 'context-radio-mini'[\s\S]*?aria-expanded', String\(compactOpen\)/);
  const renderStart = ui.indexOf('\n  _renderRadioState(state)');
  const renderMethod = ui.slice(renderStart, ui.indexOf('\n  _renderRadioTuner', renderStart));
  assert.match(renderMethod, /this\._syncContextRadioLauncherState\(\)/);
  assert.doesNotMatch(renderMethod, /compact Radio controls/);
  assert.doesNotMatch(renderMethod, /_contextRadioToggleBtn\.setAttribute\('aria-(?:controls|expanded|label)'/);
});

test('Radio disclosure is explicit, starts closed while off, and preserves playback state', () => {
  const renderStart = ui.indexOf('\n  _renderRadioState(state)');
  const renderMethod = ui.slice(renderStart, ui.indexOf('\n  _renderRadioTuner', renderStart));
  assert.ok(renderStart >= 0, 'Radio render method is missing');
  assert.doesNotMatch(renderMethod, /setPanelCollapsed\('radio-panel', true\).*stopPlayback/s);
  assert.doesNotMatch(renderMethod, /_radioMiniExpanded\s*=\s*false.*audioState === 'playing'/s);
  assert.match(ui, /contextRadioDetailsBtn/);
  const syncStart = ui.indexOf('\n  _syncPanelCollapseButton(panelEl)');
  const syncMethod = ui.slice(syncStart, ui.indexOf('\n  /**', syncStart + 10));
  assert.doesNotMatch(syncMethod, /contextRadioDetailsBtn[\s\S]*?(?:aria-label|textContent|\.title)/);
});

test('successful explicit user playback hands the speaker from voice to Radio', () => {
  const playStart = radio.indexOf('export async function playSelectedRadio');
  const playMethod = radio.slice(playStart, radio.indexOf('\n/**', playStart + 10));
  const confirmedPlaying = playMethod.indexOf("_audioState = 'playing'");
  const takeoverSignal = playMethod.indexOf("if (origin === 'user') emitPlaybackControl('play', origin, ownedAttemptId)");
  assert.ok(confirmedPlaying >= 0 && takeoverSignal > confirmedPlaying);
  assert.match(radio, /startPlayback: \(\) => playSelectedRadio\(\{ origin: 'voice', attemptId: options\.attemptId \}\)/);
  assert.match(radio, /selectRadioStation\(stationId, \{ autoplay: true, origin: 'user' \}\)/);
  assert.match(ui, /togglePlayback\(\{ origin: 'user' \}\)/);
  assert.match(ui, /cycleStation\(direction, \{[\s\S]*?origin: 'user'/);
  assert.match(ui, /commitTuningStation\(station\.id, \{ origin: 'user' \}\)/);
  assert.match(realtime, /event\.origin === 'user' && event\.action === 'play' && this\.isActive\(\)[\s\S]*?this\.stop\(\{ preserveRadioPlayback: true \}\)/);
});
