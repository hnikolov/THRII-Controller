import { it, assertEqual, assertDeepEqual, assertTrue } from '../support/assert.js';
import { parseSysExHex, toHex } from '../../src/core/bytes.js';
import { parseIdentityReply, setDeviceIdentity, getDeviceIdentity, resolveIdentity, withIdentity } from '../../src/protocol/identity.js';
import { runActivation } from '../../src/protocol/activation.js';
import { thrActivateSequenceHex } from '../../src/protocol/constants.js';

async function loadInboundFrames(path) {
  const text = await (await fetch(path)).text();
  return text
    .split('\n')
    .filter(line => line.includes('RX USB raw: '))
    .map(line => parseSysExHex(line.split('RX USB raw: ')[1]));
}

it('identity reply from the activation capture gives family 0x24 and model 0x01 (thr10ii)', async () => {
  const frames = await loadInboundFrames('/test/fixtures/transcripts/activation_req_resp.txt');
  assertDeepEqual(parseIdentityReply(frames[0]), { family: 0x24, model: 0x01, version: [0x61, 0x00, 0x2c, 0x01] }, 'identity');
});

it('the firmware text frame (group 0x7e) is not an identity reply', async () => {
  const frames = await loadInboundFrames('/test/fixtures/transcripts/activation_req_resp.txt');
  assertEqual(parseIdentityReply(frames[1]), null, 'not identity');
});

it('withIdentity replaces the family and model bytes and keeps the rest of the frame', () => {
  const frame = parseSysExHex(thrActivateSequenceHex[1]);
  const out = withIdentity(frame, { family: 0x24, model: 0x02 });
  assertEqual(toHex(out.slice(0, 7)), 'f0 00 01 0c 24 02 4d', 'header with model 02');
  assertEqual(toHex(out.slice(7)), toHex(frame.slice(7)), 'payload unchanged');
});

it('resolveIdentity throws when no identity is known', () => {
  const previous = getDeviceIdentity();
  setDeviceIdentity(null);
  try {
    let threw = false;
    try { resolveIdentity(undefined); } catch (err) { threw = /Device identity unknown/.test(err.message); }
    assertTrue(threw, 'throws without identity');
  } finally {
    setDeviceIdentity(previous);
  }
});

it('runActivation sends the identity request, then frames 2..4 with the device identity', async () => {
  const sent = [];
  let stored = null;
  const identity = { family: 0x24, model: 0x01 };
  await runActivation({
    send: async (bytes) => { sent.push(toHex(bytes)); },
    awaitIdentity: () => Promise.resolve(identity),
    sleep: async () => {},
    setIdentity: (value) => { stored = value; }
  });
  assertDeepEqual(sent, thrActivateSequenceHex.map(hex => toHex(parseSysExHex(hex))), 'same frames as the captured sequence');
  assertDeepEqual(stored, identity, 'identity stored');
});

it('runActivation uses a different model code when the amp reports one', async () => {
  const sent = [];
  await runActivation({
    send: async (bytes) => { sent.push(toHex(bytes)); },
    awaitIdentity: () => Promise.resolve({ family: 0x24, model: 0x02 }),
    sleep: async () => {},
    setIdentity: () => {}
  });
  assertTrue(sent[2].startsWith('f0 00 01 0c 24 02 4d'), 'frame 3 header uses model 02');
  assertEqual(sent[0], toHex(parseSysExHex(thrActivateSequenceHex[0])), 'identity request unchanged');
});
