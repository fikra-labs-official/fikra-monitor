// Standard USD per 1M tokens, checked against OpenAI pricing on 2026-09-13.
// Shared by the session broker and UI so the selected model and meter agree.
export const DEFAULT_LIVE_BACKEND_MODEL = 'gpt-5.6-luna';
export const LIVE_BACKENDS = Object.freeze({
  'gpt-5.6-luna': Object.freeze({ label: 'GPT-5.6 Luna', input: 0.2, cachedInput: 0.02, output: 1.2 }),
  'gpt-5.6-terra': Object.freeze({ label: 'GPT-5.6 Terra', input: 2, cachedInput: 0.2, output: 12 }),
});
