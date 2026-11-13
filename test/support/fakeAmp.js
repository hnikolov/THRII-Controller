import { toHex, writeU32LE } from '../../src/core/bytes.js';
import { buildCommandFrameFromRawPayload } from '../../src/protocol/builders.js';
import { parseIncomingThrFrame } from '../../src/protocol/frames.js';
import { boot } from '../../src/app/boot.js';
import { loadInboundFrames } from './transcripts.js';

export const until = async (condition, label) => {
  for (let i = 0; i < 300; i += 1) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('timed out waiting for ' + label);
};

// A USB MIDI port pair standing in for the amp. sent holds every frame written (hex); onSend(frame, count) lets a test
// answer; deliver(frames) sends frames to the app; unplug() reports the port as disconnected.
// install() makes the browser offer this port (and no Bluetooth, so the BLE-first connect falls back to USB).
export function createFakeAmp() {
  const sent = [];
  let onMessage = null;
  let onState = null;
  const amp = {
    sent,
    onSend: () => {},
    deliver: frames => setTimeout(() => frames.forEach(data => onMessage && onMessage({ data })), 0),
    unplug: () => onState({ port: { id: 'out', state: 'disconnected' } }),
    install() {
      Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access, configurable: true });
    },
    uninstall() {
      delete navigator.bluetooth;
      delete navigator.requestMIDIAccess;
    }
  };
  const output = {
    id: 'out',
    name: 'THR',
    send(bytes) {
      sent.push(toHex(Uint8Array.from(bytes)));
      amp.onSend(Uint8Array.from(bytes), sent.length);
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
  return amp;
}

// The frames the amp answers a dump request with, for a patch: opcode 01 and the length, the 16-byte dump header, the
// patch, in pieces of 256 bytes on group 1.
function dumpFramesFor(patch) {
  const payload = Uint8Array.of(...writeU32LE(1), ...writeU32LE(patch.length + 16), ...writeU32LE(0), ...writeU32LE(0), ...writeU32LE(1), ...writeU32LE(0), ...patch);
  const frames = [];
  for (let offset = 0; offset < payload.length; offset += 256) {
    const chunk = payload.subarray(offset, offset + 256);
    frames.push(buildCommandFrameFromRawPayload(chunk, { group: 1, counter: 0x20 + frames.length, pc: frames.length, lastValidIndex: chunk.length - 1 }));
  }
  return frames;
}

// A booted app with stubbed file dialogs and confirm, for driving the runtime through its DOM.
// files.next is the file the next Import or Restore pick returns; files.saved collects the downloads.
// With connect: the fake amp answers the activation and every dump request (Actual and memories) with the captured
// Actual dump, and the app is connected and filled before this resolves. With takesUploads the fake amp behaves like
// the real one for an upload to the Actual settings: it then answers Actual reads with the uploaded patch.
export async function bootApp({ connect = false, takesUploads = false } = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  const files = {
    next: null,
    saved: [],
    pickText: async () => files.next,
    download: (name, text) => files.saved.push({ name, text }),
    choose: async name => ({ write: async text => { files.saved.push({ name, text }); } })
  };
  const confirms = [];
  const labels = [];
  const amp = createFakeAmp();
  const app = await boot(container, {
    sleep: async () => {},
    files,
    confirm: text => { confirms.push(text); return true; }
  });

  const helpers = {
    app,
    amp,
    container,
    files,
    confirms,
    labels,
    status: () => container.querySelector('.status-toast').textContent,
    knob: label => container.querySelector(`[aria-label="${label} control"]`),
    nameBox: () => container.querySelector('[aria-label="User memory label"]'),
    menu(itemLabel) {
      container.querySelector('[aria-label="PRESETS actions"]').click();
      [...container.querySelectorAll('.top-strip .unit-selector-option')].find(option => option.textContent === itemLabel).click();
    },
    cleanup() {
      app.disconnect();
      amp.uninstall();
      container.remove();
    }
  };

  if (connect) {
    const [identityReply] = await loadInboundFrames('/test/fixtures/transcripts/activation_req_resp.txt');
    const dumpFrames = await loadInboundFrames('/test/fixtures/transcripts/actual_dump.txt');
    amp.install();
    let uploading = [];
    let actualFrames = dumpFrames;
    app.transports.bus.on('raw:out', ({ bytes, label }) => {
      labels.push(label);
      if (label === 'TX THR activation 1/4') amp.deliver([identityReply]);
      if (takesUploads && label.startsWith('TX import upload')) {
        const [index, count] = label.split(' ').pop().split('/').map(Number);
        if (index === 1) uploading = [];
        else uploading.push(...parseIncomingThrFrame(bytes, 'app').decodedPayload);
        if (index === count) actualFrames = dumpFramesFor(Uint8Array.from(uploading));
      }
      if (label === 'TX sync: actual dump') amp.deliver(actualFrames);
      if (label.startsWith('TX read memory')) amp.deliver(dumpFrames);
    });
    container.querySelector('.strip-button').click();
    await until(() => helpers.knob('MASTER').getAttribute('aria-valuenow') !== null, 'the first dump');
    labels.length = 0;
  }
  return helpers;
}
