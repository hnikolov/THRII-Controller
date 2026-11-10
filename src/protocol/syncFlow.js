import { realClock } from '../core/clock.js';
import { buildRequestUserSettingsDump } from './builders.js';
import { createDumpAssembler } from './dumpAssembly.js';
import { parseIncomingThrFrame } from './frames.js';
import { parseDumpPatch, parsePatchName } from './dumpParser.js';

const DUMP_HEADER_BYTES = 16;
export const DUMP_TIMEOUT_MS = 4000;
const MAX_ATTEMPTS = 2;

// Reads the amp's Actual settings: after activation, after a slot pick in the app (requestDump), and after a slot
// press on the amp (flag slotSync). The completed dump is parsed into entries for applyDumpPatch.
// The amp's "settings changed?" answer is not used: after a memory switch it reports no change.
// Only dump requests are sent, so no parameter writes can echo back from here.
export function createSyncFlow({ send, nameOf, onPatch, onError = () => {}, onState = () => {}, clock = realClock }) {
  const assembler = createDumpAssembler({ now: clock.now });
  let state = 'idle';
  let attempt = 0;
  let timer = null;
  // A request that arrived while a dump was running. That dump may show the settings from before the request,
  // so it is dropped and a new one is read.
  let rerun = false;

  function setState(next, note = '') {
    state = next;
    onState(next, note);
  }

  function finish(note) {
    clock.clearTimeout(timer);
    timer = null;
    rerun = false;
    setState('idle', note);
  }

  function fail(err) {
    finish('error: ' + err.message);
    onError(err);
  }

  function transmit(frame, label) {
    try {
      Promise.resolve(send(frame, label)).catch(fail);
    } catch (err) {
      fail(err);
    }
  }

  function startDump(nextAttempt = 1) {
    attempt = nextAttempt;
    rerun = false;
    clock.clearTimeout(timer);
    timer = clock.setTimeout(onTimeout, DUMP_TIMEOUT_MS);
    setState('awaitingDump', attempt > 1 ? 'retry' : '');
    transmit(buildRequestUserSettingsDump({ kind: 'actual' }), 'TX sync: actual dump');
  }

  // A dump that does not complete (a lost BLE packet, for example) is asked for once more, then reported.
  // Either way the flow returns to idle, so later requests are not blocked.
  function onTimeout() {
    if (rerun) startDump();
    else if (attempt < MAX_ATTEMPTS) startDump(attempt + 1);
    else fail(new Error('the amp sent no complete settings dump'));
  }

  function request() {
    if (state === 'idle') startDump();
    else rerun = true;
  }

  function onDumpPayload(payloadBytes) {
    if (state !== 'awaitingDump') return;
    if (rerun) {
      startDump();
      return;
    }
    finish('dump complete');
    const patch = payloadBytes.slice(DUMP_HEADER_BYTES);
    onPatch(parseDumpPatch(patch, nameOf), parsePatchName(patch));
  }

  return {
    get state() {
      return state;
    },

    // Asks the amp for its Actual settings. During a running dump the request is kept and answered with a new dump.
    requestDump: request,

    // Drops a running dump without reporting it (the link is gone).
    cancel() {
      if (state !== 'idle') finish('cancelled');
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

    if (event && event.kind === 'settings_notification') request();
  }
}
