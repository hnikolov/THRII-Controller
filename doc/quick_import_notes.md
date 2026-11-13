# Quick preset import: approach, patch format, details

How a `.thrl6p` preset is sent to the amp as one upload (November 2026).
Amp: THR10II Wireless, firmware 1.44.0.a. Tested over USB; BLE was not captured.

Each statement about the amp is marked **confirmed** (tested on the amp or seen in a capture), **inferred**, or **unknown**.

Related notes: `save_to_memory_notes.md` (uploads to a memory, the two patch layouts), `import_preset_capture_notes.md` (the value-by-value import).

## Summary

- The amp takes an upload to its **Actual settings** (target `0xffffffff`). The sound changes at once, and a read of the Actual settings shows the uploaded settings. **Confirmed** (unlike a memory, there is no stale content).
- The quick import builds **one patch in the memory layout** from the preset, on top of the amp's current Actual dump, uploads it, reads the amp back, and compares it with the preset. It works on hardware. **Confirmed** (2026-11-13).
- It takes about a second. The value-by-value import takes 5 to 8 seconds: about 30 paced commands, plus about 0.8 s of pauses per amp or effect type change.
- The value-by-value import is kept. It runs when the flag is off, and as the fallback when the quick import cannot build or send its patch or the amp then differs from the preset.

## Switch

`quickImport` in `src/core/flags.js`.

| Value | Import with an amp connected |
|---|---|
| `true` (default) | Quick import; value-by-value import as fallback. |
| `false` | Value-by-value import only. |

Without an amp, Import only fills the app's store; the flag has no effect.

## Sequence

Code: `importPreset`, `uploadPreset` and `writePreset` in `src/app/presetFlow.js`. The whole import runs inside `exclusive` (`src/app/boot.js`): the controls take no input, pending knob writes are flushed first.

| Step | What | Frames |
|---|---|---|
| 0 | Parse the file and make the plan (`parseThrl6Preset`, `presetToPlan`). An unknown name or type refuses the preset; nothing is sent. | none |
| 1 | Read the Actual settings: the template for the patch. | 1 request, about 5 from the amp |
| 2 | Build the patch (`buildPresetPatch`). | none |
| 3 | Upload it to the Actual target (`buildUploadFrames`). | 4 for the sample preset (1 header, 3 body), 18 ms apart |
| 4 | Wait 300 ms, read the Actual settings and apply them to the store. | 1 request, about 5 from the amp |
| 5 | Compare the store with the plan (`comparePlan`). No differences: done. | none |
| 6 | Fallback, only when step 2 or 3 throws or step 5 finds differences: the value-by-value import, then its own read-back and comparison. | about 60 |

After either mechanism the store holds what the amp reported, the imported name is put back, no memory is marked active, and the settings count as modified. The status shows `Imported <name>`, or `Imported <name>, but the amp differs in: ...`.

When the fallback is taken, the trace has one of these lines first:

- `Quick import: the amp differs in ...; sending the preset value by value`
- `Quick import failed (...); sending the preset value by value`

## The patch

Built by `buildPresetPatch(templatePatch, plan, { nameOf, stateIdOf })` in `src/protocol/memoryPatch.js`. A patch is a dump payload without its 16-byte header.

### Overall shape (memory layout)

```
<name and meta section, ending with the TRTG marker>
OPEN  <GuitarProc header> <count = 11> <11 records>
OPEN  <FX1 header>        <count>      <records>  CLOSE
OPEN  <Amp header>        <count>      <records>  CLOSE
OPEN  <FX2 header>        <count>      <records>  CLOSE
OPEN  <FX3 header>        <count>      <records>  CLOSE
OPEN  <FX4 header>        <count>      <records>  CLOSE
CLOSE
END
```

| Token | Bytes |
|---|---|
| OPEN | `03 00 00 80 07 00` |
| CLOSE | `04 00 00 80 00 00` |
| END | `02 00 00 80 00 00` |
| TRTG marker | `54 52 54 47` |

