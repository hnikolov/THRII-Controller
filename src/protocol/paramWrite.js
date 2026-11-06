import { buildSetParameter, encodeShadowRawU32 } from './builders.js';
import { thrTypeCode } from './constants.js';

// Frames for one parameter write (header + body). The raw value comes from the normalized store value.
// Bool parameters (the effect enables) are written as float 1.0 / 0.0: the amp's own toggle frames use that form.
export function buildParamWriteFrames(unitId, paramId, typeCode, value, existingRaw = 0) {
  if (typeCode === thrTypeCode.bool) {
    return buildSetParameter(unitId, paramId, thrTypeCode.float32, value ? 0x3f800000 : 0);
  }
  return buildSetParameter(unitId, paramId, typeCode, encodeShadowRawU32(typeCode, value, existingRaw));
}
