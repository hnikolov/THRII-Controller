import { it, assertEqual, assertDeepEqual, assertTrue } from '../support/assert.js';
import { until } from '../support/fakeAmp.js';
import { aiAvailable, createApi } from '../../src/ai/api.js';
import { createAiPresetSource } from '../../src/ai/aiPresets.js';

const AMPS = [
  { id: 'yamaha-thr-10', name: 'Yamaha THR10', hasSoftwareExportHandler: false },
  { id: 'yamaha-thr-10-ii', name: 'Yamaha THR10II', hasSoftwareExportHandler: true },
  { id: 'yamaha-thr-30-ii', name: 'Yamaha THR30II', hasSoftwareExportHandler: true }
];
const reply = (status, body) => ({ ok: status < 400, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
// The export of a preset id: a .thrl6p-shaped text that names the id, so a test can tell which text was imported.
const presetText = id => JSON.stringify({ data: { meta: { name: `gen ${id}` }, id } });
// What the app was handed: the preset's id and the name it was given.
const describe = text => { const { data } = JSON.parse(text); return `${data.id}:${data.meta.name}`; };

// Stands in for the proxy. A generate request waits until the test answers it (answer, fail) or it is aborted.
function fakeBackend() {
  const backend = {
    calls: [],
    amps: reply(200, AMPS),
    pending: null,
    exportContent: presetText,
    answer: (id, preset) => backend.pending.resolve(reply(200, { generatedPresetId: id, preset })),
    fail: response => (response ? backend.pending.resolve(response) : backend.pending.reject(new TypeError('Failed to fetch'))),
    fetch(url, options = {}) {
      backend.calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
      if (url === '/api/amplifiers') return backend.amps ? Promise.resolve(backend.amps) : Promise.reject(new TypeError('Failed to fetch'));
      if (url === '/api/presets/generate') {
        return new Promise((resolve, reject) => {
          backend.pending = { resolve, reject };
          options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }).finally(() => { backend.pending = null; });
      }
      const id = url.match(/^\/api\/presets\/(.+)\/export$/)[1];
      return Promise.resolve(reply(200, { fileName: 'x.thrl6p', content: backend.exportContent(id) }));
    }
  };
  return backend;
}

function fakeStorage(initial = {}) {
  const items = { ...initial };
  return { items, getItem: key => items[key] ?? null, setItem: (key, value) => { items[key] = value; } };
}

// One screen source on a fake backend, with a host element (the page) and a recording importText. ctx.ampModel is the
// connected amp's model code and can be changed between showings; ctx.answers are the next confirm answers (default yes).
function setup({ ampModel = null, storage = fakeStorage(), importResult = () => ({ ok: true, message: 'Imported' }) } = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const backend = fakeBackend();
  const ctx = { host, backend, storage, ampModel, imported: [], confirms: [], answers: [], activity: [], time: Date.UTC(2026, 10, 14, 20, 0), ids: 0 };
  const source = createAiPresetSource({
    api: createApi({ base: '/api', fetch: backend.fetch }),
    storage,
    now: () => ctx.time,
    uuid: () => `id-${ctx.ids += 1}`,
    confirm: (text) => { ctx.confirms.push(text); return ctx.answers.length ? ctx.answers.shift() : true; }
  });
  const importText = async (text) => { ctx.imported.push(text); return importResult(text); };
  const find = selector => host.querySelector(selector);
  const all = selector => [...host.querySelectorAll(selector)];
  Object.assign(ctx, {
    find,
    field: label => find(`[aria-label="${label}"]`),
    go: () => find('.ai-go'),
    text: selector => (find(selector) && !find(selector).closest('[hidden]') && find(selector).textContent) || null,
    status: () => find('.ai-status').textContent,
    credit: () => find('.ai-screen > .ai-credit'),
    lastImport: () => describe(ctx.imported[ctx.imported.length - 1]),
    // The version tabs, the open one in brackets, e.g. 'A [B] C'; '' when there are none.
    tabs: () => (find('.ai-tabbar').hidden ? '' : all('.ai-tab').map(tab => (tab.getAttribute('aria-selected') === 'true' ? `[${tab.textContent}]` : tab.textContent)).join(' ')),
    // The list, a line per sound: '> Name A [B]' with > for the loaded sound and the loaded version in brackets.
    rows: () => all('.ai-sound').map(row => `${row.classList.contains('is-selected') ? '> ' : ''}${row.querySelector('.ai-sound-name').textContent} ${
      [...row.querySelectorAll('.ai-letter')].map(letter => (letter.classList.contains('is-selected') ? `[${letter.textContent}]` : letter.textContent)).join(' ')}`),
    targets: () => [...ctx.field('Target').options].map(option => option.value),
    setTarget(value) {
      ctx.field('Target').value = value;
      ctx.field('Target').dispatchEvent(new Event('change'));
    },
    type(label, value) {
      ctx.field(label).value = value;
      ctx.field(label).dispatchEvent(new Event('input'));
    },
    tab: letter => all('.ai-tab').find(tab => tab.textContent === letter).click(),
    letter: (name, letter) => find(`[aria-label="${name} version ${letter}"]`).click(),
    cleanup: () => host.remove(),
    // Shows the screen (the first time this builds it) and waits for the amp list, or for the note that it could not
    // be loaded.
    show: () => source({ host, importText, ampModel: () => ctx.ampModel, setActivity: on => ctx.activity.push(on) }),
    async open() {
      ctx.show();
      await until(() => !ctx.go().disabled || /cannot be reached/.test(ctx.status()), 'the amp list');
    },
    // Fills the card (only the fields given) and presses ▶; resolves once the request is out.
    async press(fields = {}) {
      Object.entries(fields).forEach(([label, value]) => ctx.type(label, value));
      ctx.go().click();
      await until(() => backend.pending, 'the generate request');
    },
    // Waits until a generation and the import of its result are over.
    async settled() {
      await until(() => ctx.go().getAttribute('aria-label') !== 'Cancel' && !ctx.go().disabled, 'the end of the generation');
    },
    // A whole generation: request, answer, export, import.
    async generate(fields, id, preset = { presetName: `Preset ${id}`, tip: `tip ${id}` }) {
      await ctx.press(fields);
      const before = ctx.imported.length;
      backend.answer(id, preset);
      await until(() => ctx.imported.length > before, 'the import of the result');
      await ctx.settled();
    }
  });
  return ctx;
}

const first = { Guitar: 'Strat', Sound: 'Hotel California solo' };

it('import AI: first use lists the amps with a preset export, pre-selects the connected one, then the last pick, then the first; only a new sound can be made', async () => {
  const lastPick = () => fakeStorage({ 'thrii.aiPresets': JSON.stringify({ amp: 'yamaha-thr-30-ii' }) });
  for (const [ampModel, storage, expected] of [[1, lastPick(), 'yamaha-thr-10-ii'], [null, lastPick(), 'yamaha-thr-30-ii'], [7, fakeStorage(), 'yamaha-thr-10-ii']]) {
    const ctx = setup({ ampModel, storage });
    try {
      await ctx.open();
      assertDeepEqual([...ctx.field('Amplifier').options].map(option => option.value), ['yamaha-thr-10-ii', 'yamaha-thr-30-ii'], 'amps offered');
      assertEqual(ctx.field('Amplifier').value, expected, `selected for model ${ampModel}`);
      assertDeepEqual([ctx.tabs(), ctx.text('.ai-tip'), ctx.text('.ai-remove')], ['', null, null], 'no version: no tabs, no tip, no ×');
      assertDeepEqual([ctx.targets(), ctx.go().getAttribute('aria-label')], [['new'], 'Generate a new sound'], 'only a new sound');
      assertEqual(ctx.rows().length, 0, 'no sounds yet');
      assertEqual(ctx.host.querySelectorAll('.ai-hint').length, 2, 'a hint in their place');
      assertEqual(ctx.credit().querySelector('a').href, 'https://amplifier-presets.com/', 'credit link');
      assertEqual(ctx.credit().textContent, 'Presets by amplifier-presets.com · M. Bredeli · F. Hegelstad', 'the credit on one line');
      assertEqual(ctx.credit().querySelector('span').title, 'Magnus Bredeli, development', 'the full name and role in the title');
      assertEqual(/No amp connected/.test(ctx.status()), ampModel === null, 'the note about a missing amp');
    } finally {
      ctx.cleanup();
    }
  }
});

it('import AI: ▶ sends the card as it is, the result is loaded with its letter in the name and becomes version A of a new sound', async () => {
  const ctx = setup({ ampModel: 1 });
  try {
    await ctx.open();
    await ctx.press({ Guitar: 'Les Paul', Sound: 'Hotel California solo', Pickups: ' humbucker ' });
    assertDeepEqual(ctx.backend.calls[1], {
      url: '/api/presets/generate',
      method: 'POST',
      body: { sessionId: 'id-1', presetType: 'SOFTWARE', prompt: 'Hotel California solo', guitar: 'Les Paul', pickupConfiguration: 'humbucker', amplifierId: 'yamaha-thr-10-ii' }
    }, 'request: always the "THR Remote app" preset type, with the card\'s fields');

    // While the request is out: no second request, ▶ is the cancel, the fields stay editable, the AI button shows activity.
    ctx.find('.ai-request').requestSubmit();
    assertEqual(ctx.backend.calls.length, 2, 'one generate request');
    assertDeepEqual([ctx.go().textContent, ctx.go().getAttribute('aria-label')], ['■', 'Cancel'], 'the button cancels');
    assertEqual(ctx.field('Sound').disabled, false, 'the card takes input: the request already left');
    assertTrue(/^Generating a new sound · \d+ s$/.test(ctx.status()), 'progress: ' + ctx.status());
    assertDeepEqual(ctx.activity, [true], 'the activity is on');

    // The shell hides the screen and shows it again while the request is out: the request goes on.
    const screen = ctx.find('.ai-screen');
    ctx.show();
    assertEqual(ctx.backend.calls.length, 2, 'a showing sends nothing');

    ctx.backend.answer('abc', { presetName: 'Walsh <b>Hotel</b> Solo', tip: 'Roll the tone back.' });
    await ctx.settled();
    assertDeepEqual(ctx.backend.calls[2], { url: '/api/presets/abc/export', method: 'GET', body: null }, 'export call');
    assertDeepEqual(ctx.imported.map(describe), ['abc:Walsh <b>Hotel</b> Solo'], 'imported once, with the generator\'s name');
    assertDeepEqual([ctx.tabs(), ctx.text('.ai-tip')], ['[A]', 'Roll the tone back.'], 'the card shows version A');
    assertDeepEqual(ctx.rows(), ['> Walsh <b>Hotel</b> Solo [A]'], 'the sound in the list, its name as text');
    assertEqual(ctx.find('.ai-sound-name b'), null, 'markup in a name is not rendered');
    assertDeepEqual([ctx.field('Target').value, ctx.go().getAttribute('aria-label')], ['B', 'Generate version B'], 'the next version is pre-selected');
    assertDeepEqual(ctx.activity, [true, false], 'the activity is off');
    assertEqual(ctx.status(), '', 'the status line is quiet: the app reports the import');
    assertEqual(ctx.find('.ai-screen'), screen, 'the screen is built once');
    assertEqual(ctx.backend.calls.length, 3, 'the amp list is not asked for again');
  } finally {
    ctx.cleanup();
  }
});

it('import AI: versions of a sound carry their own request; a tab loads its version and puts its request back into the card', async () => {
  const ctx = setup();
  try {
    await ctx.open();
    await ctx.generate(first, 'a', { presetName: 'Walsh', tip: 'tip a' });
    await ctx.generate({ Guitar: 'Les Paul', Pickups: 'Humbucker', Sound: 'Hotel California solo, more sustain' }, 'b', { presetName: 'Other name', tip: 'tip b' });
    assertDeepEqual(ctx.backend.calls[3].body.guitar, 'Les Paul', 'the edited guitar was sent');
    assertDeepEqual([ctx.tabs(), ctx.text('.ai-tip'), ctx.lastImport()], ['A [B]', 'tip b', 'b:Other name'], 'B is the sound\'s second version, with its own name');
    assertDeepEqual(ctx.rows(), ['> Walsh A [B]'], 'one sound with two versions');

    // An edit marks the field that differs from the loaded version; a tab brings that version's request back.
    ctx.type('Guitar', 'Telecaster');
    assertDeepEqual(['Sound', 'Guitar', 'Pickups'].map(label => ctx.field(label).classList.contains('is-edited')), [false, true, false], 'the edited field');
    const calls = ctx.backend.calls.length;
    ctx.tab('A');
    await until(() => ctx.tabs() === '[A] B', 'version A');
    assertDeepEqual(['Sound', 'Guitar', 'Pickups'].map(label => ctx.field(label).value), ['Hotel California solo', 'Strat', ''], 'A\'s request');
    assertEqual(ctx.host.querySelectorAll('.is-edited').length, 0, 'nothing marked');
    assertDeepEqual([ctx.text('.ai-tip'), ctx.lastImport(), ctx.backend.calls.length], ['tip a', 'a:Walsh', calls], 'A\'s tip and text, no request');
    assertEqual(ctx.field('Target').value, 'C', 'the next free letter stays the target');

    // A list letter does the same as a tab.
    ctx.letter('Walsh', 'B');
    await until(() => ctx.tabs() === 'A [B]', 'version B from the list');
    assertEqual(ctx.field('Guitar').value, 'Les Paul', 'B\'s request');
  } finally {
    ctx.cleanup();
  }
});

it('import AI: the target is the first free letter, then wraps from E to A; an existing letter is replaced only after a yes; NEW SOUND starts another sound', async () => {
  const ctx = setup();
  try {
    await ctx.open();
    for (const id of ['a', 'b', 'c']) {
      ctx.time += 60 * 1000;
      await ctx.generate(first, id);
    }
    // A gap after a removal is the next target.
    ctx.tab('B');
    await until(() => ctx.tabs() === 'A [B] C', 'version B');
    ctx.find('.ai-remove').click();
    await until(() => ctx.tabs() === '[A] C', 'B removed, A loaded');
    assertEqual(ctx.field('Target').value, 'B', 'the gap is the target');
    assertDeepEqual(ctx.targets(), ['new', 'A', 'B', 'C', 'D', 'E'], 'every letter can be picked, and a new sound');
    assertDeepEqual([...ctx.field('Target').options].map(option => option.textContent),
      ['New sound', 'Replace A', 'Version B', 'Replace C', 'Version D', 'Version E'], 'an existing letter says it replaces');

    for (const id of ['b2', 'd', 'e']) {
      ctx.time += 60 * 1000;
      await ctx.generate({}, id);
    }
    assertEqual(ctx.tabs(), 'A B C D [E]', 'five versions');
    assertEqual(ctx.field('Target').value, 'A', 'after E the target wraps to A');

    // Replacing asks first; a no sends nothing.
    ctx.answers.push(false);
    ctx.go().click();
    assertDeepEqual([ctx.confirms.pop(), ctx.backend.pending], ['Replace version A of Preset a?', null], 'asked, nothing sent');
    ctx.time += 60 * 1000;
    await ctx.generate({}, 'a2');
    assertDeepEqual([ctx.tabs(), ctx.lastImport(), ctx.field('Target').value], ['[A] B C D E', 'a2:Preset a2', 'B'], 'A replaced; B is next');

    // A new sound keeps the card's text and starts at A, on top of the list.
    ctx.setTarget('new');
    assertEqual(ctx.go().getAttribute('aria-label'), 'Generate a new sound', 'the button says it');
    ctx.time += 60 * 1000;
    await ctx.generate({ Sound: 'Santana, Samba Pa Ti' }, 's', { presetName: 'Santana', tip: '' });
    assertDeepEqual(ctx.rows(), ['> Santana [A]', 'Preset a A B C D E'], 'the new sound on top');
    assertEqual(ctx.field('Target').value, 'B', 'its next version is the target');
  } finally {
    ctx.cleanup();
  }
});

it('import AI: the card × removes the loaded version and loads the first left; the last version and the list × remove the sound after a yes', async () => {
  const ctx = setup();
  try {
    await ctx.open();
    await ctx.generate(first, 'a', { presetName: 'One', tip: 'tip a' });
    await ctx.generate({}, 'b', { presetName: 'x', tip: 'tip b' });
    ctx.setTarget('new');
    await ctx.generate({ Sound: 'other' }, 'o', { presetName: 'Two', tip: 'tip o' });
    ctx.letter('One', 'A');
    await until(() => ctx.tabs() === '[A] B', 'One A');

    ctx.find('[aria-label="Remove version A"]').click();
    await until(() => ctx.tabs() === '[B]', 'A removed');
    assertDeepEqual([ctx.lastImport(), ctx.rows()], ['b:x', ['Two A', '> One [B]']], 'B, the first left, is loaded; loading does not reorder');
    assertEqual(ctx.confirms.length, 0, 'a version goes without a question');

    // The last version: the sound goes after a yes; the card keeps its text and only a new sound can be made.
    const imports = ctx.imported.length;
    ctx.answers.push(false);
    ctx.find('[aria-label="Remove version B"]').click();
    assertDeepEqual([ctx.confirms.pop(), ctx.rows().length], ['Remove One (1 version)?', 2], 'asked; a no keeps it');
    ctx.find('[aria-label="Remove version B"]').click();
    assertDeepEqual([ctx.confirms.pop(), ctx.rows(), ctx.tabs()], ['Remove One (1 version)?', ['Two A'], ''], 'the sound is gone');
    assertDeepEqual([ctx.field('Target').value, ctx.field('Sound').value], ['new', 'Hotel California solo'], 'a new sound from the kept text');
    assertEqual(ctx.imported.length, imports, 'nothing imported: the amp keeps playing');

    // The list × always asks, also for a single version.
    ctx.answers.push(false);
    ctx.find('[aria-label="Remove Two"]').click();
    assertDeepEqual([ctx.confirms.pop(), ctx.rows()], ['Remove Two (1 version)?', ['Two A']], 'asked; a no keeps it');
    ctx.find('[aria-label="Remove Two"]').click();
    assertEqual(ctx.rows().length, 0, 'removed');
    assertEqual(JSON.parse(ctx.storage.items['thrii.aiPresets.v2']).sounds.length, 0, 'the removal is stored');
    assertEqual(ctx.host.querySelectorAll('.ai-hint').length, 2, 'the hint is back');
  } finally {
    ctx.cleanup();
  }
});

it('import AI: the target is fixed at the press; the result goes to its sound even when another one was loaded meanwhile', async () => {
  const ctx = setup();
  try {
    await ctx.open();
    await ctx.generate(first, 'w', { presetName: 'Walsh', tip: '' });
    ctx.setTarget('new');
    await ctx.generate({ Sound: 'santana' }, 's', { presetName: 'Santana', tip: '' });
    ctx.letter('Walsh', 'A');
    await until(() => ctx.rows()[1] === '> Walsh [A]', 'Walsh loaded');

    await ctx.press({ Sound: 'Hotel California solo, brighter' });
    assertEqual(ctx.status().startsWith('Generating B · '), true, 'progress names the version: ' + ctx.status());
    ctx.letter('Santana', 'A');
    await until(() => ctx.rows()[0] === '> Santana [A]', 'Santana loaded while generating');
    ctx.backend.answer('w2', { presetName: 'x', tip: '' });
    await until(() => ctx.lastImport() === 'w2:x', 'the result');
    await ctx.settled();
    assertDeepEqual(ctx.rows(), ['> Walsh A [B]', 'Santana A'], 'Walsh got B and moved to the top; the card follows it');
    assertEqual(ctx.field('Sound').value, 'Hotel California solo, brighter', 'B\'s request in the card');
  } finally {
    ctx.cleanup();
  }
});

it('import AI: a version keeps its own name; one an earlier letter of its sound already has gets its letter, within the app\'s 20 characters', async () => {
  const ctx = setup();
  try {
    await ctx.open();
    const long = { presetName: 'A Very Long Preset Name Indeed', tip: '' };
    await ctx.generate(first, 'a', long);
    await ctx.generate({}, 'b', long);
    await ctx.generate({}, 'c', { presetName: 'Clean Intro', tip: '' });
    assertDeepEqual(ctx.imported.map(describe), ['a:A Very Long Preset Name Indeed', 'b:A Very Long Preset B', 'c:Clean Intro'],
      'A as generated (the app cuts it), B with its letter after 18 characters, C its own');

    // Replacing A with the same name again: A is still the first of that name and keeps it plain.
    ctx.setTarget('A');
    await ctx.generate({}, 'a2', long);
    assertEqual(ctx.lastImport(), 'a2:A Very Long Preset Name Indeed', 'A plain');
    ctx.tab('B');
    await until(() => ctx.tabs() === 'A [B] C', 'B');
    assertEqual(ctx.lastImport(), 'b:A Very Long Preset B', 'B keeps its letter');
  } finally {
    ctx.cleanup();
  }
});

it('import AI: any sound can be renamed in the list, without loading it; its versions keep their names', async () => {
  const ctx = setup();
  try {
    await ctx.open();
    await ctx.generate(first, 'r', { presetName: 'Rhythm', tip: '' });
    ctx.setTarget('new');
    await ctx.generate({}, 'o', { presetName: 'Other', tip: '' });
    ctx.setTarget('B');
    await ctx.generate({}, 'o2', { presetName: 'Solo', tip: '' });
    assertDeepEqual(ctx.host.querySelectorAll('.ai-sound-rename').length, 2, 'every sound offers a rename');
    assertEqual(ctx.text('.ai-time'), null, 'no times in the list');

    // A sound that is not loaded: renamed in place, nothing imported, the loaded one stays.
    const imports = ctx.imported.length;
    ctx.find('[aria-label="Rename Rhythm"]').click();
    ctx.type('Sound name', 'Santana');
    ctx.field('Sound name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    assertDeepEqual([ctx.rows(), ctx.imported.length], [['> Other A [B]', 'Santana A'], imports], 'renamed, not loaded');

    const rename = async (text, key) => {
      ctx.find('[aria-label="Rename Other"], [aria-label="Rename Metallica"]').click();
      const input = ctx.field('Sound name');
      assertEqual(document.activeElement, input, 'the field has the focus');
      input.value = text;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new KeyboardEvent('keydown', { key }));
    };
    await rename('  Metallica ', 'Enter');
    assertDeepEqual(ctx.rows(), ['> Metallica A [B]', 'Santana A'], 'renamed, trimmed');
    await rename('Megadeth', 'Escape');
    assertDeepEqual(ctx.rows()[0], '> Metallica A [B]', 'Escape keeps the name');
    await rename('   ', 'Enter');
    assertDeepEqual(ctx.rows()[0], '> Metallica A [B]', 'an empty name keeps the old one');
    assertEqual(ctx.field('Sound name'), null, 'the field is gone');

    ctx.letter('Metallica', 'A');
    await until(() => ctx.tabs() === '[A] B', 'A');
    assertEqual(ctx.lastImport(), 'o:Other', 'the version keeps its own name');
    assertEqual(JSON.parse(ctx.storage.items['thrii.aiPresets.v2']).sounds[0].name, 'Metallica', 'the name is stored');
    ctx.answers.push(false);
    ctx.find('[aria-label="Remove Metallica"]').click();
    assertEqual(ctx.confirms.pop(), 'Remove Metallica (2 versions)?', 'the question uses the new name');
  } finally {
    ctx.cleanup();
  }
});

it('import AI: the flat list of the first version becomes sounds, by name and guitar, oldest = A; the result survives a reload', async () => {
  const entry = (id, name, guitar, minutes) => ({ id, name, guitar, pickup: '', tip: `tip ${id}`, prompt: `prompt ${id}`, time: Date.UTC(2026, 10, 14, 20, minutes), text: presetText(id) });
  const old = {
    sessionId: 's', guitar: 'Strat', pickup: '', prompt: 'draft', amp: 'yamaha-thr-30-ii', current: 'e3',
    history: [entry('e1', 'Twin', 'Strat', 30), entry('e2', 'Other', 'PRS', 20), entry('e4', 'Twin', 'Les Paul', 15), entry('e3', 'Twin', 'Strat', 10)]
  };
  const storage = fakeStorage({ 'thrii.aiPresets': JSON.stringify(old) });
  const ctx = setup({ storage });
  try {
    await ctx.open();
    assertDeepEqual(ctx.rows(), ['> Twin [A] B', 'Other A', 'Twin A'], 'grouped by name and guitar, newest sound first, the old selection loaded');
    assertDeepEqual([ctx.tabs(), ctx.text('.ai-tip'), ctx.field('Sound').value, ctx.field('Target').value], ['[A] B', 'tip e3', 'draft', 'C'], 'the card and its draft');
    ctx.letter('Twin', 'B');
    await until(() => ctx.tabs() === 'A [B]', 'B');
    assertDeepEqual([ctx.lastImport(), ctx.field('Sound').value], ['e1:Twin B', 'prompt e1'], 'the old entry\'s text and request');
    assertEqual(storage.items['thrii.aiPresets'], JSON.stringify(old), 'the old key is left as it was');
  } finally {
    ctx.cleanup();
  }

  const reloaded = setup({ storage });
  try {
    await reloaded.open();
    assertDeepEqual([reloaded.rows()[0], reloaded.tabs(), reloaded.field('Sound').value], ['> Twin A [B]', 'A [B]', 'prompt e1'], 'kept over a reload');
  } finally {
    reloaded.cleanup();
  }
});

it('import AI: failures stay on the screen and nothing is kept', async () => {
  const ctx = setup({ ampModel: 1 });
  try {
    await ctx.open();

    await ctx.press(first);
    ctx.backend.fail(reply(422, { error: { issues: [{ path: ['amplifierId'], message: 'Invalid option' }] } }));
    await until(() => /Request rejected \(422\): amplifierId: Invalid option/.test(ctx.status()), 'the validation message');
    assertTrue(ctx.find('.ai-status').classList.contains('is-error'), 'shown as an error');

    await ctx.press();
    ctx.backend.fail();
    await until(() => ctx.status() === 'The preset generator cannot be reached.', 'the network failure');

    await ctx.press();
    ctx.go().click();
    await until(() => ctx.status() === 'Cancelled.', 'the cancel');
    assertEqual(ctx.find('.ai-status').classList.contains('is-error'), false, 'a cancel is no error');

    ctx.backend.exportContent = () => '';
    await ctx.press();
    ctx.backend.answer('empty', { presetName: 'Empty' });
    await until(() => ctx.status() === 'The preset export came back empty.', 'the empty export');

    ctx.type('Sound', ' ');
    ctx.go().click();
    assertEqual(ctx.status(), 'Name the guitar and describe the sound first.', 'an empty request is not sent');

    assertDeepEqual([ctx.imported, ctx.rows(), ctx.tabs()], [[], [], ''], 'nothing imported or kept');
    assertEqual(ctx.field('Guitar').value, 'Strat', 'the draft is kept');
    assertEqual(ctx.activity.filter(on => on).length, ctx.activity.filter(on => !on).length, 'the activity ends every time');
  } finally {
    ctx.cleanup();
  }
});

it('import AI: a preset the app refuses is reported and not kept; an unreachable generator switches ▶ off', async () => {
  const refusing = setup({ importResult: () => ({ ok: false, message: 'Import failed: unknown names' }) });
  try {
    await refusing.open();
    await refusing.generate(first, 'bad');
    assertEqual(refusing.imported.length, 1, 'the import was tried once');
    assertEqual(refusing.status(), 'Import failed: unknown names', 'the refusal');
    assertDeepEqual([refusing.rows(), refusing.tabs()], [[], ''], 'not kept');
  } finally {
    refusing.cleanup();
  }

  const offline = setup();
  offline.backend.amps = null;
  try {
    await offline.open();
    assertTrue(offline.go().disabled, '▶ is off');
    assertTrue(/cannot be reached.*scripts\/serve\.py/.test(offline.status()), 'the note says how to start the proxy');
    offline.find('.ai-request').requestSubmit();
    assertEqual(offline.backend.calls.length, 1, 'no generate request');
  } finally {
    offline.cleanup();
  }
});

it('import AI: a later showing tries an unreachable generator again and follows a newly connected amp', async () => {
  const ctx = setup({ storage: fakeStorage({ 'thrii.aiPresets': JSON.stringify({ amp: 'yamaha-thr-30-ii' }) }) });
  ctx.backend.amps = null;
  try {
    await ctx.open();
    assertTrue(ctx.go().disabled && ctx.find('.ai-status').classList.contains('is-error'), 'not reachable: ▶ is off');

    ctx.backend.amps = reply(200, AMPS);
    ctx.show();
    await until(() => !ctx.go().disabled, '▶ to come on once the generator is reachable');
    assertEqual(ctx.field('Amplifier').value, 'yamaha-thr-30-ii', 'no amp connected: the last pick');
    assertTrue(/No amp connected/.test(ctx.status()), 'the unreachable note is gone: ' + ctx.status());

    ctx.ampModel = 1;
    await ctx.open();
    assertEqual(ctx.field('Amplifier').value, 'yamaha-thr-10-ii', 'the amp that was connected since');
    assertEqual(ctx.status(), '', 'nothing to say with an amp');
    assertEqual(ctx.backend.calls.length, 2, 'the list was asked for twice, not a third time');
  } finally {
    ctx.cleanup();
  }
});

it('AI availability: only a 200 from the proxy health check offers Import AI; 404, 403, offline and no answer do not', async () => {
  const calls = [];
  const answering = status => (url, options) => {
    calls.push(url);
    return Promise.resolve({ ok: status === 200, status });
  };
  assertEqual(await aiAvailable({ base: '/api', fetch: answering(200) }), true, '200');
  assertEqual(await aiAvailable({ base: '/api', fetch: answering(404) }), false, '404 (no proxy)');
  assertEqual(await aiAvailable({ base: '/api', fetch: answering(403) }), false, '403 (origin not allowed)');
  assertEqual(await aiAvailable({ base: '/api', fetch: () => Promise.reject(new TypeError('Failed to fetch')) }), false, 'offline');
  const silent = (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  assertEqual(await aiAvailable({ base: '/api', fetch: silent, timeoutMs: 20 }), false, 'no answer in time');
  assertDeepEqual(calls, ['/api/health', '/api/health', '/api/health'], 'only the health check is asked, never the generator');
});
