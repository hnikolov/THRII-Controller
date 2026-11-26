import { it, assertEqual, assertDeepEqual, assertTrue } from '../support/assert.js';
import { bootApp, until } from '../support/fakeAmp.js';
import { flags } from '../../src/core/flags.js';

const sample = async name => ({ name: `${name}.thrl6p`, text: await (await fetch('/test/fixtures/presets/' + encodeURIComponent(name) + '.thrl6p')).text() });
const statusHas = (app, text) => until(() => app.status().includes(text), `status "${text}" (got "${app.status()}")`);

// Boots with the sets mode on (flags.memorySets) and the presets listed.
async function bootWithSets(options, names) {
  const before = flags.memorySets;
  flags.memorySets = true;
  let app;
  try {
    app = await bootApp(options);
  } finally {
    flags.memorySets = before;
  }
  app.files.next = await Promise.all(names.map(sample));
  app.presets('Import');
  await statusHas(app, `Added ${names.length} presets`);
  return app;
}

const find = (app, name) => [...app.container.querySelectorAll('.pr-screen button')]
  .find(button => (button.getAttribute('aria-label') || button.textContent) === name);
// The sets as lines: '> ' for the open one, its name and count; under the open one its memories.
const setLines = app => [...app.container.querySelectorAll('.pr-set, .pr-memory')].map(row => (row.classList.contains('pr-set')
  ? `${row.classList.contains('is-selected') ? '> ' : ''}${row.querySelector('.pr-name').textContent} ${row.querySelector('.pr-count').textContent}`
  : `  ${row.querySelector('.pr-memory-number').textContent} ${row.querySelector('.pr-name').textContent}`));
const rename = (app, name) => {
  const input = app.container.querySelector('.pr-name-input');
  input.value = name;
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
};
const pick = (app, slot, name) => {
  app.container.querySelectorAll('.pr-memory .pr-name')[slot - 1].click();
  [...app.container.querySelectorAll('.pr-entry .pr-name')].find(button => button.textContent === name).click();
};

it('memory sets: off by default, the bottom row is as before', async () => {
  const app = await bootApp();
  try {
    app.page('☰');
    assertEqual(app.container.querySelector('.pr-mode'), null, 'no mode switch');
    assertEqual(app.container.querySelector('.pr-memories .pr-label').textContent, 'Amp memories', 'the label');
  } finally {
    app.cleanup();
  }
});

it('memory sets: a new set is named, its memories picked from the presets list and cleared; it survives a reload', async () => {
  const app = await bootWithSets({}, ['01. EarlyVH', 'walsh-hotel-solo']);
  let reloaded = null;
  try {
    app.presets('Banks');
    assertEqual(find(app, 'Banks').getAttribute('aria-pressed'), 'true', 'Banks shown');
    assertDeepEqual([app.container.querySelectorAll('.pr-actions')[0].hidden, find(app, 'New bank').closest('.pr-actions').hidden],
      [true, false], 'the sets action row in place of the presets one');
    assertEqual(find(app, 'Save bank to amp').disabled, true, 'To amp is off without a set and an amp');

    app.presets('New bank');
    assertEqual(app.container.querySelector('.pr-name-input').value, 'Bank 1', 'named, and the name field open');
    rename(app, 'Gig');
    assertDeepEqual(setLines(app), ['> ▾ Gig 0/5', '  1 · empty ·', '  2 · empty ·', '  3 · empty ·', '  4 · empty ·', '  5 · empty ·'], 'open and empty');

    const playing = app.nameBox().value;
    find(app, 'Memory 3: empty').click();
    assertEqual(app.container.querySelector('.pr-pick .pr-label').textContent, 'Memory 3 · Gig', 'the pick bar');
    assertDeepEqual([...app.container.querySelectorAll('.pr-entry')].map(row => row.querySelectorAll('button').length), [2, 2], 'pick rows: name and amp only');
    [...app.container.querySelectorAll('.pr-entry .pr-name')].find(button => button.textContent === 'EarlyVH').click();
    pick(app, 1, 'Walsh Hotel Solo');
    assertDeepEqual(setLines(app).slice(0, 4), ['> ▾ Gig 2/5', '  1 Walsh Hotel Solo', '  2 · empty ·', '  3 EarlyVH'], 'assigned');
    assertEqual(app.nameBox().value, playing, 'a pick loads nothing');

    find(app, 'Clear memory 1').click();
    assertEqual(setLines(app)[0], '> ▾ Gig 1/5', 'cleared');

    reloaded = await bootApp();
    reloaded.page('☰');
    assertEqual(reloaded.container.querySelector('.pr-mode'), null, 'sets stay hidden with the flag off');
    const stored = JSON.parse(localStorage.getItem('thrii.memorySets'));
    assertDeepEqual(stored.sets.map(set => [set.name, set.slots.filter(Boolean).length]), [['Gig', 1]], 'stored');
  } finally {
    if (reloaded) reloaded.cleanup();
    app.cleanup();
  }
});

