export function ensureUnit(state, unitKey, name) {
  const key = String(unitKey);
  if (!state.units[key]) {
    state.units[key] = { id: unitKey, name: name || ('u#' + key), typeKey: null, typeName: null, parameters: {} };
  }
  const unit = state.units[key];
  if (name) unit.name = name;
  return unit;
}

// Replaces the device units with the ones described by the dump entries (source 'dump').
// Parameters are keyed by the device's live id (liveIdOf): the id the amp reports and accepts writes for.
// The dump also sets the preset name and clears the modified flag: the device state is now known.
export function applyDumpPatch(store, entries, nameOf, presetName = null, liveIdOf = id => id) {
  return store.commit(state => {
    state.units = {};
    state.presetName = presetName || null;
    state.modified = false;
    entries.forEach(entry => {
      const unit = ensureUnit(state, entry.unitKey, nameOf(entry.unitKey));
      if (entry.kind === 'unit_type') {
        unit.typeKey = entry.unitTypeKey;
        unit.typeName = nameOf(entry.unitTypeKey) || ('v#' + entry.unitTypeKey);
        return;
      }
      const id = liveIdOf(entry.pKey);
      unit.parameters[String(id)] = {
        id,
        name: nameOf(id) || nameOf(entry.pKey) || ('p#' + id),
        typeCode: entry.typeCode,
        decodedKind: entry.decodedKind,
        rawU32: entry.rawValue,
        value: entry.value
      };
    });
  }, 'dump');
}
