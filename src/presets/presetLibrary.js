// Presets screen (presets_ui_plan.md): an action row on what plays now (Import, Export, + Add, Save to amp), a
// persistent list of presets for quick switching, and the amp memories' Backup and Restore. Self-contained like
// src/ai: it imports nothing from the rest of the app and gets every operation from boot, so it never touches the
// store or sends a frame itself.
//
// deps (all from boot):
//   run(action)        'export' (resolves to the text written, or null) | 'backup' | 'restore' | 'save:N'
//   importText(text)   loads a .thrl6p text into the Actual settings; resolves to { ok, message }
//   pickTexts(accept)  the file dialog with multiple selection; resolves to [{ name, text }]
//   currentText()      the current settings as .thrl6p text, under the header name (throws without settings)
//   describe(text)     { name, amp } of a preset text the app can load (throws for one it cannot)
//   differs(text)      whether the current settings (header name included) differ from a preset text
//   generation()       counts every wholesale replacement of the settings (an import, a dump read)
//   cleanName(text)    the preset name the app would keep of a typed text
//   setName(name)      sets the header name
//   isConnected(), confirm(text), notify(text)

const STORAGE_KEY = 'thrii.presets';
const LIST_MAX = 200;
// Below this many entries the search line is left out: the whole list fits.
const SEARCH_FROM = 8;
// The app's preset name limit: an entry's name goes to the amp when it is saved to a memory.
const NAME_MAX = 20;
const SLOTS = [1, 2, 3, 4, 5];

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

const button = (props, onClick) => {
  const node = el('button', { type: 'button', ...props });
  node.addEventListener('click', onClick);
  return node;
};

// The preset text with another name, so the name an entry shows is the one it loads with.
function withName(text, name) {
  const preset = JSON.parse(text);
  preset.data.meta.name = name;
  return JSON.stringify(preset);
}

