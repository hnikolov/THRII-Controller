
# THR-II Controller Architecture

This architecture describes the intended production design for a Yamaha THR-II editor/controller. The goal is a clean, maintainable app that supports live control, preset exchange, and system-state synchronization without turning the app into a protocol-debugging lab.

## Product intent

The app is a real THR-II editor/controller for a production workflow:

- connect to the THR-II via USB first, with BLE fallback
- request and receive settings dumps
- parse SysEx responses into a canonical device model
- allow editing and live control of amp, cabinet, effects, gate, and global settings
- export/import presets in the THR-II preset format
- present a clean runtime UI optimized for daily use
- keep heavy parser/debug introspection separate from the production UX

This is not a general-purpose MIDI explorer; it is a product app with a focused operational purpose.

The runtime UI is intentionally designed as a portrait-first mobile experience. The primary app surface is a phone-oriented layout optimized for one-handed control and preset editing in a vertical form factor. The debug interface is not part of the runtime UX and should never be mixed into that mobile layout.

## Architecture principles

1. Transport independence
   - USB and BLE are concrete transports, not business logic.
   - command generation and parser logic should be transport-agnostic.

2. Single source of truth
   - the device shadow store owns the current THR-II state.
   - UI reads from this state; it does not own the canonical device data.
   - all live updates, imported presets, dump results, and outgoing commands eventually converge in this model.

3. Clean separation of responsibilities
   - transport: connection lifecycle and raw MIDI/BLE I/O
   - protocol: command building and request/response framing
   - parser: SysEx decode and semantic event extraction
   - state: canonical THR-II state model and change propagation
   - preset domain: import/export and preset serialization
   - UI: runtime controls, views, and user actions only
   - debug: separate optional diagnostics only for development

4. Production UI vs debug tooling
   - the final app should expose only runtime controls, preset editor actions, and connection status
   - diagnostic views, low-level parser traces, and raw frame inspection should live in a debug-only surface or be excluded from the final PWA build
   - the debug UI must be independent, ideally as a separate tab, separate page, or separately loaded debug module
   - the debug code should never be interleaved with the app runtime logic; it should be a clearly isolated module that can be included or excluded without affecting the production state model

5. PWA-friendly structure
   - keep the runtime architecture modular but not over-fragmented
   - prefer a small number of clear domain modules over many tiny abstraction layers
   - optimize for maintainability and Copilot-driven iteration

## Runtime model and ownership

The recommended ownership model is:

- Transport layer owns transport connection state and raw byte transfer
- Protocol builder owns command assembly and request semantics
- Parser owns raw frame decoding and event extraction
- Symbol table owns the THR-II semantic dictionary used to map raw IDs to names and typed values
- Shadow store owns the current THR-II state
- UI owns rendering, user interaction intent, and controlled staging of input values into the canonical model
- Preset domain owns import/export conversion to and from the THR-II preset format

This prevents state drift, where the UI, parser, dump cache, and live controls each become independent authorities.

Important nuance: the UI is allowed to apply a user-selected value into the shadow model as an explicit state transition, but it must not maintain a separate authoritative device value outside that model. The shadow store remains the single source of truth; the UI only feeds intent into it before serialization or re-sync from the amp.

## Symbol table role in the architecture

The symbol table is a critical semantic metadata layer and must be treated as a first-class architectural component, not a side utility.

Current usage pattern in the implementation:

- the app loads the THR-II symbol dictionary from `doc/thr10ii_w_symbol_table_1_44_0_a.js` and falls back to `doc/thr10ii_w_symbol_table_1_44_0_a.json`
- the parser calls `ensureParserSymbolsLoaded()` at startup and on demand
- the dictionary is stored as a two-way lookup:
  - by numeric ID -> symbol name
  - by symbol name -> numeric ID
