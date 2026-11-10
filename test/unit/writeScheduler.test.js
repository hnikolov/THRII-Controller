import { it, assertEqual, assertDeepEqual, assertTrue } from '../support/assert.js';
import { createFakeClock } from '../support/fakeClock.js';
import { createWriteScheduler } from '../../src/protocol/writeScheduler.js';
import { flags } from '../../src/core/flags.js';

function setup(overrides = {}) {
  const clock = createFakeClock();
  const store = { value: 0 };
  const emitted = [];
  const scheduler = createWriteScheduler({
    quietMs: 40,
    maxMs: 120,
    clock,
    readValue: () => store.value,
    emitWrite: (key, value) => emitted.push({ at: clock.now(), key, value }),
    ...overrides
  });
  return { clock, store, emitted, scheduler };
}

it('flags: coalesceWrites (burst protection) and autoActivate (H6) are on; slotSync stays off', () => {
  assertEqual(flags.coalesceWrites, true, 'coalesceWrites');
  assertEqual(flags.autoActivate, true, 'autoActivate');
  assertEqual(flags.slotSync, false, 'slotSync');
});

it('a burst that settles emits once with the last value, after the quiet window', () => {
  const { clock, store, emitted, scheduler } = setup();
  for (let v = 1; v <= 5; v += 1) {
    store.value = v;
    scheduler.request('amp:gain');
    clock.advance(10);
  }
  // Last request at t=40 (clock is now t=50); quiet window ends at t=80.
  clock.advance(29);
  assertEqual(emitted.length, 0, 'no emit before the quiet window ends');
  clock.advance(1);
  assertDeepEqual(emitted.map(e => [e.key, e.value]), [['amp:gain', 5]], 'one emit with last value');
  assertEqual(emitted[0].at, 80, 'emit time');
});

it('a continuous stream is forced out at maxMs from the burst start', () => {
  const { clock, store, emitted, scheduler } = setup();
  for (let v = 1; v <= 40; v += 1) {
    store.value = v;
    scheduler.request('amp:gain');
    clock.advance(10);
  }
  // Requests every 10 ms never let the quiet window expire; the max interval forces writes.
  assertTrue(emitted.length >= 3, 'several forced writes during a 400 ms stream');
  for (let i = 1; i < emitted.length; i += 1) {
    assertTrue(emitted[i].at - emitted[i - 1].at <= 120, 'writes at most maxMs apart');
    assertTrue(emitted[i].value > emitted[i - 1].value, 'values increase (last write wins)');
  }
});

it('the value is read from the store at flush time, not at request time', () => {
  const { clock, store, emitted, scheduler } = setup();
  store.value = 1;
  scheduler.request('k');
  store.value = 9;
  clock.advance(40);
  assertDeepEqual(emitted.map(e => e.value), [9], 'flush reads the current store value');
});

it('flushAll emits every pending key now and leaves no timers behind', () => {
  const { clock, store, emitted, scheduler } = setup();
  store.value = 3;
  scheduler.request('a');
  scheduler.request('b');
  scheduler.flushAll();
  assertDeepEqual(emitted.map(e => e.key).sort(), ['a', 'b'], 'both keys emitted');
  assertEqual(scheduler.pendingKeys().length, 0, 'nothing pending');
  clock.advance(500);
  assertEqual(emitted.length, 2, 'no duplicate emits from old timers');
  assertEqual(clock.pendingCount(), 0, 'no timers left');
});

it('flushAll runs before a non-coalesced command, so the write goes out first', () => {
  const order = [];
  const { store, scheduler } = setup({ emitWrite: () => order.push('write') });
  store.value = 1;
  scheduler.request('amp:gain');
  scheduler.flushAll();
  order.push('dump request');
  assertDeepEqual(order, ['write', 'dump request'], 'write precedes the dump request');
});

it('flushKey emits only that key; other keys keep waiting', () => {
  const { clock, store, emitted, scheduler } = setup();
  store.value = 2;
  scheduler.request('a');
  scheduler.request('b');
  scheduler.flushKey('a');
  assertDeepEqual(emitted.map(e => e.key), ['a'], 'only a emitted');
  assertDeepEqual(scheduler.pendingKeys(), ['b'], 'b still pending');
  clock.advance(40);
  assertDeepEqual(emitted.map(e => e.key), ['a', 'b'], 'b emitted at its quiet window');
});

it('a new request after a flush starts a new burst', () => {
  const { clock, store, emitted, scheduler } = setup();
  store.value = 1;
  scheduler.request('k');
  clock.advance(40);
  store.value = 2;
  scheduler.request('k');
  clock.advance(40);
  assertDeepEqual(emitted.map(e => e.value), [1, 2], 'two bursts, two writes');
});
