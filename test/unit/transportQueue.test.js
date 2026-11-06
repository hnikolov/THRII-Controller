import { it, assertEqual, assertDeepEqual, assertTrue } from '../support/assert.js';
import { createTransportManager } from '../../src/transports/transportManager.js';
import { createBleSysExInput } from '../../src/transports/bleTransport.js';
import { sleep } from '../../src/core/bytes.js';
import { nextCommandCounter } from '../../src/protocol/counter.js';

// A BLE characteristic that takes time per write (like a real radio), records each packet with its time,
// and can be told to fail once.
function slowBleCharacteristic({ failFirst = false } = {}) {
  const packets = [];
  let failNext = failFirst;
  return {
    packets,
    async startNotifications() {},
    addEventListener() {},
    removeEventListener() {},
    async writeValueWithoutResponse(packet) {
      await sleep(2);
      if (failNext) {
        failNext = false;
        throw new Error('write failed (test)');
      }
      packets.push({ bytes: Uint8Array.from(packet), at: Date.now() });
    }
  };
}

function frame(fill, length) {
  return Uint8Array.from([0xf0, ...Array.from({ length }, (_, i) => fill + (i & 0x0f)), 0xf7]);
}

it('queue: frames sent without waiting for each other reach the amp whole and in order', async () => {
  const transports = createTransportManager({ bleFrameGapMs: 0 });
  const char = slowBleCharacteristic();
  transports.ble.setCharacteristic(char);
  const a = frame(0x10, 40);
  const b = frame(0x40, 40);
  await Promise.all([transports.send(a, 'A'), transports.send(b, 'B'), transports.send(a, 'A2')]);

  const received = [];
  const receive = createBleSysExInput(message => received.push(Array.from(message)));
  char.packets.forEach(p => receive(p.bytes));
  assertDeepEqual(received, [Array.from(a), Array.from(b), Array.from(a)], 'three whole SysEx messages');
});

it('queue: consecutive BLE frames keep the gap (50 ms by default)', async () => {
  const transports = createTransportManager();
  const char = slowBleCharacteristic();
  transports.ble.setCharacteristic(char);
  await transports.send(frame(0x10, 10), 'A');
  await transports.send(frame(0x20, 10), 'B');
  assertEqual(char.packets.length, 2, 'one packet per frame');
  const gap = char.packets[1].at - char.packets[0].at;
  assertTrue(gap >= 45, `gap between frames is ${gap} ms`);
});

it('queue: a failed write rejects its own send and the next frame is still written', async () => {
  const transports = createTransportManager({ bleFrameGapMs: 0 });
  const char = slowBleCharacteristic({ failFirst: true });
  transports.ble.setCharacteristic(char);
  let failed = false;
  try {
    await transports.send(frame(0x10, 10), 'A');
  } catch (err) {
    failed = true;
  }
  assertEqual(failed, true, 'the first send rejects');
  await transports.send(frame(0x20, 10), 'B');
  const received = [];
  const receive = createBleSysExInput(message => received.push(Array.from(message)));
  char.packets.forEach(p => receive(p.bytes));
  assertDeepEqual(received, [Array.from(frame(0x20, 10))], 'the second frame arrives whole');
});

it('counter: never sends 0x7f, and restarts at 3 after 0x7e (the amp goes silent on 0x7f followed by 0x00)', () => {
  const seen = [];
  for (let i = 0; i < 400; i += 1) seen.push(nextCommandCounter());
  assertTrue(seen.every(c => c !== 0x7f), 'no 0x7f');
  assertTrue(seen.every(c => c >= 3 && c <= 0x7e), 'values stay in 3..0x7e');
  seen.forEach((c, i) => {
    if (c === 0x7e) assertEqual(seen[i + 1], 3, 'restart at 3 after 0x7e');
  });
});