- raw dump values and parameter words are resolved into meaningful unit and parameter names using the symbol table
- enum values, effect types, cabinet types, amp model keys, and parameter names are resolved via the symbol table
- the state model uses symbol names to label units, parameters, and decoded values for UI and preset export

In other words, the symbol table is the semantic vocabulary for the THR-II protocol. It turns raw integer IDs into meaningful domain objects and is required for:

- raw frame interpretation
- shadow model population
- dump-domain reconciliation
- `@asset` and subtype resolution during preset export/import
- UI labeling and diagnostics
- enum interpretation for amp/cabinet/effect selections

This means the symbol table sits between the protocol/parser layer and the state/domain layers. It is not a protocol transport, but it is also not just a display helper. It is the canonical protocol dictionary for the app.

### Architectural responsibility

The symbol table layer should provide:

- `loadSymbolTable()` for loading the THR-II dictionary
- `resolveSymbolById(id)`
- `resolveSymbolByName(name)`
- `buildNameIndex()` and `buildIdIndex()`
- fallback generation if the canonical table is unavailable
- safe resolution for unknown IDs without crashing the parser

This layer should be treated as part of the parser/semantic foundation for the product.

## Recommended modular structure

The project should be organized by responsibility, not by arbitrary implementation detail. The structure is still valid, but it can be simplified a bit further for this app because the runtime is small and the UI is intentionally separated from the protocol layer.

A cleaner production shape is:

- index.html
- manifest.json
- sw.js
- src/
  - app/
    - main.js
    - boot.js
  - core/
    - constants.js
    - logger.js
  - transports/
    - usbTransport.js
    - bleTransport.js
    - transportManager.js
  - protocol/
    - builders.js
    - requestResponse.js
    - dumpSession.js
    - parser.js
    - symbolTable.js
  - state/
    - shadowStore.js
    - selectors.js
  - domain/
    - presetModel.js
    - presetImportExport.js
    - thriiModel.js
  - ui/
    - runtime/
      - connectionView.js
      - controlsView.js
      - presetView.js
    - debug/
      - debugPanel.js

This is intentionally a little more compact than the earlier split. The important part is not the exact file count; it is the clear separation between:

- device transport and protocol
- semantic decoding and symbol mapping
- canonical state and preset domain
- runtime UI and debug UI

The symbol table still belongs under the parser/semantic foundation, not under the UI or transport layers.

### Entry point and UI replacement strategy

The production app should have a top-level root HTML entry point, and that entry point is `index.html` as the expected web entry shell for a PWA build.

The current UI implementation in `thrii_ui.html` is intended to replace the older runtime UI embedded in `thrii_ctrl.html`.

`thrii_ui.html` is deliberately a portrait-only, mobile-first interface for actual runtime use. It is not intended to host debug instrumentation or raw protocol inspection. The runtime UI should be clean, compact, and optimized for phone-sized screens.

The debug interface must be a separate, independent surface. The preferred pattern is:

- a dedicated debug tab or debug page in the app shell, but with separate DOM and controller logic
- or, even cleaner, a dedicated debug module that is imported only in development builds
- the debug module owns its own view, state, and event wiring, and remains isolated from the main runtime state model
- the production PWA release excludes this module entirely, so the app ships without debug overlays, raw parser dumps, or diagnostic traces

This means the intended migration path is:

- `thrii_ctrl.html` = legacy prototype / debug harness
- `thrii_ui.html` = new production UI implementation that will become the runtime UI layer for the app
- `index.html` = final PWA entry page that loads the modular app shell and runtime UI
- optional debug module = separated diagnostic UI, loaded only for development or debugging builds, not included in the release app

In other words, the UI code should not be treated as a permanent part of the old prototype structure. `thrii_ui.html` is the target replacement surface for the currently mixed-in UI logic, and the final architecture should treat it as the canonical runtime front end once the module split is complete. The debug tooling should be removable and independent, not embedded in the runtime app logic.

