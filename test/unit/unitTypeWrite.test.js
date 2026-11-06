import { it, assertDeepEqual } from '../support/assert.js';
import { parseSysExHex } from '../../src/core/bytes.js';
import { buildSelectUnitType } from '../../src/protocol/builders.js';
import { setDeviceIdentity } from '../../src/protocol/identity.js';
import { makeIdOfName } from '../../src/protocol/symbolTable.js';
import { createRuntimeIntents } from '../../src/ui/runtime/intents.js';
import { RUNTIME_LAYOUT, AMP_FAMILIES, AMP_FAMILY_ORDER } from '../../src/ui/runtime/layout.js';
import { defaultsForType, nextFamilyModel, selectRuntimeModel } from '../../src/ui/runtime/viewModel.js';
import { createEmptyDeviceState, createStore } from '../../src/state/shadowStore.js';
import { assertEqual } from '../support/assert.js';

// Enum symbols of the effect, echo and reverb types (the ids of thrKeys.enumValue).
const TYPE_SYMBOLS = {
  '208': 'Phaser', '220': 'BiasTremolo', '226': 'L6Flanger', '230': 'StereoSquareChorus',
  '235': 'TapeEcho', '241': 'L6DigitalDelay', '243': 'StandardSpring', '249': 'LargePlate1',
  '254': 'ReallyLargeHall', '256': 'SmallRoom1'
};

function collectUnitOptions(node, out = []) {
  if (Array.isArray(node)) {
    node.forEach(item => collectUnitOptions(item, out));
  } else if (node && typeof node === 'object') {
    if (Array.isArray(node.unitOptions)) out.push(...node.unitOptions);
    Object.values(node).forEach(value => collectUnitOptions(value, out));
  }
  return out;
}


// Golden frames of the legacy "select chorus" (test/fixtures/transcripts/select_chorus.txt, lines 1-2):
// unit 0x10e (FX2), enum symbol 230 (StereoSquareChorus).
const LEGACY_HEADER = 'f0 00 01 0c 24 01 4d 00 17 00 00 07 00 08 00 00 00 08 00 00 00 00 00 00 00 00 00 00 f7';
const LEGACY_BODY = 'f0 00 01 0c 24 01 4d 00 18 00 00 07 04 0e 01 00 00 66 00 00 00 00 00 00 00 00 00 00 f7';

it('unit type write: select StereoSquareChorus on FX2 matches the legacy frames byte for byte', () => {
  setDeviceIdentity({ family: 0x24, model: 0x01 });
  const frames = buildSelectUnitType(0x10e, 230, { headerCounter: 0x17, bodyCounter: 0x18 });
  assertDeepEqual(Array.from(frames[0]), Array.from(parseSysExHex(LEGACY_HEADER)), 'header frame');
  assertDeepEqual(Array.from(frames[1]), Array.from(parseSysExHex(LEGACY_BODY)), 'body frame');
});

it('symbol names map to enum ids and ignore State variants', () => {
  const idOfName = makeIdOfName({ '227': 'FreqState', '228': 'Freq', '230': 'StereoSquareChorus' });
  assertDeepEqual(idOfName('StereoSquareChorus'), 230, 'enum symbol id');
  assertDeepEqual(idOfName('Freq'), 228, 'plain name is not replaced by its State variant');
  assertDeepEqual(idOfName('Unknown'), null, 'unknown name');
});

it('unit type pick: every dropdown value is a device symbol, and a pick updates the store and reports its id', () => {
  const idOfName = makeIdOfName(TYPE_SYMBOLS);
  const options = collectUnitOptions(RUNTIME_LAYOUT);
  assertEqual(options.length, 10, 'effect, echo and reverb options');
  options.forEach(option => {
    assertEqual(idOfName(option.value) != null, true, `${option.label} resolves to a symbol id`);
  });

  const store = createStore(createEmptyDeviceState());
  store.commit(state => {
    state.units['270'] = { id: 270, name: 'FX2', typeKey: 212, typeName: 'Phaser', parameters: { 'Freq': { id: 228 } } };
  }, 'device');

  const picks = [];
  const intents = createRuntimeIntents({
    store,
    flags: { coalesceWrites: false },
    sendParam: () => {},
    typeKeyOf: idOfName,
    onSelectUnit: (unitId, typeKey) => picks.push([unitId, typeKey])
  });
  intents.selectUnit(270, 'StereoSquareChorus');

  assertDeepEqual(picks, [[270, 230]], 'the write uses the enum id');
  const state = store.getState();
  assertEqual(state.units['270'].typeName, 'StereoSquareChorus', 'store follows the pick');
  assertEqual(state.units['270'].typeKey, 230, 'store keeps the id');
  assertDeepEqual(state.units['270'].parameters, {}, 'effect parameters of the old type are dropped');
  assertEqual(state.modified, true, 'a UI change marks the preset as modified');

  intents.selectUnit(270, 'NotASymbol');
  assertDeepEqual(picks, [[270, 230]], 'an unknown name is not sent');
});

