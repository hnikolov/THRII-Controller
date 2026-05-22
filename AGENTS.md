# AGENTS

## Project Scope
- Single-file web app in [thrii_ctrl.html](thrii_ctrl.html).
- Vanilla HTML, CSS, and JavaScript only.
- No package manager, build step, lint config, or automated tests.

## How To Run
- Open [thrii_ctrl.html](thrii_ctrl.html) directly in a modern Chromium-based browser.
- For local development, use a simple static server only if browser security policy blocks device APIs in your setup.

## Platform APIs In Use
- Web MIDI API (USB MIDI access)
- Web Bluetooth API (BLE MIDI characteristic)
- WebUSB API (USB permission hint flow)

## Architecture Snapshot
- UI and logic are colocated in one script block inside [thrii_ctrl.html](thrii_ctrl.html).
- Transport state is held in module-scoped variables:
  - USB: midiAccess, midiOut, midiIn
  - BLE: bleDevice, bleServer, bleMidiChar, bleTs, bleNotificationHandler
- Connection flow:
  1. onConnect() attempts USB first.
  2. If USB fails or is cancelled, fallback to BLE.
  3. setStatus() is the source of truth for button enabled/disabled state.

## Conventions
- Naming:
  - camelCase for variables/functions
  - UPPER_SNAKE_CASE for UUID constants
  - btn* prefix for button IDs and on* prefix for handlers
- Async operations should be wrapped in safeRun() for user-facing error logging.
- Keep logging via log() for all important connection and transmit events.

## Critical Pitfalls
- In cleanupBle(), remove characteristic event listeners before clearing BLE references.
- Preserve BLE timestamp wrapping in nextBleTs() using 13-bit mask behavior.
- Keep preset index clamping in sendPreset() aligned with existing 5 preset buttons.
- Avoid partial state resets: USB and BLE globals are coupled and must stay consistent.

## Change Guidelines For Agents
- Prefer minimal edits in [thrii_ctrl.html](thrii_ctrl.html); do not introduce frameworks or bundlers.
- Do not refactor into multiple files unless explicitly requested.
- Preserve current USB-first then BLE-fallback connection behavior unless asked to change it.
- When adding commands/buttons, update both UI markup and setStatus() enable/disable behavior.

## Verification Checklist
- Confirm Connect, Disconnect All, Activate THR-II, Preset buttons, and Raw SysEx send still work.
- Confirm log output still records TX/RX events and major state transitions.
- Confirm cancellation flows (USB chooser/BLE chooser) remain non-fatal and user-readable.
