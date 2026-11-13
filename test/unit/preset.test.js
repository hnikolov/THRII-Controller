import { it, assertEqual, assertDeepEqual, assertTrue } from '../support/assert.js';
import { loadInboundFrames } from '../support/transcripts.js';
import {
  parseThrl6Preset, presetFileName, presetToPlan, presetToText, sanitizePresetName, storeToPreset, PRESET_NAME_MAX
} from '../../src/domain/presetModel.js';
import { applyPresetPlan, comparePlan } from '../../src/state/applyPreset.js';
import { applyDumpPatch } from '../../src/state/applyDumpPatch.js';
import { createStore, createEmptyDeviceState } from '../../src/state/shadowStore.js';
import { selectRuntimeModel } from '../../src/ui/runtime/viewModel.js';
import { loadSymbolTable, makeIdOfName, makeLiveIdOf, makeNameOf } from '../../src/protocol/symbolTable.js';
import { createDumpAssembler } from '../../src/protocol/dumpAssembly.js';
import { parseIncomingThrFrame } from '../../src/protocol/frames.js';
import { parseDumpPatch, parsePatchName, withPatchName } from '../../src/protocol/dumpParser.js';
import { buildCommandFrameFromRawPayload } from '../../src/protocol/builders.js';
import { buildSlotUploadFrames } from '../../src/protocol/upload.js';
import { memoryHolds, toMemoryPatch } from '../../src/protocol/memoryPatch.js';
import { decodeIncomingEvent } from '../../src/protocol/incoming.js';
import { setDeviceIdentity } from '../../src/protocol/identity.js';
import { writeU32LE } from '../../src/core/bytes.js';

const SYMBOLS = '../doc/thr10ii_w_symbol_table_1_44_0_a.json';
const loadSample = async () => (await fetch('/doc/' + encodeURIComponent('01. EarlyVH.thrl6p'))).json();
const loadGolden = async () => (await fetch('/test/fixtures/preset.normalized.golden.json')).json();
const sorted = value => (value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]))
  : value);

async function samplePlan(options = {}) {
  const idOfName = makeIdOfName(await loadSymbolTable(SYMBOLS));
  return presetToPlan(parseThrl6Preset(options.json || await loadSample()), { idOfName, ...options });
}

async function actualDumpPatch() {
  const assembler = createDumpAssembler({ now: () => 0 });
  const frames = await loadInboundFrames('/test/fixtures/transcripts/actual_dump.txt');
  return frames.flatMap(frame => assembler.push(parseIncomingThrFrame(frame, 'USB')))
    .find(event => event.kind === 'dump_complete').payloadBytes.slice(16);
}

it('preset: the sample file parses to the normalized golden', async () => {
  assertDeepEqual(sorted(parseThrl6Preset(await loadSample())), sorted(await loadGolden()), 'normalized preset');
});

it('preset: a file without the L6Preset schema or the amp group is refused', async () => {
  const messageOf = json => { try { parseThrl6Preset(json); return null; } catch (err) { return err.message; } };
  assertTrue(/schema/.test(messageOf({ schema: 'Other' })), 'schema');
  assertTrue(/THRGroupAmp/.test(messageOf({ schema: 'L6Preset', data: { tone: {} } })), 'amp group');
});

it('preset name: printable ASCII, cut at the maximum length; the file name drops what file names do not allow', () => {
  assertEqual(PRESET_NAME_MAX, 20, 'maximum');
  assertEqual(sanitizePresetName('Näme that is far too long'), 'Nme that is far too ', 'non-ASCII removed, cut at 20');
  assertEqual(sanitizePresetName('A\\B/C:D*E?F"G<H>I|J'), 'A\\B/C:D*E?F"G<H>I|J', 'punctuation stays in the name');
  assertEqual(presetFileName('A\\B/C:D*E?F"G<H>I|J'), 'ABCDEFGHIJ.thrl6p', 'file name');
  assertEqual(presetFileName('Clean (v2) - A_b.c'), 'Clean (v2) - A_b.c.thrl6p', 'usual characters stay');
  assertEqual(presetFileName('??'), 'Preset.thrl6p', 'a name with nothing left gets a default file name');
});

