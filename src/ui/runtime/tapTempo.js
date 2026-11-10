const RESET_MS = 2000;
const MAX_TAPS = 4;

// Tap tempo timing. tap() returns the average interval (ms) over the last taps, or null for the first tap of a run.
// A pause longer than RESET_MS starts a new run.
export function createTapTimer({ now = () => performance.now() } = {}) {
  let taps = [];
  return {
    tap() {
      const t = now();
      if (taps.length && t - taps[taps.length - 1] > RESET_MS) taps = [];
      taps = [...taps, t].slice(-MAX_TAPS);
      return taps.length > 1 ? (t - taps[0]) / (taps.length - 1) : null;
    }
  };
}

// The parameter value (0..1) for a tapped interval: linear up to fullScaleMs, where it stays at 1.
export function tapValue(intervalMs, fullScaleMs) {
  return Math.min(1, intervalMs / fullScaleMs);
}
