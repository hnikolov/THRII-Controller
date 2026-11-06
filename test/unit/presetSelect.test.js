import { it, assertDeepEqual, assertEqual } from '../support/assert.js';
import { parseSysExHex } from '../../src/core/bytes.js';
import { decodeBitBucket7THR } from '../../src/protocol/frames.js';
import { buildSelectPreset } from '../../src/protocol/builders.js';
import { setDeviceIdentity } from '../../src/protocol/identity.js';

// The legacy Preset button frame (thrii_ctrl.html sendPreset) for slot index 2 decodes to these words.
const LEGACY_PRESET_2_HEX = 'f000010c24014d0108000e0b000e0000000400000000 02 0000000000f7';

function payloadWords(frame) {
  const raw = decodeBitBucket7THR(frame.slice(12, frame.length - 1), 16);
  const words = [];
  for (let i = 0; i < 12; i += 4) {
    words.push((raw[i] | (raw[i + 1] << 8) | (raw[i + 2] << 16) | (raw[i + 3] << 24)) >>> 0);
  }
  return words;
}

it('preset select: the words match the legacy Preset frame (opcode 0x0e, fixed 4, slot index)', () => {
  setDeviceIdentity({ family: 0x24, model: 0x01 });
  const legacy = parseSysExHex(LEGACY_PRESET_2_HEX);
  const legacyWords = payloadWords(legacy);
  assertDeepEqual(legacyWords.slice(0, 3), [0x0e, 4, 2], 'legacy words');
  const frame = buildSelectPreset(2, { counter: 0x08 });
  assertDeepEqual(payloadWords(frame).slice(0, 3), legacyWords.slice(0, 3), 'same words as the legacy frame');
  assertEqual(frame[6], 0x4d, 'family/model marker');
  assertEqual(frame[7], 0x01, 'group 1 as the legacy frame');
  assertEqual(frame[8], 0x08, 'counter');
});

it('preset select: the slot index must be 0..4', () => {
  setDeviceIdentity({ family: 0x24, model: 0x01 });
  let thrown = false;
  try { buildSelectPreset(5); } catch (err) { thrown = true; }
  assertEqual(thrown, true, 'slot 5 is rejected');
});
