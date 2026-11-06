import { it, assertDeepEqual, assertTrue } from '../support/assert.js';
import { parseSysExHex } from '../../src/core/bytes.js';
import { decodeIncomingEvent } from '../../src/protocol/incoming.js';
import { makeNameOf } from '../../src/protocol/symbolTable.js';
import { setDeviceIdentity } from '../../src/protocol/identity.js';
import { normalizedParamName } from '../../src/state/selectors.js';
import { RUNTIME_LAYOUT } from '../../src/ui/runtime/layout.js';

// Sweep capture (test/fixtures/transcripts/chorus_flanger_phaser_tremolo.txt): the amp's own parameter reports for
// the effect unit (FX2) as the type goes Chorus -> Flanger -> Phaser -> Tremolo. The capture starts on the chorus.
const SWEEP_TYPES = { StereoSquareChorus: 'chorus', L6Flanger: 'flanger', Phaser: 'phaser', BiasTremolo: 'tremolo' };

// The rate parameter per type, as the amp reports it: Freq for chorus and flanger, Speed for phaser and tremolo.
const RATE_PARAM = { StereoSquareChorus: 'Freq', L6Flanger: 'Freq', Phaser: 'Speed', BiasTremolo: 'Speed' };

async function sweepNamesByType() {
  setDeviceIdentity({ family: 0x24, model: 0x01 });
  const table = await (await fetch('/doc/thr10ii_w_symbol_table_1_44_0_a.json')).json();
  const nameOf = makeNameOf(table.byId);
  const text = await (await fetch('/test/fixtures/transcripts/chorus_flanger_phaser_tremolo.txt')).text();
  const namesByType = {};
  let type = 'StereoSquareChorus';
  namesByType[type] = new Set();
  text.split('\n').forEach(line => {
    const match = line.match(/(f0(?: [0-9a-f]{2})+ f7)/i);
    if (!match) return;
    const event = decodeIncomingEvent(parseSysExHex(match[1]));
    if (!event) return;
    if (event.kind === 'unit_type_change' && nameOf(event.unitId) === 'FX2') {
      type = nameOf(event.typeKey);
      namesByType[type] = new Set();
    } else if (event.kind === 'parameter_change' && nameOf(event.unitId) === 'FX2') {
      namesByType[type].add(nameOf(event.paramId));
    }
  });
  return namesByType;
}

it('sweep capture: the amp reports the rate as Freq for chorus and flanger, and as Speed for phaser and tremolo', async () => {
  const namesByType = await sweepNamesByType();
  Object.keys(SWEEP_TYPES).forEach(type => {
    assertTrue(namesByType[type] && namesByType[type].has(RATE_PARAM[type]), `${type} reports ${RATE_PARAM[type]}`);
    const other = RATE_PARAM[type] === 'Freq' ? 'Speed' : 'Freq';
    assertTrue(!namesByType[type].has(other), `${type} does not report ${other}`);
  });
});

it('layout: each effect type reads its rate, depth and feedback under the names the amp reports (sweep capture)', async () => {
  const namesByType = await sweepNamesByType();
  const effect = RUNTIME_LAYOUT.rows.map(row => row.module).find(module => module && module.key === 'effect');
  Object.entries(SWEEP_TYPES).forEach(([type, key]) => {
    const reported = new Set([...namesByType[type]].map(normalizedParamName));
    effect.knobsByType[key].filter(knob => ['SPEED', 'DEPTH', 'FEEDBACK'].includes(knob.label)).forEach(knob => {
      const names = [].concat(knob.param);
      assertTrue(names.some(name => reported.has(normalizedParamName(name))), `${type} ${knob.label} is reported as ${names.join(' or ')}`);
    });
    const rate = effect.knobsByType[key].find(knob => knob.label === 'SPEED');
    assertDeepEqual([].concat(rate.param), [RATE_PARAM[type]], `${type} SPEED writes ${RATE_PARAM[type]}`);
  });
});