it('preset plan: every name of the sample resolves; modules carry type, values, mix and on/off in send order', async () => {
  const plan = await samplePlan();
  assertEqual(plan.presetName, 'EarlyVH', 'name');
  assertDeepEqual(plan.modules.map(m => `${m.unitName}:${m.typeName}`), [
    'Amp:THR10X_Brown1', 'GuitarProc:null', 'FX1:null', 'FX2:Phaser', 'FX3:TapeEcho', 'FX4:LargePlate1', 'GuitarProc:null', 'Global:null'
  ], 'modules');
  const effect = plan.modules[3];
  assertDeepEqual(effect.params.map(p => `${p.unitName}.${p.name}=${p.value}(${p.kind})`), [
    'FX2.Feedback=0.434175(float)', 'FX2.Speed=0.0144242(float)', 'GuitarProc.FX2Mix=0.334071(float)', 'GuitarProc.FX2Enable=false(bool)'
  ], 'effect parameters');
  assertDeepEqual(plan.modules[1].params.map(p => `${p.name}=${p.value}(${p.kind})`), ['SpkSimType=2(enum)'], 'cabinet');
  assertTrue(plan.modules.every(m => m.unitId != null && m.params.every(p => p.id != null && p.unitId != null)), 'all ids resolved');
  assertEqual(plan.modules[7].params[0].local, true, 'the tempo is kept locally, never sent');
  // The table also has "Pre Delay" (233); the amp ignores writes to it (upload_preset_with_amp_reply.txt).
  assertEqual(plan.modules[5].params.find(p => p.name === 'PreDelay').id, 252, 'the reverb pre-delay is written as PreDelay (252)');
});

it('preset plan: unknown names and unknown types refuse the whole plan', async () => {
  const messageOf = async change => {
    const json = await loadSample();
    change(json.data.tone);
    try { await samplePlan({ json, isKnownType: (unit, type) => type !== 'NotAnAmp' }); return null; } catch (err) { return err.message; }
  };
  assertTrue(/Wobble/.test(await messageOf(tone => { tone.THRGroupFX2Effect.Wobble = 0.5; })), 'unknown parameter');
  assertTrue(/NotAnAmp/.test(await messageOf(tone => { tone.THRGroupAmp['@asset'] = 'NotAnAmp'; })), 'unknown type');
  assertTrue(/THRGroupGate\.Level/.test(await messageOf(tone => { tone.THRGroupGate.Level = 0.5; })), 'parameter outside its group');
  assertEqual(await messageOf(() => {}), null, 'the unchanged sample is accepted');
});

it('preset import without an amp: an empty store shows the preset', async () => {
  const store = createStore(createEmptyDeviceState());
  applyPresetPlan(store, await samplePlan());
  const state = store.getState();
  assertEqual(state.presetName, 'EarlyVH', 'name');
  assertEqual(state.modified, true, 'modified');
  const model = selectRuntimeModel(state);
  assertEqual(model.amp.modelName, 'THR10X_Brown1', 'amp model');
  assertEqual(model.amp.cabinet.name, 'Brown 4x12', 'cabinet');
  assertDeepEqual(model.amp.knobs.map(k => k.value), [53, 69, 41, 69, 75], 'amp knobs GAIN..TREBLE');
  assertTrue(model.amp.knobs.every(k => k.ref !== null), 'amp knobs editable');
  assertEqual(model.modules.gate.knobs[0].value, 66, 'gate threshold -33 dB');
  assertDeepEqual([model.modules.comp.active, model.modules.gate.active, model.modules.effect.active, model.modules.echo.active, model.modules.reverb.active],
    [false, true, false, true, true], 'on/off states');
  assertEqual(model.modules.effect.typeName, 'Phaser', 'effect type');
  assertDeepEqual(model.modules.reverb.knobs.map(k => `${k.label} ${k.value}`), ['DECAY 24', 'PRE DELAY 31', 'TONE 54', 'MIX 20'], 'reverb knobs');
  assertDeepEqual(comparePlan(state, await samplePlan()), [], 'the store matches its plan');
});

