# THR-II Controller: Implementation Plan (Copilot-executable)

Architecture: [architecture.md](architecture.md) (text is normative).
Target topology: [architecture-topology-redrawn.md](architecture-topology-redrawn.md). The original diagram in architecture.md stays unchanged for comparison.
Governing rules: `.github/instructions/*.instructions.md` (all six apply to `*.js`, `*.html`, `*.md`).

| Phase | Name | Status | Human gate |
|---|---|---|---|
| 0 | Baseline and golden fixtures | done (BLE and transcripts deferred; export golden see P9) | H0 smoke baseline (done) |
| 1 | Pure helpers and builders | done (H1 PASS) | H1 smoke subset (done) |
| 2 | Shadow store | done (H2 PASS) | H2 smoke subset (done) |
| 3 | Transport, protocol, parser split; dev page with raw trace | done offline (H3 pending: BLE and trace comparison) | H3 USB and BLE trace comparison |
| 4 | Write coalescing (flag off) | done offline (no hardware gate; verified in Phase 5) | none |
| 5 | Runtime UI port; side-by-side dev page | done offline (H4 pending) | H4 coalescing on hardware |
| 6 | Boot and device-driven sync | done offline; runtime page wired (hardware checklist and TAP capture pending) | H5 slot sync, H6 auto-activate |
| 7 | Preset domain | planned in detail (7A to 7G), waiting for review | H7a to H7f: export, import, backup, save, name, restore |
| 8 | Import AI (replaces the cancelled debug observer) | done offline (8A to 8C); first real generation and hardware gates pending | H8a to H8d: generate, upload, failures, absent |
| 9 | PWA shell and release check (detailed in [plan_pwa.md](plan_pwa.md)) | done; deployed to GitHub Pages; first checks by you passed (installed on Android, AI generation); full H9 pending | H9 installed PWA smoke |
| 10 | Retire legacy prototype ([plan_pwa.md](plan_pwa.md)) | done offline (legacy page moved to `legacy/`, `thrii_ui.html` removed) | H10 final smoke |
| 11 | Structure review and cleanup ([plan_pwa.md](plan_pwa.md)) | done offline 2026-11-19; plans archived | H11 short smoke |

---

## 0. Execution protocol (for Copilot)

- **One phase per session.** Before starting, read this file (the phase section and section 5), `architecture.md`, and the six instruction files. Then work the steps in order.
- **Step tags.** `[AGENT]` = Copilot does it. `[HUMAN]` = Copilot stops, asks the user to perform it on the PC with the THR-II connected (use the ask_user tool with the checklist), records the result, and continues only on PASS.
- **Scope.** Create only the files listed for the phase (section 3). Any other file change needs user approval.
- **No git commits** (decision P2). Do not run `git commit` unless the user asks.
- **Do not modify** `architecture.md` diagram, `architecture-topology-redrawn.md` (except by user request), `doc/` (except Phase 9 copy and Phase 10 cleanup), or `thrii_ctrl.html` beyond what a phase states.
- **Refactor steps** must not change wire bytes, timing, or state shape. Behavior changes sit behind flags (section 5) that default to `false`.
- **Comments:** only where a non-obvious rule needs explaining.
- **Stop and report** (do not improvise) when: a Done-when check fails twice; a function assumed to be a global in `thrii_ctrl.html` is not reachable; a moved function depends on DOM or shadow state that the phase did not plan for; a `[HUMAN]` result is FAIL; a golden file would need updating (only the user may approve golden changes).
- **Paths and commands** are Windows/PowerShell. Use `python -m http.server 8080` from the repo root for browser work. URLs: `http://localhost:8080/<file>`.
- **Line numbers** in this plan are approximate. Locate code by function name with grep.

## 1. Starting point (verified)

