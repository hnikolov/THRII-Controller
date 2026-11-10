// The real timers, in the shape timer-driven modules take as `clock` (tests pass test/support/fakeClock.js instead).
export const realClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: id => clearTimeout(id)
};
