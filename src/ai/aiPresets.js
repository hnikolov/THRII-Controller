import { createApi } from './api.js';
import { AMP_ID_BY_MODEL, CREDIT, PICKUPS, SOUNDS_MAX } from './config.js';

// Import AI: a screen that asks the preset generator of amplifier-presets.com for a preset and hands its .thrl6p text
// to the app's import. Self-contained: it imports nothing from the rest of the app and gets everything it may use from
// the shell, as open({ host, importText, ampModel, setActivity }) (see boot's presetSources). It never sets a knob or
// sends a frame.
//
// The screen: the card is the loaded version, with its request in the fields and its tip under the
// version tabs; the fields are also the draft of the next request. The action row makes a version of the loaded sound
// or a new sound; the list holds every sound with its version letters. A sound is an umbrella the user may rename
// (Metallica); each version keeps its own name, which the app's header shows once it is loaded.

const STORAGE_KEY = 'thrii.aiPresets.v2';
// The flat list of the first version of this screen; read once when there is nothing under STORAGE_KEY, and left in place.
const OLD_STORAGE_KEY = 'thrii.aiPresets';
const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const NEW = 'new';
// The app cuts preset names at 20 characters; a name plus a space and the letter stays within that, so the name saved
// to an amp memory keeps the letter.
const NAME_BASE_MAX = 18;
// A sound's name is the list's umbrella for its versions and never goes to the amp; this keeps the rows tidy.
const SOUND_NAME_MAX = 40;
const UNREACHABLE = 'The preset generator cannot be reached. Start the app with "python scripts/serve.py".';
const NO_AMP = 'No amp connected: presets load into the app only.';

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

const versionOf = (sound, letter) => sound.versions.find(version => version.letter === letter);
// A sound's versions in letter order.
const versionsOf = sound => LETTERS.map(letter => versionOf(sound, letter)).filter(Boolean);
const newestTime = sound => Math.max(...sound.versions.map(version => version.time));

// The name a version is loaded with: its own (the generator's). Takes of one tone tend to come back with the same name,
// so a version whose name an earlier letter of its sound already has gets its letter: "Walsh Hotel Solo B".
function presetName(sound, version) {
  const sameName = [...sound.versions.filter(other => other.letter !== version.letter), version]
    .filter(other => other.name === version.name)
    .sort((a, b) => LETTERS.indexOf(a.letter) - LETTERS.indexOf(b.letter));
  return sameName[0] === version ? version.name : `${version.name.slice(0, NAME_BASE_MAX).trim()} ${version.letter}`;
}

// The letter a new version of the sound gets: the first free one; with all five taken, the one after the newest.
function nextTarget(sound) {
  if (!sound) return NEW;
  const free = LETTERS.find(letter => !versionOf(sound, letter));
  if (free) return free;
  const newest = sound.versions.reduce((last, version) => (version.time > last.time ? version : last));
  return LETTERS[(LETTERS.indexOf(newest.letter) + 1) % LETTERS.length];
}

// The preset text with the name the app shows and saves. A text that is not a preset goes as it is; the import refuses it.
function withName(text, name) {
  try {
    const preset = JSON.parse(text);
    preset.data.meta.name = name;
    return JSON.stringify(preset);
  } catch {
    return text;
  }
}

// The first version kept a flat list, newest first. Entries with the same name and guitar become the versions of one
// sound, the oldest being A; a sixth starts another sound of that name.
function migrate(old, uuid) {
  const sounds = [];
  const open = new Map();
  [...(old.history || [])].reverse().forEach((entry) => {
    const key = `${entry.name}\n${entry.guitar}`;
    let sound = open.get(key);
    if (!sound || sound.versions.length === LETTERS.length) {
      sound = { id: uuid(), name: entry.name, versions: [] };
      open.set(key, sound);
      sounds.push(sound);
    }
    sound.versions.push({
      id: entry.id,
      letter: LETTERS[sound.versions.length],
      request: { prompt: entry.prompt, guitar: entry.guitar, pickup: entry.pickup || '', amp: old.amp || '' },
      name: entry.name,
      tip: entry.tip || '',
      time: entry.time,
      text: entry.text
    });
  });
  sounds.sort((a, b) => newestTime(b) - newestTime(a));
  const current = sounds.find(sound => sound.versions.some(version => version.id === old.current));
  return {
    sessionId: old.sessionId || null,
    sounds,
    current: current ? { soundId: current.id, versionId: old.current } : null,
    fields: { prompt: old.prompt || '', guitar: old.guitar || '', pickup: old.pickup || '', amp: old.amp || '', target: nextTarget(current) }
  };
}

