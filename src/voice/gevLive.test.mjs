import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGevLiveControllerClass } from './gevLive.js';

class FakeChannel {
  constructor() { this.readyState = 'open'; this.listeners = new Map(); this.sent = []; }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  emit(type, value) { this.listeners.get(type)?.(type === 'message' ? { data: JSON.stringify(value) } : value); }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 'closed'; this.emit('close'); }
}

class FakePc {
  constructor() { this.dc = new FakeChannel(); this.iceGatheringState = 'complete'; this.connectionState = 'connected'; this.closed = false; FakePc.last = this; }
  addTrack() {}
  createDataChannel(label) { this.label = label; return this.dc; }
  async createOffer() { return { type: 'offer', sdp: 'offer-sdp' }; }
  async setLocalDescription(offer) { this.localDescription = offer; }
  async setRemoteDescription(answer) { this.remoteDescription = answer; }
  close() { this.closed = true; this.dc.close(); }
}

class FakeBase {
  constructor({ runner, ui, radioLayer = null }) {
    this.runner = runner;
    this.ui = ui;
    this.radioLayer = radioLayer;
    this.status = 'idle';
    this.startEpoch = 0;
    this.activeToolAbortControllers = new Set();
    this.voiceLimits = { warnUsd: 2, capUsd: 5 };
    this.costTracker = { state: () => ({ totalUsd: 0 }), markIncomplete() {} };
    this.responseActive = false;
    this.pushToTalkMode = false;
  }
  isActive() { return this.status !== 'idle' && this.status !== 'error'; }
  pauseRadioForVoice() { this.radioLayer?.setVoiceDucked?.(true); }
  setStatus(status, detail) { this.status = status; this.detail = detail; }
  setMicrophoneEnabled(enabled) { this.stream?.getTracks().forEach((track) => { track.enabled = enabled; }); }
  startVoiceVisualizer() {}
  startAssistantVoiceVisualizer() {}
  sendRealtimeEvent(message) { if (this.dc?.readyState !== 'open') return false; this.dc.send(JSON.stringify(message)); return true; }
  handleConnectionStateChange() {}
  reportError(source, error) { this.status = 'error'; this.error = { source, message: error?.message }; }
  stop(options = {}) {
    this.startEpoch++;
    this.dc?.close(); this.dc = null;
    this.pc?.close(); this.pc = null;
    this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null;
    this.audioEl?.remove(); this.audioEl = null;
    if (!options.preserveStatus) this.status = 'idle';
    this.baseStopped = true;
    this.radioLayer?.setVoiceDucked?.(false);
    if (options.removeUi) this.ui.root.remove();
  }
  setVoiceCostLimits(limits) { this.voiceLimits = limits; this.syncCostUi(); return limits; }
  getDiagnostics() { return { status: this.status }; }
}

const Live = createGevLiveControllerClass(FakeBase);

test('unsolicited session.closed finalizes without sending another close or losing final usage', async () => {
  const env = setup();
  try {
    await env.controller.start(); started(env.controller);
    const dc = env.controller.dc;
    dc.emit('message', { type: 'session.closed', usage: { seconds: 25 } });
    await env.controller.liveStopPromise;
    assert.equal(env.controller.finalUsageUnconfirmed, false);
    assert.equal(env.controller.liveVoiceSeconds, 25);
    assert.equal(dc.sent.filter((item) => item.type === 'session.close').length, 0);
    assert.equal(env.stopped, true);
  } finally { env.restore(); }
});

test('a Live error closes the hot microphone instead of leaving an idle-looking billable session', async () => {
  const env = setup();
  try {
    await env.controller.start(); started(env.controller);
    const dc = env.controller.dc;
    dc.emit('message', { type: 'error', error: { message: 'fixture error' } });
    assert.equal(env.track.enabled, false);
    assert.equal(env.controller.liveEnding, true);
    dc.emit('message', { type: 'session.closed', usage: { seconds: 1 } });
    await env.controller.liveStopPromise;
    assert.equal(env.stopped, true);
  } finally { env.restore(); }
});

