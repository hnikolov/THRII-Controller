import { buildRequestUserSettingsDump } from './builders.js';
import { createDumpAssembler } from './dumpAssembly.js';
import { parseIncomingThrFrame } from './frames.js';
import { parseDumpPatch, parsePatchName } from './dumpParser.js';

const DUMP_HEADER_BYTES = 16;
const STALE_MS = 8000;

// Slot-driven sync (flag slotSync). A slot press requests the Actual dump, which is parsed into entries for
// applyDumpPatch. The amp's "settings changed?" answer is not used: after a memory switch it reports no change.
// Only dump requests are sent, so no parameter writes can echo back from here.
export function createSyncFlow({ send, nameOf, onPatch, onError = () => {}, onState = () => {}, now = () => Date.now() }) {
  const assembler = createDumpAssembler({ now });
  let state = 'idle';
  let startedAt = 0;

  function setState(next, note = '') {
    state = next;
    onState(next, note);
  }

  function transmit(frame, label) {
    try {
      Promise.resolve(send(frame, label)).catch(fail);
    } catch (err) {
      fail(err);
    }
  }

  function fail(err) {
    setState('idle', 'error: ' + err.message);
    onError(err);
  }

  function startDump() {
    setState('awaitingDump');
    startedAt = now();
    transmit(buildRequestUserSettingsDump({ kind: 'actual' }), 'TX sync: actual dump');
  }

  function onDumpPayload(payloadBytes) {
    if (state !== 'awaitingDump') return;
    setState('idle', 'dump complete');
    const patch = payloadBytes.slice(DUMP_HEADER_BYTES);
    onPatch(parseDumpPatch(patch, nameOf), parsePatchName(patch));
  }

  return {
    get state() {
      return state;
    },

    // Asks the amp for its Actual settings (used after activation to fill the UI). Ignored while a dump is running.
    requestDump() {
      if (state === 'idle') startDump();
    },

    // Called for every complete inbound frame, with the event decodeIncomingEvent gave for it (or null).
    onFrame(frame, event) {
      try {
        handleFrame(frame, event);
      } catch (err) {
        fail(err);
      }
    }
  };

  function handleFrame(frame, event) {
    let parsed = null;
    try {
      parsed = parseIncomingThrFrame(frame, 'device');
    } catch (err) {
      parsed = null;
    }
    if (parsed) {
      assembler.push(parsed).forEach(dumpEvent => {
        if (dumpEvent.kind === 'dump_complete') onDumpPayload(dumpEvent.payloadBytes);
      });
    }

    if (!event) return;
    if (event.kind === 'settings_notification') {
      // A press during a running dump is ignored until that dump goes stale.
      if (state === 'idle' || now() - startedAt >= STALE_MS) startDump();
    }
  }
}