it('preset export: importing the sample and exporting it gives the sample back', async () => {
  const store = createStore(createEmptyDeviceState());
  applyPresetPlan(store, await samplePlan());
  const text = presetToText(storeToPreset(store.getState(), 'EarlyVH'));
  assertDeepEqual(sorted(parseThrl6Preset(JSON.parse(text))), sorted(await loadGolden()), 'round trip');
  assertDeepEqual(sorted(JSON.parse(text)), sorted(await loadSample()), 'whole file');
});

it('preset export: settings read from the amp export to a file that imports to the same settings', async () => {
  const table = await loadSymbolTable(SYMBOLS);
  const nameOf = makeNameOf(table);
  const fromAmp = createStore(createEmptyDeviceState());
  applyDumpPatch(fromAmp, parseDumpPatch(await actualDumpPatch(), nameOf), nameOf, 'Crunch Ico LP', makeLiveIdOf(table));
  const exported = storeToPreset(fromAmp.getState(), 'Crunch Ico LP');
  assertEqual(exported.data.tone.THRGroupAmp['@asset'], 'THR10C_DC30', 'amp model in the file');

  const plan = presetToPlan(parseThrl6Preset(exported), { idOfName: makeIdOfName(table) });
  const offline = createStore(createEmptyDeviceState());
  applyPresetPlan(offline, plan);
  assertDeepEqual(storeToPreset(offline.getState(), 'Crunch Ico LP'), exported, 'export after import');
  assertDeepEqual(comparePlan(fromAmp.getState(), plan), [], 'the plan matches the amp settings it came from');
});

it('patch name: the same name keeps the bytes; a new name changes only the name field', async () => {
  const patch = await actualDumpPatch();
  const nameOf = makeNameOf(await loadSymbolTable(SYMBOLS));
  assertEqual(withPatchName(patch, 'Crunch Ico LP'), patch, 'same name: same patch');

  const renamed = withPatchName(patch, 'EarlyVH');
  assertEqual(parsePatchName(renamed), 'EarlyVH', 'new name reads back');
  assertEqual(renamed.length, patch.length - 'Crunch Ico LP'.length + 'EarlyVH'.length, 'length follows the name');
  assertDeepEqual(parseDumpPatch(renamed, nameOf), parseDumpPatch(patch, nameOf), 'settings unchanged');
  assertDeepEqual(Array.from(withPatchName(renamed, 'Crunch Ico LP')), Array.from(patch), 'renaming back restores the bytes');
});

it('upload frames: one header and six body frames for the captured patch, counters in one unbroken run', async () => {
  setDeviceIdentity({ family: 0x24, model: 0x01 });
  const frames = buildSlotUploadFrames(1, await actualDumpPatch());
  assertEqual(frames.length, 7, 'frame count');
  const counters = frames.map(frame => frame[8]);
  assertTrue(counters.every((counter, i) => i === 0 || counter === counters[i - 1] + 1), 'counters ' + counters.join(' '));
  assertTrue(frames.every(frame => frame[7] === 0x01), 'group 1');
  assertDeepEqual(frames.map(frame => frame[9]), [0, 1, 2, 3, 4, 5, 6], 'pc: header 0, body frames from 1 (the sequencing the amp accepted)');
});

