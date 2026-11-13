import { buildUploadUserSettingsFrames } from './builders.js';
import { thrDumpProtocol } from './constants.js';
import { nextCommandCounter } from './counter.js';

// Pause between upload frames, as on the legacy page.
export const UPLOAD_PACE_MS = 18;

// Frames that store a patch (a dump payload without its 16-byte header) in memory slot 0..4.
// Sequencing as the legacy upload, which the amp accepts (confirmed by ear on hardware, 2026-11-13): the header and
// the body frames count up one by one, header pc 0, body pc from 1. (The protocol document shows body pc from 0;
// that variant is untested here.) The counters are taken as one unbroken run, so the upload never spans the counter restart.
export function buildSlotUploadFrames(slotIndex, patchRaw) {
  const frameCount = 1 + Math.ceil(patchRaw.length / thrDumpProtocol.defaultUploadChunkDecodedSize);
  let counters = [];
  while (counters.length < frameCount) {
    const counter = nextCommandCounter();
    if (counters.length && counter !== counters[counters.length - 1] + 1) counters = [];
    counters.push(counter);
  }
  return buildUploadUserSettingsFrames({ targetRef: { kind: 'slot', value: slotIndex } }, patchRaw, {
    headerCounter: counters[0],
    headerPc: 0,
    bodyCounter: counters[1],
    bodyPcStart: 1,
    incrementBodyCounter: true
  });
}