// Amp ids of the legacy page's ampCollections (hex values there, decimal here).
const LEGACY_AMP_IDS = {
  THR10C_Deluxe: 0x4a, THR10C_DC30: 0x88, THR10_Lead: 0x99, THR10_Modern: 0x7f,
  THR10X_Brown1: 0x78, THR10_Bass_Eden_Marcus: 0xb7, THR10_Aco_Condenser1: 0x93, THR10_Flat: 0x8f,
  THR30_Carmen: 0xb2, THR30_SR101: 0xa3, THR10_Brit: 0xbb, THR10X_Brown2: 0x8b,
  THR30_Stealth: 0x9c, THR30_JKBass2: 0xb8, THR10_Aco_Dynamic1: 0x97, THR10_Flat_V: 0xb5,
  THR10C_BJunior2: 0xb6, THR10C_Mini: 0x71, THR30_Blondie: 0xa8, THR30_FLead: 0xaf,
  THR10X_South: 0x84, THR10_Bass_Mesa: 0xab, THR10_Aco_Tube1: 0x98, THR10_Flat_B: 0xb4
};

it('amp models: every family model is a device symbol with the legacy amp id', async () => {
  const table = await (await fetch('/doc/thr10ii_w_symbol_table_1_44_0_a.json')).json();
  const idOfName = makeIdOfName(table.byId);
  const models = AMP_FAMILY_ORDER.flatMap(key => AMP_FAMILIES[key].models.map(model => model.value));
  assertEqual(models.length, 24, 'eight models per family');
  models.forEach(name => assertEqual(idOfName(name), LEGACY_AMP_IDS[name], `${name} id`));
});

it('amp LED step: the next family keeps the position of the model', () => {
  assertEqual(nextFamilyModel('THR10C_Deluxe'), 'THR10C_BJunior2', 'classic to boutique');
  assertEqual(nextFamilyModel('THR10C_BJunior2'), 'THR30_Carmen', 'boutique to modern');
  assertEqual(nextFamilyModel('THR30_Carmen'), 'THR10C_Deluxe', 'modern to classic');
  assertEqual(nextFamilyModel('THR10_Flat_V'), 'THR10_Flat', 'last position in modern');
  assertEqual(nextFamilyModel('NotAModel'), null, 'unknown model');
});

it('amp labels: the Flat models carry the names in layout.js (Boutique THR10_Flat_B = Flat B, Modern THR10_Flat_V = Flat V)', () => {
  const label = (family, value) => AMP_FAMILIES[family].models.find(model => model.value === value).label;
  assertEqual(label('modern', 'THR10_Flat_V'), 'Flat V', 'modern flat');
  assertEqual(label('boutique', 'THR10_Flat_B'), 'Flat B', 'boutique flat');
});

it('symbol names match with the layout spelling: State suffix and spaces are ignored', () => {
  const idOfName = makeIdOfName({ '272': 'FX2Mix', '282': 'FX2MixState', '300': 'PreDelay' });
  assertEqual(idOfName('FX2MixState'), 272, 'State suffix');
  assertEqual(idOfName('Pre Delay'), 300, 'spaces');
});

// The amp's own defaults for each type (percent), as the Yamaha amp applies them when a type is selected.
// Each entry: [module key, unit name, type value (symbol name), expected knobs in order].
const TYPE_DEFAULT_CASES = [
  ['effect', 'FX2', 'StereoSquareChorus', [['SPEED', 12], ['DEPTH', 23], ['PRE DELAY', 50], ['FEEDBACK', 12], ['MIX', 45]]],
  ['effect', 'FX2', 'Phaser', [['SPEED', 1], ['FEEDBACK', 43], ['MIX', 33]]],
  ['effect', 'FX2', 'L6Flanger', [['SPEED', 4], ['DEPTH', 44], ['MIX', 26]]],
  ['effect', 'FX2', 'BiasTremolo', [['SPEED', 34], ['DEPTH', 71], ['MIX', 41]]],
  ['echo', 'FX3', 'TapeEcho', [['TIME', 41], ['FEEDBACK', 50], ['BASS', 43], ['TREBLE', 55], ['MIX', 26]]],
  ['echo', 'FX3', 'L6DigitalDelay', [['TIME', 39], ['FEEDBACK', 38], ['BASS', 26], ['TREBLE', 37], ['MIX', 36]]],
  ['reverb', 'FX4', 'StandardSpring', [['REVERB', 25], ['TONE', 50], ['MIX', 19]]],
  ['reverb', 'FX4', 'LargePlate1', [['DECAY', 24], ['PRE DELAY', 31], ['TONE', 54], ['MIX', 20]]],
  ['reverb', 'FX4', 'ReallyLargeHall', [['DECAY', 18], ['PRE DELAY', 10], ['TONE', 62], ['MIX', 45]]],
  ['reverb', 'FX4', 'SmallRoom1', [['DECAY', 13], ['PRE DELAY', 6], ['TONE', 59], ['MIX', 10]]]
];

