---
name: thrii-architecture-guardrails
description: Enforces the THR-II app architecture for state ownership, protocol layering, separate debug tooling, and PWA release boundaries.
applyTo: "**/*.js,**/*.html,**/architecture.md"
---

# THR-II Architecture Guardrails

Use this skill when refactoring, adding features, or modifying the app architecture for the Yamaha THR-II controller.

## Purpose

This project is a protocol-driven, stateful device controller, not a generic web app. The architecture must preserve:

- a single authoritative state model
- a strict transport/protocol/parser/state/UI split
- debug tooling kept outside the production runtime surface
- a PWA-friendly runtime structure that does not mix debugging with app logic

## Non-negotiable rules

### 1) Single source of truth

The canonical THR-II state lives in the shadow store/state model.

- UI must not own a separate authoritative device state.
- Parser output must converge into the same canonical state model.
- Imported presets and dump payloads also converge into that state.
- User input may be applied into the shadow model through an explicit state-update path, but it must still be part of the canonical state flow.
- Outgoing writes must be generated from the shadow state, not from transient UI values outside the model.

If a change creates a second source of truth, it is a design violation.

### 2) Layering must stay strict

Respect this runtime direction:

- Transport: SysEx MIDI USB/BLE I/O
- Protocol: command builders, requests, responses, dump framing
- Parser: SysEx decode, semantic event extraction, symbol resolution
- State: canonical THR-II model and mutation logic
- Domain: preset model, import/export, serialization
- Runtime UI: app controls and user actions only
- Debug UI: separate diagnostics layer only

Do not move protocol logic into the UI.
Do not store runtime state in DOM-only structures as the canonical truth.
Do not let the parser or transport layer directly manipulate the runtime view.

### 3) Symbol table is a semantic foundation, not UI code

The symbol table belongs with the parser/semantic layer.

- It resolves IDs, names, and enum values.
- It is required for dump interpretation and semantic decoding.
- It is used to normalize state, not to decorate the UI alone.

Do not scatter symbol resolution into the UI or transport modules.

### 4) Debug tooling must be independent

The debug UI must never be interleaved with the production runtime code.

Allowed patterns:

- separate debug tab/page
- optional debug module loaded only in development builds
- read-only observer subscriptions to parser/transport/state events

Not allowed:

- direct mutation of the runtime shadow store
- direct edits of the runtime UI state from debug code
- embedding debug logic into the production UI event flow
- requiring debug code for normal app operation

The production PWA must exclude the debug module entirely.

### 5) The release build must be clean

This app is meant to ship as a PWA, so the release surface must be intentionally minimal.

- `index.html` should be the root shell for the production app
- runtime UI should be mobile-first and portrait-oriented
- runtime app logic should be free of debug instrumentation
- debug features should be removable without changing the production data model

Do not ship debug panels, raw parser dumps, or protocol traces in the production build.

## Required design behavior

### Runtime app flow

The runtime app should follow this model:

Device -> Transport -> Protocol -> Parser -> Symbol table -> Shadow state -> Runtime UI

### Debug flow

The debug layer should follow this model:

Device -> Transport/Parser -> Debug observer/logging UI

The debug layer can inspect the same events, but it must not own the canonical state or become a second source of truth.

## Refactor checklist

Before accepting a refactor, validate all of the following:

- Does the shadow state remain the only authoritative state model?
- Are transport and protocol logic separated from the UI?
- Is the parser still the semantic boundary for device data?
- Is the symbol table still in the semantic layer and not UI code?
- Is the debug UI strictly separate and optional?
- Is the PWA release free of debug-only code?
- Does the runtime UI remain mobile-first and focused on actual controller use?

## Default decision rule

If an implementation makes the debug UI or the DOM appear to be a state authority, it is wrong.
If a module writes directly into the runtime state without going through the canonical model, it is wrong.
If debug code is included in the PWA release path, it is wrong.

## Preferred architecture summary

- One canonical device model
- One runtime app surface
- One debug observer layer
- No debug-state coupling
- No production debug bundle

This keeps the app maintainable, debuggable, and release-safe while preserving the actual protocol behavior of the THR-II.
