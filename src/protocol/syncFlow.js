import { realClock } from '../core/clock.js';
import { buildRequestUserSettingsDump } from './builders.js';
import { createDumpAssembler } from './dumpAssembly.js';
import { parseIncomingThrFrame } from './frames.js';
import { parseDumpPatch, parsePatchName } from './dumpParser.js';

const DUMP_HEADER_BYTES = 16;
export const DUMP_TIMEOUT_MS = 4000;
const MAX_ATTEMPTS = 2;
const ACTUAL = { kind: 'actual' };

// Reads settings dumps from the amp, one at a time; further requests wait in a queue.
// - The Actual settings are read and applied (onPatch) after activation, after a slot pick in the app (requestDump),
//   and after a slot press on the amp (flag slotSync).
// - read(target) returns the raw patch of the Actual settings or of a memory slot ({ kind: 'slot', value: 0..4 }).
// The amp's "settings changed?" answer is not used: after a memory switch it reports no change.
// Only dump requests are sent, so no parameter writes can echo back from here.
export function createSyncFlow({ send, nameOf, onPatch, onError = () => {}, onState = () => {}, clock = realClock }) {
  const assembler = createDumpAssembler({ now: clock.now });
  let state = 'idle';
  // The running read: { target, apply, attempt, rerun, resolve, reject }.
  // rerun: an Actual request arrived while this applied read was running. Its dump may show the settings from before
  // that request, so it is dropped and read again.
  let job = null;
  let timer = null;
  const queue = [];

  function setState(next, note = '') {
    state = next;
    onState(next, note);
  }

  function begin(next) {
    job = next;
    job.attempt += 1;
    job.rerun = false;
    clock.clearTimeout(timer);
    timer = clock.setTimeout(onTimeout, DUMP_TIMEOUT_MS);
    setState('awaitingDump', job.attempt > 1 ? 'retry' : '');
    const label = job.target.kind === 'actual' ? 'TX sync: actual dump' : `TX read memory ${job.target.value + 1}`;
    try {
      Promise.resolve(send(buildRequestUserSettingsDump(job.target), label)).catch(fail);
    } catch (err) {
      fail(err);
    }
  }

  function restart() {
    job.attempt = 0;
    begin(job);
  }

  // Ends the running read and starts the next one in the queue. Returns the ended read.
  function end(note) {
    const done = job;
    clock.clearTimeout(timer);
    timer = null;
    job = null;
    setState('idle', note);
    if (queue.length) begin(queue.shift());
    return done;
  }

  function fail(err) {
    if (!job) return;
    const done = end('error: ' + err.message);
    done.reject(err);
    if (done.apply) onError(err);
  }

  // A dump that does not complete (a lost BLE packet, for example) is asked for once more, then reported.
  // Either way the flow moves on, so later requests are not blocked.
  function onTimeout() {
    if (job.rerun) restart();
    else if (job.attempt < MAX_ATTEMPTS) begin(job);
    else fail(new Error('the amp sent no complete settings dump'));
  }

  function read(target = ACTUAL, { apply = false } = {}) {
    const next = { target, apply, attempt: 0, rerun: false };
    next.promise = new Promise((resolve, reject) => {
      next.resolve = resolve;
      next.reject = reject;
    });
    // Callers that do not wait for the result (a slot press on the amp) must not leave an unhandled rejection.
    next.promise.catch(() => {});
    if (job) queue.push(next);
    else begin(next);
    return next.promise;
  }

  // One applied Actual read serves every request that arrives while it runs or waits.
  function requestActual() {
    if (job && job.apply) {
      job.rerun = true;
      return job.promise;
    }
    const waiting = queue.find(queued => queued.apply);
    return waiting ? waiting.promise : read(ACTUAL, { apply: true });
  }

  function onDumpPayload(payloadBytes) {
    if (!job) return;
    if (job.rerun) {
      restart();
      return;
    }
    const patch = payloadBytes.slice(DUMP_HEADER_BYTES);
    const done = end(job.apply ? 'dump complete' : 'read complete');
    try {
      if (done.apply) onPatch(parseDumpPatch(patch, nameOf), parsePatchName(patch));
      done.resolve(patch);
    } catch (err) {
      done.reject(err);
      onError(err);
    }
  }

  return {
    get state() {
      return state;
    },

    // Reads the Actual settings and applies them; the promise gives the raw patch. During a running applied read the
    // request makes that read start over.
    requestDump: requestActual,

    // The raw patch of a target, as a promise. With apply (Actual only) the dump also goes to onPatch.
    read,

    // Drops the running and the waiting reads without reporting them (the link is gone).
    cancel() {
      const dropped = [job, ...queue.splice(0)].filter(Boolean);
      clock.clearTimeout(timer);
      timer = null;
      job = null;
      if (dropped.length) setState('idle', 'cancelled');
      dropped.forEach(read => read.reject(new Error('cancelled')));
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

    if (event && event.kind === 'settings_notification') requestActual();
  }
}
