import { createTransportManager } from '../transports/transportManager.js';
import { sleep } from '../core/bytes.js';
import { flags } from '../core/flags.js';
import { createEmptyDeviceState, createStore } from '../state/shadowStore.js';
import { findParamById } from '../state/selectors.js';
import { applyDeviceEvent } from '../state/applyDeviceEvent.js';
import { applyDumpPatch } from '../state/applyDumpPatch.js';
import { createWriteScheduler } from '../protocol/writeScheduler.js';
import { buildParamWriteFrames } from '../protocol/paramWrite.js';
import { buildSelectUnitType, buildSelectPreset } from '../protocol/builders.js';
import { thrTypeCode } from '../protocol/constants.js';
import { decodeIncomingEvent } from '../protocol/incoming.js';
import { extractSysexFrames } from '../protocol/frames.js';
import { formatFirmwareVersion, parseIdentityReply, setDeviceIdentity } from '../protocol/identity.js';
import { runActivation } from '../protocol/activation.js';
import { loadSymbolTable, makeNameOf, makeLiveIdOf, makeIdOfName } from '../protocol/symbolTable.js';
import { createSyncFlow } from '../protocol/syncFlow.js';
import { createRuntimeIntents } from '../ui/runtime/intents.js';
import { mountRuntime } from '../ui/runtime/mount.js';

const SYMBOL_TABLE_URL = new URL('../../doc/thr10ii_w_symbol_table_1_44_0_a.json', import.meta.url);

// Effect-mode changes need pauses: the amp hard-stopped on rapid switches (thrii_sysex_bitbucket_ble.md, 256 ms before, 512 ms after).
// The default values are spaced 50 ms apart (without that gap the amp did not change its sound on the hardware).
const EFFECT_MODE_BEFORE_MS = 256;
const EFFECT_MODE_AFTER_MS = 512;
const DEFAULT_WRITE_GAP_MS = 50;

