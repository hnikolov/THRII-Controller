import { it, assertEqual, assertDeepEqual, assertTrue } from '../support/assert.js';
import { encodeBitBucket7Padded, buildHeaderFrame } from '../../src/protocol/builders.js';
import { decodeBitBucket7THR, extractSysexFrames, parseIncomingThrFrame } from '../../src/protocol/frames.js';
import { thrOpcode } from '../../src/protocol/constants.js';
import { toHex } from '../../src/core/bytes.js';

it('bit-bucket decode inverts the encoder for values with the high bit set', () => {
  const raw = Uint8Array.from([0x00, 0x80, 0xff, 0x7f, 0x01, 0xa5, 0x5a, 0x10, 0x20]);
  const decoded = decodeBitBucket7THR(encodeBitBucket7Padded(raw), raw.length);
  assertEqual(toHex(decoded), toHex(raw), 'round trip');
});

it('extractSysexFrames splits concatenated frames', () => {
  const a = Uint8Array.of(0xf0, 0x01, 0xf7);
  const b = Uint8Array.of(0xf0, 0x02, 0x03, 0xf7);
  const joined = Uint8Array.from([...a, ...b]);
  const frames = extractSysexFrames(joined);
  assertEqual(frames.length, 2, 'frame count');
  assertEqual(toHex(frames[1]), 'f0 02 03 f7', 'second frame');
});

it('parseIncomingThrFrame reads the opcode and header of a built frame', () => {
  const frame = buildHeaderFrame({ opcode: thrOpcode.setParameter, followingBytes: 16, counter: 5, group: 0 });
  const parsed = parseIncomingThrFrame(frame, 'test');
  assertEqual(parsed.opcode, thrOpcode.setParameter, 'opcode');
  assertEqual(parsed.declaredLength, 16, 'declared length');
  assertEqual(parsed.header.counter, 5, 'counter');
  assertDeepEqual(parsed.warnings, [], 'no warnings');
  assertTrue(parsed.rawHex.startsWith('f0 00 01 0c'), 'raw hex');
});
