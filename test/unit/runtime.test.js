import { it, assertEqual, assertDeepEqual, assertTrue } from '../support/assert.js';
import { createStore, createEmptyDeviceState } from '../../src/state/shadowStore.js';
import { selectRuntimeModel, knobToValue } from '../../src/ui/runtime/viewModel.js';
import { createRuntimeIntents } from '../../src/ui/runtime/intents.js';
import { mountRuntime } from '../../src/ui/runtime/mount.js';
import { RUNTIME_LAYOUT } from '../../src/ui/runtime/layout.js';
import { normalizedParamName } from '../../src/state/selectors.js';
import { flags } from '../../src/core/flags.js';

const loadMock = async () => (await fetch('/test/fixtures/mockState.json')).json();
const wait = () => new Promise(resolve => setTimeout(resolve, 0));

it('view model: amp, cabinet, and knob values come from the captured device model', async () => {
  const model = selectRuntimeModel(await loadMock());
  assertEqual(model.amp.modelName, 'THR10X_Brown1', 'amp model');
  assertEqual(model.amp.cabinet.name, 'Brown 4x12', 'cabinet from SpkSimType index 2');
  assertDeepEqual(model.amp.knobs.map(k => k.value), [53, 69, 41, 69, 75], 'amp knobs GAIN..TREBLE');
  assertTrue(model.amp.knobs.every(k => k.ref !== null), 'amp knobs writable');
});

it('view model: unavailable parameters show null and are not writable', async () => {
  const model = selectRuntimeModel(await loadMock());
  const threshold = model.modules.gate.knobs[0];
  assertEqual(threshold.value, 66, 'gate threshold -33 dB on the -96..0 knob');
  assertEqual(threshold.ref.range[0], -96, 'threshold writes use the dB range');
  assertDeepEqual(model.modules.effect.knobs.map(k => k.label), ['SPEED', 'FEEDBACK', 'MIX'], 'Phaser shows only its own knobs');
});

it('view model: the reverb knob set follows the reverb type (Spring: REVERB, TONE, MIX)', async () => {
  const store = createStore(createEmptyDeviceState());
  store.commit(state => {
    state.units = { 276: { id: 276, name: 'FX4', typeName: 'StandardSpring', parameters: { 237: { id: 237, name: 'Time', typeCode: 4, decodedKind: 'number', rawU32: 0, value: 0.6 } } } };
  }, 'dump');
  const reverb = selectRuntimeModel(store.getState()).modules.reverb;
  assertDeepEqual(reverb.knobs.map(k => k.label), ['REVERB', 'TONE', 'MIX'], 'Spring knobs');
  assertEqual(reverb.knobs[0].value, 60, 'REVERB knob reads the amp Time parameter');
});

it('view model: the chorus SPEED knob reads the amp Freq parameter', async () => {
  const store = createStore(createEmptyDeviceState());
  store.commit(state => {
    state.units = { 270: { id: 270, name: 'FX2', typeName: 'StereoSquareChorus', parameters: { 228: { id: 228, name: 'Freq', typeCode: 4, decodedKind: 'number', rawU32: 0, value: 0.25 } } } };
  }, 'dump');
  const effect = selectRuntimeModel(store.getState()).modules.effect;
  assertEqual(effect.knobs[0].label, 'SPEED', 'first knob');
  assertEqual(effect.knobs[0].value, 25, 'SPEED reads Freq');
});

it('view model: the flanger SPEED knob reads the amp Freq parameter (captured in update_flanger)', async () => {
  const store = createStore(createEmptyDeviceState());
  store.commit(state => {
    state.units = { 270: { id: 270, name: 'FX2', typeName: 'Flanger', parameters: { 228: { id: 228, name: 'Freq', typeCode: 4, decodedKind: 'number', rawU32: 0, value: 0.4 } } } };
  }, 'dump');
  const effect = selectRuntimeModel(store.getState()).modules.effect;
  assertDeepEqual(effect.knobs.map(k => k.label), ['SPEED', 'DEPTH', 'MIX'], 'flanger knobs');
  assertEqual(effect.knobs[0].value, 40, 'SPEED reads Freq');
});

