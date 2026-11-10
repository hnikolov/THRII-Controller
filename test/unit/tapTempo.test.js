import { it, assertEqual, assertDeepEqual, assertTrue } from '../support/assert.js';
import { loadInboundFrames } from '../support/transcripts.js';
import { createTapTimer, tapValue } from '../../src/ui/runtime/tapTempo.js';
import { RUNTIME_LAYOUT } from '../../src/ui/runtime/layout.js';
import { createRuntimeIntents } from '../../src/ui/runtime/intents.js';
import { mountRuntime } from '../../src/ui/runtime/mount.js';
import { createStore } from '../../src/state/shadowStore.js';
import { decodeIncomingEvent } from '../../src/protocol/incoming.js';
import { flags } from '../../src/core/flags.js';

const FX3 = 273;
const TIME = 237;
const echoTap = RUNTIME_LAYOUT.rows.map(row => row.module).find(module => module && module.key === 'echo').tap;

it('tap timer: the first tap gives no interval; later taps give the average of the run', () => {
  let t = 0;
  const timer = createTapTimer({ now: () => t });
  assertEqual(timer.tap(), null, 'first tap');
  t = 500;
  assertEqual(timer.tap(), 500, 'second tap');
  t = 1040;
  assertEqual(timer.tap(), 520, 'average of 500 and 540');
});

it('tap timer: only the last four taps count, and a pause over 2 s starts a new run', () => {
  let t = 0;
  const timer = createTapTimer({ now: () => t });
  [0, 900, 1400, 1900, 2400].forEach(at => { t = at; timer.tap(); });
  t = 2900;
  assertEqual(timer.tap(), 500, 'the 900 ms interval has dropped out');
  t = 6000;
  assertEqual(timer.tap(), null, 'new run after the pause');
});

it('tap value: the echo time is interval / 1000 ms, capped at 1', () => {
  assertEqual(tapValue(250, echoTap.fullScaleMs), 0.25, '240 BPM');
  assertEqual(tapValue(500, echoTap.fullScaleMs), 0.5, '120 BPM');
  assertEqual(tapValue(1000, echoTap.fullScaleMs), 1, '60 BPM');
  assertEqual(tapValue(1500, echoTap.fullScaleMs), 1, 'slower than full scale');
});

// The amp's own TAP button, tapped by hand at about the tempo in the file name.
it('tap value: matches what the amp reports for its own TAP button (FX3.Time in the captures)', async () => {
  for (const [file, bpm] of [['tap_tempo_60_(100).txt', 60], ['tap_tempo_120_(50).txt', 120], ['tap_tempo_240_(25).txt', 240]]) {
    const events = (await loadInboundFrames('/test/fixtures/transcripts/' + file)).map(decodeIncomingEvent).filter(Boolean);
    const changes = events.filter(event => event.kind === 'parameter_change');
    assertTrue(changes.length > 5, file + ' has parameter changes');
    assertTrue(changes.every(event => event.unitId === FX3 && event.paramId === TIME), file + ' reports only FX3.Time');
    const values = changes.map(event => event.value).sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)];
    assertTrue(Math.abs(median - tapValue(60000 / bpm, echoTap.fullScaleMs)) < 0.05, `${file}: median ${median}`);
  }
});

it('mount: two taps 500 ms apart set the echo time to 0.5 through the knob intent', async () => {
  const store = createStore(await (await fetch('/test/fixtures/mockState.json')).json());
  const sent = [];
  const before = flags.coalesceWrites;
  flags.coalesceWrites = false;
  const intents = createRuntimeIntents({ store, flags, sendParam: (unitId, paramId, value) => sent.push([unitId, paramId, value]) });
  const container = document.createElement('div');
  document.body.append(container);
  const runtime = mountRuntime(container, { store, intents });
  const realNow = performance.now;
  let t = 1000;
  performance.now = () => t;
  try {
    const tap = container.querySelector('[aria-label="ECHO tap tempo"]');
    assertEqual(tap.disabled, false, 'enabled while the echo time is known');
    tap.dispatchEvent(new PointerEvent('pointerdown'));
    assertDeepEqual(sent, [], 'the first tap sends nothing');
    t = 1500;
    tap.dispatchEvent(new PointerEvent('pointerdown'));
    assertDeepEqual(sent, [[FX3, TIME, 0.5]], 'write');
    assertEqual(store.getState().units[FX3].parameters[TIME].value, 0.5, 'store value');
    assertEqual(store.getState().modified, true, 'memory marked as modified');
  } finally {
    performance.now = realNow;
    flags.coalesceWrites = before;
    runtime.destroy();
    container.remove();
  }
});
