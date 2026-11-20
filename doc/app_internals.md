# THR-II Controller: app internals

How the app is built and the rules that keep it maintainable. It describes the code as it is; where a rule is stated, it is binding for changes. Related guides: [testing.md](testing.md), [release.md](release.md), [cloudflare_proxy_worker.md](cloudflare_proxy_worker.md), and the SysEx protocol notes listed in [Protocol notes](#protocol-notes).

## What the app does

An editor and controller for Yamaha THR-II amplifiers that runs in the browser (Chrome on Android and desktop) and installs as an app (PWA). It talks SysEx to the amp over USB (Web MIDI) or Bluetooth LE (Web Bluetooth MIDI):

- connect, activate the amp's session, and mirror its settings (knobs, amp model, cabinet, effects, the active memory);
- edit live, from the screen or from the amp's own knobs and memory buttons;
- import and export presets (`.thrl6p`, THR Remote's format), keep a list of presets, save to the amp's five memories, back up and restore them;
- Import AI: get a preset from the generator of amplifier-presets.com and load it;
- work offline (everything except Import AI), keep the screen on, and update itself when a new version is published.

Plain ES modules, no dependencies, no build step, no Node.js. Tools are Python (standard library).

## Rules

1. **One-way layers.** `transports` (bytes) -> `protocol` (frames, events, dumps) -> `state` (the store) -> `ui`. Composition lives in `src/app`. The protocol layer imports nothing from `state`; `state` may import protocol constants and the symbol table; `src/ui/runtime` imports nothing from `protocol`, `transports` or `debug`.
2. **The shadow store is the single source of truth.** Every change goes through `store.commit(mutate, source)`; listeners run once per microtask batch. The UI never keeps an authoritative device value; a view renders from the store and reports user intent. Parameter writes and type selects are built from store values; patch uploads (save to memory, quick import, restore) are built on the amp's own dump bytes, which the store cannot reproduce, and are always checked by reading the amp back.
3. **Sources say where a change came from:** `'ui'` (an edit), `'device'` (an event from the amp), `'dump'` (a settings read, replaces the units), `'import'` (a preset written into the store). Only `'ui'` changes lead to outbound writes, so device updates never echo back to the amp.
4. **`activeSlot` belongs to the device.** A memory press is a trigger, not data: the app selects the memory, then reads the Actual settings; `activeSlot` is committed only from the amp's notification or when that read completes.
5. **Outbound writes are coalesced**, last write wins, per `unitId:paramId`, in `protocol/writeScheduler.js` (40 ms quiet, 120 ms at most). The value is read from the store at flush time. `flushAll()` runs before any command that is not a parameter write (slot select, unit type, activation, dumps, uploads).
6. **Timing on the wire is part of the protocol** (table below). A refactor must not change wire bytes, frame order or pauses. New protocol behavior goes behind a flag in `src/core/flags.js` that stays off until checked on the amp.
7. **Debug is a read-only observer.** `src/debug` and `src/ui/debug` only listen to the bus (`raw:in`, `raw:out`, `note`); only `dev.html` imports them; they are never published.
8. **Screens beside the knobs are self-contained.** The Presets screen (`src/ui/presets`) and Import AI (`src/ai`) import nothing from the rest of the app; `boot` hands them every operation they may use. Nothing outside `src/ai` imports it except the shells, which load it only when its proxy answers.
9. **The release is clean and stamped.** Only the release set is published (see [release.md](release.md)); `scripts/check_release.py` refuses debug code, missing files and a stale stamp.
10. **Golden fixtures and transcripts** (`test/fixtures`) change only with the owner's approval. Hardware checks are done by the owner; say what was verified offline and what still needs the amp.

Standing checks after a change (grep): rules 1, 7 and 8, and no assignment to state outside a `commit` callback.

## Topology

```
 SHELLS      index.html -> app/main.js                          dev.html -> debug/observer, ui/debug/rawTracePanel
             (sw.js offline cache + updates,                       (raw trace; listens to raw:in, raw:out, note)
              wake lock, reload guard)                                       |
                     |                                                       |
                     +---------------------------+---------------------------+
                                                 v
 COMPOSITION                        app/boot.js: creates and wires everything below;
                                    connect (BLE, else USB) -> activate -> read Actual;
                                    one long operation at a time (busy)
                                                 |
          +--------------------------------------+---------------------------------------+
          v                                      v                                       v
 UI   ui/runtime                          ui/presets (Presets screen)              ai/ (Import AI)
      mount, views, layout, viewModel     list, import, export, save,              ai/api --> Cloudflare Worker /api
          |  intents        ^ re-render   backup, restore (via boot)               --> api.amplifier-presets.com
          |                 | on commit          |                                     | .thrl6p text
          v                 |                    v                                     v
 STATE  state/shadowStore { units, activeSlot, presetName, modified }   <---- app/presetFlow (import, export,
          ^  commit('ui')      ^ commit('device'), commit('dump')           save, backup, restore; commit('import'))
          |                    |                                                   |
          |              applyDeviceEvent, applyDumpPatch    (symbolTable: id <-> name, used by boot, parser, state)
          |                    ^                                                   |
 PROTOCOL |   OUT              |  IN                                               |
      writeScheduler           incoming (group 0 events)                           |
      (40 / 120 ms) ---+       syncFlow (dump requests, one at a time)             |
                       |         -> dumpAssembly -> dumpParser                     |
                       v                    ^                                      |
      builders (+ identity, constants) <----|------------- uploads, slot select ---+
                       |                    | frames.extractSysexFrames
                       v  raw:out           |  raw:in, transport:status
 TRANSPORT   transportManager (event bus; BLE frames 50 ms apart)
               usbTransport (Web MIDI)  |  bleTransport (Web Bluetooth MIDI packets)
                                        v  ^
 DEVICE                           THR-II amplifier
```

## Main flows

| Flow | Path |
|---|---|
| Connect | CONNECT -> `boot.connect()`: BLE first, USB if BLE is cancelled or unavailable. With `autoActivate`: `identity.runActivation` sends the identity request, takes family and model from the reply, sends frames 2 to 4 with them (500 ms apart); then `syncFlow.requestDump()` reads the Actual settings, which replace the units (`'dump'`). The firmware version shows on the CONNECT button. No identity reply (2 s) ends the session: the port is closed and the button is back to CONNECT (the USB fallback opens the first MIDI port, which may not be the amp). |
| Edit a knob | view -> intent -> `commit('ui')` -> `writeScheduler` -> `builders.buildParamWriteFrames` -> transport. |
| Change amp model or effect type | intent -> `boot.sendUnitType`: 256 ms pause, type select frames, 512 ms pause, the type's default values 50 ms apart, then the module's enable (the amp hard-stopped on faster switching). |
| Amp knob or event | `raw:in` -> `extractSysexFrames` -> `decodeIncomingEvent` -> `applyDeviceEvent` (`'device'`). Ids the amp reports differently from the dump are matched by name (`symbolTable.makeLiveIdOf`, `findLiveParam`). |
| Memory press on the amp | settings notification -> `activeSlot` (`'device'`) and, with `slotSync`, `syncFlow` reads the Actual settings. |
| Memory press in the app | `buildSelectPreset` -> Actual read -> units replaced, then `activeSlot` set. |
| Import a preset | `presetModel.parseThrl6Preset` -> `presetToPlan` (names to ids via the symbol table) -> `applyPresetPlan` (`'import'`). With an amp and `quickImport`: one patch built on the amp's Actual dump (`memoryPatch.buildPresetPatch`; always read right before the upload: one built on an earlier read failed over BLE) is uploaded to the Actual settings; otherwise, or if that patch cannot be built or the amp then differs, value by value (`boot.sendPlan`). A read or send that fails ends the import (no value-by-value fallback onto an amp that is not answering). Then the amp is read back and compared (`comparePlan`). The result `{ ok, message, refused }` tells a text that cannot be loaded (`refused`) from a failure of the amp: the Presets list and the AI screen keep a preset the amp failed to take, so a tap tries again. |
| Export | `storeToPreset` -> `presetToText` -> file. Works without an amp. |
| Save to memory | the amp's own Actual dump, renamed, uploaded to the memory (`buildSlotUploadFrames`, 18 ms per frame), recalled after 300 ms, compared. The old content is read first and offered back if the check fails. |
| Backup / Restore | read the five memories into one JSON file; restore uploads them (a backup of the current memories is written first). Format notes: [backup_format_comparison.md](backup_format_comparison.md). |
| Import AI | the shell checks `<API_BASE>/health` at start; the AI screen asks the generator and hands the `.thrl6p` text to the same import. |
| Offline and updates | `sw.js` caches the release set and serves the app page from it; a new release waits until the update button is pressed or the app is closed. Details: [release.md](release.md). |

## State

```
{
  units: { [unitId]: { id, name, typeKey, typeName,
                       parameters: { [paramId]: { id, name, typeCode, decodedKind, rawU32, value, updatedAtMs } } } },
  activeSlot: 1..5 | null,     // device-owned
  presetName: string | null,   // from the last dump, or edited in the top strip
  modified: boolean            // set by any parameter change, cleared by a dump
}
```

Values are normalized (0..1 for knobs, booleans for switches); `rawU32` keeps the amp's raw word. Module enables and mixes live on the `GuitarProc` unit. Parameters are keyed by the id the amp reports and accepts writes for.

Browser storage (per site, `localStorage`): the Presets list (`thrii.presets`) and the AI screen's sounds and fields (`thrii.aiPresets.v2`). Nothing else is stored; the amp is the source of its own settings.

## Timing and limits found on the hardware

| Constant | Value | Where | Why |
|---|---|---|---|
| Write coalescing | 40 ms quiet, 120 ms max | `protocol/writeScheduler.js` | a burst of writes over BLE overflowed the amp |
| BLE frame gap | 50 ms | `transports/transportManager.js` | back-to-back BLE writes overflowed the amp's input |
| BLE packet size | as reported by the browser, else 20 bytes | `transports/bleTransport.js` | 20 is the default ATT payload; whether the amp takes larger packets is unverified (`BLE_USE_REPORTED_PACKET_SIZE`) |
| BLE packet gap | 20 ms between the packets of one frame | `transports/bleTransport.js` | imports (uploads: about 15 packets per frame) failed over BLE and left the amp unresponsive; unverified that the gap cures it |
| Activation spacing | 500 ms | `protocol/identity.js` | between activation frames |
| Type change pauses | 256 ms before, 512 ms after, defaults 50 ms apart | `app/boot.js` | the amp hard-stopped on rapid switches |
| Upload pace | 18 ms per frame | `protocol/builders.js` | pacing the amp accepts for patch uploads |
| Upload settle | 300 ms | `app/presetFlow.js` | before a written memory is recalled |
| Dump timeout | 4 s from the request or the last dump frame; one more request, then the read fails | `protocol/syncFlow.js` | a stuck read is given up; over BLE a dump takes seconds, and a second request sent while one was still arriving left the amp unresponsive |
| Command counter | 3..0x7e, then 3 | `protocol/builders.js` | header 0x7f followed by body 0x00 silenced the amp |

## Files

### Shells, shell configuration and tools

| File | Purpose |
|---|---|
| `index.html` | The installed app: loads `app/main.js`, and the AI plug-in when its proxy answers. |
| `dev.html` | Development page: the same app in a 390 px frame plus the raw trace and connect buttons; `?source=mock` runs without an amp, `?flag=<name>` turns a flag on. Never published. |
| `sw.js` | Service worker: offline cache of the release set, update handling. Its file list is written by the release script. |
| `manifest.json`, `icons/` | App name, colors, portrait standalone display, icons (placeholders). |
| `.github/workflows/pages.yml` | On push to `main`: release check, unit tests, publish to GitHub Pages. |
| `.github/instructions/*.md` | Detailed working rules per area (architecture, state, protocol, debug, mobile UI, release). |
| `scripts/check_release.py` | Release check; `--stamp` writes the file list and build hash; `--out` collects the files to publish. |
| `scripts/run_tests.py` | Runs the unit tests in headless Chrome. |
| `scripts/serve.py` | Local server with an `/api` proxy (alternative to the Worker for local use). |
| `cloudflare/proxy-worker.js` | The hosted `/api` proxy for Import AI (deployed by hand, see [cloudflare_proxy_worker.md](cloudflare_proxy_worker.md)). |

### `src/app`: composition and app shell

| File | Purpose |
|---|---|
| `boot.js` | Composition root shared by both pages: transports, store, symbol table, sync flow, scheduler, intents, Presets screen; connect, activate, unit type changes, the busy lock. |
| `main.js` | App-shell additions for `index.html`: service worker and update offer, wake lock, reload guard. |
| `presetFlow.js` | Preset operations: import (quick or value by value, with read-back), export, save to memory, backup, restore. |
| `files.js` | Browser file dialogs: pick, choose a save place, download. |
| `version.js` | `APP_VERSION` (by hand) and `BUILD` (stamp). |
| `wakeLock.js` | Keeps the screen on while the app is visible. |

### `src/core`: small shared pieces

| File | Purpose |
|---|---|
| `bytes.js` | Hex conversion, little-endian writes, `sleep`. |
| `eventBus.js` | Minimal publish/subscribe used by the transports and observers. |
| `clock.js` | Real timers in the shape tests replace with a fake clock. |
| `flags.js` | Protocol behavior switches (all on after their hardware checks). |

### `src/transports`: bytes in and out

| File | Purpose |
|---|---|
| `transportManager.js` | One active transport (USB or BLE), `raw:in` / `raw:out` / `transport:status` on the bus, BLE frame pacing. |
| `usbTransport.js` | Web MIDI with SysEx. |
| `bleTransport.js` | Web Bluetooth MIDI: SysEx split into and joined from BLE-MIDI packets. |

### `src/protocol`: frames, events, dumps

| File | Purpose |
|---|---|
| `constants.js` | Activation frames, opcodes, keys, type codes, dump protocol constants. |
| `builders.js` | Every outbound frame: command counter, bit-bucket encoding, parameter writes, unit type and memory select, dump requests, uploads. |
| `identity.js` | Identity reply and firmware version, the session identity used in frame headers, the activation sequence. |
| `frames.js` | SysEx frame extraction from byte streams and inbound frame decoding (bit buckets, words). |
| `incoming.js` | Group 0 frames to device events: parameter change, unit type, memory notification, replies. |
| `dumpAssembly.js` | Joins multi-frame dump payloads. |
| `dumpParser.js` | Dump payload to units and parameters; preset name read and replaced. |
| `memoryPatch.js` | Patches for memories and the Actual settings: built from a preset plan, compared by settings. |
| `syncFlow.js` | Dump reads, one at a time with a queue and timeout; reacts to memory notifications. |
| `writeScheduler.js` | Last-write-wins coalescing of parameter writes. |
| `symbolTable.js` | Symbol table loading and lookups: id to name, name to id, dump id to live id, name normalization. |

### `src/state`: the store

| File | Purpose |
|---|---|
| `shadowStore.js` | The store: state, `commit`, batched notifications. |
| `selectors.js` | Find a unit or parameter by id or name. |
| `applyDeviceEvent.js` | Device events and whole dumps into the store. |
| `applyPreset.js` | A preset plan into the store; compare the store with a plan. |

### `src/domain`, `src/data`

| File | Purpose |
|---|---|
| `domain/presetModel.js` | `.thrl6p` parsing and writing, preset to plan (names to ids), store to preset, name rules. |
| `data/thr10ii_w_symbol_table_1_44_0_a.json` | The symbol table (copy of the one in `doc/`). |

### `src/ui/runtime`: the main screen

| File | Purpose |
|---|---|
| `mount.js` | The only entry point: mounts the views, re-renders on every commit, returns the shell handle (`setConnection`, `setStatus`, `setBusy`, `setAppInfo`, ...). |
| `layout.js` | Declarative screen: which unit and parameter each control reads, amp families, effect types, cabinets. |
| `viewModel.js` | Store state to what the views show (knob values, types, LEDs). |
| `intents.js` | User actions to store commits and writes (no protocol imports; the shell supplies the senders). |
| `appView.js` | The whole tree, page switching, status toast, busy state. |
| `memoryView.js` | Top strip (tabs, preset name, CONNECT, version, update button) and memory buttons. |
| `ampView.js`, `moduleView.js` | Amp header and knobs; one effect or dynamics module. |
| `knobView.js`, `ledView.js`, `unitSelectorView.js` | Knob, LED and dropdown controls. |
| `tapTempo.js` | Tap tempo timing. |
| `runtime.css` | Styles of the runtime screen. |

### Plug-in screens and debug

| File | Purpose |
|---|---|
| `ui/presets/presetLibrary.js`, `presets.css` | Presets screen: action row, stored list, backup and restore. |
| `ai/aiPresets.js`, `aiPresets.css` | Import AI screen: request fields, versions, sounds list. |
| `ai/api.js` | Calls to the generator and the proxy health check. |
| `ai/config.js` | Proxy address, amp ids by model code, limits, credit. |
| `debug/observer.js`, `ui/debug/rawTracePanel.js` | Raw trace for `dev.html` (not published). |

### `test`

`runner.html` imports every `unit/*.test.js`; `support/` holds the harness, fake amp, fake clock and transcript reader; `fixtures/` holds captured transcripts, golden frames and states, and sample presets. See [testing.md](testing.md).

## Protocol notes

In `doc/`, for work on the protocol layer:

| File | Topic |
|---|---|
| [thrii_sysex_implementation_spec.md](thrii_sysex_implementation_spec.md) | Frame format and command catalogue |
| [thrii_sysex_protocol_engineering_notes.md](thrii_sysex_protocol_engineering_notes.md) | Protocol knowledge for implementation |
| [thrii_sysex_parser.md](thrii_sysex_parser.md) | Parser design (written for the prototype; concepts still apply) |
| [thrii_sysex_bit_bucketing.md](thrii_sysex_bit_bucketing.md), [thrii_sysex_bitbucket_ble.md](thrii_sysex_bitbucket_ble.md) | 7-bit packing; BLE packets, pacing, counter overflow |
| [activation.md](activation.md) | The activation handshake |
| [amp_sim_symbol_ids.md](amp_sim_symbol_ids.md) | Amp model ids |
| [quick_import_notes.md](quick_import_notes.md), [save_to_memory_notes.md](save_to_memory_notes.md), [import_preset_capture_notes.md](import_preset_capture_notes.md) | Upload to Actual and to memories, import captures |
| [backup_format_comparison.md](backup_format_comparison.md) | This app's backup vs THR Remote's `.thrl6a` |
| `thr10ii_w_symbol_table_1_44_0_a.json`, `.txt` | The symbol table and its original dump (firmware 1.44.0.a) |

The underlying protocol document, `SYSEX_PROTOCOL_THR30II.pdf`, is in martinzw's [THRII-direct-USB-pedalboard](https://github.com/martinzw/THRII-direct-USB-pedalboard).

## Common changes

| Change | Where |
|---|---|
| A knob, dropdown entry or module | `ui/runtime/layout.js` (device names from the symbol table); `viewModel.js` only for new mapping rules. |
| A new device event | `protocol/incoming.js` (decode) and `state/applyDeviceEvent.js` (apply), with a transcript-based test. |
| A new outbound command | `protocol/builders.js`, a golden test, and a flag that stays off until checked on the amp. |
| A new screen beside the knobs | a self-contained module like `src/ai`, passed to `boot` as a preset source and given a page in `layout.js`. |
| A test | `test/unit/<topic>.test.js`, imported in `test/runner.html`. |
| A release | stamp, test, bump `APP_VERSION`, push ([release.md](release.md)). |
