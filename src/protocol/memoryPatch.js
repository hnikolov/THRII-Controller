import { thrKeys } from './constants.js';
import { parseDumpPatch, parsePatchName, withPatchName } from './dumpParser.js';
import { readU32LEFromBytes } from './frames.js';
import { writeF32LE, writeU32LE } from '../core/bytes.js';

// Patch tokens (6 bytes each) and record sizes, as in the dumps (doc: "Structure of a patch").
const BLOCK_OPEN = [0x03, 0x00, 0x00, 0x80, 0x07, 0x00];
const BLOCK_CLOSE = [0x04, 0x00, 0x00, 0x80, 0x00, 0x00];
const PATCH_END = [0x02, 0x00, 0x00, 0x80, 0x00, 0x00];
const TRTG = [0x54, 0x52, 0x54, 0x47];
const BLOCK_HEADER_BYTES = 24;
const BLOCK_TYPE_OFFSET = 10;
const PARAM_BYTES = 10;
// Type codes of a parameter record in a dump (byte 4): the kinds an import plan uses.
const DUMP_TYPE = { bool: 1, enum: 2, float: 3 };

// A user memory holds fewer settings than the Actual dump (capture dump_slot_1_debug.txt: 613 against 1109 bytes for
// the same sound). The amp also accepts an upload of the whole Actual dump to a memory. Patches of both layouts
// exist in memories, so a check compares settings, never bytes.
// A memory has these blocks only, GuitarProc with exactly these parameters in this order, and in the other blocks the
// float parameters in name order (the enum settings, the Tuner block and the EQ blocks are left out).
const MEMORY_UNITS = [thrKeys.unit.guitarProc, thrKeys.unit.fx1, thrKeys.unit.amp, thrKeys.unit.fx2, thrKeys.unit.fx3, thrKeys.unit.fx4];
const GUITAR_PROC_PARAMS = [
  'FX1EnableState', 'FX2EnableState', 'FX2MixState', 'FX3EnableState', 'FX3MixState', 'FX4EnableState',
  'FX4WetSendState', 'GateEnableState', 'SpkSimTypeState', 'DecayState', 'ThreshState'
];

const matchesAt = (raw, offset, token) => token.every((byte, i) => raw[offset + i] === byte);
const keyOf = record => record[0] | (record[1] << 8);
const byName = nameOf => (a, b) => {
  const [nameA, nameB] = [nameOf(keyOf(a)) || '', nameOf(keyOf(b)) || ''];
  return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
};

// The patch up to and including the TRTG marker (name and meta values), and its blocks: unit key, the block header
// without its parameter count, and the parameter records as they are in the patch.
function readBlocks(raw) {
  const start = raw.findIndex((_, i) => matchesAt(raw, i, TRTG));
  if (start < 0) throw new Error('The patch has no parameter section.');
  const blocks = [];
  let p = start + TRTG.length;
  while (p < raw.length) {
    if ([BLOCK_OPEN, BLOCK_CLOSE, PATCH_END].some(token => matchesAt(raw, p, token))) {
      p += BLOCK_OPEN.length;
      continue;
    }
    const isBlock = raw[p + 4] === 5 && raw[p + 14] === 6 && p + BLOCK_HEADER_BYTES <= raw.length;
    if (!isBlock) throw new Error('The patch has an unknown record at byte ' + p + '.');
    const count = readU32LEFromBytes(raw, p + 20);
    const paramsAt = p + BLOCK_HEADER_BYTES;
    if (paramsAt + count * PARAM_BYTES > raw.length) throw new Error('The patch ends inside a block.');
    blocks.push({
      unitKey: keyOf(raw.subarray(p)),
      header: raw.subarray(p, p + 20),
      params: Array.from({ length: count }, (_, i) => raw.subarray(paramsAt + i * PARAM_BYTES, paramsAt + (i + 1) * PARAM_BYTES))
    });
    p = paramsAt + count * PARAM_BYTES;
  }
  return { prefix: raw.subarray(0, start + TRTG.length), blocks };
}

// The six blocks a memory holds, with the records a memory keeps, in memory order.
function memoryBlocks(blocks, nameOf) {
  return MEMORY_UNITS.map(unitKey => {
    const block = blocks.find(candidate => candidate.unitKey === unitKey);
    if (!block) throw new Error('The amp settings have no ' + (nameOf(unitKey) || unitKey) + ' block.');
    if (unitKey !== thrKeys.unit.guitarProc) {
      return { ...block, params: block.params.filter(record => record[4] === DUMP_TYPE.float).sort(byName(nameOf)) };
    }
    const params = GUITAR_PROC_PARAMS.map(name => {
      const record = block.params.find(candidate => nameOf(keyOf(candidate)) === name);
      if (!record) throw new Error('The amp settings have no ' + name + '.');
      return record;
    });
    return { ...block, params };
  });
}

