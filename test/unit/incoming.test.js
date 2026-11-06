import { it, assertEqual, assertDeepEqual, assertTrue } from '../support/assert.js';
import { parseSysExHex } from '../../src/core/bytes.js';
import { decodeIncomingEvent, decodeIncomingChunk } from '../../src/protocol/incoming.js';

// Lines of a captured log that carry one inbound frame, for example "[8:15:08 PM] RX USB raw: f0 ...".
async function loadInboundFrames(path) {
  const text = await (await fetch(path)).text();
  return text
    .split('\n')
    .filter(line => line.includes('RX USB raw: '))
    .map(line => parseSysExHex(line.split('RX USB raw: ')[1]));
}

const close = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

it('master knob turns decode to parameter_change for Amp.Master (unit 268, param 76)', async () => {
  const frames = await loadInboundFrames('/test/fixtures/transcripts/master_knob.txt');
  const changes = frames.map(decodeIncomingEvent).filter(e => e && e.kind === 'parameter_change');
  assertEqual(changes.length, 6, 'six Master changes in the capture');
  changes.forEach(c => {
    assertEqual(c.unitId, 268, 'unit Amp (0x10c)');
    assertEqual(c.paramId, 76, 'param Master (0x4c)');
    assertEqual(c.typeCode, 4, 'float32');
  });
  const expected = [0.8745, 0.9059, 0.9098, 0.9451, 0.9490, 0.9647];
  expected.forEach((value, i) => assertTrue(close(changes[i].value, value), `value ${i}: ${changes[i].value}`));
});

it('status frames (opcode 06) decode to status and carry no state change', async () => {
  const frames = await loadInboundFrames('/test/fixtures/transcripts/master_knob.txt');
  const statuses = frames.map(decodeIncomingEvent).filter(e => e && e.kind === 'status');
  assertTrue(statuses.length > 0, 'status frames present');
});

it('unit type change (opcode 03) decodes to the unit id and type symbol: amp switched to THR30_SR101 on the amp', async () => {
  const frames = await loadInboundFrames('/test/fixtures/transcripts/select_modern_amp_crunch.txt');
  const changes = frames.map(decodeIncomingEvent).filter(e => e && e.kind === 'unit_type_change');
  assertEqual(changes.length, 1, 'one unit type change');
  assertEqual(changes[0].unitId, 0x10c, 'Amp unit');
  assertEqual(changes[0].typeKey, 0xa3, 'THR30_SR101 symbol');
});

it('slot press notification decodes to settings_notification with slot word 1 (memory 2 = slot 1)', async () => {
  const frames = await loadInboundFrames('/test/fixtures/transcripts/slot_press.txt');
  const first = decodeIncomingEvent(frames[0]);
  assertEqual(first.kind, 'settings_notification', 'kind');
  assertEqual(first.slot, 1, '0-based slot word (button 2)');
  assertEqual(first.code, 0, 'direction code 0 on a press');
});

it('ACKs to commands (declared length 4) decode as ack with the echoed counter', async () => {
  const frames = await loadInboundFrames('/test/fixtures/transcripts/activation_req_resp.txt');
  const ack = decodeIncomingEvent(frames[2]);
  assertEqual(ack.kind, 'ack', 'kind');
  assertEqual(ack.counter, 0, 'counter of activation frame 2');
  const ack2 = decodeIncomingEvent(frames[3]);
  assertEqual(ack2.counter, 1, 'counter of activation frame 3');
});

it('global parameter frames after a slot press use unit 0xffffffff', async () => {
  const frames = await loadInboundFrames('/test/fixtures/transcripts/slot_press.txt');
  const output = decodeIncomingEvent(frames[1]);
  assertEqual(output.kind, 'parameter_change', 'kind');
  assertEqual(output.unitId, 4294967295, 'Global unit');
  assertEqual(output.paramId, 336, 'GuitProcOutputGain (0x150)');
  assertEqual(output.value, 1, 'value 1.0');
  const input = decodeIncomingEvent(frames[2]);
  assertEqual(input.paramId, 333, 'GuitProcInputGain (0x14d)');
});

it('answer to "have user settings changed?" decodes its single payload byte (1 = changed)', () => {
  const frame = parseSysExHex('f0 00 01 0c 24 01 4d 00 12 00 00 08 00 01 00 00 00 01 00 00 00 00 01 00 00 00 00 00 f7');
  const event = decodeIncomingEvent(frame);
  assertEqual(event.kind, 'answer', 'kind');
  assertEqual(event.value, 1, 'changed');
});

it('dump data (group 1) is not decoded here', async () => {
  const frames = await loadInboundFrames('/test/fixtures/transcripts/actual_dump.txt');
  const dumpFrames = frames.filter(f => f[7] === 0x01);
  assertTrue(dumpFrames.length > 0, 'dump frames present');
  dumpFrames.forEach(f => assertEqual(decodeIncomingEvent(f), null, 'no event for dump chunk'));
});

it('decodeIncomingChunk splits a chunk that holds two frames', async () => {
  const frames = await loadInboundFrames('/test/fixtures/transcripts/master_knob.txt');
  const joined = Uint8Array.from([...frames[0], ...frames[1]]);
  const events = decodeIncomingChunk(joined);
  assertDeepEqual(events.map(e => e.kind), decodeIncomingChunk(frames[0]).concat(decodeIncomingChunk(frames[1])).map(e => e.kind), 'both frames decoded');
});