it('view model: without device data the modules show their default knob sets', () => {
  const model = selectRuntimeModel(createStore(createEmptyDeviceState()).getState());
  assertDeepEqual(model.modules.effect.knobs.map(k => k.label), ['SPEED', 'DEPTH', 'PRE DELAY', 'FEEDBACK', 'MIX'], 'default effect');
  assertDeepEqual(model.modules.echo.knobs.map(k => k.label), ['TIME', 'FEEDBACK', 'BASS', 'TREBLE', 'MIX'], 'default echo');
  assertDeepEqual(model.modules.reverb.knobs.map(k => k.label), ['DECAY', 'PRE DELAY', 'TONE', 'MIX'], 'default reverb');
});

it('view model: amp LED follows the family (Classic red, Modern green, Boutique blue)', async () => {
  const colorFor = typeName => {
    const store = createStore(createEmptyDeviceState());
    store.commit(state => { state.units = { 268: { id: 268, name: 'Amp', typeName, parameters: {} } }; }, 'dump');
    return selectRuntimeModel(store.getState()).amp.ledColor;
  };
  assertEqual(colorFor('THR10C_DC30'), 'red', 'classic');
  assertEqual(colorFor('THR30_Carmen'), 'green', 'modern');
  assertEqual(colorFor('THR10C_Mini'), 'blue', 'boutique');
});

it('view model: the gate threshold maps -96..0 dB to a 0..100 knob and back', async () => {
  const store = createStore(createEmptyDeviceState());
  store.commit(state => {
    state.units = { 316: { id: 316, name: 'GuitarProc', typeName: null, parameters: { 295: { id: 295, name: 'ThreshState', typeCode: 4, decodedKind: 'float32', rawU32: 0, value: -38 } } } };
  }, 'dump');
  const knob = selectRuntimeModel(store.getState()).modules.gate.knobs[0];
  assertEqual(knob.value, 60, 'knob position for -38 dB');
  assertEqual(Math.abs(knobToValue(knob.ref, 60) - (-38.4)) < 1e-9, true, 'knob 60 writes -38.4 dB');
  assertEqual(knobToValue(knob.ref, 0), -96, 'knob 0 is -96 dB');
  assertEqual(knobToValue(knob.ref, 100), 0, 'knob 100 is 0 dB');
});

it('view model: module enable state and unit type', async () => {
  const model = selectRuntimeModel(await loadMock());
  assertEqual(model.modules.comp.active, false, 'comp is off');
  assertEqual(model.modules.gate.active, true, 'gate is on');
  assertEqual(model.modules.effect.typeName, 'Phaser', 'effect type');
  assertEqual(model.modules.echo.typeName, 'TapeEcho', 'echo type');
  assertEqual(model.modules.comp.enableRef.paramId, 280, 'comp enable param');
});

it('view model: empty device state gives no values and no writable refs', () => {
  const model = selectRuntimeModel(createEmptyDeviceState());
  assertEqual(model.amp.unitId, null, 'no amp unit');
  assertEqual(model.amp.cabinet.name, null, 'no cabinet');
  assertTrue(model.amp.knobs.every(k => k.value === null && k.ref === null), 'amp knobs unavailable');
  assertEqual(model.memory.activeSlot, null, 'no active slot');
});

it('view model: active slot is passed through from the store', async () => {
  const state = await loadMock();
  state.activeSlot = 3;
  assertEqual(selectRuntimeModel(state).memory.activeSlot, 3, 'slot 3');
});

function recordingSetup(state) {
  const store = createStore(state);
  const sent = [];
  const requested = [];
  const scheduler = { request: key => requested.push(key) };
  const intents = createRuntimeIntents({
    store,
    flags,
    scheduler,
    sendParam: (unitId, paramId, value) => sent.push([unitId, paramId, value])
  });
  return { store, intents, sent, requested };
}

