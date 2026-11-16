import { it, assertEqual, assertDeepEqual } from '../support/assert.js';
import { loadInboundFrames } from '../support/transcripts.js';
import { bootApp, createFakeAmp, until } from '../support/fakeAmp.js';
import { boot } from '../../src/app/boot.js';
import { toHex, parseSysExHex } from '../../src/core/bytes.js';
import { thrActivateSequenceHex } from '../../src/protocol/constants.js';
import { decodeIncomingEvent } from '../../src/protocol/incoming.js';

// A MIDI port that answers like the amp in the captures: the identity reply to the identity request,
// and the Actual dump to the fifth frame (the dump request that follows the four activation frames).
function fakeAmp(identityReply, dumpFrames) {
  const amp = createFakeAmp();
  amp.onSend = (frame, count) => {
    if (count === 1) amp.deliver([identityReply]);
    if (count === 5) amp.deliver(dumpFrames);
  };
  return amp;
}

it('boot: the CONNECT button connects, activates, reads the Actual settings and shows them; a pulled cable disconnects', async () => {
  const [identityReply] = await loadInboundFrames('/test/fixtures/transcripts/activation_req_resp.txt');
  const dumpFrames = await loadInboundFrames('/test/fixtures/transcripts/actual_dump.txt');
  const slotPress = (await loadInboundFrames('/test/fixtures/transcripts/slot_press.txt'))
    .find(frame => (decodeIncomingEvent(frame) || {}).kind === 'settings_notification');
  const ampSlot = decodeIncomingEvent(slotPress).slot + 1;
  const amp = fakeAmp(identityReply, dumpFrames);
  amp.install();
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
    amp.uninstall();
  }
});

const menuLabels = app => [...app.container.querySelectorAll('.top-strip .unit-selector-option')].map(option => option.textContent);

it('boot: a preset source adds its menu item; a pick opens it with the app frame, the import and the amp model', async () => {
  const plain = await bootApp();
  try {
    assertEqual(menuLabels(plain).some(label => label === 'Import AI' || label === 'Import Factory'), false, 'no source, no item');
    assertEqual(menuLabels(plain).includes('Import'), true, 'the other items stay');
  } finally {
    plain.cleanup();
  }

  const opened = [];
  const app = await bootApp({ presetSources: { importAi: context => opened.push(context) } });
  try {
    assertEqual(menuLabels(app).includes('Import AI'), true, 'the item of the source');
    assertEqual(menuLabels(app).includes('Import Factory'), false, 'an item without a source stays out');
    app.menu('Import AI');
    assertEqual(opened.length, 1, 'the source is opened once');
    assertEqual(opened[0].host, app.container.querySelector('.thr-app'), 'the host is the app frame');
    assertEqual(opened[0].ampModel(), null, 'no amp model before a connect');

    const text = await (await fetch('/doc/walsh-hotel-solo.thrl6p')).text();
    assertDeepEqual(await opened[0].importText(text), { ok: true, message: 'Imported Walsh Hotel Solo (amp not connected)' }, 'import result');
    await until(() => app.nameBox().value === 'Walsh Hotel Solo', 'the preset in the store');
  } finally {
    app.cleanup();
  }

  const connected = await bootApp({ connect: true, presetSources: { importAi: context => opened.push(context) } });
  try {
    connected.menu('Import AI');
    assertEqual(opened[1].ampModel(), 1, 'the model code of the connected amp');
  } finally {
    connected.cleanup();
  }
});