function setup(runner = async (name) => ({ ok: true, action: name }), radioLayer = null) {
  const old = { window: globalThis.window, navigator: globalThis.navigator,
    document: globalThis.document, fetch: globalThis.fetch };
  let stopped = false;
  const track = { enabled: true, stop() { stopped = true; } };
  const stream = { getTracks: () => [track] };
  const audio = { style: {}, dataset: {}, muted: false, pause() {}, remove() { this.removed = true; } };
  const ui = {
    root: { remove() { this.removed = true; } },
    tierButton: { setAttribute() {} },
    costValue: { dataset: {} },
  };
  globalThis.window = { RTCPeerConnection: FakePc };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => stream } } });
  globalThis.document = { createElement: () => audio, body: { appendChild() {} } };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    session: { id: 's1' }, transport: { type: 'webrtc', sdp: 'answer-sdp' },
    maxSessionSeconds: 600, voiceUsdPerMinute: 0.05,
    backendRates: { input: 2, cachedInput: 0.2, output: 12 },
  }) });
  const controller = new Live({ runner, ui, radioLayer });
  return { controller, ui, track, audio, stream, get stopped() { return stopped; }, restore() {
    globalThis.window = old.window;
    if (old.navigator === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', { configurable: true, value: old.navigator });
    globalThis.document = old.document; globalThis.fetch = old.fetch;
  } };
}

function started(controller) {
  controller.dc.emit('message', { type: 'session.started' });
}

function backend(controller, delegationId, responseId, event) {
  return controller.handleRealtimeEvent({ data: JSON.stringify({
    type: 'response.event', delegation_id: delegationId, response_id: responseId, event,
  }) });
}

async function tick() { await new Promise((resolve) => setTimeout(resolve, 0)); }

test('Live waits for session.started and posts SDP only to local session endpoint', async () => {
  const env = setup();
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return { ok: true, json: async () => ({ transport: { type: 'webrtc', sdp: 'answer' } }) };
  };
  try {
    await env.controller.start();
    assert.equal(FakePc.last.label, 'oai-events');
    assert.equal(env.controller.status, 'connecting');
    assert.equal(env.controller.dc.sent.length, 0);
    assert.equal(requests[0].url, '/api/live/session');
    assert.deepEqual(JSON.parse(requests[0].init.body), { sdp: 'offer-sdp' });
    started(env.controller);
    assert.equal(env.controller.status, 'listening');
    await tick();
    assert.ok(env.controller.dc.sent.every((message) => message.type === 'session.thinking.append'));
    const closing = env.controller.stop();
    env.controller.dc.emit('message', { type: 'session.closed', usage: { seconds: 2 } });
    await closing;
  } finally { env.restore(); }
});

test('stop during microphone acquisition leaves no orphan session or media', async () => {
  const env = setup();
  let release;
  navigator.mediaDevices.getUserMedia = () => new Promise((resolve) => { release = resolve; });
  let posts = 0;
  globalThis.fetch = async () => { posts++; throw new Error('must not post'); };
  try {
    const connecting = env.controller.start();
    await env.controller.stop({ removeUi: true });
    release(env.stream);
    await connecting;
    assert.equal(posts, 0);
    assert.equal(env.stopped, true);
    assert.equal(env.ui.root.removed, true);
  } finally { env.restore(); }
});

test('terminal empty output still executes collected calls once and sends one continuation', async () => {
  const calls = [];
  const env = setup(async (name, args, options) => { calls.push({ name, args, signal: options.signal }); return { ok: true, action: name }; });
  try {
    await env.controller.start(); started(env.controller);
    const dc = env.controller.dc;
    env.controller.beginDelegation({ type: 'session.delegation.created', target: 'responses', delegation_id: 'd1', response_id: 'r1' });
    const call = { type: 'function_call', name: 'zoom_to_globe', call_id: 'c1', arguments: '{}' };
    await backend(env.controller, 'd1', 'r1', { type: 'response.output_item.done', item: call });
    await backend(env.controller, 'd1', 'r1', { type: 'response.output_item.done', item: call });
    assert.equal(calls.filter((call) => call.name === 'zoom_to_globe').length, 0);
    await backend(env.controller, 'd1', 'r1', { type: 'response.completed', response: { id: 'r1', output: [], usage: { input_tokens: 100, output_tokens: 20 } } });
    assert.equal(calls.filter((call) => call.name === 'zoom_to_globe').length, 1);
    assert.deepEqual(dc.sent.filter((item) => item.type === 'response.item.create').map((item) => item.item.call_id), ['c1']);
    assert.equal(dc.sent.filter((item) => item.type === 'response.create').length, 1);
    assert.ok(dc.sent.every((item) => !('response' in item) && !('model' in item)));
    const closing = env.controller.stop(); dc.emit('message', { type: 'session.closed', usage: { seconds: 10 } }); await closing;
  } finally { env.restore(); }
});

