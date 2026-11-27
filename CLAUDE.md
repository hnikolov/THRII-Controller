# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser-based editor/controller for Yamaha THR-II amps, talking SysEx over Web MIDI (USB) and Web Bluetooth (BLE). Plain ES modules, no dependencies, no build step, no `package.json`. **Node.js is not installed and must not be introduced**; everything runs in the browser, and any tooling script is Python.

The app was migrated from a single-file prototype (kept under the git tag `legacy-prototype`) to the modular layout under `src/`. The plans of that migration are in `archive/` (history, not maintained); the hardware findings that matter are in the code comments. [doc/app_internals.md](doc/app_internals.md) describes the app as it is and is the normative design: rules, topology, flows, hardware timing, and every file. Read it before a non-trivial change.

## Commands

Pages must be served over HTTP (ES modules; `file://` does not work). From the repo root:

```
python -m http.server 8080
```

- Unit tests: open `http://localhost:8080/test/runner.html`. The page shows `PASS n FAIL m` in `#summary` and failure messages in `#failures`.
- There is no per-test filter. `test/runner.html` imports every `test/unit/*.test.js` explicitly; to run one file, temporarily narrow those imports. **A new test file does nothing until it is imported in `test/runner.html`.**
- Tests use the tiny in-repo harness `test/support/assert.js` (`it`, `assertEqual`, `assertDeepEqual`, `assertTrue`), `test/support/fakeClock.js` for timers, and captured device transcripts in `test/fixtures/transcripts/`.
- Headless, one command: `python scripts/run_tests.py` (local server and installed Chrome; exits 1 on a failure). The approach is in `doc/testing.md`.
- Release check: `python scripts/check_release.py` (precache list, no debug code shipped, version stamp). **After changing any shipped file (`index.html`, `manifest.json`, `icons/`, `src/` outside the debug folders), run `python scripts/check_release.py --stamp`**, or the check, and the Pages deploy, fails. Bump `APP_VERSION` in `src/app/version.js` for a release.
- There is no linter or formatter.

- Test with the THR-II amp: open `http://localhost:8080/dev.html`. How a change is published: `doc/release.md`.

### Pages

| Page | Role |
|---|---|
| `dev.html` | Development composition root: runtime UI in a 390 px portrait frame plus the raw trace panel, with real transports. `?source=mock` runs on `test/fixtures/mockState.json` with no amp; `?flag=<name>` turns on a switch from `src/core/flags.js`. It adds the debug pane and its buttons on top of the shared composition in `src/app/boot.js`. |
| `index.html` | The installed app (PWA): calls `main()` from `src/app/main.js`, which adds the service worker (`sw.js`, offline cache, update button), the screen wake lock, and the reload guard to `boot()`. The CONNECT button in the top strip connects (BLE first, USB as fallback), activates, and reads the Actual settings; it then shows the amp's firmware version, and pressed again it disconnects. Published to GitHub Pages by `.github/workflows/pages.yml`. |

## Architecture

One-way layering, each layer in its own `src/` folder:

```
transports -> protocol (frames, incoming decode, dump assembly/parse) -> state (shadow store) -> ui/runtime
ui/runtime -> intents -> store.commit(..., 'ui') -> write scheduler -> protocol builders -> transports
```

