# Preset import on the amp: what the capture shows

Source: `test/fixtures/transcripts/upload_preset_with_amp_reply.txt` (USB, thr10ii, firmware 1.44.0.a, 2026-11-12).
The app imported `doc/01. EarlyVH.thrl6p` while connected. The file has `TX <label>: <hex>` lines for what the app sent, `RX USB: <hex>` lines for what the amp sent, and `Sync: ...` status lines. `test/support/transcripts.js` (`loadInboundFrames`) reads the RX lines; `decodeIncomingEvent` in `src/protocol/incoming.js` decodes them. `test/unit/preset.test.js` ("import capture") checks the counts below.

## Sequence

| Part of the file | Content |
|---|---|
| First 3 lines | End of the Actual dump read at connect, and its report (opcode `02`, words `[2, 0xffffffff, 2, 1]`). Not part of the import. |
| Import | 30 commands, each a header frame and a body frame (61 TX lines with the dump request). |
| `Sync: awaitingDump` to `Sync: idle (dump complete)` | The read-back: one dump request (group 1, opcode `0x0c`), answered by 5 frames on group 1 (1105 bytes declared), then one more group-1 frame, a status frame, and the dump report `[2, 0xffffffff, 2, 1]`. |
| Last line | `GuitInputGain` (global unit `0xffffffff`, id 327) = 0: the wireless transmitter was disconnected. Not part of the import. |

## The 30 commands, in order

| Module | Type select | Values |
|---|---|---|
| Amp | `Amp` = `THR10X_Brown1` | Bass, Drive, Master, Mid, Treble |
| Cabinet | | `GuitarProc.SpkSimType` = 2 (enum, type code 2) |
| Compressor | | `FX1.Level`, `FX1.Sustain`, `GuitarProc.FX1Enable` = 0 |
| Effect | `FX2` = `Phaser` | `FX2.Feedback`, `FX2.Speed`, `GuitarProc.FX2Mix`, `GuitarProc.FX2Enable` = 0 |
| Echo | none (the amp already had `TapeEcho`) | `FX3.Bass`, `Feedback`, `Time`, `Treble`, `GuitarProc.FX3Mix`, `GuitarProc.FX3Enable` = 1.0 |
| Reverb | `FX4` = `LargePlate1` | `FX4.Decay`, pre-delay (see below), `FX4.Tone`, `GuitarProc.FX4WetSend`, `GuitarProc.FX4Enable` = 1.0 |
| Gate | | `GuitarProc.Decay`, `GuitarProc.Thresh` = -33.0, `GuitarProc.GateEnable` = 1.0 |

Frames:

- Type select: header words `[0x08, 8]`, body `[unit id, type symbol id]`.
- Value write: header words `[0x0a, 16]`, body `[unit id, parameter id, type code, raw value]`. Floats and on/off states use type code 4 (on = `0x3f800000`); the cabinet uses type code 2.

## What the amp answers

- **Every command gets one ACK** (opcode `01`, declared length 4): 30 ACKs for 30 commands. The ACK's own counter is the amp's, not the command's. Most are followed by a status frame (opcode `06`, words `[1, 2, 1]`).
- **Amp model select**: the amp echoes the change (opcode `03`, `[Amp, THR10X_Brown1]`) and then sends values of its own: `GuitarProc.SpkSimType` = 3 (the model's default cabinet), `GateEnable`, `Thresh`, `Decay`, and the global `GuitProcOutputGain` and `GuitProcInputGain` = 1.0. This is why the cabinet is written after the amp model.
- **Effect and reverb type select** (`FX2`, `FX4`): no echo of the type; only the two global gain values follow.
- **Cabinet write**: the amp reports `SpkSimType` = 2 back as a parameter change. Other value writes are not reported back.
- **No slot notification** (opcode `02` with a slot) appears during the import.

## Finding: the reverb pre-delay was written to the wrong id

The symbol table has the name twice: `Pre Delay` = 233 and `PreDelay` = 252. The import wrote id 233. The amp ACKed the write like any other and ignored it, so the read-back showed its old pre-delay and the app reported "the amp differs in: FX4 PreDelay". The amp itself reports this control as `PreDelay` (252) (`echo_reverb.txt`, Hall). `makeIdOfName` in `src/protocol/symbolTable.js` now prefers the name without the space, which also corrects the default pre-delay written when a reverb type is picked in the UI.

General rule this confirms: **an ACK does not mean the amp accepted the parameter**. Only a read-back shows it.