it('intent setParam commits with source ui and sends at once when coalescing is off', async () => {
  const { store, intents, sent, requested } = recordingSetup(await loadMock());
  const sources = [];
  store.subscribe((_, source) => sources.push(source));
  const before = flags.coalesceWrites;
  flags.coalesceWrites = false;
  try {
    intents.setParam({ unitId: 268, paramId: 76 }, 0.5);
  } finally {
    flags.coalesceWrites = before;
  }
  assertEqual(store.getState().units['268'].parameters['76'].value, 0.5, 'store value');
  assertDeepEqual(sent, [[268, 76, 0.5]], 'direct send');
  assertDeepEqual(requested, [], 'no scheduler request');
  await wait();
  assertDeepEqual(sources, ['ui'], 'commit source');
});

it('intent setParam goes through the scheduler when coalescing is on', async () => {
  const { intents, sent, requested } = recordingSetup(await loadMock());
  const before = flags.coalesceWrites;
  flags.coalesceWrites = true;
  try {
    intents.setParam({ unitId: 268, paramId: 76 }, 0.5);
  } finally {
    flags.coalesceWrites = before;
  }
  assertDeepEqual(requested, ['268:76'], 'scheduler request');
  assertDeepEqual(sent, [], 'no direct send');
});

it('intent setParam ignores unknown parameters: no commit, no write', async () => {
  const { store, intents, sent } = recordingSetup(await loadMock());
  intents.setParam({ unitId: 268, paramId: 999999 }, 0.5);
  assertDeepEqual(sent, [], 'no write');
  assertEqual(store.getState().units['268'].parameters['76'].value, 0.689062, 'store unchanged');
});

it('intent selectSlot never changes the store: the slot belongs to the device', async () => {
  const store = createStore(await loadMock());
  const slots = [];
  const intents = createRuntimeIntents({ store, flags, sendParam: () => {}, onSelectSlot: s => slots.push(s) });
  intents.selectSlot(2);
  assertDeepEqual(slots, [2], 'request forwarded');
  assertEqual(store.getState().activeSlot, null, 'activeSlot unchanged');
});

it('intent selectUnit updates the unit type in the store', async () => {
  const store = createStore(await loadMock());
  const intents = createRuntimeIntents({ store, flags, sendParam: () => {}, typeKeyOf: () => 226 });
  intents.selectUnit(270, 'L6Flanger');
  assertEqual(store.getState().units['270'].typeName, 'L6Flanger', 'typeName updated');
  assertEqual(store.getState().units['270'].typeKey, 226, 'typeKey updated');
});

it('layout: every knob and enable name (candidates included) is a symbol table name', async () => {
  const table = await (await fetch('/doc/thr10ii_w_symbol_table_1_44_0_a.json')).json();
  const known = new Set(Object.values(table.byId).map(normalizedParamName));
  const names = [];
  const addKnobs = knobs => knobs.forEach(knob => names.push(...[].concat(knob.param)));
  addKnobs(RUNTIME_LAYOUT.amp.knobs);
  names.push(RUNTIME_LAYOUT.amp.cabinetParam);
  RUNTIME_LAYOUT.rows.forEach(row => {
    (row.type === 'dual' ? row.modules : [row.module]).forEach(module => {
      names.push(module.enable);
      if (module.knobs) addKnobs(module.knobs);
      if (module.knobsByType) Object.values(module.knobsByType).forEach(addKnobs);
      if (module.defaultKnobs) addKnobs(module.defaultKnobs);
    });
  });
  assertDeepEqual(names.filter(name => !known.has(normalizedParamName(name))), [], 'names missing from the symbol table');
});

