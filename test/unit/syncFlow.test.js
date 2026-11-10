import { it, assertEqual } from '../support/assert.js';
import { decodeIncomingEvent } from '../../src/protocol/incoming.js';
import { createSyncFlow } from '../../src/protocol/syncFlow.js';
import { setDeviceIdentity } from '../../src/protocol/identity.js';
import { loadNameOf } from '../../src/protocol/symbolTable.js';
import { loadInboundFrames } from '../support/transcripts.js';
import { createFakeClock } from '../support/fakeClock.js';

const SYMBOLS = '../doc/thr10ii_w_symbol_table_1_44_0_a.json';

function harness() {
  const sent = [];
  const patches = [];
  const errors = [];
  const clock = createFakeClock();
  return {
    sent,
    patches,
    errors,
    clock,
    make: nameOf => createSyncFlow({
      send: (bytes, label) => { sent.push({ bytes, label }); },
      nameOf,
      onPatch: entries => patches.push(entries),
      onError: err => errors.push(err.message),
      clock
    })
  };
}

const feedDump = async sync => {
  for (const frame of await loadInboundFrames('/test/fixtures/transcripts/actual_dump.txt')) {
    sync.onFrame(frame, decodeIncomingEvent(frame));
  }
};

it('sync: a slot press requests the actual dump, which is parsed once', async () => {
  setDeviceIdentity({ family: 0x24, model: 0x01 });
  const nameOf = await loadNameOf(SYMBOLS);
  const { sent, patches, make } = harness();
  const sync = make(nameOf);

  const slotPress = (await loadInboundFrames('/test/fixtures/transcripts/slot_press.txt'))[0];
  sync.onFrame(slotPress, decodeIncomingEvent(slotPress));
  assertEqual(sent.length, 1, 'dump requested on the slot press');
  assertEqual(sent[0].bytes[7], 0x01, 'dump request is on group 1');
  assertEqual(sync.state, 'awaitingDump', 'waiting for the dump');

  for (const frame of await loadInboundFrames('/test/fixtures/transcripts/actual_dump.txt')) {
    sync.onFrame(frame, decodeIncomingEvent(frame));
  }
  assertEqual(patches.length, 1, 'one patch');
  assertEqual(patches[0].length, 45, 'legacy entry count');
  assertEqual(sent.length, 1, 'the dump report does not request another dump');
  assertEqual(sync.state, 'idle', 'idle after the patch');
});

it('sync: a send failure resets the sync and is reported', async () => {
  setDeviceIdentity({ family: 0x24, model: 0x01 });
  const errors = [];
  const sync = createSyncFlow({
    send: () => { throw new Error('port closed'); },
    nameOf: await loadNameOf(SYMBOLS),
    onPatch: () => {},
    onError: err => errors.push(err.message),
    clock: createFakeClock()
  });
  const slotPress = (await loadInboundFrames('/test/fixtures/transcripts/slot_press.txt'))[0];
  sync.onFrame(slotPress, decodeIncomingEvent(slotPress));
  assertEqual(errors.join(','), 'port closed', 'error reported');
  assertEqual(sync.state, 'idle', 'idle after the failure');
});

it('sync: requestDump asks for the actual dump once, and the dump fills the store', async () => {
  setDeviceIdentity({ family: 0x24, model: 0x01 });
  const nameOf = await loadNameOf(SYMBOLS);
  const { sent, patches, make } = harness();
  const sync = make(nameOf);
  sync.requestDump();
  assertEqual(sent.length, 1, 'one request');
  for (const frame of await loadInboundFrames('/test/fixtures/transcripts/actual_dump.txt')) {
    sync.onFrame(frame, decodeIncomingEvent(frame));
  }
  assertEqual(patches.length, 1, 'the dump is applied');
  assertEqual(sync.state, 'idle', 'idle after the dump');
});

it('sync: a unit type change does not request a dump: the amp sends the new parameters with the switch', async () => {
  setDeviceIdentity({ family: 0x24, model: 0x01 });
  const { sent, make } = harness();
  const sync = make(await loadNameOf(SYMBOLS));
  const frames = await loadInboundFrames('/test/fixtures/transcripts/select_modern_amp_crunch.txt');
  const typeChange = frames.find(f => { const e = decodeIncomingEvent(f); return e && e.kind === 'unit_type_change'; });
  sync.onFrame(typeChange, decodeIncomingEvent(typeChange));
  assertEqual(sent.length, 0, 'no dump request');
  assertEqual(sync.state, 'idle', 'still idle');
});

it('sync: a request during a running dump drops that dump and reads a new one', async () => {
  setDeviceIdentity({ family: 0x24, model: 0x01 });
  const { sent, patches, make } = harness();
  const sync = make(await loadNameOf(SYMBOLS));
  const slotPress = (await loadInboundFrames('/test/fixtures/transcripts/slot_press.txt'))[0];
  sync.requestDump();
  sync.onFrame(slotPress, decodeIncomingEvent(slotPress));
  assertEqual(sent.length, 1, 'no second request while the dump runs');
  await feedDump(sync);
  assertEqual(patches.length, 0, 'the running dump may predate the slot press: not applied');
  assertEqual(sent.length, 2, 'a new dump is requested');
  await feedDump(sync);
  assertEqual(patches.length, 1, 'the new dump is applied');
  assertEqual(sync.state, 'idle', 'idle at the end');
});

it('sync: a dump that never completes is requested once more, then reported; later requests work', async () => {
  setDeviceIdentity({ family: 0x24, model: 0x01 });
  const { sent, patches, errors, clock, make } = harness();
  const sync = make(await loadNameOf(SYMBOLS));
  sync.requestDump();
  clock.advance(8000);
  assertEqual(sent.length, 2, 'retry after the timeout');
  assertEqual(errors.length, 0, 'no error yet');
  clock.advance(8000);
  assertEqual(errors.length, 1, 'reported after the second timeout');
  assertEqual(sync.state, 'idle', 'idle, not stuck');
  sync.requestDump();
  assertEqual(sent.length, 3, 'a later request is sent');
  await feedDump(sync);
  assertEqual(patches.length, 1, 'and its dump is applied');
  assertEqual(clock.pendingCount(), 0, 'no timer left');
});

it('sync: cancel drops a running dump without an error', async () => {
  setDeviceIdentity({ family: 0x24, model: 0x01 });
  const { patches, errors, clock, make } = harness();
  const sync = make(await loadNameOf(SYMBOLS));
  sync.requestDump();
  sync.cancel();
  await feedDump(sync);
  clock.advance(20000);
  assertEqual(patches.length, 0, 'nothing applied');
  assertEqual(errors.length, 0, 'nothing reported');
  assertEqual(sync.state, 'idle', 'idle');
});

it('sync: only slot presses start a sync; the dump report is classified separately', async () => {
  const slotFrames = await loadInboundFrames('/test/fixtures/transcripts/slot_press.txt');
  const slotKinds = slotFrames.map(decodeIncomingEvent).filter(Boolean).map(e => e.kind);
  assertEqual(slotKinds.filter(k => k === 'settings_notification').length, 1, 'one slot press in the capture');
  assertEqual(slotKinds.filter(k => k === 'dump_report').length, 0, 'no dump report in the slot press capture');
  const dumpKinds = (await loadInboundFrames('/test/fixtures/transcripts/actual_dump.txt')).map(decodeIncomingEvent).filter(Boolean).map(e => e.kind);
  assertEqual(dumpKinds.filter(k => k === 'dump_report').length, 1, 'one dump report in the dump capture');
  assertEqual(dumpKinds.filter(k => k === 'settings_notification').length, 0, 'no slot press in the dump capture');
});
