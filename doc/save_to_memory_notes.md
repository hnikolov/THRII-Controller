# Saving to a user memory: findings

What was learned on hardware while building "Save to THR slot 1 to 5", Backup and Restore (November 2026).
Amp: THR10II Wireless, firmware 1.44.0.a. All captures are over USB.

Each statement is marked **confirmed** (seen in a capture or tested on the amp), **inferred**, or **unknown**.

## Summary

1. The amp accepts an upload of its own Actual settings dump to a memory and stores it. **Confirmed** (by ear and by the check, on several memories).
2. **A memory read after an upload returns the memory's old content.** It did so 1.3 s after the upload. Recalling the memory shows the new content. **Confirmed.** A read-back of the memory is therefore no check.
3. The only reliable check is: recall the memory, read the Actual settings, compare them with what was sent. **Confirmed.**
4. The amp ACKs an upload whether or not anything else is right. An ACK proves nothing about the content (the same was found for parameter writes, see `import_preset_capture_notes.md`).
5. Memories exist in two layouts (1109 and 613 bytes for the same sound). Compare settings, never bytes. **Confirmed.**

## The save sequence the app uses

Code: `save` and `writeSlot` in `src/app/presetFlow.js`.

| Step | Frames | Purpose |
|---|---|---|
| 1 | Read the Actual settings | The patch to store. Every value comes from the amp's own dump. |
| 2 | Read memory N | Its previous content, kept only to offer it back if the check fails. **Optional, see below.** |
| 3 | Upload the Actual patch (with the name from the label) to memory N | The save. |
| 4 | Wait 300 ms, select memory N, read the Actual settings, compare | The check. It also makes the saved memory the active one. |

During the whole operation the UI takes no input, pending knob writes are flushed first, and memory notifications from the amp are not treated as slot presses (`exclusive` in `src/app/boot.js`).

### Option: remove step 2

Step 2 costs one dump read per save (about five frames from the amp). Its only use is the question "Memory N does not hold what was sent. Put its previous content back?" after a failed check. Since the check was fixed, no save has failed on hardware. Removing step 2 means removing that question and the put-back path in `save`; a failed save would then only be reported, and the old content would be recoverable only from a Backup THR file. Restore does not use step 2 (it takes a full backup file first instead).

## Frames

All frames below are on group 1. Counters come from `nextCommandCounter`.

### Read a dump (`buildRequestUserSettingsDump`)

- Request: opcode `0x0c`, length 4, target. Target `0xffffffff` is the Actual settings; `0` to `4` are memories 1 to 5.
- Answer: an ACK (opcode `01`, length 4), then a series of frames with 256 decoded bytes each (`0f 0f` in the last-index field; the last frame is shorter). The first frame carries opcode `01` and the total length. The payload starts with 16 bytes (`00000000 00000000 00000001 00000000`); the patch follows.
- After an Actual dump the amp sends a report on group 0: opcode `02`, words `[2, 0xffffffff, 2, 1]`. It often arrives late, after the next request has been sent. No report was seen after a memory read. **Confirmed.**

| Dump | Declared length | Patch | Frames |
|---|---|---|---|
| Actual settings | 1125 | 1109 bytes | 5 |
| Memory 1 as found (compact layout) | 629 | 613 bytes | 3 |
| A memory written by the app | as uploaded | 1109 bytes | 5 |

### Upload to a memory (`buildSlotUploadFrames` in `src/protocol/upload.js`)

- Header frame: opcode `0x0d`, then six words: total length (patch + 20), memory index 0 to 4, length minus 8 (patch + 12), `0`, `1`, `0`.
- Body frames: the patch in pieces of 210 decoded bytes (`0d 01` in the last-index field; the last frame is shorter). A 1109-byte patch gives 6 body frames, a 613-byte patch 3.
- Numbering that the amp accepted: header pc 0; body pc 1, 2, 3, ...; counters consecutive, header first. The counters are taken as one unbroken run so the upload does not cross the counter restart (after `0x7e`).
- Pacing: 18 ms between frames (taken from the legacy page).
- Answer: one ACK (opcode `01`, length 4, value 0) after the last frame. Nothing else was seen. **Confirmed.**

### Select a memory (`buildSelectPreset`)

Opcode `0x0e`, words `[0x0e, 4, memory index]`. The amp ACKs; the app then reads the Actual settings. After the dump the amp sends its report and the two global gains (`GuitProcInputGain` 333 and `GuitProcOutputGain` 336, both 1.0). **Confirmed.**

### Memory notifications (opcode `02` on group 0)

| Words | Meaning |
|---|---|
| `[2, slot, 2, 0]` | A memory button was pressed on the amp. |
| `[2, 0xffffffff, 2, 1]` | Report of an Actual dump. |
| `[2, slot, 2, 1]` | Expected for a memory dump report; not seen. The decoder treats code 1 as a dump report. **Inferred.** |