test('typed correction aborts an old call and waits for its output before new request', async () => {
  let release;
  const env = setup(async (name, args, { signal }) => {
    if (name === 'get_current_view_state') return {};
    return new Promise((resolve) => { release = () => resolve({ ok: !signal.aborted }); });
  });
  try {
    await env.controller.start(); started(env.controller);
    const dc = env.controller.dc;
    env.controller.beginDelegation({ target: 'responses', delegation_id: 'd1', response_id: 'r1' });
    await backend(env.controller, 'd1', 'r1', { type: 'response.output_item.done', item: { type: 'function_call', name: 'fly_to_location', call_id: 'c1', arguments: '{}' } });
    const finishing = backend(env.controller, 'd1', 'r1', { type: 'response.completed', response: { id: 'r1', output: [], usage: { input_tokens: 1, output_tokens: 1 } } });
    env.controller.sendTextCommand('стоп');
    assert.equal(dc.sent.some((item) => item.type === 'response.create'), false);
    release(); await finishing;
    const output = dc.sent.find((item) => item.item?.call_id === 'c1');
    assert.equal(JSON.parse(output.item.output).superseded, true);
    assert.deepEqual(dc.sent.filter((item) => item.type === 'response.item.create').map((item) => item.item.role || item.item.type), ['function_call_output', 'user']);
    assert.equal(dc.sent.filter((item) => item.type === 'response.create').length, 1);
    const closing = env.controller.stop(); dc.emit('message', { type: 'session.closed' }); await closing;
  } finally { env.restore(); }
});

test('cumulative voice seconds and backend response IDs are de-duplicated; timeout is flagged', async () => {
  const env = setup();
  try {
    await env.controller.start(); started(env.controller);
    env.controller.recordLiveVoiceUsage({ seconds: 30 });
    env.controller.recordLiveVoiceUsage({ seconds: 20 });
    env.controller.recordBackendUsage('r1', { input_tokens: 1000, output_tokens: 100, input_tokens_details: { cached_tokens: 400 } });
    env.controller.recordBackendUsage('r1', { input_tokens: 1000, output_tokens: 100 });
    const cost = env.controller.liveCostState();
    assert.equal(cost.seconds, 30);
    assert.ok(Math.abs(cost.voiceUsd - 0.025) < 1e-9);
    assert.ok(Math.abs(cost.backendUsd - 0.00248) < 1e-9);
    const stopping = env.controller.stop();
    env.controller.liveCloseResolve(false);
    await stopping;
    assert.equal(env.controller.finalUsageUnconfirmed, true);
    assert.equal(env.stopped, true);
  } finally { env.restore(); }
});

test('speech fragments do not cancel a delegated task or expose transcripts', async () => {
  const env = setup();
  try {
    await env.controller.start(); started(env.controller);
    const dc = env.controller.dc;
    env.controller.beginDelegation({ target: 'responses', delegation_id: 'd1', response_id: 'r1' });
    const signal = env.controller.liveDelegation.abort.signal;
    await env.controller.handleRealtimeEvent({ data: JSON.stringify({ type: 'input_audio_buffer.speech_started' }) });
    await env.controller.handleRealtimeEvent({ data: JSON.stringify({ type: 'session.transcript.delta', text: 'private words' }) });
    assert.equal(signal.aborted, false);
    assert.equal(env.controller.liveDelegation.id, 'd1');
    assert.equal(dc.sent.some((item) => JSON.stringify(item).includes('private words')), false);
    const closing = env.controller.stop(); dc.emit('message', { type: 'session.closed', usage: { seconds: 15 } }); await closing;
  } finally { env.restore(); }
});

test('Terra large-context rates and unsupported cache-write usage are conservative', () => {
  const env = setup();
  try {
    env.controller.recordBackendUsage('big', {
      input_tokens: 300_000, output_tokens: 1000,
      input_tokens_details: { cached_tokens: 100_000, cache_write_tokens: 10_000 },
    });
    assert.ok(Math.abs(env.controller.liveBackendUsd - 0.858) < 1e-9);
    assert.equal(env.controller.liveUsageIncomplete, true);
  } finally { env.restore(); }
});

