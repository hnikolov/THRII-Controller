import { concatBytes, writeF32LE, writeU32LE } from '../core/bytes.js';
import { resolveIdentity } from './identity.js';
import { clamp01, normalizeOnOff } from '../core/values.js';
import { thrDumpProtocol, thrKeys, thrOpcode, thrTypeCode } from './constants.js';
import { nextCommandCounter } from './counter.js';

export function encodeBitBucket7Padded(rawBytes) {
  const groups = Math.max(1, Math.ceil(rawBytes.length / 7));
  const out = [];

  for (let g = 0; g < groups; g += 1) {
    let bucket = 0;
    const lows = [];

    for (let i = 0; i < 7; i += 1) {
      const idx = g * 7 + i;
      const value = idx < rawBytes.length ? (rawBytes[idx] & 0xff) : 0;

      // THR-II follows the documented bitbucket ordering where byte #1 maps to bit6, byte #7 maps to bit0.
      if (value & 0x80) bucket |= (1 << (6 - i));
      lows.push(value & 0x7f);
    }

    out.push(bucket, ...lows);
  }

  return Uint8Array.from(out);
}

export function buildCommandFrameFromRawPayload(rawPayload, options = {}) {
  const group = options.group || 0;
  const counter = options.counter == null ? nextCommandCounter() : options.counter;
  const pc = options.pc == null ? 0 : options.pc;
  const lastValidIndex = options.lastValidIndex == null ? Math.max(0, rawPayload.length - 1) : options.lastValidIndex;
  const encoded = encodeBitBucket7Padded(rawPayload);

  const frame = new Uint8Array(12 + encoded.length + 1);
  frame[0] = 0xf0;
  frame[1] = 0x00;
  frame[2] = 0x01;
  frame[3] = 0x0c;
  const identity = resolveIdentity(options.identity);
  frame[4] = identity.family;
  frame[5] = identity.model;
  frame[6] = 0x4d;
  frame[7] = group & 0x7f;
  frame[8] = counter & 0x7f;
  frame[9] = pc & 0x7f;
  frame[10] = (lastValidIndex >> 4) & 0x0f;
  frame[11] = lastValidIndex & 0x0f;
  frame.set(encoded, 12);
  frame[12 + encoded.length] = 0xf7;
  return frame;
}

export function buildHeaderFrame(args) {
  const opcodeRaw = writeU32LE(args.opcode >>> 0);
  const followingRaw = writeU32LE(args.followingBytes >>> 0);
  return buildCommandFrameFromRawPayload(concatBytes(opcodeRaw, followingRaw), {
    group: args.group || 0,
    counter: args.counter,
    pc: args.pc,
    lastValidIndex: 7
  });
}

export function buildBodyFrame(args) {
  return buildCommandFrameFromRawPayload(args.bodyRawPayload, {
    group: args.group || 0,
    counter: args.counter,
    pc: args.pc,
    lastValidIndex: Math.max(0, args.bodyRawPayload.length - 1)
  });
}

export function normalizeDumpTargetRef(targetRef) {
  if (targetRef && typeof targetRef === 'object') {
    if (targetRef.kind === 'actual') {
      return { kind: 'actual', value: thrDumpProtocol.actualTargetU32 >>> 0 };
    }
    if (targetRef.kind === 'slot') {
      const slot = Math.max(
        thrDumpProtocol.minSlot,
        Math.min(thrDumpProtocol.maxSlot, Number(targetRef.value) | 0)
      );
      return { kind: 'slot', value: slot };
    }
  }

  const numeric = Number(targetRef);
  if (Number.isFinite(numeric)) {
    const asU32 = numeric >>> 0;
    if (asU32 === (thrDumpProtocol.actualTargetU32 >>> 0)) {
      return { kind: 'actual', value: thrDumpProtocol.actualTargetU32 >>> 0 };
    }
    const slot = Math.max(
      thrDumpProtocol.minSlot,
      Math.min(thrDumpProtocol.maxSlot, numeric | 0)
    );
    return { kind: 'slot', value: slot };
  }

  throw new Error('Invalid dump target. Use slot 0..4 or actual (0xffffffff).');
}

export function dumpTargetRefToU32(targetRef) {
  const normalized = normalizeDumpTargetRef(targetRef);
  if (normalized.kind === 'actual') return thrDumpProtocol.actualTargetU32 >>> 0;
  return normalized.value >>> 0;
}

