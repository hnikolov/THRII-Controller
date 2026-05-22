# THR-II SysEx Implementation Specification

This spec converts the protocol notes into an implementation plan with concrete APIs, data models, validation rules, and phased milestones.

Primary target:
- Reliable command send for amp/effect/parameter control.
- Reliable full parsing for incoming THR-II SysEx traffic, including multi-frame payload series.

Scope for current repo:
- Start in [thrii_ctrl.html](thrii_ctrl.html) as namespaced sections.
- Keep architecture modular so it can be extracted into separate files later.

Related references:
- [doc/thrii_sysex_protocol_engineering_notes.md](doc/thrii_sysex_protocol_engineering_notes.md)
- [doc/thrii_sysex_bit_bucketing.md](doc/thrii_sysex_bit_bucketing.md)
- [doc/thr10ii_w_symbol_table_1_44_0_a.txt](doc/thr10ii_w_symbol_table_1_44_0_a.txt)

## 1) Non-functional requirements

- Deterministic parsing: malformed frames must not corrupt parser state.
- Traceability: every outgoing command should be loggable as raw and semantic form.
- Firmware resilience: no hard dependency on fixed symbol IDs.
- Backward safety: preserve existing known-good legacy amp command path as fallback.
- Transport neutrality: parsing/encoding code should be independent of USB/BLE transport.

## 2) Proposed architecture

Use five logical layers.

1. Transport adapter
- Responsibilities:
  - send raw SysEx bytes
  - emit incoming raw SysEx frames
- Existing functions reused:
  - sendMidi
  - sendBle
  - onUsbMidiMessage

2. Frame codec
- Responsibilities:
  - validate F0/F7 framing
  - parse THR header fields
  - handle bit-bucket decode/encode
  - extract valid payload by last-valid-index

3. Message decoder
- Responsibilities:
  - parse de-bucketed payload words
  - dispatch by opcode
  - emit typed semantic events

4. Command builder
- Responsibilities:
  - build standardized command/header/body messages
  - handle command-family-specific bucket placement rules
  - provide high-level operations (set parameter, ask parameter, select amp, request dumps)

5. State/symbol manager
- Responsibilities:
  - runtime symbol table dictionary (key<->name)
  - command correlation (pending request/ack)
  - active state cache for UI updates

## 3) Core data contracts

### 3.1 Frame model

```ts
interface ThrFrame {
  raw: Uint8Array;              // full frame including F0/F7
  header: ThrHeader;
  encodedPayload: Uint8Array;   // 7-bit payload section from frame
  decodedPayload: Uint8Array;   // de-bucketed payload up to valid length
}

interface ThrHeader {
  manufacturer: [number, number, number]; // 00 01 0C
  familyModel: [number, number];           // typically 24 02
  marker: number;                          // usually 4D
  group: 0 | 1;                            // A/B group
  counter: number;                         // frame counter
  l2: number;                              // last-valid index high nibble
  l1: number;                              // last-valid index low nibble
  pc: number;                              // payload series/frame index semantic slot
  lastValidIndex: number;                  // l2 * 16 + l1
}
```

### 3.2 Payload word model

```ts
interface ThrWordPayload {
  opcode: number;              // LE u32
  length: number;              // LE u32
  words: Uint32Array;          // remaining LE words from decoded payload
}
```

### 3.3 Semantic event model

```ts
type ThrEvent =
  | AckEvent
  | ParamChangedEvent
  | UnitTypeChangedEvent
  | AnswerEvent
  | DumpChunkEvent
  | DumpCompleteEvent
  | ReadyEvent
  | UnknownEvent;

interface AckEvent {
  kind: 'ack';
  ok: boolean;
  code: number;                // 0 or 0xFFFFFFFF typically
  group: 0 | 1;
  counter: number;
}

interface ParamChangedEvent {
  kind: 'param_changed';
  uKey: number;
  pKey: number;
  typeCode?: number;
  rawValue: number;
  decodedValue: number | string | boolean;
  unitName?: string;
  paramName?: string;
}
```

### 3.4 Symbol dictionary model

```ts
interface SymbolDictionary {
  byKey: Map<number, string>;
  byName: Map<string, number>;
  firmwareTag?: string;
}
```

## 4) Required low-level APIs

### 4.1 Endian helpers

```ts
function readU32LE(buf: Uint8Array, offset: number): number;
function writeU32LE(value: number): Uint8Array; // length 4
function readF32LE(buf: Uint8Array, offset: number): number;
function writeF32LE(value: number): Uint8Array; // length 4
```

Rules:
- Throw on out-of-bounds access.
- No implicit sign extension.

### 4.2 Bit-bucketing helpers

```ts
function decodeBitBucket(payload7bit: Uint8Array, validDecodedBytes: number): Uint8Array;
function encodeBitBucket(raw8bit: Uint8Array): Uint8Array;
```

