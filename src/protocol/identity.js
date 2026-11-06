// Device identity from the universal identity reply (doc: F0 7E KK 06 02 MA MB MC F1 F2 M1 M2 V1..V4 F7).
// Family and model are header bytes 4 and 5 of every THR frame (for example 24 01 4d for thr10ii).
let deviceIdentity = null;

const YAMAHA_MANUFACTURER = [0x00, 0x01, 0x0c];
const IDENTITY_REPLY_LENGTH = 17;

export function parseIdentityReply(frame) {
  if (frame.length !== IDENTITY_REPLY_LENGTH) return null;
  if (frame[0] !== 0xf0 || frame[1] !== 0x7e || frame[3] !== 0x06 || frame[4] !== 0x02 || frame[16] !== 0xf7) return null;
  const manufacturer = [frame[5], frame[6], frame[7]];
  if (manufacturer.some((byte, i) => byte !== YAMAHA_MANUFACTURER[i])) return null;
  return { family: frame[8], model: frame[10], version: [frame[12], frame[13], frame[14], frame[15]] };
}

// Session context shared by the frame builders and the activation runner. Set only from a device reply.
export function setDeviceIdentity(identity) {
  deviceIdentity = identity ? { family: identity.family, model: identity.model } : null;
}

export function getDeviceIdentity() {
  return deviceIdentity;
}

export function resolveIdentity(explicit) {
  const identity = explicit || deviceIdentity;
  if (!identity) {
    throw new Error('Device identity unknown: run the activation handshake first.');
  }
  return identity;
}

// Copy of a THR frame with the family and model bytes replaced by the device's own values.
export function withIdentity(frame, identity) {
  const out = Uint8Array.from(frame);
  out[4] = identity.family;
  out[5] = identity.model;
  return out;
}
