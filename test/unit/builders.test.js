import { it, assertEqual, assertDeepEqual } from '../support/assert.js';
import * as builders from '../../src/protocol/builders.js';
import { thrActivateSequenceHex } from '../../src/protocol/constants.js';
import { toHex } from '../../src/core/bytes.js';
import { setDeviceIdentity } from '../../src/protocol/identity.js';

const loadJson = async (path) => (await fetch(path)).json();

const resolveArg = (arg) => (arg && arg.pattern === 'index-mod-256')
  ? Uint8Array.from({ length: arg.length }, (_, i) => i & 0xff)
  : arg;

it('every builder case reproduces its golden frames', async () => {
  setDeviceIdentity({ family: 0x24, model: 0x01 });
  const cases = await loadJson('/test/fixtures/builders.cases.json');
  const golden = await loadJson('/test/fixtures/builders.golden.json');
  const mismatches = [];
  for (const c of cases) {
    const args = c.args.map(resolveArg);
    if (c.options) args.push(c.options);
    const result = builders[c.fn](...args);
    const frames = (Array.isArray(result) ? result : [result]).map(toHex);
    if (JSON.stringify(frames) !== JSON.stringify(golden[c.name])) mismatches.push(c.name);
  }
  assertDeepEqual(mismatches, [], 'golden mismatches');
});

it('activation constant matches golden activation frames', async () => {
  const golden = await loadJson('/test/fixtures/builders.golden.json');
  assertDeepEqual(thrActivateSequenceHex, golden.activation, 'activation frames');
});

it('encodeShadowRawU32 encodes float32 values as raw bits', () => {
  assertEqual(builders.encodeShadowRawU32(4, 1), 0x3f800000, 'float32 1.0');
});

it('dump target normalization accepts actual and slot references', () => {
  assertEqual(builders.dumpTargetRefToU32({ kind: 'actual' }), 0xffffffff, 'actual');
  assertEqual(builders.dumpTargetRefToU32({ kind: 'slot', value: 4 }), 4, 'slot 5');
});
