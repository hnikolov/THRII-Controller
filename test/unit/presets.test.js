import { it, assertEqual, assertDeepEqual, assertTrue } from '../support/assert.js';
import { bootApp, until } from '../support/fakeAmp.js';

const SAMPLES = ['01. EarlyVH', 'Clean Megadeth', 'Crunch Ico LP', 'Ico Solo 1', 'Master of Puppets Rhythm', 'One 1 wip',
  'Samba_Pa_Ti_Bloom', 'Samba_Sustain', 'neo-classical-fury', 'walsh-hotel-solo'];
const sample = async name => ({ name: `${name}.thrl6p`, text: await (await fetch('/doc/' + encodeURIComponent(name) + '.thrl6p')).text() });

// The list as lines: '> ' marks the loaded row, the name as shown (with ' *' when edited), its amp model, and '↻'
// when the row offers an update.
const rows = app => [...app.container.querySelectorAll('.pr-entry')].map(row => [
  row.classList.contains('is-selected') ? '> ' : '',
  row.querySelector('.pr-name, .pr-name-input').textContent || row.querySelector('.pr-name-input').value,
  ` (${row.querySelector('.pr-amp').textContent})`,
  row.querySelector('[aria-label^="Update"]') ? ' ↻' : ''
].join(''));
const statusHas = (app, text) => until(() => app.status().includes(text), `status "${text}" (got "${app.status()}")`);
const knobUp = app => app.knob('MASTER').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

it('presets screen: one imported file is loaded and listed, several are listed only; nothing is listed twice, and refused files are named', async () => {
  const app = await bootApp();
  try {
    app.files.next = await sample('01. EarlyVH');
    app.presets('Import');
    await statusHas(app, 'Imported EarlyVH (amp not connected)');
    await until(() => rows(app).length === 1, 'the listed file');
    assertDeepEqual(rows(app), ['> EarlyVH (Brown 1)'], 'loaded and listed, with its amp model');
    assertEqual(app.container.querySelector('.pr-search').hidden, true, 'no search for a short list');

    const bad = { name: 'bad.thrl6p', text: '{"not": "a preset"}' };
    app.files.next = [await sample('walsh-hotel-solo'), await sample('neo-classical-fury'), await sample('01. EarlyVH'), bad];
    app.presets('Import');
    await statusHas(app, 'Added 2 presets; not loadable: bad.thrl6p');
    assertDeepEqual(rows(app), ['Neo-Classical Fury (Brit)', 'Walsh Hotel Solo (Lead)', '> EarlyVH (Brown 1)'],
      'the new ones on top, EarlyVH not twice, nothing loaded');
    assertEqual(app.nameBox().value, 'EarlyVH', 'what plays is unchanged');

    // A tap on a row loads it.
    app.container.querySelector('.pr-entry .pr-name').click();
    await until(() => app.nameBox().value === 'Neo-Classical Fury', 'the tapped preset');
    assertDeepEqual(rows(app)[0], '> Neo-Classical Fury (Brit)', 'the loaded row');
  } finally {
    app.cleanup();
  }
});

it('presets screen: an edit marks the loaded row with * and ↻, which stores it; + Add and Export keep what plays now; a load from elsewhere ends the mark', async () => {
  const app = await bootApp();
  try {
    app.files.next = await sample('01. EarlyVH');
    app.presets('Import');
    await until(() => rows(app).length === 1, 'the listed file');

    knobUp(app);
    await until(() => rows(app)[0] === '> EarlyVH * (Brown 1) ↻', 'the edited row (got ' + rows(app)[0] + ')');
    app.container.querySelector('[aria-label="Update EarlyVH"]').click();
    await statusHas(app, 'Updated EarlyVH');
    assertDeepEqual(rows(app), ['> EarlyVH (Brown 1)'], 'stored: no * and no ↻');
    const stored = JSON.parse(JSON.parse(localStorage.getItem('thrii.presets')).entries[0].text);
    assertEqual(stored.data.tone.THRGroupAmp.Master, 0.7, 'the edit is in the entry');

    app.presets('Add');
    await statusHas(app, 'Already in the list');
    knobUp(app);
    await until(() => rows(app)[0].endsWith('↻'), 'edited again');
    app.presets('Add');
    await statusHas(app, 'Added EarlyVH');
    assertDeepEqual(rows(app), ['> EarlyVH (Brown 1)', 'EarlyVH (Brown 1)'], 'a new entry, loaded; the old row has no * any more');

    app.presets('Export');
    await statusHas(app, 'Exported EarlyVH');
    assertEqual(rows(app).length, 2, 'exporting the loaded, unchanged entry adds nothing');

    // A preset loaded elsewhere (the AI screen uses this import) is not a list entry; + Add keeps it.
    await app.app.importText((await sample('walsh-hotel-solo')).text);
    await until(() => !rows(app).some(line => line.startsWith('> ')), 'no loaded row');
    knobUp(app);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertTrue(!rows(app).some(line => line.endsWith('↻')), 'no ↻ for settings from elsewhere');
    app.presets('Add');
    await statusHas(app, 'Added Walsh Hotel Solo');
    assertEqual(rows(app)[0], '> Walsh Hotel Solo (Lead)', 'listed and loaded');

    // The header name is part of the preset.
    app.nameBox().value = 'Walsh Renamed';
    app.nameBox().dispatchEvent(new Event('input', { bubbles: true }));
    await until(() => rows(app)[0] === '> Walsh Hotel Solo * (Lead) ↻', 'a header rename is an edit');
  } finally {
    app.cleanup();
  }
});