## Topology

                         +------------------------+          +-------+       +-------------------+
                         |         SysEx          | Commands | THRII |       | Import/Export     |
                         |     Command Builder    |<---------|  GUI  |------>| Presets (.thrl6p) |
                         +------------------------+          +-------+       +-------------------+
                              |               ^                  ^               ^           ^
  SysEx Commands via USB:     v               |                  |               |           |
  - Sw Version           +-----------------+  |                  |               |           |
  - Activate, etc.       | SysEx transport |  |                  |               |           v
  - Download, Upload:    |    USB/BLE      |  |                  |               |       +=======+
    -- Actual            +-----------------+  |                  |               |       | JSON  |
    -- Memory 1,2,3,4,5       |               |                  |               |       | Files |
    -- Single parameters      |               |                  |               |       +=======+
                              v               |                  |               |
                         +=========+          | Amp              | Amp           | Amp
                        /   THRII   \         | Parameters       | Parameters    | Parameters
                        \  Amp Box  /         | Data             | Data          | Data
                         +=========+          |                  |               |
                              |               |                  |               |
      THRII Responses via USB |               |                  v               |
                              v               |   +---------------------------+  |
                      +--------------+        |   |  THRII Shadow Data Model  |  |
                      | SysEx Parser |        |   | (Single Source of Truth)  |  |
                      +--------------+        |   +---------------------------+  |
                         |    |               |        ^                 ^       |
                         |    | Amp           |        |                 |       |
                         |    | Parameters    |        v                 v       v
                         |    | Data       +----------------------------------------+
                         |    +----------->|               Symbol Table             |
                         v                 |               ID/name/enum             |
                      ACK/NACK, etc.       +----------------------------------------+            

## Parallel debug observer pattern

The debug UI may run in parallel with the runtime UI, but it must not be treated as a second source of truth.

The correct pattern is a passive observer model:

- SysEx transport emits raw inbound/outbound frames
- parser decodes those frames into semantic events
- the canonical shadow store updates from the parsed device state
- the runtime UI subscribes to shadow-state changes for normal control rendering
- the debug UI subscribes to parser and transport events for diagnostics, tracing, and protocol inspection

This yields a clean separation:

- app runtime path: `Device -> Parser -> Shadow State -> Runtime UI`
- debug path: `Device -> Transport/Parser -> Debug UI`
- debug does not mutate the canonical state or directly own runtime controls

In practice, the debug module should observe the same system events, not duplicate the data model. It may read:

- raw system-exclusive (inbound and outbound) frames
- parser output and event logs
- semantic decode events
- symbol resolution results
- dump session state
- transport state transitions
- state snapshots for troubleshooting

The debug module should not:

- write directly into the shadow store
- do UI rerendering of the runtime controls
- own the canonical THR-II data model
- be required for the production app to function

This is the cleanest way to keep the debug UI "parallel" while preserving the app's single source of truth. It allows the debug surface to be active in development builds without making it part of the app runtime contract or the release build.

The preferred production arrangement is:

- runtime app UI = production experience only
- debug module = optional developer-only observer module, imported or enabled separately
- PWA release = excludes the debug module entirely

This keeps the debug interface powerful enough for protocol work while ensuring that the shipped application remains clean, deterministic, and state-consistent.

## Essential runtime flows

These are the core flows this app must support.

### 1) Activate THR-II (connection boot sequence)

This is the device-initialization sequence used to wake or establish the THR-II session after transport connection.

Current implementation details from the prototype code:

- the sequence is defined as `thrActivateSequenceHex` and contains four SysEx frames
- it is executed by `activateThrII()` after the device is connected
- each frame is sent with a short `sleep(500)` delay between them
- in the prototype, this is currently triggered by the UI button `btnActivate`, but in the intended product architecture it is a post-connect boot step

Exact sequence in the current code:

1. `f0 7e 7f 06 01 f7`
   - universal SysEx device inquiry / identity request
