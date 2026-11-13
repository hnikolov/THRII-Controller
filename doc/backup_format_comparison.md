# Backup files: this app's format and THR Remote's `.thrl6a`

Analysis from 2026-11-13. No code was changed for it.

Files looked at:

- `doc/THR-Backup-orig.thrl6a`: a backup written by Yamaha's THR Remote app.
- `doc/THR backup 2026-11-13.json`: a backup written by this app (Backup THR in the PRESETS menu).

Both were taken from the same amp (THR10II Wireless, firmware 1.44.0.a), at different times.

## Conclusion

Keep this app's format for Backup and Restore. It restores the amp's own bytes through a path that is tested on hardware. Treat `.thrl6a` as an optional exchange format with THR Remote, added as separate menu items if wanted, not as a replacement.

## THR Remote's `.thrl6a`

A JSON wrapper around a compressed payload:

```json
{
 "compression": { "crc32": 2021298989, "decompressed_size": 6787, "type": "zlib" },
 "encoded_data": "<Base64 text>",
 "encoding": "Base64",
 "meta": {
  "application": "", "appversion": 0,
  "device": 2359297, "device_version": 21233761,
  "modifieddate": 1777806048, "name": "Spider IV Setlist"
 },
 "schema": "L6Setlist",
 "version": 2
}
```

- `encoded_data` is Base64 of a zlib stream. Decompressed it is 6787 bytes of JSON; its CRC-32 equals `compression.crc32`. Both were checked.
- `device` 2359297 is `0x240001` (family `0x24`, model `0x01`). `device_version` 21233761 is `0x01440061`, firmware 1.44.0.a. These match the amp's identity reply.
- `modifieddate` is a Unix time in seconds.

The decompressed payload:

```json
{
 "meta": { "name": "Spider IV Setlist" },
 "presets": [
  {
   "device": 2359297,
   "device_version": 21233761,
   "meta": { "name": "Clean Megadeth", "tnid": 0 },
   "tone": {
    "THRGroupAmp": { "@asset": "THR10C_Deluxe", "Bass": 0.380392, "Drive": 0.506754, "Master": 1.0, "Mid": 0.662745, "Treble": 0.568627 },
    "THRGroupCab": { "@asset": "speakerSimulator", "SpkSimType": 15 },
    "THRGroupFX1Compressor": { "@asset": "RedComp", "@enabled": false, "Level": 0.80037, "Sustain": 0.0851852 },
    "THRGroupFX2Effect": { "@asset": "StereoSquareChorus", "@enabled": true, "@wetDry": 0.44549, "Depth": 0.23116, "Feedback": 0.128702, "Freq": 0.116918, "Pre": 0.5 },
    "THRGroupFX3EffectEcho": { "@asset": "TapeEcho", "@enabled": false, "@wetDry": 0.5, "Bass": 0.5, "Feedback": 0.63, "Time": 0.391, "Treble": 0.0 },
    "THRGroupFX4EffectReverb": { "@asset": "ReallyLargeHall", "@enabled": true, "@wetDry": 0.45098, "Decay": 0.180392, "PreDelay": 0.1, "Tone": 0.615114 },
    "THRGroupGate": { "@asset": "noiseGate", "@enabled": false, "Decay": 0.6, "Thresh": -38.0 },
    "global": { "THRPresetParamTempo": 110 }
   }
  }
 ]
}
```

- `presets` has five entries, one per user memory, in memory order.
- Each entry has exactly the shape of the `data` object of a `.thrl6p` preset file (`device`, `device_version`, `meta`, `tone`). `parseThrl6Preset` in `src/domain/presetModel.js` reads that shape when it is wrapped as `{ schema: 'L6Preset', data: <entry> }`.
- The parameters per group are the ones a compact memory patch holds (see `save_to_memory_notes.md`): knob values, on/off states, mixes, the cabinet, and the tempo.
- Values have six significant digits.

## This app's backup

```json
{
 "format": "thrii-backup",
 "version": 1,
 "date": "2026-11-13",
 "firmware": "1.44.0.a",
 "identity": { "family": 36, "model": 1 },
 "slots": [
  { "slot": 1, "name": "Clean Megadeth", "patch": "<Base64 of the memory's raw patch>" }
 ]
}
```

- `slots` has five entries. `patch` is the memory dump as the amp sent it, without its 16-byte header (613 or 1109 bytes, depending on the layout the memory has).
- `name` is read from the patch for the reader's convenience; Restore uses only `patch`.
- Code: `readBackup` and `parseBackup` in `src/app/presetFlow.js`.

## Comparison

| | This app's backup | THR Remote `.thrl6a` |
|---|---|---|
| Content | the amp's exact bytes per memory | names and values per memory |
| Precision | exact | six significant digits (not audible) |
| Restore in this app | upload the bytes, recall the memory, compare; tested on hardware | not possible directly: the app cannot build a memory patch from values |
| Readable or editable by hand | no | yes, after decompressing |
| Opens in THR Remote | no | yes |
| Firmware | Restore refuses a file from another firmware or amp | values are firmware-independent as long as the names exist |
| File size (this amp) | about 5 kB | about 2 kB |

## Ways to support `.thrl6a`, if wanted

All of these would be additions; none replaces the current Backup and Restore.

| Feature | How, with existing pieces | Cost and risk |
|---|---|---|
| Import one preset from a `.thrl6a` | Decompress (the browser's `DecompressionStream('deflate')` reads zlib), let the user pick one of the five, wrap it as a preset, run the existing Import. | Small. Uses only the tested import path. Works without the amp. |
| Restore all five from a `.thrl6a` | For each memory: Import (live writes, 5 to 8 s), then Save to that memory (upload, recall, compare). | About a minute; the amp plays each sound in turn. Only tested paths, no new patch bytes. |
| Faster restore | Build each memory patch from the values and upload it. | New byte-building code. Every change of this kind so far needed hardware iterations. Not recommended. |
| Write a `.thrl6a` | Parse each memory dump (`parseDumpPatch`), turn it into a preset (`storeToPreset` on a temporary store), compress with `CompressionStream('deflate')`, add the CRC-32 and the size. | Moderate. Needs a CRC-32 routine. Whether THR Remote accepts the result is untested. |

## Side finding: device fields in exported presets

The `.thrl6a` records `device` `0x240001` and `device_version` 1.44.0.a, the values of the connected amp. This app's exported `.thrl6p` files carry fixed values copied from the sample preset `doc/01. EarlyVH.thrl6p`: `device` 2359298 (`0x240002`) and `device_version` 20971617 (`0x01400061`, 1.40.0.a); see `FORMAT` in `src/domain/presetModel.js`. Whether THR Remote checks these fields on import is unknown. If exports are meant to open in THR Remote, writing the connected amp's values (from the identity reply) would be the safer choice.

## Other observations

- The setlist name `Spider IV Setlist` in the THR Remote file is a default from the Line 6 software family, not something entered by the user.
- Memory 5 differs between the two sample files (`HG Practice` in the THR Remote file, `Master of Puppets Rhythm` in this app's file). They were taken at different times; this is not a format difference.