function writePatch(prefix, blocks) {
  const parts = [prefix];
  blocks.forEach(block => {
    parts.push(BLOCK_OPEN, block.header, writeU32LE(block.params.length), ...block.params);
    // The GuitarProc block stays open around the others; it is closed after the last one.
    if (block.unitKey !== thrKeys.unit.guitarProc) parts.push(BLOCK_CLOSE);
  });
  parts.push(BLOCK_CLOSE, PATCH_END);

  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  parts.forEach(part => {
    out.set(part, offset);
    offset += part.length;
  });
  return out;
}

// The patch a user memory holds for the settings of an Actual dump: same name, same values, memory layout.
// nameOf maps a symbol id to its name. For the Actual dump of a recalled memory this gives that memory's own bytes
// (checked against the capture). A patch that already has the memory layout comes back unchanged.
export function toMemoryPatch(actualPatch, nameOf) {
  const { prefix, blocks } = readBlocks(actualPatch);
  return writePatch(prefix, memoryBlocks(blocks, nameOf));
}

function record(key, kind, value) {
  const out = new Uint8Array(PARAM_BYTES);
  out[0] = key & 0xff;
  out[1] = (key >> 8) & 0xff;
  out[4] = DUMP_TYPE[kind];
  out.set(kind === 'float' ? writeF32LE(value) : writeU32LE(kind === 'bool' ? (value ? 1 : 0) : value), 6);
  return out;
}

// The memory-layout patch for an import plan (presetModel.presetToPlan), for one upload to the amp.
// templatePatch is a dump the amp sent (its Actual settings): the name and meta section, the block headers, and every
// value the preset does not name come from it. A unit whose type changes gets the preset's type and only the
// preset's values for it. stateIdOf maps a parameter name to the id the dumps use (the 'State' id).
// Throws when the plan has a parameter the dumps do not know.
export function buildPresetPatch(templatePatch, plan, { nameOf, stateIdOf }) {
  const { prefix, blocks } = readBlocks(templatePatch);
  const memory = memoryBlocks(blocks, nameOf).map(block => ({ ...block, header: Uint8Array.from(block.header), params: block.params.map(r => Uint8Array.from(r)) }));
  const blockOf = unitId => memory.find(block => block.unitKey === unitId);

  plan.modules.forEach(module => {
    const block = blockOf(module.unitId);
    if (block && module.typeKey != null && keyOf(block.header.subarray(BLOCK_TYPE_OFFSET)) !== module.typeKey) {
      block.header[BLOCK_TYPE_OFFSET] = module.typeKey & 0xff;
      block.header[BLOCK_TYPE_OFFSET + 1] = (module.typeKey >> 8) & 0xff;
      block.params = [];
    }
  });
  plan.modules.flatMap(module => module.params).filter(planned => !planned.local).forEach(planned => {
    const block = blockOf(planned.unitId);
    const key = stateIdOf(planned.name);
    if (!block || key == null) throw new Error('No dump parameter for ' + planned.unitName + ' ' + planned.name + '.');
    const fresh = record(key, planned.kind, planned.value);
    const index = block.params.findIndex(existing => keyOf(existing) === key);
    if (index >= 0) block.params[index] = fresh;
    else if (block.unitKey === thrKeys.unit.guitarProc) throw new Error('A memory does not keep ' + planned.name + '.');
    else block.params.push(fresh);
  });
  memory.filter(block => block.unitKey !== thrKeys.unit.guitarProc).forEach(block => block.params.sort(byName(nameOf)));

  return withPatchName(writePatch(prefix, memory), plan.presetName);
}

// Name, unit types and parameter values of a patch, as comparable (and readable) texts.
function settingsOf(patch, nameOf) {
  return [
    'name ' + parsePatchName(patch),
    ...parseDumpPatch(patch, nameOf).map(entry => (entry.kind === 'unit_type'
      ? `${nameOf(entry.unitKey)} type ${nameOf(entry.unitTypeKey)}`
      : `${nameOf(entry.unitKey)} ${nameOf(entry.pKey)} = ${entry.value} (0x${entry.rawValue.toString(16)})`))
  ];
}

// The check after an upload to a memory: the name, unit types and values a memory keeps of the patch that was sent,
// which the patch read back (the memory, or the Actual settings after recalling it) does not hold. Empty when it holds
// them all. The bytes are not compared: the same settings come in more than one layout.
export function memoryDifferences(readPatch, sentPatch, nameOf) {
  const stored = new Set(settingsOf(readPatch, nameOf));
  return settingsOf(toMemoryPatch(sentPatch, nameOf), nameOf).filter(setting => !stored.has(setting));
}

export function memoryHolds(readPatch, sentPatch, nameOf) {
  return memoryDifferences(readPatch, sentPatch, nameOf).length === 0;
}