- **Shadow store is the single source of truth** (`src/state/shadowStore.js`). State shape: `{ units, activeSlot, presetName, modified }`. Every mutation goes through `store.commit(mutate, source)`; listeners are notified once per microtask batch. Sources: `'ui'` (an edit; the only source that leads to outbound writes, so device updates never echo back), `'device'` (an event from the amp), `'dump'` (a settings read; replaces the units), `'import'` (a preset written into the store). Never keep an authoritative device value in the DOM or a view.
- **Composition happens in `src/app/boot.js`, shared by the shells.** `boot(rootEl, options)` creates the transport manager, store, symbol-table lookups, sync flow, and write scheduler, then injects callbacks (`sendParam`, `onSelectSlot`, `onSelectUnit`, `onConnect`, `typeKeyOf`, ...) into `createRuntimeIntents` and mounts the runtime. Connection status and app-shell info go back to the view through the mount handle (`setConnection`, `setStatus`, `setAppInfo`), not the store. This is what lets `src/ui/runtime` stay free of protocol imports.
- **Runtime UI** (`src/ui/runtime`): `mountRuntime(rootEl, { store, intents })` is the only entry point. Views render from `selectRuntimeModel(state, layout)` and call intents; they never send frames. `layout.js` is the declarative description of the screen.
- **Pages beside the knobs**: the Presets screen (`src/ui/presets`) and the Import AI plug-in (`src/ai`, loaded by the shells only when its proxy answers `/health`). Both are self-contained: they import nothing from the rest of the app and get every operation from `boot`.
- **Inbound path**: transport emits `raw:in` on the event bus -> `extractSysexFrames` -> `decodeIncomingEvent` (group 0 frames: parameter change, unit type change, settings notification, ack/answer) -> `applyDeviceEvent(store, event, nameOf)`. Dump frames go through `syncFlow` -> `dumpAssembly` -> `dumpParser` -> `applyDumpPatch` (in `applyDeviceEvent.js`).
- **A memory-slot press is a trigger, not data.** A press on the amp: its notification sets `activeSlot` (`'device'`) and the sync flow reads the Actual settings. A press in the app: the slot select is sent, the Actual settings are read, and `activeSlot` is committed only when that read completes. `activeSlot` is device-owned: the UI requests a slot, never sets it. (The amp's "settings changed?" answer is not used: after a memory switch it reports no change.)
- **Writes come from the store, patches from the amp.** Parameter writes and type selects are built from store values. Patch uploads (save to memory, quick import, restore) are built on the amp's own dump bytes, which the store cannot reproduce, and are always checked by reading the amp back.
- **Outbound writes are last-write-wins coalesced** in `src/protocol/writeScheduler.js` (40 ms quiet / 120 ms max, keyed `unitId:paramId`). The value is read from the store at flush time, not passed from the UI. Call `flushAll()` before any non-coalesced command. Unit-type (amp/effect) changes need deliberate pauses between frames or the amp hard-stops; the timing constants found on the hardware are listed in `doc/app_internals.md`; a refactor must not change them.
- **Symbol table** (`src/protocol/symbolTable.js`, data in `src/data/thr10ii_w_symbol_table_1_44_0_a.json`, a copy of the one in `doc/`) maps numeric IDs <-> names <-> enums. It is part of the protocol/semantic layer, required for dump parsing and unit-type selection, and not a UI helper.
- **Debug is a read-only observer.** `src/debug/observer.js` and `src/ui/debug/` subscribe to bus topics (`raw:in`, `raw:out`, `note`) and must never write to the store or drive runtime controls.
- **Flags** (`src/core/flags.js`): `coalesceWrites`, `autoActivate`, `slotSync`, `quickImport` and `memorySets`, all on. A new protocol behavior gets a flag that stays off until checked on the amp. Only the dev composition root may flip them; runtime code only reads them.

### Standing gates (check with grep after changes)

- Nothing under `src/` outside the two debug folders, nor `index.html` and `sw.js`, imports from `src/debug` or `src/ui/debug` or references `dev.html`. Only `dev.html` imports debug code.
- `src/ui/runtime/**` imports nothing from `src/protocol`, `src/transports`, or `src/debug`.
- `src/protocol/**` imports nothing from `src/state` (state may import protocol constants and the symbol table).
- `src/ai/**` and `src/ui/presets/**` import nothing from the rest of `src/`; nothing in `src/` imports `src/ai` (only the shells do).
- No direct assignment to shadow state outside a `commit` callback.
- `python scripts/check_release.py` passes (it also checks that no shipped file refers to a file outside the release).

## Working rules

The detailed rules are in `.github/instructions/*.instructions.md` (six rule files covering architecture guardrails, state/shadow sync, protocol/parser, debug isolation, mobile runtime UI, and PWA release discipline). Read the matching file before a non-trivial change in that area.

- Do not `git commit` unless the user asks.
- Refactors must not change wire bytes, frame order, timing, or state shape. New protocol behavior goes behind a flag that defaults off until verified on hardware.
- Test fixtures (`test/fixtures/`: golden files, `builders.cases.json`, transcripts, sample presets) are changed only with the user's approval. If a change would require updating one, stop and ask.
- Hardware verification (real amp over USB/BLE) can only be done by the user. Say plainly what was verified offline and what still needs a hardware check.
- Do not modify the protocol notes in `doc/` unless asked. Keep `doc/app_internals.md` current (rules, topology sketch, flows, timing table, file table) when files, flows or timings change.
- The runtime UI is portrait-first mobile (target 390x844) and shows no raw SysEx, parser traces, or other diagnostics.
- Comments only where a non-obvious rule needs explaining. Many existing comments record hardware findings (slot numbering, required delays, opcode meanings); keep them accurate when touching that code.
- **Minimal Code:** Keep the codebase lean, lightweight, and tightly scoped. Avoid unnecessary helper functions, bloated abstractions, and "just in case" code. Less code means fewer bugs and instant loading.
- **High Maintainability:** Favor readability and logical isolation over clever, cryptic one-liners. If a piece of logic is repeated, refactor it into a reusable utility.

## Protocol references

`doc/` holds the SysEx protocol notes; `doc/app_internals.md` ("Protocol notes") lists them by topic. The THR30II protocol PDF they build on (`SYSEX_PROTOCOL_THR30II.pdf`) is not in this repository; it is in martinzw's [THRII-direct-USB-pedalboard](https://github.com/martinzw/THRII-direct-USB-pedalboard).
