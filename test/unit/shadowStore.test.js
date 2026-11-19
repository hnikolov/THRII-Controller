import { it, assertEqual, assertDeepEqual, assertTrue } from '../support/assert.js';
import { createStore } from '../../src/state/shadowStore.js';
import { findUnitByName } from '../../src/state/selectors.js';

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

it('findUnitByName picks the unit with the newest parameter update', () => {
  const state = {
    units: {
      a: { id: 5, name: 'FX1', parameters: { 1: { updatedAtMs: 1 } } },
      b: { id: 6, name: 'FX1', parameters: { 1: { updatedAtMs: 9 } } }
    }
  };
  assertEqual(findUnitByName(state, 'FX1').id, 6, 'newest unit');
  assertEqual(findUnitByName(state, 'Missing'), null, 'no match');
});
