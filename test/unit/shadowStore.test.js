import { it, assertEqual, assertDeepEqual, assertTrue } from '../support/assert.js';
import { createStore } from '../../src/state/shadowStore.js';
import { buildShadowParameterIndex, getLatestShadowUnitById, readShadowParamByName } from '../../src/state/selectors.js';

const flushMicrotasks = () => Promise.resolve();

it('commit applies the mutation to the live state and returns its result', () => {
  const store = createStore({ units: {} });
  const result = store.commit(state => { state.units['1'] = { id: 1 }; return 'ok'; }, 'device');
  assertEqual(result, 'ok', 'commit return value');
  assertTrue(store.getState().units['1'] !== undefined, 'mutation visible');
});

it('subscribers are notified once per batch with the last source', async () => {
  const store = createStore({ n: 0 });
  const seen = [];
  store.subscribe((state, source) => seen.push({ n: state.n, source }));
  store.commit(s => { s.n += 1; }, 'device');
  store.commit(s => { s.n += 1; }, 'dump');
  await flushMicrotasks();
  assertDeepEqual(seen, [{ n: 2, source: 'dump' }], 'single batched notification');
});

it('unsubscribed listeners are not notified', async () => {
  const store = createStore({});
  let calls = 0;
  const unsubscribe = store.subscribe(() => { calls += 1; });
  unsubscribe();
  store.commit(() => {}, 'ui');
  await flushMicrotasks();
  assertEqual(calls, 0, 'calls after unsubscribe');
});

it('readShadowParamByName returns the most recently updated match', () => {
  const state = {
    units: {
      a: { id: 1, name: 'FX1', parameters: { 9: { id: 9, name: 'Level', updatedAtMs: 10, value: 0.1 } } },
      b: { id: 2, name: 'FX2', parameters: { 9: { id: 9, name: 'Level', updatedAtMs: 20, value: 0.2 } } }
    }
  };
  assertEqual(readShadowParamByName(state, 'Level').param.value, 0.2, 'newest Level');
  assertEqual(readShadowParamByName(state, 'Missing'), null, 'no match');
});

it('getLatestShadowUnitById picks the unit with the newest parameter update', () => {
  const state = {
    units: {
      a: { id: 5, name: 'Old', parameters: { 1: { updatedAtMs: 1 } } },
      b: { id: 5, name: 'New', parameters: { 1: { updatedAtMs: 9 } } }
    }
  };
  assertEqual(getLatestShadowUnitById(state, 5).name, 'New', 'newest unit');
});

it('buildShadowParameterIndex keys entries by unit:parameter', () => {
  const state = {
    units: { a: { id: 3, parameters: { 7: { id: 7, typeCode: 4, rawU32: 0x3f800000, value: 1 } } } }
  };
  const index = buildShadowParameterIndex(state);
  assertEqual(index.get('3:7').rawU32, 0x3f800000, 'indexed raw value');
});
