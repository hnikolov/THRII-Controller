import { it, assertEqual, assertDeepEqual } from '../support/assert.js';
import { loadInboundFrames } from '../support/transcripts.js';
import { boot } from '../../src/app/boot.js';
import { toHex, parseSysExHex } from '../../src/core/bytes.js';
import { thrActivateSequenceHex } from '../../src/protocol/constants.js';
import { decodeIncomingEvent } from '../../src/protocol/incoming.js';

const until = async (condition, label) => {
  for (let i = 0; i < 200; i += 1) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('timed out waiting for ' + label);
};

// A MIDI port that answers like the amp in the captures: the identity reply to the identity request,
// and the Actual dump to the fifth frame (the dump request that follows the four activation frames).
function fakeAmp(identityReply, dumpFrames) {
  const sent = [];
  let onMessage = null;
  let onState = null;
  const deliver = frames => setTimeout(() => frames.forEach(data => onMessage({ data })), 0);
  const output = {
    id: 'out',
    name: 'THR',
    send(bytes) {
      sent.push(toHex(Uint8Array.from(bytes)));
      if (sent.length === 1) deliver([identityReply]);
      if (sent.length === 5) deliver(dumpFrames);
    }
  };
  const input = {
    id: 'in',
    name: 'THR',
    addEventListener(type, fn) { onMessage = fn; },
    removeEventListener() { onMessage = null; }
  };
  const access = {
    outputs: new Map([['o', output]]),
    inputs: new Map([['i', input]]),
    addEventListener(type, fn) { onState = fn; },
    removeEventListener() { onState = null; }
  };
  return { sent, access, deliver, unplug: () => onState({ port: { id: 'out', state: 'disconnected' } }) };
}

it('boot: the CONNECT button connects, activates, reads the Actual settings and shows them; a pulled cable disconnects', async () => {
  const [identityReply] = await loadInboundFrames('/test/fixtures/transcripts/activation_req_resp.txt');
  const dumpFrames = await loadInboundFrames('/test/fixtures/transcripts/actual_dump.txt');
  const slotPress = (await loadInboundFrames('/test/fixtures/transcripts/slot_press.txt'))
    .find(frame => (decodeIncomingEvent(frame) || {}).kind === 'settings_notification');
  const ampSlot = decodeIncomingEvent(slotPress).slot + 1;
  const amp = fakeAmp(identityReply, dumpFrames);
  // Without Bluetooth the BLE-first connect falls back to USB.
  Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true });
  Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => amp.access, configurable: true });
  const container = document.createElement('div');
  document.body.append(container);
  const statuses = [];
  const dumpsApplied = () => statuses.filter(text => text.includes('dump complete')).length;
  const app = await boot(container, { sleep: async () => {}, onStatus: text => statuses.push(text) });
  const labels = [];
  app.transports.bus.on('raw:out', ({ label }) => labels.push(label));
  try {
    const button = container.querySelector('.strip-button');
    button.click();
    await until(() => container.querySelector('[aria-label="MASTER control"]').getAttribute('aria-valuenow') !== null, 'the dump');

    assertDeepEqual(amp.sent.slice(0, 4), thrActivateSequenceHex.map(hex => toHex(parseSysExHex(hex))), 'activation frames');
    assertDeepEqual(labels, [
      'TX THR activation 1/4', 'TX THR activation 2/4', 'TX THR activation 3/4', 'TX THR activation 4/4', 'TX sync: actual dump'
    ], 'send order');
    assertEqual(button.textContent, 'FW 1.44.0.a', 'firmware version on the button');
    assertEqual(container.querySelector('[aria-label="MASTER control"]').getAttribute('aria-valuenow'), '67', 'MASTER from the dump');
    assertEqual(container.querySelector('[aria-label="User memory label"]').value, 'Crunch Ico LP', 'preset name');

    // A slot picked in the app, then a slot pressed on the amp before the read-back is done: the amp's slot wins,
    // and the dump that was running is replaced by a new one.
    const appSlot = ampSlot === 5 ? 4 : 5;
    container.querySelectorAll('.footer-memory-button')[appSlot - 1].click();
    await until(() => amp.sent.length === 7, 'the slot select and its dump request');
    amp.deliver([slotPress]);
    amp.deliver(dumpFrames);
    await until(() => amp.sent.length === 8, 'the new dump request');
    amp.deliver(dumpFrames);
    await until(() => dumpsApplied() === 2, 'the new dump');
    await new Promise(resolve => setTimeout(resolve, 0));
    assertEqual(container.querySelector('.footer-memory-button.is-selected').textContent, String(ampSlot), 'the amp\'s slot is highlighted');

    amp.unplug();
    assertEqual(button.textContent, 'CONNECT', 'a pulled USB cable ends the session');
  } finally {
    app.disconnect();
    container.remove();
    delete navigator.bluetooth;
    delete navigator.requestMIDIAccess;
  }
});