test('session duration timer closes Live and mutes media before final event', async () => {
  const env = setup();
  try {
    await env.controller.start();
    env.controller.liveMaxSeconds = 0.001;
    started(env.controller);
    const dc = env.controller.dc;
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(env.track.enabled, false);
    assert.equal(env.audio.muted, true);
    assert.equal(dc.sent.at(-1).type, 'session.close');
    dc.emit('message', { type: 'session.closed', usage: { seconds: 15 } });
    await env.controller.liveStopPromise;
    assert.equal(env.controller.baseStopped, true);
  } finally { env.restore(); }
});

test('documented nested response events work without outer response_id and continue under one delegation', async () => {
  const calls = [];
  const env = setup(async (name) => { calls.push(name); return { ok: true, action: name }; });
  const exact = (event) => env.controller.handleRealtimeEvent({ data: JSON.stringify({
    type: 'response.event', delegation_id: 'd1', event,
  }) });
  try {
    await env.controller.start(); started(env.controller);
    const dc = env.controller.dc;
    env.controller.beginDelegation({ target: 'responses', delegation_id: 'd1', response_id: 'r1' });
    await exact({ type: 'response.created', response: { id: 'r1' } });
    await exact({ type: 'response.output_item.done', item: { type: 'function_call', name: 'zoom_to_globe', call_id: 'c1', arguments: '{}' } });
    await exact({ type: 'response.completed', response: { id: 'r1', output: [], usage: { input_tokens: 1, output_tokens: 1 } } });
    assert.equal(calls.filter((name) => name === 'zoom_to_globe').length, 1);
    // The next backend response may share delegation_id without a second delegation.created.
    await exact({ type: 'response.created', response: { id: 'r2' } });
    await exact({ type: 'response.output_item.done', item: { type: 'function_call', name: 'get_current_view_state', call_id: 'c2', arguments: '{}' } });
    await exact({ type: 'response.completed', response: { id: 'r2', output: [], usage: { input_tokens: 1, output_tokens: 1 } } });
    assert.deepEqual(dc.sent.filter((item) => item.item?.type === 'function_call_output').map((item) => item.item.call_id), ['c1', 'c2']);
    assert.equal(dc.sent.filter((item) => item.type === 'response.create').length, 2);
    assert.equal(env.controller.liveBilledResponses.size, 2);
    const closing = env.controller.stop(); dc.emit('message', { type: 'session.closed', usage: { seconds: 15 } }); await closing;
  } finally { env.restore(); }
});

test('explicit mismatched response_id never dispatches another response tool call', async () => {
  const calls = [];
  const env = setup(async (name) => { calls.push(name); return { ok: true }; });
  try {
    await env.controller.start(); started(env.controller);
    const dc = env.controller.dc;
    env.controller.beginDelegation({ target: 'responses', delegation_id: 'd1', response_id: 'r1' });
    await backend(env.controller, 'd1', 'other', { type: 'response.output_item.done', item: { type: 'function_call', name: 'fly_to_location', call_id: 'bad', arguments: '{}' } });
    await backend(env.controller, 'd1', 'r1', { type: 'response.completed', response: { id: 'r1', usage: { input_tokens: 1 } } });
    assert.equal(calls.includes('fly_to_location'), false);
    assert.equal(dc.sent.some((item) => item.item?.call_id === 'bad'), false);
    const closing = env.controller.stop(); dc.emit('message', { type: 'session.closed', usage: { seconds: 15 } }); await closing;
  } finally { env.restore(); }
});