2. `f0 00 01 0c 24 01 4d 00 00 00 00 07 00 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 f7`
   - THR-II-specific session / setup frame
3. `f0 00 01 0c 24 01 4d 00 01 00 00 07 00 04 00 00 00 04 00 00 00 00 00 00 00 00 00 00 f7`
   - THR-II-specific mode / configuration frame
4. `f0 00 01 0c 24 01 4d 00 02 00 00 03 28 72 4d 54 5d 00 00 00 f7`
   - THR-II-specific wake/activation payload containing the device startup signature

Runtime flow:

- GUI or connection lifecycle -> Command Builder -> SysEx transport -> THR-II
- THR-II may respond with ACK/NACK or status frames; the parser can surface them, but the activation sequence is primarily a boot/protocol initialization step

Role of the model:

- no shadow-state mutation is required for the activation command itself
- activation is a transport/protocol operation, not a data-model mutation
- the parser may observe status responses, but the canonical state is not established by the activation sequence itself

Intended product behavior:

- after USB or BLE connection is established, the app should automatically run the activation sequence as a post-connect boot flow
- the prototype exposes it as a manual action; the final architecture should treat it as an automated initialization step

### 2) Download settings from device to app

Device-to-app flow for a settings dump or actual-state read:

- GUI -> Command Builder -> SysEx transport -> THR-II -> SysEx Parser -> Symbol Table -> Shadow State -> GUI

This is the canonical "read" path for both live state and stored memory snapshots.

The app supports the following data targets:

- Actual THR-II amp parameter state
- User memory slots 1..5

The download flow is therefore not limited to one state chunk; it includes:

- actual device state (live/current values)
- memory slot state for presets 1..5

The command builder emits a request for the chosen target, the device responds with raw SysEx, the parser decodes the frames, the symbol table resolves IDs/names/enums, and the shadow state becomes the authoritative snapshot for that target.

Examples:

- Download actual THR-II amp status (parameters)
- GUI -> Command Builder -> SysEx transport -> THR-II -> SysEx Parser -> Symbol Table -> Shadow State -> GUI

- Download THR-II slot 3 settings
- GUI -> Command Builder -> SysEx transport -> THR-II -> SysEx Parser -> Symbol Table -> Shadow State -> GUI

The GUI is not the source of the values; it receives the updated state from the canonical model.

### 3) Asynchronous THR-II-driven updates (unsolicited)

This is a critical runtime path that must be supported because the THR-II can send state updates without any app-initiated request.

Typical examples:

- physical knob rotation on the amp changes a parameter
- a user presses memory slot 1..5 on the amp
- the amp emits a state-changing SysEx frame while the app is idle or connected in background

Important nuance for the memory-slot buttons on the amp itself:

- pressing User Memory 1..5 does not appear to send the full parameter snapshot immediately
- the THR-II emits a user-memory selection notification (the protocol notes describe this as an opcode 0x02 / "User Memory Settings" event and mark it as a download-to-active-settings operation)
- this message tells the app that a memory slot became active, but it should not be treated as a complete settings dump by itself
- the app must then follow the sync logic used by the reference implementation: ask whether user settings changed, then request the actual settings dump for the live/current state

This is the expected sequence for a device-triggered memory switch:

- THR-II -> user-memory selection notification (slot changed)
- App -> "have user settings changed?" query
- App -> request actual user settings / request actual state dump
- THR-II -> SysEx Parser -> Symbol Table -> Shadow State -> GUI

The slot-change flag is therefore a trigger, not the full parameter payload. The canonical state still comes from the follow-up actual-settings read.

Runtime flow:

- THR-II -> SysEx transport -> SysEx Parser -> Symbol Table -> Shadow State -> GUI

This path is asynchronous and event-driven:

- no GUI action triggers it
- no command builder is involved
- the transport receives raw inbound SysEx from the device at any time
- the parser decodes the frames and emits semantic events
- the symbol table resolves raw IDs to names, enums, and typed values
- the shadow state is updated in place
- the UI rerenders the affected controls or session state

