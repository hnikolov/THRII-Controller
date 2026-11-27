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
    assertEqual(button.textContent, '1.44.0.a', 'firmware version on the button');
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
    assertEqual(button.getAttribute('aria-label'), 'Connect', 'a pulled USB cable ends the session');
  } finally {
    app.disconnect();
    container.remove();
    amp.uninstall();
  }
});

const pageButtons = app => [...app.container.querySelectorAll('.strip-page-button')].map(button => button.getAttribute('aria-label') || button.textContent);
const hidden = (app, selector) => app.container.querySelector(selector).classList.contains('is-hidden');

it('boot: a port that does not answer the activation ends the session; the button is back to CONNECT', async () => {
  const amp = createFakeAmp();
  amp.install();
  const container = document.createElement('div');
  document.body.append(container);
  const app = await boot(container, { sleep: async () => {} });
  try {
    const button = container.querySelector('.strip-button');
    button.click();
    await until(() => !button.disabled && amp.sent.length > 0, 'the activation to give up');
    assertEqual(button.getAttribute('aria-label'), 'Connect', 'the button connects again');
    assertEqual(button.classList.contains('is-connected'), false, 'the plug is not shown plugged in');
    assertEqual(app.transports.isConnected(), false, 'the port is closed');
    assertEqual(/Activation failed/.test(container.querySelector('.status-toast').textContent), true, 'the failure is shown');
  } finally {
    app.disconnect();
    container.remove();
    amp.uninstall();
  }
});

it('boot: the Presets page is the app\'s own; a preset source adds its page button, and a press opens it with the page, the import and the amp model', async () => {
  const plain = await bootApp();
  try {
    assertDeepEqual(pageButtons(plain), ['Amp settings', 'Presets'], 'without a source: the knobs and the Presets page');
    assertDeepEqual([...plain.container.querySelectorAll('.strip-page-button')].map(button => button.textContent), ['', '☰'], 'shown as icons (the knob is drawn)');
    plain.page('☰');
    assertDeepEqual([...plain.container.querySelectorAll('.pr-actions:not([hidden]) button')].map(button => button.textContent),
      ['Import', 'Export', '+ Add', 'Save to amp ▾'], 'its actions');
  } finally {
    plain.cleanup();
  }

  const opened = [];
  const app = await bootApp({ presetSources: { importAi: context => opened.push(context) } });
  try {
    assertDeepEqual(pageButtons(app), ['Amp settings', 'Presets', 'AI'], 'the source adds its button');
    const [knobs, , button] = app.container.querySelectorAll('.strip-page-button');
    const aiPage = app.container.querySelectorAll('.thr-app > .ui-page')[1];
    const aiHidden = () => aiPage.classList.contains('is-hidden');
    assertDeepEqual([button.textContent, button.getAttribute('aria-pressed')], ['AI', 'false'], 'the button of the source');
    assertDeepEqual([hidden(app, '.ui-body'), aiHidden(), opened.length, knobs.getAttribute('aria-pressed')], [false, true, 0, 'true'], 'the knobs show first, their tab lit');

    app.page('AI');
    assertEqual(opened.length, 1, 'the source is opened once');
    assertEqual(opened[0].host, aiPage, 'the host is the page inside the app');
    assertDeepEqual([hidden(app, '.ui-body'), aiHidden(), button.getAttribute('aria-pressed')], [true, false, 'true'], 'the page shows');

    app.page('AI');
    assertDeepEqual([aiHidden(), opened.length], [false, 1], 'a press on the lit tab changes nothing');
    app.page('Amp settings');
    assertDeepEqual([hidden(app, '.ui-body'), aiHidden(), opened.length, knobs.getAttribute('aria-pressed')], [false, true, 1, 'true'], 'the knob tab returns to the knobs');
    app.page('AI');
    assertDeepEqual([opened.length, opened[1].host === opened[0].host], [2, true], 'every showing opens the source again, with the same page');
    assertEqual(opened[0].ampModel(), null, 'no amp model before a connect');
    opened[0].setActivity(true);
    assertEqual(button.classList.contains('is-active'), true, 'the source\'s activity shows on its button');
    opened[0].setActivity(false);
    assertEqual(button.classList.contains('is-active'), false, 'and goes');

    const text = await (await fetch('/test/fixtures/presets/walsh-hotel-solo.thrl6p')).text();
    assertDeepEqual(await opened[0].importText(text), { ok: true, message: 'Imported Walsh Hotel Solo (amp not connected)' }, 'import result');
    await until(() => app.nameBox().value === 'Walsh Hotel Solo', 'the preset in the store');
  } finally {
    app.cleanup();
  }

  const connected = await bootApp({ connect: true, presetSources: { importAi: context => opened.push(context) } });
  try {
    connected.page('AI');
    assertEqual(opened[2].ampModel(), 1, 'the model code of the connected amp');
  } finally {
    connected.cleanup();
  }
});