export function buildRequestUserSettingsDump(targetRef, options = {}) {
  const targetU32 = dumpTargetRefToU32(targetRef);
  const payload = concatBytes(
    writeU32LE(thrOpcode.requestUserSettingsDump),
    writeU32LE(4),
    writeU32LE(targetU32)
  );

  return buildCommandFrameFromRawPayload(payload, {
    group: options.group == null ? 0x01 : options.group,
    counter: options.counter,
    pc: options.pc,
    lastValidIndex: 11
  });
}

export function buildUploadUserSettingsHeader(uploadArgs = {}, options = {}) {
  const targetU32 = dumpTargetRefToU32(uploadArgs.targetRef);
  const patchRawLength = uploadArgs.patchRawLength == null ? 0 : (Number(uploadArgs.patchRawLength) >>> 0);
  const payloadLengthMinus8 = uploadArgs.payloadLengthMinus8 == null
    ? ((patchRawLength + 12) >>> 0)
    : (Number(uploadArgs.payloadLengthMinus8) >>> 0);
  const payloadLengthTotal = uploadArgs.payloadLengthTotal == null
    ? ((payloadLengthMinus8 + 8) >>> 0)
    : (Number(uploadArgs.payloadLengthTotal) >>> 0);

  const tailWords = Array.isArray(uploadArgs.constantsTailWords) && uploadArgs.constantsTailWords.length
    ? uploadArgs.constantsTailWords
    : thrDumpProtocol.defaultUploadTailWords;

  // Upload opcode 0x0d uses six parameters directly after opcode.
  // Do not prepend the generic command "declared length" word here.
  const parameterWords = [payloadLengthTotal, targetU32, payloadLengthMinus8]
    .concat(tailWords.map(v => Number(v) >>> 0));
  const parameterPayload = concatBytes(...parameterWords.map(writeU32LE));
  const payload = concatBytes(writeU32LE(thrOpcode.uploadUserSettingsDump), parameterPayload);

  return buildCommandFrameFromRawPayload(payload, {
    group: options.group == null ? 0x01 : options.group,
    counter: options.counter,
    pc: options.pc,
    lastValidIndex: Math.max(0, payload.length - 1)
  });
}

export function buildUploadUserSettingsBodyFrames(patchRaw, options = {}) {
  const bytes = patchRaw instanceof Uint8Array ? patchRaw : Uint8Array.from(patchRaw || []);
  if (!bytes.length) return [];

  const chunkSize = Math.max(
    1,
    Number(options.frameChunkDecodedSize || thrDumpProtocol.defaultUploadChunkDecodedSize) | 0
  );
  const group = options.group == null ? 0x01 : options.group;
  const baseCounter = options.counter == null ? nextCommandCounter() : options.counter;
  const pcStart = options.pcStart == null ? 0 : (options.pcStart & 0x7f);
  const incrementCounter = !!options.incrementCounter;

  const frames = [];
  for (let offset = 0, idx = 0; offset < bytes.length; offset += chunkSize, idx += 1) {
    const chunk = bytes.slice(offset, offset + chunkSize);
    const frameCounter = incrementCounter ? ((baseCounter + idx) & 0x7f) : (baseCounter & 0x7f);
    const framePc = (pcStart + idx) & 0x7f;

    frames.push(buildBodyFrame({
      group,
      counter: frameCounter,
      pc: framePc,
      bodyRawPayload: chunk
    }));
  }
  return frames;
}

export function buildUploadUserSettingsFrames(uploadArgs = {}, patchRaw, options = {}) {
  const patchBytes = patchRaw instanceof Uint8Array ? patchRaw : Uint8Array.from(patchRaw || []);
  const header = buildUploadUserSettingsHeader({
    targetRef: uploadArgs.targetRef,
    patchRawLength: patchBytes.length,
    payloadLengthTotal: uploadArgs.payloadLengthTotal,
    payloadLengthMinus8: uploadArgs.payloadLengthMinus8,
    constantsTailWords: uploadArgs.constantsTailWords
  }, {
    group: options.group,
    counter: options.headerCounter,
    pc: options.headerPc
  });

  const bodyFrames = buildUploadUserSettingsBodyFrames(patchBytes, {
    group: options.group,
    counter: options.bodyCounter,
    incrementCounter: options.incrementBodyCounter,
    frameChunkDecodedSize: options.frameChunkDecodedSize,
    pcStart: options.bodyPcStart
  });

  return [header, ...bodyFrames];
}

