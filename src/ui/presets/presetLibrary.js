// Presets screen: an action row on what plays now (Import, Export, + Add, Save to amp), a
// persistent list of presets for quick switching, and the amp memories' Backup and Restore. Self-contained like
// src/ai: it imports nothing from the rest of the app and gets every operation from boot, so it never touches the
// store or sends a frame itself.
// With saveSet, a switch beside Backup and Restore shows the banks instead (memory sets in the code): named groups of
// five list entries, one per amp memory (or none: that memory is left as it is), saved to the amp in one go. A bank
// refers to its entries, so an entry's update or rename shows in every bank; a bank file carries the preset texts.
//
// deps (all from boot):
//   run(action)        'export' (resolves to the text written, or null) | 'backup' | 'restore' | 'save:N'
//   saveSet(name, texts)  five preset texts or null to the five memories; null when sets are off (flags.memorySets)
//   importText(text)   loads a .thrl6p text into the Actual settings; resolves to { ok, message, refused } (refused:
//                      the text cannot be loaded at all; otherwise a failure is the amp's, and the text is fine)
//   pickTexts(accept)  the file dialog with multiple selection; resolves to [{ name, text }]
//   saveFile(name, text)  the save dialog; resolves to whether the file was written
//   currentText()      the current settings as .thrl6p text, under the header name (throws without settings)
//   describe(text)     { name, amp } of a preset text the app can load (throws for one it cannot)
//   differs(text)      whether the current settings (header name included) differ from a preset text
//   generation()       counts every wholesale replacement of the settings (an import, a dump read)
//   cleanName(text)    the preset name the app would keep of a typed text
//   setName(name)      sets the header name
//   isConnected(), confirm(text), notify(text)