it('type defaults: picking a type in the UI shows the amp default values on its knobs, before the amp reports anything', async () => {
  const table = await (await fetch('/doc/thr10ii_w_symbol_table_1_44_0_a.json')).json();
  const idOfName = makeIdOfName(table.byId);
  TYPE_DEFAULT_CASES.forEach(([moduleKey, unitName, typeValue, expected]) => {
    const module = RUNTIME_LAYOUT.rows.flatMap(row => (row.type === 'dual' ? row.modules : [row.module]))
      .find(config => config.key === moduleKey);
    const store = createStore(createEmptyDeviceState());
    store.commit(state => {
      state.units['300'] = { id: 300, name: unitName, typeKey: null, typeName: null, parameters: {} };
      state.units['316'] = { id: 316, name: 'GuitarProc', typeKey: null, typeName: null, parameters: {} };
    }, 'device');
    const picks = [];
    const intents = createRuntimeIntents({
      store,
      flags: { coalesceWrites: false },
      sendParam: () => {},
      typeKeyOf: idOfName,
      paramIdOf: idOfName,
      onSelectUnit: (unitId, typeKey, writes) => picks.push({ unitId, typeKey, writes })
    });
    intents.selectUnit(300, typeValue, defaultsForType(module, typeValue));

    const shown = selectRuntimeModel(store.getState()).modules[moduleKey].knobs.map(knob => [knob.label, knob.value]);
    assertDeepEqual(shown, expected, `${typeValue} default knobs`);
    const mixRef = selectRuntimeModel(store.getState()).modules[moduleKey].knobs.find(knob => knob.label === 'MIX').ref;
    assertEqual(mixRef.unitId, 316, `${typeValue} MIX knob writes to GuitarProc`);
    assertEqual(picks.length, 1, `${typeValue} sends the select once`);
    assertDeepEqual(picks[0].writes.map(write => Math.round(write.value * 100)), expected.map(([, percent]) => percent), `${typeValue} default values are sent`);
    assertDeepEqual(picks[0].writes.map(write => write.unitId), expected.map(([label]) => (label === 'MIX' ? 316 : 300)), `${typeValue} writes go to the unit that holds each parameter`);
  });
});

it('type pick keeps the effect enable: the module keeps its on/off state and the power button stays usable', () => {
  const store = createStore(createEmptyDeviceState());
  store.commit(state => {
    state.units['270'] = {
      id: 270, name: 'FX2', typeKey: 208, typeName: 'Phaser',
      parameters: {
        '228': { id: 228, name: 'Freq', typeCode: 4, decodedKind: 'number', rawU32: 0, value: 0.2 },
        '283': { id: 283, name: 'FX2EnableState', typeCode: 3, decodedKind: 'bool', rawU32: 0x3f800000, value: true }
      }
    };
  }, 'device');
  const intents = createRuntimeIntents({ store, flags: { coalesceWrites: false }, sendParam: () => {}, typeKeyOf: () => 230, onSelectUnit: () => {} });
  intents.selectUnit(270, 'StereoSquareChorus');

  const effect = selectRuntimeModel(store.getState()).modules.effect;
  assertEqual(effect.active, true, 'effect stays on');
  assertEqual(effect.enableRef !== null, true, 'enable is still known');
  assertDeepEqual(Object.keys(store.getState().units['270'].parameters), ['283'], 'only the enable survives the type switch');
});

it('type pick with enableRef: the enable is set in the store and sent last, as a bool write', () => {
  const store = createStore(createEmptyDeviceState());
  store.commit(state => {
    state.units['270'] = {
      id: 270, name: 'FX2', typeKey: 208, typeName: 'Phaser',
      parameters: { '283': { id: 283, name: 'FX2EnableState', typeCode: 3, decodedKind: 'bool', rawU32: 0, value: false } }
    };
  }, 'device');
  const sent = [];
  const intents = createRuntimeIntents({ store, flags: { coalesceWrites: false }, sendParam: () => {}, typeKeyOf: () => 230, onSelectUnit: (unitId, typeKey, writes, enable) => sent.push({ unitId, typeKey, writes, enable }) });
  intents.selectUnit(270, 'StereoSquareChorus', [], { unitId: 270, paramId: 283, typeCode: 3 });

  assertEqual(store.getState().units['270'].parameters['283'].value, true, 'store: enabled');
  assertDeepEqual(sent, [{ unitId: 270, typeKey: 230, writes: [], enable: { unitId: 270, paramId: 283, typeCode: 3 } }], 'enable is passed to the shell');
});
