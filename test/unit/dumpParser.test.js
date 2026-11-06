import { it, assertEqual } from '../support/assert.js';
import { parseIncomingThrFrame } from '../../src/protocol/frames.js';
import { createDumpAssembler } from '../../src/protocol/dumpAssembly.js';
import { loadNameOf, loadSymbolTable, makeNameOf, makeLiveIdOf } from '../../src/protocol/symbolTable.js';
import { parseDumpPatch, parsePatchName } from '../../src/protocol/dumpParser.js';
import { thrTypeCode } from '../../src/protocol/constants.js';
import { applyDumpPatch } from '../../src/state/applyDumpPatch.js';
import { createStore, createEmptyDeviceState } from '../../src/state/shadowStore.js';
import { findParamByName, findParamById, findUnitByName } from '../../src/state/selectors.js';
import { selectRuntimeModel } from '../../src/ui/runtime/viewModel.js';
import { loadInboundFrames, sha256Text } from '../support/transcripts.js';

const ACTUAL_DUMP = '/test/fixtures/transcripts/actual_dump.txt';
const SYMBOLS = '../doc/thr10ii_w_symbol_table_1_44_0_a.json';
const HEADER_BYTES = 16;

// Golden from the legacy page (thrii_ctrl.html: parseDumpPatchDomain, then projectDumpDomainToShadowState) for the
// same patch: 45 entries (6 unit types and 39 parameters). The digest covers normalizeUnits() of the units.
const LEGACY_ENTRY_COUNT = 45;
const LEGACY_UNITS_SHA256 = 'b96203acd215ca3bd73113dce4418a9da205f9beb6bc20a9b286a3c3b75626e9';

// Compared by identity, names, decoded values and raw words. Type codes are checked separately (wire codes).
function normalizeUnits(units) {
  return JSON.stringify(Object.values(units).sort((a, b) => a.id - b.id).map(u => [
    u.id, u.name, u.typeKey, u.typeName,
    Object.values(u.parameters).sort((a, b) => a.id - b.id).map(p => [p.id, p.name, p.decodedKind, p.rawU32, p.value])
  ]));
}

async function dumpPatchFromTranscript(path) {
  const assembler = createDumpAssembler({ now: () => 0 });
  const frames = await loadInboundFrames(path);
  const complete = frames
    .flatMap(frame => assembler.push(parseIncomingThrFrame(frame, 'USB')))
    .find(event => event.kind === 'dump_complete');
  return complete.payloadBytes.slice(HEADER_BYTES);
}

async function projectActualDump() {
  const nameOf = await loadNameOf(SYMBOLS);
  const entries = parseDumpPatch(await dumpPatchFromTranscript(ACTUAL_DUMP), nameOf);
  const store = createStore(createEmptyDeviceState());
  applyDumpPatch(store, entries, nameOf);
  return { entries, store };
}

it('dump parser: actual_dump.txt projects the legacy units into the store', async () => {
  const { entries, store } = await projectActualDump();
  assertEqual(entries.length, LEGACY_ENTRY_COUNT, 'entry count');
  assertEqual(await sha256Text(normalizeUnits(store.getState().units)), LEGACY_UNITS_SHA256, 'units match legacy');
});

it('dump parser: names, model and wire type codes follow the store conventions', async () => {
  const { store } = await projectActualDump();
  const state = store.getState();
  assertEqual(findUnitByName(state, 'Amp').typeName, 'THR10C_DC30', 'amp model from its unit type');

  const master = findParamByName(findUnitByName(state, 'Amp'), 'Master');
  assertEqual(master.name, 'MasterState', 'lookup ignores the State suffix');
  assertEqual(master.typeCode, thrTypeCode.float32, 'float wire code');
  assertEqual(master.value, 0.6666669845581055, 'master value');

  const guitarProc = findUnitByName(state, 'GuitarProc');
  const fx1Enable = findParamByName(guitarProc, 'FX1EnableState');
  assertEqual(fx1Enable.typeCode, thrTypeCode.bool, 'bool wire code');
  assertEqual(fx1Enable.value, true, 'FX1 enabled');
  const cabinet = findParamByName(guitarProc, 'SpkSimType');
  assertEqual(cabinet.typeCode, thrTypeCode.enum, 'enum wire code');
  assertEqual(cabinet.value, 10, 'cabinet index');
});