const STORAGE_KEY = 'thrii.presets';
const SETS_KEY = 'thrii.memorySets';
const SET_FORMAT = 'thrii-memory-set';
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
  const { run, saveSet, importText, pickTexts, saveFile, currentText, describe, differs, generation, cleanName, setName, isConnected, confirm, notify } = deps;
  // The list survives a reload where the browser allows storage (reading localStorage can throw).
  const stored = action => {
    try { return action(storage || globalThis.localStorage); } catch { return null; }
  };
  // entries: { id, name, text, amp, time }, most recently added or updated first.
  const saved = stored(box => JSON.parse(box.getItem(STORAGE_KEY))) || { entries: [] };
  const save = () => stored(box => box.setItem(STORAGE_KEY, JSON.stringify(saved)));
  // sets: { id, name, slots: five entry ids or null, time }, most recently made first.
  const memorySets = stored(box => JSON.parse(box.getItem(SETS_KEY))) || { sets: [] };
  const saveSets = () => stored(box => box.setItem(SETS_KEY, JSON.stringify(memorySets)));

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
  // 'presets' or 'sets'; in sets mode one set may be open, and a tap on one of its memories picks an entry for it
  // from the presets list ({ setId, slot }).
  let mode = 'presets';
  let openSet = null;
  let picking = null;
  // The list's filters: the search text (matched against name and amp model) and an amp model picked from a row.
  let query = '';
  let ampFilter = null;
  // The entry or set being renamed ({ id, text, set }); the list is not rebuilt meanwhile, so the field keeps its focus.
  let renaming = null;
  let view = null;

  const entryOf = id => saved.entries.find(entry => entry.id === id) || null;
  const setOf = id => memorySets.sets.find(set => set.id === id) || null;
  const loadedEntry = () => {
    if (loaded && loaded.generation !== generation()) loaded = null;
    return (loaded && entryOf(loaded.id)) || null;
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

  // One file is loaded and listed; several are listed only. A file already in the list is not added again. One file the
  // amp failed to take is still listed (not loaded), so a tap on its row tries again.
  async function importFiles() {
    const picked = await pickTexts('.thrl6p,application/json');
    if (picked.length === 1) {
      const { text } = picked[0];
      const result = await withBusy(() => importText(text));
      const entry = !result.refused && (findText(text) || add(text));
      if (entry && result.ok) markLoaded(entry);
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

  // An entry in sets leaves their memories empty.
  function remove(entry) {
    const using = memorySets.sets.filter(set => set.slots.includes(entry.id));
    const note = using.length ? ` It is in ${using.length} bank${using.length === 1 ? '' : 's'}; those memories become empty.` : '';
    if (busy || !confirm(`Remove ${entry.name} from the list?${note}`)) return;
    saved.entries = saved.entries.filter(other => other !== entry);
    if (loaded && loaded.id === entry.id) loaded = null;
    save();
    if (using.length) {
      using.forEach((set) => { set.slots = set.slots.map(id => (id === entry.id ? null : id)); });
      saveSets();
    }
    checkEdited();
    render();
  }

  // Ends a rename: the name is taken when kept and not empty. Enter, Escape and leaving the field can each end it.
  function endRename(keepText) {
    if (!renaming) return;
    const { id, text, set: isSet } = renaming;
    renaming = null;
    if (isSet) {
      const set = setOf(id);
      const name = text.trim();
      if (set && keepText && name) {
        set.name = name;
        saveSets();
      }
    } else {
      const entry = entryOf(id);
      const name = cleanName(text).trim();
      if (entry && keepText && name && name !== entry.name) {
        entry.name = name;
        entry.text = withName(entry.text, name);
        save();
        // The loaded entry's name is the header's: renaming it is no edit.
        if (entry === loadedEntry()) setName(name);
      }
    }
    checkEdited();
    render();
  }

  function startRename(item, isSet = false) {
    renaming = { id: item.id, text: item.name, set: isSet };
    renderBody();
    const input = view.list.querySelector('.pr-name-input');
    input.focus();
    input.select();
  }

  function nameInput(label) {
    const input = el('input', { type: 'text', class: 'pr-name-input', 'aria-label': label, maxlength: String(NAME_MAX), autocomplete: 'off' });
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

  const isRenaming = (item, isSet) => !!renaming && renaming.set === isSet && renaming.id === item.id;
  const renameButton = (item, isSet) => button({ class: 'pr-icon', 'aria-label': `Rename ${isSet ? 'bank ' : ''}${item.name}`, title: 'Rename', text: '✎' }, () => startRename(item, isSet));

  // While picking, a tap on a row puts the entry in the memory picked, and the row has no other tools.
  function row(entry, current) {
    const isSelected = entry === current;
    let name;
    if (picking) name = button({ class: 'pr-name', text: entry.name }, () => assign(entry));
    else if (isRenaming(entry, false)) name = nameInput('Preset name');
    else name = button({ class: 'pr-name', text: `${entry.name}${isSelected && edited ? ' *' : ''}` }, () => load(entry));
    const tools = picking ? [] : [
      isSelected && edited
        ? button({ class: 'pr-icon pr-update', 'aria-label': `Update ${entry.name}`, title: 'Store the current settings in this preset', text: '↻' }, () => updateEntry(entry))
        : el('span'),
      renameButton(entry, false),
      button({ class: 'pr-icon pr-remove', 'aria-label': `Remove ${entry.name}`, title: 'Remove from the list', text: '×' }, () => remove(entry))
    ];
    const node = el('div', { class: `pr-entry${picking ? ' is-pick' : ''}${isSelected ? ' is-selected' : ''}` },
      name,
      button({ class: 'pr-amp', 'aria-label': `Show only ${entry.amp}`, title: `Show only ${entry.amp}`, text: entry.amp }, () => {
        ampFilter = ampFilter === entry.amp ? null : entry.amp;
        renderList();
      }),
      ...tools);
    if (isSelected) node.setAttribute('aria-current', 'true');
    return node;
  }

  function renderList() {
    const current = picking ? entryOf(setOf(picking.setId).slots[picking.slot - 1]) : loadedEntry();
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

  // Sets mode. The sets are listed with their count of filled memories; the open one also shows its five memories.

  function newSet() {
    const names = new Set(memorySets.sets.map(set => set.name));
    let number = memorySets.sets.length + 1;
    while (names.has(`Bank ${number}`)) number += 1;
    const set = { id: uuid(), name: `Bank ${number}`, slots: SLOTS.map(() => null), time: now() };
    memorySets.sets.unshift(set);
    saveSets();
    openSet = set.id;
    startRename(set, true);
  }

  function removeSet(set) {
    if (busy || !confirm(`Remove the bank ${set.name}?`)) return;
    memorySets.sets = memorySets.sets.filter(other => other !== set);
    if (openSet === set.id) openSet = null;
    saveSets();
    render();
  }

  function setSlot(set, slot, id) {
    set.slots[slot - 1] = id;
    saveSets();
  }

  function assign(entry) {
    setSlot(setOf(picking.setId), picking.slot, entry.id);
    picking = null;
    render();
  }

  // The file holds the preset texts as they are in the list, so an import finds the very same entries.
  async function exportSet() {
    const set = setOf(openSet);
    if (!set) return;
    const slots = SLOTS.map(slot => ({ slot, preset: (entryOf(set.slots[slot - 1]) || {}).text || null }));
    if (await saveFile(`THR bank ${set.name}.json`, JSON.stringify({ format: SET_FORMAT, version: 1, name: set.name, slots }, null, 1) + '\n')) {
      notify('Exported ' + set.name);
    }
  }

  // Each file becomes a new set; its presets are listed unless the list has them already. A file with a preset the app
  // cannot load is refused as a whole.
  async function importSets() {
    const picked = await pickTexts('.json,application/json');
    const refused = [];
    let added = 0;
    picked.forEach(({ name, text }) => {
      try {
        const json = JSON.parse(text);
        const presets = json && json.format === SET_FORMAT && json.version === 1 && Array.isArray(json.slots) && json.slots.length === SLOTS.length
          ? json.slots.map(entry => (entry && typeof entry.preset === 'string' ? entry.preset : null))
          : null;
        if (!presets) throw new Error('not a set');
        presets.forEach(preset => preset && describe(preset));
        const slots = presets.map(preset => (preset ? ((findText(preset) || add(preset)) || {}).id || null : null));
        memorySets.sets.unshift({ id: uuid(), name: String(json.name || '').trim().slice(0, NAME_MAX) || 'Bank', slots, time: now() });
        added += 1;
      } catch {
        refused.push(name);
      }
    });
    if (!picked.length) return;
    if (added) {
      openSet = memorySets.sets[0].id;
      saveSets();
    }
    notify(`Added ${added} bank${added === 1 ? '' : 's'}${refused.length ? `; not loadable: ${refused.join(', ')}` : ''}`);
    render();
  }

  async function saveSetToAmp() {
    const set = setOf(openSet);
    if (!set || busy) return;
    await withBusy(() => saveSet(set.name, set.slots.map(id => (entryOf(id) || {}).text || null)));
    checkEdited();
    render();
  }

  function slotRow(set, slot) {
    const entry = entryOf(set.slots[slot - 1]);
    return el('div', { class: 'pr-memory' },
      el('span', { class: 'pr-memory-number', text: String(slot) }),
      button({ class: entry ? 'pr-name' : 'pr-name is-empty', 'aria-label': `Memory ${slot}: ${entry ? entry.name : 'empty'}`, text: entry ? entry.name : '· empty ·' }, () => {
        picking = { setId: set.id, slot };
        render();
      }),
      el('span', { class: 'pr-memory-amp', text: entry ? entry.amp : 'tap to pick' }),
      entry
        ? button({ class: 'pr-icon pr-remove', 'aria-label': `Clear memory ${slot}`, title: 'Leave this memory as it is on the amp', text: '–' }, () => {
          setSlot(set, slot, null);
          renderSets();
        })
        : el('span'));
  }

  function setRows(set) {
    const isOpen = set.id === openSet;
    const filled = set.slots.filter(id => entryOf(id)).length;
    const head = el('div', { class: isOpen ? 'pr-set is-selected' : 'pr-set' },
      isRenaming(set, true)
        ? nameInput('Bank name')
        : button({ class: 'pr-name', 'aria-expanded': String(isOpen), text: `${isOpen ? '▾' : '▸'} ${set.name}` }, () => {
          openSet = isOpen ? null : set.id;
          renderSets();
        }),
      el('span', { class: 'pr-count', text: `${filled}/${SLOTS.length}` }),
      renameButton(set, true),
      button({ class: 'pr-icon pr-remove', 'aria-label': `Remove bank ${set.name}`, title: 'Remove the bank', text: '×' }, () => removeSet(set)));
    return isOpen ? [head, ...SLOTS.map(slot => slotRow(set, slot))] : [head];
  }

  function renderSets() {
    const open = setOf(openSet);
    view.search.hidden = true;
    view.exportSet.disabled = !open;
    view.toAmp.disabled = !(open && connected && open.slots.some(entryOf));
    view.list.replaceChildren(...(memorySets.sets.length ? memorySets.sets.flatMap(setRows) : [
      el('p', { class: 'pr-hint', text: '+ New makes a bank: one preset of the list for each of the five amp memories.' }),
      el('p', { class: 'pr-hint', text: 'Save to amp then saves them all; an empty memory is left as it is.' })
    ]));
    view.list.querySelectorAll('button').forEach((node) => { node.disabled = busy; });
  }

  const renderBody = () => (mode === 'sets' && !picking ? renderSets() : renderList());

  function setMode(next) {
    mode = next;
    picking = null;
    slotsOpen = false;
    render();
  }

  function render() {
    if (!view) return;
    connected = isConnected();
    const sets = mode === 'sets';
    [view.saveToggle, view.backup, view.restore].forEach((node) => { node.disabled = !connected; });
    view.saveToggle.setAttribute('aria-expanded', String(slotsOpen && connected));
    view.actions.hidden = sets;
    view.slots.hidden = sets || !(slotsOpen && connected);
    if (view.setActions) {
      view.setActions.hidden = !sets || !!picking;
      view.pickBar.hidden = !picking;
      if (picking) view.pickLabel.textContent = `Memory ${picking.slot} · ${setOf(picking.setId).name}`;
      view.modes.forEach(node => node.setAttribute('aria-pressed', String(node.dataset.mode === mode)));
    }
    if (!renaming) renderBody();
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
    const actions = el('div', { class: 'pr-actions' },
      button({ class: 'pr-action', text: 'Import' }, importFiles),
      button({ class: 'pr-action', text: 'Export' }, exportFile),
      button({ class: 'pr-action', 'aria-label': 'Add', title: 'Keep what plays now in the list', text: '+ Add' }, addCurrent),
      saveToggle);
    view = { actions, saveToggle, slots, search: el('div', { class: 'pr-search' }, searchInput, ampChip, count), count, ampChip, list, backup, restore };

    // Sets mode: its action row in place of the presets one, and the bar of a memory being picked in place of both.
    let modeSwitch = el('span', { class: 'pr-label', text: 'Amp memories' });
    const setParts = [];
    if (saveSet) {
      view.exportSet = button({ class: 'pr-action', 'aria-label': 'Export bank', text: 'Export' }, exportSet);
      view.toAmp = button({ class: 'pr-action', 'aria-label': 'Save bank to amp', text: 'Save to amp' }, saveSetToAmp);
      view.setActions = el('div', { class: 'pr-actions' },
        button({ class: 'pr-action', 'aria-label': 'Import banks', text: 'Import' }, importSets),
        view.exportSet,
        button({ class: 'pr-action', 'aria-label': 'New bank', text: '+ New' }, newSet),
        view.toAmp);
      view.pickLabel = el('span', { class: 'pr-label' });
      view.pickBar = el('div', { class: 'pr-actions pr-pick' }, view.pickLabel, button({ class: 'pr-action', 'aria-label': 'Cancel pick', text: 'Cancel' }, () => {
        picking = null;
        render();
      }));
      view.modes = [['presets', 'Presets'], ['sets', 'Banks']].map(([key, text]) => {
        const node = button({ class: 'pr-mode-button', 'aria-pressed': String(key === mode), text }, () => setMode(key));
        node.dataset.mode = key;
        return node;
      });
      modeSwitch = el('div', { class: 'pr-mode', role: 'group', 'aria-label': 'Show presets or banks' }, ...view.modes);
      setParts.push(view.setActions, view.pickBar);
    }

    host.replaceChildren(el('section', { class: 'pr-screen', 'aria-label': 'Presets' },
      actions,
      ...setParts,
      slots,
      view.search,
      list,
      el('div', { class: 'pr-memories' }, modeSwitch, backup, restore)));
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