it('memory sets: a removed preset empties its memories; export and import bring a set back without listing a preset twice', async () => {
  const app = await bootWithSets({}, ['01. EarlyVH', 'walsh-hotel-solo']);
  try {
    app.presets('Banks');
    app.presets('New bank');
    rename(app, 'Gig');
    pick(app, 2, 'EarlyVH');
    pick(app, 5, 'Walsh Hotel Solo');

    app.presets('Export bank');
    await statusHas(app, 'Exported Gig');
    const file = app.files.saved[app.files.saved.length - 1];
    assertEqual(file.name, 'THR bank Gig.json', 'the file name');
    assertDeepEqual(JSON.parse(file.text).slots.map(entry => !!entry.preset), [false, true, false, false, true], 'the presets in it');

    app.presets('Presets');
    find(app, 'Remove EarlyVH').click();
    assertEqual(app.confirms[app.confirms.length - 1], 'Remove EarlyVH from the list? It is in 1 bank; those memories become empty.', 'asked');
    app.presets('Banks');
    assertDeepEqual(setLines(app).slice(0, 3), ['> ▾ Gig 1/5', '  1 · empty ·', '  2 · empty ·'], 'memory 2 is empty');

    app.files.next = [{ name: 'THR bank Gig.json', text: file.text }, { name: 'bad.json', text: '{"format":"other"}' }];
    app.presets('Import banks');
    await statusHas(app, 'Added 1 bank; not loadable: bad.json');
    assertDeepEqual(setLines(app).slice(0, 6), ['> ▾ Gig 2/5', '  1 · empty ·', '  2 EarlyVH', '  3 · empty ·', '  4 · empty ·', '  5 Walsh Hotel Solo'], 'imported and open');
    const entries = JSON.parse(localStorage.getItem('thrii.presets')).entries.map(entry => entry.name);
    assertDeepEqual(entries.sort(), ['EarlyVH', 'Walsh Hotel Solo'], 'EarlyVH listed again, Walsh not twice');

    find(app, 'Remove bank Gig').click();
    assertEqual(setLines(app).length, 1, 'one set left');
  } finally {
    app.cleanup();
  }
});

it('memory sets: To amp backs up the five memories, uploads each preset of the set, recalls and checks it; empty memories are left', async () => {
  const app = await bootWithSets({ connect: true, takesUploads: true }, ['01. EarlyVH', 'walsh-hotel-solo']);
  try {
    app.presets('Banks');
    app.presets('New bank');
    rename(app, 'Gig');
    pick(app, 1, 'EarlyVH');
    pick(app, 3, 'Walsh Hotel Solo');
    app.labels.length = 0;

    app.presets('Save bank to amp');
    await statusHas(app, 'Gig is on the amp');
    assertEqual(app.confirms[app.confirms.length - 1],
      'Overwrite memories 1, 3 on the amp with Gig? Memories 2, 4, 5 (empty) are left as they are.', 'asked');
    assertTrue(app.files.saved.some(file => file.name.endsWith('before Gig.json')), 'a backup first');
    const steps = app.labels.map(label => label.replace(/ \d+\/\d+$/, '')).filter((label, index, all) => label !== all[index - 1]);
    assertDeepEqual(steps, [
      'TX read memory 1', 'TX read memory 2', 'TX read memory 3', 'TX read memory 4', 'TX read memory 5',
      'TX sync: actual dump',
      'TX save memory 1', 'TX memory slot 1', 'TX sync: actual dump',
      'TX save memory 3', 'TX memory slot 3', 'TX sync: actual dump'
    ], 'frame order');
    assertEqual(app.nameBox().value, 'Walsh Hotel Solo', 'the last memory written plays');
  } finally {
    app.cleanup();
  }
});
