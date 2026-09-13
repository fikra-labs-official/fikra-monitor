// src/data/traffic.test.mjs
// Feed-state honesty for the traffic layer (roadmap L7).
//
// A launch-day stranger runs a keyless build. The layer then simulates
// traffic, and every surface it drives — the toggle chip, the panel meta
// line, the traffic sync chip — has to say so. The two pure helpers below own
// that contract; the layer's getStats() is a thin caller.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import trafficLayer, {
  deriveTrafficFlowError,
  tomTomFlowSegmentsToRoadData,
  trafficFeedPresentation,
} from './traffic.js';
import { DataLayerManager, layerFeedState } from './manager.js';

/**
 * The app's live markers. Case-SENSITIVE on purpose: uppercase LIVE/GPS is
 * how this UI asserts a real feed ("LIVE · TomTom flow", the old "initiating
 * global GPS sync"), while lowercase "добавьте ключ TomTom для прямого потока" names the
 * remedy without claiming one.
 */
const LIVE_CLAIM = /\bLIVE\b|\bGPS\b|\breal[- ]?time\b/;

test('TomTom flow geometry becomes directional renderable road data', () => {
  const data = tomTomFlowSegmentsToRoadData([
    {
      coords: [[-97.75, 30.25], [-97.74, 30.26]],
      trafficLevel: 0.42,
      roadType: 'Major road',
      closure: false,
    },
  ], { south: 30.2, west: -97.8, north: 30.3, east: -97.7 });

  assert.equal(data.elements.length, 1);
  assert.deepEqual(data.elements[0].tags, { highway: 'primary', oneway: 'yes' });
  assert.deepEqual(data.elements[0].flow, { level: 0.42, closure: false });
  assert.deepEqual(data.elements[0].geometry[0], { lon: -97.75, lat: 30.25 });
});

test('TomTom road conversion clips off-viewport and malformed segments', () => {
  const data = tomTomFlowSegmentsToRoadData([
    { coords: [[10, 10], [11, 11]], trafficLevel: 1, roadType: 'Motorway' },
    { coords: [[-97.75, 30.25]], trafficLevel: 1, roadType: 'Motorway' },
    { coords: [[-97.75, 30.25], [NaN, 30.26]], trafficLevel: 1, roadType: 'Motorway' },
  ], { south: 30.2, west: -97.8, north: 30.3, east: -97.7 });

  assert.deepEqual(data, { elements: [] });
});

test('a superseded flow fetch is not an outage', () => {
  assert.equal(deriveTrafficFlowError({ name: 'AbortError', message: 'aborted' }), null);
  assert.equal(deriveTrafficFlowError(null), null);
  assert.equal(deriveTrafficFlowError(undefined), null);
});

test('flow failures map onto short, specific reasons', () => {
  const reason = (message) => deriveTrafficFlowError(new Error(message));
  assert.equal(reason('flow tile 12/1/1: HTTP 503'), 'ключ TomTom недоступен');
  assert.equal(reason('flow tile 12/1/1: HTTP 429'), 'дневной лимит TomTom исчерпан');
  assert.equal(reason('flow tile 12/1/1: HTTP 502'), 'сервис TomTom не отвечает');
  assert.equal(reason('flow tile 12/1/1: HTTP 504'), 'сервис TomTom не отвечает');
  assert.equal(reason('flow tile 12/1/1: HTTP 418'), 'ошибка потока TomTom (HTTP 418)');
  assert.equal(reason('flow fetch failed'), 'поток TomTom недоступен');
});

test('keyless traffic names the mode and the remedy, loading or idle', () => {
  const idle = trafficFeedPresentation({ liveMode: false, fetching: false });
  const loading = trafficFeedPresentation({ liveMode: false, fetching: true });
  assert.equal(idle.mode, 'sim');
  assert.equal(loading.mode, 'sim');
  // Keyless is a designed fallback, not a fault — no error, or every keyless
  // build would boot with a red chip.
  assert.equal(idle.error, null);
  assert.equal(loading.error, null);
  // One terse line in both states; the chip's progress text carries "working".
  assert.equal(idle.loadingLabel, 'СИМУЛЯЦИЯ · добавьте ключ TomTom для прямого потока');
  assert.equal(loading.loadingLabel, 'СИМУЛЯЦИЯ · добавьте ключ TomTom для прямого потока');
});

