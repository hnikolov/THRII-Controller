import { findParamById, findUnitById, normalizedParamName } from './selectors.js';
import { writeF32LE } from '../core/bytes.js';
import { thrTypeCode } from '../protocol/constants.js';

// The device reports some controls under a different id than the dump uses for the same name (the knob
// reports Master as 76, the dump has MasterState as 83). Without a direct id match, the parameter is matched
// by name inside the same unit. nameOf maps an id to its symbol name (optional).
function findLiveParam(state, unitId, paramId, nameOf) {
  const direct = findParamById(state, unitId, paramId);
  if (direct || !nameOf) return direct;
  const wanted = nameOf(paramId);
  const unit = findUnitById(state, unitId);
  if (!wanted || !unit) return null;
  return Object.values(unit.parameters || {})
    .find(p => normalizedParamName(p.name) === normalizedParamName(wanted)) || null;
}

// A parameter the store does not know yet (for example after an effect type switch) is added with its symbol name and the event's type.
function addLiveParam(state, event, nameOf) {
  const unit = findUnitById(state, event.unitId);
  const name = nameOf && nameOf(event.paramId);
  if (!unit || !name) return null;
  unit.parameters = unit.parameters || {};
  const param = {
    id: event.paramId,
    name,
    typeCode: event.typeCode,
    decodedKind: typeof event.value === 'boolean' ? 'bool' : 'number',
    rawU32: 0,
    value: null
  };
  unit.parameters[String(event.paramId)] = param;
  return param;
}

// Writes device events into the store with source 'device'. Parameters without a symbol name are ignored.
export function applyDeviceEvent(store, event, nameOf = null) {
  if (!event) return false;

  if (event.kind === 'parameter_change') {
    return store.commit(state => {
      const param = findLiveParam(state, event.unitId, event.paramId, nameOf) || addLiveParam(state, event, nameOf);
      if (!param) return false;
      // A bool parameter (decodedKind 'bool') is on when the raw word is non-zero, whatever type the event carries.
      // The stored typeCode is kept: the write path encodes values with it.
      param.value = param.decodedKind === 'bool' ? event.rawU32 !== 0 : event.value;
      param.rawU32 = event.rawU32;
      param.updatedAtMs = Date.now();
      state.modified = true;
      return true;
    }, 'device');
  }

  if (event.kind === 'settings_notification') {
    if (event.slot < 0 || event.slot > 4) return false;
    store.commit(state => { state.activeSlot = event.slot + 1; }, 'device');
    return true;
  }

  // The amp model (Amp unit) or an effect type changed on the amp. The amp sends the new parameters with the switch.
  // An effect unit (FX2 to FX4) holds only its type's parameters, so the old ones are dropped first.
  if (event.kind === 'unit_type_change') {
    return store.commit(state => {
      const unit = findUnitById(state, event.unitId);
      if (!unit) return false;
      setUnitType(unit, event.typeKey, (nameOf && nameOf(event.typeKey)) || ('v#' + event.typeKey));
      return true;
    }, 'device');
  }

  return false;
}

// Shared by device events and UI picks. An effect unit (FX2 to FX4) drops the parameters of its old type.
// Its enable and mix type stay: they belong to the module (on/off), not to the type.
export function setUnitType(unit, typeKey, typeName) {
  if (/^FX[234]$/.test(unit.name)) {
    unit.parameters = Object.fromEntries(
      Object.entries(unit.parameters || {}).filter(([, param]) => /enable|mixtype/i.test(param.name))
    );
  }
  unit.typeKey = typeKey;
  unit.typeName = typeName;
}

// A default value the amp uses for a parameter when a type is selected (the amp does not send it).
// Stored as a float, like the knobs' parameters on the device.
export function setDefaultParam(unit, { id, name, value }) {
  unit.parameters = unit.parameters || {};
  const param = unit.parameters[String(id)] || { id, name, typeCode: thrTypeCode.float32, decodedKind: 'number', rawU32: 0, value: null };
  param.value = value;
  param.rawU32 = new DataView(writeF32LE(value).buffer).getUint32(0, true) >>> 0;
  param.updatedAtMs = Date.now();
  unit.parameters[String(id)] = param;
}
