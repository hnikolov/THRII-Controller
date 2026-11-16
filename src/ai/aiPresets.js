import { createApi } from './api.js';
import { AMP_ID_BY_MODEL, CREDIT, HISTORY_MAX } from './config.js';

// Import AI: a pop-up that asks the preset generator of amplifier-presets.com for a preset and hands its .thrl6p text
// to the app's import. Self-contained: it imports nothing from the rest of the app and gets everything it may use from
// the shell, as open({ host, importText, ampModel }) (see boot's presetSources). It never sets a knob or sends a frame.

const STORAGE_KEY = 'thrii.aiPresets';
const UNREACHABLE = 'The preset generator cannot be reached. Start the app with "python scripts/serve.py".';

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  });
  node.append(...children);
  return node;
}

// api, storage, now and uuid are replaceable for tests.
export function createAiPresetSource({
  api = createApi(),
  storage = null,
  now = () => Date.now(),
  uuid = () => crypto.randomUUID()
} = {}) {
  // The form drafts and the earlier results survive a reload where the browser allows storage. Where it is blocked
  // (reading localStorage can throw), they last until the page is reloaded.
  const stored = action => {
    try { return action(storage || globalThis.localStorage); } catch { return null; }
  };
  // history: accepted results, newest first: { id, name, tip, prompt, guitar, time, text }. Equal names are separate
  // entries; an entry is found by its id. current is the id of the entry loaded last from here, status its import message.
  const saved = {
    sessionId: null, guitar: '', prompt: '', amp: '', history: [], current: null, status: '',
    ...stored(box => JSON.parse(box.getItem(STORAGE_KEY)))
  };
  const save = () => stored(box => box.setItem(STORAGE_KEY, JSON.stringify(saved)));
  let styled = false;
  let popup = null;

  return function open({ host, importText, ampModel = () => null }) {
    if (popup) return;
    if (!styled) {
      document.head.append(el('link', { rel: 'stylesheet', href: new URL('./aiPresets.css', import.meta.url).href }));
      styled = true;
    }

    // busy: null, 'generating' (a request is out; controller aborts it) or 'importing' (the app is loading a preset).
    let busy = null;
    let controller = null;
    let timer = null;
    let reachable = false;
    let note = ampModel() === null ? 'No amp connected: a preset is loaded into the app only.' : '';

    const ampSelect = el('select', { 'aria-label': 'Amplifier' });
    const guitarInput = el('input', { type: 'text', 'aria-label': 'Guitar', placeholder: 'e.g. Fender Stratocaster', autocomplete: 'off' });
    const promptInput = el('textarea', { 'aria-label': 'Sound', rows: '3', placeholder: 'e.g. Joe Walsh, Hotel California solo' });
    const generateButton = el('button', { type: 'submit', class: 'ai-button', text: 'Generate' });
    const cancelButton = el('button', { type: 'button', class: 'ai-button ai-secondary', text: 'Cancel' });
    const progress = el('span', { class: 'ai-progress', role: 'status' });
    const noteLine = el('p', { class: 'ai-note', role: 'status' });
    const resultPart = el('div', { class: 'ai-result' });
    const earlierPart = el('div', { class: 'ai-earlier' });
    const closeButton = el('button', { type: 'button', class: 'ai-close', text: 'Close' });
    const form = el('form', { class: 'ai-request' },
      el('label', { text: 'Amp' }, ampSelect),
      el('label', { text: 'Guitar' }, guitarInput),
      el('label', { text: 'Sound' }, promptInput),
      el('div', { class: 'ai-actions' }, generateButton, cancelButton, progress));
    const card = el('section', { class: 'ai-card', role: 'dialog', 'aria-label': 'Import AI' },
      el('header', { class: 'ai-head' }, el('span', { text: 'Import AI' }), closeButton),
      form, noteLine, resultPart, earlierPart,
      el('footer', { class: 'ai-credit' }, 'Presets by ', el('a', { href: CREDIT.url, target: '_blank', rel: 'noopener', text: CREDIT.text })));
    popup = el('div', { class: 'ai-popup' }, card);

    guitarInput.value = saved.guitar;
    promptInput.value = saved.prompt;

    const entryButton = entry => {
      const time = new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const button = el('button', { type: 'button', class: 'ai-entry' },
        el('span', { class: 'ai-entry-name', text: entry.name }),
        el('span', { class: 'ai-entry-time', text: time }),
        el('span', { class: 'ai-entry-prompt', text: entry.prompt }));
      button.disabled = !!busy;
      button.addEventListener('click', () => load(entry));
      return button;
    };

    function render() {
      generateButton.hidden = busy === 'generating';
      generateButton.disabled = !!busy || !reachable;
      cancelButton.hidden = busy !== 'generating';
      if (busy !== 'generating') progress.textContent = '';
      noteLine.textContent = note;
      noteLine.hidden = !note;

      const current = saved.history.find(entry => entry.id === saved.current);
      resultPart.hidden = !current;
      resultPart.replaceChildren(...(current ? [
        el('div', { class: 'ai-name', text: current.name }),
        el('div', { class: 'ai-status', text: saved.status }),
        ...(current.tip ? [el('p', { class: 'ai-tip', text: current.tip })] : [])
      ] : []));

      const earlier = saved.history.filter(entry => entry !== current);
      earlierPart.hidden = !earlier.length;
      earlierPart.replaceChildren(...(earlier.length ? [el('div', { class: 'ai-title', text: 'Earlier' }), ...earlier.map(entryButton)] : []));
    }

    // Hands a preset text to the app. On success the entry becomes the result shown.
    async function load(entry) {
      if (busy) return false;
      busy = 'importing';
      note = '';
      render();
      const result = await importText(entry.text);
      busy = null;
      if (result.ok) {
        saved.current = entry.id;
        saved.status = result.message;
        saved.prompt = promptInput.value = entry.prompt;
        saved.guitar = guitarInput.value = entry.guitar;
        save();
      } else {
        note = result.message;
      }
      render();
      return result.ok;
    }

    async function generate() {
      const prompt = promptInput.value.trim();
      const guitar = guitarInput.value.trim();
      if (busy || !reachable) return;
      if (!prompt || !guitar) {
        note = 'Name the guitar and describe the sound first.';
        render();
        return;
      }
      if (!saved.sessionId) saved.sessionId = uuid();
      save();

      busy = 'generating';
      note = '';
      controller = new AbortController();
      const started = now();
      const tick = () => { progress.textContent = `Generating ${Math.round((now() - started) / 1000)} s`; };
      tick();
      timer = setInterval(tick, 1000);
      render();

      let entry = null;
      try {
        const { signal } = controller;
        const data = await api.generate({ sessionId: saved.sessionId, prompt, guitar, amplifierId: ampSelect.value, signal });
        if (!data || !data.generatedPresetId) throw new Error('The generator returned no preset to load.');
        const file = await api.exportPreset(data.generatedPresetId, signal);
        if (!file || !file.content) throw new Error('The preset export came back empty.');
        const preset = data.preset || {};
        entry = { id: uuid(), name: preset.presetName || 'Preset', tip: preset.tip || '', prompt, guitar, time: now(), text: file.content };
      } catch (err) {
        note = err.name === 'AbortError' ? 'Cancelled.' : err.message;
        if (err.name !== 'AbortError') console.warn('Import AI:', err);
      }
      clearInterval(timer);
      busy = null;
      controller = null;

      // A preset the app refuses is not kept.
      if (entry && await load(entry)) {
        saved.history = [entry, ...saved.history].slice(0, HISTORY_MAX);
        save();
      }
      render();
    }

    // The amp list doubles as the check that the generator can be reached.
    async function loadAmps() {
      let amps;
      try {
        const list = await api.listAmps();
        const withExport = list.filter(amp => amp.hasSoftwareExportHandler);
        amps = withExport.length ? withExport : list;
        if (!amps.length) throw new Error('empty amplifier list');
      } catch (err) {
        console.warn('Import AI:', err);
        note = UNREACHABLE;
        render();
        return;
      }
      ampSelect.replaceChildren(...amps.map(amp => el('option', { value: amp.id, text: amp.name })));
      const preferred = [AMP_ID_BY_MODEL[ampModel()], saved.amp].find(id => amps.some(amp => amp.id === id));
      ampSelect.value = preferred || amps[0].id;
      reachable = true;
      render();
    }

    // A running generation or import keeps the pop-up: a stray press must not throw the wait away.
    function hide() {
      if (busy || !popup) return;
      document.removeEventListener('keydown', onKey);
      popup.remove();
      popup = null;
    }
    const onKey = event => { if (event.key === 'Escape') hide(); };

    form.addEventListener('submit', event => { event.preventDefault(); generate(); });
    cancelButton.addEventListener('click', () => controller && controller.abort());
    closeButton.addEventListener('click', hide);
    popup.addEventListener('click', event => { if (event.target === popup) hide(); });
    document.addEventListener('keydown', onKey);
    ampSelect.addEventListener('change', () => { saved.amp = ampSelect.value; save(); });
    guitarInput.addEventListener('input', () => { saved.guitar = guitarInput.value; save(); });
    promptInput.addEventListener('input', () => { saved.prompt = promptInput.value; save(); });

    render();
    host.append(popup);
    loadAmps();
  };
}

export const aiPresetSource = createAiPresetSource();
