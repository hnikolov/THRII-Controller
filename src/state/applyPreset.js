import { writeF32LE } from '../core/bytes.js';
import { thrTypeCode } from '../protocol/constants.js';
import { setUnitType } from './applyDeviceEvent.js';
import { ensureUnit } from './applyDumpPatch.js';
import { findParamByName, findUnitById } from './selectors.js';

const KINDS = {
  float: { typeCode: thrTypeCode.float32, decodedKind: 'float32' },
  bool: { typeCode: thrTypeCode.bool, decodedKind: 'bool' },
  enum: { typeCode: thrTypeCode.enum, decodedKind: 'enum_u32' }
};

export const typeCodeOfKind = kind => KINDS[kind].typeCode;

function rawOf({ kind, value }) {
  if (kind === 'float') return new DataView(writeF32LE(value).buffer).getUint32(0, true) >>> 0;
  return kind === 'bool' ? (value ? 1 : 0) : value >>> 0;
}

// Writes an import plan (presetModel.presetToPlan) into the store with source 'import'. It works on an empty store
// (no amp connected) and on top of device data: units and parameters the plan names are created or updated, others stay.
// The settings then belong to no memory slot and count as modified.
export function applyPresetPlan(store, plan) {
  return store.commit(state => {
    plan.modules.forEach(module => {
      const unit = ensureUnit(state, module.unitId, module.unitName);
      if (module.typeKey != null && unit.typeKey !== module.typeKey) setUnitType(unit, module.typeKey, module.typeName);
      module.params.forEach(planned => {
        const owner = ensureUnit(state, planned.unitId, planned.unitName);
        const param = findParamByName(owner, planned.name)
          || (owner.parameters[String(planned.id)] = { id: planned.id, name: planned.name, ...KINDS[planned.kind], rawU32: 0, value: null });
        param.value = planned.value;
        param.rawU32 = rawOf(planned);
        param.updatedAtMs = Date.now();
      });
    });
    state.presetName = plan.presetName;
    state.activeSlot = null;
    state.modified = true;
  }, 'import');
}

// Where the store (after reading the amp back) differs from the plan: a list of short descriptions, empty when all match.
export function comparePlan(state, plan) {
  const differences = [];
  plan.modules.forEach(module => {
    const unit = findUnitById(state, module.unitId);
    if (module.typeKey != null && (!unit || unit.typeKey !== module.typeKey)) differences.push(`${module.unitName} type`);
    module.params.filter(planned => !planned.local).forEach(planned => {
      const param = findParamByName(findUnitById(state, planned.unitId), planned.name);
      const same = param && (planned.kind === 'float'
        ? Math.abs(param.value - planned.value) <= 1e-3 * Math.max(1, Math.abs(planned.value))
        : param.value === planned.value);
      if (!same) differences.push(`${module.unitName} ${planned.name}`);
    });
  });
  return differences;
}
