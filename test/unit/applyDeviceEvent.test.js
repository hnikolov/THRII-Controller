import { it, assertEqual, assertTrue } from '../support/assert.js';
import { createStore } from '../../src/state/shadowStore.js';
import { applyDeviceEvent } from '../../src/state/applyDeviceEvent.js';
import { makeNameOf } from '../../src/protocol/symbolTable.js';

const loadMock = async () => (await fetch('/test/fixtures/mockState.json')).json();

it('a live knob event matches the dump parameter by name when the ids differ', () => {
  // The dump names Master as MasterState (83); the knob reports it as Master (76) in the same unit.
  const store = createStore({ units: { 268: { id: 268, name: 'Amp', parameters: { 83: { id: 83, name: 'MasterState', typeCode: 4, rawU32: 0, value: 0.1 } } } }, activeSlot: null });
  const nameOf = makeNameOf({ '76': 'Master', '83': 'MasterState' });
  const applied = applyDeviceEvent(store, { kind: 'parameter_change', unitId: 268, paramId: 76, typeCode: 4, rawU32: 7, value: 0.8 }, nameOf);
  assertTrue(applied, 'applied');
  assertEqual(store.getState().units['268'].parameters['83'].value, 0.8, 'MasterState updated');
});

it('a device parameter change updates the store with source device', async () => {
  const store = createStore(await loadMock());
  const sources = [];
  store.subscribe((_, source) => sources.push(source));
  const applied = applyDeviceEvent(store, { kind: 'parameter_change', unitId: 268, paramId: 76, typeCode: 4, rawU32: 0, value: 0.9647 });
  assertTrue(applied, 'applied');
  assertEqual(store.getState().units['268'].parameters['76'].value, 0.9647, 'Master updated');
  await new Promise(resolve => setTimeout(resolve, 0));
  assertEqual(sources[0], 'device', 'commit source');
});

it('a device parameter change marks the store modified', async () => {
  const store = createStore(await loadMock());
  assertTrue(!store.getState().modified, 'not modified at start');
  applyDeviceEvent(store, { kind: 'parameter_change', unitId: 268, paramId: 76, typeCode: 4, rawU32: 0, value: 0.5 });
  assertEqual(store.getState().modified, true, 'modified after an amp change');
});

it('a bool parameter reads as on for a non-zero word, whatever type the event carries', async () => {
  const store = createStore({ units: { 316: { id: 316, name: 'GuitarProc', parameters: { 280: { id: 280, name: 'FX1EnableState', typeCode: 3, decodedKind: 'bool', rawU32: 0, value: false } } } }, activeSlot: null });
  applyDeviceEvent(store, { kind: 'parameter_change', unitId: 316, paramId: 280, typeCode: 4, rawU32: 0x3f800000, value: 1 });
  assertEqual(store.getState().units['316'].parameters['280'].value, true, 'on from a float 1.0 word');
  applyDeviceEvent(store, { kind: 'parameter_change', unitId: 316, paramId: 280, typeCode: 4, rawU32: 0, value: 0 });
  assertEqual(store.getState().units['316'].parameters['280'].value, false, 'off from zero');
});

it('a unit type change renames the unit type in the store (name from the symbol table)', async () => {
  const store = createStore(await loadMock());
  const nameOf = makeNameOf({ '163': 'THR30_SR101' });
  const applied = applyDeviceEvent(store, { kind: 'unit_type_change', unitId: 268, typeKey: 163 }, nameOf);
  assertTrue(applied, 'applied');
  assertEqual(store.getState().units['268'].typeName, 'THR30_SR101', 'Amp model');
  assertEqual(store.getState().units['268'].typeKey, 163, 'Amp type key');
});

it('a unit type change for a unit not in the store is ignored', async () => {
  const store = createStore(await loadMock());
  assertEqual(applyDeviceEvent(store, { kind: 'unit_type_change', unitId: 999, typeKey: 1 }), false, 'ignored');
});

