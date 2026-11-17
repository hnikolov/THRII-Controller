import { it, assertEqual, assertDeepEqual, assertTrue } from '../support/assert.js';
import { until } from '../support/fakeAmp.js';
import { createApi } from '../../src/ai/api.js';
import { createAiPresetSource } from '../../src/ai/aiPresets.js';
import { HISTORY_MAX } from '../../src/ai/config.js';

const AMPS = [
  { id: 'yamaha-thr-10', name: 'Yamaha THR10', hasSoftwareExportHandler: false },
  { id: 'yamaha-thr-10-ii', name: 'Yamaha THR10II', hasSoftwareExportHandler: true },
  { id: 'yamaha-thr-30-ii', name: 'Yamaha THR30II', hasSoftwareExportHandler: true }
];
const reply = (status, body) => ({ ok: status < 400, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

// Stands in for the proxy. A generate request waits until the test answers it (answer, fail) or it is aborted;
// the export of a preset id is the text "file <id>" unless exportContent says otherwise.
function fakeBackend() {
  const backend = {
    calls: [],
    amps: reply(200, AMPS),
    pending: null,
    exportContent: id => `file ${id}`,
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
// connected amp's model code and can be changed between showings.
function setup({ ampModel = null, storage = fakeStorage(), importResult = text => ({ ok: true, message: `Imported ${text}` }) } = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const backend = fakeBackend();
  const ctx = { host, backend, storage, ampModel, imported: [], time: Date.UTC(2026, 10, 14, 20, 0), ids: 0 };
  const source = createAiPresetSource({
    api: createApi({ base: '/api', fetch: backend.fetch }),
    storage,
    now: () => ctx.time,
    uuid: () => `id-${ctx.ids += 1}`
  });
  const importText = async text => { ctx.imported.push(text); return importResult(text); };
  const find = selector => host.querySelector(selector);
  Object.assign(ctx, {
    find,
    field: label => find(`[aria-label="${label}"]`),
    generateButton: () => find('.ai-request button[type="submit"]'),
    text: selector => (find(selector) && find(selector).textContent) || null,
    count: selector => host.querySelectorAll(selector).length,
    credit: () => find('.ai-screen > .ai-credit a'),
    entries: () => [...host.querySelectorAll('.ai-entry')],
    selected: () => [...host.querySelectorAll('.ai-entry.is-selected')].map(row => row.querySelector('.ai-entry-name').textContent),
    load: row => row.querySelector('.ai-entry-load').click(),
    cleanup: () => host.remove(),
    // Shows the screen (the first time this builds it) and waits for the amp list, or for the note that it could not
    // be loaded.
    show: () => source({ host, importText, ampModel: () => ctx.ampModel }),
    async open() {
      ctx.show();
      await until(() => !ctx.generateButton().disabled || /cannot be reached/.test(ctx.text('.ai-status') || ''), 'the amp list');
    },
    async press(guitar, prompt, pickup = '') {
      ctx.field('Guitar').value = guitar;
      ctx.field('Pickups').value = pickup;
      ctx.field('Sound').value = prompt;
      ctx.generateButton().click();
      await until(() => backend.pending, 'the generate request');
    },
    // A whole generation: request, answer, export, import.
    async generate(prompt, id, preset) {
      await ctx.press('Strat', prompt);
      backend.answer(id, preset);
      await until(() => !ctx.generateButton().hidden && !ctx.generateButton().disabled, 'the end of the generation');
    }
  });
  return ctx;
}

it('import AI: the screen lists the amps with a preset export and pre-selects the connected one, then the last pick, then the first', async () => {
  const lastPick = () => fakeStorage({ 'thrii.aiPresets': JSON.stringify({ amp: 'yamaha-thr-30-ii' }) });
  for (const [ampModel, storage, expected] of [[1, lastPick(), 'yamaha-thr-10-ii'], [null, lastPick(), 'yamaha-thr-30-ii'], [7, fakeStorage(), 'yamaha-thr-10-ii']]) {
    const ctx = setup({ ampModel, storage });
    try {
      await ctx.open();
      assertDeepEqual([...ctx.field('Amplifier').options].map(option => option.value), ['yamaha-thr-10-ii', 'yamaha-thr-30-ii'], 'amps offered');
      assertEqual(ctx.field('Amplifier').value, expected, `selected for model ${ampModel}`);
      assertEqual(ctx.text('.ai-tip'), null, 'no result yet');
      assertDeepEqual([ctx.entries().length, ctx.count('.ai-hint')], [0, 2], 'no generated presets yet, a hint in their place');
      assertEqual(ctx.credit().href, 'https://amplifier-presets.com/', 'credit link');
      assertEqual(ctx.text('.ai-people'), 'Magnus Bredeli developmentFerdinand Hegelstad design', 'the people credited');
      assertEqual(/No amp connected/.test(ctx.text('.ai-status') || ''), ampModel === null, 'the note about a missing amp');
    } finally {
      ctx.cleanup();
    }
  }
});

it('import AI: Generate asks for a software preset, exports it and hands the text to the import once; the screen is built once and kept', async () => {
  const ctx = setup({ ampModel: 1 });
  try {
    await ctx.open();
    await ctx.press('Les Paul', 'Hotel California solo', ' humbucker ');
    const request = ctx.backend.calls[1];
    assertDeepEqual([request.url, request.method], ['/api/presets/generate', 'POST'], 'generate call');
    assertDeepEqual(request.body, {
      sessionId: 'id-1', presetType: 'SOFTWARE', prompt: 'Hotel California solo', guitar: 'Les Paul', pickupConfiguration: 'humbucker', amplifierId: 'yamaha-thr-10-ii'
    }, 'request body: always the "THR Remote app" preset type, with the pickups');

    // While the request is out: no second request, the form takes no input, and the line shows the elapsed time.
    ctx.find('.ai-request').requestSubmit();
    assertEqual(ctx.backend.calls.length, 2, 'one generate request');
    assertDeepEqual(['Sound', 'Guitar', 'Pickups', 'Amplifier'].map(label => ctx.field(label).disabled), [true, true, true, true], 'the form is off');
    assertTrue(/^Generating \d+ s$/.test(ctx.text('.ai-status')), 'progress: ' + ctx.text('.ai-status'));
    assertTrue(ctx.credit() !== null, 'credit while generating');

    // The shell hides the screen and shows it again while the request is out: the request goes on.
    ctx.show();
    assertEqual(ctx.backend.calls.length, 2, 'a showing sends nothing');

    ctx.backend.answer('abc', { presetName: 'Walsh <b>Hotel</b>', tip: 'Roll the tone back.' });
    await until(() => ctx.text('.ai-tip'), 'the result');
    assertDeepEqual(ctx.backend.calls[2], { url: '/api/presets/abc/export', method: 'GET', body: null }, 'export call');
    assertDeepEqual(ctx.imported, ['file abc'], 'the exported text is imported once');
    assertDeepEqual(ctx.selected(), ['Walsh <b>Hotel</b>'], 'the new preset is the selected row, its name shown as text');
    assertEqual(ctx.find('.ai-entry-name b'), null, 'markup in a name is not rendered');
    assertEqual(ctx.text('.ai-status'), 'Imported file abc', 'the import message');
    assertEqual(ctx.find('.ai-status').classList.contains('is-error'), false, 'not shown as an error');
    assertEqual(ctx.find('.ai-entry.is-selected').nextElementSibling.textContent, 'Roll the tone back.', 'the tip follows its row');
    assertEqual(ctx.field('Sound').disabled, false, 'the form takes input again');

    // Shown again, the screen is the one that was built, as it was left.
    const screen = ctx.find('.ai-screen');
    ctx.field('Pickups').value = 'typed over';
    await ctx.open();
    assertTrue(ctx.find('.ai-screen') === screen && ctx.count('.ai-screen') === 1, 'the screen is built once');
    assertEqual(ctx.backend.calls.length, 3, 'the amp list is not asked for again');
    assertDeepEqual([ctx.field('Guitar').value, ctx.field('Sound').value], ['Les Paul', 'Hotel California solo'], 'the request is kept');
    assertEqual(ctx.text('.ai-tip'), 'Roll the tone back.', 'the tip is kept');

    // Loading the preset again brings its own request back, pickups included.
    ctx.load(ctx.entries()[0]);
    await until(() => ctx.field('Pickups').value === 'humbucker', 'the pickups of the loaded preset');
    assertEqual(ctx.imported.length, 2, 'it was imported again');
  } finally {
    ctx.cleanup();
  }
});

it('import AI: a later showing tries an unreachable generator again and follows a newly connected amp', async () => {
  const ctx = setup({ storage: fakeStorage({ 'thrii.aiPresets': JSON.stringify({ amp: 'yamaha-thr-30-ii' }) }) });
  ctx.backend.amps = null;
  try {
    await ctx.open();
    assertTrue(ctx.generateButton().disabled && ctx.find('.ai-status').classList.contains('is-error'), 'not reachable: Generate is off');

    ctx.backend.amps = reply(200, AMPS);
    ctx.show();
    await until(() => !ctx.generateButton().disabled, 'Generate to come on once the generator is reachable');
    assertEqual(ctx.field('Amplifier').value, 'yamaha-thr-30-ii', 'no amp connected: the last pick');
    assertTrue(/No amp connected/.test(ctx.text('.ai-status')), 'the unreachable note is gone: ' + ctx.text('.ai-status'));

    ctx.ampModel = 1;
    await ctx.open();
    assertEqual(ctx.field('Amplifier').value, 'yamaha-thr-10-ii', 'the amp that was connected since');
    assertEqual(ctx.text('.ai-status'), null, 'nothing to say with an amp');
    assertEqual(ctx.backend.calls.length, 2, 'the list was asked for twice, not a third time');
  } finally {
    ctx.cleanup();
  }
});

it('import AI: every generated preset is listed with the selected one marked; a press loads a preset without a request', async () => {
  const ctx = setup();
  try {
    await ctx.open();
    await ctx.generate('first try', 'p1', { presetName: 'Same Name', tip: 'tip 1' });
    assertEqual('pickupConfiguration' in ctx.backend.calls[1].body, false, 'no pickups typed: the request has no such key');
    ctx.time += 6 * 60 * 1000;
    await ctx.generate('second try, brighter', 'p2', { presetName: 'Same Name', tip: 'tip 2' });
    assertEqual(ctx.text('.ai-tip'), 'tip 2', 'the tip is the newest preset\'s');
    assertEqual(ctx.entries().length, 2, 'both are listed');
    assertTrue(ctx.entries()[0].classList.contains('is-selected') && !ctx.entries()[1].classList.contains('is-selected'), 'only the newest is marked');

    for (let n = 3; n <= HISTORY_MAX + 1; n += 1) {
      ctx.time += 60 * 1000;
      await ctx.generate(`try ${n}`, `p${n}`, { presetName: `Preset ${n}`, tip: `tip ${n}` });
    }
    const lines = ctx.entries().map(entry => entry.textContent);
    assertEqual(lines.length, HISTORY_MAX, 'the list holds the maximum');
    assertTrue(!lines.some(line => line.includes('first try')), 'the oldest dropped out');

    // Reload: a new source on the same storage. The second "Same Name" is now the oldest entry.
    const reloaded = setup({ storage: ctx.storage });
    try {
      await reloaded.open();
      const same = reloaded.entries().filter(entry => entry.querySelector('.ai-entry-name').textContent === 'Same Name');
      assertEqual(same.length, 1, 'kept over a reload');
      assertTrue(same[0].textContent.includes('second try, brighter'), 'the entry shows its sound text: ' + same[0].textContent);
      assertTrue(same[0].querySelector('.ai-entry-time').textContent.length > 0, 'and its time');

      const calls = reloaded.backend.calls.length;
      reloaded.load(same[0]);
      await until(() => reloaded.text('.ai-tip') === 'tip 2', 'the tip of the picked preset');
      assertDeepEqual(reloaded.selected(), ['Same Name'], 'the picked preset is the marked one');
      assertDeepEqual(reloaded.imported, ['file p2'], 'its own stored text is imported');
      assertEqual(reloaded.backend.calls.length, calls, 'no request to the backend');
      assertEqual(reloaded.field('Sound').value, 'second try, brighter', 'its sound text returns to the request');
      assertEqual(reloaded.entries().length, HISTORY_MAX, 'the list keeps its length and order');
    } finally {
      reloaded.cleanup();
    }
  } finally {
    ctx.cleanup();
  }
});

it('import AI: two results with the same name are two entries, each loading its own text', async () => {
  const ctx = setup();
  try {
    await ctx.open();
    await ctx.generate('take one', 'a', { presetName: 'Twin', tip: 'tip a' });
    ctx.time += 60 * 1000;
    await ctx.generate('take two', 'b', { presetName: 'Twin', tip: 'tip b' });
    ctx.time += 60 * 1000;
    await ctx.generate('other', 'c', { presetName: 'Other', tip: 'tip c' });
    const twins = ctx.entries().filter(entry => entry.querySelector('.ai-entry-name').textContent === 'Twin');
    assertEqual(twins.length, 2, 'both are listed');
    assertTrue(twins[0].textContent !== twins[1].textContent, 'and they read differently');

    ctx.imported.length = 0;
    ctx.load(twins.find(entry => entry.textContent.includes('take one')));
    await until(() => ctx.text('.ai-tip') === 'tip a', 'the first twin');
    assertTrue(ctx.find('.ai-entry.is-selected').textContent.includes('take one'), 'the first twin is marked, not the second');
    ctx.load(ctx.entries().find(entry => entry.textContent.includes('take two')));
    await until(() => ctx.text('.ai-tip') === 'tip b', 'the second twin');
    assertDeepEqual(ctx.imported, ['file a', 'file b'], 'each loads its own text');
  } finally {
    ctx.cleanup();
  }
});

it('import AI: a preset can be deleted from the list; the app is not touched, and the tip goes with its preset', async () => {
  const ctx = setup();
  try {
    await ctx.open();
    await ctx.generate('way off', 'a', { presetName: 'Off', tip: 'tip a' });
    await ctx.generate('better', 'b', { presetName: 'Better', tip: 'tip b' });
    const calls = ctx.backend.calls.length;
    ctx.imported.length = 0;

    ctx.find('[aria-label="Delete Off"]').click();
    assertDeepEqual(ctx.entries().map(row => row.querySelector('.ai-entry-name').textContent), ['Better'], 'the deleted preset is gone');
    assertDeepEqual(ctx.selected(), ['Better'], 'the selected preset stays');
    assertEqual(ctx.text('.ai-tip'), 'tip b', 'with its tip');

    ctx.find('[aria-label="Delete Better"]').click();
    assertEqual(ctx.entries().length, 0, 'the list is empty');
    assertEqual(ctx.text('.ai-tip'), null, 'the tip of a deleted preset is not shown');
    assertDeepEqual([ctx.imported.length, ctx.backend.calls.length], [0, calls], 'nothing imported, nothing requested');
    assertDeepEqual(JSON.parse(ctx.storage.items['thrii.aiPresets']).history, [], 'the deletion is stored');
    assertTrue(ctx.credit() !== null, 'credit still there');
  } finally {
    ctx.cleanup();
  }
});

it('import AI: failures stay on the screen and nothing is imported', async () => {
  const ctx = setup({ ampModel: 1 });
  try {
    await ctx.open();

    await ctx.press('Strat', 'x');
    ctx.backend.fail(reply(422, { error: { issues: [{ path: ['amplifierId'], message: 'Invalid option' }] } }));
    await until(() => /Request rejected \(422\): amplifierId: Invalid option/.test(ctx.text('.ai-status') || ''), 'the validation message');

    await ctx.press('Strat', 'x');
    ctx.backend.fail();
    await until(() => ctx.text('.ai-status') === 'The preset generator cannot be reached.', 'the network failure');

    await ctx.press('Strat', 'x');
    ctx.find('.ai-request .ai-secondary').click();
    await until(() => ctx.text('.ai-status') === 'Cancelled.', 'the cancel');

    ctx.backend.exportContent = () => '';
    await ctx.generate('x', 'empty', { presetName: 'Empty' });
    assertEqual(ctx.text('.ai-status'), 'The preset export came back empty.', 'the empty export');

    ctx.field('Sound').value = ' ';
    ctx.generateButton().click();
    assertEqual(ctx.text('.ai-status'), 'Name the guitar and describe the sound first.', 'an empty request is not sent');

    assertDeepEqual(ctx.imported, [], 'nothing was imported');
    assertEqual(ctx.text('.ai-tip'), null, 'no result');
    assertEqual(ctx.entries().length, 0, 'nothing kept');
    assertTrue(ctx.credit() !== null, 'credit with an error');
  } finally {
    ctx.cleanup();
  }
});

it('import AI: a preset the app refuses is reported and not kept; an unreachable generator switches Generate off', async () => {
  const refusing = setup({ importResult: () => ({ ok: false, message: 'Import failed: unknown names' }) });
  try {
    await refusing.open();
    await refusing.generate('x', 'bad', { presetName: 'Bad' });
    assertDeepEqual(refusing.imported, ['file bad'], 'the import was tried once');
    assertEqual(refusing.text('.ai-status'), 'Import failed: unknown names', 'the refusal');
    assertEqual(refusing.text('.ai-tip'), null, 'no result');
    assertEqual(refusing.entries().length, 0, 'not kept');
  } finally {
    refusing.cleanup();
  }

  const offline = setup();
  offline.backend.amps = null;
  try {
    await offline.open();
    assertTrue(offline.generateButton().disabled, 'Generate is off');
    assertTrue(/cannot be reached.*scripts\/serve\.py/.test(offline.text('.ai-status')), 'the note says how to start the proxy');
    assertTrue(offline.credit() !== null, 'credit without the generator');
    offline.find('.ai-request').requestSubmit();
    assertEqual(offline.backend.calls.length, 1, 'no generate request');
  } finally {
    offline.cleanup();
  }
});