Rules:
- Decode truncates to validDecodedBytes.
- Encode emits complete bucket groups as needed.
- Keep generic algorithm separate from command-specific placement rules.

### 4.3 THR frame helpers

```ts
function parseThrFrame(rawSysex: Uint8Array): ThrFrame;
function extractValidDecodedPayload(frame: ThrFrame): Uint8Array;
```

Validation:
- Must start with 0xF0 and end with 0xF7.
- Must include expected manufacturer bytes 00 01 0C.
- Reject invalid last-valid index ranges.

## 5) Required decoder APIs

```ts
function parsePayloadWords(decodedPayload: Uint8Array): ThrWordPayload;
function decodeThrEvent(frame: ThrFrame, symbols?: SymbolDictionary): ThrEvent[];
```

Opcode handling minimum:
- 0x01 answer
- 0x02 user setting dump report
- 0x03 unit-type change report
- 0x04 parameter change report
- 0x06 ready/status
- default unknown passthrough event

Decoder behavior:
- Never throw for unknown opcode.
- Emit UnknownEvent with raw payload slice for offline analysis.

## 6) Required command-builder APIs

### 6.1 Generic builders

```ts
function buildHeaderFrame(args: {
  group: 0 | 1;
  counter: number;
  opcode: number;
  followingBytes: number;
}): Uint8Array;

function buildBodyFrame(args: {
  group: 0 | 1;
  counter: number;
  bodyRawPayload: Uint8Array;
}): Uint8Array;
```

### 6.2 High-level builders

```ts
function buildActivationSequence(firmwareMagicKey: number): Uint8Array[];
function buildSetParameter(uKey: number, pKey: number, typeCode: number, valueRawU32: number): Uint8Array[];
function buildAskGlobalParameter(uKeyGlobal: number, pKey: number): Uint8Array[];
function buildSelectAmp(ampSymbolKey: number): Uint8Array[];
function buildSelectCabinet(cabIndexOrSymbolKey: number): Uint8Array[];
function buildSetModuleEnabled(target: 'compressor' | 'gate' | 'effect' | 'echo' | 'reverb', enabled: boolean): Uint8Array[];
function buildSelectEffect(effectSymbolKey: number): Uint8Array[];
function buildSelectEcho(echoSymbolKey: number): Uint8Array[];
function buildSelectReverb(reverbSymbolKey: number): Uint8Array[];
function buildSetModuleParameter(uKey: number, pKey: number, value01: number): Uint8Array[];
function buildRequestSymbolTable(): Uint8Array[];
function buildRequestPatchDump(settingIndex: number): Uint8Array[]; // -1 maps to FFFFFFFF
```

### 6.3 Amp-select command-specific rule API

```ts
function applyAmpSelectBucketRule(args: {
  templateBody: Uint8Array;
  ampSymbolKey: number;
}): Uint8Array;
```

Required behavior:
- Uses template with bucket byte initialized to 0x00.
- Writes low 7-bit value in value byte slot.
- Writes bucket 0x04 when MSB of amp symbol key byte is set, else 0x00.
- Preserve legacy hard-coded command path for reference/testing.

## 6.4 Explicit send-command catalog

The implementation MUST support the following outbound command groups.

1. Amp select
- Builder: buildSelectAmp(ampSymbolKey)
- Unit/value model: Amp unit + enum symbol key.

2. Cabinet select
- Builder: buildSelectCabinet(cabIndexOrSymbolKey)
- Command family: set parameter (opcode 0A)
- Default implementation path:
  - UKey GuitarProc
  - PKey SpkSimType
  - Type 04 float
  - Value float 0.0..16.0 (or symbol-mapped equivalent)

3. ON/OFF toggles
- Builder: buildSetModuleEnabled(target, enabled)
- Command family: set parameter (opcode 0A)
- Targets and parameter mapping:
  - compressor -> FX1Enable
  - gate -> GateEnable
  - effect -> FX2Enable
  - echo -> FX3Enable
  - reverb -> FX4Enable
- Value encoding: float 0.0 or 1.0.

4. Effect type select (FX2)
- Builder: buildSelectEffect(effectSymbolKey)
- Required symbols:
  - StereoSquareChorus
  - L6Flanger
  - Phaser
  - BiasTremolo

5. Echo type select (FX3)
- Builder: buildSelectEcho(echoSymbolKey)
- Required symbols:
  - TapeEcho
  - L6DigitalDelay

6. Reverb type select (FX4)
- Builder: buildSelectReverb(reverbSymbolKey)
- Required symbols:
  - StandardSpring
  - LargePlate1
  - SmallRoom1
  - ReallyLargeHall

7. Parameter writes for module controls
- Builder: buildSetModuleParameter(uKey, pKey, value01)
- Command family: set parameter (opcode 0A)
- Mandatory module coverage:
  - Amp
  - Compressor
  - Effect
  - Echo
  - Reverb
  - Gate and relevant global controls
