import { realClock } from '../core/clock.js';

// Last-write-wins coalescing per key. A key is written once, when its burst settles
// (quietMs without a new request) or when maxMs has passed since the burst started.
// The value is read from the shadow store at flush time (readValue), never from the UI.
export function createWriteScheduler({
  quietMs = 40,
  maxMs = 120,
  readValue,
  emitWrite,
  clock = realClock
}) {
  const pending = new Map();

  function clearTimers(entry) {
    clock.clearTimeout(entry.quietTimer);
    clock.clearTimeout(entry.maxTimer);
  }

  function flushKey(key) {
    const entry = pending.get(key);
    if (!entry) return;
    clearTimers(entry);
    pending.delete(key);
    emitWrite(key, readValue(key));
  }

  function request(key) {
    let entry = pending.get(key);
    if (!entry) {
      entry = { quietTimer: null, maxTimer: null };
      entry.maxTimer = clock.setTimeout(() => flushKey(key), maxMs);
      pending.set(key, entry);
    }
    clock.clearTimeout(entry.quietTimer);
    entry.quietTimer = clock.setTimeout(() => flushKey(key), quietMs);
  }

  // Call before any command that is not coalesced (dump request, upload, activation, enable/disable).
  function flushAll() {
    [...pending.keys()].forEach(flushKey);
  }

  return {
    request,
    flushKey,
    flushAll,
    pendingKeys: () => [...pending.keys()]
  };
}