// storage, now and uuid are replaceable for tests.
export function createPresetLibrary(deps, { storage = null, now = () => Date.now(), uuid = () => crypto.randomUUID() } = {}) {
  const { run, importText, pickTexts, currentText, describe, differs, generation, cleanName, setName, isConnected, confirm, notify } = deps;
  // The list survives a reload where the browser allows storage (reading localStorage can throw).
  const stored = action => {
    try { return action(storage || globalThis.localStorage); } catch { return null; }
  };
  // entries: { id, name, text, amp, time }, most recently added or updated first.
  const saved = stored(box => JSON.parse(box.getItem(STORAGE_KEY))) || { entries: [] };
  const save = () => stored(box => box.setItem(STORAGE_KEY, JSON.stringify(saved)));

  // The entry the current settings came from, with the settings generation right after it was loaded. Any later
  // wholesale replacement (a memory recall, a connect, an AI result) moves the generation and ends it. Not stored: a
  // new session starts with whatever the amp plays.
  let loaded = null;
  // Whether the current settings differ from the loaded entry: its row then shows * and ↻.
  let edited = false;
  let connected = false;
  // An import of this screen runs: the rows take no input.
  let busy = false;
  let slotsOpen = false;
  // The list's filters: the search text (matched against name and amp model) and an amp model picked from a row.
  let query = '';
  let ampFilter = null;
  // The entry being renamed ({ id, text }); the list is not rebuilt meanwhile, so the field keeps its focus.
  let renaming = null;
  let view = null;

  const loadedEntry = () => {
    if (loaded && loaded.generation !== generation()) loaded = null;
    return (loaded && saved.entries.find(entry => entry.id === loaded.id)) || null;
  };
  const markLoaded = (entry) => { loaded = { id: entry.id, generation: generation() }; };
  const checkEdited = () => {
    const entry = loadedEntry();
    try {
      edited = !!entry && differs(entry.text);
    } catch {
      edited = false;
    }
  };

  // A new entry at the top, or null when the list is full. describe() throws for a text the app cannot load.
  function add(text) {
    if (saved.entries.length >= LIST_MAX) {
      notify(`The list is full (${LIST_MAX} presets); remove some first.`);
      return null;
    }
    const entry = { id: uuid(), ...describe(text), text, time: now() };
    saved.entries.unshift(entry);
    save();
    return entry;
  }
  const findText = text => saved.entries.find(entry => entry.text === text);

  async function withBusy(work) {
    busy = true;
    render();
    try {
      return await work();
    } finally {
      busy = false;
    }
  }

  async function load(entry) {
    if (busy || renaming) return;
    const result = await withBusy(() => importText(entry.text));
    if (result.ok) markLoaded(entry);
    checkEdited();
    render();
  }

  // One file is loaded and listed; several are listed only. A file already in the list is not added again.
  async function importFiles() {
    const picked = await pickTexts('.thrl6p,application/json');
    if (picked.length === 1) {
      const { text } = picked[0];
      const result = await withBusy(() => importText(text));
      const entry = result.ok && (findText(text) || add(text));
      if (entry) markLoaded(entry);
    } else if (picked.length > 1) {
      const before = saved.entries.length;
      const refused = picked.filter(({ text }) => {
        try {
          if (!findText(text)) add(text);
          return false;
        } catch {
          return true;
        }
      }).map(file => file.name);
      const added = saved.entries.length - before;
      notify(`Added ${added} preset${added === 1 ? '' : 's'}${refused.length ? `; not loadable: ${refused.join(', ')}` : ''}`);
    }
    checkEdited();
    render();
  }

  // Puts what plays now in the list and marks it loaded. It is already there when it is the loaded entry, unchanged,
  // or an entry with the very same text. Returns { entry, added }; entry is null when the list is full.
  function keep(text) {
    checkEdited();
    const existing = (!edited && loadedEntry()) || findText(text);
    const entry = existing || add(text);
    if (entry) markLoaded(entry);
    checkEdited();
    render();
    return { entry, added: !!entry && !existing };
  }

  // Export adds what it wrote, and never changes an existing entry (that is ↻'s job). Its own toast reports it.
  async function exportFile() {
    const text = await run('export');
    if (text) keep(text);
  }

  function addCurrent() {
    let text;
    try {
      text = currentText();
    } catch (err) {
      notify('Add failed: ' + err.message);
      return;
    }
    const { entry, added } = keep(text);
    if (entry) notify(added ? 'Added ' + entry.name : 'Already in the list');
  }

  // ↻: the current settings, with the header name, replace the loaded entry's.
  function updateEntry(entry) {
    const text = currentText();
    Object.assign(entry, describe(text), { text, time: now() });
    saved.entries = [entry, ...saved.entries.filter(other => other !== entry)];
    save();
    checkEdited();
    notify('Updated ' + entry.name);
    render();
  }

  function remove(entry) {
    if (busy || !confirm(`Remove ${entry.name} from the list?`)) return;
    saved.entries = saved.entries.filter(other => other !== entry);
    if (loaded && loaded.id === entry.id) loaded = null;
    save();
    checkEdited();
    render();
  }

  // Ends a rename: the name is taken when kept and not empty. Enter, Escape and leaving the field can each end it.
  function endRename(keepText) {
    if (!renaming) return;
    const entry = saved.entries.find(other => other.id === renaming.id);
    const name = cleanName(renaming.text).trim();
    renaming = null;
    if (entry && keepText && name && name !== entry.name) {
      entry.name = name;
      entry.text = withName(entry.text, name);
      save();
      // The loaded entry's name is the header's: renaming it is no edit.
      if (entry === loadedEntry()) setName(name);
    }
    checkEdited();
    render();
  }

  function startRename(entry) {
    renaming = { id: entry.id, text: entry.name };
    renderList();
    const input = view.list.querySelector('.pr-name-input');
    input.focus();
    input.select();
  }

  function nameNode(entry, isLoaded) {
    if (renaming && renaming.id === entry.id) {
      const input = el('input', { type: 'text', class: 'pr-name-input', 'aria-label': 'Preset name', maxlength: String(NAME_MAX), autocomplete: 'off' });
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
    return button({ class: 'pr-name', text: `${entry.name}${isLoaded && edited ? ' *' : ''}` }, () => load(entry));
  }

  function row(entry, current) {
    const isLoaded = entry === current;
    const update = isLoaded && edited
      ? button({ class: 'pr-icon', 'aria-label': `Update ${entry.name}`, title: 'Store the current settings in this preset', text: '↻' }, () => updateEntry(entry))
      : el('span');
    const node = el('div', { class: isLoaded ? 'pr-entry is-selected' : 'pr-entry' },
      nameNode(entry, isLoaded),
      button({ class: 'pr-amp', 'aria-label': `Show only ${entry.amp}`, title: `Show only ${entry.amp}`, text: entry.amp }, () => {
        ampFilter = ampFilter === entry.amp ? null : entry.amp;
        renderList();
      }),
      update,
      button({ class: 'pr-icon', 'aria-label': `Rename ${entry.name}`, title: 'Rename', text: '✎' }, () => startRename(entry)),
      button({ class: 'pr-icon pr-remove', 'aria-label': `Remove ${entry.name}`, title: 'Remove from the list', text: '×' }, () => remove(entry)));
    if (isLoaded) node.setAttribute('aria-current', 'true');
    return node;
  }

  function renderList() {
    const current = loadedEntry();
    const match = query.trim().toLowerCase();
    const shown = saved.entries.filter(entry => (!ampFilter || entry.amp === ampFilter)
      && (entry.name.toLowerCase().includes(match) || entry.amp.toLowerCase().includes(match)));
    // An amp filter also shows on a short list, so it can be cleared.
    view.search.hidden = saved.entries.length < SEARCH_FROM && !ampFilter;
    view.ampChip.hidden = !ampFilter;
    view.ampChip.textContent = `${ampFilter} ×`;
    view.count.textContent = `${shown.length} / ${saved.entries.length}`;
    view.list.replaceChildren(...(saved.entries.length ? shown.map(entry => row(entry, current)) : [
      el('p', { class: 'pr-hint', text: 'Import preset files — several at once, if you like.' }),
      el('p', { class: 'pr-hint', text: '+ Add keeps what plays now, for example a result of the AI screen.' })
    ]));
    view.list.querySelectorAll('button').forEach((node) => { node.disabled = busy; });
  }

  function render() {
    if (!view) return;
    connected = isConnected();
    [view.saveToggle, view.backup, view.restore].forEach((node) => { node.disabled = !connected; });
    view.saveToggle.setAttribute('aria-expanded', String(slotsOpen && connected));
    view.slots.hidden = !(slotsOpen && connected);
    if (!renaming) renderList();
  }

  function build(host) {
    document.head.append(el('link', { rel: 'stylesheet', href: new URL('./presets.css', import.meta.url).href }));
    const saveToggle = button({ class: 'pr-action', 'aria-label': 'Save to amp memory', 'aria-expanded': 'false', text: 'Save to amp ▾' }, () => {
      slotsOpen = !slotsOpen;
      render();
    });
    const slots = el('div', { class: 'pr-slots' },
      el('span', { class: 'pr-label', text: 'Save to amp memory' }),
      ...SLOTS.map(slot => button({ class: 'pr-slot', 'aria-label': `Save to THR memory ${slot}`, text: String(slot) }, () => {
        slotsOpen = false;
        render();
        run(`save:${slot}`);
      })));
    const searchInput = el('input', { type: 'search', 'aria-label': 'Search presets', placeholder: 'Search…', autocomplete: 'off' });
    searchInput.addEventListener('input', () => {
      query = searchInput.value;
      if (!renaming) renderList();
    });
    const count = el('span', { class: 'pr-count' });
    const ampChip = button({ class: 'pr-chip', 'aria-label': 'Clear amp filter' }, () => {
      ampFilter = null;
      renderList();
    });
    const list = el('div', { class: 'pr-list' });
    const backup = button({ class: 'pr-action', text: 'Backup' }, () => run('backup'));
    const restore = button({ class: 'pr-action', text: 'Restore' }, () => run('restore'));
    view = { saveToggle, slots, search: el('div', { class: 'pr-search' }, searchInput, ampChip, count), count, ampChip, list, backup, restore };

    host.replaceChildren(el('section', { class: 'pr-screen', 'aria-label': 'Presets' },
      el('div', { class: 'pr-actions' },
        button({ class: 'pr-action', text: 'Import' }, importFiles),
        button({ class: 'pr-action', text: 'Export' }, exportFile),
        button({ class: 'pr-action', 'aria-label': 'Add', title: 'Keep what plays now in the list', text: '+ Add' }, addCurrent),
        saveToggle),
      slots,
      view.search,
      list,
      el('div', { class: 'pr-memories' }, el('span', { class: 'pr-label', text: 'Amp memories' }), backup, restore)));
  }

  return {
    // The page is shown: built on the first showing, refreshed on later ones.
    open(host) {
      if (!view) build(host);
      checkEdited();
      render();
    },
    // The settings or the connection changed. Renders only when what the screen shows changed.
    update() {
      if (!view) return;
      const before = [edited, connected, loaded && loaded.id];
      checkEdited();
      const after = [edited, isConnected(), loaded && loaded.id];
      if (before.some((value, index) => value !== after[index])) render();
    }
  };
}