it('mount: renders the knob slots (five per type module, hidden when the type does not use them)', async () => {
  const store = createStore(await loadMock());
  const intents = createRuntimeIntents({ store, flags, sendParam: () => {} });
  const container = document.createElement('div');
  document.body.append(container);
  const runtime = mountRuntime(container, { store, intents });
  try {
    assertEqual(container.querySelectorAll('.knob').length, 24, 'knob slots: amp 5, gate 2, comp 2, three type modules of 5');
    const visible = [...container.querySelectorAll('.knob-module')].filter(el => el.style.display !== 'none').length;
    assertEqual(visible, 5 + 2 + 2 + 3 + 5 + 4, 'visible: amp 5, gate 2, comp 2, Phaser 3, TapeEcho 5, LargePlate 4');
    const master = container.querySelector('[aria-label="MASTER control"]');
    assertEqual(master.getAttribute('aria-valuenow'), '69', 'initial Master');

    store.commit(state => { state.units['268'].parameters['76'].value = 0.5; }, 'device');
    await wait();
    assertEqual(master.getAttribute('aria-valuenow'), '50', 'Master follows the store');
    assertEqual(container.querySelector('[aria-label="MASTER control"]'), master, 'same knob element');
  } finally {
    runtime.destroy();
    container.remove();
  }
});

it('mount: an empty store shows "--" and disabled knobs', async () => {
  const store = createStore(createEmptyDeviceState());
  const intents = createRuntimeIntents({ store, flags, sendParam: () => {} });
  const container = document.createElement('div');
  document.body.append(container);
  const runtime = mountRuntime(container, { store, intents });
  try {
    const knob = container.querySelector('[aria-label="GAIN control"]');
    assertEqual(knob.disabled, true, 'disabled');
    assertEqual(knob.querySelector('.center-value').textContent, '--', 'center text');
  } finally {
    runtime.destroy();
    container.remove();
  }
});

it('mount: the CONNECT button connects, and disconnects once the shell reports a connection', () => {
  const store = createStore(createEmptyDeviceState());
  const calls = [];
  const intents = createRuntimeIntents({
    store,
    flags,
    sendParam: () => {},
    onConnect: () => calls.push('connect'),
    onDisconnect: () => calls.push('disconnect')
  });
  const container = document.createElement('div');
  document.body.append(container);
  const runtime = mountRuntime(container, { store, intents });
  try {
    const button = container.querySelector('.strip-button');
    assertEqual(button.textContent, 'CONNECT', 'idle label');
    button.click();
    runtime.setConnection({ busy: true });
    assertEqual(button.disabled, true, 'disabled while connecting');
    runtime.setConnection({ kind: 'ble' });
    assertEqual(button.textContent, 'DISCONNECT', 'connected label');
    assertEqual(button.disabled, false, 'enabled when connected');
    runtime.setConnection({ kind: 'ble', version: '1.44.0.a' });
    assertEqual(button.textContent, 'FW 1.44.0.a', 'firmware version once activated');
    button.click();
    assertDeepEqual(calls, ['connect', 'disconnect'], 'intents');
  } finally {
    runtime.destroy();
    container.remove();
  }
});

it('mount: the open preset menu is painted above the amp card', async () => {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/src/ui/runtime/runtime.css';
  await new Promise((resolve, reject) => { css.onload = resolve; css.onerror = reject; document.head.append(css); });
  const store = createStore(await loadMock());
  const intents = createRuntimeIntents({ store, flags, sendParam: () => {} });
  const container = document.createElement('div');
  container.style.cssText = 'position: fixed; top: 0; left: 0; width: 390px; z-index: 1000;';
  document.body.append(container);
  const runtime = mountRuntime(container, { store, intents });
  try {
    container.querySelector('[aria-label="PRESETS actions"]').click();
    const option = container.querySelectorAll('.top-strip .unit-selector-option')[1];
    const box = option.getBoundingClientRect();
    const ampHead = container.querySelector('.amp-head').getBoundingClientRect();
    assertTrue(box.top >= ampHead.top && box.bottom <= ampHead.bottom, 'the option lies over the amp card');
    assertEqual(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2), option, 'topmost element at the option');
  } finally {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    runtime.destroy();
    container.remove();
    css.remove();
  }
});

it('layout: amp cabinets are in device index order (SpkSimType)', () => {
  assertEqual(RUNTIME_LAYOUT.cabinets[2], 'Brown 4x12', 'index 2');
  assertEqual(RUNTIME_LAYOUT.cabinets.length, 17, 'cabinet count');
});
