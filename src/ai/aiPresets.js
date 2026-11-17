import { createApi } from './api.js';
import { AMP_ID_BY_MODEL, CREDIT, HISTORY_MAX, PICKUPS } from './config.js';

// Import AI: a screen that asks the preset generator of amplifier-presets.com for a preset and hands its .thrl6p text
// to the app's import. Self-contained: it imports nothing from the rest of the app and gets everything it may use from
// the shell, as open({ host, importText, ampModel }) (see boot's presetSources). It never sets a knob or sends a frame.

const STORAGE_KEY = 'thrii.aiPresets';
const UNREACHABLE = 'The preset generator cannot be reached. Start the app with "python scripts/serve.py".';
const NO_AMP = 'No amp connected: a preset is loaded into the app only.';

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

// A form field with its name above it.
const field = (caption, control) => el('label', { class: 'ai-field', text: caption }, control);

// api, storage, now and uuid are replaceable for tests.
export function createAiPresetSource({
  api = createApi(),
  storage = null,
  now = () => Date.now(),
  uuid = () => crypto.randomUUID()
} = {}) {
  // The form drafts and the generated presets survive a reload where the browser allows storage. Where it is blocked
  // (reading localStorage can throw), they last until the page is reloaded.
  const stored = action => {
    try { return action(storage || globalThis.localStorage); } catch { return null; }
  };
  // history: the generated presets the app accepted, newest first: { id, name, tip, prompt, guitar, pickup, time, text }.
  // Equal names are separate entries; an entry is found by its id. current is the id of the entry loaded last from here
  // (the selected one), status its import message.
  const saved = {
    sessionId: null, guitar: '', pickup: '', prompt: '', amp: '', history: [], current: null, status: '',
    ...stored(box => JSON.parse(box.getItem(STORAGE_KEY)))
  };
  const save = () => stored(box => box.setItem(STORAGE_KEY, JSON.stringify(saved)));
  // The screen is built on the first showing and kept: hidden by the shell, it goes on with a running generation.
  let refresh = null;

  function build({ host, importText, ampModel = () => null }) {
    document.head.append(el('link', { rel: 'stylesheet', href: new URL('./aiPresets.css', import.meta.url).href }));

    // busy: null, 'generating' (a request is out; controller aborts it) or 'importing' (the app is loading a preset).
    let busy = null;
    let controller = null;
    let reachable = false;
    let loadingAmps = false;
    // The amp model the amp list was last matched to; a different one on a later showing is a newly connected amp.
    let matchedModel = null;
    // What the last action has to say; an import result and the missing amp show only when this is empty.
    let note = { text: '', error: false };
    const say = (text, error = true) => { note = { text, error }; };

    const promptInput = el('textarea', { 'aria-label': 'Sound', rows: '3', placeholder: 'e.g. Joe Walsh, Hotel California solo' });
    const guitarInput = el('input', { type: 'text', 'aria-label': 'Guitar', placeholder: 'e.g. Fender Stratocaster', autocomplete: 'off' });
    const pickupInput = el('input', { type: 'text', 'aria-label': 'Pickups', placeholder: 'optional', autocomplete: 'off', list: 'ai-pickups' });
    const ampSelect = el('select', { 'aria-label': 'Amplifier' });
    const generateButton = el('button', { type: 'submit', class: 'ai-button', text: 'Generate' });
    const cancelButton = el('button', { type: 'button', class: 'ai-button ai-secondary', text: 'Cancel' });
    const statusLine = el('p', { class: 'ai-status', role: 'status' });
    const listPart = el('div', { class: 'ai-presets' });
    const form = el('form', { class: 'ai-request' },
      field('Sound', promptInput),
      el('div', { class: 'ai-pair' }, field('Guitar', guitarInput), field('Pickups', pickupInput)),
      el('datalist', { id: 'ai-pickups' }, ...PICKUPS.map(value => el('option', { value }))),
      el('div', { class: 'ai-actions' }, ampSelect, generateButton, cancelButton),
      statusLine);
    const credit = el('footer', { class: 'ai-credit' },
      el('div', {}, 'Presets by ', el('a', { href: CREDIT.url, target: '_blank', rel: 'noopener', text: CREDIT.text })),
      el('div', { class: 'ai-people' }, ...CREDIT.people.map(person => el('span', {}, el('b', { text: person.name }), ` ${person.role}`))));

    promptInput.value = saved.prompt;
    guitarInput.value = saved.guitar;
    pickupInput.value = saved.pickup;

    // One row per generated preset: a press loads it, the cross deletes it. The selected row is followed by its tip.
    const entryRows = (entry, selected) => {
      const time = new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const loadButton = el('button', { type: 'button', class: 'ai-entry-load', title: entry.prompt },
        el('span', { class: 'ai-entry-name', text: entry.name }),
        el('span', { class: 'ai-entry-time', text: time }),
        el('span', { class: 'ai-entry-prompt', text: entry.prompt }));
      const deleteButton = el('button', { type: 'button', class: 'ai-entry-delete', 'aria-label': `Delete ${entry.name}`, title: 'Delete', text: '×' });
      loadButton.disabled = deleteButton.disabled = !!busy;
      loadButton.addEventListener('click', () => load(entry));
      deleteButton.addEventListener('click', () => remove(entry));
      const row = el('div', { class: selected ? 'ai-entry is-selected' : 'ai-entry' }, loadButton, deleteButton);
      if (selected) row.setAttribute('aria-current', 'true');
      return selected && entry.tip ? [row, el('p', { class: 'ai-tip', text: entry.tip })] : [row];
    };

    function render() {
      generateButton.hidden = busy === 'generating';
      generateButton.disabled = !!busy || !reachable;
      cancelButton.hidden = busy !== 'generating';
      [promptInput, guitarInput, pickupInput, ampSelect].forEach((control) => { control.disabled = !!busy; });

      const current = saved.history.find(entry => entry.id === saved.current);
      // While a generation runs the line belongs to the elapsed time.
      if (busy !== 'generating') {
        statusLine.textContent = note.text || (current && saved.status) || (ampModel() === null ? NO_AMP : '');
        statusLine.classList.toggle('is-error', !!note.text && note.error);
      }
      listPart.replaceChildren(...(saved.history.length ? [
        el('div', { class: 'ai-title', text: 'Generated presets' }),
        el('div', { class: 'ai-list' }, ...saved.history.flatMap(entry => entryRows(entry, entry === current)))
      ] : [
        el('p', { class: 'ai-hint', text: 'Describe the sound you are after: an artist, a song and the part of it work well.' }),
        el('p', { class: 'ai-hint', text: 'The preset is loaded at once. It is kept in a list here, with a playing tip.' })
      ]));
    }

    // Deleting takes a preset out of the list only: the app and the amp keep the settings they have.
    function remove(entry) {
      if (busy) return;
      saved.history = saved.history.filter(other => other !== entry);
      if (saved.current === entry.id) {
        saved.current = null;
        saved.status = '';
      }
      save();
      render();
    }

    // Hands a preset text to the app. On success the entry becomes the selected one and its request returns to the form.
    async function load(entry) {
      if (busy) return false;
      busy = 'importing';
      say('');
      render();
      const result = await importText(entry.text);
      busy = null;
      if (result.ok) {
        saved.current = entry.id;
        saved.status = result.message;
        saved.prompt = promptInput.value = entry.prompt;
        saved.guitar = guitarInput.value = entry.guitar;
        saved.pickup = pickupInput.value = entry.pickup || '';
        save();
      } else {
        say(result.message);
      }
      render();
      return result.ok;
    }

    async function generate() {
      const prompt = promptInput.value.trim();
      const guitar = guitarInput.value.trim();
      const pickup = pickupInput.value.trim();
      if (busy || !reachable) return;
      if (!prompt || !guitar) {
        say('Name the guitar and describe the sound first.');
        render();
        return;
      }
      if (!saved.sessionId) saved.sessionId = uuid();
      save();

      busy = 'generating';
      say('');
      controller = new AbortController();
      const started = now();
      const tick = () => { statusLine.textContent = `Generating ${Math.round((now() - started) / 1000)} s`; };
      statusLine.classList.remove('is-error');
      tick();
      const timer = setInterval(tick, 1000);
      render();

      let entry = null;
      try {
        const { signal } = controller;
        const data = await api.generate({ sessionId: saved.sessionId, prompt, guitar, pickup, amplifierId: ampSelect.value, signal });
        if (!data || !data.generatedPresetId) throw new Error('The generator returned no preset to load.');
        const file = await api.exportPreset(data.generatedPresetId, signal);
        if (!file || !file.content) throw new Error('The preset export came back empty.');
        const preset = data.preset || {};
        entry = { id: uuid(), name: preset.presetName || 'Preset', tip: preset.tip || '', prompt, guitar, pickup, time: now(), text: file.content };
      } catch (err) {
        const cancelled = err.name === 'AbortError';
        say(cancelled ? 'Cancelled.' : err.message, !cancelled);
        if (!cancelled) console.warn('Import AI:', err);
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
      if (loadingAmps) return;
      loadingAmps = true;
      let amps = [];
      try {
        const list = await api.listAmps();
        const withExport = list.filter(amp => amp.hasSoftwareExportHandler);
        amps = withExport.length ? withExport : list;
        if (!amps.length) throw new Error('empty amplifier list');
      } catch (err) {
        console.warn('Import AI:', err);
        say(UNREACHABLE);
      }
      loadingAmps = false;
      if (amps.length) {
        ampSelect.replaceChildren(...amps.map(amp => el('option', { value: amp.id, text: amp.name })));
        matchedModel = ampModel();
        const preferred = [AMP_ID_BY_MODEL[matchedModel], saved.amp].find(id => amps.some(amp => amp.id === id));
        ampSelect.value = preferred || amps[0].id;
        reachable = true;
        if (note.text === UNREACHABLE) say('');
      }
      render();
    }

    form.addEventListener('submit', event => { event.preventDefault(); generate(); });
    // Enter in the sound text is a new line; with Ctrl (or Cmd) it generates.
    promptInput.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) generate(); });
    cancelButton.addEventListener('click', () => controller && controller.abort());
    ampSelect.addEventListener('change', () => { saved.amp = ampSelect.value; save(); });
    promptInput.addEventListener('input', () => { saved.prompt = promptInput.value; save(); });
    guitarInput.addEventListener('input', () => { saved.guitar = guitarInput.value; save(); });
    pickupInput.addEventListener('input', () => { saved.pickup = pickupInput.value; save(); });

    host.replaceChildren(el('section', { class: 'ai-screen', 'aria-label': 'Import AI' }, form, listPart, credit));
    render();
    loadAmps();

    // A later showing: an unreachable generator is tried again, and the amp list follows a newly connected amp.
    return () => {
      const model = ampModel();
      if (!reachable) {
        loadAmps();
      } else if (model !== matchedModel) {
        matchedModel = model;
        const id = AMP_ID_BY_MODEL[model];
        if ([...ampSelect.options].some(option => option.value === id)) ampSelect.value = id;
      }
      render();
    };
  }

  return function open(context) {
    if (refresh) refresh();
    else refresh = build(context);
  };
}

export const aiPresetSource = createAiPresetSource();