test('no keyless label ever implies a live feed', () => {
  const labels = [
    trafficFeedPresentation({ liveMode: false, fetching: false }),
    trafficFeedPresentation({ liveMode: false, fetching: true }),
    trafficFeedPresentation({ statusUnavailable: true }),
    trafficFeedPresentation({ liveMode: true, flowError: 'поток TomTom недоступен' }),
    trafficFeedPresentation({ liveMode: true, fetching: true, flowError: 'поток TomTom недоступен' }),
  ].map((feed) => feed.loadingLabel);
  for (const label of labels) {
    assert.ok(!LIVE_CLAIM.test(label), `label implies live data: ${label}`);
    assert.ok(label.startsWith('СИМУЛЯЦИЯ'), `fallback label must lead with the mode: ${label}`);
  }
});

test('simulating because the status probe failed reads differently from keyless by design', () => {
  const probeDown = trafficFeedPresentation({ statusUnavailable: true });
  assert.equal(probeDown.mode, 'sim');
  assert.equal(probeDown.loadingLabel, 'СИМУЛЯЦИЯ · сервис дорожного движения недоступен');
});

test('a healthy keyed layer reports live flow with its real coverage', () => {
  const idle = trafficFeedPresentation({ liveMode: true, coveragePct: 87 });
  assert.deepEqual(idle, {
    mode: 'live',
    error: null,
    loadingLabel: 'ПРЯМОЙ ПОТОК · покрытие 87%',
  });
  assert.equal(
    trafficFeedPresentation({ liveMode: true, fetching: true }).loadingLabel,
    'синхронизация дорожного потока',
  );
});

test('a mid-session flow outage degrades instead of reporting stale live coverage', () => {
  const down = trafficFeedPresentation({
    liveMode: true,
    flowError: 'дневной лимит TomTom исчерпан',
    coveragePct: 87, // last-good number — must not be presented as current
  });
  // error and loadingLabel are ONE string: the manager's error branch renders
  // `error` and drops `loadingLabel`, so the copy has to live in both.
  assert.equal(down.error, 'СИМУЛЯЦИЯ · дневной лимит TomTom исчерпан');
  assert.equal(down.loadingLabel, down.error);
  assert.ok(!down.loadingLabel.includes('87'));
  const busy = trafficFeedPresentation({
    liveMode: true,
    fetching: true,
    flowError: 'дневной лимит TomTom исчерпан',
  });
  assert.deepEqual(busy, down, 'the degraded state reads the same whether or not a load is in flight');
});

test('the rendered steady-state meta line carries the SIMULATED copy', () => {
  const mgr = new DataLayerManager({});
  const stats = (feed) => ({ count: 544, lastUpdate: Date.now(), ...feed });
  assert.equal(
    mgr._buildMetaText({
      source: 'OpenStreetMap',
      stats: stats(trafficFeedPresentation({ liveMode: false })),
    }),
    'РЕЗЕРВ · OpenStreetMap · СИМУЛЯЦИЯ · добавьте ключ TomTom для прямого потока',
  );
  assert.equal(
    mgr._buildMetaText({
      source: 'OpenStreetMap',
      stats: stats(trafficFeedPresentation({
        liveMode: true,
        flowError: 'дневной лимит TomTom исчерпан',
      })),
    }),
    'СБОЙ · OpenStreetMap · СИМУЛЯЦИЯ · дневной лимит TomTom исчерпан',
  );
});

test('the manager reads keyless as РЕЗЕРВ and an outage as DEGRADED', () => {
  const settled = { count: 4200, lastUpdate: Date.now() };
  assert.equal(
    layerFeedState({ ...settled, ...trafficFeedPresentation({ liveMode: false }) }),
    'fallback',
  );
  assert.equal(
    layerFeedState({ ...settled, ...trafficFeedPresentation({ liveMode: true }) }),
    'nominal',
  );
  assert.equal(
    layerFeedState({
      ...settled,
      ...trafficFeedPresentation({ liveMode: true, flowError: 'поток TomTom недоступен' }),
    }),
    'degraded',
  );
});

