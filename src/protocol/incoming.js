import { extractSysexFrames, parseIncomingThrFrame, readF32LEFromU32 } from './frames.js';
import { thrDumpProtocol } from './constants.js';

const OPCODE = {
  answer: 0x01,
  settingsNotification: 0x02,
  unitTypeChange: 0x03,
  parameterChange: 0x04,
  status: 0x06
};

const TYPE_FLOAT32 = 4;
const TYPE_BOOL = 3;

function decodeValue(typeCode, rawU32) {
  if (typeCode === TYPE_FLOAT32) return readF32LEFromU32(rawU32);
  if (typeCode === TYPE_BOOL) return rawU32 !== 0;
  return rawU32;
}

// Decodes one complete inbound SysEx frame into a device event, or null when the frame is not one we handle.
// Only group 0 frames are handled here; group 1 frames are dump data (decoded by the legacy parser for now).
export function decodeIncomingEvent(rawFrame) {
  let parsed;
  try {
    parsed = parseIncomingThrFrame(rawFrame, 'device');
  } catch (err) {
    return null;
  }
  const { opcode, payloadWords: words, decodedPayload, header } = parsed;
  if (opcode === null || header.group !== 0) return null;

  switch (opcode) {
    case OPCODE.parameterChange: {
      if (words.length < 4) return null;
      const [unitId, paramId, typeCode, rawU32] = words;
      return { kind: 'parameter_change', unitId, paramId, typeCode, rawU32, value: decodeValue(typeCode, rawU32) };
    }
    case OPCODE.settingsNotification: {
      // Word 1 is the 0-based user memory slot (confirmed: memory 2 gives 1). Dump reports also use opcode 02; they are
      // not slot presses. A report has the Actual target (0xffffffff) in word 1, or code 1 in word 3 ("downloaded":
      // the captures show code 0 for a slot press and code 1 for the Actual dump report; a memory dump is expected
      // to report its slot with code 1).
      if (words.length < 4) return null;
      if ((words[1] >>> 0) === thrDumpProtocol.actualTargetU32 || words[3] === 1) return { kind: 'dump_report', code: words[3] };
      return { kind: 'settings_notification', slot: words[1], code: words[3] };
    }
    case OPCODE.answer: {
      // Answer to "have user settings changed?": declared length 1 and one payload byte (0 = not changed, 1 = changed).
      // An ACK to a command has declared length 4 and echoes the command counter.
      if (parsed.declaredLength === 1 && decodedPayload.length >= 9) {
        return { kind: 'answer', value: decodedPayload[8] };
      }
      return { kind: 'ack', counter: header.counter };
    }
    case OPCODE.status:
      return { kind: 'status' };
    case OPCODE.unitTypeChange: {
      // Unit type change (amp model or effect type on the amp): body words are the unit id and the type symbol id.
      if (words.length < 2) return null;
      return { kind: 'unit_type_change', unitId: words[0] >>> 0, typeKey: words[1] >>> 0 };
    }
    default:
      return null;
  }
}

// Splits raw input bytes (one transport chunk) into SysEx frames and decodes each one.
export function decodeIncomingChunk(bytes) {
  return extractSysexFrames(bytes).map(decodeIncomingEvent).filter(Boolean);
}