// dump_slot_1_debug.txt: memory 1 was recalled, then the Actual settings (1109 bytes) and memory 1 (613 bytes) were read,
// the Actual dump was uploaded to memory 1, and memory 1 was read back (613 bytes again: the amp keeps its memory layout).
it('memory patch: the Actual dump of a recalled memory converts to that memory\'s own bytes', async () => {
  const assembler = createDumpAssembler({ now: () => 0 });
  const patches = (await loadInboundFrames('/test/fixtures/transcripts/dump_slot_1_debug.txt'))
    .flatMap(frame => assembler.push(parseIncomingThrFrame(frame, 'USB')))
    .filter(event => event.kind === 'dump_complete')
    .map(event => event.payloadBytes.slice(16));
  const actual = patches.find(patch => patch.length === 1109);
  const memory = patches.find(patch => patch.length === 613);
  const nameOf = makeNameOf(await loadSymbolTable(SYMBOLS));

  const converted = toMemoryPatch(actual, nameOf);
  assertDeepEqual(Array.from(converted), Array.from(memory), 'converted patch');
  assertEqual(parsePatchName(converted), 'Clean Megadeth', 'name');
  assertDeepEqual(Array.from(toMemoryPatch(memory, nameOf)), Array.from(memory), 'a memory patch converts to itself');

  // The check after a save: the memory read back holds what was sent, although the bytes differ.
  assertTrue(memoryHolds(memory, actual, nameOf), 'memory 1 holds the uploaded Actual settings');
  assertTrue(memoryHolds(memory, memory, nameOf), 'and its own content (the put-back and restore case)');
  assertTrue(!memoryHolds(memory, withPatchName(actual, 'Other name'), nameOf), 'a different name is noticed');
  const changed = Uint8Array.from(actual);
  const master = changed.findIndex((_, i) => changed[i] === 0x53 && changed[i + 1] === 0 && changed[i + 4] === 3 && changed[i + 9] === 0x3f);
  changed[master + 9] = 0x3e;
  assertTrue(master > 0 && !memoryHolds(memory, changed, nameOf), 'a different value is noticed');
});

it('incoming: a memory dump report (code 1) is not a slot press', () => {
  setDeviceIdentity({ family: 0x24, model: 0x01 });
  const frame = words => buildCommandFrameFromRawPayload(
    Uint8Array.from([2, 16, ...words].flatMap(word => Array.from(writeU32LE(word)))), { group: 0, counter: 5 });
  assertEqual(decodeIncomingEvent(frame([2, 1, 2, 0])).kind, 'settings_notification', 'slot press (code 0)');
  assertEqual(decodeIncomingEvent(frame([2, 1, 2, 1])).kind, 'dump_report', 'memory dump report (code 1)');
});

it('symbol ids: of two names that differ only by a space, the one without the space is used', async () => {
  const idOfName = makeIdOfName(await loadSymbolTable(SYMBOLS));
  assertEqual(idOfName('Pre Delay'), 252, 'layout name "Pre Delay" resolves to PreDelay');
  assertEqual(idOfName('PreDelay'), 252, 'PreDelay');
  assertEqual(idOfName('Tape Echo'), 235, 'TapeEcho');
  assertEqual(idOfName('Bass'), 84, 'the first id still wins for other duplicates');
});

// The capture of an import on the amp (before the PreDelay fix). Kept as the reference for what the amp answers:
// see doc/import_preset_capture_notes.md.
it('import capture: every write is ACKed, the amp model select is echoed with its own values, the read-back follows', async () => {
  const events = (await loadInboundFrames('/test/fixtures/transcripts/upload_preset_with_amp_reply.txt')).map(decodeIncomingEvent).filter(Boolean);
  const count = kind => events.filter(event => event.kind === kind).length;
  assertEqual(count('ack'), 30, 'one ACK per command: 3 type selects and 27 values');
  const typeChanges = events.filter(event => event.kind === 'unit_type_change');
  assertEqual(typeChanges.length, 1, 'only the amp model select is echoed');
  assertEqual(typeChanges[0].unitId, 268, 'Amp unit');
  assertEqual(count('dump_report'), 2, 'the report of the dump before the import and of the read-back');
  assertEqual(count('settings_notification'), 0, 'no slot press');
});
