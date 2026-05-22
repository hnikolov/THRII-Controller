# THR-II SysEx Parser Architecture

This file tracks the parser approach and implementation decisions.
Update it after each parser iteration.

## Scope
- Runtime location: [thrii_ctrl.html](thrii_ctrl.html)
- Parser ownership object: `window.thrIncomingParser`
- Inputs: raw incoming USB MIDI and BLE MIDI bytes
- Outputs: parsed frame history and semantic event queue

## Layered Approach
1. Frame layer
- Split raw byte stream into SysEx frames (`F0 ... F7`).
- Validate basic THR/Line6 framing and parse fixed header fields.

2. Bitbucket layer
- Decode THR 7-bit bucketed payloads to raw payload bytes.
- Respect THR bit ordering and `lastValidIndex` trimming.

3. Payload layer
- Parse opcode and declared payload length.
- Slice remaining bytes as LE `u32` words with alignment warnings.

4. Semantic layer
- Convert opcode payloads into stable semantic events.
- Correlate incoming responses with pending outbound metadata.

5. Symbol layer
- Resolve numeric symbol keys with local symbol table JSON.
- Use fallback map if JSON cannot be loaded.

## Current Data Structures
- `thrIncomingParser.history`: bounded list of parsed frame objects.
- `thrIncomingParser.events`: bounded list of semantic events.
- `thrIncomingParser.pendingOutbound`: outbound metadata for ACK/NACK correlation.
- `thrIncomingParser.symbols`: resolver state (`byId`, `byName`, source, ready flag).
- `thrIncomingParser.debug`: toggles for `raw`, `parsed`, `decoded`, `events` logs.

## Key Decisions
- Parser must never hard-fail on unknown/partial payloads; warn and continue.
- Unknown opcodes remain observable via `unknown_opcode` events.
- Symbol resolution is best-effort: parser correctness does not depend on symbol file load success.
- Event queue is UI-agnostic; no direct UI mutation in parser iteration work.

## Iteration Log

### Iteration 1 (completed)
- Added frame extraction and THR bitbucket decoder.
- Added parsed frame object shape with opcode/length basics.
- Wired parser into both USB and BLE incoming paths.

### Iteration 2 (completed)
- Added opcode skeleton handling for 0x01, 0x04, 0x06.
- Added ACK/NACK detection (`0x00000000`, `0xFFFFFFFF`).
- Added outbound correlation metadata and pending queue.
- Added parser event queue and debug toggles.

### Iteration 3 (completed)
- Added symbol resolver support:
  - runtime load from `doc/thr10ii_w_symbol_table_1_44_0_a.json`
  - fallback resolver map for critical keys.
- Added type-aware value decode helper (`float32`, `bool`, `enum_u32`, `u32`).
- Added opcode `0x04` semantic decode to normalized `parameter_change` events.
- Added opcode `0x03` semantic decode to normalized `unit_type_change` events.
- Extended event logging to include resolved names when available.

## Event Shapes (current)
- `ack` / `nack`
- `answer`
- `status_ready`
- `parameter_change`
- `unit_type_change`
- `unknown_opcode`

## Next Iteration Target (Iteration 4)
- Build multi-frame payload assembler for long responses/dumps.
- Emit `dump_chunk` and `dump_complete` events.
- Keep ordering deterministic by group/counter/opcode.
