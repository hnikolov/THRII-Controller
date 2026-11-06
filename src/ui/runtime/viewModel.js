import { findParamByName, findUnitByName } from '../../state/selectors.js';
import { AMP_FAMILIES, AMP_FAMILY_ORDER, RUNTIME_LAYOUT } from './layout.js';

function paramRef(unit, param) {
  return { unitId: unit.id, paramId: param.id, typeCode: param.typeCode };
}

// Enables and mixes of the effects live on GuitarProc in the device model, so a name missing from its own unit is looked up there.
function findControl(state, unit, paramName) {
  const own = unit ? findParamByName(unit, paramName) : null;
  if (own) return { unit, param: own };
  const guitarProc = findUnitByName(state, 'GuitarProc');
  const shared = findParamByName(guitarProc, paramName);
  return shared ? { unit: guitarProc, param: shared } : null;
}

// Knobs show 0..100. A knob names one parameter or a list of candidate names (the first one found in the unit wins).
// A knob with a range (for example the gate threshold, -96..0 dB) maps that range to 0..100.
// Only parameters inside the range are shown and writable; others show "--".
function findKnobControl(state, unit, names) {
  for (const name of [].concat(names)) {
    const found = findControl(state, unit, name);
    if (found) return found;
  }
  return null;
}

function selectKnob(state, unit, knob) {
  const found = findKnobControl(state, unit, knob.param);
  const [min, max] = knob.range || [0, 1];
  const v = found ? found.param.value : null;
  const usable = typeof v === 'number' && v >= min && v <= max;
  return {
    label: knob.label,
    value: usable ? Math.round((v - min) / (max - min) * 100) : null,
    ref: usable ? { ...paramRef(found.unit, found.param), range: knob.range || null } : null
  };
}

// The value written for a knob position (0..100): the range maps back to the parameter's own unit.
export function knobToValue(ref, percent) {
  const [min, max] = ref.range || [0, 1];
  return min + (percent / 100) * (max - min);
}

function selectEnable(state, unit, enableName) {
  const found = findControl(state, unit, enableName);
  return {
    active: found ? found.param.value === true : false,
    ref: found ? paramRef(found.unit, found.param) : null
  };
}

// The LED colour follows the amp family (Classic red, Modern green, Boutique blue).
function ledColorFor(typeName) {
  const family = Object.values(AMP_FAMILIES).find(f => f.models.some(model => model.value === typeName));
  return family ? family.led : 'blue';
}

// The amp LED step: the next family in AMP_FAMILY_ORDER, same position in it (Classic Deluxe -> Boutique Junior 2).
// Returns null for a model that is not in any family.
export function nextFamilyModel(typeName) {
  for (let i = 0; i < AMP_FAMILY_ORDER.length; i += 1) {
    const models = AMP_FAMILIES[AMP_FAMILY_ORDER[i]].models;
    const index = models.findIndex(model => model.value === typeName);
    if (index < 0) continue;
    const next = AMP_FAMILY_ORDER[(i + 1) % AMP_FAMILY_ORDER.length];
    return AMP_FAMILIES[next].models[index].value;
  }
  return null;
}

// The knob set follows the unit's current type: a layout key matches when the normalized type name contains it.
// Returns null when no type is known; the module then shows its default set.
function knobsForType(knobsByType, typeName) {
  const name = String(typeName || '').toLowerCase().replace(/\s+/g, '');
  const key = Object.keys(knobsByType).find(k => name.includes(k));
  return key ? knobsByType[key] : null;
}

// The default values of a type's knobs (the amp's own defaults for a type selected on the device), as parameter names and values.
// Used when a type is picked in the UI, before the amp reports anything.
export function defaultsForType(module, typeName) {
  if (!module.knobsByType) return [];
  const knobs = knobsForType(module.knobsByType, typeName) || [];
  return knobs
    .filter(knob => typeof knob.default === 'number')
    .map(knob => ({ names: [].concat(knob.param), unit: knob.unit || module.unit, value: knobToValue({ range: knob.range || null }, knob.default) }));
}

function selectModule(state, module) {
  const unit = findUnitByName(state, module.unit);
  const enable = selectEnable(state, unit, module.enable);
  const knobConfigs = module.knobsByType
    ? (knobsForType(module.knobsByType, unit && unit.typeName) || module.defaultKnobs)
    : module.knobs;
  return {
    key: module.key,
    unitId: unit ? unit.id : null,
    typeName: unit ? (unit.typeName || null) : null,
    active: enable.active,
    enableRef: enable.ref,
    knobs: knobConfigs.map(knob => selectKnob(state, unit, knob))
  };
}

// Pure: store state in, display model out. Views never read the store directly.
export function selectRuntimeModel(state, layout = RUNTIME_LAYOUT) {
  const ampUnit = findUnitByName(state, layout.amp.unit);
  const cabUnit = findUnitByName(state, layout.amp.cabinetUnit);
  const cabParam = cabUnit ? findParamByName(cabUnit, layout.amp.cabinetParam) : null;
  const cabIndex = cabParam && typeof cabParam.value === 'number' ? cabParam.value : null;

  const modules = {};
  layout.rows.forEach(row => {
    const list = row.type === 'dual' ? row.modules : [row.module];
    list.forEach(module => { modules[module.key] = selectModule(state, module); });
  });

  return {
    amp: {
      unitId: ampUnit ? ampUnit.id : null,
      modelName: ampUnit ? (ampUnit.typeName || null) : null,
      ledColor: ledColorFor(ampUnit ? ampUnit.typeName : null),
      cabinet: {
        name: cabIndex !== null ? (layout.cabinets[cabIndex] ?? null) : null,
        index: cabIndex,
        ref: cabParam ? paramRef(cabUnit, cabParam) : null
      },
      knobs: layout.amp.knobs.map(knob => selectKnob(state, ampUnit, knob))
    },
    modules,
    memory: { activeSlot: state.activeSlot ?? null, name: state.presetName || null, modified: !!state.modified }
  };
}