it('a parameter the store does not know is added from its symbol name (after a type switch)', async () => {
  const store = createStore({ units: { 270: { id: 270, name: 'FX2', typeName: 'StereoSquareChorus', parameters: {} } }, activeSlot: null });
  const nameOf = makeNameOf({ '212': 'Speed' });
  const applied = applyDeviceEvent(store, { kind: 'parameter_change', unitId: 270, paramId: 212, typeCode: 4, rawU32: 0x3f000000, value: 0.5 }, nameOf);
  assertTrue(applied, 'applied');
  const param = store.getState().units['270'].parameters['212'];
  assertEqual(param.name, 'Speed', 'named from the symbol table');
  assertEqual(param.value, 0.5, 'value');
  assertEqual(param.typeCode, 4, 'event type kept for a new parameter');
});

it('a bool parameter keeps its stored type code when a live event carries a float', async () => {
  const store = createStore({ units: { 316: { id: 316, name: 'GuitarProc', parameters: { 280: { id: 280, name: 'FX1EnableState', typeCode: 3, decodedKind: 'bool', rawU32: 0, value: false } } } }, activeSlot: null });
  applyDeviceEvent(store, { kind: 'parameter_change', unitId: 316, paramId: 280, typeCode: 4, rawU32: 1, value: 1 });
  assertEqual(store.getState().units['316'].parameters['280'].typeCode, 3, 'stored bool type kept for writes');
});

it('a type switch on an effect unit drops the old type parameters; the new ones come from the amp', async () => {
  const store = createStore({ units: { 270: { id: 270, name: 'FX2', typeName: 'StereoSquareChorus', parameters: { 228: { id: 228, name: 'Freq', typeCode: 4, decodedKind: 'number', rawU32: 0, value: 0.5 } } } }, activeSlot: null });
  applyDeviceEvent(store, { kind: 'unit_type_change', unitId: 270, typeKey: 212 }, makeNameOf({ '212': 'Phaser' }));
  assertEqual(Object.keys(store.getState().units['270'].parameters).length, 0, 'old parameters dropped');
  assertEqual(store.getState().units['270'].typeName, 'Phaser', 'new type');
  applyDeviceEvent(store, { kind: 'parameter_change', unitId: 270, paramId: 212, typeCode: 4, rawU32: 0, value: 0.3 }, makeNameOf({ '212': 'Speed' }));
  assertEqual(store.getState().units['270'].parameters['212'].name, 'Speed', 'Speed comes from the amp');
});

it('a parameter change for an unknown parameter is ignored', async () => {
  const store = createStore(await loadMock());
  const applied = applyDeviceEvent(store, { kind: 'parameter_change', unitId: 268, paramId: 999, typeCode: 4, rawU32: 0, value: 0.5 });
  assertEqual(applied, false, 'not applied');
});

it('a slot notification sets activeSlot to 1..5 (0-based word + 1)', async () => {
  const store = createStore(await loadMock());
  applyDeviceEvent(store, { kind: 'settings_notification', slot: 2, code: 0 });
  assertEqual(store.getState().activeSlot, 3, 'slot 3');
});

it('a slot notification outside 0..4 is ignored', async () => {
  const store = createStore(await loadMock());
  assertEqual(applyDeviceEvent(store, { kind: 'settings_notification', slot: 7, code: 0 }), false, 'rejected');
  assertEqual(store.getState().activeSlot, null, 'unchanged');
});

it('echo guard: applying device events never schedules a write', async () => {
  const store = createStore(await loadMock());
  const scheduled = [];
  const scheduler = { request: key => scheduled.push(key), flushAll: () => {} };
  applyDeviceEvent(store, { kind: 'parameter_change', unitId: 268, paramId: 76, typeCode: 4, rawU32: 0, value: 0.5 });
  applyDeviceEvent(store, { kind: 'settings_notification', slot: 1, code: 0 });
  assertEqual(scheduled.length, 0, 'scheduler untouched by device events');
  assertTrue(typeof scheduler.request === 'function', 'scheduler still available for ui writes');
});