- Value normalization: clamp [0,1], convert to float32 LE raw.

Command-resolution requirement:
- Keys and enum symbols SHOULD be resolved from runtime symbol dictionary.
- If dictionary not yet available, builder may use fallback profile with explicit warning logs.

## 7) State machine for multi-frame payload series

Series key:
- group + opcode + counter lineage + direction

```ts
interface SeriesAccumulator {
  key: string;
  expectedPayloadBytes: number;
  chunks: Uint8Array[];
  receivedBytes: number;
  startedAtMs: number;
}
```

Rules:
- Start accumulator when first frame with opcode/length for a series is seen.
- Append only valid payload bytes from each frame.
- Complete when receivedBytes >= expectedPayloadBytes.
- Timeout stale accumulators (for example 2000 ms) and emit warning.

Outputs:
- dump_chunk events while receiving.
- dump_complete event with assembled payload.

## 8) Symbol table acquisition spec

Startup sequence after activation:
1. Request symbol table.
2. Assemble complete payload series.
3. Parse header words:
- symbolCount
- tableLength
4. Parse metadata blocks and name strings.
5. Build SymbolDictionary.

Minimum parser API:

```ts
function parseSymbolTablePayload(payload: Uint8Array): SymbolDictionary;
```

Validation:
- symbolCount > 0
- tableLength equals assembled payload length when expected
- all parsed names are non-empty UTF-8 or safely replaced

## 9) Value conversion spec

Provide canonical conversion helpers:

```ts
function decodeTypedValue(typeCode: number, rawU32: number): number | boolean;
function encodeFloat01ToRaw(value01: number): number;
function decodeFloat01(rawU32: number): number;
```

Rules:
- Clamp user-facing normalized controls to 0..1 before encoding.
- Keep raw + decoded value both available for debugging.

## 10) Logging and diagnostics spec

Every send/receive path should optionally emit:
- Raw SysEx hex.
- Parsed header summary.
- De-bucketed payload words.
- Semantic event summary.

Suggested toggle:

```ts
const PROTOCOL_DEBUG = {
  raw: true,
  parsed: true,
  semantic: true,
};
```

## 11) Test plan (manual + automated-ready)

### 11.1 Golden vectors

Maintain fixture pairs:
- raw frame hex -> expected decoded payload words
- command input -> expected outbound frame hex

Must include:
- Amp select 0x99 -> bucket 0x04, value 0x19
- Amp select 0x78 -> bucket 0x00, value 0x78
- Ack/Not-ack decoding

### 11.2 Roundtrip checks

- encodeBitBucket(decodeBitBucket(x)) stability for valid payload windows.
- parse->rebuild smoke tests for known command templates.

### 11.3 Regression checks in app

- Legacy 4 amp buttons remain functional and byte-identical to known-good frames.
- New generated amp commands match expected key bytes.
- Incoming parameter change updates UI state consistently.

## 12) Integration plan for this repository

Phase A:
- Introduce namespaced protocol section in [thrii_ctrl.html](thrii_ctrl.html).
- Add low-level codec + helper APIs.

Phase B:
- Replace ad-hoc generated amp logic with command-builder API while preserving legacy reference path.
- Add debug compare mode (legacy vs generated) for selected actions.

Phase C:
- Add incoming frame parser and semantic event routing.
- Start updating UI from parsed events instead of only local optimistic state.

Phase D:
- Implement symbol table download and dynamic key resolution.
- Migrate hard-coded unit/parameter keys to symbol lookup.

Phase E:
- Implement patch dump assemble/parse and (later) upload path.

## 13) Acceptance criteria

- Activation sequence succeeds and ack is recognized.
- Amp select works through both:
  - legacy hard-coded path
  - generated command path
- Cabinet select works via generated command path.
- ON/OFF commands work for compressor/gate/effect/echo/reverb.
- Type select commands work for effect/echo/reverb families.
- Generic module parameter writes succeed for at least one parameter in each required module.
- Generated amp-select commands pass byte-level checks for MSB/non-MSB values.
- Parser decodes at least opcodes 01/03/04/06 into semantic events.
- Symbol table can be requested, parsed, and used for at least one dynamic lookup.
- No uncaught parser exceptions on unknown opcodes or malformed frames.

## 14) Open issues and research backlog

- Clarify uncertain opcode semantics marked tentative in protocol source.
- Validate frame counter behavior under BLE transport timing variation.
- Confirm edge behavior for partial bitbucket groups across all command families.
- Document firmware-specific differences in symbol table and magic key handling.

## 15) Suggested implementation order (immediate)

1. Implement low-level endian + bitbucket helpers with golden tests.
2. Implement parseThrFrame and payload word decoder.
3. Implement ack + parameter-change event decoding.
4. Refactor amp command generation onto buildSelectAmp with current verified bucket rule.
5. Add symbol table request and parser.
6. Add patch dump series assembler.
