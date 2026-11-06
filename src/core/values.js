export function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function normalizeOnOff(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value >= 0.5;
  return null;
}