it('presets screen: rename (the loaded one also in the header), remove after a yes, search from 8 entries, and the list survives a reload', async () => {
  const app = await bootApp();
  let reloaded = null;
  try {
    app.files.next = await Promise.all(SAMPLES.map(sample));
    app.presets('Import');
    await statusHas(app, 'Added 10 presets');
    assertEqual(app.container.querySelector('.pr-search').hidden, false, 'search shown');

    const search = app.container.querySelector('[aria-label="Search presets"]');
    search.value = 'ico';
    search.dispatchEvent(new Event('input'));
    assertDeepEqual(rows(app).map(line => line.split(' (')[0]), ['Ico Solo 1', 'Crunch Ico LP'], 'filtered by name');
    assertEqual(app.container.querySelector('.pr-count').textContent, '2 / 10', 'the count');

    // The search also matches the amp model; a tap on a row's amp model shows only that model, until the chip clears it.
    const names = () => rows(app).map(line => line.split(' (')[0]);
    search.value = 'lead';
    search.dispatchEvent(new Event('input'));
    assertDeepEqual(names(), ['Walsh Hotel Solo', 'Samba Sustain', 'Samba Pa Ti Bloom'], 'matched by amp model');
    search.value = '';
    search.dispatchEvent(new Event('input'));
    const chip = app.container.querySelector('[aria-label="Clear amp filter"]');
    assertEqual(chip.hidden, true, 'no amp filter yet');
    app.container.querySelector('[aria-label="Show only Deluxe"]').click();
    assertDeepEqual([names(), chip.hidden, chip.textContent, app.container.querySelector('.pr-count').textContent],
      [['One 1 wip', 'Clean Megadeth'], false, 'Deluxe ×', '2 / 10'], 'only the Deluxe presets, and the chip');
    chip.click();
    assertDeepEqual([names().length, chip.hidden], [10, true], 'cleared');
    search.value = 'ico';
    search.dispatchEvent(new Event('input'));

    // The loaded entry's rename goes to the header too, and is no edit.
    [...app.container.querySelectorAll('.pr-name')].find(button => button.textContent === 'Crunch Ico LP').click();
    await until(() => app.nameBox().value === 'Crunch Ico LP', 'loaded');
    app.container.querySelector('[aria-label="Rename Crunch Ico LP"]').click();
    const input = app.container.querySelector('[aria-label="Preset name"]');
    assertDeepEqual([document.activeElement === input, input.maxLength], [true, 20], 'the field, at most 20 characters');
    input.value = 'Ico Crunch';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await until(() => app.nameBox().value === 'Ico Crunch', 'the header follows');
    await new Promise(resolve => setTimeout(resolve, 20));
    assertDeepEqual(rows(app), ['Ico Solo 1 (Stealth)', '> Ico Crunch (DC30)'], 'renamed, no *');

    search.value = '';
    search.dispatchEvent(new Event('input'));
    app.container.querySelector('[aria-label="Remove Ico Solo 1"]').click();
    assertEqual(app.confirms[app.confirms.length - 1], 'Remove Ico Solo 1 from the list?', 'asked first');
    assertEqual(rows(app).length, 9, 'removed');

    reloaded = await bootApp();
    reloaded.page('☰');
    assertEqual(rows(reloaded).length, 9, 'the list after a reload');
    assertTrue(rows(reloaded).includes('Ico Crunch (DC30)'), 'with the new name, and nothing loaded in a new session');
  } finally {
    if (reloaded) reloaded.cleanup();
    app.cleanup();
  }
});

it('presets screen with an amp: a memory recall ends the loaded mark; Save, Backup and Restore are on', async () => {
  const app = await bootApp({ connect: true, takesUploads: true });
  try {
    app.files.next = await sample('01. EarlyVH');
    app.presets('Import');
    await statusHas(app, 'Imported EarlyVH');
    await until(() => rows(app).length === 1, 'listed');
    assertTrue(rows(app)[0].startsWith('> EarlyVH'), 'loaded');
    const action = name => [...app.container.querySelectorAll('.pr-screen button')].find(button => (button.getAttribute('aria-label') || button.textContent) === name);
    assertDeepEqual(['Save to amp memory', 'Backup', 'Restore'].map(name => action(name).disabled), [false, false, false], 'the amp actions are on');

    app.container.querySelectorAll('.footer-memory-button')[1].click();
    await until(() => !rows(app)[0].startsWith('> '), 'the recall ends the loaded mark');
    assertTrue(!rows(app)[0].endsWith('↻'), 'and offers no ↻');
  } finally {
    app.cleanup();
  }
});
