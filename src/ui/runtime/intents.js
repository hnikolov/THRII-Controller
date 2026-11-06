import { findParamById, findUnitById, findUnitByName } from '../../state/selectors.js';
import { setDefaultParam, setUnitType } from '../../state/applyDeviceEvent.js';

export function paramKey(ref) {
  return `${ref.unitId}:${ref.paramId}`;
}

// Intents are the only way the runtime changes device values. Each one commits to the store
// with source 'ui' first; the write goes through the scheduler only when coalescing is on.
// The shell supplies sendParam, typeKeyOf, paramIdOf and the slot/unit callbacks, so this module imports no protocol code.
export function createRuntimeIntents({
  store,
  flags,
  scheduler = null,
  sendParam,
  typeKeyOf = () => null,
  paramIdOf = () => null,
  onSelectSlot = () => {},
  onRequestDump = () => {},
  onSelectUnit = () => {}
}) {
  return {
    setParam(ref, value) {
      const committed = store.commit(state => {
        const param = findParamById(state, ref.unitId, ref.paramId);
        if (!param) return false;
        param.value = value;
        param.updatedAtMs = Date.now();
        state.modified = true;
        return true;
      }, 'ui');
      if (!committed) return;

      if (flags.coalesceWrites && scheduler) {
        scheduler.request(paramKey(ref));
      } else {
        sendParam(ref.unitId, ref.paramId, value);
      }
    },

    // A unit type pick: the store follows at once (with the type's default values, and the module switched on when enableRef is given).
    // The shell then sends the select frames, the default values and the enable, in that order: the amp does not apply
    // its defaults by itself.
    selectUnit(unitId, typeName, defaults = [], enableRef = null) {
      const typeKey = typeKeyOf(typeName);
      if (typeKey == null) return;
      const current = store.getState();
      const resolved = defaults.map(({ names, unit, value }) => {
        const name = names.find(candidate => paramIdOf(candidate) != null);
        const owner = unit ? findUnitByName(current, unit) : findUnitById(current, unitId);
        return name && owner ? { unitId: owner.id, id: paramIdOf(name), name, value } : null;
      }).filter(Boolean);
      const committed = store.commit(state => {
        const unit = findUnitById(state, unitId);
        if (!unit) return false;
        setUnitType(unit, typeKey, typeName);
        resolved.forEach(param => setDefaultParam(findUnitById(state, param.unitId), param));
        if (enableRef) {
          const enable = findParamById(state, enableRef.unitId, enableRef.paramId);
          if (enable) enable.value = true;
        }
        state.modified = true;
        return true;
      }, 'ui');
      if (!committed) return;
      const writes = resolved.map(param => ({ unitId: param.unitId, paramId: param.id, value: param.value }));
      const enableWrite = enableRef ? { unitId: enableRef.unitId, paramId: enableRef.paramId, typeCode: enableRef.typeCode } : null;
      onSelectUnit(unitId, typeKey, writes, enableWrite);
    },

    // The active slot belongs to the device, so a slot press is only a request, never a local change.
    selectSlot(slot) {
      onSelectSlot(slot);
    },

    requestDump(target) {
      onRequestDump(target);
    }
  };
}