| Artifact | Role | Gap |
|---|---|---|
| `thrii_ctrl.html` (~5.8k lines) | Legacy prototype: transport, parser, shadow functions, presets, UI, inline debug | Single inline `<script>`; direct sends via `sendAndLog`; parser registration coupled to sends |
| `thrii_ui.html` (~1.9k lines) | Portrait UI mock (`KnobControl`, `THRIIApp`, ...) | No device wiring; owns `selectedMemorySlot`, `isMemoryDirty`, `userMemoryLabel` |
| `doc/thr10ii_w_symbol_table_1_44_0_a.{js,json,txt}` | Symbol dictionary, loaded by `<script src>` | Under `doc/`, would ship with a naive release |
| Protocol docs | `SYSEX_PROTOCOL_THR30II.pdf` in [martinzw/THRII-direct-USB-pedalboard](https://github.com/martinzw/THRII-direct-USB-pedalboard) (opcode 02 user-memory notification, "have user settings changed?" query); `doc/thrii_sysex_protocol_engineering_notes.md` (around line 74) | Source for Phase 6 frames; still needs a hardware transcript |
| `index.html`, `manifest.json`, `sw.js`, `src/`, `test/` | Do not exist | Created by the phases in section 3 |

Environment (checked): Windows, PowerShell, Git, Python 3.13 (real install), Chrome and Edge installed. **Node.js is not installed and will not be installed** (P1). All tests run in the browser.

## 2. Surfaces and side-by-side debugging on the PC

| File | Purpose | Exists from | Imports debug code? |
|---|---|---|---|
| `thrii_ctrl.html` | Legacy reference harness. Stays runnable until Phase 10. | now | legacy inline debug only |
| `thrii_ui.html` | Runtime page. Thin shell that mounts `src/ui/runtime` (Phase 5). | now (rewritten in Phase 5) | no |
| `dev.html` | Dev-only composition root. Same page shows the runtime UI in a 390 px portrait frame on the left and the debug panel on the right, sharing one module graph and one event bus. | Phase 3 (raw trace only), extended in Phase 5 and 8 | yes (this is the only page that does) |
| `index.html` | Production PWA shell (Phase 9). | Phase 9 | no |

Rules:

- `dev.html` is the composition root for development. Runtime modules never import `src/debug` or `src/ui/debug`. Only `dev.html` does.
- Why same-page composition and not an iframe: iframes do not share module instances, so the debug panel would need a message bridge that does not exist in production. Same page keeps the debug observer on the real event bus.
- `dev.html` accepts `?source=mock` (Phase 5) to run the runtime UI on `test/fixtures/mockState.json` with no device. This query exists only in the dev composition root.

## 3. When folders and files are created

Folders are created lazily: a phase creates only what it needs. The tree in architecture.md is the target; `src/core/logger.js` and `constants.js` are created only if a phase needs them.

| Phase | Creates | Modifies | Must not touch |
|---|---|---|---|
| 0 | `test/runner.html`, `test/support/assert.js`, `test/fixtures/`, `test/unit/fixtures.test.js` | two instruction files (write-coalescing owner wording) | `thrii_ctrl.html`, `thrii_ui.html`, architecture.md diagram |
| 1 | `src/core/bytes.js`, `src/core/values.js`, `src/protocol/constants.js`, `src/protocol/counter.js`, `src/protocol/builders.js`, `test/unit/bytes.test.js`, `test/unit/builders.test.js` | `thrii_ctrl.html` (moved definitions removed; script becomes a module with imports) | writers and parser code |
| 2 | `src/state/shadowStore.js`, `src/state/selectors.js`, `test/unit/shadowStore.test.js` | `thrii_ctrl.html` (writers routed through `commit`) | data shape of the shadow object |
| 3 | `src/core/eventBus.js`, `src/transports/usbTransport.js`, `src/transports/bleTransport.js`, `src/transports/transportManager.js`, `src/protocol/parser.js`, `src/protocol/requestResponse.js`, `src/debug/observer.js` (raw subset), `src/ui/debug/rawTracePanel.js`, `dev.html`, unit tests | `thrii_ctrl.html` (send and parser call sites) | wire order |
| 4 | `src/core/flags.js`, `src/protocol/writeScheduler.js`, `test/unit/writeScheduler.test.js` | none in legacy | legacy write path (stays direct) |
| 5 | `src/ui/runtime/*.js`, `test/fixtures/mockState.json`, `test/fixtures/screens/*.png` | `thrii_ui.html` (becomes thin shell), `dev.html` (left pane) | `src/protocol`, `src/transports` |
| 6 | `src/protocol/syncFlow.js`, `test/unit/syncFlow.test.js`, `test/fixtures/transcripts/slot-sync.txt` (human capture) | `src/protocol/builders.js` (new frames), `src/core/flags.js` (autoActivate, slotSync); pre-Phase-7: `src/app/boot.js` (created), `thrii_ui.html`, `dev.html`, `src/ui/runtime` (CONNECT button), `src/transports/transportManager.js` (BLE drop) | unrelated builders |
| 7 | `src/domain/presetModel.js`, `src/app/files.js`, `src/app/presetFlow.js`, `test/unit/preset.test.js`, `test/unit/presetFlow.test.js` (see 7.4) | `src/app/boot.js`, `src/protocol/syncFlow.js`, `src/protocol/dumpParser.js`, `src/ui/runtime` | `thrii_ctrl.html`, goldens |
| 8 | `src/ai/config.js`, `src/ai/api.js`, `src/ai/aiPresets.js`, `src/ai/aiPresets.css`, `scripts/serve.py`, `test/unit/aiPresets.test.js` (see 8.5) | `src/app/presetFlow.js`, `src/app/boot.js`, `src/ui/runtime/layout.js`, `src/ui/runtime/mount.js`, `thrii_ui.html`, `dev.html` | `src/protocol`, `src/transports`, `src/state`, `src/domain`, goldens |
| 9 | `index.html`, `manifest.json`, `sw.js`, `icons/`, `src/app/main.js` (`src/app/boot.js` exists since Phase 6), `src/data/` (symbol table copy), `scripts/check_release.py` | `src/protocol/symbolTable.js` (data path) | `doc/` copies stay until Phase 10 |
| 10 | `legacy/thrii_ctrl.html` (moved) | removes `doc/` symbol copies and `thrii_ui.html` only if P5 says so | architecture.md diagram |

## 4. Validation tiers

| Tier | What | Who | Command or method |
|---|---|---|---|
| T1 unit and golden | Pure modules: bytes, builders, store, scheduler, syncFlow, preset round trip | Copilot | Browser runner `http://localhost:8080/test/runner.html`; Copilot reads the summary with browser tools |
| T2 browser | Load pages with no console errors; layout screenshots at 390x844 (runtime) and 1440x900 (dev page); offline reload (Phase 9) | Copilot with browser tools against `http://localhost:8080` | browser tools (`openBrowserPage`, `runPlaywrightCode`, `screenshotPage`) |
| T3 hardware | Real THR-II over USB and BLE | Human, reported to Copilot | checklists in each `[HUMAN]` step |
| Gates | Static checks | Copilot | grep, see below |

Standing gates (run in the phase that introduces them and every later phase):

- **G-debug:** no file under `src/core`, `src/state`, `src/protocol`, `src/transports`, `src/domain`, `src/ui/runtime`, `src/app`, `index.html`, `thrii_ui.html` imports from `src/debug` or `src/ui/debug`, or references `dev.html`.
- **G-ui-boundary:** `src/ui/runtime/**` imports nothing from `src/protocol`, `src/transports`, or `src/debug`. Runtime UI emits intents only.
- **G-single-writer:** every mutation of the shadow state goes through `commit`. Review grep hits for direct assignments.
- **G-ai** (from Phase 8): nothing under `src/` outside `src/ai` imports from `src/ai`, and `src/ai/**` imports nothing from outside its folder. Only the shells import it.

## 5. Decisions

### 5.1 Confirmed

| # | Decision |
|---|---|
| 1 | Serve over HTTP from Phase 1 (ES modules). `file://` is no longer supported. |
| 2 | Tests run in a browser runner page (`test/runner.html`). No Node.js (P1). |
| 3 | Write coalescing defaults: 40 ms quiet window, 120 ms max interval. Flag `coalesceWrites` default `false`. |
| 4 | Device-reported active memory slot is store-owned (`state.activeSlot`). Draft and dirty flags stay UI-local. |
| 5 | Legacy `thrii_ctrl.html` moves to `legacy/` in Phase 10. |
| 6 | Symbol table data moves to `src/data/` in Phase 9. |
| 7 | Write coalescing is owned by the protocol layer (`src/protocol/writeScheduler.js`). Phase 0 aligns the two instruction-file wordings. |
| 8 | UI port (Phase 5) starts against a mock store in parallel with Phases 2 to 4. |

### 5.2 Answered (P1 to P8)

| # | Question | Recommendation | Blocks |
|---|---|---|---|
| P1 | Install Node.js LTS | **Answered: no.** Tests run in the browser; the release check is Python. | resolved |
| P2 | Commit policy | **Answered: no commits.** | resolved |
| P3 | Minimal raw-trace debug panel in Phase 3 | **Answered: yes.** | resolved |
| P4 | `dev.html` side-by-side layout | **Answered: yes.** | resolved |
| P5 | Final runtime page name | **Answered: rename `thrii_ui.html` to `index.html` in Phase 9; remove `thrii_ui.html` in Phase 10.** | resolved |
| P6 | Browser for automation | **Answered: Chrome.** | resolved |
| P7 | Hardware on the PC: THR-II over USB, and BLE | **Answered: yes.** | resolved |
| P8 | App icon for the manifest | **Answered: generated placeholder now, replace later.** | resolved |
| P9 | Phase 7 round-trip test: legacy export needs asset names from a device dump, so import-then-export cannot run offline. Options: (a) compare the normalized import only, which is parity-safe; (b) make export resolve asset names from the symbol table (a behavior change, outside parity). **H0 finding:** the legacy export of the sample preset is lossy (FX1 and FX3 enable flags flipped, FX2 and FX4 wet/dry changed, extra fields added); details in `test/fixtures/smoke-baseline.json`. Decide whether Phase 7 fixes this or only documents it. | (a) for Phase 7 unless you decide to fix the export | Phase 7 |

## 6. Phases

Each phase lists **Read first**, **Steps**, **Human gates**, **Done when**, and **Stop if**.

---

### Phase 0: Baseline and golden fixtures

**Read first:** architecture.md (Essential runtime flows), protocol-parser-master, pwa-release-discipline.

**Steps**

1. `[AGENT]` Create the browser test runner:
   - `test/support/assert.js`: `describe`, `it`, `assertEqual`, `assertDeepEqual`, `assertTrue`. Collects results; no external dependencies.
   - `test/runner.html`: imports every test file in an explicit array and renders the PASS and FAIL counts in `<div id="summary">`. Each phase appends its test files to this array.
2. `[AGENT]` Start the server (`python -m http.server 8080` from the repo root) and open `thrii_ctrl.html` through the browser tools (P6). Evaluate `typeof buildSetParameter`, `typeof buildSetModuleParameter`, `typeof buildSetModuleEnabled`, `typeof buildRequestUserSettingsDump`, `typeof buildUploadUserSettingsFrames`, `typeof buildAskGlobalParameter`, `typeof buildThrL6PresetFromShadow`. If any is not `"function"`, **stop**: the inline script is wrapped and the bridge plan needs revision.
3. `[AGENT]` Read the signatures of those builders (grep the names; they sit between the `buildRequestUserSettingsDump` and `buildSetModuleParameter` definitions). Create `test/fixtures/builders.cases.json`: an array of `{ "name", "fn", "args" }` covering the four activation frames (take them from `thrActivateSequenceHex`), actual and slots 1 to 5 dump requests, two `buildSetParameter` calls, one `buildSetModuleParameter`, one `buildSetModuleEnabled`, and one upload frame set with a fixed patch.
4. `[AGENT]` In the browser, call each case and collect hex output. Write `test/fixtures/builders.golden.json` (name to hex array).
5. `[AGENT]` Preset golden, hardware-free part: fetch `doc/01. EarlyVH.thrl6p`, run `parseImportedThrl6Preset`, and save the sorted-key result to `test/fixtures/preset.normalized.golden.json`. **The legacy export cannot run from an import alone** (`buildThrL6PresetFromShadow` throws "Download/sync a full dump first"), so no export golden is captured in Phase 0. See decision P9.
6. `[AGENT]` Create `test/unit/fixtures.test.js`: every golden case has a non-empty hex array; the preset golden parses as JSON.
7. `[AGENT]` Align wording to decision 7: in `.github/instructions/protocol-parser-master.instructions.md` section 6 and `.github/instructions/state-model-shadow-sync.instructions.md` rule 6, name the protocol layer (`src/protocol/writeScheduler.js`) as the owner of write coalescing. Do not change `architecture.md` or the diagram.
8. `[HUMAN]` H0 smoke baseline on the current `thrii_ctrl.html` (P7). Ask the user for PASS, FAIL, or NA for each item, plus firmware version and browser:
   - USB connect; BLE connect
   - Activate THR-II
   - Dump Actual; dump User Memory 1 to 5
   - Change one parameter in the app and confirm on the amp
   - Turn one knob on the amp and confirm in the app
   - Press amp memory buttons 1 to 5 and confirm the app follows
   - Import `doc/01. EarlyVH.thrl6p`, export, compare
   - Upload to a memory slot and read it back

   Record the answers in `test/fixtures/smoke-baseline.json`.
9. `[HUMAN]` Deferred. No USB dump log was saved in H0, so no transcript fixture exists yet. The Phase 6 slot-sync capture covers the same need.

**Done when:** `test/runner.html` shows 0 failures, including `fixtures.test.js`; smoke-baseline file has every item recorded; wording edits are in place; `git status` shows only the files listed in section 3.

**Stop if:** any builder is not a global function; the preset file input cannot be driven.

---

### Phase 1: Pure helpers and builders

**Read first:** architecture.md (Recommended modular structure, Symbol table role), protocol-parser-master (Keep transport and protocol separate).

**Steps**

1. `[AGENT]` Create `src/core/bytes.js`. Export `toHex`, `parseSysExHex`, `writeU32LE`, `writeF32LE`, `clamp01`, `sleep`. Copy the implementations from the legacy inline script without changes (grep each name).
2. `[AGENT]` Create `src/protocol/builders.js`. Move `thrActivateSequenceHex` and these functions verbatim, together with their pure dependencies (constant tables `thrKeys`, `thrTypeCode`, `thrOpcode`, `thrDumpProtocol`; `writeU32LE`, `writeF32LE`, `concatBytes`, `clamp01`, `encodeBitBucket7Padded`, `buildCommandFrameFromRawPayload`, `buildHeaderFrame`, `buildBodyFrame`, `normalizeDumpTargetRef`, `dumpTargetRefToU32`). The counter fallback `nextCommandCounter` is state: builders keep taking an explicit counter, and the legacy default path keeps calling the legacy counter. These functions: `encodeShadowRawU32`, `buildRequestUserSettingsDump`, `buildUploadUserSettingsHeader`, `buildUploadUserSettingsBodyFrames`, `buildUploadUserSettingsFrames`, `buildSetParameter`, `buildAskGlobalParameter`, `buildSetModuleEnabled`, `buildSetModuleParameter`. They must read no DOM and no shadow state. If a moved function calls a helper that does, **stop** and report.
3. `[AGENT]` **Deferred to Phase 3.** The symbol state lives in the parser object (`thrIncomingParser.symbols`), so a wrapper now would be dead code. Original spec for Phase 3: create `src/protocol/symbolTable.js` with `loadSymbolTable()`, `resolveSymbolById(id)`, `resolveSymbolByName(name)`, `buildNameIndex()`, `buildIdIndex()`. It wraps the global loaded from `doc/thr10ii_w_symbol_table_1_44_0_a.js` (unknown IDs return `null`; no throw).
4. `[AGENT]` Edit `thrii_ctrl.html`: delete the inline definitions moved in steps 1 to 3. Change the legacy `<script>` to `<script type="module">` and add the imports at its top (no `window` bridge). Reason: legacy top-level code reads moved names at parse time (for example the `thrProtocolBuilders` object literal), which a separately deferred bridge module cannot provide. Confirm no `onclick=` attributes exist in the HTML (none in Phase 1).
5. `[AGENT]` Create `test/unit/bytes.test.js` and `test/unit/builders.test.js`. Builder tests compare output hex to `builders.golden.json`.

**Done when:**
- T1 passes; no golden was edited.
- Gate: each moved name is defined exactly once (grep `function <name>` across `src/` and `thrii_ctrl.html`).
- T2: `thrii_ctrl.html` loads with zero console errors, and the four activation frames are byte-identical to the golden.

**Human gates**
- H1 `[HUMAN]` smoke subset on the bridged legacy page: USB connect, Activate, Dump Actual, one parameter write (compare readback with H0 baseline).

**Stop if:** any golden mismatch. Fix the extraction; never update the golden.

---

### Phase 2: Shadow store

**Read first:** state-model-shadow-sync (all rules), architecture.md (Runtime model and ownership).

**Steps**

1. `[AGENT]` Create `src/state/shadowStore.js`:
   - `createStore(initialState)` returns `{ getState, commit, subscribe }`.
   - `commit(mutate, source)` calls `mutate(state)` on the live state object (the same shape as `createParserShadowState` returns), then notifies subscribers with `source`. `source` is one of `ui`, `device`, `dump`, `import`, `parser`.
   - Keep the shape identical. No cloning on the hot path.
2. `[AGENT]` Create `src/state/selectors.js` with read-only functions moved from the legacy file: `readShadowParamByName`, `getLatestShadowUnitByName`, `getLatestShadowUnitById`, `buildShadowParameterIndex`, `findShadowParamByCandidates`.
3. `[AGENT]` Edit `thrii_ctrl.html`: create the shadow object through `createStore`. Wrap the writers `applyParserEventToShadowState`, `projectDumpDomainToShadowState`, `upsertShadowParam`, `applyImportedToneToShadow`, and `ensureShadowUnit` so each mutation runs inside `commit(..., source)`.
4. `[AGENT]` Replace direct calls to `syncControlsFromShadowState` with a `subscribe` registration. Keep behavior: the function runs after each commit.
5. `[AGENT]` Create `test/unit/shadowStore.test.js`: subscribers receive `source`; mutations are visible to subsequent `getState` calls; an unsubscribed listener is not called.

**Done when:**
- T1 passes.
- G-single-writer: review grep hits for direct assignments on the shadow object; all are inside `commit` callbacks or `src/state/`.
- T2: the device-model digest after importing `doc/01. EarlyVH.thrl6p` equals `test/fixtures/shadow.afterImport.json` (the export golden is not available offline; see P9).

**Human gates**
- H2 `[HUMAN]` smoke subset: Dump Actual updates the controls; turning an amp knob updates the app.

**Stop if:** the digest differs from the fixture, or a reader breaks.

**Outcome (Phase 2, deviations from the steps above):**
- Store: `createStore` in `src/state/shadowStore.js`. Listeners run once per microtask batch and receive the last commit's source.
- Commit entry points, not per-writer wrappers: parser events (`device`, or `dump` for settings-dump completion), preset import (`import`), and dump-cache writes (`dump`). `ensureShadowUnit`, `projectDumpDomainToShadowState`, and `upsertShadowParam` are reachable only through those commits, so wrapping them again would only nest commits.
- Scope: the device model (`units`, `lastParameterChange`, `dumpDomain`, `dumpCache`) goes through `commit`. Parser bookkeeping (`stats`, `dump`, `dumpSessions`) stays direct and is not device state.
- Selectors: `readShadowParamByName`, `getLatestShadowUnitByName`, `getLatestShadowUnitById`, `buildShadowParameterIndex` moved to `src/state/selectors.js` and take `state` as the first argument. `findShadowParamByCandidates` stays in the legacy file because it uses legacy helpers.
- Sync: the direct `syncControlsFromShadowState()` calls were replaced by one subscription.

---

### Phase 3: Transport, protocol, parser split; dev page with raw trace

**Read first:** protocol-parser-master (all sections), debug-isolation (all rules), architecture.md (Topology text, transport layering).

**Steps**

1. `[AGENT]` Create `src/core/eventBus.js`: `createBus()` with `on(topic, fn)` (returns an unsubscribe function) and `emit(topic, payload)`. Topics: `raw:in`, `raw:out`, `parser:event`, `transport:status`.
2. `[AGENT]` Create transports:
   - `src/transports/usbTransport.js`: MIDI access, `midiOut`, and the incoming-message handler (from `requestMIDIAccess` and `onUsbMidiMessage` in the legacy file).
   - `src/transports/bleTransport.js`: `connectBle` and `sendBle` from the legacy file.
   - `src/transports/transportManager.js`: `connect(kind)`, `disconnect()`, `send(bytes, label)` which emits `raw:out`, and inbound bytes which emit `raw:in`. USB first, BLE fallback when the caller requests it.
3. `[AGENT]` Create `src/protocol/parser.js`. Move the SysEx frame extraction, payload interpretation, and event creation from the legacy `handleIncomingBytes` and its helpers (grep for `handleIncomingBytes` and `thrIncomingParser`). The parser must not touch the DOM. It emits `parser:event`. It does not mutate state directly; the legacy wiring commits through `commit`.
4. `[AGENT]` Create `src/protocol/requestResponse.js`: `send(bytes, label)` delegates to `transportManager.send`. Replace the legacy `sendAndLog` call sites with it. Replace `registerOutgoingForParser` with a `raw:out` subscription.
5. `[AGENT]` Legacy wiring: `raw:in` subscription calls the parser; the parser's output reaches the legacy shadow functions as before.
6. `[AGENT]` Create `src/debug/observer.js` (raw subset): subscribes to `raw:in` and `raw:out`; exposes no write API.
7. `[AGENT]` Create `src/ui/debug/rawTracePanel.js`: renders the last 500 frames with direction, label, and hex.
8. `[AGENT]` Create `dev.html`: two panes. Left pane: placeholder "runtime (Phase 5)". Right pane: `rawTracePanel`. Uses the new transports, not the legacy code.
9. `[AGENT]` Create transport and parser unit tests with a fake MIDI port: send order equals `raw:out` order; inbound bytes produce `raw:in` before parser events.

**Done when:**
- T1 passes.
- G-debug passes.
- T2: `dev.html` and `thrii_ctrl.html` load with zero console errors.

**Human gates**
- H3 `[HUMAN]` USB and BLE: the same Activate and Dump Actual run on `thrii_ctrl.html` and `dev.html`. Compare the raw trace order and bytes (use the raw panel and the legacy log). Report PASS or FAIL per transport.

**Stop if:** raw order differs between legacy and new path; BLE `sleep(500)` timing changes the activation result.

**Outcome (Phase 3, what was built and what was not):**
- Built: event bus (`src/core/eventBus.js`); USB and BLE transports with `connectUsb`, `connectBle`, `disconnect`, `send` in `src/transports/`; `raw:out` emitted before each write; `raw:in` for inbound bytes; frame decoding moved to `src/protocol/frames.js`; raw observer (`src/debug/observer.js`); raw trace panel (`src/ui/debug/rawTracePanel.js`); `dev.html` (runtime pane placeholder left, debug pane right).
- Legacy wiring: `raw:in` calls `handleIncomingBytes`; `raw:out` calls `registerOutgoingForParser`; `sendAndLog` goes through the transport manager. The legacy connection flow (permission hint, UI log lines) stays in `thrii_ctrl.html` and calls the transport primitives.
- Not done, deferred on purpose:
  - `src/protocol/requestResponse.js`: not needed; `sendAndLog` now uses the transport manager directly.
  - `src/protocol/symbolTable.js` (deferred from Phase 1): still not created. The symbol state lives inside `thrIncomingParser.symbols`; it moves with the semantic parser.
  - Semantic parser (`consumeIncomingSeriesFrame`, `decodeIncomingSemanticEvents`, `applyParserEventToShadowState`, dump sessions): still in the legacy file. These depend on the symbol table, dump sessions, and the shadow state, so they move in a later phase.
- Connection code is duplicated between `thrii_ctrl.html` and `transportManager.js` (the MIDI and BLE requests). Remove the legacy copy in Phase 10 with the legacy file.
- Verification (offline): runner PASS 29 FAIL 0; legacy page connects through a fake MIDI port, sends the four activation frames (matching the golden), and parses the same inbound frames as the pre-refactor copy from git (identical RX lines and counters); `dev.html` connects, sends the activation through the new transports, and shows the trace; the debug-isolation gate finds no runtime imports of debug code.
- Test-harness note: the browser's module cache served stale modules after edits. Disable the cache through CDP (`Network.setCacheDisabled`) before testing module changes.
- H3 finding (fixed): BLE framing did not follow `doc/thrii_sysex_bitbucket_ble.md`. The transport sent `[ts][ts][frame]` in 202-byte chunks, so the `F7` had no timestamp before it, and the activation failed over BLE. The packetizer now sends packet 1 as `[hdr][ts][F0 ..]`, continuation packets as `[hdr][data]` capped at 20 bytes, and the last packet as `[hdr][data][ts][F7]`. Verified with a stubbed BLE characteristic on `dev.html` (7 packets for the 4 activation frames) and with unit tests (runner PASS 31 FAIL 0). The legacy BLE path uses the same transport, so it gets the same fix. BLE was never validated on hardware in the baseline (H0 deferred it), so this may not be a regression.
- Connection order (decided by user): BLE first and default; if BLE is cancelled or unavailable, USB. Implemented in the legacy `onConnect`. Verified on the legacy page with stubs: BLE cancel falls back to USB (USB connects); BLE success makes zero MIDI requests. This is new behavior relative to the original page (which tried USB first).
- Packet size: default 20 bytes (ATT MTU 23 minus the 3-byte header). The switch is `BLE_USE_REPORTED_PACKET_SIZE` in `src/transports/bleTransport.js`. When `true`, the transport uses the browser-reported `maxWriteWithoutResponseSize` if it is larger than 20 (up to the 509-byte limit the doc allows). When `false`, it always uses 20. The flag is also an option on `createTransportManager({ useReportedPacketSize })`. UNVERIFIED on hardware: the amp's acceptance of packets larger than 20 bytes. It will be exercised by preset uploads; keep or switch to `false` after that test. Verified offline: runner PASS 34 FAIL 0 (includes the switch-off test); legacy page loads with no errors.
- Legacy BLE retest pending the new order.

---

### Phase 4: Write coalescing (flag off)

**Read first:** protocol-parser-master section 6, state-model-shadow-sync rule 6, decisions 3 and 7 (section 5.1).

**Steps**

1. `[AGENT]` Create `src/core/flags.js`: `export const flags = { coalesceWrites: false, autoActivate: false, slotSync: false }`. Dev overrides come only from `dev.html` query parameters (`?flag=coalesceWrites`). Runtime reads `flags` only.
2. `[AGENT]` Create `src/protocol/writeScheduler.js`:
   - `createWriteScheduler({ quietMs: 40, maxMs: 120, readValue, emitWrite })`.
   - `request(key)` schedules a flush for a key (key = unit plus parameter).
   - `flushKey(key)`, `flushAll()`.
   - `readValue(key)` reads the **shadow store** at flush time; the scheduler never receives UI values.
   - Ordering rule: `flushAll()` runs before any non-coalesced command (dump request, upload frames, activation, enable or disable).
3. `[AGENT]` Create `test/unit/writeScheduler.test.js` with fake timers:
   - 20 changes within 100 ms produce one emit with the last value;
   - continuous changes force an emit at 120 ms;
   - `flushAll` precedes a dump request.
4. `[AGENT]` Do not change the legacy write path. Routing to the scheduler happens in Phase 5, behind the flag.

**Done when:** T1 passes; G-debug and G-ui-boundary pass.

**Human gates:** none in this phase (behavior is off). Coalescing is verified in H4 (Phase 5).

**Stop if:** the scheduler can emit a value that is not the latest shadow value.

**Outcome (Phase 4):** `src/core/flags.js` (all three flags off by default; `dev.html` applies `?flag=` overrides); `src/protocol/writeScheduler.js` (per-key last-write-wins with a quiet window and a max interval, value read from the store at flush time, `flushAll` for ordering, injectable clock); `test/support/fakeClock.js`; `test/unit/writeScheduler.test.js`. The legacy write path is unchanged, as planned; routing happens in Phase 5 behind the flag. Verified offline: runner PASS 42 FAIL 0; `?flag=coalesceWrites` turns the flag on and unknown names are ignored; debug-isolation gate clean. G-ui-boundary is trivially met until `src/ui/runtime` exists.

---

### Phase 5: Runtime UI port; side-by-side dev page

**Read first:** mobile-runtime-ui (all rules), state-model-shadow-sync (UI ownership), decision 4 and P4 (section 5).

**Steps**

1. `[AGENT]` Baseline: before changing `thrii_ui.html`, take screenshots at 390x844 and 1440x900 and save them to `test/fixtures/screens/thrii_ui-before-390.png` and `thrii_ui-before-1440.png`.
2. `[AGENT]` Create `test/fixtures/mockState.json`: the normalized state from the Phase 0 preset golden, plus `activeSlot: null`.
3. `[AGENT]` Split the classes in `thrii_ui.html` into `src/ui/runtime/`:
   - `knobView.js` (`KnobControl`), `ledView.js` (`LEDIndicator`), `unitSelectorView.js` (`UnitSelector`), `moduleView.js` (`ModuleSection`), `ampView.js` (`AmpSection`), `memoryView.js` (slot buttons, draft and dirty flags), `appView.js` (`THRIIApp`).
   - Each view renders from selectors only. None holds device values.
4. `[AGENT]` Create `src/ui/runtime/mount.js`: `mountRuntime(rootEl, { store, intents })`. This is the only export that `thrii_ui.html` and `dev.html` call.
5. `[AGENT]` Intents: `setParam`, `selectUnit`, `selectSlot`, `requestDump`. Each commits to the store with `source: 'ui'`. The write path goes to `writeScheduler.request(key)` when `flags.coalesceWrites` is true, and to a direct `protocol.send` otherwise. Only `source: 'ui'` commits may schedule writes.
6. `[AGENT]` Classification (decision 4): `state.activeSlot` is set from device events only. `memoryView` keeps the draft and dirty flags locally.
7. `[AGENT]` Rewrite `thrii_ui.html` as a thin shell: a root element, a live store (empty until connect), and `mountRuntime`. It imports nothing from `src/debug`.
8. `[AGENT]` Extend `dev.html`: left pane is a 390 px portrait frame with `mountRuntime`. Support `?source=mock` (loads `mockState.json`). Keep the right pane from Phase 3.
9. `[AGENT]` T2 checks: both pages load with zero console errors; screenshots match the before-images in layout (visual review, report differences).

**Done when:** T1 passes; G-debug and G-ui-boundary pass; T2 layout check passes; no DOM-held device values (review `memoryView` and `knobView` against state-model rule 2).

**Human gates**
- H4 `[HUMAN]` with the device connected, run `dev.html?flag=coalesceWrites` (flag on in dev only). Sweep one knob. Report: frames in the raw-out panel for the sweep, and whether the amp ends on the final value. Then run `dev.html` with the flag off and compare.

**Stop if:** a view needs a value that is not in the store.

**Outcome (Phase 5, what was built and what was not):**
- Built: `src/ui/runtime/` with `runtime.css` (moved from the old page, unchanged), `knobView.js`, `ledView.js`, `unitSelectorView.js`, `moduleView.js`, `ampView.js`, `memoryView.js`, `appView.js`, `mount.js` (`mountRuntime(rootEl, {store, intents})`), `intents.js` (`createRuntimeIntents`), `viewModel.js` (`selectRuntimeModel`, pure), `layout.js` (static layout). Store helpers added to `src/state/selectors.js`; `src/protocol/paramWrite.js` builds the write frames for the shell.
- Views are built once and updated in place; a store update never rebuilds a knob that is being dragged. Knobs with no normalized value show `--` and are disabled.
- `thrii_ui.html` is now a thin shell with an empty store (no device connection yet). The old file was replaced in full (git keeps the history).
- `dev.html`: left pane is the runtime at the mobile sizes; `?source=mock` loads `test/fixtures/mockState.json` (the device model captured after the preset import, in store shape). In mock mode a slot press simulates the device's slot event.
- Intents commit with source `ui`; writes go through the scheduler when `coalesceWrites` is on, otherwise directly.
- Verified offline: runner PASS 55 FAIL 0; `thrii_ui.html` loads with zero errors; `dev.html?source=mock` shows the captured values; five Master steps with a fake port give 5 writes (10 frames) with the flag off and 1 write (2 frames) with `coalesceWrites` on, ending at 74 both times; the layout matches the baseline screenshot (`test/fixtures/screens/thrii_ui-before-390.png` vs `dev-mock-runtime-after-390.png`); the runtime-UI and debug-isolation gates are clean.
- Not done, deferred on purpose:
  - Live device data does not reach the runtime yet: the dump projection exists in `src/state/applyDumpPatch.js` but is not wired live until the Phase 6 sync flow.
  - Amp model and effect type writes: the intent commits locally, but the write (`buildSelectUnitType`) is still in the legacy file.
  - Memory slot recall and dump requests are forwarded to the shell only (Phase 6).
  - Per-unit parameter lists and per-parameter ranges (for example the gate threshold in dB) come from the layout placeholder and show `--` until the symbol table provides them.
  - The mock fixture is the shadow snapshot, not the normalized preset golden, because the views need the store shape.
- H4 (hardware): `dev.html?flag=coalesceWrites` against the amp, sweep one knob, compare frames and the final value with the flag off.

---

### Phase 6: Boot and device-driven sync (flags off)

**Read first:** protocol-parser-master sections 1, 4, 5; `SYSEX_PROTOCOL_THR30II.pdf` in [martinzw/THRII-direct-USB-pedalboard](https://github.com/martinzw/THRII-direct-USB-pedalboard) (opcode 02 and "have user settings changed?"); `doc/thrii_sysex_protocol_engineering_notes.md` (around line 74).

**Steps**

1. `[AGENT]` Parser: recognize the opcode 02 user-memory notification and emit `parser:event` with `{ type: 'slotChanged', slot }`. Use the byte layout from the protocol doc; cite the doc line in a comment only if the layout is non-obvious.
2. `[AGENT]` Add to `src/protocol/builders.js` the "have user settings changed?" query and the actual-settings dump request, using the bytes from the doc. Their golden files come from the human capture in step 4. Do not invent bytes; if the doc and the capture differ, **stop**.
3. `[AGENT]` Create `src/protocol/syncFlow.js`: on `slotChanged` (when `flags.slotSync`), send the "changed?" query, then request the actual dump on the reply, then commit the result with `source: 'dump'`.
4. `[HUMAN]` Capture the transcript of one slot-button press on the amp and the app's responses. Save to `test/fixtures/transcripts/slot-sync.txt`.
5. `[AGENT]` `autoActivate`: on `transport:status` connected, run the four-frame activation with the existing 500 ms spacing (when `flags.autoActivate`).
6. `[AGENT]` Echo guard: the scheduler request path accepts only `source: 'ui'`. Add a unit test: a commit with `source: 'device'` or `'dump'` schedules no write.
7. `[AGENT]` `test/unit/syncFlow.test.js`: scripted transcript drives the sync sequence and the expected outbound frames.

**Done when:** T1 passes; the echo-guard test passes; G-single-writer review passes.

**Human gates**
- H5 `[HUMAN]` with `?flag=slotSync` on: press amp memory buttons 1 to 5 and turn an amp knob. Confirm the app follows within a few seconds and the raw-out panel shows no frames caused by device events other than the sync query and dump request.
- H6 `[HUMAN]` with `?flag=autoActivate` on: connect and confirm the activation runs once without a button press.

**Stop if:** the doc bytes and the captured bytes differ; any outbound write is caused by a device event.

**Status (Phase 6, after the captures in `test/fixtures/transcripts/`):**
- Confirmed from captures (thr10ii): every amp frame carries the model code in header byte 5, `24 01 4d` (family `24`, model `01`, marker `4d`). The "have user settings changed?" query `f0 00 01 0c 24 01 4d 00 60 00 00 07 00 0f ...` gets an answer (opcode `01`, one payload byte: `1` = changed). The Master knob sends opcode `04` parameter changes (unit `0x10c`, param `0x4c`, float). A slot press sends opcode `02` with the 0-based slot in word 2.
- Built: `src/protocol/incoming.js` (`decodeIncomingEvent`, `decodeIncomingChunk`: parameter change, settings notification, answer, status; group 0 only), `src/state/applyDeviceEvent.js` (writes device events to the store with source `device`; unknown parameters are ignored; a slot press sets `activeSlot` 1..5), `dev.html` wiring from `raw:in` to the store.
- Verified: runner PASS 67 FAIL 0 (decoder tests read the transcripts directly); on `dev.html?source=mock`, replaying `master_knob.txt` moves the left-panel Master from 69 to 96, and replaying `slot_press.txt` selects memory 3.
- Identity and activation (from `activation_req_resp.txt`): the identity reply `f0 7e 7f 06 02 00 01 0c 24 00 01 00 …` gives family `0x24` (byte 8) and model `0x01` (byte 10). `src/protocol/identity.js` parses it and keeps the device identity; the frame builders use that identity instead of constants (throw if unknown); `src/protocol/activation.js` sends the identity request, waits for the reply, then sends frames 2–4 with the device's own family and model. The legacy page sets the identity from the same reply.
- Decoder fixes from the captures: opcode `01` is an ACK when declared length is 4 (it echoes the command counter), and an answer only when declared length is 1; the slot press is word 1 (memory 2 → slot 1, confirmed by the user's button press).
- Verified: runner PASS 68 FAIL 0 (identity, activation, decoder, and golden builder tests); on `dev.html` (live), Activate uses the amp's identity (`24 01 4d` in frames 2–4) and the captured slot press selects memory 2; on `dev.html?source=mock`, replaying `master_knob.txt` moves Master 69 → 96.
- Open:
  - **Dump decoder done (offline).** `src/protocol/dumpAssembly.js` assembles the Actual dump (1108-byte patch, byte-identical to the legacy parser). `src/protocol/symbolTable.js` loads the names from the symbol table JSON. `src/protocol/dumpParser.js` walks the patch into unit types and typed parameters (dump type codes mapped to the wire codes). `src/state/applyDumpPatch.js` replaces the device units with source `dump`. Golden: the legacy page's `parseDumpPatchDomain` + `projectDumpDomainToShadowState` on the same patch gives 45 entries and a units SHA-256 of `b96203ac…` (computed over names, decoded kinds, raw words and values; `test/unit/dumpParser.test.js`). Runner PASS 81 FAIL 0.
  - **Runtime fixes found with real dump data.** Dump names carry a `State` suffix (`MasterState`), so `findParamByName` now ignores it (exact match first). Effect enables and mixes live on `GuitarProc`, so the view model falls back to `GuitarProc` when a name is missing from the effect unit (write references keep the owning unit).
  - **Not ported (known gaps).** (1) The legacy GuitarAmp fallback for the amp model, which runs only when the amp's unit type is unresolved; the actual dump resolves it (`THR10C_DC30`). (2) The patch name (`Crunch Ico LP`) is not projected; the runtime has no place for it. (3) FX2 `Speed` is a Phaser name; for StereoSquareChorus the rate is `FreqState`, so the knob shows `--` until the layout is per subtype.
  - **Not wired live yet.** `dev.html` does not request dumps, so the decoder is not on the live path until the sync flow lands.
  - **Sync flow behind `slotSync`.** `src/protocol/syncFlow.js`: a slot press requests the Actual dump directly; the completed dump is parsed (`dumpParser`) and applied with source `dump`. States: idle, awaitingDump; a stale timeout (8 s) lets a new press restart a stuck request. Wired in `dev.html` only when `?flag=slotSync` is on; the sync states are written to the raw trace and the status line. Runner PASS 85 FAIL 0. Replaying the slot 1 frames from the hardware log, then `actual_dump.txt`, through `dev.html` gives `Sync: idle (dump complete)` and the amp model `THR10C_DC30` on the left panel.
  - **H5 passed for memory slots.** You confirmed the left panel changes with each amp memory slot on `dev.html?flag=slotSync`. The raw trace showed no extra frames from the app.
  - **Knob follow (H5 finding, fixed offline).** The knob failed because the amp reports a control under a different id than the dump uses for the same name (Master 76 live, MasterState 83 in the dump; Bass 84 vs BassState 79). `applyDeviceEvent` now matches by name (without the `State` suffix) inside the same unit when the id is unknown. Replaying `master_knob.txt` after the dump moves MASTER 67 → 96. Runner PASS 86 FAIL 0.
  - **Open: knob writes.** The app writes with the dump id (83), while the amp reports 76. Check on hardware that turning a knob in the app changes the amp; if the amp ignores writes to 83, write with the live id instead.
  - **H6 passed.** Auto-activate works on connect (`flag=autoActivate`).
  - **Design change (H5 finding).** The planned "have user settings changed?" gate (opcode `0x0f`) was dropped. After a memory switch the amp answered `0` ("not changed"), so no dump was requested and the panel stayed empty. The legacy page does not dump on a slot press either. The changed query stays documented in `doc/` but is not sent.
  - **Dump vs slot resolved from the captures.** Opcode `02` is a slot press when word 1 is `0..4`. The dump report has word 1 `0xffffffff` (the Actual target) and is classified as `dump_report` (`src/protocol/incoming.js`). It does not start a sync.
  - **Activation auto-run (`autoActivate`)** is wired to connect in `dev.html`; H6 still needs hardware.
  - **H5 result (first try, failed).** Slot press 1 was received and the activeSlot highlight followed. The changed query went out with opcode `0x00` (`… 07 00 00 00 …`, not `00 0f`), so the amp never answered and no dump arrived. The browser was running an older `constants.js` without `haveSettingsChanged` (`undefined >>> 0` = 0). The code on disk builds `0x0f`, and the unit test checks the full frame. After that the amp stopped answering knob turns; this is not explained yet. Retest after a hard reload (Ctrl+Shift+R).
  - **H5 result (second try).** The changed query was `00 0f` and the amp answered `changed = 1`, and the slot highlight followed. The app then did not send `TX sync: actual dump`, so the left panel stayed empty. In a fresh page with the current code, the same frames (slot press, answer, parameter frames) through `dev.html` with a simulated MIDI port produce the dump request, so the live page was not running the current code. The sync now reports any exception through the status line (`syncFlow` `fail`), and a test covers a send failure.
  - **Hardware blocker resolved.** After a power cycle, the legacy page downloads Actual and slot 1 again, and a slot 1 press arrives as `02` with word 1 = 0. The sync states now appear as `Sync: …` lines in the raw trace panel of `dev.html` as well as in the status line.
  - **Next hardware check (H5, you):** hard-reload `dev.html?flag=slotSync` (the `flag` part of the URL is required), connect, activate, press memory buttons 1 to 5 and turn a knob. In the raw trace, a slot press should be followed by `Sync: awaitingChanged`, `TX sync: changed?`, the answer, `Sync: awaitingDump`, and `TX sync: actual dump`. The status line under the buttons shows the same state. Copy the trace lines around the slot press if the sequence stops.
  - **Resolved: the amp was the blocker.** The legacy page's slot 1 download timed out earlier (the amp ACKed the request and sent no dump). After a power cycle, the legacy Actual and slot 1 downloads both work. The amp had stopped answering knobs after the bogus opcode-0 query, so that query most likely left it in a bad state.
  - **Earlier H5 status line (superseded by the trace notes above):** the status line under the buttons shows the same sync states, and `answer ignored` or `Sync failed` shows where a run stopped.
- **BLE activation fixed (offline).** The BLE input path passed raw packets to the frame parser, so the BLE header and timestamp bytes stayed inside each SysEx. The identity reply (17 bytes on the wire) arrived as 18 bytes and was rejected, and multi-packet messages were broken. `createBleSysExInput` in `src/transports/bleTransport.js` now removes the framing and reassembles complete SysEx messages. The legacy page uses the same transport. Runner PASS 107 FAIL 0. Hardware check pending (BLE activation in `dev.html`).
- **Enable writes fixed (offline).** The legacy toggle frames write an effect enable as float `1.0`/`0.0` (type 4); the app wrote the stored bool type (3). `buildParamWriteFrames` now writes bool parameters as float, and `test/unit/paramWrite.test.js` checks the frame against `toggle_effect.txt`. Hardware check pending.
- **UI to amp: root cause and fix (offline).** The app's writes used the dump's `State` ids (`FreqState` 227, `FX2EnableState` 283, `SpkSimTypeState` 294), but the amp reports and accepts controls under the plain symbol names (`Freq` 228, `FX2Enable` 303, `SpkSimType` 263). The amp ACKs every write but ignores the wrong ids. The store is now keyed by the live id (`makeLiveIdOf` in `src/protocol/symbolTable.js`, used by `applyDumpPatch`), so every knob, toggle, and the cabinet write uses the id the amp reports. Effect units also drop their old type's parameters on a type switch. Runner PASS 109 FAIL 0. Hardware check pending: knob, toggle, and speaker changes on the amp.
- **UI to amp next.** Unit type writes (amp model and effect type selection from the UI) are not implemented: `dev.html` only shows a status message. The legacy captures `select_*.txt` hold the frames to port (opcode `0x08`, setGlobalOrType), with golden checks against them. Presets (upload) come after that, in Phase 7.
- **Unit type writes (offline, done).** `buildSelectUnitType` in `src/protocol/builders.js` matches `select_chorus.txt` byte for byte (`test/unit/unitTypeWrite.test.js`). Effect, echo and reverb dropdowns carry `{ value: symbol name, label }` items (`layout.js`); a pick sets the store (`intents.selectUnit`, `setUnitType` shared with device events) and `dev.html` sends the two frames with the id from the symbol table (`makeIdOfName`). The amp model write is not wired yet (the amp list is still placeholder names). Runner PASS 112 FAIL 0. Hardware check pending: effect/echo/reverb pick on the amp; knobs follow once the amp sends the new type's parameters.
- **Dropdown overlap (fixed, offline).** An open menu was painted under the next module's selector, because sibling `.unit-selector` roots share `z-index: 60` and later DOM order wins. An open selector now sits at `z-index: 90`. The menu also no longer repeats the current value as an extra item, since unknown types are added only when their value is not in the list.
- **Amp dropdown and LED (offline, done).** The amp menu has three columns (Classic | Boutique | Modern) with UI labels from `AMP_FAMILIES` in `layout.js`. The values are the device symbol names, checked against the legacy ids in `test/unit/unitTypeWrite.test.js`. A tap on the amp LED steps Classic → Boutique → Modern and writes the model in the same position in the next family (`nextFamilyModel` in `viewModel.js`; `appView.cycleAmpFamily`). Runner PASS 114 FAIL 0. Hardware check pending: model pick and LED step on the amp.
- **Type defaults, labels, menus (offline, done).** Picking an effect, echo or reverb type sets the amp's default knob values in the store (`default` per knob in `layout.js`, the Yamaha amp's values, applied by `defaultsForType` and `setDefaultParam`). They are also sent to the amp after the select frames, because the amp does not apply its defaults by itself: one write per knob, with a 50 ms gap between writes (`DEFAULT_WRITE_GAP_MS` in `dev.html`; the gap was needed on the hardware). Family headers use the LED colours (red, blue, and a darker green `#008800`). The amp header sits above the module rows (`.amp-head` z-index), so the open cabinet menu is no longer painted under the next module. Labels as in `layout.js` (intentional): Boutique `THR10_Flat_B` is "Flat B", Modern `THR10_Flat_V` is "Flat V". Runner PASS 117 FAIL 0. Hardware check pending: the amp's sound changes after a pick; the gap may need tuning.
- **Tremolo not audible after a pick (cause and fix, offline).** The select frames and default writes match the legacy captures (`select_tremolo.txt`; the amp answers with ACKs as it does for chorus). The effect stayed off: the app never sent the enable, and the type switch dropped the enable parameter from the FX2 unit, so the power button was disabled. Now a type switch keeps the enable and mix-type parameters (`setUnitType`), and a pick sends the module's enable ON after the defaults (`intents.selectUnit`, `dev.html` `sendUnitType`). Runner PASS 119 FAIL 0.
- **Default writes went to the wrong unit (fixed, offline).** The mixes (`FX2Mix`, `FX3Mix`, `FX4WetSend`) live on GuitarProc (0x13c; the device reports `GuitarProc.FX2Mix`, the legacy resolves mixes from GuitarProc first), but the defaults were written to the effect unit. Mix knobs now carry `unit: 'GuitarProc'` in `layout.js`; the intent resolves each default's unit and the shell writes to it. Speed, depth, feedback and pre-delay stay on the effect unit (the device reports `FX2.Freq`, `FX2.Depth`, `FX2.Feedback` on 0x10e).
- **Rate parameter per type (fixed, offline, from the sweep capture `chorus_flanger_phaser_tremolo.txt`).** The amp reports the rate as `Freq` (228) for chorus and flanger, and as `Speed` (212) for phaser and tremolo. The layout tried `Freq` first for all four, so the phaser and tremolo defaults went to a parameter the amp does not have, and speed did nothing from the app. Each type now names its rate explicitly in `layout.js`. The sweep also confirms depth (`Depth` 224, for chorus, flanger and tremolo), feedback (`Feedback` 214, chorus and phaser) and mix (`GuitarProc.FX2Mix` 272). `test/unit/effectParams.test.js` checks the layout against the capture. Runner PASS 121 FAIL 0. Not in the sweep, still unverified: chorus pre-delay (`Pre`), the echo and reverb types.
- H5 partly passed: memory slots, knob follow, the `*` marker, and the preset name on the top centre work on hardware. H6 passed (auto-activate).
- **Open runtime gaps (from the H5 knob test):**
  1. LED on/off: fixed. The chorus enable is parameter `0x12f` (303, float `1.0` when on), named `FX2Enable` by the amp and `FX2EnableState` in the dump, and it is matched by name. Replaying that frame in `dev.html` moves the EFFECT power LED from off to on. Hardware check still pending. Amp LED colour follows the family.  2. Amp model: confirmed on hardware (model and speaker follow the switch). This change removes the dump request, since the amp's parameter packets follow the switch; verify that the amp values update without a dump. Replaying `select_modern_amp_crunch.txt` gives `THR30_SR101` and the cabinet `California 1x12`.
  2a. Effect type on the amp: the same `0x03` path applies to FX2 to FX4 and is implemented. Confirmed on hardware for the labels; the parameters follow the knob set below.
  3. Gate threshold: fixed (-96..0 dB on the knob, both directions). Confirmed on hardware.
  4. Per-type effect knobs: done offline. Each effect, echo, and reverb type shows only its knobs (legacy schema lists), right-aligned, the other slots hidden. The knob lists come from the legacy page, because the symbol table does not say which parameters belong to which type. A parameter the store does not know yet is added from its symbol name when the amp sends it. Hardware check pending.
  5. Parameter names, checked per module. A knob now names a list of candidate symbol-table names; the first one found in the unit wins. A test checks that every layout name exists in the symbol table. Evidence: chorus SPEED `Freq` (update_chorus, FX2 228), chorus DEPTH `Depth` (update_chorus), chorus PRE DELAY `Pre` (dump, `PreState`), chorus FEEDBACK `Feedback` (update_chorus, FX2 214). Flanger SPEED `Freq` (update_flanger; was `Speed`, fixed), flanger DEPTH `Depth` (update_flanger). Spring REVERB `Time` (update_spring, FX4 237), TONE `Tone` (update_spring, FX4 246). Mix on all effects `FX2MixState`/`FX3MixState`/`FX4WetSendState` (GuitarProc 272/298; update files and dump). Tape echo TIME/FEEDBACK/BASS/TREBLE from the dump (`TimeState`, `FeedbackState`, `BassState`, `TrebleState`). Plate/room/hall DECAY/PRE DELAY/TONE from the dump (LargePlate1). Phaser, tremolo, digital delay, room, and hall have no capture of their own: their names are candidates (SPEED: Freq, Speed) and need the hardware check. Gate THRESHOLD `Thresh`, DECAY `Decay`, gate enable `GateEnable` (master_knob and update captures). Amp knobs `Drive`, `Bass`, `Mid`, `Treble`, `Master`; comp `Sustain`, `Level` (dump).
  6. Default view: after activation the app requests the Actual dump, so the knobs, the preset name, and the model fill in. Replayed in `dev.html` (flag off): 5 frames sent, then the dump populates the UI (amp THR10C_DC30, MASTER 67, preset Crunch Ico LP). The module titles use the ink colour so they are readable when the module is off.
  - **BLE stops answering during fast knob turns (fixed, offline; hardware check pending).** Three causes, from the spec (`thrii_sysex_bitbucket_ble.md`) and the code: (1) the command counter wrapped at `0x7f`; the spec says a header with `0x7f` followed by a body with `0x00` silences the amp. `nextCommandCounter` now restarts at 3 after `0x7e`. (2) Frames were sent without waiting for each other, so BLE packets of two frames interleaved on the wire. All sends now go through one queue (`transportManager.js`), and BLE frames have a 50 ms gap (`BLE_FRAME_GAP_MS`; USB unchanged). (3) A wheel burst sent one write per step. Knob writes are coalesced by default now (`flags.coalesceWrites: true`, the last value wins; the flag was off until a hardware check, so this is a policy change). A 30-step burst in the mock now gives one write. Effect-mode picks use the spec's pauses (256 ms before the select, 512 ms after). Runner PASS 127 FAIL 0. If the amp still stops, next: 20-byte BLE packets (`BLE_USE_REPORTED_PACKET_SIZE = false`) and a longer `BLE_FRAME_GAP_MS`.
  - **Memory slot switch from the app (offline, done; hardware check pending).** Slots 1 to 5 send the select frame (`buildSelectPreset` in `builders.js`: opcode `0x0e`, words `[0x0e, 4, slot 0..4]`, the same words as the legacy Preset frame; `test/unit/presetSelect.test.js`), then the read: the Actual dump. The slot becomes active when that dump arrives, so the strip shows what the amp loaded (`pendingSlot` in `dev.html`). The read is the Actual dump, as after activation; the slot number is the other option. The legacy frame's length bytes (`0e 0b`) differ from the standard header used here (`00 0b`, as in the dump request). If the amp ignores the switch, compare with the legacy frame first. Runner PASS 123 FAIL 0.

  **Effect parameter map (device names, for the knobs in `layout.js`).** Mix parameters live on GuitarProc; the rest on the effect's own unit. Rows marked "candidate" have no capture yet.

  | Module (unit) | Type (device name) | Knob → device parameter |
  |---|---|---|
  | Effect (FX2) | StereoSquareChorus | SPEED `Freq`, DEPTH `Depth`, PRE DELAY `Pre` (dump), FEEDBACK `Feedback`, MIX `FX2Mix` (GuitarProc) |
  | Effect (FX2) | L6Flanger | SPEED `Freq`, DEPTH `Depth`, MIX `FX2Mix` (GuitarProc) |
  | Effect (FX2) | Phaser | SPEED `Speed`, FEEDBACK `Feedback`, MIX `FX2Mix` (GuitarProc) |
  | Effect (FX2) | BiasTremolo | SPEED `Speed`, DEPTH `Depth`, MIX `FX2Mix` (GuitarProc) |
  | Echo (FX3) | TapeEcho | TIME `Time`, FEEDBACK `Feedback`, BASS `Bass`, TREBLE `Treble`, MIX `FX3Mix` (GuitarProc, candidate) |
  | Echo (FX3) | L6DigitalDelay | as TapeEcho (candidate) |
  | Reverb (FX4) | StandardSpring | REVERB `Time`, TONE `Tone`, MIX `FX4WetSend` (GuitarProc) |
  | Reverb (FX4) | LargePlate1 | DECAY `Decay`, PRE DELAY `Pre Delay`, TONE `Tone`, MIX `FX4WetSend` (GuitarProc) |
  | Reverb (FX4) | SmallRoom1 | DECAY, PRE DELAY, TONE, MIX as plate (candidate) |
  | Reverb (FX4) | ReallyLargeHall | DECAY, PRE DELAY, TONE, MIX as plate (candidate) |

  The defaults per knob are in the same `layout.js` entries (`default`), and the units in `unit`. Verified by captures: the sweep (`chorus_flanger_phaser_tremolo.txt`) for the effects, `update_spring.txt` for the spring.

- **Runtime page wired; pre-Phase-7 audit (offline, done; hardware checklist below).**
  - **Shared composition.** `src/app/boot.js` (`boot(rootEl, { fixture, onStatus, sleep })`) now holds the wiring that was inline in `dev.html`: transports, store, symbol lookups, sync flow, write scheduler, intents, and the mounted runtime. `thrii_ui.html` and `dev.html` both call it. This file was planned for Phase 9; Phase 9 step 5 now only adds `main.js` and the service-worker registration.
  - **CONNECT button** (top strip, `memoryView.js`). One press connects (BLE first; USB if BLE is cancelled or unavailable), runs the activation, and requests the Actual dump. While connected the button shows the firmware version from the identity reply (`formatFirmwareVersion` in `identity.js`: bytes `61 00 2c 01` read `1.44.0.a`) and a second press disconnects. Connection status reaches the view through the mount handle's `setConnection`; the state shape is unchanged.
  - **Flags.** `autoActivate` (H6 passed) and `slotSync` (H5 passed for the memory slots) are on by default, so `thrii_ui.html` follows an amp-side slot press. All three flags are on now.
  - **Write ordering.** `scheduler.flushAll()` runs before the slot select, the unit-type select, the activation, and the dump request that follows the activation (the Phase 4 ordering rule was not wired before).
  - **Slot read-back.** `pendingSlot` is cleared when the read-back fails, so a later dump cannot mark the wrong slot active.
  - **Stale slot state over BLE (your finding, fixed offline).** Symptom: a slot picked in the app left the UI partly updated with no slot highlighted; a later slot press on the amp then highlighted the wrong slot. Cause, from the code: the read-back dump never completed, and `syncFlow` had no timeout for `requestDump`, so it stayed in `awaitingDump` and ignored later requests, while `pendingSlot` kept the app's slot and the next completed dump (the one after the amp's press) marked it active. Why that dump did not complete is not known (a lost BLE packet is the likely cause). Now: a dump that does not complete within 8 s is requested once more, then reported, and the flow returns to idle; a request during a running dump drops that dump and reads a new one; `pendingSlot` is also dropped when the amp reports a slot of its own and on disconnect, and a disconnect cancels a running dump. Timers come from `src/core/clock.js` (shared with the write scheduler).
  - **Lost link.** `transportManager.js` emits `transport:status` `{ connected: false, kind }` on `gattserverdisconnected` (BLE) and when the MIDI port in use reports `disconnected` (USB cable pulled, `statechange`); `boot.js` then ends the session and the button returns to CONNECT.
  - **Preset menu.** It was painted under the amp card: `.amp-head` (z-index 95) and `.top-strip` (was 50) share a stacking context. `.top-strip` is now 100; a runner test checks the topmost element at a menu item.
  - **Tests.** `test/unit/boot.test.js` presses CONNECT against a fake MIDI port that replays `activation_req_resp.txt` and `actual_dump.txt`: four activation frames, then the dump request; button `FW 1.44.0.a`; MASTER 67; preset `Crunch Ico LP`. Runner PASS 131 FAIL 0.
  - **Known, not done:** USB takes the first MIDI port without checking that it is a THR; errors on `thrii_ui.html` show only as the button's tooltip and in the console; a disconnect keeps the last values on screen.
  - **Echo TAP (offline, done; hardware check pending).** Captures `tap_tempo_60_(100).txt`, `tap_tempo_120_(50).txt`, `tap_tempo_240_(25).txt` (the amp's TAP button, tapped by hand): each tap gives a status frame (opcode `06`, already ignored) and a parameter change for `FX3.Time` (unit 273, id 237). The values sit around 1.0 at 60 BPM, 0.5 at 120 BPM and 0.25 at 240 BPM, so `Time = interval / 1000 ms`, capped at 1; the same for Tape Echo and Digital Delay (your observation in the app: 100, 50, 25). The TAP badge is now a button (`moduleView.js`, timed on pointerdown). `src/ui/runtime/tapTempo.js` averages the intervals of the last four taps (a pause over 2 s starts a new run); from the second tap on, `appView.tapTempo` writes the value through `intents.setParam`, the same path as the TIME knob (store commit, coalesced write, `*` marker). The mapping is `tap: { param: 'Time', fullScaleMs: 1000 }` on the echo module in `layout.js`. `test/unit/tapTempo.test.js` checks the timer, the mapping against the three captures, and the button.
  - **Hardware checklist before Phase 7 (`thrii_ui.html`, you).** It replaces the scattered "hardware check pending" notes above.
    1. CONNECT over BLE and over USB: the UI fills and the button shows the firmware version.
    2. Open PRESETS: the whole menu is visible over the amp card.
    3. Turn a knob, toggle each module, pick an effect, echo and reverb type, pick an amp model, tap the amp LED: the amp follows.
    4. Press memory 1 to 5 on the amp and in the app: the knobs and the slot highlight follow both ways.
    5. Sweep a knob fast over BLE, then switch a slot at once: the amp keeps answering and ends on the slot's values.
    6. Switch the amp off while connected over BLE, and pull the cable while connected over USB: the button returns to CONNECT.
    7. Echo on: tap TAP in the app at a steady tempo; the TIME knob follows and the amp's echo repeats at the tapped tempo, on Tape Echo and on Digital Delay.

  ---

### Phase 7: Preset domain

**Status:** planned in detail, waiting for your review. No code yet. Decisions P10 to P17 below need your answer before the step that uses them.

**Read first:** architecture.md (Import preset, Export preset), state-model-shadow-sync (import normalization), protocol-parser-master (dump and upload sections), `SYSEX_PROTOCOL_THR30II.pdf` in [martinzw/THRII-direct-USB-pedalboard](https://github.com/martinzw/THRII-direct-USB-pedalboard) ("Patch dump from PC to THRII / Upload patch").

#### 7.0 Readiness check (2026-11-12)

Ready:

- Runtime page connects, activates, reads the Actual settings, and follows the amp (knobs, types, slots). Runner PASS 139 FAIL 0; all work is committed.
- The building blocks Phase 7 needs already exist and are tested: unit-type select with its pauses (`buildSelectUnitType`, `sendUnitType` in `boot.js`), parameter writes (`buildParamWriteFrames`), dump request for Actual and slots 1 to 5 (`buildRequestUserSettingsDump`, golden), upload frames (`buildUploadUserSettingsFrames`, golden `uploadFrames_slot2`), dump assembly and parsing, slot select (`buildSelectPreset`), write ordering (`flushAll`), dump timeout and retry.
- On the legacy page, H0 passed for "dump slots 1 to 5" and "upload to a slot and read it back" (USB).

Open, to confirm before or during Phase 7 (none blocks 7A and 7B):

| Item | Needed before |
|---|---|
| Results of the pre-Phase-7 hardware checklist (items 1 to 7 above); you reported BLE works functionally | 7C |
| BLE "No identity reply" from 2026-11-10: confirm it no longer occurs | 7C on BLE |
| Stale slot state over BLE: fixed offline, still being watched | 7C on BLE |
| Echo type after an ECHO/REV knob sweep (reconnect and read the type) | not blocking |
| BLE packets larger than 20 bytes (`BLE_USE_REPORTED_PACKET_SIZE`), never verified; uploads are the first long frames | 7E on BLE |
| Errors on `thrii_ui.html` are only a tooltip and console text | 7B (status line, step 7B.3) |

#### 7.1 Low-risk rules for this phase

1. **The amp's Actual settings are the truth.** Import and UI edits both change the amp live, through the write paths already proven on hardware. "Save to slot" copies the amp's own Actual dump into the slot. The app does not build patch bytes of its own (the only exception is the name, step 7F, behind its own gate).
2. **Nothing is sent unless the whole input is valid.** An import with an unknown amp, effect, or parameter name is refused before the first frame.
3. **Every slot write is verified and reversible.** Before a slot is overwritten its current content is read and kept; after the write the slot is read back and compared byte for byte.
4. **One long operation at a time.** Import, save, backup and restore set a busy state: controls are disabled, pending knob writes are flushed first, and slot-press syncs wait until the operation ends.
5. **Pure functions with goldens.** Preset parsing, the apply plan, export, and the name rewrite are pure and tested against the fixtures. No golden is edited.
6. **The legacy page is not touched.** (The earlier plan bridged the legacy buttons to the new modules; that is dropped, since `thrii_ctrl.html` is a frozen reference.)

#### 7.2 What Phase 7 covers

| Menu item | Step | Device risk |
|---|---|---|
| Export | 7B | none (reads the store) |
| Import | 7C | live writes to Actual (same frames as UI edits) |
| Backup THR | 7D | none (reads slots 1 to 5) |
| Save to THR slot 1 to 5 | 7E | overwrites one user memory |
| Preset name (label in the top strip) | 7F | changes patch bytes (name only) |
| Restore THR | 7G | overwrites all five user memories |
| Import AI | Phase 8 | as Import |
| Import Factory | not defined yet (P14) | n/a |

Not in Phase 7: building a whole patch from scratch and uploading it to Actual (a faster import; possible later behind a flag once 7C to 7F are proven), the tempo parameter write (no known frame; it is kept in files only), tuner and global volumes.

#### 7.3 Steps

**7A. Preset model (pure, offline)**

1. `[AGENT]` `src/domain/presetModel.js`:
   - `parseThrl6Preset(json)`: the legacy `parseImportedThrl6Preset` without logging; returns `{ presetName, tone }` or throws with a readable reason.
   - `presetToPlan(preset, { idOfName })`: turns the tone into an ordered apply plan: per module `{ unit, typeName, enabled, params: [{ unit, name, value, typeCode }] }`. The group mapping is one table taken from the legacy `applyImportedToneToShadow`: `THRGroupAmp` to Amp; `THRGroupCab.SpkSimType` to GuitarProc (enum); `@enabled` to `FXnEnable` / `GateEnable` on GuitarProc; `@wetDry` to `FX2Mix`, `FX3Mix`, `FX4WetSend` on GuitarProc; other numbers to the module's own unit by symbol name. Every name must resolve in the symbol table and every type must be a known option, otherwise the plan is refused with the list of unknown names.
   - `storeToPreset(state, presetName)`: the export, reading the store only (no DOM, no dump cache).
2. `[AGENT]` `test/unit/preset.test.js`: `parseThrl6Preset` of `doc/01. EarlyVH.thrl6p` equals `preset.normalized.golden.json`; the plan for it resolves every name and matches the knob names in `layout.js`; an unknown asset or parameter is refused; round trip per P9/P10.

**Done when:** runner passes; grep finds no `document.` and no protocol or transport import in `src/domain`.

**7B. Export, menu wiring, status line**

1. `[AGENT]` Runtime UI: the PRESETS menu calls a new intent `presetAction(name)`; the label input commits the name (`intents.setPresetName`, store `presetName`, source `ui`). Items that are not available are disabled (not connected, no data, or not implemented).
2. `[AGENT]` `src/app/files.js`: `pickFile(accept)` and `downloadFile(name, text)` (browser file APIs live in the shell layer, not in `src/ui/runtime` and not in `src/domain`).
3. `[AGENT]` A one-line status area in the runtime (via the mount handle, like `setConnection`): operation progress, result, and errors. It also shows the connection and write errors that are console-only today. No raw bytes.
4. `[AGENT]` Export: `storeToPreset(store.getState(), presetName)` to a `.thrl6p` download named after the preset.

**Human gate H7a:** connect, recall a memory, Export; compare the file with what the amp shows. Import the exported file in THR Remote if you have it (P10 decides whether the old export differences count).

**7C. Import (applies to the amp)**

1. `[AGENT]` Flow in `boot.js` (or `src/app/presetFlow.js` if it grows): pick file, `parseThrl6Preset`, `presetToPlan` (refuse on any unknown name), set busy, `flushAll`.
2. `[AGENT]` Commit the whole preset to the store with source `import` (types, values, enables, `presetName`, `activeSlot = null`, `modified = true`), so the UI shows it at once. Commits with source `import` schedule no writes (same guard as `device`; add the test).
3. `[AGENT]` Send the plan in a fixed order with the existing pacing: amp model, cabinet, amp knobs, compressor, gate, then effect, echo, reverb (each: type select with its 256 ms / 512 ms pauses, its values 50 ms apart, then its on/off state). This reuses `sendUnitType` and `buildParamWriteFrames`; `sendUnitType` is extended to send the enable as on or off (today it only sends on). Expected duration about 5 to 8 s; the status line shows progress.
4. `[AGENT]` Verify: request the Actual dump and compare it with the plan (types equal, values within float tolerance). Result in the status line: "Imported <name>" or the list of differences. The dump is the amp's own name and clears `modified`, so the flow then restores the imported name and `modified = true` (the Actual settings differ from every slot until saved).
5. `[AGENT]` Tests: a boot-level test with the fake amp checks the frame order for EarlyVH (labels and counts), the busy state, the refusal path (nothing sent), and the verify step against a replayed dump. `dev.html?source=mock` imports into the store only.

**Human gate H7b (USB, then BLE):** import `doc/01. EarlyVH.thrl6p`; the amp plays the preset and the status says imported; turn a knob afterwards (still in sync); import a second preset with other effect types; pull the cable mid-import once (the app reports it and recovers after reconnect).

**Stop if:** the amp hard-stops during an import (then lengthen the pauses before anything else); the verify step reports differences that are not explained by a known name mapping.

**7D. Backup THR (read-only)**

1. `[AGENT]` `syncFlow` gets a promise-based read for any target: `readDump(target)` returns the raw patch bytes (Actual or slot 0 to 4), with the existing timeout and retry. The Actual sync uses the same path. Golden: the request frames already in `builders.golden.json`.
2. `[HUMAN]` capture `dump_slot.txt`: one slot download on `dev.html`, to confirm the slot dump has the same framing as the Actual dump.
3. `[AGENT]` Backup: read slots 1 to 5, write one JSON file: format version, firmware, device identity, and per slot the name and the raw patch (base64). Test: the file round-trips to identical bytes.

**Human gate H7c:** Backup THR over USB; the file lists your five memory names. Keep this file: it is the safety net for 7E to 7G.

**7E. Save to THR slot 1 to 5**

Works the same after an import or after UI edits, because it copies what the amp currently plays.

1. `[HUMAN]` capture `upload_slot.txt` on the legacy page (USB): upload to one slot, including the amp's replies. It is the reference for the reply the new code waits for.
2. `[AGENT]` Flow: confirm ("Overwrite memory N?"), set busy, `flushAll`, then:
   1. read the Actual dump (raw);
   2. read slot N (raw) and keep it for undo;
   3. upload the Actual patch to slot N with `buildUploadUserSettingsFrames` (frames awaited one by one, legacy pacing), and wait for the amp's reply seen in the capture;
   4. read slot N back and compare with the uploaded bytes;
   5. select slot N with the existing slot-select flow, so the slot is highlighted and `modified` is cleared by the amp's own data.
   On a mismatch or timeout: report it and offer "Restore previous memory N" (uploads the kept bytes, with the same verify).
3. `[AGENT]` Tests: frame sequence against the capture; the compare step; the undo path; a save while not connected is refused.

**Human gate H7d (USB first):** after H7c, save to one slot; power-cycle the amp; recall the slot and compare by ear and in the app. Then the same over BLE; if the amp rejects it, set `BLE_USE_REPORTED_PACKET_SIZE = false` and repeat.

**Stop if:** the capture and the builder output differ; a read-back differs from the uploaded bytes.

**7F. Preset name**

Without this step a saved slot keeps the name the amp's Actual settings had (the last recalled memory), not the imported or typed name.

1. `[HUMAN]` capture two slot dumps whose names have different lengths (the 7D backup file may already provide them).
2. `[AGENT]` `withPatchName(patchRaw, name)` in `src/protocol/dumpParser.js` (pure): replaces the name string after the `PSRP` marker and updates the length fields that depend on it. Tests: renaming to the same name gives identical bytes; renaming dump A to B's name reproduces B's name section; `parsePatchName` reads the new name back.
3. `[AGENT]` Save (7E) applies the name from the label before the upload; the read-back compare then uses the renamed bytes.

**Human gate H7e:** import a preset, save it to a slot, power-cycle, recall: the name on reconnect is the preset's name.

**Stop if:** the two dumps differ in bytes outside the name that the name length does not explain. Fallback (your decision): keep the existing name length (pad or cut), which changes no structure.

**7G. Restore THR**

1. `[AGENT]` Pick a backup file; refuse it if the format, device identity, or firmware differ (firmware mismatch: P16); confirm; take an automatic backup first; then for each slot the 7E upload with read-back verify. Stops at the first failure and reports which slots were written.

**Human gate H7f:** change one memory, Restore THR from the H7c file, recall all five and compare.

#### 7.4 Files

| Creates | Modifies |
|---|---|
| `src/domain/presetModel.js`, `src/app/files.js`, `src/app/presetFlow.js` (if `boot.js` grows too large), `test/unit/preset.test.js`, `test/unit/presetFlow.test.js`, captures `dump_slot.txt`, `upload_slot.txt` | `src/app/boot.js`, `src/protocol/syncFlow.js` (`readDump`), `src/protocol/dumpParser.js` (`withPatchName`), `src/ui/runtime` (`intents.js`, `memoryView.js`, `appView.js`, `mount.js`, `layout.js`, `runtime.css`), `test/runner.html` |

Not created (changed from the earlier plan): `src/domain/thriiModel.js` and `presetImportExport.js` (one small model file is enough; file access moved to `src/app/files.js`). Must not touch: `thrii_ctrl.html`, goldens, `doc/`.

#### 7.5 Decisions for you (P10 to P17)

| # | Question | Recommendation |
|---|---|---|
| P10 | P9 follow-up: the legacy export was lossy (enables flipped, wet/dry changed). The new export reads the store, where enables and mixes are resolved from GuitarProc. Target: export after importing EarlyVH equals the import (except name and tempo)? | Yes; make it the 7A round-trip test. |
| P11 | Import mechanism: live writes (7C, proven frames, 5 to 8 s) or one upload to Actual (fast, but needs app-built patch bytes and an unverified target). | Live writes now; the upload variant later behind a flag. |
| P12 | Save mechanism: copy the amp's Actual dump to the slot (7E). | Yes. |
| P13 | After a save, select the slot on the amp so it becomes the active memory (short audio gap possible), or only mark it in the app. | Select it: the slot state stays device-driven. |
| P14 | "Import AI" and "Import Factory" in the menu: what should they do, and where do the presets come from? | Keep them disabled in Phase 7 until defined. |
| P15 | Name rules: maximum length and allowed characters. | ASCII, cut at the longest name length seen in THR Remote (tell me the limit if you know it; otherwise 7F uses the capture). |
| P16 | Restore from a backup taken on another firmware. | Refuse, with the reason shown. |
| P17 | Confirmation before overwriting a memory (7E) and before Restore (7G). | Yes for both. |

#### 7.6 Done when

Runner passes with the new tests; the three import gates hold; H7a to H7f pass on USB and BLE; a slot written by the app survives a power cycle with the right name; no golden was edited.

---

### Phase 8: Import AI (presets generated by amplifier-presets.com)

**Status:** implemented offline (8A to 8C, 2026-11-14), see the outcomes in 8.4. Open: the first real generation (8C step 6, on your go-ahead) and the hardware gates H8a to H8d. P18 to P24 are answered (8.6). This phase replaces the cancelled "Full debug observer".

**Read first:** `ai_presets_example/` (`CLAUDE.md`, `simple/server.py`, `simple/index.html`), Phase 7 outcome (7.7, import and quick import), mobile-runtime-ui, architecture-guardrails, pwa-release-discipline.

#### 8.0 What it does

> **Superseded in part (2026-11-16):** the pop-up, its placement and the PRESETS menu item described below were replaced by an AI button in the top strip and a screen in place of the knob area, and the request gained the pickup field. See `plan_ui.md` (sections 4, 5 and 9). The rules of 8.1 and the `{ host, importText, ampModel }` contract still hold; `host` is now the page element.

PRESETS → **Import AI** opens a panel over the runtime UI. The user describes a sound, presses Generate, and waits (10 s to a minute or more). The backend returns a preset; the app fetches its `.thrl6p` export and hands that text to **the same import as the Import menu item**. The knobs behind the panel then show the preset, and with an amp connected the amp plays it. The panel shows the preset's name and the backend's playing tip. It works with or without an amp. The panel carries the credit: "Presets generated by amplifier-presets.com", linked.

Starting point (checked):

- The API contract is in `ai_presets_example/CLAUDE.md` (`GET /amplifiers`, `POST /presets/generate`, `GET /presets/{id}/export`). It is undocumented and can change without notice.
- The browser cannot call `api.amplifier-presets.com` directly (CORS allowlist). `ai_presets_example/simple/server.py` is a local Python server that serves a page and forwards `/api/*` to the backend; its page differs from the Worker example only in the API address (`/api`). This phase uses that approach (P18).
- Two files that look like the backend's exports are in `doc/` (`walsh-hotel-solo.thrl6p`, `neo-classical-fury.thrl6p`). Read offline: the group and asset names are ones the app knows (`THR10_Lead`, `THR10_Brit`, `L6DigitalDelay`, `LargePlate1`, `PreDelay`); they differ from THR Remote files in key order, `device_version` (16777216), a tempo of 913 (the plan clamps it to 300 and never sends it) and a gate threshold of -97 (below the knob's -96). Not checked yet: that `presetToPlan` accepts both files (step 8A.2).
- `importPreset` in `src/app/presetFlow.js` picks the file and imports it in one function; the import half has to be callable with a text (step 8A.1).
- The menu item exists, disabled (`layout.js`, value `importAi`).
- The connected amp is known by its identity reply (family `0x24`, model `0x01` for the THR10II Wireless this app was built on). The model codes of the other THR-II amps are not confirmed by a capture.

#### 8.1 Rules for this phase

1. **Plug-in, not a layer.** The feature is one folder, `src/ai/`. It imports nothing from the rest of `src/`, and nothing in `src/` imports it. Only the shells (`thrii_ui.html`, `dev.html`, later `index.html`) import it and pass it to `boot`. Removing the feature is: delete the folder and one import per shell. New standing gate **G-ai** checks both directions.
2. **One narrow contract.** The plug-in receives `{ host, importText, ampModel }` and nothing else: `host` is the element it draws its panel in; `importText(text)` resolves to `{ ok, message }` when the import ends; `ampModel()` gives the connected amp's model code (a number) or `null`. It never sees the store, the transports, the symbol table or a frame, and it never sets a knob. Everything device-related stays in `presetFlow.js`.
3. **Absent means invisible.** Without the plug-in the Import AI item is not in the menu, and the rest of the app behaves exactly as today.
4. **A failure stays inside the panel.** Proxy not running, backend down, a 4xx/5xx, an empty export, or a preset the app refuses: the panel shows the reason, the store and the amp are untouched, and the user can retry or close. Nothing is sent to the amp unless the whole preset is valid (rule 2 of 7.1 applies unchanged).
5. **No new wire behaviour.** The upload is the Phase 7 import, byte for byte. No flag in `src/core/flags.js` is needed: the feature is switched by its presence.
6. **The backend is not ours.** Its authors pay for the AI usage, and this is for personal use until they have been asked (P19). One generate request per press of Generate; no automatic retry, no background or batch generation. No fonts, images, styles or code from amplifier-presets.com. API strings reach the DOM through `textContent` only.
7. **Runtime UI rules hold.** Portrait first (390x844), no diagnostics in the panel (raw error bodies go to the console and the dev trace, a readable line goes to the panel).

#### 8.2 Design

```
PRESETS menu → intents.presetAction('importAi') → boot → presetSources.importAi({ host, importText, ampModel })
                                                                │                         │
                                             src/ai (panel, API client)        presetFlow.importText(text)
                                                                │                         │
                                      /api (local proxy) → api.amplifier-presets.com      see "How the knobs get the preset"
```

**How the knobs get the preset (the panel does not set them).** The panel's only output is the `.thrl6p` text. From there the path is the one every preset takes:

1. `importText` parses the text (`parseThrl6Preset`) and turns it into an apply plan (`presetToPlan`). An unknown amp, effect or parameter name refuses the whole preset here; nothing has changed yet.
2. *No amp:* the plan is committed to the shadow store (`applyPresetPlan`, source `import`).
   *With an amp:* the plan is uploaded to the amp's Actual settings (quick import; value by value as the fallback), then the amp's Actual settings are read back and that dump is committed to the store (source `dump`) and compared with the plan. So the knobs show what the amp reports, not what the backend sent; a difference is listed in the panel.
3. The store notifies its listeners; `selectRuntimeModel` builds the view model; the knob, type, LED and name views update in place, behind the panel.
4. Commits with source `import` or `dump` schedule no writes (the existing echo guard), so the preset is not sent a second time.

After that the preset is ordinary current settings: the label shows its name, the settings count as modified, no memory is highlighted, and knob edits, Export and Save to a slot work as after a file import.

**Parts**

- **`boot` option `presetSources`** (default `{}`): a map from a menu action to a function `open({ host, importText, ampModel })`. `boot` keeps a menu item with a `source: true` mark in `layout.js` only when its action has a source; it builds the layout it passes to `mountRuntime` (which already takes `layout`). The same hook serves a later Import Factory.
- **Panel placement.** A pop-up inside `.thr-app`: a dimmed backdrop over the whole app area (absolute, above the top strip's z-index 100 and below the status toast's 200) and on it a card as high as its content, with a margin on every side, so it fits the 390 px frame on `dev.html` and a phone screen alike. A press on the backdrop hides the pop-up, like CLOSE and the Escape key. The mount handle gets `overlayHost` (the `.thr-app` element); the plug-in appends one root element and removes it when hidden.
- **Style.** `src/ai/aiPresets.css`, loaded by the module itself (a `<link>` resolved from `import.meta.url`), so a shell needs one import line. It uses the runtime's variables (`--paper`, `--ink`, `--gold`, `--line`, `--muted`, the UI font) with fallbacks, and the look of the existing strips and dropdowns: gold header strip, paper body, ink text. Inputs inside it re-enable text selection (`.thr-app` switches it off).
- **API client** (`src/ai/api.js`): `listAmps()`, `generate({ prompt, guitar, amplifierId, signal })` and `exportPreset(id)`, with `describeError` from the example (zod issue lists). `fetch` is injectable for tests.
- **Always the "I use the THR Remote app" request.** Every generate request carries `presetType: 'SOFTWARE'` (the example's checkbox, ticked). With the other value (`PHYSICAL`) the backend answers only with values for the knobs on the amp itself and there is no complete preset to download, so the app would have nothing to load. The pop-up therefore has no such checkbox; the value is fixed in `api.js` and a test checks the request body.
- **Amp list (P21).** Loaded with `GET /amplifiers` each time the panel opens, kept to the models with a preset export (`hasSoftwareExportHandler`: the THR-II amps). There is no built-in fallback list: without the backend's list there is nothing to generate with. Pre-selected, in this order: the model matching `ampModel()` (table in `config.js`; only `0x01` → `yamaha-thr-10-ii` is confirmed, further codes are added when seen on hardware), the last model picked, the first in the list. The user can always change it. That first call is also the reachability check: if it fails, the panel says the generator cannot be reached and how to start the proxy, and Generate stays off.
- **Configuration** (`src/ai/config.js`): `API_BASE = '/api'` (same origin, served by the local proxy) and the model-code table. Moving to a hosted proxy later, or to the backend itself if its authors allow our origin, is a change of this one value.
- **Local proxy** (`scripts/serve.py`, from `ai_presets_example/simple/server.py`): serves the repository root on port 8080 and forwards `/api/*` to the backend; bound to `127.0.0.1`. It replaces `python -m http.server 8080` when the AI feature is wanted; with the plain server everything else works and the panel reports the generator as not reachable.
- **Local data** (`localStorage`, read and written only in `src/ai`): the session id the backend expects, the last guitar, prompt and amp model, and the list of earlier results (at most `HISTORY_MAX = 5`, newest first; per entry the name, the tip, the sound text and the `.thrl6p` text). These are form drafts and generated files, not device state.
- **Earlier results (basic).** Every generated preset that the app accepted is put at the top of the list; the oldest drops out. A press on an entry loads its stored `.thrl6p` text through `importText` again (no call to the backend), shows its name and tip as the result, and puts its sound text back into the request. Results with the same name are separate entries (refining one target tone gives the same name again): an entry is identified by its own id, never by its name, and it shows the name, the time it was generated and the start of its sound text, so equal names can be told apart. No rename, delete or reorder in this phase.

#### 8.3 Way of operation

The pop-up is one card with four parts, top to bottom; it does not switch pages. The main UI stays visible, dimmed, around it.

```
┌ IMPORT AI ─────────────────── CLOSE ┐   gold strip
│ Amp     [ Yamaha THR10II        ▼ ] │
│ Guitar  [ Fender Stratocaster     ] │   request: always there, always editable,
│ Sound   [ Joe Walsh, Hotel        ] │   filled with the last entries
│         [ California solo         ] │
│ [ GENERATE ]                        │   GENERATING 14 s  [ CANCEL ] while it runs
├─────────────────────────────────────┤
│ WALSH HOTEL SOLO                    │   result: the preset loaded last from here
│ Loaded and sent to the amp          │   (or "Loaded; amp not connected", or the reason it was refused)
│ Tip: roll the guitar's tone back …  │
├─────────────────────────────────────┤
│ EARLIER                             │   earlier results, newest first (at most 5);
│ Walsh Hotel Solo  21:04  Joe Wal… │   a press loads that preset again; time and
│ Walsh Hotel Solo  20:58  Hotel C… │   sound text tell equal names apart
│ Clean Funk        20:41  Nile Ro… │
├─────────────────────────────────────┤
│ Presets by amplifier-presets.com    │   credit: part of the card in every state
└─────────────────────────────────────┘
```

The result and the earlier list are left out while they are empty, so the first pop-up is the request and the credit only. The credit line (linked) is part of the card itself, not of the result: it is there before the first request, during a generation, with a result and with an error.

1. **Open.** PRESETS → Import AI. The request part holds the last guitar and sound text; the amp list is pre-selected. If presets were generated before, the last one loaded from here is the result and the others are under EARLIER.
2. **Generate.** The request is sent; the button becomes the elapsed time with Cancel. The amp keeps playing its current sound. While a generation runs the pop-up stays: a press outside it, CLOSE and Escape do nothing, so a wait of up to a minute is not lost by a stray press. Cancel abandons the request and changes nothing.
3. **Result.** The preset is loaded at once (P20), without asking: the knobs behind the pop-up change and the amp, if connected, plays it. The pop-up does **not** hide by itself, because the tip has to be read and the next step is the user's choice. The status toast shows the import's progress and result above the pop-up, as for a file import. The preset joins the list of earlier results.
4. **Listen and decide.** The guitar is in the user's hands and the amp already plays the preset, so the first judgement needs no navigation. Then one of:
   - **Refine:** change the sound text (it is still there, above the result) and press Generate again. The backend does not use the earlier request as context (your information), so this is a new generation from the changed text alone; put everything that matters into the text. It replaces the current settings; the previous result stays under EARLIER.
   - **Go back to an earlier result:** press its name under EARLIER. It is loaded like a new result (app and amp), without a call to the backend, and its sound text returns to the request for further refining.
   - **To the controls:** press outside the pop-up (or CLOSE, or Escape). It goes away and the main UI is in front, with the preset's name in the label. Turn knobs, switch effects, Export, or Save to a THR slot, all as usual.
   - **Come back:** PRESETS → Import AI opens the pop-up as it was left: same text, same name and tip, same list. The tip stays readable this way after the knobs were adjusted. The result part describes what was loaded from here last, not the current knob positions.
5. **What is kept.** Hiding the pop-up removes it from the page. The earlier results hold the presets as generated; knob changes made afterwards are not in them. Those live only as the current settings until they are exported or saved to a slot (as with any unsaved edit).

Edge cases: a second press on Generate while one runs does nothing; a lost amp connection during the wait means the result is loaded into the app only, and the pop-up says so; a refused preset (unknown names) leaves the knobs and the amp as they were, shows the names, and is not added to the earlier results; while an import itself runs (about a second with an amp) the pop-up takes no input.

#### 8.4 Steps

**8A. Import seam (refactor, no behaviour change)**

1. `[AGENT]` `src/app/presetFlow.js`: split `importPreset` into the file pick and `importText(text)` (parse, plan, store or amp, notify). `importText` returns `{ ok, message }`; the Import item keeps its behaviour and its messages. `createPresetFlow` exposes `importText` beside `run`.
2. `[AGENT]` `test/unit/preset.test.js`: `presetToPlan` accepts `doc/walsh-hotel-solo.thrl6p` and `doc/neo-classical-fury.thrl6p` (every name resolves, the tempo is local and clamped). If one is refused, **stop** and report the names.
3. `[AGENT]` `test/unit/presetFlow.test.js`: `importText` with the fake amp gives the same frames as the file import of the same text; a refused text sends nothing and returns `ok: false`.

**Done when:** runner passes; no golden changed; the frames of the existing import tests are unchanged.

**Outcome 8A (2026-11-14, offline).** `createPresetFlow` now returns `{ run, importText }`; the file pick and the import are separate functions in `presetFlow.js`, and `boot` returns `importText` in its handle (the tests use it; 8B gives it to the preset sources). The Import item sends the same frames and shows the same messages. Both generated samples are accepted with the types the menus offer (tempo 913 becomes 300, kept locally; the gate threshold -97 is taken as it is). Three new tests: the samples' plans, `importText` without an amp for both samples, `importText` with the fake amp (same frames as the file import; a refused text and a text that is not JSON send nothing). Runner PASS 167 FAIL 0 (headless Chrome, fresh profile). Not checked on hardware; no hardware behaviour was changed.

**8B. Plug-in hook in the composition**

1. `[AGENT]` `layout.js`: Import AI and Import Factory lose `disabled` and get `source: true`. `boot.js`: option `presetSources`; the layout given to `mountRuntime` drops source items without a source; a source action calls `open({ host: runtime.overlayHost, importText, ampModel })` instead of `runPresetAction`; `ampModel` reads the device identity. `mount.js`: `overlayHost`.
2. `[AGENT]` `test/unit/boot.test.js`: without sources the menu has no Import AI and no Import Factory item; with a fake source the item is there, a pick calls it once with a host inside the app, the text it passes to `importText` lands in the store, and `ampModel()` is `null` before a connect and `1` after the replayed activation.

**Done when:** runner passes; `thrii_ui.html` and `dev.html` behave as before except that the two unimplemented menu items are gone; G-ui-boundary and G-debug hold.

**8C. The plug-in (`src/ai/`) and the proxy**

1. `[AGENT]` `scripts/serve.py` (see 8.2). Check: the pages and the runner load from it as from `python -m http.server`; `GET /api/amplifiers` returns the list.
2. `[AGENT]` `config.js`, `api.js`, `aiPresets.js` (exports `aiPresetSource`, the `open` function), `aiPresets.css`.
3. `[AGENT]` `test/unit/aiPresets.test.js` with a fake `fetch` and a fake `importText`: the generate request body; the export call follows with the returned id and its text reaches `importText` once; the pop-up stays open after a result and shows name, tip and the import message; a press on the backdrop hides it, but not while a generation runs; a reopened pop-up shows the last text, result and earlier list; the credit link is present in every state (empty, generating, result, error); an accepted result is added to the earlier list, a sixth one drops the oldest, two results with the same name are two entries with different time or sound text and each loads its own stored text, and a press on an entry calls `importText` with its stored text and no `fetch`; the amp list pre-selects by `ampModel()`, then the last pick, then the first; a failed list call turns Generate off; a 422 becomes the readable issue list; a network failure, an empty export and Cancel each leave `importText` uncalled; a second press while one request runs sends nothing; API strings are set as text (a name with markup stays text).
4. `[AGENT]` Shells: `thrii_ui.html` and `dev.html` import `aiPresetSource` and pass `presetSources: { importAi: aiPresetSource }`. `dev.html?source=mock` imports into the store only.
5. `[AGENT]` T2: pop-up screenshots at 390x844 (request only, generating, result with earlier list, error, generator not reachable) on `dev.html?source=mock` with the API answered by a fixed response (no call to the backend); zero console errors.
6. `[AGENT]` One real generation through `scripts/serve.py` without an amp, only with your go-ahead at that point (it uses the authors' backend): the knobs fill, name and tip show.

**Outcome 8B and 8C (2026-11-14, offline; steps 1 to 5 done, step 6 and the hardware gates open).**

- **Hook (8B).** `boot` takes `presetSources`; a menu item marked `source` in `layout.js` is offered only with a source for its action, so Import Factory is no longer in the menu and Import AI is there only with the plug-in. A pick calls the source with `{ host, importText, ampModel }`; `host` is the app frame (`overlayHost` of the mount handle).
- **Plug-in (8C).** `src/ai/config.js` (proxy address `/api`, model-code table, list length, credit), `api.js` (three calls; `presetType: 'SOFTWARE'` fixed), `aiPresets.js` (the pop-up, exported as `aiPresetSource`; `createAiPresetSource` takes a replaceable API, storage, clock and id maker for tests), `aiPresets.css`. Both shells pass `presetSources: { importAi: aiPresetSource }`.
- **Behaviour as in 8.3**, with these details: the guitar and the sound text are both required before a request goes out; the result line is the import's own message ("Imported <name>", "... (amp not connected)", or the differences); Generate, the earlier entries and dismissing are off while a generation or an import runs; where the browser blocks storage the drafts and earlier results last until a reload.
- **Server.** `scripts/serve.py` serves the repository on port 8080 (this machine only) with the `/api` proxy, and sends `Cache-Control: no-store`, so edited modules are not served stale. One real call was made through it: `GET /api/amplifiers` returned the list; the three THR-II models have a preset export.
- **Tests.** `test/unit/aiPresets.test.js` (6 tests, fake `fetch`, no backend) and one more in `boot.test.js`. Runner PASS 174 FAIL 0 (headless Chrome, fresh profile). Gates by grep: G-ai both directions, G-debug, G-ui-boundary clean.
- **Looked at.** Screenshots of the pop-up on the mock fixture with fixed API answers (request, result, earlier list with two equal names, error, generator not reachable). They were taken in a window wider than 390 px, because headless Chrome on this PC does not go narrower; the app frame itself is 390 px wide.
- **Not done.** No generation was requested from the backend (step 6 waits for your go-ahead), so the generate and export answers are known only from the example's notes and the two sample files. Nothing was run on hardware or on a phone. `?ai=<url>` on `dev.html` was dropped: with the local proxy there is nothing to override.

**Pop-up revision (2026-11-16, offline; your requests).** It replaces the mock-up and the "earlier results" wording in 8.2 and 8.3 where they differ.

- **One list of all generated presets** ("Generated presets"), newest first, including the selected one. `HISTORY_MAX` is 20; about four rows show and a longer list scrolls. Each row has a cross that deletes that preset from the list only: the app and the amp keep their settings, and nothing is asked first.
- **The selected preset is marked** (gold bar and tint, `aria-current`), and its import message and tip sit directly under the list with the same bar and tint. The separate name heading is gone. Deleting the selected preset removes the tip as well. A press on the selected row loads it again as it was generated.
- **Text size.** The amp list, the guitar and the sound text use the tip's size (13 px). Amp and guitar share one row.
- **Credit.** "Presets by amplifier-presets.com" (linked), and under it "Magnus Bredeli development" and "Ferdinand Hegelstad design" (names from you, kept in `config.js`). In every state, as before.
- **Also added:** Ctrl+Enter (or Cmd+Enter) in the sound text generates; a row's full sound text is its tooltip.
- **Checked:** runner PASS 175 FAIL 0 (one new test for deleting; the list, selection and credit tests updated); screenshot of the pop-up with three presets on the mock fixture. Not checked: a real generation, a phone, hardware.

**Done when:** runner passes; **G-ai** holds (grep: no `src/ai` import under `src/`, no `../` import inside `src/ai`); the other three gates hold.

**Human gates**

- **H8a (no amp):** Import AI, describe a sound, Generate. The pop-up shows the name and the tip; press outside it: the knobs and types hold the preset; Export writes it. Reopen it: text, name and tip are still there. Generate a second sound, then press the first under EARLIER: it is loaded again.
- **H8b (USB, then BLE):** the same, connected. The amp list is pre-selected to your amp; the amp plays the preset and the panel says it was sent, with no differences. Change the text and generate a very different sound (other amp family and effect types). Save one to a memory.
- **H8c (failures):** stop the proxy and open the panel; switch the network off and Generate; Cancel a running generation; press outside mid-generation (it stays). Each time the app and the amp keep their settings and stay usable.
- **H8d (absent):** remove the import line from `thrii_ui.html`: the menu has no Import AI item and nothing else changes.

**Stop if:** the backend's export has names `presetToPlan` refuses; the backend's contract differs from `ai_presets_example/CLAUDE.md` (report the response, do not guess); a step would need an import between `src/ai` and the rest of `src/`.

**Later, not in this phase:** a hosted proxy or the authors' permission for a public origin (needed before the PWA is used from a phone or a public address, since the local proxy answers on the PC only); Phase 9 then decides whether `src/ai/**` is precached, the service worker must not cache `/api` responses, and `scripts/check_release.py` learns G-ai.

#### 8.5 Files

| Creates | Modifies | Must not touch |
|---|---|---|
| `src/ai/config.js`, `src/ai/api.js`, `src/ai/aiPresets.js`, `src/ai/aiPresets.css`, `scripts/serve.py`, `test/unit/aiPresets.test.js` | `src/app/presetFlow.js` (`importText`), `src/app/boot.js` (`presetSources`), `src/ui/runtime/layout.js` (item marks), `src/ui/runtime/mount.js` (`overlayHost`), `thrii_ui.html`, `dev.html`, `test/runner.html`, `test/unit/preset.test.js`, `test/unit/presetFlow.test.js`, `test/unit/boot.test.js`, `CLAUDE.md` (commands, pages, gates) | `src/protocol`, `src/transports`, `src/state`, `src/domain`, goldens, `thrii_ctrl.html`, `ai_presets_example/` (stays the reference) |

#### 8.6 Decisions (answered 2026-11-14)

| # | Question | Answer |
|---|---|---|
| P18 | Proxy | The local Python server (`ai_presets_example/simple/server.py` approach) for the initial implementation; the Worker is not used now. |
| P19 | Public use | Personal use only. You contact the authors when the implementation and testing are complete. |
| P20 | Loading | Load at once, without a confirmation. |
| P21 | Amp model | A list in the panel, pre-selected to the connected amp; the feature works without an amp. |
| P22 | Out-of-range values | Left as the file import takes them; revisit only if the hardware shows a problem. |
| P23 | Panel detail | Name and tip in the pop-up; the settings are shown by the main UI behind it, through the store (8.2). |
| P24 | Way of operation (8.3) | A pop-up that a press outside hides; reopened through the PRESETS menu; a basic list of earlier results, to refine later; the credit in the card in every state. |

#### 8.7 What was verified and what was not (planning stage)

Read in the code: the import path, the menu, the mount handle, the identity, both examples and the contract. Read offline: the two sample exports' names. Not run: any call to the backend or a proxy from this app; `presetToPlan` on the two samples; anything on hardware. Not known: the identity model codes of THR-II amps other than `0x01`. From you, not checked by me: the backend does not use an earlier request as context.

---

### Phase 9: PWA shell and release check

**Read first:** pwa-release-discipline (all rules), P5, P8.

**Steps**

1. `[AGENT]` Copy the symbol table from `doc/` to `src/data/` (`thr10ii_w_symbol_table_1_44_0_a.js` and `.json`). Point `src/protocol/symbolTable.js` at the copy. Keep the `doc/` copies until Phase 10, because the legacy page still uses them.
2. `[AGENT]` Create `index.html`: production shell. It mounts `mountRuntime` with the live store. It imports nothing from `dev.html`, `src/debug`, or `src/ui/debug`.
3. `[AGENT]` Create `manifest.json`: name, short name, `start_url` `./index.html`, `display` `standalone`, `orientation` `portrait`, theme colors, icons (192 and 512 px). Icons per P8.
4. `[AGENT]` Create `sw.js`: versioned cache with an explicit precache list (`index.html`, `manifest.json`, icons, and every `src/**` file except `src/debug` and `src/ui/debug`). Do not precache `dev.html`.
5. `[AGENT]` Create `src/app/main.js` and `src/app/boot.js`: mount the runtime, register the service worker.
6. `[AGENT]` Create `scripts/check_release.py` (Python 3.13 standard library only). It reads the `PRECACHE` array in `sw.js`, fails if any entry is under `src/debug`, `src/ui/debug`, or is `dev.html`, and fails if any runtime file imports those paths. Run it with `python scripts/check_release.py`.
7. `[AGENT]` Decision P5: if `index.html` replaces `thrii_ui.html`, mark `thrii_ui.html` for removal in Phase 10.

**Done when:** `python scripts/check_release.py` passes; T2 PWA check in Chrome (install prompt available, manifest valid); offline reload works (browser tools: set the context offline, reload `index.html`, confirm the shell renders).

**Human gates**
- H9 `[HUMAN]` install the PWA from Chrome on the PC; connect the THR-II; run the H0 smoke subset from the installed app.

**Stop if:** the release check finds a debug path in the precache list.

---

### Phase 10: Retire the legacy prototype

**Run only after H9 passes and the user confirms H10.**

**Steps**

1. `[AGENT]` Move `thrii_ctrl.html` to `legacy/thrii_ctrl.html`. Fix its relative paths (`doc/` becomes `../doc/`) or point it at `src/data/`.
2. `[AGENT]` Remove `thrii_ui.html` (P5). Remove the `doc/` symbol copies only after grep shows no references.
3. `[AGENT]` Leave `architecture.md` and its diagram unchanged. Only update "current implementation" text that now points at removed files.

**Done when:** `test/runner.html` shows 0 failures and `python scripts/check_release.py` passes; grep shows no runtime reference to `legacy/`; the H0 smoke checklist passes 100% on `index.html`.

**Human gates**
- H10 `[HUMAN]` full H0 checklist on the installed PWA. Report the result; the phase is complete only on full PASS.

---

## 7. Risk register

| Risk | Phase | Mitigation |
|---|---|---|
| Shadow readers break when the store is introduced | 2 | Shape-preserving store; golden export |
| Extraction changes wire bytes | 1, 3 | Byte-level goldens from Phase 0 captures |
| BLE timing differs after the transport split | 3 | H3 on both transports; `sleep` kept |
| Coalescing hides or reorders a command | 4, 5 | Ordering rule; flag off by default; H4 |
| Device update re-triggers outbound writes (echo loop) | 6 | Source tagging; unit test; H5 raw-out check |
| Slot-sync bytes guessed instead of verified | 6 | Bytes from the doc, checked against a capture; stop on mismatch |
| A user memory is overwritten with wrong or partial data | 7 | Copy of the amp's own dump; previous content kept for undo; read-back compare; backup file first (H7c) |
| Long BLE frames (uploads) are rejected by the amp | 7 | USB first; 20-byte packet fallback |
| Rapid type switches during an import hard-stop the amp | 7 | Existing pauses; fixed order; stop rule in 7C |
| UI keeps a second authoritative value | 5 | Classification in 5.1 and step 6 of Phase 5; G-single-writer |
| Debug code leaks into the release | 3, 8, 9 | `dev.html` as the only importer; G-debug; `check:release` |
| `file://` users lose the app | 1 | Decision 1 (HTTP serving) |
| Test server not running, so the runner page cannot load | 0+ | Start the server first; stop and report if the runner page errors |
| The AI backend changes, goes away, or its authors object | 8 | Plug-in folder behind one contract; absent means no menu item; failures stay in the panel; personal use until the authors have been asked (P19) |
| A generated preset has names or values the amp does not take | 8 | Same refusal and read-back compare as the file import; sample exports in the tests |

## 8. Out of scope

- New features beyond the current prototype's capabilities (the architecture's product intent is the parity target), except Import AI (Phase 8)
- Changes to the SysEx protocol or the symbol table contents
- Visual redesign beyond the `thrii_ui.html` mock
- Bundlers or build tooling beyond the scripts listed above
