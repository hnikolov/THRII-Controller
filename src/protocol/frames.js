import { toHex } from '../core/bytes.js';

export function readU32LEFromBytes(bytes, offset = 0) {
  if ((offset + 4) > bytes.length) {
    throw new Error('Out of bounds LE32 read at offset ' + offset);
  }
  return (
    (bytes[offset]) |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    ((bytes[offset + 3] << 24) >>> 0)
  ) >>> 0;
}

export function decodeBitBucket7THR(encodedBytes, validDecodedBytes) {
  const out = [];
  for (let p = 0; p < encodedBytes.length;) {
    const bucket = encodedBytes[p++] & 0x7f;
    for (let i = 0; i < 7 && p < encodedBytes.length; i += 1) {
      const low = encodedBytes[p++] & 0x7f;
      const msb = (bucket >> (6 - i)) & 0x01;
      out.push(low | (msb << 7));
    }
  }

  const maxLen = Math.max(0, Number(validDecodedBytes) || 0);
  return Uint8Array.from(out.slice(0, maxLen));
}

export function sliceU32LEWords(bytes, offset = 0, warnings = []) {
  const out = [];
  if (offset < 0 || offset > bytes.length) {
    warnings.push('Invalid word slice offset: ' + offset);
    return out;
  }

  const available = bytes.length - offset;
  if (available % 4 !== 0) {
    warnings.push('Payload tail is not aligned to 4 bytes: ' + available);
  }

  for (let p = offset; (p + 4) <= bytes.length; p += 4) {
    out.push(readU32LEFromBytes(bytes, p));
  }
  return out;
}

export function readF32LEFromU32(u32) {
  const buf = new ArrayBuffer(4);
  const dv = new DataView(buf);
  dv.setUint32(0, u32 >>> 0, true);
  return dv.getFloat32(0, true);
}

export function extractSysexFrames(bytes) {
  const frames = [];
  let start = -1;

  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    if (b === 0xf0) {
      start = i;
      continue;
    }
    if (b === 0xf7 && start >= 0) {
      frames.push(bytes.slice(start, i + 1));
      start = -1;
    }
  }

  return frames;
}

export function parseIncomingThrFrame(rawFrame, source) {
  const warnings = [];
  if (rawFrame.length < 14) throw new Error('Frame too short for THR parse.');
  if (rawFrame[0] !== 0xf0 || rawFrame[rawFrame.length - 1] !== 0xf7) {
    throw new Error('Not a SysEx frame.');
  }

  const manufacturer = [rawFrame[1], rawFrame[2], rawFrame[3]];
  if (manufacturer[0] !== 0x00 || manufacturer[1] !== 0x01 || manufacturer[2] !== 0x0c) {
    warnings.push('Unexpected manufacturer bytes: ' + manufacturer.map(v => v.toString(16).padStart(2, '0')).join(' '));
  }

  const header = {
    family: rawFrame[4],
    model: rawFrame[5],
    marker: rawFrame[6],
    group: rawFrame[7],
    counter: rawFrame[8],
    pc: rawFrame[9],
    l2: rawFrame[10],
    l1: rawFrame[11],
    lastValidIndex: ((rawFrame[10] & 0x0f) * 16) + (rawFrame[11] & 0x0f)
  };

  const encodedPayload = rawFrame.slice(12, rawFrame.length - 1);
  const decodedPayload = decodeBitBucket7THR(encodedPayload, header.lastValidIndex + 1);

  let opcode = null;
  let declaredLength = null;
  let payloadWords = [];
  if (decodedPayload.length >= 8) {
    const firstWord = readU32LEFromBytes(decodedPayload, 0);
    // Continuation frames in multi-frame dumps can start with arbitrary payload words.
    // Only treat word#0 as opcode when it matches known THR opcode range.
    if (firstWord <= 0x0f) {
      opcode = firstWord;
      declaredLength = readU32LEFromBytes(decodedPayload, 4);
      payloadWords = sliceU32LEWords(decodedPayload, 8, warnings);
    } else if (header.pc === 0) {
      warnings.push('Decoded payload does not start with THR opcode: 0x' + firstWord.toString(16));
    }
  } else {
    warnings.push('Decoded payload shorter than opcode+length.');
  }

  return {
    source,
    rawHex: toHex(rawFrame),
    header,
    encodedPayload,
    decodedPayload,
    opcode,
    declaredLength,
    payloadWords,
    warnings
  };
}

export function parseOutgoingFrameMeta(frameBytes, label) {
  if (!(frameBytes instanceof Uint8Array) || frameBytes.length < 14) {
    return null;
  }

  if (frameBytes[0] !== 0xf0 || frameBytes[frameBytes.length - 1] !== 0xf7) {
    return null;
  }

  const header = {
    group: frameBytes[7],
    counter: frameBytes[8],
    l2: frameBytes[10],
    l1: frameBytes[11]
  };
  const lastValidIndex = ((header.l2 & 0x0f) * 16) + (header.l1 & 0x0f);
  const encoded = frameBytes.slice(12, frameBytes.length - 1);
  const decoded = decodeBitBucket7THR(encoded, lastValidIndex + 1);

  let opcode = null;
  let declaredLength = null;
  if (decoded.length >= 8) {
    const firstWord = readU32LEFromBytes(decoded, 0);
    // Heuristic: THR opcodes are small values (<= 0x0f).
    if (firstWord <= 0x0f) {
      opcode = firstWord;
      declaredLength = readU32LEFromBytes(decoded, 4);
    }
  }

  return {
    timeMs: Date.now(),
    label: label || 'TX',
    group: header.group,
    counter: header.counter,
    opcode,
    declaredLength,
    rawHex: toHex(frameBytes)
  };
}