## The two patch layouts

Same sound, read from the amp in one session (`dump_slot_1_debug.txt`):

| | Actual dump (1109 bytes) | Compact memory (613 bytes) |
|---|---|---|
| Name and meta section, up to the `TRTG` marker | same bytes | same bytes |
| Tuner block | yes (3 parameters) | no |
| GuitarProc block | 19 parameters | 11 parameters, in this order: `FX1Enable`, `FX2Enable`, `FX2Mix`, `FX3Enable`, `FX3Mix`, `FX4Enable`, `FX4WetSend`, `GateEnable`, `SpkSimType`, `Decay`, `Thresh` (all with the `State` suffix) |
| FX1, Amp, FX2, FX3, FX4 blocks | all parameters, device order | float parameters only (no `SyncSelect`), in name order |
| SpkSimSubR and the eight EQ blocks | yes (empty) | no |

- `toMemoryPatch` in `src/protocol/memoryPatch.js` converts the first layout to the second. For the capture it reproduces the memory byte for byte (test in `test/unit/preset.test.js`). **Confirmed for one sound** (chorus, tape echo, hall); for other effect types the rule is **inferred**.
- The amp keeps an uploaded patch in the layout it was sent in: a memory written by the app came back as a five-frame dump. **Confirmed.** Where the compact layout of memory 1 came from (THR Remote or the amp's own store button) is **unknown**.
- Both layouts load and play correctly when recalled. **Confirmed** (Restore of a backup worked).

## The name

- The name is the first string field after the `PSRP` marker: a 4-byte length (text plus one closing zero), then the bytes. Nothing around it counts bytes, so a rename changes only that field and the total length (`withPatchName` in `src/protocol/dumpParser.js`). **Confirmed** (saves with a changed name passed the check).
- The app allows 20 printable ASCII characters (`PRESET_NAME_MAX`). The protocol document says the amp takes up to 63. Names longer than 20 and non-ASCII characters are **untested**.

## The check

`memoryDifferences` in `src/protocol/memoryPatch.js`: the sent patch is converted to the compact layout, and its name, unit types and values must all be present in the Actual settings read after the recall. The read patch may hold more. On a difference the trace has a `Save check: ... differs: ...` line with each setting and value.

## What was tried and withdrawn

| Attempt | Result |
|---|---|
| Compare the memory read-back with the sent bytes | Always failed: stale content (finding 2) and different layouts. |
| Compare settings of the memory read-back | Passed only when saving a memory onto itself; failed for any other memory (stale content). |
| Read the memory back again after a further second | Still the old content. |
| Upload the patch converted to the compact layout, body frames numbered from 0 (as the protocol document shows) | Never run on the amp. Withdrawn in favour of the upload proven by ear. Whether the amp accepts either variation is **unknown**. |

## Backup and Restore

- Backup reads memories 1 to 5 and writes them, with firmware and identity, to one JSON file. Restore uploads each patch as it is in the file, with the same recall check, and takes a fresh backup first. Both worked on hardware.
- Restore recalls each memory for its check, so the amp steps through the five memories and ends on memory 5.
- **Unknown:** whether a memory read returns the new content once the memory has been recalled, or only after a power cycle. A backup taken right after a save should be looked at with this in mind; in the app every saved memory is recalled as part of the save.

## Other open points

- BLE: none of this was captured over BLE. Upload frames are the longest the app sends; see `BLE_USE_REPORTED_PACKET_SIZE` in `src/transports/bleTransport.js`.
- An upload to the Actual settings (target `0xffffffff`) works: the sound changes at once and a read of the Actual settings shows the uploaded settings, with no stale content (tested with memory dumps on several memories, 2026-11-13). The quick preset import uses it (`uploadPreset` in `src/app/presetFlow.js`, flag `quickImport`).

## Practical note

While testing changes to this code, hard-reload the page (Ctrl+Shift+R). One capture was taken with the previous version of the code because the browser had kept the old modules.

## Captures

| File (in `test/fixtures/transcripts/`) | Content |
|---|---|
| `dump_slot_1_debug.txt` | Activation, select memory 1, read Actual and memory 1, upload Actual to memory 1, read back, upload the previous content, read back. Source of the two layouts. |
| `dump_slot_1_debug_1.txt` | The same sequence again (taken with the earlier code). |
| `actual_dump.txt` | An Actual dump alone. |
| `upload_preset_with_amp_reply.txt` | A preset import (parameter writes, not a memory upload); see `import_preset_capture_notes.md`. |

The trace of the save to another memory (stale read-backs, then the recall check passing) was reviewed but not stored as a file.