test('the shipped layer boots keyless-honest before any status check', () => {
  const stats = trafficLayer.getStats();
  assert.equal(stats.mode, 'sim');
  assert.equal(stats.source, 'OpenStreetMap');
  assert.equal(stats.error, null);
  assert.ok(!LIVE_CLAIM.test(stats.loadingLabel), `boot label implies live data: ${stats.loadingLabel}`);
  assert.equal(layerFeedState(stats), 'fallback');
});

test('total TomTom and Overpass failure clears old live dots and reports unavailable', async () => {
  const { createServer } = await import('vite');
  const originalFetch = globalThis.fetch;
  let server;
  let layer;
  let viewer;
  const requests = [];
  const eventChannel = () => ({
    addEventListener: () => () => {},
    removeEventListener: () => {},
  });
  try {
    server = await createServer({
      root: fileURLToPath(new URL('../..', import.meta.url)),
      configFile: false,
      appType: 'custom',
      logLevel: 'silent',
      server: { middlewareMode: true },
      plugins: [{
        name: 'traffic-failure-test-hooks',
        transform(code, id) {
          if (!id.endsWith('/src/data/traffic.js')) return null;
          return `${code}\nexport const __trafficFailureTestHooks = {
            seedTomTom() {
              const point = _pointCollection.add({
                position: Cesium.Cartesian3.fromDegrees(-97.75, 30.25), pixelSize: 4,
              });
              _dots = [{ point }];
              _count = 1;
              _lastUpdate = Date.now();
              _geometrySource = 'TomTom';
              _flowCoveragePct = 100;
            },
            pointCount: () => _pointCollection.length,
            load: loadRoadsForBounds,
          };`;
        },
      }],
    });
    const traffic = await server.ssrLoadModule('/src/data/traffic.js');
    layer = traffic.default;
    globalThis.fetch = async (url) => {
      requests.push(String(url));
      if (url === '/api/tomtom/status') {
        return { ok: true, json: async () => ({ hasKey: true }) };
      }
      if (String(url).startsWith('/api/tomtom/flow/')) return { ok: false, status: 503 };
      if (url === '/api/overpass') return { ok: false, status: 502 };
      throw new Error(`unexpected request: ${url}`);
    };
    viewer = {
      camera: {
        changed: eventChannel(),
        percentageChanged: 0.5,
        positionCartographic: { height: 9000 },
      },
      scene: {
        preRender: eventChannel(),
        primitives: { add: (value) => value, remove: () => true },
      },
    };
    layer.init(viewer);
    layer.enable(viewer);
    traffic.__trafficFailureTestHooks.seedTomTom();
    assert.equal(traffic.__trafficFailureTestHooks.pointCount(), 1);
    assert.equal(layer.getStats().source, 'TomTom');

    await traffic.__trafficFailureTestHooks.load({
      south: 30.24, north: 30.26, west: -97.76, east: -97.74,
    }, 3000);

    const stats = layer.getStats();
    assert.ok(requests.some((url) => url.startsWith('/api/tomtom/flow/')));
    assert.ok(requests.includes('/api/overpass'));
    assert.equal(traffic.__trafficFailureTestHooks.pointCount(), 0);
    assert.equal(stats.count, 0);
    assert.equal(stats.lastUpdate, null);
    assert.equal(stats.source, 'Нет данных');
    assert.equal(stats.flowCoveragePct, 0);
    assert.match(stats.error, /^ДАННЫЕ НЕДОСТУПНЫ/);
    assert.doesNotMatch(stats.error, /СИМУЛЯЦИЯ|100%/);
    assert.equal(layerFeedState(stats), 'unavailable');
  } finally {
    if (layer && viewer) layer.disable(viewer);
    globalThis.fetch = originalFetch;
    await server?.close();
  }
});
