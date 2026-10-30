# THR-II SysEx Parser Architecture

This document describes the runtime parser design in [thrii_ctrl.html](thrii_ctrl.html), including how bytes become semantic events, how state is updated, and how UI sync is kept side-effect free.

## Purpose
- Decode incoming THR-II SysEx traffic from USB and BLE safely.
- Normalize decoded messages into stable semantic events.
- Maintain a shadow state model from incoming events.
- Reflect incoming state in UI controls without sending commands.

## Runtime Scope
- Main runtime owner: window.thrIncomingParser
- Primary file: [thrii_ctrl.html](thrii_ctrl.html)
- Symbol source preload: [doc/thr10ii_w_symbol_table_1_44_0_a.js](doc/thr10ii_w_symbol_table_1_44_0_a.js)

## Architecture Overview

### 1. Ingress Layer
- Sources:
  - USB MIDI message callback
  - BLE characteristic notification callback
- Responsibility:
  - deliver raw bytes to a common input path
- Entry point:
  - handleIncomingBytes(bytes, source)

### 2. Frame Layer
- Responsibility:
  - split raw byte streams into SysEx frames (F0...F7)
  - parse fixed THR/Line6 header fields
  - validate minimum shape and preserve warnings
- Output:
  - parsed frame object with rawHex, header, encodedPayload, decodedPayload

### 3. Bitbucket Decode Layer
- Responsibility:
  - decode THR 7-bit bucketed payload bytes
  - trim by last-valid index from header fields
- Notes:
  - decoding is deterministic and non-throwing for malformed tails (warnings are collected)

### 4. Payload Decode Layer
- Responsibility:
  - decode opcode and declared length (LE u32)
  - decode payload words (LE u32 array)
  - decode typed values (float32, bool, enum/u32)
- Output:
  - parsed frame enriched with opcode, declaredLength, payloadWords

### 5. Multi-Frame Assembly Layer
- Responsibility:
  - assemble long responses keyed by source/group/counter/opcode
  - accumulate chunks deterministically
  - emit progress and completion events
- Events emitted:
  - dump_chunk
  - dump_complete
- Safety:
  - stale assembly cleanup timeout prevents unbounded growth

### 6. Semantic Event Layer
- Responsibility:
  - map opcodes and payload shape to semantic event kinds
  - preserve unknown opcode data for observability
  - correlate responses with pending outbound metadata where applicable
- Core event families:
  - ack, nack
  - answer, status_ready
  - parameter_change
  - unit_type_change
  - dump_chunk, dump_complete
  - unknown_opcode

### 7. Symbol Resolution Layer
- Responsibility:
  - resolve numeric IDs to names for units, parameters, and enum values
- Strategy:
  - prefer preloaded JS symbol map
  - fallback to JSON load
  - fallback to minimal in-code map
- Important rule:
  - parser correctness does not depend on symbol availability

### 8. Shadow State Layer
- Responsibility:
  - apply semantic events into a structured model
  - maintain stats, unit snapshots, parameter values, and dump status
- Data categories:
  - stats: frame count, event count, parser errors, last event
  - units: per-unit type and parameter maps
  - dump: in-progress and last-complete metadata
  - symbols: active source indicator

### 9. UI Sync Layer
- Responsibility:
  - map shadow state to selected controls
  - visualize amp-originated changes
  - never send commands during render
- Synced surfaces:
  - cabinet select
  - module enable toggles
  - amp/effect/echo/reverb type buttons
- Visual markers:
  - matched state marker
  - unknown/out-of-map marker
  - short auto-clear timer

## Separation of Concerns

### Transport vs Parse
- Transport handlers only provide bytes and source.
- Parser owns framing, decode, and event generation.

### Parse vs State
- Decoder produces semantic events.
- Reducer applies events into shadow state.

### State vs UI
- UI reads shadow state and renders.
- UI render path does not call send logic.

### Inbound vs Outbound
- Incoming event handling is independent of builder send functions.
- Correlation metadata is shared only for response tracking.

## Core Data Contracts

### Parsed Frame Contract
- source
- rawHex
- header (group, counter, l2, l1, lastValidIndex, etc.)
- encodedPayload
- decodedPayload
- opcode
- declaredLength
- payloadWords
- warnings

### Semantic Event Contract
- kind
- source/group/counter/opcode
- typed fields per kind
- optional correlation metadata

### Shadow State Contract
- stats
- units keyed by unit id
- parameters keyed by parameter id within each unit
- dump status and completion metadata
- symbols source metadata

## Operational Flow
1. handleIncomingBytes receives raw bytes from USB or BLE.
2. extractSysexFrames yields one or more SysEx frames.
3. parseIncomingThrFrame decodes header and payload structure.
4. consumeIncomingSeriesFrame emits dump progress/completion if applicable.
5. decodeIncomingSemanticEvents emits semantic events for standard opcode families.
6. each event is appended to history/event buffers.
7. reducer applies event to shadow state.
8. diagnostics and control-sync views refresh from shadow state.

## Failure Handling and Resilience
- Parser errors are counted and logged without stopping runtime.
- Unknown opcodes are exposed as unknown_opcode events.
- Unresolved symbols degrade gracefully to numeric keys.
- Partial/incomplete dump series are cleaned by timeout.

## Logging and Diagnostics
- Debug toggles control raw/parsed/decoded/event verbosity.
- Diagnostics panel is shadow-state driven and read-only.
- Last error and symbol source are surfaced for triage.

## Extension Points
- Add new opcode handlers by extending semantic decode mapping.
- Extend typed value interpretation by adding decodeTypedValue branches.
- Add new control sync mappings by expanding shadow-state-to-UI mapper.
- Add replay fixtures and assertions for deterministic parser regression checks.
