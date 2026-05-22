# THR-II SysEx bit-bucketing notes

## What "bit-bucketing" means here

In MIDI SysEx, normal data bytes must stay in the 7-bit range `0x00..0x7F` (the top bit must be `0`).
When THR-II needs to carry arbitrary 8-bit payload data, it uses a 7-bit-safe packing method often called **bit-bucketing** (or 7-bit packing).

The common pattern is:

1. Take up to 7 original 8-bit bytes.
2. Strip each byte's MSB (`bit7`) and keep only low 7 bits.
3. Store the removed MSBs into one extra "bucket" byte, one bit per source byte.
4. Transmit `bucket + 7 low bytes` as SysEx-safe bytes.

So, every 7 raw bytes become 8 transmitted bytes.

## Why this exists

- SysEx transport is 7-bit for data bytes.
- Internal THR values/blocks can still be 8-bit.
- Bit-bucketing preserves exact bytes while remaining MIDI-safe.

## Decode algorithm (7-bit packed -> raw 8-bit)

For each packed block:

- `bucket = packed[0]`
- For `i = 0..6` (or until block ends):
  - `low = packed[i + 1] & 0x7F`
  - `msb = (bucket >> (6 - i)) & 0x01`
  - `raw = low | (msb << 7)`

## Encode algorithm (raw 8-bit -> 7-bit packed)

For each group of up to 7 raw bytes:

- Start `bucket = 0`
- For each raw byte at index `i`:
  - If `(raw[i] & 0x80) != 0`, set `bucket |= (1 << (6 - i))`
  - Emit `raw[i] & 0x7F` as the low byte
- Emit `bucket` first, then emitted low bytes

## JavaScript reference implementation

```js
export function decodeBitBucketed(packed) {
  const out = [];
  for (let p = 0; p < packed.length;) {
    const bucket = packed[p++] & 0x7f;
    for (let i = 0; i < 7 && p < packed.length; i += 1) {
      const low = packed[p++] & 0x7f;
      const msb = (bucket >> (6 - i)) & 0x01;
      out.push(low | (msb << 7));
    }
  }
  return Uint8Array.from(out);
}

export function encodeBitBucketed(raw) {
  const out = [];
  for (let p = 0; p < raw.length; p += 7) {
    let bucket = 0;
    const lows = [];
    for (let i = 0; i < 7 && (p + i) < raw.length; i += 1) {
      const b = raw[p + i] & 0xff;
      if (b & 0x80) bucket |= (1 << (6 - i));
      lows.push(b & 0x7f);
    }
    out.push(bucket, ...lows);
  }
  return Uint8Array.from(out);
}
```

## Tiny worked example

Raw bytes:

- `[0x80, 0x01, 0xFF, 0x7F, 0x00, 0x55, 0xAA]`

MSBs are `[1, 0, 1, 0, 0, 0, 1]` so bucket byte is:

- `0b1010001 = 0x51`

Low 7-bit bytes are:

- `[0x00, 0x01, 0x7F, 0x7F, 0x00, 0x55, 0x2A]`

Packed block:

- `[0x51, 0x00, 0x01, 0x7F, 0x7F, 0x00, 0x55, 0x2A]`

## THR-II specific caution

- The transport-level SysEx framing (`F0 ... F7`) and Yamaha message headers are separate from bit-bucketing.
- Not every THR-II SysEx payload segment is bucketed; some command payloads are already 7-bit values.
- If a decode looks wrong, verify you started at the correct payload offset (after command/address fields).

## Amp-select command verified mapping

For the amp-select command family used in this project (`... 00 04 00 00 07 XX 0c 01 00 00 YY ...`):

- `XX` is the bucket byte.
- `YY` is the low 7-bit amp symbol byte.
- If amp symbol is `>= 0x80`, `XX` must be `0x04` (bit position 2 set).
- If amp symbol is `< 0x80`, `XX` is `0x00`.

Examples:

- `0x99` -> `04 0c 01 00 00 19 00 00`
- `0x78` -> `00 0c 01 00 00 78 00 00`

This mapping is command-specific and should be treated as verified behavior for amp model selection in THR-II.

## Confidence level

- High confidence on the packing method itself (standard MIDI-safe 7-bit packing behavior used in many devices).
- Medium confidence on exact placement within every THR-II message type unless validated against a full captured message corpus for each command family.
