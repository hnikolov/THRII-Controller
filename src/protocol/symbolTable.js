// Symbol names by id, from src/data/thr10ii_w_symbol_table_1_44_0_a.json (a copy of the JSON form in doc/).
// JSON.parse keeps the last value of a duplicated key, as the .js object literal does.
export function makeNameOf(byId) {
  return key => {
    const name = byId[String(Number(key) >>> 0)];
    return typeof name === 'string' && name ? name : null;
  };
}

// Symbol table (id to name). Some ids appear twice in the file; JSON.parse keeps the last value of each.
export async function loadSymbolTable(url = 'src/data/thr10ii_w_symbol_table_1_44_0_a.json') {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Symbol table HTTP ' + response.status);
  const table = await response.json();
  if (!table || typeof table.byId !== 'object') throw new Error('Invalid symbol table format.');
  return table.byId;
}

export async function loadNameOf(url) {
  return makeNameOf(await loadSymbolTable(url));
}

// The device reports and accepts a control under its plain symbol name (Freq = 228), while the dump names the same
// control with a 'State' suffix (FreqState = 227). This maps a dump id to the plain-name id when there is one.
function plainIdsByName(byId) {
  const plainIdByName = new Map();
  Object.keys(byId).forEach(key => {
    const name = byId[key];
    if (typeof name === 'string' && name && !name.endsWith('State') && !plainIdByName.has(name)) {
      plainIdByName.set(name, Number(key) >>> 0);
    }
  });
  return plainIdByName;
}

// Device and dump names differ in spaces, case and the 'State' suffix (layout "Pre Delay", dump "PreDelayState").
export function normalizedParamName(name) {
  return String(name || '').replace(/\s+/g, '').replace(/State$/, '').toLowerCase();
}

// Id of a unit type, enum value or parameter by its name (for example StereoSquareChorus = 230, Pre Delay = PreDelay's id), or null.
// Names match as the store matches them (normalizedParamName).
// The table holds some names twice, with and without a space (PreDelay 252 and Pre Delay 233, TapeEcho and Tape Echo).
// The amp reports and accepts the one without the space (PreDelay 252 in echo_reverb.txt; a write to 233 is ACKed and
// ignored, upload_preset_with_amp_reply.txt), so that one wins; otherwise the first id of a name wins.
export function makeIdOfName(byId) {
  const idByName = new Map();
  const spaced = new Set();
  Object.keys(byId).forEach(key => {
    const name = byId[key];
    if (typeof name !== 'string' || !name || name.endsWith('State')) return;
    const normalized = normalizedParamName(name);
    const hasSpace = /\s/.test(name);
    if (idByName.has(normalized) && !(spaced.has(normalized) && !hasSpace)) return;
    idByName.set(normalized, Number(key) >>> 0);
    if (hasSpace) spaced.add(normalized);
    else spaced.delete(normalized);
  });
  return name => (idByName.has(normalizedParamName(name)) ? idByName.get(normalizedParamName(name)) : null);
}

export function makeLiveIdOf(byId) {
  const plainIdByName = plainIdsByName(byId);
  return id => {
    const key = Number(id) >>> 0;
    const name = byId[String(key)];
    if (typeof name !== 'string' || !name.endsWith('State')) return key;
    const plain = plainIdByName.get(name.slice(0, -'State'.length));
    return plain === undefined ? key : plain;
  };
}

// The id a dump uses for a parameter: the id of its name with the 'State' suffix (Freq gives FreqState = 227), or null.
// Spaces and case are ignored, as in makeIdOfName.
export function makeStateIdOf(byId) {
  const idByName = new Map();
  Object.keys(byId).forEach(key => {
    const name = byId[key];
    if (typeof name !== 'string' || !name.endsWith('State') || idByName.has(normalizedParamName(name))) return;
    idByName.set(normalizedParamName(name), Number(key) >>> 0);
  });
  return name => (idByName.has(normalizedParamName(name)) ? idByName.get(normalizedParamName(name)) : null);
}
