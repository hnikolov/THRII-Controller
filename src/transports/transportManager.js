import { createBus } from '../core/eventBus.js';
import { sleep } from '../core/bytes.js';
import { createBleTransport, MIDI_CHAR_UUID, MIDI_SERVICE_UUID } from './bleTransport.js';
import { createUsbTransport } from './usbTransport.js';

// BLE frames go out one at a time with this gap between them. Back-to-back writes overflowed the amp's BLE input
// (the activation notes space requests 50 to 100 ms apart). USB needs no gap.
export const BLE_FRAME_GAP_MS = 50;

export function createTransportManager({ useReportedPacketSize, bleFrameGapMs = BLE_FRAME_GAP_MS } = {}) {
  const bus = createBus();
  const onBytes = (bytes, source) => bus.emit('raw:in', { bytes, source });
  const usb = createUsbTransport(onBytes);
  const ble = createBleTransport(onBytes, { useReportedPacketSize });
  let bleDevice = null;
  let midiAccess = null;
  // The link was lost from the amp's side: BLE out of range or switched off, or the USB cable pulled.
  // A disconnect() call removes both listeners first, so it does not report itself.
  const onBleDropped = () => bus.emit('transport:status', { connected: false, kind: 'ble' });
  const onMidiState = ({ port }) => {
    const { output, input } = usb.ports();
    const ours = [output, input].some(used => used && used.id === port.id);
    if (ours && port.state === 'disconnected') bus.emit('transport:status', { connected: false, kind: 'usb' });
  };
  // Every send waits for the one before it: frames never interleave on the wire.
  let queue = Promise.resolve();

  async function sendNow(bytes, label) {
    bus.emit('raw:out', { bytes, label });
    if (usb.isConnected()) {
      usb.send(bytes);
      return;
    }
    if (ble.isConnected()) {
      await ble.send(bytes);
      return;
    }
    throw new Error('No USB or BLE output connected.');
  }

  return {
    bus,
    usb,
    ble,
    isConnected: () => usb.isConnected() || ble.isConnected(),

    async connectUsb() {
      if (!navigator.requestMIDIAccess) throw new Error('Web MIDI is not supported in this browser.');
      midiAccess = await navigator.requestMIDIAccess({ sysex: true });
      midiAccess.addEventListener('statechange', onMidiState);
      return usb.attach(midiAccess);
    },

    async connectBle() {
      if (!navigator.bluetooth) throw new Error('Web Bluetooth is not supported in this browser.');
      bleDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: [MIDI_SERVICE_UUID] }]
      });
      bleDevice.addEventListener('gattserverdisconnected', onBleDropped);
      const server = await bleDevice.gatt.connect();
      ble.setMaxPacketBytes(server.maxWriteWithoutResponseSize);
      const service = await server.getPrimaryService(MIDI_SERVICE_UUID);
      ble.setCharacteristic(await service.getCharacteristic(MIDI_CHAR_UUID));
      const name = bleDevice.name || 'Unnamed';
      try {
        await ble.enableNotifications();
        return { connected: true, notifications: true, name };
      } catch (err) {
        return { connected: true, notifications: false, name };
      }
    },

    disconnect() {
      if (midiAccess) midiAccess.removeEventListener('statechange', onMidiState);
      midiAccess = null;
      usb.detach();
      ble.detach();
      if (bleDevice) {
        bleDevice.removeEventListener('gattserverdisconnected', onBleDropped);
        if (bleDevice.gatt && bleDevice.gatt.connected) bleDevice.gatt.disconnect();
      }
      bleDevice = null;
    },

    // raw:out is emitted when the frame is written, so the trace shows the wire order. A failed write rejects its own
    // promise; the queue carries on with the next frame.
    send(bytes, label) {
      const job = queue.then(() => sendNow(bytes, label));
      const gap = () => (!usb.isConnected() && ble.isConnected() ? sleep(bleFrameGapMs) : null);
      queue = job.catch(() => {}).then(gap);
      return job;
    }
  };
}
