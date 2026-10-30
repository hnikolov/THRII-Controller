The activation sequence required to get the Yamaha THR-II to acknowledge commands over Bluetooth Low Energy is a ==**firmware-level validation handshake**==. If you bypass this, the amp's onboard MIDI parser intentionally drops all parameter packets to prevent unsolicited third-party data from altering the device state. 

The specific handshake requirements, reverse-engineered directly from how the official **THR Remote app** establishes an active session, consist of three core phases: [[1](https://alican.codes/blog/reverse-engineering-yamaha-thr-ii/)]

---

## Phase 1: Enabling Subscriptions (BLE Standard)

Before transmitting bytes, your app must explicitly request data streams from the amp. Write a standard command to the **Client Characteristic Configuration Descriptor (CCCD)** on the Yamaha MIDI input characteristic (`UUID: 7772E5DB-...`).

The official service and characteristic UUIDs are **standard, globally enforced specifications for BLE MIDI**. The exact specifications include: 
- **Standard BLE MIDI Service UUID:** `03B80E5A-EDE8-4B33-A751-6CE34EC4C700`
- **Standard BLE MIDI Data I/O Characteristic UUID:** `7772E5DB-3868-4112-A1A9-F2669D106BF3` 

**The Command:** Enable both **Notifications** and **Indications** by writing `0x0001` (or `0x0003` depending on the platform BLE API).

**Why it matters:** The amp refuses to process input frames unless it registers that the host application is actively listening for responses.

## Phase 2: The Inquiry Sequence (The "Wake Up" Pings)

Once the connection status shifts to active and notifications are listening, you must immediately fire two distinct **SysEx Identity Requests** spaced exactly **50ms to 100ms** apart. These packets prompt the amp to return its current token state.

_Note: The following examples include the compliant standard `0x80 0x80` BLE-MIDI timestamp framing headers._

1. Universal Device Identity Inquiry

This standard MIDI string prompts the amp to broadcast its hardware parameters and firmware generation tags:

```text
Raw SysEx:  F0 7E 7F 06 01 F7
BLE-MIDI:   80 80 F0 7E 7F 06 01 80 F7
```

2. Yamaha Corporate Device Query

This vendor-specific inquiry checks whether the connected application is compatible with Yamaha's line parameters:

```text
Raw SysEx:  F0 43 7D 30 00 01 F7
BLE-MIDI:   80 80 F0 43 7D 30 00 01 80 F7
```

## Phase 3: The Model Verification Loop

Upon parsing the two inquiry pings, the THR-II shifts its status led registers and pushes a lengthy response block (the **symbol table**?) back through the Notification channel. This return payload outlines its exact identification fingerprint (e.g., confirming it is a base THR10 II, a 10II Wireless, or a 30II Wireless).

To complete the activation loop, your app must wait to parse this incoming notification stream. As soon as you receive the message from the amp, you must reply with a final validation acknowledgment:

```text
Raw SysEx:  F0 43 7D 30 00 02 F7
BLE-MIDI:   80 80 F0 43 7D 30 00 02 80 F7
```

Once this third frame lands in the amp's BLE ring buffer, the activation gate opens permanently. At this point, you can begin streaming your segmented parameter adjustments, effect toggles, and knob values using the JavaScript multi-packet parser you built.

# Dynamic Connection Initialization Routine Example

```ts
// Global tracking variable for the activation workflow step
let handshakeStage = 0; 
let thrCharacteristic = null;

/**
 * Triggered automatically when the BLE MIDI data characteristic is successfully discovered.
 * 
 * @param {BluetoothRemoteGATTCharacteristic} characteristic - The validated BLE MIDI I/O characteristic.
 */
async function initializeTHRConnection(characteristic) {
    thrCharacteristic = characteristic;
    handshakeStage = 1;

    try {
        // Step A: Standard BLE requirement - Activate the notification pipeline
        await thrCharacteristic.startNotifications();
        thrCharacteristic.addEventListener('characteristicvaluechanged', handleTHRNotification);
        console.log("BLE MIDI Notification channel actively listening.");

        // Step B: Dispatch the initial two-part verification sequence
        const universalInquiry = new Uint8Array([0x80, 0x80, 0xF0, 0x7E, 0x7F, 0x06, 0x01, 0x80, 0xF7]);
        const yamahaInquiry    = new Uint8Array([0x80, 0x80, 0xF0, 0x43, 0x7D, 0x30, 0x00, 0x01, 0x80, 0xF7]);

        console.log("Sending initial firmware handshake pings...");
        await thrCharacteristic.writeValueWithoutResponse(universalInquiry);
        
        // Short delay to ensure the hardware's internal buffer processes the frames sequentially
        await new Promise(resolve => setTimeout(resolve, 50)); 
        await thrCharacteristic.writeValueWithoutResponse(yamahaInquiry);

    } catch (error) {
        console.error("Critical failure during initial connection step:", error);
    }
}

/**
 * Processes incoming data frames returned by the Yamaha THR-II amplifier.
 */
async function handleTHRNotification(event) {
    const value = event.target.value;
    // Map data buffer to a standard array format
    const receivedBytes = Array.from(new Uint8Array(value.buffer)); 
    console.log("Data packet received from Amp:", receivedBytes.map(b => b.toString(16).toUpperCase()));

    // Verify if the device returned a standard manufacturer response payload
    if (handshakeStage === 1 && receivedBytes.includes(0x43) && receivedBytes.includes(0x7D)) {
        console.log("Valid manufacturer profile detected. Processing confirmation handshake...");
        
        // Transition state to prevent redundant handshakes on standard knob updates
        handshakeStage = 2; 

        // Final activation frame
        const finalValidation = new Uint8Array([0x80, 0x80, 0xF0, 0x43, 0x7D, 0x30, 0x00, 0x02, 0x80, 0xF7]);
        
        try {
            await thrCharacteristic.writeValueWithoutResponse(finalValidation);
            console.log("Handshake validation sequence completed. Control gate open.");
        } catch (error) {
            console.error("Failed to transmit final validation token:", error);
        }
    }
}
```