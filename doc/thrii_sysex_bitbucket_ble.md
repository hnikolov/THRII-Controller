# Bitbucket-encoded SysEx payload notes

This section describes the bitbucket-encoding used in SysEx payloads and the general frame structure used in the protocol.

## Extracted source text

The data payloads in SysEx messages are "bitbucket-encoded". In simpler terms, 8-bit data is transformed into 7-bit data in 8-bit space, and the high bits are stored in another 7-bit value in 8-bit space. In other words, the encoded bytes are not allowed to exceed `0x7f`.

The figure below shows seven raw bytes, each 8 bits wide, being packed into a bitbucketed stream. In the example, the six or seven bits of usable data are preserved in the payload while the top bits are carried in a separate bucket value.

```text
Legend:
  7 6 5 4 3 2 1 0 = bit positions within each 8-bit byte
  bit 7           = bit stored into the bucket/encoded stream
  bits 0 - 6      = payload bit kept after encoding

              7 | 6 5 4 3 2 1 0
              -----------------
B1 = 0xA5  +- 1 | 0 1 0 0 1 0 1
B2 = 0x3C  |  0 | 0 1 1 1 1 0 0
B3 = 0xFF  |  1 | 1 1 1 1 1 1 1
B4 = 0x10  |  0 | 0 0 1 0 0 0 0
B5 = 0xC7  |  1 | 1 0 0 0 1 1 1
B6 = 0x08  |  0 | 0 0 0 1 0 0 0
B7 = 0xE1  |  1 | 1 1 0 0 0 0 1
           |  |
	       |  +--------+
           |           |
           ↓           ↓
        0  1 0 1 0 1 0 1 => bucket = 0x55

bucket + payload bytes:
 0x55    0x25  0x3C  0x7F  0x10  0x47  0x08  0x61
```
**Figure 1: Encoding 7 bytes of raw 8-bit data into 8 bytes of bitbucketed data**

SysEx message protocol defines a frame to transmit the **bitbucket-encoded** data. Except for the start (`0xf0`) and end (`0xf7`) bytes, no byte may exceed `0x7f`. The payload is bitbucketed, and the rest is sent as is. The frame structure looks as follows:

```text
+----+----------+---------+------+------+-------+---------+------+-----------+----+
| F0 | 00 01 0C |  24 00  |  4D  |  AB  |  CNT  |  L2 L1  |  PC  | ... | ... | F7 |
+----+----------+---------+------+------+-------+---------+------+-----------+----+

Legend:
  F0       = Start byte: SysEx start delimeter
  00 01 0C = Manufacturer ID: Line 6 / Yamaha
  24 00    = Model: THR10II
  4D       = Constant: appears in every frame and the amp rejects frames without it
  AB       = A/B flag: 00 = local/actual state, 01 = system/preset
  CNT      = Counter: Frame counter
  L2 L1    = Length: Payload length in bytes
  PC       = Seq #: Sequence/Packet counter for multi-packet messages
  ...      = Bitbucketed payload: opcode, parameter keys (UKeys/PKeys), and values
  F7       = End byte: SysEx end delimeter
```
**Figure 2: SysEx frame layout**
## Practical interpretation

- The bitbucket process keeps all encoded bytes in the legal SysEx range `0x00..0x7f`.
- The payload is the **only** region that is bitbucket-encoded; the rest of the frame remains unmodified.

# SysEx over BLE

There is one more layer. The difference between USB and Bluetooth as a medium. BLE-MIDI wraps MIDI SysEx messages into BLE-ATT packets (MMA RP-052). Each packet starts with a header byte `0x80`, and a timestamp byte precedes each MIDI message. In the simple case, the SysEx message is split into: SysEx Start byte (`0xf0`) + payload data + SysEx End byte (`0xf7`). The **timestamp** byte itself is **split** into a **7-bit part**, sent after the packet header, and a **6-bit part**, sent just before the SysEx End byte.

This is the BLE-MIDI transport used for wire-format packaging of SysEx payloads, as defined by the MIDI Association BLE-MIDI profile.

## Single BLE-MIDI packet