test('Radio playback is verified while ducked and becomes audible only after Live closes', async () => {
  const radio = {
    ducked: false, playing: false, stops: 0,
    setVoiceDucked(value) { this.ducked = value; },
    async playForVoice() { assert.equal(this.ducked, true); this.playing = true; return true; },
    stopPlayback() { this.stops++; this.playing = false; },
  };
  const env = setup(async (name) => name === 'control_radio'
    ? { ok: true, action: name, radioPlaybackRequested: true }
    : { ok: true }, radio);
  try {
    await env.controller.start(); started(env.controller);
    const dc = env.controller.dc;
    env.controller.beginDelegation({ target: 'responses', delegation_id: 'd1', response_id: 'r1' });
    await backend(env.controller, 'd1', 'r1', { type: 'response.output_item.done', item: {
      type: 'function_call', name: 'control_radio', call_id: 'c1', arguments: '{"action":"play"}',
    } });
    await backend(env.controller, 'd1', 'r1', { type: 'response.completed', response: { id: 'r1', usage: { input_tokens: 1 } } });
    assert.equal(radio.playing, true);
    assert.equal(radio.ducked, true);
    assert.equal(env.track.enabled, false);
    assert.equal(env.audio.muted, true);
    assert.equal(dc.sent.at(-1).type, 'session.close');
    const result = JSON.parse(dc.sent.find((item) => item.item?.call_id === 'c1').item.output);
    assert.equal(result.radioHandoffReady, true);
    assert.equal(radio.stops, 0);
    const stopping = env.controller.liveStopPromise;
    dc.emit('message', { type: 'session.closed', usage: { seconds: 15 } });
    await stopping;
    assert.equal(radio.ducked, false);
    assert.equal(radio.playing, true);
  } finally { env.restore(); }
});

test('failed Radio preflight reports failure and leaves Live active', async () => {
  const radio = {
    ducked: false, stops: 0,
    setVoiceDucked(value) { this.ducked = value; },
    async playForVoice() { return false; },
    stopPlayback() { this.stops++; },
    getUIState() { return { error: 'Поток недоступен' }; },
  };
  const env = setup(async (name) => name === 'control_radio'
    ? { ok: true, action: name, radioPlaybackRequested: true }
    : { ok: true }, radio);
  try {
    await env.controller.start(); started(env.controller);
    const dc = env.controller.dc;
    env.controller.beginDelegation({ target: 'responses', delegation_id: 'd1', response_id: 'r1' });
    await backend(env.controller, 'd1', 'r1', { type: 'response.output_item.done', item: {
      type: 'function_call', name: 'control_radio', call_id: 'c1', arguments: '{"action":"play"}',
    } });
    await backend(env.controller, 'd1', 'r1', { type: 'response.completed', response: { id: 'r1', usage: { input_tokens: 1 } } });
    const result = JSON.parse(dc.sent.find((item) => item.item?.call_id === 'c1').item.output);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'Поток недоступен');
    assert.equal(env.controller.liveReady, true);
    assert.equal(radio.stops, 1);
    const closing = env.controller.stop(); dc.emit('message', { type: 'session.closed', usage: { seconds: 15 } }); await closing;
  } finally { env.restore(); }
});

test('final local elapsed billing freezes at stop', async () => {
  const env = setup();
  try {
    await env.controller.start(); started(env.controller);
    const dc = env.controller.dc;
    env.controller.liveBillableStartedAt = Date.now() - 100_000;
    const closing = env.controller.stop(); dc.emit('message', { type: 'session.closed', usage: { seconds: 100 } }); await closing;
    const before = env.controller.liveCostState().seconds;
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(env.controller.liveCostState().seconds, before);
  } finally { env.restore(); }
});

test('assistant audio events preserve the live microphone for full duplex', async () => {
  const env = setup();
  try {
    await env.controller.start(); started(env.controller);
    const dc = env.controller.dc;
    assert.equal(env.track.enabled, true);
    await env.controller.handleRealtimeEvent({ data: JSON.stringify({ type: 'session.output_audio.delta' }) });
    await env.controller.handleRealtimeEvent({ data: JSON.stringify({
      type: 'response.event', delegation_id: 'd1', event: { type: 'response.created', response: { id: 'r1' } },
    }) });
    assert.equal(env.track.enabled, true);
    const closing = env.controller.stop(); dc.emit('message', { type: 'session.closed', usage: { seconds: 15 } }); await closing;
  } finally { env.restore(); }
});

test('session HTTP errors show bounded safe details, never a raw API key', async () => {
  const env = setup();
  globalThis.fetch = async () => ({
    ok: false, status: 400,
    json: async () => ({ error: { message: 'Invalid key sk-SECRET123' } }),
  });
  try {
    await env.controller.start();
    assert.equal(env.controller.status, 'error');
    assert.match(env.controller.error.message, /HTTP 400.*Invalid key/);
    assert.doesNotMatch(env.controller.error.message, /sk-SECRET123/);
  } finally { env.restore(); }
});
