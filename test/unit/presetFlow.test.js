import { it, assertEqual, assertDeepEqual, assertTrue } from '../support/assert.js';
import { bootApp, until } from '../support/fakeAmp.js';
import { flags } from '../../src/core/flags.js';

const sampleText = async () => (await fetch('/doc/' + encodeURIComponent('01. EarlyVH.thrl6p'))).text();
const statusHas = (app, text) => until(() => app.status().includes(text), `status "${text}" (got "${app.status()}")`);

it('presets without an amp: import shows the preset, an edit changes it, export writes the edited preset', async () => {
  const app = await bootApp();
  try {
    app.files.next = { name: 'EarlyVH.thrl6p', text: await sampleText() };
    app.menu('Import');
    await statusHas(app, 'Imported EarlyVH (amp not connected)');
    await until(() => app.knob('MASTER').getAttribute('aria-valuenow') === '69', 'the imported MASTER');
    assertEqual(app.nameBox().value, 'EarlyVH', 'name in the label');

    app.knob('MASTER').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await until(() => app.knob('MASTER').getAttribute('aria-valuenow') === '70', 'the edited MASTER');
    assertEqual(app.status().includes('failed'), false, 'an offline edit reports no write failure');

    app.menu('Export');
    await statusHas(app, 'Exported EarlyVH');
    assertEqual(app.files.saved.length, 1, 'one file');
    assertEqual(app.files.saved[0].name, 'EarlyVH.thrl6p', 'file name');
    const exported = JSON.parse(app.files.saved[0].text);
    const sample = JSON.parse(await sampleText());
    assertEqual(exported.data.tone.THRGroupAmp.Master, 0.7, 'the edit is in the file');
    sample.data.tone.THRGroupAmp.Master = 0.7;
    assertDeepEqual(exported.data.tone.THRGroupFX4EffectReverb, sample.data.tone.THRGroupFX4EffectReverb, 'the rest is the import');
    assertDeepEqual(exported.data.tone.THRGroupAmp, sample.data.tone.THRGroupAmp, 'amp group');
  } finally {
    app.cleanup();
  }
});

it('presets without an amp: a preset with an unknown name is refused and nothing changes; amp actions ask for the amp', async () => {
  const app = await bootApp();
  try {
    const json = JSON.parse(await sampleText());
    json.data.tone.THRGroupFX2Effect['@asset'] = 'TapeEcho';
    app.files.next = { name: 'bad.thrl6p', text: JSON.stringify(json) };
    app.menu('Import');
    await statusHas(app, 'Import failed');
    assertTrue(app.status().includes('TapeEcho'), 'the status names the problem');
    assertEqual(app.knob('MASTER').getAttribute('aria-valuenow'), null, 'store still empty');

    app.menu('Export');
    await statusHas(app, 'Export failed: There are no settings to export yet.');
    app.menu('Backup THR');
    await statusHas(app, 'Backup failed: connect the amp first');
    app.menu('Save to THR slot 1');
    await statusHas(app, 'Save failed: connect the amp first');
    assertEqual(app.confirms.length, 0, 'no question before the amp is connected');
  } finally {
    app.cleanup();
  }
});

it('quick import: the preset goes to the amp as one upload, and the read-back matches', async () => {
  const app = await bootApp({ connect: true, takesUploads: true });
  try {
    app.files.next = { name: 'EarlyVH.thrl6p', text: await sampleText() };
    app.menu('Import');
    await until(() => app.status() === 'Imported EarlyVH', 'the import without differences (got "' + app.status() + '")');
    assertDeepEqual(app.labels, [
      'TX sync: actual dump', ...[1, 2, 3, 4].map(n => `TX import upload ${n}/4`), 'TX sync: actual dump'
    ], 'one read, one upload, one read-back; no value writes');
    const header = app.amp.sent[app.amp.sent.length - 6];
    assertTrue(header.includes('7f 7f 7f 7f'), 'the upload header names the Actual target: ' + header);

    // The UI shows what the fake amp read back: the uploaded patch, decoded like any dump.
    await until(() => app.knob('MASTER').getAttribute('aria-valuenow') === '69', 'MASTER from the read-back');
    assertEqual(app.nameBox().value, 'EarlyVH', 'name');
    assertEqual(app.knob('GAIN').getAttribute('aria-valuenow'), '53', 'GAIN');
    assertEqual(app.container.querySelector('.thr-app').classList.contains('is-busy'), false, 'controls enabled again');
  } finally {
    app.cleanup();
  }
});

it('quick import: when the amp then differs, the preset is sent value by value; with the flag off that is the whole import', async () => {
  for (const quick of [true, false]) {
    const app = await bootApp({ connect: true });
    const before = flags.quickImport;
    flags.quickImport = quick;
    try {
      app.files.next = { name: 'EarlyVH.thrl6p', text: await sampleText() };
      app.menu('Import');
      await statusHas(app, 'Imported EarlyVH');
      const firstWrite = app.labels.indexOf('TX import Amp type');
      assertDeepEqual(app.labels.slice(0, firstWrite), quick
        ? ['TX sync: actual dump', ...[1, 2, 3, 4].map(n => `TX import upload ${n}/4`), 'TX sync: actual dump']
        : [], quick ? 'the upload is tried first' : 'no upload');
    } finally {
      flags.quickImport = before;
      app.cleanup();
    }
  }
});

