import { it, assertDeepEqual } from '../support/assert.js';
import { parseSysExHex } from '../../src/core/bytes.js';
import { decodeBitBucket7THR } from '../../src/protocol/frames.js';
import { buildParamWriteFrames } from '../../src/protocol/paramWrite.js';
import { setDeviceIdentity } from '../../src/protocol/identity.js';

// Body frame of the legacy "effect -> ON" toggle (test/fixtures/transcripts/toggle_effect.txt):
// unit 0x13c (GuitarProc), parameter 0x12f (FX2 enable), float 1.0.
const LEGACY_TOGGLE_ON_BODY = 'f0 00 01 0c 24 01 4d 00 0c 00 00 0f 00 3c 01 00 00 2f 01 00 00 00 04 00 00 00 00 00 40 00 3f 00 00 00 00 00 f7';

function bodyWords(frame) {
  const raw = decodeBitBucket7THR(frame.slice(12, frame.length - 1), 16);
  const words = [];
  for (let i = 0; i < 16; i += 4) {
    words.push((raw[i] | (raw[i + 1] << 8) | (raw[i + 2] << 16) | (raw[i + 3] << 24)) >>> 0);
  }
  return words;
}

it('param write: a bool parameter (effect enable) is written as float 1.0 / 0.0, like the amp\'s own toggle frames', () => {
  setDeviceIdentity({ family: 0x24, model: 0x01 });
  const legacy = bodyWords(parseSysExHex(LEGACY_TOGGLE_ON_BODY));
  assertDeepEqual(legacy, [0x13c, 0x12f, 4, 0x3f800000], 'legacy frame is float 1.0');
  assertDeepEqual(bodyWords(buildParamWriteFrames(0x13c, 0x12f, 3, true)[1]), legacy, 'ON matches the legacy frame');
  assertDeepEqual(bodyWords(buildParamWriteFrames(0x13c, 0x12f, 3, false)[1]), [0x13c, 0x12f, 4, 0], 'OFF is float 0.0');
});