// api, storage, now, uuid and confirm are replaceable for tests.
export function createAiPresetSource({
  api = createApi(),
  storage = null,
  now = () => Date.now(),
  uuid = () => crypto.randomUUID(),
  confirm = text => globalThis.confirm(text)
} = {}) {
  // The sounds and the card's draft survive a reload where the browser allows storage. Where it is blocked (reading
  // localStorage can throw), they last until the page is reloaded.
  const stored = action => {
    try { return action(storage || globalThis.localStorage); } catch { return null; }
  };
  // sounds: newest generation first, { id, name, versions: [{ id, letter, request, name, tip, time, text }] }, where
  // request { prompt, guitar, pickup, amp } is exactly what was sent. current { soundId, versionId }: the version loaded
  // last from here. fields: the card's draft, with the target ('new' or a letter of the current sound).
  const saved = stored(box => JSON.parse(box.getItem(STORAGE_KEY)))
    || migrate(stored(box => JSON.parse(box.getItem(OLD_STORAGE_KEY))) || {}, uuid);
  const save = () => stored(box => box.setItem(STORAGE_KEY, JSON.stringify(saved)));
  const soundOf = id => saved.sounds.find(sound => sound.id === id);
  const currentSound = () => (saved.current && soundOf(saved.current.soundId)) || null;
  const currentVersion = () => {
    const sound = currentSound();
    return (sound && sound.versions.find(version => version.id === saved.current.versionId)) || null;
  };
  // The screen is built on the first showing and kept: hidden by the shell, it goes on with a running generation.
  let refresh = null;

  function build({ host, importText, ampModel = () => null, setActivity = () => {} }) {
    document.head.append(el('link', { rel: 'stylesheet', href: new URL('./aiPresets.css', import.meta.url).href }));

    // job: the generation that is out ({ controller, label }). importing: the import that runs (a promise); one at a time.
    let job = null;
    let importing = null;
    let reachable = false;
    let loadingAmps = false;
    // The amp model the amp list was last matched to; a different one on a later showing is a newly connected amp.
    let matchedModel = null;
    // What the last action has to say; the missing amp shows only when this is empty.
    let note = { text: '', error: false };
    const say = (text, error = true) => { note = { text, error }; };

    const promptInput = el('textarea', { 'aria-label': 'Sound', rows: '3', placeholder: 'e.g. Joe Walsh, Hotel California solo' });
    const guitarInput = el('input', { type: 'text', 'aria-label': 'Guitar', placeholder: 'e.g. Fender Stratocaster', autocomplete: 'off' });
    const pickupInput = el('input', { type: 'text', 'aria-label': 'Pickups', placeholder: 'optional', autocomplete: 'off', list: 'ai-pickups' });
    const inputs = { prompt: promptInput, guitar: guitarInput, pickup: pickupInput };
    const removeButton = el('button', { type: 'button', class: 'ai-remove', title: 'Remove this version', text: '×' });
    const tabs = el('div', { class: 'ai-tabs', role: 'tablist', 'aria-label': 'Versions' });
    // The × of the loaded version sits at the end of the tab row, beside the tabs it removes from.
    const tabBar = el('div', { class: 'ai-tabbar' }, tabs, removeButton);
    const tip = el('p', { class: 'ai-tip' });
    const ampSelect = el('select', { 'aria-label': 'Amplifier' });
    const targetSelect = el('select', { 'aria-label': 'Target' });
    // A plain button: while a generation runs it cancels, and Enter in a field must not do that.
    const goButton = el('button', { type: 'button', class: 'ai-go' });
    const statusLine = el('p', { class: 'ai-status', role: 'status' });
    const list = el('div', { class: 'ai-list' });

    const form = el('form', { class: 'ai-request' },
      el('div', { class: 'ai-card' },
        field('Sound', promptInput),
        el('div', { class: 'ai-pair' }, field('Guitar', guitarInput), field('Pickups', pickupInput)),
        el('datalist', { id: 'ai-pickups' }, ...PICKUPS.map(value => el('option', { value })))),
      tabBar,
      tip,
      el('div', { class: 'ai-actions' }, ampSelect, targetSelect, goButton),
      statusLine);
    const initials = name => name.replace(/^(\S)\S*\s+/, '$1. ');
    const credit = el('footer', { class: 'ai-credit' },
      'Presets by ', el('a', { href: CREDIT.url, target: '_blank', rel: 'noopener', text: CREDIT.text }),
      ...CREDIT.people.flatMap(person => [' · ', el('span', { title: `${person.name}, ${person.role}`, text: initials(person.name) })]));

    promptInput.value = saved.fields.prompt;
    guitarInput.value = saved.fields.guitar;
    pickupInput.value = saved.fields.pickup;

    // The card takes a request: the one of a loaded version, with the target of the next generation.
    function setFields(request, target) {
      saved.fields = { ...request, target };
      Object.entries(inputs).forEach(([key, input]) => { input.value = request[key]; });
      if ([...ampSelect.options].some(option => option.value === request.amp)) ampSelect.value = request.amp;
    }

    // A field that differs from the request of the loaded version gets a gold edge: the next generation sends it.
    function markEdited() {
      const version = currentVersion();
      Object.entries(inputs).forEach(([key, input]) => {
        input.classList.toggle('is-edited', !!version && input.value.trim() !== version.request[key]);
      });
    }

    const tabButton = (sound, version, selected) => {
      const button = el('button', { type: 'button', role: 'tab', class: 'ai-tab', 'aria-selected': String(selected), text: version.letter });
      button.addEventListener('click', () => load(sound, version));
      return button;
    };

    // The sound being renamed ({ id, text }), or null. While it is, the list is not rebuilt (a generation may end
    // meanwhile), so the field keeps its focus; the rename's end brings the list up to date.
    let renaming = null;

    // Ends a rename: the name is taken when kept and not empty. Enter, Escape and leaving the field can each end it;
    // the first one does.
    function endRename(keepText) {
      if (!renaming) return;
      const sound = soundOf(renaming.id);
      const text = renaming.text.trim();
      renaming = null;
      if (sound && keepText && text) {
        sound.name = text;
        save();
      }
      render();
    }

    // The name of the sound, or the field that renames it.
    function soundName(sound, versions) {
      if (renaming && renaming.id === sound.id) {
        const input = el('input', { type: 'text', class: 'ai-sound-input', 'aria-label': 'Sound name', maxlength: String(SOUND_NAME_MAX), autocomplete: 'off' });
        input.value = renaming.text;
        input.addEventListener('input', () => { renaming.text = input.value; });
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault();
            endRename(event.key === 'Enter');
          }
        });
        input.addEventListener('blur', () => endRename(true));
        return input;
      }
      const button = el('button', { type: 'button', class: 'ai-sound-name', title: `Load version ${versions[0].letter}`, text: sound.name });
      button.addEventListener('click', () => load(sound, versions[0]));
      return button;
    }

    function soundRow(sound, loaded) {
      const selected = sound === currentSound();
      const versions = versionsOf(sound);
      const nameNode = soundName(sound, versions);
      const letters = versions.map((version) => {
        const button = el('button', {
          type: 'button',
          class: version === loaded ? 'ai-letter is-selected' : 'ai-letter',
          'aria-label': `${sound.name} version ${version.letter}`,
          text: version.letter
        });
        button.addEventListener('click', () => load(sound, version));
        return button;
      });
      // Any sound can be renamed, as any can be removed; renaming does not load it.
      const renameButton = el('button', { type: 'button', class: 'ai-sound-rename', 'aria-label': `Rename ${sound.name}`, title: 'Rename', text: '✎' });
      renameButton.addEventListener('click', () => {
        renaming = { id: sound.id, text: sound.name };
        renderList();
        const input = list.querySelector('.ai-sound-input');
        input.focus();
        input.select();
      });
      const deleteButton = el('button', { type: 'button', class: 'ai-sound-delete', 'aria-label': `Remove ${sound.name}`, title: 'Remove with all versions', text: '×' });
      deleteButton.addEventListener('click', () => removeSound(sound));
      const row = el('div', { class: selected ? 'ai-sound is-selected' : 'ai-sound' },
        nameNode, el('span', { class: 'ai-letters' }, ...letters), renameButton, deleteButton);
      if (selected) row.setAttribute('aria-current', 'true');
      return row;
    }

    function renderList() {
      const version = currentVersion();
      list.replaceChildren(...(saved.sounds.length ? saved.sounds.map(each => soundRow(each, version)) : [
        el('p', { class: 'ai-hint', text: 'Describe the sound you are after: an artist, a song and the part of it work well.' }),
        el('p', { class: 'ai-hint', text: 'The preset is loaded at once and kept here; ▶ again makes another version of it.' })
      ]));
    }

    function render() {
      const sound = currentSound();
      const version = currentVersion();
      if (!sound) saved.fields.target = NEW;
      else if (saved.fields.target !== NEW && !LETTERS.includes(saved.fields.target)) saved.fields.target = nextTarget(sound);
      const target = saved.fields.target;

      tabBar.hidden = tip.hidden = !version;
      tabs.replaceChildren(...(sound ? versionsOf(sound).map(each => tabButton(sound, each, each === version)) : []));
      tip.textContent = version ? version.tip : '';
      removeButton.setAttribute('aria-label', version ? `Remove version ${version.letter}` : 'Remove version');

      targetSelect.replaceChildren(el('option', { value: NEW, text: 'New sound' }), ...(sound ? LETTERS.map(letter => el('option', {
        value: letter,
        text: versionOf(sound, letter) ? `Replace ${letter}` : `Version ${letter}`
      })) : []));
      targetSelect.value = target;
      goButton.textContent = job ? '■' : '▶';
      goButton.setAttribute('aria-label', job ? 'Cancel' : (target === NEW ? 'Generate a new sound' : `Generate version ${target}`));
      goButton.disabled = !job && (!reachable || !!importing);

      if (!renaming) renderList();
      // While an import runs (about a second with an amp) nothing else may load or remove.
      host.querySelectorAll('.ai-tab, .ai-remove, .ai-sound button').forEach((button) => { button.disabled = !!importing; });

      // While a generation runs the line belongs to the elapsed time.
      if (!job) {
        statusLine.textContent = note.text || (ampModel() === null ? NO_AMP : '');
        statusLine.classList.toggle('is-error', !!note.text && note.error);
      }
      markEdited();
    }

    // Hands a version to the app, after any import that still runs. Resolves to { ok, message }.
    async function importVersion(sound, version) {
      while (importing) await importing;
      importing = importText(withName(version.text, presetName(sound, version)));
      render();
      const result = await importing;
      importing = null;
      return result;
    }

    // Loads a version: on success it is the card's version and its request fills the card.
    async function load(sound, version) {
      if (importing) return;
      say('');
      const result = await importVersion(sound, version);
      if (result.ok) {
        saved.current = { soundId: sound.id, versionId: version.id };
        setFields(version.request, nextTarget(sound));
        save();
      } else {
        say(result.message);
      }
      render();
    }

    // Removing takes presets out of the list only: the app and the amp keep the settings they have.
    function removeSound(sound) {
      const count = sound.versions.length;
      if (importing || !confirm(`Remove ${sound.name} (${count} version${count === 1 ? '' : 's'})?`)) return;
      saved.sounds = saved.sounds.filter(other => other !== sound);
      if (sound === currentSound()) {
        saved.current = null;
        saved.fields.target = NEW;
      }
      save();
      render();
    }

    // The card's ×: the loaded version goes, and the first one left is loaded. The last version takes its sound along.
    function removeVersion() {
      const sound = currentSound();
      const version = currentVersion();
      if (!version || importing) return;
      if (sound.versions.length === 1) {
        removeSound(sound);
        return;
      }
      sound.versions = sound.versions.filter(other => other !== version);
      saved.current = null;
      save();
      load(sound, versionsOf(sound)[0]);
    }

    // The result is loaded into the app first; one the app refuses is not kept. Its sound may have been removed during
    // the generation: then the result starts a sound of its own.
    async function keep(soundId, version) {
      let sound = soundId && soundOf(soundId);
      if (!sound) {
        sound = { id: uuid(), name: version.name, versions: [] };
        version.letter = LETTERS[0];
      }
      const result = await importVersion(sound, version);
      if (!result.ok) {
        say(result.message);
        return;
      }
      sound.versions = [...sound.versions.filter(other => other.letter !== version.letter), version];
      saved.sounds = [sound, ...saved.sounds.filter(other => other !== sound)].slice(0, SOUNDS_MAX);
      saved.current = { soundId: sound.id, versionId: version.id };
      setFields(version.request, nextTarget(sound));
      save();
    }

    // Generates from the card as it is now: its fields, the amp and the target are taken at the press.
    async function generate() {
      if (job || importing || !reachable) return;
      const request = {
        prompt: promptInput.value.trim(),
        guitar: guitarInput.value.trim(),
        pickup: pickupInput.value.trim(),
        amp: ampSelect.value
      };
      if (!request.prompt || !request.guitar) {
        say('Name the guitar and describe the sound first.');
        render();
        return;
      }
      const sound = saved.fields.target === NEW ? null : currentSound();
      const letter = sound ? saved.fields.target : LETTERS[0];
      if (sound && versionOf(sound, letter) && !confirm(`Replace version ${letter} of ${sound.name}?`)) return;
      if (!saved.sessionId) saved.sessionId = uuid();
      save();

      job = { controller: new AbortController(), label: sound ? letter : 'a new sound' };
      setActivity(true);
      say('');
      const started = now();
      const tick = () => { statusLine.textContent = `Generating ${job.label} · ${Math.round((now() - started) / 1000)} s`; };
      statusLine.classList.remove('is-error');
      render();
      tick();
      const timer = setInterval(tick, 1000);

      let version = null;
      try {
        const { signal } = job.controller;
        const data = await api.generate({
          sessionId: saved.sessionId, prompt: request.prompt, guitar: request.guitar, pickup: request.pickup, amplifierId: request.amp, signal
        });
        if (!data || !data.generatedPresetId) throw new Error('The generator returned no preset to load.');
        const file = await api.exportPreset(data.generatedPresetId, signal);
        if (!file || !file.content) throw new Error('The preset export came back empty.');
        const preset = data.preset || {};
        version = { id: uuid(), letter, request, name: preset.presetName || 'Preset', tip: preset.tip || '', time: now(), text: file.content };
      } catch (err) {
        const cancelled = err.name === 'AbortError';
        say(cancelled ? 'Cancelled.' : err.message, !cancelled);
        if (!cancelled) console.warn('Import AI:', err);
      }
      clearInterval(timer);
      job = null;
      setActivity(false);
      if (version) await keep(sound && sound.id, version);
      render();
    }

    // The amp list doubles as the check that the generator can be reached.
    async function loadAmps() {
      if (loadingAmps) return;
      loadingAmps = true;
      let amps = [];
      try {
        const all = await api.listAmps();
        const withExport = all.filter(amp => amp.hasSoftwareExportHandler);
        amps = withExport.length ? withExport : all;
        if (!amps.length) throw new Error('empty amplifier list');
      } catch (err) {
        console.warn('Import AI:', err);
        say(UNREACHABLE);
      }
      loadingAmps = false;
      if (amps.length) {
        ampSelect.replaceChildren(...amps.map(amp => el('option', { value: amp.id, text: amp.name })));
        matchedModel = ampModel();
        const preferred = [AMP_ID_BY_MODEL[matchedModel], saved.fields.amp].find(id => amps.some(amp => amp.id === id));
        ampSelect.value = preferred || amps[0].id;
        reachable = true;
        if (note.text === UNREACHABLE) say('');
      }
      render();
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      generate();
    });
    goButton.addEventListener('click', () => (job ? job.controller.abort() : generate()));
    // Enter in the sound text is a new line; with Ctrl (or Cmd) it generates.
    promptInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        generate();
      }
    });
    Object.entries(inputs).forEach(([key, input]) => input.addEventListener('input', () => {
      saved.fields[key] = input.value;
      save();
      markEdited();
    }));
    ampSelect.addEventListener('change', () => { saved.fields.amp = ampSelect.value; save(); });
    targetSelect.addEventListener('change', () => { saved.fields.target = targetSelect.value; save(); render(); });
    removeButton.addEventListener('click', removeVersion);

    host.replaceChildren(el('section', { class: 'ai-screen', 'aria-label': 'Import AI' },
      form,
      el('div', { class: 'ai-sounds' }, list),
      credit));
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