export function buildSetParameter(uKey, pKey, typeCode, valueRawU32, options = {}) {
  const header = buildHeaderFrame({
    group: options.group || 0,
    counter: options.headerCounter,
    opcode: thrOpcode.setParameter,
    followingBytes: 16
  });

  const bodyPayload = concatBytes(
    writeU32LE(uKey),
    writeU32LE(pKey),
    writeU32LE(typeCode),
    writeU32LE(valueRawU32)
  );

  const body = buildBodyFrame({
    group: options.group || 0,
    counter: options.bodyCounter,
    bodyRawPayload: bodyPayload
  });

  return [header, body];
}

// Unit type select (amp model, effect, echo, reverb): body is [unit key, enum symbol id], both u32 LE.
export function buildSelectUnitType(uKey, enumSymbolId, options = {}) {
  const header = buildHeaderFrame({
    group: options.group || 0,
    counter: options.headerCounter,
    opcode: thrOpcode.setGlobalOrType,
    followingBytes: 8
  });

  const body = buildBodyFrame({
    group: options.group || 0,
    counter: options.bodyCounter,
    bodyRawPayload: concatBytes(writeU32LE(uKey), writeU32LE(enumSymbolId))
  });

  return [header, body];
}

// Memory slot select (the legacy Preset buttons). slotIndex is 0..4 (Memory slot 1..5).
// The payload is the legacy one: opcode, a fixed 4, the slot. Read the slot back with a dump request afterwards.
export function buildSelectPreset(slotIndex, options = {}) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 4) throw new Error('Memory slot index must be 0..4.');
  return buildCommandFrameFromRawPayload(
    concatBytes(writeU32LE(thrOpcode.presetSelect), writeU32LE(4), writeU32LE(slotIndex)),
    { group: options.group == null ? 0x01 : options.group, counter: options.counter, pc: 0 }
  );
}

export function buildAskGlobalParameter(uKeyGlobal, pKey, options = {}) {
  const header = buildHeaderFrame({
    group: options.group || 0,
    counter: options.headerCounter,
    opcode: thrOpcode.askGlobal,
    followingBytes: 8
  });

  const bodyPayload = concatBytes(writeU32LE(uKeyGlobal), writeU32LE(pKey));
  const body = buildBodyFrame({
    group: options.group || 0,
    counter: options.bodyCounter,
    bodyRawPayload: bodyPayload
  });

  return [header, body];
}

export function buildSetModuleEnabled(target, enabled, options = {}) {
  const map = {
    compressor: thrKeys.parameter.fx1Enable,
    gate: thrKeys.parameter.gateEnable,
    effect: thrKeys.parameter.fx2Enable,
    echo: thrKeys.parameter.fx3Enable,
    reverb: thrKeys.parameter.fx4Enable
  };

  const pKey = map[target];
  if (pKey == null) throw new Error('Unknown module enable target: ' + target);

  const valueRawU32 = new DataView(writeF32LE(enabled ? 1 : 0).buffer).getUint32(0, true);
  return buildSetParameter(
    thrKeys.unit.guitarProc,
    pKey,
    thrTypeCode.float32,
    valueRawU32,
    options
  );
}

export function buildSetModuleParameter(uKey, pKey, value01, options = {}) {
  const valueRawU32 = new DataView(writeF32LE(clamp01(value01)).buffer).getUint32(0, true);
  return buildSetParameter(uKey, pKey, thrTypeCode.float32, valueRawU32, options);
}

export function encodeShadowRawU32(typeCode, value, existingRaw = 0) {
  const code = Number(typeCode) >>> 0;

  if (code === (thrTypeCode.float32 >>> 0)) {
    const n = Number(value);
    if (!Number.isFinite(n)) return Number(existingRaw) >>> 0;
    return new DataView(writeF32LE(n).buffer).getUint32(0, true) >>> 0;
  }

  if (code === (thrTypeCode.bool >>> 0)) {
    const b = normalizeOnOff(value);
    if (b == null) return Number(existingRaw) >>> 0;
    return b ? 0x3f800000 : 0x00000000;
  }

  if (code === (thrTypeCode.enum >>> 0)) {
    const n = Number(value);
    if (!Number.isFinite(n)) return Number(existingRaw) >>> 0;
    return (Math.round(n) >>> 0);
  }

  const n = Number(value);
  if (Number.isFinite(n)) return (Math.round(n) >>> 0);
  return Number(existingRaw) >>> 0;
}
