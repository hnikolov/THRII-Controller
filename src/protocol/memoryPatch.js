import { thrKeys } from './constants.js';
import { parseDumpPatch, parsePatchName } from './dumpParser.js';
import { readU32LEFromBytes } from './frames.js';
import { writeU32LE } from '../core/bytes.js';

// Patch tokens (6 bytes each) and record sizes, as in the dumps (doc: "Structure of a patch").
const BLOCK_OPEN = [0x03, 0x00, 0x00, 0x80, 0x07, 0x00];
const BLOCK_CLOSE = [0x04, 0x00, 0x00, 0x80, 0x00, 0x00];
const PATCH_END = [0x02, 0x00, 0x00, 0x80, 0x00, 0x00];
const TRTG = [0x54, 0x52, 0x54, 0x47];
const BLOCK_HEADER_BYTES = 24;
const PARAM_BYTES = 10;
const DUMP_FLOAT = 3;

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

// The patch a user memory holds for the settings of an Actual dump: same name, same values, memory layout.
// nameOf maps a symbol id to its name. For the Actual dump of a recalled memory this gives that memory's own bytes
// (checked against the capture). A patch that already has the memory layout comes back unchanged.
export function toMemoryPatch(actualPatch, nameOf) {
  const { prefix, blocks } = readBlocks(actualPatch);
  const parts = [prefix];

  MEMORY_UNITS.forEach(unitKey => {
    const block = blocks.find(candidate => candidate.unitKey === unitKey);
    if (!block) throw new Error('The amp settings have no ' + (nameOf(unitKey) || unitKey) + ' block.');
    const named = block.params.map(record => ({ name: nameOf(keyOf(record)) || '', record }));
    let chosen;
    if (unitKey === thrKeys.unit.guitarProc) {
      chosen = GUITAR_PROC_PARAMS.map(name => {
        const hit = named.find(param => param.name === name);
        if (!hit) throw new Error('The amp settings have no ' + name + '.');
        return hit.record;
      });
    } else {
      chosen = named.filter(param => param.record[4] === DUMP_FLOAT)
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        .map(param => param.record);
    }
    parts.push(BLOCK_OPEN, block.header, writeU32LE(chosen.length), ...chosen);
    // The GuitarProc block stays open around the others; it is closed after the last one.
    if (unitKey !== thrKeys.unit.guitarProc) parts.push(BLOCK_CLOSE);
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
