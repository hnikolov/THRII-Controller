import { it, assertEqual } from '../support/assert.js';
import { concatBytes, parseSysExHex, toHex, writeF32LE, writeU32LE } from '../../src/core/bytes.js';
import { clamp01, normalizeOnOff } from '../../src/core/values.js';

it('writeU32LE writes little-endian bytes', () => {
  assertEqual(toHex(writeU32LE(0x12345678)), '78 56 34 12', 'u32 bytes');
});

it('writeF32LE encodes 1.0 as IEEE-754 little-endian', () => {
  assertEqual(toHex(writeF32LE(1)), '00 00 80 3f', 'f32 bytes');
});

it('parseSysExHex is the inverse of toHex', () => {
  const hex = 'f0 00 01 0c f7';
  assertEqual(toHex(parseSysExHex(hex)), hex, 'round trip');
});

it('concatBytes joins parts in order', () => {
  assertEqual(toHex(concatBytes(Uint8Array.of(1), Uint8Array.of(2, 3))), '01 02 03', 'concat');
});

it('clamp01 clamps and maps non-finite values to 0', () => {
  assertEqual(clamp01(-1), 0, 'low');
  assertEqual(clamp01(2), 1, 'high');
  assertEqual(clamp01('abc'), 0, 'NaN');
});

it('normalizeOnOff maps booleans and numbers, rejects others', () => {
  assertEqual(normalizeOnOff(true), true, 'bool');
  assertEqual(normalizeOnOff(0.5), true, 'threshold');
  assertEqual(normalizeOnOff(0.49), false, 'below threshold');
  assertEqual(normalizeOnOff('on'), null, 'string');
});
