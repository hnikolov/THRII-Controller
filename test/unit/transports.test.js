import { it, assertEqual, assertDeepEqual, assertTrue } from '../support/assert.js';
import { createTransportManager } from '../../src/transports/transportManager.js';
import { toHex, parseSysExHex } from '../../src/core/bytes.js';
import { createBleSysExInput } from '../../src/transports/bleTransport.js';
import { parseIdentityReply } from '../../src/protocol/identity.js';

it('BLE input: the identity reply is recovered from its packet (header and timestamps removed)', () => {
  const out = [];
  const receive = createBleSysExInput(frame => out.push(frame));
  receive(parseSysExHex('80 80 f0 7e 7f 06 02 00 01 0c 24 00 01 00 61 00 2c 01 80 f7'));
  assertEqual(out.length, 1, 'one message');
  assertEqual(toHex(out[0]), 'f0 7e 7f 06 02 00 01 0c 24 00 01 00 61 00 2c 01 f7', 'clean SysEx');
  assertTrue(parseIdentityReply(out[0]) !== null, 'identity parses');
});

it('BLE input: a SysEx split over two packets is reassembled', () => {
  const out = [];
  const receive = createBleSysExInput(frame => out.push(frame));
  receive(parseSysExHex('80 80 f0 7e 7f 06 02 00 01'));
  assertEqual(out.length, 0, 'not complete yet');
  receive(parseSysExHex('80 0c 24 00 01 00 61 00 2c 01 80 f7'));
  assertEqual(out.length, 1, 'one message after the last packet');
  assertEqual(out[0].length, 17, 'full identity reply');
});

it('BLE input: bytes outside a SysEx are ignored', () => {
  const out = [];
  const receive = createBleSysExInput(frame => out.push(frame));
  receive(parseSysExHex('90 3c 7f 80 80 f0 00 01 f7'));
  assertEqual(out.length, 1, 'only the SysEx');
  assertEqual(toHex(out[0]), 'f0 00 01 f7', 'SysEx bytes only');
});


function fakeMidi() {
  const order = [];
  const sent = [];
  const listeners = {};
  const output = {
    name: 'THR Out',
    send(arr) { order.push('send'); sent.push(arr); }
  };
  const input = {
    name: 'THR In',
    addEventListener(type, fn) { listeners[type] = fn; },
    removeEventListener(type) { delete listeners[type]; }
  };
  return {
    order,
    sent,
    access: {
      outputs: new Map([['o', output]]),
      inputs: new Map([['i', input]]),
      addEventListener() {},
      removeEventListener() {}
    },
    deliver: data => listeners.midimessage({ data }),
    listenerCount: () => Object.keys(listeners).length
  };
}

function fakeBleCharacteristic() {
  const packets = [];
  const listeners = {};
  return {
    packets,
    listeners,
    async startNotifications() {},
    addEventListener(type, fn) { listeners[type] = fn; },
    removeEventListener(type) { delete listeners[type]; },
    async writeValueWithoutResponse(packet) { packets.push(packet); }
  };
}

it('raw:out is emitted before the USB write', async () => {
  const transports = createTransportManager();
  const midi = fakeMidi();
  transports.usb.attach(midi.access);
  transports.bus.on('raw:out', () => midi.order.push('emit'));
  await transports.send(Uint8Array.of(0xf0, 0xf7), 'test');
  assertDeepEqual(midi.order, ['emit', 'send'], 'event before write');
  assertEqual(toHex(midi.sent[0]), 'f0 f7', 'bytes written');
});

it('inbound USB bytes are emitted as raw:in with source USB', () => {
  const transports = createTransportManager();
  const midi = fakeMidi();
  transports.usb.attach(midi.access);
  let received = null;
  transports.bus.on('raw:in', payload => { received = payload; });
  midi.deliver(Uint8Array.of(0xf0, 0x01, 0xf7).buffer);
  assertEqual(received.source, 'USB', 'source');
  assertEqual(toHex(received.bytes), 'f0 01 f7', 'bytes');
});

it('send without a connection emits raw:out and then throws', async () => {
  const transports = createTransportManager();
  let emitted = 0;
  transports.bus.on('raw:out', () => { emitted += 1; });
  let threw = false;
  try {
    await transports.send(Uint8Array.of(0xf0, 0xf7), 'test');
  } catch (err) {
    threw = true;
  }
  assertTrue(threw, 'send rejects');
  assertEqual(emitted, 1, 'raw:out emitted');
});

it('detach removes the USB listener', () => {
  const transports = createTransportManager();
  const midi = fakeMidi();
  transports.usb.attach(midi.access);
  transports.usb.detach();
  assertEqual(midi.listenerCount(), 0, 'listeners after detach');
  assertEqual(transports.isConnected(), false, 'disconnected');
});

it('BLE single-packet SysEx is [hdr][ts][F0 ..][ts][F7]', async () => {
  const transports = createTransportManager();
  const char = fakeBleCharacteristic();
  transports.ble.setCharacteristic(char);
  await transports.send(Uint8Array.of(0xf0, 0x01, 0xf7), 'test');
  assertEqual(char.packets.length, 1, 'packet count');
  assertEqual(toHex(char.packets[0]), '80 80 f0 01 80 f7', 'packet bytes');
});