This flow is essential for correctness because the app must reflect actual device state even when the user changes parameters directly on the amp or switches presets physically.

In product terms, the shadow state must be treated as a live mirror of the device, not only a target for requests initiated by the app.

### 4) Upload shadow model to device

App-to-device flow for a write or full upload:

- GUI -> Shadow State -> Symbol Table -> Command Builder -> SysEx transport -> THR-II -> SysEx Parser -> ACK/NACK

This is the canonical "write" path for both the current device state and stored memory uploads.

The app supports the following upload targets:

- Actual THR-II amp parameter state
- User memory slots 1..5

The upload flow therefore includes:

- serializing the current shadow data for the selected target
- resolving the canonical state back into THR-II IDs and typed values via the symbol table
- generating the correct SysEx frame sequence for the selected target
- sending the result to the device
- confirming with the parser and ACK/NACK response path

Important distinction:

- the user action originates in the GUI
- the actual payload originates from the current shadow state
- the symbol table provides the correct IDs/names/enums for serialization
- the command builder emits the final SysEx frame(s)
- the device responds and the parser confirms the result

Examples:

- Upload current THR-II shadow amp state to Actual
- GUI -> Shadow State -> Symbol Table -> Command Builder -> SysEx transport -> THR-II -> SysEx Parser -> ACK/NACK

- Upload current THR-II shadow state to slot 2
- GUI -> Shadow State -> Symbol Table -> Command Builder -> SysEx transport -> THR-II -> SysEx Parser -> ACK/NACK

The shadow state is the real source of the outgoing payload. The GUI simply triggers the operation.

### 5) Import preset into app

Preset-to-state flow:

- GUI/File -> Preset Import/Export -> Symbol Table -> Shadow State -> GUI

This path converts a preset file into the canonical in-memory THR-II state model. The preset file contains names/assets/enums that must be resolved to real THR-II IDs and typed values before they can be inserted into the authoritative state model.

The symbol table is required here so the importer can translate asset names, subtype names, and parameter references into the correct THR-II identifiers and enum values before state mutation.

### 6) Export preset from app

State-to-preset flow:

- Shadow State -> Symbol Table -> Preset Import/Export -> GUI/File

This path turns the canonical state into a `.thrl6p` JSON payload for saving or sharing. The symbol table is used to resolve the current canonical IDs into human-readable asset and parameter names before serialization.

### 7) Live editing / direct control actions

Command-driven runtime edit flow:

- GUI intent -> Shadow State (controlled value update / pending commit) -> Command Builder -> SysEx transport -> THR-II
- THR-II -> SysEx Parser -> Symbol Table -> Shadow State -> GUI

This pattern is used for parameter writes, amp selection, cabinet selection, effect selection, and module toggles.

The UI may apply a user choice into the shadow state as part of the commit flow, but the final authoritative value remains the canonical shadow model or the response-driven state update from the device. The UI is not allowed to hold a separate device-authoritative state that bypasses the model.

## Runtime-flow summary

- Read path: Device -> Parser -> Symbol Table -> Shadow State -> GUI
- Unsolicited device path: Device -> Parser -> Symbol Table -> Shadow State -> GUI
- Write path: GUI -> Shadow State -> Symbol Table -> Command Builder -> Device
- Control path: GUI intent -> Command Builder -> Device -> Parser -> Shadow State -> GUI
- Preset path: Shadow State <-> Preset Import/Export

## Final design decision

The project should move from the prototype/debug form of the current single-file app into a service-oriented, state-driven architecture with a single authoritative shadow model. The UI should become a consumer of that state, not a source of truth. The debug panels should be treated as an optional development feature and removed from the production app surface.

This is the architecture that best fits the product goals, preserves the current protocol work, keeps USB-first/BLE-fallback behavior intact, and supports a clean future PWA release without adding excessive file complexity.