// Composition root shared by the shells: transports, store, sync flow, write scheduler, intents, and the mounted runtime.
// fixture (dev only) is a captured device model { units, activeSlot, identity }; with it a slot press simulates the device's slot event.
export async function boot(rootEl, { fixture = null, onStatus = () => {} } = {}) {
  const transports = createTransportManager();
  const note = text => { onStatus(text); transports.bus.emit('note', { text }); };

  if (fixture && fixture.identity) setDeviceIdentity(fixture.identity);
  const store = createStore(fixture ? { units: fixture.units, activeSlot: fixture.activeSlot } : createEmptyDeviceState());

  // Slot sync needs the symbol names to turn the dump into parameters. Without them the sync stays off.
  const symbolIds = await loadSymbolTable(SYMBOL_TABLE_URL).catch(err => {
    onStatus('Symbol table not loaded: ' + err.message);
    return null;
  });
  const nameOf = symbolIds ? makeNameOf(symbolIds) : null;
  const liveIdOf = symbolIds ? makeLiveIdOf(symbolIds) : (id => id);
  const typeKeyOf = symbolIds ? makeIdOfName(symbolIds) : (() => null);

  // A memory slot pick: select the slot, then read the Actual settings back. The slot becomes active when that read completes.
  let pendingSlot = null;
  const selectPreset = async slot => {
    if (!sync) {
      onStatus('Memory slot switch needs the symbol table (the read-back uses it).');
      return;
    }
    try {
      pendingSlot = slot;
      await transports.send(buildSelectPreset(slot - 1), `TX memory slot ${slot}`);
      sync.requestDump();
    } catch (err) {
      pendingSlot = null;
      onStatus('Write failed: ' + err.message);
    }
  };

  const sync = nameOf ? createSyncFlow({
    send: (bytes, label) => transports.send(bytes, label),
    nameOf,
    onPatch: (entries, presetName) => {
      applyDumpPatch(store, entries, nameOf, presetName, liveIdOf);
      if (pendingSlot !== null) {
        const slot = pendingSlot;
        pendingSlot = null;
        store.commit(state => { state.activeSlot = slot; }, 'device');
      }
    },
    onError: err => note('Sync failed: ' + err.message),
    onState: (s, detail) => note('Sync: ' + s + (detail ? ' (' + detail + ')' : ''))
  }) : null;

  // Inbound frames: the identity reply sets the device identity; other frames update the store (source device).
  let identityWaiter = null;
  transports.bus.on('raw:in', ({ bytes }) => {
    extractSysexFrames(bytes).forEach(frame => {
      const identity = parseIdentityReply(frame);
      if (identity) {
        setDeviceIdentity(identity);
        if (identityWaiter) identityWaiter(identity);
        return;
      }
      const event = decodeIncomingEvent(frame);
      if (event) applyDeviceEvent(store, event, nameOf);
      if (sync && (flags.slotSync || sync.state !== 'idle')) sync.onFrame(frame, event);
    });
  });

  function waitForIdentity(timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        identityWaiter = null;
        reject(new Error('No identity reply from the amp.'));
      }, timeoutMs);
      identityWaiter = identity => {
        clearTimeout(timer);
        identityWaiter = null;
        resolve(identity);
      };
    });
  }

  // What the CONNECT button shows: { kind, version } while connected. The firmware version comes from the activation's identity reply.
  let connection = {};

  async function activate() {
    try {
      const identity = await runActivation({
        send: (bytes, label) => transports.send(bytes, label),
        awaitIdentity: () => waitForIdentity(),
        sleep,
        setIdentity: setDeviceIdentity
      });
      onStatus(`Activated: family 0x${identity.family.toString(16)}, model 0x${identity.model.toString(16)}`);
      if (connection.kind) {
        connection = { ...connection, version: formatFirmwareVersion(identity.version) };
        runtime.setConnection(connection);
      }
      // The amp's current settings fill the UI (the knobs, names, and preset name), as after a slot press.
      if (sync) sync.requestDump();
    } catch (err) {
      onStatus('Activation failed: ' + err.message);
    }
  }

  const open = {
    ble: async () => {
      const result = await transports.connectBle();
      return 'BLE connected: ' + result.name + (result.notifications ? '' : ' (notifications unavailable)');
    },
    usb: async () => {
      const result = await transports.connectUsb();
      if (!result.connected) throw new Error('no MIDI ports');
      return 'USB connected';
    }
  };

  // The CONNECT button passes no kind: BLE first, and USB if BLE is cancelled or unavailable (the order decided in plan.md).
  // With autoActivate the activation and the Actual read follow. The dev buttons pass 'ble' or 'usb'.
  async function connect(kind = null) {
    let used = kind || 'ble';
    runtime.setConnection({ busy: true });
    try {
      const status = await open[used]().catch(err => {
        if (kind) throw err;
        used = 'usb';
        return open.usb();
      });
      onStatus(status);
      connection = { kind: used };
      if (flags.autoActivate) await activate();
      runtime.setConnection(connection);
    } catch (err) {
      onStatus(`${used.toUpperCase()} failed: ` + err.message);
      runtime.setConnection({ error: err.message });
    }
  }

  function disconnect() {
    transports.disconnect();
    setDeviceIdentity(null);
    onStatus('Disconnected');
    connection = {};
    runtime.setConnection(connection);
  }

  const sendParam = (unitId, paramId, value) => {
    try {
      const param = findParamById(store.getState(), unitId, paramId);
      if (!param) return;
      buildParamWriteFrames(unitId, paramId, param.typeCode, value, param.rawU32).forEach(frame => {
        transports.send(frame, `TX param ${unitId}:${paramId}`).catch(err => onStatus('Write failed: ' + err.message));
      });
    } catch (err) {
      onStatus('Write failed: ' + err.message);
    }
  };

  // Unit type pick: the select frames, then the type's default values and the module's enable, each frame awaited in order.
  const sendUnitType = async (unitId, typeKey, writes, enable) => {
    try {
      await sleep(EFFECT_MODE_BEFORE_MS);
      for (const frame of buildSelectUnitType(unitId, typeKey)) {
        await transports.send(frame, `TX unit type ${unitId}:${typeKey}`);
      }
      await sleep(EFFECT_MODE_AFTER_MS);
      for (const [index, write] of writes.entries()) {
        if (index > 0) await sleep(DEFAULT_WRITE_GAP_MS);
        for (const frame of buildParamWriteFrames(write.unitId, write.paramId, thrTypeCode.float32, write.value)) {
          await transports.send(frame, `TX default ${write.unitId}:${write.paramId}`);
        }
      }
      if (enable) {
        if (writes.length) await sleep(DEFAULT_WRITE_GAP_MS);
        for (const frame of buildParamWriteFrames(enable.unitId, enable.paramId, enable.typeCode, true)) {
          await transports.send(frame, `TX enable ${enable.unitId}:${enable.paramId}`);
        }
      }
    } catch (err) {
      onStatus('Write failed: ' + err.message);
    }
  };

  const scheduler = createWriteScheduler({
    readValue: key => {
      const [unitId, paramId] = key.split(':').map(Number);
      const param = findParamById(store.getState(), unitId, paramId);
      return param ? param.value : null;
    },
    emitWrite: (key, value) => {
      const [unitId, paramId] = key.split(':').map(Number);
      sendParam(unitId, paramId, value);
    }
  });

  const intents = createRuntimeIntents({
    store,
    flags,
    scheduler,
    sendParam,
    typeKeyOf,
    paramIdOf: typeKeyOf,
    onSelectSlot: slot => {
      if (fixture) {
        store.commit(state => { state.activeSlot = slot; }, 'device');
      } else {
        selectPreset(slot);
      }
    },
    onSelectUnit: sendUnitType,
    onConnect: () => connect(),
    onDisconnect: disconnect
  });

  const runtime = mountRuntime(rootEl, { store, intents });

  return { transports, connect, disconnect, activate };
}