```text
  +--------+-------------+-------------------------------+-------------+-------+
  |   80   |      80     | F0 7E 7F 06 01 ...            |     80      |  F7   |
  +--------+-------------+-------------------------------+-------------+-------+
  | Header | Timestamp 1 | SysEx Start + Data            | Timestamp 2 | SysEx |
  +--------+-------------+-------------------------------+-------------+-------+

Legend:
  Header      = BLE-MIDI packet header (0x80)
  Timestamp 1 = per-message 7-bit part
  Timestamp 2 = per-message 6-bit part
  F0          = SysEx start
  F7          = SysEx end
```

The figure above shows a single packet carrying a SysEx message. The packet header is always a `0x80`, and the timestamp is sent adjacent to the data payload.

## Multi-packet BLE-MIDI transport

For large SysEx messages (larger than 93 bytes), BLE-MIDI uses a multi-packet format. In that mode, each packet repeats the header and carries a fragment of the message. The trailer is not sent until the final packet.

```text
  +-----+------+-----+-------------+
  | Hdr | Ts 1 | F0  | data 1      |
  +-----+------+-----+-------------+
                  ↓
  +-----+--------------------------+
  | Hdr | data 2                   |
  +-----+--------------------------+
                  ↓ 
                . . .
  +-----+-------------+------+-----+
  | Hdr | data N      | Ts 2 | F7  |
  +-----+-------------+------+-----+

Legend:
  Hdr   = packet header (0x80)
  Ts    = timestamp bytes (7-byte and 6-byte parts)
  data  = fragment of the SysEx payload
  F7    = final SysEx end byte
```

## Practical interpretation

- BLE-MIDI does not send raw SysEx bytes directly as a single transport payload.
- It wraps each chunk in a BLE packet with a `0x80` header.
- The timestamp byte is interleaved around the SysEx message, and large payloads are fragmented across several BLE packets.
- The final packet still carries the SysEx end marker `0xF7`.

## A Production-Ready JavaScript Buffer Slicer

```ts
/**
 * Frames a large raw SysEx byte array into compliant BLE-MIDI multi-packet fragments.
 * 
 * @param {Uint8Array|Array} rawSysEx - The raw SysEx array (must start with 0xF0 and end with 0xF7).
 * @param {number} maxBleMtu - The maximum allowable payload size (typically 20 to 512 bytes).
 * @returns {Array<Uint8Array>} An array of formatted BLE packets ready to write to the GATT characteristic.
 */
function packageBleMidiSysEx(rawSysEx, maxBleMtu = 20) {
    const packets = [];
    let bytesProcessed = 0;
    let packetIndex = 0;

    // Remove the trailing 0xF7 from raw processing loop to handle it explicitly in the final frame
    const payloadLengthWithoutF7 = rawSysEx.length - 1;

    while (bytesProcessed < payloadLengthWithoutF7) {
        // Simulate a rolling 13-bit BLE clock incrementing by 10ms per loop cycle
        const simulatedTime = (packetIndex * 10) & 0x1FFF;
        
        // Extract Header and Timestamp bitmasks (Setting MSB to 1)
        const headerByte = ((simulatedTime >> 7) & 0x3F) | 0x80;
        const timestampByte = (simulatedTime & 0x7F) | 0x80;

        let packetBuffer = [];

        if (packetIndex === 0) {
            // ROLE 1: The Start Packet
            // Structure: [Header] [Timestamp 1] [0xF0] [Data...]
            packetBuffer.push(headerByte, timestampByte);
            
            // Calculate how much raw data fits in this initial frame
            const sliceSize = maxBleMtu - packetBuffer.length;
            const dataChunk = rawSysEx.slice(bytesProcessed, bytesProcessed + sliceSize);
            
            packetBuffer.push(...dataChunk);
            bytesProcessed += dataChunk.length;
        } else {
            // ROLE 2 & 3: Continuation or Final Packet
            // Structure: [Header] [Data...]
            packetBuffer.push(headerByte);
            
            // Calculate baseline space allowing 1 byte for Header
            let sliceSize = maxBleMtu - packetBuffer.length;
            
            // Determine if the remaining payload data fits completely within this window
            const remainingDataLength = payloadLengthWithoutF7 - bytesProcessed;
            
            if (remainingDataLength <= sliceSize) {
                // ROLE 3: This is definitively the Final Packet.
                // We need extra room to insert: [Timestamp 2] [0xF7]
                // Recalculate slice window to protect trailing space
                sliceSize = maxBleMtu - packetBuffer.length - 2; 
                
                const dataChunk = rawSysEx.slice(bytesProcessed, bytesProcessed + sliceSize);
                packetBuffer.push(...dataChunk);
                bytesProcessed += dataChunk.length;
                
                // Interleave trailing timestamp and the final marker
                packetBuffer.push(timestampByte, 0xF7);
            } else {
                // ROLE 2: Standard Continuation Packet
                const dataChunk = rawSysEx.slice(bytesProcessed, bytesProcessed + sliceSize);
                packetBuffer.push(...dataChunk);
                bytesProcessed += dataChunk.length;
            }
        }

        packets.push(new Uint8Array(packetBuffer));
        packetIndex++;
    }

    return packets;
}

// ==========================================
// EXAMPLE USAGE:
// ==========================================
// A mockup 96-byte Yamaha THR SysEx payload parameter block
const largeSysExMessage = [0xF0, 0x43, 0x7D, 0x30, ...Array(91).fill(0x01), 0xF7];

// Chunk the data targeting a standard 20-byte BLE transmission constraint
const blePackets = packageBleMidiSysEx(largeSysExMessage, 20);

// Iterate through the array and dispatch them straight to your GATT write characteristic
blePackets.forEach((packet, index) => {
    console.log(`Packet ${index + 1}:`, Array.from(packet).map(b => b.toString(16).toUpperCase().padStart(2, '0')));
    // writeToGattCharacteristic(packet);
});
```

