# THR-II SysEx Protocol Engineering Notes

This document distills the key protocol knowledge from [doc/SYSEX_PROTOCOL_THR30II.pdf](doc/SYSEX_PROTOCOL_THR30II.pdf) (via extracted text) and organizes it for implementation.

Goal focus:
- Reliable command building for parameters, amp/effect selection, and patch operations.
- Reliable parsing of incoming THR-II messages (single parameter updates and multi-frame dumps).
- Firmware-aware symbol resolution to avoid hard-coded key drift.

## 1) Core transport facts

- SysEx framing uses F0 ... F7.
- Yamaha/Line6 manufacturer bytes are 00 01 0C.
- THR-II family code in examples is 24 02.
- Most THR-II protocol payload is 7-bit safe and uses bit-bucketing where required.
- Device must be activated for regular protocol traffic after power-up:
  - Universal identity request.
  - Firmware query.
  - Opcode 04 activation with firmware-specific magic key.

Practical impact:
- Do not send normal control commands before successful activation and acknowledgement.

## 2) Frame anatomy (high-value model)

A frame contains:
- Fixed header portion (manufacturer/device/protocol bytes).
- A/B command group selector.
- Counter and payload index fields (L2, L1, PC concept).
- Bitbucketed payload region.

De-bitbucketed payload commonly starts with:
- Opcode (4 bytes, little-endian).
- Length (4 bytes, little-endian, payload byte count for command body/series).
- Then command-specific fields:
  - UKey, PKey, Type, Value
  - Or other layouts depending on opcode.

Important:
- Length and valid-byte index must both be respected.
- Data words are little-endian 32-bit.

## 3) Bit-bucketing: protocol baseline and THR-II caveat

General Line6/Yamaha method:
- 7 raw bytes become 8 encoded bytes.
- One bucket byte carries MSBs of the next 7 bytes.
- Encoded bytes remain 00..7F.

Verified THR-II amp-select command caveat (already observed in this workspace):
- In the amp-select body command shape ... XX 0c 01 00 00 YY ...
- XX is the bucket byte.
- YY is the low 7-bit amp symbol value.
- For values >= 0x80, XX must be 0x04 in this command family.
- Example:
  - 0x99 -> XX=04, YY=19
  - 0x78 -> XX=00, YY=78

So, use generic bit-bucketing utilities for decoding streams, but allow command-specific field placement rules for encoding compact command templates.

Related note: [doc/thrii_sysex_bit_bucketing.md](doc/thrii_sysex_bit_bucketing.md)

## 4) Key opcode behavior to implement first

From PC to THR (A/B meaning inferred, partly uncertain in source):
- 01, 02, 03: short system questions (firmware/table metadata related).
- 04: activate MIDI interface (magic key in follow-up body).
- 08: set global parameter (for example amp/effect type use-cases).
- 09: ask global parameter.
- 0A: set parameter (normal parameter writes, header + body).
- 0C: status request (A); user setting download request (B).
- 0D: system question (A); upload data block (B).
- 0E: system setting (A); select user setting (B).
- 0F: short system question (settings changed state).

From THR to PC:
- 01: answer.
- 02: user setting dump report.
- 03: unit-type change report.
- 04: parameter change report.
- 06: status/ready-style message.

Acknowledge behavior:
- Ack arrives as an answer-style payload with 0x00000000.
- Not-ack (for invalid unit/parameter addressing) returns 0xFFFFFFFF.
- Out-of-range values may be clamped and still acknowledged.

## 5) Data typing rules that matter in practice

Common 4-byte conventions:
- Float/int typed field usually uses type 04 and 32-bit little-endian data.
- Bool often represented as float values 0.0 or 1.0 in practice for toggles.
- Enum handling is inconsistent by command family:
  - Sometimes explicit enum type appears.
  - Amp/effect type changes may use opcode-specific forms without explicit type field and carry symbol keys directly.

Scaling guidance:
- Many UI controls are float 0.0..1.0 mapped to 0..100 for display.
- Some exceptions (for example gate threshold semantics) are domain-scaled differently.

## 6) Symbol table is the protocol backbone

Critical strategy:
- Request symbol table on startup after activation.
- Build runtime dictionaries:
  - name -> key
  - key -> name
- Do not rely on fixed numeric keys across firmware versions.

Symbol table payload structure (per document analysis):
- Leading values include symbol count and table length.
- Then fixed-size metadata entries.
- Then null-terminated UTF-8 symbol strings.

Existing local symbol dump: [doc/thr10ii_w_symbol_table_1_44_0_a.txt](doc/thr10ii_w_symbol_table_1_44_0_a.txt)

## 7) Parsing architecture for robust implementation

Recommended parser pipeline:

1. Frame collector
- Validate F0/F7.
- Parse header and extract A/B, counter, index metadata.
- De-bitbucket payload using valid-byte boundary logic.

2. Command decoder
- Decode opcode and payload length.
- Dispatch by opcode to typed decoders.

3. Series assembler
- For multi-frame payloads (patch dumps, symbol table), append valid payload slices.
- Verify expected series total length before decode.

4. Semantic decoder
- Resolve UKey/PKey through symbol dictionary.
- Decode typed value (float/int/bool/enum/string/block token).
- Emit normalized events, for example:
  - parameter_changed
  - unit_type_changed
  - ack
  - patch_dump_chunk
  - patch_dump_complete

5. State manager
- Maintain authoritative shadow state:
  - global parameters
  - active patch snapshot
  - known user patch metadata
- Reconcile incoming reports with sent commands and acknowledgements.

## 8) Command builder architecture for reuse

Implement composable builders:

- build_header_frame(group, counter, opcode, following_bytes)
- build_body_frame(group, counter, payload_words_or_bytes)
- pack_payload_words_le32(words)
- encode_bitbucket(payload_bytes, mode)
- write_command_specific_bucketed_field(template, rules)

Command templates should be data-driven:
- operation id
- opcode
- field schema
- bitbucket placement rule
- type/value encoding rule

This avoids hand-editing hex strings and keeps protocol variations explicit.

## 8.1 Explicit outbound command set (send-side scope)

The following commands are the minimum explicit send-side feature set.

1. Select amp model
- Pattern: A-command unit type change (opcode 08 path used by current amp-select flow).
- Unit: Amp (UKey 0x0000010C, symbol Amp).
- Value: enum symbol key for amp model (for example THR10_Lead, THR10X_Brown1).
- Note: amp-select bucket placement is command-specific (bucket/value rule already verified).

2. Select cabinet
- Pattern: A-command set parameter (opcode 0A; header + body with UKey, PKey, Type, Value).
- Unit: GuitarProc (UKey 0x0000013C).
- Parameter: SpkSimType (PKey 0x00000107 from protocol examples; symbol SpkSimType exists).
- Type/Value: float type (04) with IEEE754 values 0.0..16.0 mapped to cabinet index.
- Enum labels: SPKSIM_* symbols (for example SPKSIM_Boogie412, SPKSIM_Bypass) are used for UI mapping.

3. Toggle ON/OFF states
- Pattern: A-command set parameter (opcode 0A).
- Unit: GuitarProc (UKey 0x0000013C).
- Parameters to support:
  - FX1Enable (Compressor)
  - GateEnable
  - FX2Enable (Effect)
  - FX3Enable (Echo)
  - FX4Enable (Reverb)
- Type/Value: float type (04), 0.0=OFF, 1.0=ON (as observed in THR reports).

4. Select Effect type (FX2)
- Pattern: unit-type change report-compatible write (opcode family used for enum type switches).
- Unit: FX2 (UKey 0x0000010E).
- Value: symbol key of selected effect type.
- Required effect values:
  - StereoSquareChorus
  - L6Flanger
  - Phaser
  - BiasTremolo

5. Select Echo type (FX3)
- Pattern: unit-type change style write.
- Unit: FX3 (UKey 0x00000111).
- Required echo values:
  - TapeEcho
  - L6DigitalDelay

6. Select Reverb type (FX4)
- Pattern: unit-type change style write.
- Unit: FX4 (UKey 0x00000114).
- Required reverb values:
  - StandardSpring
  - LargePlate1
  - SmallRoom1
  - ReallyLargeHall

7. Set parameter values for modules
- Pattern: A-command set parameter (opcode 0A) for numeric controls.
- Mandatory module coverage:
  - Amp (for example Drive/Bass/Mid/Treble/Master)
  - Compressor (for example Sustain/Level)
  - Effect (rate/depth/feedback fields depending on selected type)
  - Echo (time/feedback/mix)
  - Reverb (decay/tone/predelay/mix depending on type)
  - Gate and global levels where applicable
- Type handling:
  - mostly float 0.0..1.0 (scaled to UI 0..100)
  - module-specific exceptions preserved as metadata constraints

Implementation rule for all items above:
- Resolve UKey/PKey/value symbols through downloaded symbol table at runtime.
- Keep fixed-key fallback only for recovery/debug paths.

## 9) Recommended staged roadmap

Stage 1: Foundation
- Generic frame decoder with strict length/index handling.
- Generic bitbucket decode.
- Activation and ack tracking.

Stage 2: Dictionary bootstrap
- Symbol table request and parse.
- Runtime name/key mapping.

Stage 3: Real-time control
- Parameter set/get builders (opcode 0A, 09, 08 cases).
- Incoming opcode 03/04/06 handling.

Stage 4: Patch transfer
- Download (0C B-command) series assembly and parse.
- Upload (0D B-command) chunking and send with validations.

Stage 5: Validation harness
- Golden message fixtures.
- Round-trip tests (encode->decode).
- Firmware profile tests (different symbol tables).

## 10) Known uncertainties to preserve in code design

The source document itself marks several fields/opcode meanings as partly inferred.
Design implications:
- Keep decoders tolerant and trace unknown opcodes/types instead of failing hard.
- Keep message logs with raw + decoded views.
- Version-gate behavior by firmware and symbol table where possible.

## 11) Concrete implementation checklist for this repo

- Keep legacy known-good command examples for quick regression checks.
- Add a protocol module in the single-file app (or a namespaced section) with:
  - frame parsing utilities
  - bitbucket utilities
  - opcode dispatch
  - symbol dictionary helpers
- Add debug logging toggles for:
  - raw frame
  - debucketed payload
  - decoded semantic event
- Add side-by-side compare mode for generated vs legacy amp commands.

## 12) Source references in this workspace

- Protocol PDF: [doc/SYSEX_PROTOCOL_THR30II.pdf](doc/SYSEX_PROTOCOL_THR30II.pdf)
- Extracted text snapshot: [doc/SYSEX_PROTOCOL_THR30II_extracted.txt](doc/SYSEX_PROTOCOL_THR30II_extracted.txt)
- Symbol table dump: [doc/thr10ii_w_symbol_table_1_44_0_a.txt](doc/thr10ii_w_symbol_table_1_44_0_a.txt)
- Amp mapping helper: [doc/amp_sim_symbol_ids.txt](doc/amp_sim_symbol_ids.txt)
- Bit-bucketing note: [doc/thrii_sysex_bit_bucketing.md](doc/thrii_sysex_bit_bucketing.md)
