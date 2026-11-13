import { thrKeys, thrTypeCode } from './constants.js';
import { readF32LEFromU32, readU32LEFromBytes } from './frames.js';
import { writeU32LE } from '../core/bytes.js';

const TRTG = [0x54, 0x52, 0x54, 0x47];
// Dump type codes (1 bool, 2 enum, 3 float32) are mapped to the wire codes used by the store and the write path.
const WIRE_TYPE_BY_DUMP_CODE = {
  1: thrTypeCode.bool,
  2: thrTypeCode.enum,
  3: thrTypeCode.float32
};
const UNIT_KEYS = new Set([
  thrKeys.unit.guitarProc,
  thrKeys.unit.fx1,
  thrKeys.unit.amp,
  thrKeys.unit.fx2,
  thrKeys.unit.fx3,
  thrKeys.unit.fx4
]);
const STRUCTURAL_NAMES = new Set(['units', 'data', 'meta', 'tnid', 'psrp', 'trtg']);
const PSEUDO_VALUES = new Set([0x00008000, 0x00028000, 0x00078000]);

function readTypeCode(bytes, offset) {
  if (offset + 4 > bytes.length) return null;
  const [b0, b1, b2, b3] = [bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]];
  const isType = t => t >= 1 && t <= 6;
  // Canonical token 00 00 TT 00; the 00 00 TT 80 variant also appears in captures.
  if (b0 === 0 && b1 === 0 && isType(b2) && (b3 === 0 || b3 === 0x80)) return b2;
  // Plain token TT 00 00 00.
  if (isType(b0) && b1 === 0 && b2 === 0 && b3 === 0) return b0;
  return null;
}

function matchesAt(bytes, offset, token) {
  return token.every((b, i) => bytes[offset + i] === b);
}

function decodeTyped(typeCode, rawValue) {
  if (typeCode === 1) return { decodedKind: 'bool', value: rawValue !== 0 };
  if (typeCode === 2) return { decodedKind: 'enum_u32', value: rawValue };
  const f = readF32LEFromU32(rawValue);
  return Number.isFinite(f) ? { decodedKind: 'float32', value: f } : { decodedKind: 'u32', value: rawValue };
}

// Walks a decoded patch (the payload after its 16-byte header) and returns unit types and typed parameters.
// nameOf maps a symbol id to its name, or null when the id is unknown. Dump type codes are kept as-is here.
export function parseDumpPatch(raw, nameOf) {
  const entries = [];
  let currentUnit = null;

  for (let p = 0; p + 2 <= raw.length;) {
    if (p + 4 <= raw.length && matchesAt(raw, p, TRTG)) {
      p += 4;
      continue;
    }

    if (p + 6 <= raw.length) {
      const key = raw[p] | (raw[p + 1] << 8);
      const typeCode = readTypeCode(raw, p + 2);

      if (typeCode === 5 && p + 24 <= raw.length) {
        const pseudo1 = readU32LEFromBytes(raw, p + 6);
        const unitTypeKey = raw[p + 10] | (raw[p + 11] << 8);
        const pseudo2 = readU32LEFromBytes(raw, p + 16);
        const isBlockHeader =
          readTypeCode(raw, p + 12) === 6 &&
          (pseudo1 === 0x00078000 || pseudo1 === 0x00008000) &&
          (pseudo2 === 0x00028000 || pseudo2 === 0x00008000);
        if (isBlockHeader) {
          if (UNIT_KEYS.has(key)) {
            currentUnit = key;
            if (unitTypeKey > 0 && unitTypeKey < 0x00020000) {
              entries.push({ kind: 'unit_type', unitKey: key, unitTypeKey });
            }
          }
          p += 24;
          continue;
        }
      }

      if (typeCode === 4 && p + 10 <= raw.length) {
        const byteLen = readU32LEFromBytes(raw, p + 6);
        if (byteLen <= raw.length - (p + 10) && byteLen <= 512) {
          p += 10 + byteLen;
          continue;
        }
      }

      if (typeCode === 1 || typeCode === 2 || typeCode === 3) {
        if (p + 10 > raw.length) break;
        if (currentUnit !== null && key !== 0) {
          const name = nameOf(key);
          if (name && !STRUCTURAL_NAMES.has(name.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
            const rawValue = readU32LEFromBytes(raw, p + 6);
            entries.push({
              kind: 'parameter',
              unitKey: currentUnit,
              pKey: key,
              typeCode: WIRE_TYPE_BY_DUMP_CODE[typeCode],
              rawValue,
              ...decodeTyped(typeCode, rawValue)
            });
          }
        }
        p += 10;
        continue;
      }

      const pseudo = readU32LEFromBytes(raw, p + 2);
      if (key <= 4 && PSEUDO_VALUES.has(pseudo)) {
        // End-of-block marker: the following values must not inherit this unit.
        if (key === 4 && pseudo === 0x00008000) currentUnit = null;
        p += 6;
        continue;
      }
    }

    p += 1;
  }

  return entries;
}

function wordTypeCode(word) {
  const w = word >>> 0;
  if (w >= 1 && w <= 6) return w;
  const low = w & 0xffff;
  if (low >= 1 && low <= 6) return low;
  const hi = (w >>> 16) & 0xffff;
  if (hi >= 1 && hi <= 6) return hi;
  return null;
}

// Preset name field: the first short string (type 4) after the PSRP marker. Same scan as the legacy parser.
// The field is a u32 byte length followed by that many bytes (the text and its closing zero).
function locatePatchName(raw) {
  const marker = [0x50, 0x53, 0x52, 0x50];
  for (let i = 0; i + marker.length <= raw.length; i += 1) {
    if (!matchesAt(raw, i, marker)) continue;
    for (let p = i + 4; p + 8 < raw.length && p < i + 140; p += 1) {
      if (wordTypeCode(readU32LEFromBytes(raw, p)) !== 4) continue;
      const len = readU32LEFromBytes(raw, p + 4);
      if (!len || len > 96 || p + 8 + len > raw.length) continue;
      const bytes = raw.slice(p + 8, p + 8 + len);
      const zero = bytes.indexOf(0);
      const text = new TextDecoder().decode(zero >= 0 ? bytes.slice(0, zero) : bytes).trim();
      if (text) return { text, lengthOffset: p + 4, start: p + 8, length: len };
    }
  }
  return null;
}

export function parsePatchName(raw) {
  const field = locatePatchName(raw);
  return field ? field.text : null;
}

// A copy of the patch with another preset name. Only the name field changes (its length word and its bytes); the patch
// is a token stream without byte counts around it, so the rest is copied as it is. The same name gives the same bytes.
export function withPatchName(raw, name) {
  const field = locatePatchName(raw);
  if (!field) throw new Error('The patch has no name field.');
  if (field.text === name) return raw;
  const text = Uint8Array.of(...new TextEncoder().encode(name), 0);
  const out = new Uint8Array(raw.length - field.length + text.length);
  out.set(raw.subarray(0, field.lengthOffset), 0);
  out.set(writeU32LE(text.length), field.lengthOffset);
  out.set(text, field.start);
  out.set(raw.subarray(field.start + field.length), field.start + text.length);
  return out;
}
