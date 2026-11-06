// Deterministic clock for timer-based tests: timers fire in due-time order during advance().
export function createFakeClock() {
  let time = 0;
  let nextId = 1;
  const timers = new Map();

  return {
    now: () => time,
    setTimeout(fn, ms) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { at: time + ms, fn });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advance(ms) {
      const end = time + ms;
      for (;;) {
        let dueId = null;
        let dueAt = Infinity;
        for (const [id, timer] of timers) {
          if (timer.at <= end && timer.at < dueAt) {
            dueAt = timer.at;
            dueId = id;
          }
        }
        if (dueId === null) break;
        const { fn } = timers.get(dueId);
        timers.delete(dueId);
        time = dueAt;
        fn();
      }
      time = end;
    },
    pendingCount: () => timers.size
  };
}