it('BLE multi-packet SysEx stays within 20 bytes and reassembles exactly', async () => {
  const transports = createTransportManager();
  const char = fakeBleCharacteristic();
  transports.ble.setCharacteristic(char);
  const frame = Uint8Array.from([0xf0, ...Array.from({ length: 48 }, (_, i) => i & 0x7f), 0xf7]);
  await transports.send(frame, 'test');
  assertTrue(char.packets.length > 1, 'split into several packets');
  char.packets.forEach(p => assertTrue(p.length <= 20, 'packet <= 20 bytes'));
  char.packets.forEach(p => assertTrue((p[0] & 0x80) !== 0, 'header bit set'));

  const first = char.packets[0];
  assertEqual(first[2], 0xf0, 'first packet starts the SysEx after ts');
  const last = char.packets[char.packets.length - 1];
  assertEqual(last[last.length - 1], 0xf7, 'last packet ends with F7');
  assertTrue((last[last.length - 2] & 0x80) !== 0, 'timestamp before F7');

  const rebuilt = [];
  char.packets.forEach((p, i) => {
    const start = i === 0 ? 2 : 1;
    const end = i === char.packets.length - 1 ? p.length - 2 : p.length;
    rebuilt.push(...p.slice(start, end));
  });
  rebuilt.push(0xf7);
  assertDeepEqual(rebuilt, Array.from(frame), 'payload round trip');
});

it('BLE send rejects a frame that does not end in F7', async () => {
  const transports = createTransportManager();
  transports.ble.setCharacteristic(fakeBleCharacteristic());
  let rejected = false;
  try {
    await transports.send(Uint8Array.of(0xf0, 0x01), 'test');
  } catch (err) {
    rejected = true;
  }
  assertTrue(rejected, 'send rejects');
});

it('connectUsb attaches the first output and input; disconnect detaches them', async () => {
  const original = navigator.requestMIDIAccess;
  const midi = fakeMidi();
  navigator.requestMIDIAccess = async () => midi.access;
  try {
    const transports = createTransportManager();
    const result = await transports.connectUsb();
    assertTrue(result.connected, 'connected');
    assertTrue(transports.isConnected(), 'isConnected after connect');
    transports.disconnect();
    assertEqual(midi.listenerCount(), 0, 'listener removed on disconnect');
    assertEqual(transports.isConnected(), false, 'disconnected');
  } finally {
    navigator.requestMIDIAccess = original;
  }
});

it('BLE send uses a larger packet size when the browser reports one', async () => {
  const transports = createTransportManager();
  const char = fakeBleCharacteristic();
  transports.ble.setCharacteristic(char);
  transports.ble.setMaxPacketBytes(100);
  const frame = Uint8Array.from([0xf0, ...Array.from({ length: 248 }, (_, i) => i & 0x7f), 0xf7]);
  await transports.send(frame, 'test');
  assertEqual(char.packets.length, 3, 'packet count at 100 bytes');
  char.packets.forEach(p => assertTrue(p.length <= 100, 'packet <= 100 bytes'));
  const rebuilt = [];
  char.packets.forEach((p, i) => {
    const start = i === 0 ? 2 : 1;
    const end = i === char.packets.length - 1 ? p.length - 2 : p.length;
    rebuilt.push(...p.slice(start, end));
  });
  rebuilt.push(0xf7);
  assertDeepEqual(rebuilt, Array.from(frame), 'payload round trip at 100 bytes');
});

it('BLE keeps the 20-byte default when the reported size is missing or not larger', async () => {
  for (const reported of [undefined, null, 10, 20, 'abc']) {
    const transports = createTransportManager();
    const char = fakeBleCharacteristic();
    transports.ble.setCharacteristic(char);
    transports.ble.setMaxPacketBytes(reported);
    await transports.send(new Uint8Array(60).fill(0x11).map((v, i) => (i === 0 ? 0xf0 : i === 59 ? 0xf7 : v)), 'test');
    char.packets.forEach(p => assertTrue(p.length <= 20, 'packet <= 20 bytes for ' + String(reported)));
  }
});

it('BLE packet size switch off forces 20-byte packets even when the browser reports more', async () => {
  const transports = createTransportManager({ useReportedPacketSize: false });
  const char = fakeBleCharacteristic();
  transports.ble.setCharacteristic(char);
  transports.ble.setMaxPacketBytes(100);
  await transports.send(Uint8Array.from([0xf0, ...Array.from({ length: 60 }, (_, i) => i & 0x7f), 0xf7]), 'test');
  assertTrue(char.packets.length > 1, 'split into several packets');
  char.packets.forEach(p => assertTrue(p.length <= 20, 'packet <= 20 bytes'));
});

it('BLE notifications are emitted as raw:in with source BLE', async () => {
  const transports = createTransportManager();
  const char = fakeBleCharacteristic();
  transports.ble.setCharacteristic(char);
  await transports.ble.enableNotifications();
  let received = null;
  transports.bus.on('raw:in', payload => { received = payload; });
  char.listeners.characteristicvaluechanged({ target: { value: { buffer: Uint8Array.of(0x80, 0x80, 0xf0, 0x01, 0x80, 0xf7).buffer } } });
  assertEqual(received.source, 'BLE', 'source');
  assertEqual(toHex(received.bytes), 'f0 01 f7', 'framing removed, SysEx kept');
});