it('dump parser: the runtime model reads the projected dump', async () => {
  const { store } = await projectActualDump();
  const state = store.getState();
  const model = selectRuntimeModel(state);
  assertEqual(model.amp.modelName, 'THR10C_DC30', 'amp model');
  assertEqual(model.amp.cabinet.name, 'Boutique 2x12', 'cabinet from SpkSimType');
  assertEqual(model.amp.knobs.find(k => k.label === 'MASTER').value, 67, 'master knob');
  assertEqual(model.modules.comp.knobs[0].value, 44, 'FX1 sustain knob');
  assertEqual(model.modules.comp.active, true, 'FX1 enable is read from GuitarProc');
  assertEqual(model.modules.comp.enableRef.unitId, findUnitByName(state, 'GuitarProc').id, 'write goes to the owning unit');
  assertEqual(model.modules.gate.knobs[0].value, 60, 'threshold -38 dB on the -96..0 knob');
});

it('dump parser: the preset name comes from the dump and clears the modified flag', async () => {
  const patch = await dumpPatchFromTranscript(ACTUAL_DUMP);
  assertEqual(parsePatchName(patch), 'Crunch Ico LP', 'preset name from the dump');
  const nameOf = await loadNameOf(SYMBOLS);
  const store = createStore(createEmptyDeviceState());
  store.commit(state => { state.modified = true; }, 'device');
  applyDumpPatch(store, parseDumpPatch(patch, nameOf), nameOf, 'Crunch Ico LP');
  assertEqual(store.getState().presetName, 'Crunch Ico LP', 'presetName set');
  assertEqual(store.getState().modified, false, 'modified cleared');
});

it('dump parser: parameters are keyed by the live ids the amp accepts writes for (not the State ids)', async () => {
  const byId = await loadSymbolTable(SYMBOLS);
  const nameOf = makeNameOf(byId);
  const liveIdOf = makeLiveIdOf(byId);
  const entries = parseDumpPatch(await dumpPatchFromTranscript(ACTUAL_DUMP), nameOf);
  const store = createStore(createEmptyDeviceState());
  applyDumpPatch(store, entries, nameOf, null, liveIdOf);
  const state = store.getState();
  assertEqual(findParamById(state, 316, 303) && findParamById(state, 316, 303).name, 'FX2Enable', 'FX2 enable is 303');
  assertEqual(findParamById(state, 316, 283), null, 'the FX2EnableState id (283) is not a key');
  assertEqual(findParamById(state, 316, 263) && findParamById(state, 316, 263).name, 'SpkSimType', 'speaker is 263');
  assertEqual(findParamById(state, 270, 228) && findParamById(state, 270, 228).name, 'Freq', 'chorus rate is 228');
  assertEqual(findParamById(state, 268, 76) && findParamById(state, 268, 76).name, 'Master', 'amp Master is 76');
  const model = selectRuntimeModel(state);
  assertEqual(model.amp.cabinet.ref.paramId, 263, 'cabinet write goes to 263');
  assertEqual(model.modules.comp.enableRef === null, false, 'FX1 enable has a ref');
});

it('dump parser: applyDumpPatch commits with source dump', async () => {
  const nameOf = await loadNameOf(SYMBOLS);
  const entries = parseDumpPatch(await dumpPatchFromTranscript(ACTUAL_DUMP), nameOf);
  const store = createStore(createEmptyDeviceState());
  let source = null;
  store.subscribe((_, s) => { source = s; });
  applyDumpPatch(store, entries, nameOf);
  await Promise.resolve();
  assertEqual(source, 'dump', 'commit source');
});
