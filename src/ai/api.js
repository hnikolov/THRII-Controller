import { API_BASE } from './config.js';

// The backend reports a rejected request as a list of validation issues; anything else is shown as it came.
function describeError(status, text) {
  try {
    const issues = JSON.parse(text)?.error?.issues;
    if (Array.isArray(issues) && issues.length) {
      return `Request rejected (${status}): ` +
        issues.map(issue => `${(issue.path || []).join('.') || 'request'}: ${issue.message || issue.code}`).join('; ');
    }
  } catch { /* not JSON */ }
  return `Request failed (${status}): ${text.slice(0, 200) || 'no details'}`;
}

// The three calls to the preset generator of amplifier-presets.com (contract: ai_presets_example/CLAUDE.md).
// Every failure is an Error with a readable message; an aborted request keeps its AbortError.
export function createApi({ base = API_BASE, fetch = (...args) => globalThis.fetch(...args) } = {}) {
  async function call(path, options = {}) {
    let response;
    try {
      response = await fetch(base + path, { headers: { 'Content-Type': 'application/json' }, ...options });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw new Error('The preset generator cannot be reached.');
    }
    const text = await response.text();
    if (!response.ok) throw new Error(describeError(response.status, text));
    return JSON.parse(text);
  }

  return {
    // [{ id, name, hasSoftwareExportHandler, ... }]
    listAmps: () => call('/amplifiers'),

    // { generatedPresetId, preset: { presetName, tip, ... } }
    // presetType SOFTWARE is the "I use the THR Remote app" option: only then does the backend make a complete preset
    // that can be exported. With PHYSICAL it answers with values for the amp's own knobs and nothing to load.
    generate: ({ sessionId, prompt, guitar, amplifierId, signal }) => call('/presets/generate', {
      method: 'POST',
      signal,
      body: JSON.stringify({ sessionId, presetType: 'SOFTWARE', prompt, guitar, amplifierId })
    }),

    // { fileName, content }: content is the text of a .thrl6p file.
    exportPreset: (presetId, signal) => call(`/presets/${presetId}/export`, { signal })
  };
}
