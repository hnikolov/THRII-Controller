import { normalizedParamName } from '../protocol/symbolTable.js';

function latestUpdateMs(unit) {
  return Math.max(0, ...Object.values(unit.parameters || {}).map(p => p.updatedAtMs || 0));
}

function newestFirst(units) {
  return units.sort((a, b) => latestUpdateMs(b) - latestUpdateMs(a));
}

export function findUnitById(state, unitId) {
  return (state.units || {})[String(Number(unitId) >>> 0)] || null;
}

// Several units may carry the same name; the one with the most recent parameter update wins.
export function findUnitByName(state, unitName) {
  const units = Object.values(state.units || {}).filter(u => u.name === unitName);
  return units.length ? newestFirst(units)[0] : null;
}

export function findParamById(state, unitId, paramId) {
  const unit = findUnitById(state, unitId);
  return unit ? (unit.parameters || {})[String(Number(paramId) >>> 0)] || null : null;
}

export function findParamByName(unit, paramName) {
  if (!unit) return null;
  const params = Object.values(unit.parameters || {});
  return params.find(p => p.name === paramName)
    || params.find(p => normalizedParamName(p.name) === normalizedParamName(paramName))
    || null;
}
