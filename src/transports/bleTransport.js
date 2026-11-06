export const MIDI_SERVICE_UUID = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
export const MIDI_CHAR_UUID = '7772e5db-3868-4112-a1a9-f2669d106bf3';

// Default ATT payload without MTU negotiation: MTU 23 minus the 3-byte ATT header (doc/thrii_sysex_bitbucket_ble.md).
const DEFAULT_PACKET_BYTES = 20;

// UNVERIFIED on hardware: whether the amp accepts BLE packets larger than 20 bytes.
// Verify when presets are uploaded to the amp, then keep or set to false.
// false forces the 20-byte default regardless of what the browser reports.
export const BLE_USE_REPORTED_PACKET_SIZE = true;

// BLE-MIDI input. A packet is [header][timestamp][data]; a SysEx can continue in later packets, each with its own
// header, and a timestamp also sits before F7. Inside SysEx every data byte is below 0x80, so other top-bit bytes are
// framing and are dropped. Complete F0..F7 messages go to onFrame.
export function createBleSysExInput(onFrame) {
  let pending = null;
  return function receivePacket(bytes) {
    for (let i = 0; i < bytes.length; i += 1) {
      const b = bytes[i];
      if (b === 0xf0) {
        pending = [0xf0];
      } else if (b === 0xf7) {
        if (pending) onFrame(Uint8Array.from([...pending, 0xf7]));
        pending = null;
      } else if (pending && b < 0x80) {
        pending.push(b);
      }
    }
  };
}

export function createBleTransport(onBytes, { useReportedPacketSize = BLE_USE_REPORTED_PACKET_SIZE } = {}) {
  let characteristic = null;
  let notificationHandler = null;
  let timestamp = 0;
  let maxPacketBytes = DEFAULT_PACKET_BYTES;
  const receivePacket = createBleSysExInput(frame => onBytes(frame, 'BLE'));

  function nextTimestamp() {
    const ts = timestamp;
    timestamp = (timestamp + 1) & 0x1fff;
    return { header: 0x80 | (ts >> 7), low: 0x80 | (ts & 0x7f) };
  }

  // Packet 1: [header][ts][F0 ...]. Continuation: [header][data].
  // Last packet: [header][data][ts][F7]; the timestamp before F7 is required.
  function buildPackets(bytes) {
    const frame = Uint8Array.from(bytes);
    if (frame[frame.length - 1] !== 0xf7) {
      throw new Error('BLE send expects a complete SysEx frame ending in F7.');
    }
    const body = frame.subarray(0, frame.length - 1);
    const packets = [];
    let offset = 0;
    let first = true;

    for (;;) {
      const { header, low } = nextTimestamp();
      const prefix = first ? [header, low] : [header];
      first = false;
      const capacity = maxPacketBytes - prefix.length;
      if (body.length - offset + 2 <= capacity) {
        packets.push(Uint8Array.of(...prefix, ...body.subarray(offset), low, 0xf7));
        return packets;
      }
      packets.push(Uint8Array.of(...prefix, ...body.subarray(offset, offset + capacity)));
      offset += capacity;
    }
  }

  return {
    setCharacteristic(char) {
      characteristic = char;
    },

    // Uses the browser-reported write size when available; otherwise keeps the 20-byte default.
    setMaxPacketBytes(reported) {
      const size = Math.floor(Number(reported));
      maxPacketBytes = useReportedPacketSize && Number.isFinite(size) && size > DEFAULT_PACKET_BYTES
        ? size
        : DEFAULT_PACKET_BYTES;
    },

    async enableNotifications() {
      await characteristic.startNotifications();
      notificationHandler = e => receivePacket(new Uint8Array(e.target.value.buffer, e.target.value.byteOffset, e.target.value.byteLength));
      characteristic.addEventListener('characteristicvaluechanged', notificationHandler);
    },

    detach() {
      if (characteristic && notificationHandler) {
        try {
          characteristic.removeEventListener('characteristicvaluechanged', notificationHandler);
        } catch (err) {}
      }
      notificationHandler = null;
      characteristic = null;
    },

    isConnected: () => !!characteristic,

    async send(bytes) {
      if (!characteristic) throw new Error('BLE is not connected.');
      for (const packet of buildPackets(bytes)) {
        if (typeof characteristic.writeValueWithoutResponse === 'function') {
          await characteristic.writeValueWithoutResponse(packet);
        } else {
          await characteristic.writeValue(packet);
        }
      }
    }
  };
}