### Key Logic Checklist

1. **The Slicing Offset:** Notice how `payloadLengthWithoutF7` protects the last byte. This guarantees that `0xF7` is never prematurely included in a middle continuation block, which would break the amp's receiver engine.
2. **Buffer Shrinkage Handling:** In the final block, the code proactively subtracts `2` additional bytes from the calculation allowance to safely clear a pathway for `[Ts 2]` and `[0xF7]`.
# Roadblocks

A couple of nasty details that must be considered.

## Counter overflow

SysEx messages contain a counter value that is incremented for every command sent. Since 7-bit values are used, there is an overflow when the counter reaches 127. This is not necessarily the issue, since in a 7-bit space, the counter is automatically wrapped to 0. But the SysEx messages are sent in pairs: a header frame (containing a command) and a body frame (containing a value).

>If the header is sent with counter value `0x7f` and the body is sent with counter value `0x00`, the amp silently stops communicating.

The fix is fairly straightforward: reset the counter to 3 (the post-handshake value) when the counter is greater than or equal to `0x7e`.

## Slot storage

The amp has 5 user memory slots for saving presets. A “dump” command returns a ~1100 byte binary blob of full preset state. But the captured upload is only around ~600 bytes. The agent’s naive approach of guessing the difference did not yield any results at the start. So I had to come up with a solid plan. To uncover the format, I started with a basic approach: replay a captured dump and upload sequence. Once I proved that this worked, I started verifying layers one by one: BLE framing, SysEx framing, header and body construction, and finally the body data.

The body data was fundamentally different: the recordings showed that the proprietary app didn’t just copy the dump bytes, but converted them into a different format while excluding some of the runtime state (like amp model, volume, calibration data etc.). Not just that, but the order of the parameters was also different.

I had to reverse-engineer the binary format from scratch: section markers, 30-byte block headers (`model + sub + count`), 10-byte parameter records (`key + type + value`). It was painstaking work, and it required collaboration between me and the agent: I captured another dump and upload sequence, and the agent analyzed the differences.

## Effects bricking the device?

Making rapid effect state changes (like switching between Tremolo, Chorus, Flanger, Phaser, or between reverb/delay modes) caused the amp to become unresponsive (soft-brick the amp). The amp would come back to life only after a power-cycle. 

The fix is simple: throttling the effect mode changes: sleeping 256 ms before the write request and 512 ms after. The app can apply optimistic UI updates, so the UX is not affected.