The GuitarProc block is not closed after its records; it stays open around the five unit blocks and is closed by the CLOSE before END. This is the layout a compact user memory has; for a recalled memory, converting the amp's Actual dump to this layout reproduces the memory's dump byte for byte (`toMemoryPatch`, test with `dump_slot_1_debug.txt`). **Confirmed** for one sound; the amp accepted built patches of other sounds too.

### Name and meta section

Copied from the template (the amp's own Actual dump), up to and including `TRTG`. Only the name is replaced (`withPatchName`): the first string after the `PSRP` marker, stored as a 4-byte length (text plus one closing zero) followed by the bytes. The other meta values, including the tempo, stay as the amp had them.

### Block header (20 bytes, then a 4-byte record count)

```
<unit key, 2 bytes> 00 00 05 00  00 80 07 00  <type id, 2 bytes> 00 00 06 00  00 80 02 00  <count, 4 bytes>
```

| Unit | Key | Type |
|---|---|---|
| GuitarProc | `0x13c` | `Y2GuitarFlow`, unchanged |
| FX1 (compressor) | `0x109` | `RedComp`, unchanged |
| Amp | `0x10c` | the preset's amp model |
| FX2 (effect) | `0x10e` | the preset's effect type |
| FX3 (echo) | `0x111` | the preset's echo type |
| FX4 (reverb) | `0x114` | the preset's reverb type |

Headers are copied from the template. For Amp, FX2, FX3 and FX4 the two type bytes (offset 10) are set to the preset's type id when it differs. The type id is the symbol id of the type name (`THR10X_Brown1`, `Phaser`, ...), the same id a dump reports.

### Record (10 bytes)

```
<parameter id, 2 bytes> 00 00  <type code> 00  <value, 4 bytes little-endian>
```

| Kind | Type code | Value |
|---|---|---|
| on/off | 1 | `1` or `0` |
| enum (cabinet) | 2 | whole number |
| float | 3 | 32-bit float |

- The parameter id is the **dump id**: the symbol whose name is the parameter name plus `State` (`Freq` gives `FreqState` = 227, `PreDelay` gives `PreDelayState` = 251). `makeStateIdOf` in `src/protocol/symbolTable.js` resolves it. This is not the id used for live writes (`Freq` = 228, `PreDelay` = 252).
- On/off: the amp's own dumps show `1` for on. After enables were written as floats by the value-by-value import, the amp's dump showed `0x3f800000` in the same field, and both read as on. The built patch uses `1`.

### Which records each block gets

**GuitarProc**: exactly these eleven, in this order:

| # | Record | From the preset |
|---|---|---|
| 1 | `FX1EnableState` | compressor `@enabled` |
| 2 | `FX2EnableState` | effect `@enabled` |
| 3 | `FX2MixState` | effect `@wetDry` |
| 4 | `FX3EnableState` | echo `@enabled` |
| 5 | `FX3MixState` | echo `@wetDry` |
| 6 | `FX4EnableState` | reverb `@enabled` |
| 7 | `FX4WetSendState` | reverb `@wetDry` |
| 8 | `GateEnableState` | gate `@enabled` |
| 9 | `SpkSimTypeState` | cabinet `SpkSimType` |
| 10 | `DecayState` | gate `Decay` |
| 11 | `ThreshState` | gate `Thresh` (dB, for example -33.0) |

**FX1, Amp, FX2, FX3, FX4**: float records in name order (`BassState`, `DriveState`, `MasterState`, `MidState`, `TrebleState` for the amp).

How the values are chosen:

1. Start from the template's blocks reduced to the memory layout: the eleven GuitarProc records, and in the other blocks the float records.
2. A unit whose type changes loses all its records; it then holds only what the preset names for the new type.
3. Each preset value replaces the record with the same id, or is added to its unit block.
4. The unit blocks are sorted by name.

Consequences:

- A value the preset does not name keeps the amp's current value, as long as the unit's type does not change.
- For a unit whose type changes, a value the preset does not name is absent from the patch. What the amp then uses for it is **unknown** (preset files written by THR Remote name every value of a type).
- The preset's tempo (`THRPresetParamTempo`) is not sent, as in the value-by-value import.
- A preset parameter with no dump id stops the build, and the fallback runs.

The groups of a `.thrl6p` file hold exactly the parameters this layout holds, in the same name order. That is what makes the patch buildable from the file plus the symbol table.

## The upload

`buildUploadFrames({ kind: 'actual' }, patch)` in `src/protocol/upload.js`, all on group 1. The frames are those of an upload to a memory; only the target differs.

- Header frame: opcode `0x0d`, then six words: total length (patch + 20), target `0xffffffff`, length minus 8 (patch + 12), `0`, `1`, `0`.
- Body frames: the patch in pieces of 210 bytes; the last one is shorter.
- Numbering: header pc 0; body pc 1, 2, 3, ...; counters consecutive, header first, taken as one unbroken run.
- 18 ms between frames; 300 ms before the read-back.
- The amp ACKs after the last frame. As everywhere, the ACK says nothing about the content.

## The check

`comparePlan` in `src/state/applyPreset.js`, on the store after the amp's Actual dump has been applied:

- every unit type of the preset equals the amp's;
- every float is within 0.001 (relative for values above 1, such as the gate threshold);
- every on/off state and the cabinet are equal.

The preset's tempo is not checked.

## What is confirmed, inferred, unknown

| Statement | Status |
|---|---|
| The amp applies an upload to the Actual target at once, and a read shows it | confirmed (memory dumps uploaded to Actual, several memories) |
| The amp accepts a patch built by the app in the memory layout | confirmed (imports on hardware) |
| Record sets and order for chorus, tape echo, hall | confirmed (capture) |
| Record sets and order for the other effect, echo and reverb types | inferred from the rule "float values in name order"; imports that passed the check on hardware support it, but which types were tried was not recorded |
| What the amp uses for a value missing from a block | unknown |
| Behaviour over BLE | unknown (uploads are the app's longest frames) |
| Body frames numbered from 0, as the protocol document shows | unknown; the app numbers from 1, which the amp accepts |

## Code map

| Piece | Where |
|---|---|
| Flag | `quickImport` in `src/core/flags.js` |
| Flow, fallback | `importPreset`, `uploadPreset`, `writePreset` in `src/app/presetFlow.js` |
| Patch builder | `buildPresetPatch`, `toMemoryPatch` in `src/protocol/memoryPatch.js` |
| Name | `withPatchName` in `src/protocol/dumpParser.js` |
| Dump ids | `makeStateIdOf` in `src/protocol/symbolTable.js` |
| Upload frames | `buildUploadFrames` in `src/protocol/upload.js` |
| Plan and comparison | `presetToPlan` in `src/domain/presetModel.js`, `comparePlan` in `src/state/applyPreset.js` |
| Value-by-value sender | `sendPlan` in `src/app/boot.js` |

## Tests

- `test/unit/preset.test.js`: the patch built for the sample preset on another sound reads back as the sample (types, values, name, memory layout); a preset exported from a dump rebuilds that dump's memory layout record for record; an unknown parameter stops the build.
- `test/unit/presetFlow.test.js`: the whole quick import against a fake amp that answers Actual reads with what was uploaded (`takesUploads` in `test/support/fakeAmp.js`); the fallback when the amp differs; the flag off.

## How it was established

1. Observation: Save (one upload) felt much faster than Import (about 30 commands).
2. Experiment: a memory's own dump was uploaded to the Actual target from a temporary dev-page button. The sound changed and the read-back matched, on several memories. The experiment code was removed afterwards.
3. Implementation with the fallback, flag on by default; imports then worked on the amp.
