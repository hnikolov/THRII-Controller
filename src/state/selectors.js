function latestUpdateMs(unit) {
  return Math.max(0, ...Object.values(unit.parameters || {}).map(p => p.updatedAtMs || 0));
}

function newestFirst(units) {
  return units.sort((a, b) => latestUpdateMs(b) - latestUpdateMs(a));
}

export function readShadowParamByName(state, paramName) {
  const units = Object.values(state.units || {});
  let latest = null;
  units.forEach(unit => {
    Object.values(unit.parameters || {}).forEach(param => {
      if (param.name !== paramName) return;
      if (!latest || (param.updatedAtMs || 0) > (latest.updatedAtMs || 0)) {
        latest = { unit, param };
      }
    });
  });
  return latest;
}

export function getLatestShadowUnitByName(state, unitName) {
  const units = Object.values(state.units || {}).filter(u => u.name === unitName);
  if (!units.length) return null;
  return newestFirst(units)[0];
}

export function getLatestShadowUnitById(state, unitId) {
  const key = Number(unitId) >>> 0;
  const units = Object.values(state.units || {}).filter(u => (Number(u.id) >>> 0) === key);
  if (!units.length) return null;
  return newestFirst(units)[0];
}

export function buildShadowParameterIndex(state) {
  const out = new Map();
  const units = Object.values(state.units || {});
  units.forEach(unit => {
    const unitKey = Number(unit.id) >>> 0;
    Object.values(unit.parameters || {}).forEach(param => {
      const pKey = Number(param.id) >>> 0;
      const mapKey = unitKey + ':' + pKey;
      out.set(mapKey, {
        unitKey,
        pKey,
        typeCode: Number(param.typeCode) >>> 0,
        rawU32: Number(param.rawU32) >>> 0,
        decodedKind: param.decodedKind || null,
        value: param.value
      });
    });
  });
  return out;
}

export function findUnitById(state, unitId) {
  return (state.units || {})[String(Number(unitId) >>> 0)] || null;
}

export function findUnitByName(state, unitName) {
  return getLatestShadowUnitByName(state, unitName);
}

export function findParamById(state, unitId, paramId) {
  const unit = findUnitById(state, unitId);
  return unit ? (unit.parameters || {})[String(Number(paramId) >>> 0)] || null : null;
}

// Device and dump names differ in spaces, case and the 'State' suffix (layout "Pre Delay", dump "PreDelayState").
export function normalizedParamName(name) {
  return String(name || '').replace(/\s+/g, '').replace(/State$/, '').toLowerCase();
}

export function findParamByName(unit, paramName) {
  if (!unit) return null;
  const params = Object.values(unit.parameters || {});
  return params.find(p => p.name === paramName)
    || params.find(p => normalizedParamName(p.name) === normalizedParamName(paramName))
    || null;
}
