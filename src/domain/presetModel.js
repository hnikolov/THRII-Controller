import { findParamByName, findUnitByName } from '../state/selectors.js';

// Preset names: printable ASCII, cut at PRESET_NAME_MAX.
export const PRESET_NAME_MAX = 20;

export function sanitizePresetName(text) {
  return String(text ?? '').replace(/[^\x20-\x7e]/g, '').slice(0, PRESET_NAME_MAX);
}

// The file name for a preset: its name without the characters file names do not allow (\ / : * ? " < > |).
export function presetFileName(presetName) {
  return (presetName.replace(/[\\/:*?"<>|]/g, '').trim() || 'Preset') + '.thrl6p';
}

const FORMAT = {
  schema: 'L6Preset',
  version: 5,
  meta: { original: 0, pbn: 0, premium: 0 },
  device: 2359298,
  deviceVersion: 20971617
};
const DEFAULT_TEMPO = 110;
// The tempo has no device parameter in the live model. It is kept under the legacy synthetic id so an import can be exported again.
const GLOBAL_UNIT = { name: 'Global', id: 0xffffffff };
const TEMPO = { name: 'THRPresetParamTempo', id: 0xfffff001 };
// Enables and mixes of every module live on this unit in the device model.
const SHARED_UNIT = 'GuitarProc';

// One row per tone group of a .thrl6p file, in file order.
// typed: '@asset' is the unit type (amp model, effect type). asset: the fixed '@asset' of an untyped group.
// enable / wetDry: the GuitarProc parameter behind '@enabled' / '@wetDry'. enums: whole-number parameters. only: the group's own parameters on a shared unit.
const GROUPS = [
  { group: 'THRGroupAmp', unit: 'Amp', typed: true },
  { group: 'THRGroupCab', unit: SHARED_UNIT, asset: 'speakerSimulator', enums: ['SpkSimType'], only: ['SpkSimType'] },
  { group: 'THRGroupFX1Compressor', unit: 'FX1', asset: 'RedComp', enable: 'FX1Enable' },
  { group: 'THRGroupFX2Effect', unit: 'FX2', typed: true, enable: 'FX2Enable', wetDry: 'FX2Mix' },
  { group: 'THRGroupFX3EffectEcho', unit: 'FX3', typed: true, enable: 'FX3Enable', wetDry: 'FX3Mix' },
  { group: 'THRGroupFX4EffectReverb', unit: 'FX4', typed: true, enable: 'FX4Enable', wetDry: 'FX4WetSend' },
  { group: 'THRGroupGate', unit: SHARED_UNIT, asset: 'noiseGate', enable: 'GateEnable', only: ['Decay', 'Thresh'] }
];

// Checks a parsed .thrl6p file and returns { presetName, tone }.
export function parseThrl6Preset(json) {
  if (!json || typeof json !== 'object') throw new Error('Invalid preset JSON content.');
  if (json.schema !== FORMAT.schema) throw new Error('Invalid preset schema. Expected L6Preset.');
  const tone = json.data && json.data.tone && typeof json.data.tone === 'object' ? json.data.tone : null;
  if (!tone || typeof tone.THRGroupAmp !== 'object') throw new Error('Preset is missing required tone.THRGroupAmp section.');
  const name = json.data.meta && typeof json.data.meta.name === 'string' ? sanitizePresetName(json.data.meta.name).trim() : '';
  return { presetName: name || 'Imported Preset', tone };
}

// Turns a preset into an apply plan: per module its unit, its type (for typed groups) and its parameters, in the order
// they are sent to the amp (type, values, mix, on/off). kind is 'float', 'bool' or 'enum'; local parameters are never sent.
// idOfName resolves a unit, type or parameter name to its device id; isKnownType(unitName, typeName) accepts a unit type.
// Throws, naming everything it cannot resolve: a plan is either complete or not made.
export function presetToPlan(preset, { idOfName, isKnownType = () => true }) {
  const unknown = [];
  const idOf = name => {
    const id = idOfName(name);
    if (id == null) unknown.push(name);
    return id;
  };

  const modules = GROUPS.filter(row => preset.tone[row.group] && typeof preset.tone[row.group] === 'object').map(row => {
    const block = preset.tone[row.group];
    const params = [];
    const add = (unitName, name, value, kind) => params.push({ unitName, unitId: idOf(unitName), id: idOf(name), name, value, kind });

    Object.keys(block).filter(key => !key.startsWith('@')).sort().forEach(name => {
      const value = block[name];
      if (typeof value !== 'number' || !Number.isFinite(value) || (row.only && !row.only.includes(name))) {
        unknown.push(`${row.group}.${name}`);
      } else if ((row.enums || []).includes(name)) {
        add(row.unit, name, Math.max(0, Math.round(value)), 'enum');
      } else {
        add(row.unit, name, value, 'float');
      }
    });
    if (row.wetDry && '@wetDry' in block) add(SHARED_UNIT, row.wetDry, Math.min(1, Math.max(0, Number(block['@wetDry']) || 0)), 'float');
    if (row.enable && '@enabled' in block) add(SHARED_UNIT, row.enable, block['@enabled'] === true || block['@enabled'] === 1, 'bool');

    const typeName = row.typed ? block['@asset'] : null;
    if (row.typed && (typeof typeName !== 'string' || !isKnownType(row.unit, typeName))) unknown.push(`${row.group}.@asset ${typeName}`);
    return {
      unitName: row.unit,
      unitId: idOf(row.unit),
      typeName,
      typeKey: row.typed && typeof typeName === 'string' ? idOf(typeName) : null,
      params
    };
  });

  const tempo = preset.tone.global && preset.tone.global[TEMPO.name];
  if (typeof tempo === 'number' && Number.isFinite(tempo)) {
    modules.push({
      unitName: GLOBAL_UNIT.name,
      unitId: GLOBAL_UNIT.id,
      typeName: null,
      typeKey: null,
      params: [{ unitName: GLOBAL_UNIT.name, unitId: GLOBAL_UNIT.id, id: TEMPO.id, name: TEMPO.name, value: Math.max(30, Math.min(300, Math.round(tempo))), kind: 'enum', local: true }]
    });
  }

  if (unknown.length) throw new Error('The preset has names this app does not know: ' + [...new Set(unknown)].join(', '));
  return { presetName: preset.presetName, modules };
}

// Six significant digits, as in THR Remote's files (0.0144242, 0.409973).
const rounded = value => Number(Number(value).toPrecision(6));
const plainName = name => String(name).replace(/State$/, '');

// The group's own knob values, by plain name in alphabetical order. Enables, mixes and enum settings have their own fields.
function knobValues(unit, row) {
  const out = {};
  Object.values(unit.parameters || {})
    .map(param => ({ name: plainName(param.name), param }))
    .filter(({ name, param }) => typeof param.value === 'number'
      && (row.only ? row.only.includes(name) : param.decodedKind !== 'enum_u32' && !/enable|mix|wetsend|wetdry|spksim/i.test(name)))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .forEach(({ name, param }) => { out[name] = (row.enums || []).includes(name) ? param.value : rounded(param.value); });
  return out;
}

// The .thrl6p object for the store's current settings. Reads the store only.
export function storeToPreset(state, presetName) {
  if (!findUnitByName(state, 'Amp')) throw new Error('There are no settings to export yet.');
  const shared = findUnitByName(state, SHARED_UNIT);
  const tone = {};

  GROUPS.forEach(row => {
    const unit = findUnitByName(state, row.unit);
    if (!unit) return;
    const block = { '@asset': row.typed ? unit.typeName : (row.only ? row.asset : (unit.typeName || row.asset)) };
    const control = name => (shared && findParamByName(shared, name)) || findParamByName(unit, name);
    if (row.enable) block['@enabled'] = (control(row.enable) || {}).value === true;
    if (row.wetDry) block['@wetDry'] = rounded((control(row.wetDry) || {}).value || 0);
    tone[row.group] = { ...block, ...knobValues(unit, row) };
  });

  const tempo = findParamByName(findUnitByName(state, GLOBAL_UNIT.name), TEMPO.name);
  tone.global = { [TEMPO.name]: tempo ? tempo.value : DEFAULT_TEMPO };

  return {
    data: {
      device: FORMAT.device,
      device_version: FORMAT.deviceVersion,
      meta: { name: presetName, tnid: 0 },
      tone
    },
    meta: { ...FORMAT.meta },
    schema: FORMAT.schema,
    version: FORMAT.version
  };
}

// File text in the layout THR Remote writes (one-space indent, trailing newline).
export function presetToText(preset) {
  return JSON.stringify(preset, null, 1) + '\n';
}