it('import value by value: the preset is sent with the edit frames, the amp is read back, differences are reported', async () => {
  const app = await bootApp({ connect: true });
  const quickBefore = flags.quickImport;
  flags.quickImport = false;
  try {
    app.files.next = { name: 'EarlyVH.thrl6p', text: await sampleText() };
    app.menu('Import');
    await statusHas(app, 'Imported EarlyVH');

    // Two frames (header and body) per type select and per value.
    const steps = app.labels.filter((label, i) => i % 2 === 0);
    assertEqual(steps[0], 'TX import Amp type', 'the amp model goes first');
    assertDeepEqual(steps.slice(1, 7), [
      'TX import Amp Bass', 'TX import Amp Drive', 'TX import Amp Master', 'TX import Amp Mid', 'TX import Amp Treble',
      'TX import GuitarProc SpkSimType'
    ], 'amp values, then the cabinet');
    assertTrue(steps.includes('TX import FX2 type') && steps.includes('TX import FX2 FX2Enable'), 'effect type and on/off');
    assertEqual(app.labels[app.labels.length - 1], 'TX sync: actual dump', 'the amp is read back last');
    assertTrue(app.labels.every(label => !label.startsWith('TX param')), 'no coalesced knob writes');
    assertTrue(!app.labels.some(label => label.includes('THRPresetParamTempo')), 'the tempo is not sent');

    // The fake amp answers with its old settings, so the read-back differs from the preset.
    assertTrue(app.status().includes('but the amp differs in: Amp type'), 'differences reported: ' + app.status());
    assertEqual(app.nameBox().value, 'EarlyVH', 'the imported name stays');
    assertEqual(app.container.querySelector('.thr-app').classList.contains('is-busy'), false, 'controls enabled again');
  } finally {
    flags.quickImport = quickBefore;
    app.cleanup();
  }
});

it('save to a memory: reads the amp settings, uploads them, then recalls the memory and checks what it plays', async () => {
  const app = await bootApp({ connect: true });
  try {
    app.menu('Save to THR slot 2');
    await statusHas(app, 'Saved to memory 2');
    await until(() => app.container.querySelector('.footer-memory-button.is-selected'), 'the selected memory');
    assertDeepEqual(app.confirms, ['Overwrite memory 2 on the amp?'], 'one question');
    assertDeepEqual(app.labels, [
      'TX sync: actual dump', 'TX read memory 2',
      ...[1, 2, 3, 4, 5, 6, 7].map(n => `TX save memory 2 ${n}/7`),
      'TX memory slot 2', 'TX sync: actual dump'
    ], 'frame order');
    assertEqual(app.container.querySelector('.footer-memory-button.is-selected').textContent, '2', 'memory 2 is active');
  } finally {
    app.cleanup();
  }
});

it('save to a memory: when the recalled memory differs, the previous content is offered and put back', async () => {
  const app = await bootApp({ connect: true });
  try {
    // The fake amp always answers with its old patch, so a patch with a new name never verifies.
    const box = app.nameBox();
    box.value = 'N\u00e9w/name';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    await until(() => box.value === 'Nw/name', 'the sanitized name');

    app.menu('Save to THR slot 3');
    await statusHas(app, 'Save failed; memory 3 has its previous content again');
    assertDeepEqual(app.confirms, [
      'Overwrite memory 3 on the amp?', 'Memory 3 does not hold what was sent. Put its previous content back?'
    ], 'questions');
    assertEqual(app.labels.filter(label => label.startsWith('TX save memory 3')).length, 14, 'two uploads of seven frames');
    assertEqual(app.labels.filter(label => label === 'TX read memory 3').length, 1, 'the memory is read once, for its previous content');
    assertEqual(app.labels.filter(label => label === 'TX memory slot 3').length, 2, 'the memory is recalled for each check');
  } finally {
    app.cleanup();
  }
});

it('backup and restore: five memories go to a file and back, each verified; a file from other firmware is refused', async () => {
  const app = await bootApp({ connect: true });
  try {
    app.menu('Backup THR');
    await statusHas(app, 'Backup saved');
    assertDeepEqual(app.labels, [1, 2, 3, 4, 5].map(n => `TX read memory ${n}`), 'five reads, nothing written');
    const backup = JSON.parse(app.files.saved[0].text);
    assertEqual(backup.firmware, '1.44.0.a', 'firmware');
    assertDeepEqual(backup.identity, { family: 0x24, model: 0x01 }, 'identity');
    assertDeepEqual(backup.slots.map(entry => `${entry.slot} ${entry.name}`), [1, 2, 3, 4, 5].map(n => `${n} Crunch Ico LP`), 'memories');

    app.labels.length = 0;
    app.files.next = { name: 'backup.json', text: app.files.saved[0].text };
    app.menu('Restore THR');
    await statusHas(app, 'Restored all five memories');
    assertEqual(app.files.saved.length, 2, 'a backup is taken before the restore');
    assertEqual(app.labels.filter(label => label.startsWith('TX save memory')).length, 35, 'five uploads of seven frames');

    app.labels.length = 0;
    app.files.next = { name: 'other.json', text: JSON.stringify({ ...backup, firmware: '1.40.0.a' }) };
    app.menu('Restore THR');
    await statusHas(app, 'Restore failed: the backup is from another amp or firmware');
    assertDeepEqual(app.labels, [], 'nothing sent');
  } finally {
    app.cleanup();
  }
});
