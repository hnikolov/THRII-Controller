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

// One pop-up source on a fake backend, with a host element and a recording importText.
function setup({ ampModel = null, storage = fakeStorage(), importResult = text => ({ ok: true, message: `Imported ${text}` }) } = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const backend = fakeBackend();
  const ctx = { host, backend, storage, imported: [], time: Date.UTC(2026, 10, 14, 20, 0), ids: 0 };
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
    text: selector => (find(selector) && !find(selector).hidden ? find(selector).textContent : null),
    credit: () => find('.ai-card > .ai-credit a'),
    entries: () => [...host.querySelectorAll('.ai-entry')],
    cleanup: () => host.remove(),
    // Opens the pop-up and waits for the amp list (or for the note that it could not be loaded).
    async open() {
      source({ host, importText, ampModel: () => ampModel });
      await until(() => !ctx.generateButton().disabled || /cannot be reached/.test(ctx.text('.ai-note') || ''), 'the amp list');
    },
    async press(guitar, prompt) {
      ctx.field('Guitar').value = guitar;
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

it('import AI: the pop-up lists the amps with a preset export and pre-selects the connected one, then the last pick, then the first', async () => {
  const lastPick = () => fakeStorage({ 'thrii.aiPresets': JSON.stringify({ amp: 'yamaha-thr-30-ii' }) });
  for (const [ampModel, storage, expected] of [[1, lastPick(), 'yamaha-thr-10-ii'], [null, lastPick(), 'yamaha-thr-30-ii'], [7, fakeStorage(), 'yamaha-thr-10-ii']]) {
    const ctx = setup({ ampModel, storage });
    try {
      await ctx.open();
      assertDeepEqual([...ctx.field('Amplifier').options].map(option => option.value), ['yamaha-thr-10-ii', 'yamaha-thr-30-ii'], 'amps offered');
      assertEqual(ctx.field('Amplifier').value, expected, `selected for model ${ampModel}`);
      assertEqual(ctx.text('.ai-result'), null, 'no result yet');
      assertEqual(ctx.text('.ai-earlier'), null, 'no earlier results yet');
      assertEqual(ctx.credit().href, 'https://amplifier-presets.com/', 'credit link');
      assertEqual(/No amp connected/.test(ctx.text('.ai-note') || ''), ampModel === null, 'the note about a missing amp');
    } finally {
      ctx.cleanup();
    }
  }
});

it('import AI: Generate asks for a software preset, exports it and hands the text to the import once; the pop-up stays until dismissed', async () => {
  const ctx = setup({ ampModel: 1 });
  try {
    await ctx.open();
    await ctx.press('Les Paul', 'Hotel California solo');
    const request = ctx.backend.calls[1];
    assertDeepEqual([request.url, request.method], ['/api/presets/generate', 'POST'], 'generate call');
    assertDeepEqual(request.body, {
      sessionId: 'id-1', presetType: 'SOFTWARE', prompt: 'Hotel California solo', guitar: 'Les Paul', amplifierId: 'yamaha-thr-10-ii'
    }, 'request body: always the "THR Remote app" preset type');

    // While the request is out: no second request, and the pop-up cannot be dismissed.
    ctx.find('.ai-request').requestSubmit();
    ctx.find('.ai-popup').click();
    ctx.find('.ai-close').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    assertEqual(ctx.backend.calls.length, 2, 'one generate request');
    assertTrue(ctx.find('.ai-popup') !== null, 'the pop-up stays while generating');
    assertTrue(/^Generating \d+ s$/.test(ctx.text('.ai-progress')), 'progress: ' + ctx.text('.ai-progress'));
    assertTrue(ctx.credit() !== null, 'credit while generating');

    ctx.backend.answer('abc', { presetName: 'Walsh <b>Hotel</b>', tip: 'Roll the tone back.' });
    await until(() => ctx.text('.ai-result'), 'the result');
    assertDeepEqual(ctx.backend.calls[2], { url: '/api/presets/abc/export', method: 'GET', body: null }, 'export call');
    assertDeepEqual(ctx.imported, ['file abc'], 'the exported text is imported once');
    assertEqual(ctx.text('.ai-name'), 'Walsh <b>Hotel</b>', 'the name is shown as text');
    assertEqual(ctx.find('.ai-name b'), null, 'markup in a name is not rendered');
    assertEqual(ctx.text('.ai-status'), 'Imported file abc', 'the import message');
    assertEqual(ctx.text('.ai-tip'), 'Roll the tone back.', 'tip');
    assertTrue(ctx.find('.ai-popup') !== null && ctx.credit() !== null, 'the pop-up stays open, with the credit');

    // A press on the card keeps it; a press outside hides it. Reopened, it is as it was left.
    ctx.find('.ai-card').click();
    assertTrue(ctx.find('.ai-popup') !== null, 'a press inside keeps the pop-up');
    ctx.find('.ai-popup').click();
    assertEqual(ctx.find('.ai-popup'), null, 'a press outside hides it');
    await ctx.open();
    assertDeepEqual([ctx.field('Guitar').value, ctx.field('Sound').value], ['Les Paul', 'Hotel California solo'], 'the request is kept');
    assertEqual(ctx.text('.ai-name'), 'Walsh <b>Hotel</b>', 'the result is kept');
    assertEqual(ctx.text('.ai-tip'), 'Roll the tone back.', 'the tip is kept');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    assertEqual(ctx.find('.ai-popup'), null, 'Escape hides it');
  } finally {
    ctx.cleanup();
  }
});

it('import AI: earlier results are kept, equal names stay apart, and a press loads that result without a request', async () => {
  const ctx = setup();
  try {
    await ctx.open();
    await ctx.generate('first try', 'p1', { presetName: 'Same Name', tip: 'tip 1' });
    ctx.time += 6 * 60 * 1000;
    await ctx.generate('second try, brighter', 'p2', { presetName: 'Same Name', tip: 'tip 2' });
    assertEqual(ctx.text('.ai-tip'), 'tip 2', 'the newest is the result');
    assertEqual(ctx.entries().length, 1, 'the other one is listed as earlier');

    for (let n = 3; n <= HISTORY_MAX + 1; n += 1) {
      ctx.time += 60 * 1000;
      await ctx.generate(`try ${n}`, `p${n}`, { presetName: `Preset ${n}`, tip: `tip ${n}` });
    }
    const lines = ctx.entries().map(entry => entry.textContent);
    assertEqual(lines.length, HISTORY_MAX - 1, 'the list holds the maximum, less the one shown as the result');
    assertTrue(!lines.some(line => line.includes('first try')), 'the oldest dropped out');

    // Reload: a new source on the same storage. The second "Same Name" is now the oldest entry.
    ctx.find('.ai-popup').click();
    const reloaded = setup({ storage: ctx.storage });
    try {
      await reloaded.open();
      const same = reloaded.entries().filter(entry => entry.querySelector('.ai-entry-name').textContent === 'Same Name');
      assertEqual(same.length, 1, 'kept over a reload');
      assertTrue(same[0].textContent.includes('second try, brighter'), 'the entry shows its sound text: ' + same[0].textContent);
      assertTrue(same[0].querySelector('.ai-entry-time').textContent.length > 0, 'and its time');

      const calls = reloaded.backend.calls.length;
      same[0].click();
      await until(() => reloaded.text('.ai-tip') === 'tip 2', 'the earlier result as the result');
      assertDeepEqual(reloaded.imported, ['file p2'], 'its own stored text is imported');
      assertEqual(reloaded.backend.calls.length, calls, 'no request to the backend');
      assertEqual(reloaded.field('Sound').value, 'second try, brighter', 'its sound text returns to the request');
      assertEqual(reloaded.entries().length, HISTORY_MAX - 1, 'the list keeps its length');
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
    twins.find(entry => entry.textContent.includes('take one')).click();
    await until(() => ctx.text('.ai-tip') === 'tip a', 'the first twin');
    ctx.entries().find(entry => entry.textContent.includes('take two')).click();
    await until(() => ctx.text('.ai-tip') === 'tip b', 'the second twin');
    assertDeepEqual(ctx.imported, ['file a', 'file b'], 'each loads its own text');
  } finally {
    ctx.cleanup();
  }
});

it('import AI: failures stay in the pop-up and nothing is imported', async () => {
  const ctx = setup({ ampModel: 1 });
  try {
    await ctx.open();

    await ctx.press('Strat', 'x');
    ctx.backend.fail(reply(422, { error: { issues: [{ path: ['amplifierId'], message: 'Invalid option' }] } }));
    await until(() => /Request rejected \(422\): amplifierId: Invalid option/.test(ctx.text('.ai-note') || ''), 'the validation message');

    await ctx.press('Strat', 'x');
    ctx.backend.fail();
    await until(() => ctx.text('.ai-note') === 'The preset generator cannot be reached.', 'the network failure');

    await ctx.press('Strat', 'x');
    ctx.find('.ai-request .ai-secondary').click();
    await until(() => ctx.text('.ai-note') === 'Cancelled.', 'the cancel');

    ctx.backend.exportContent = () => '';
    await ctx.generate('x', 'empty', { presetName: 'Empty' });
    assertEqual(ctx.text('.ai-note'), 'The preset export came back empty.', 'the empty export');

    ctx.field('Sound').value = ' ';
    ctx.generateButton().click();
    assertEqual(ctx.text('.ai-note'), 'Name the guitar and describe the sound first.', 'an empty request is not sent');

    assertDeepEqual(ctx.imported, [], 'nothing was imported');
    assertEqual(ctx.text('.ai-result'), null, 'no result');
    assertEqual(ctx.text('.ai-earlier'), null, 'nothing kept');
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
    assertEqual(refusing.text('.ai-note'), 'Import failed: unknown names', 'the refusal');
    assertEqual(refusing.text('.ai-result'), null, 'no result');
    assertEqual(refusing.text('.ai-earlier'), null, 'not kept');
  } finally {
    refusing.cleanup();
  }

  const offline = setup();
  offline.backend.amps = null;
  try {
    await offline.open();
    assertTrue(offline.generateButton().disabled, 'Generate is off');
    assertTrue(/cannot be reached.*scripts\/serve\.py/.test(offline.text('.ai-note')), 'the note says how to start the proxy');
    assertTrue(offline.credit() !== null, 'credit without the generator');
    offline.find('.ai-request').requestSubmit();
    assertEqual(offline.backend.calls.length, 1, 'no generate request');
  } finally {
    offline.cleanup();
  }
});
