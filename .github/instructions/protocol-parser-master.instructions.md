---
name: thrii-protocol-parser-master
description: Guides protocol, parser, symbol-table, and SysEx event handling for the THR-II controller without breaking the canonical shadow-state model.
applyTo: "**/*.js,**/*.html,**/*.md"
---

# THR-II Protocol + Parser Master

Use this instruction when working on SysEx protocol framing, parser logic, symbol-table resolution, dump decoding, semantic event processing, or THR-II state synchronization.

## Purpose

This project is driven by Yamaha THR-II SysEx protocol behavior. The parser and protocol layers are the source of truth for device communication semantics, and they must remain accurate, explicit, and safe.

This instruction protects the protocol and parser from accidental drift, UI contamination, and incorrect assumptions about the device behavior.

## Core protocol truths

### 1) The THR-II protocol is stateful and event-driven

The amp can send unsolicited updates, especially when:

- a user changes a knob on the amp
- the user switches memory slot 1..5 on the device
- a parameter or session state changes outside the app

A memory-slot selection is not the same as a full settings dump.
It should be treated as a trigger event that may require a follow-up state sync query and actual-settings read.

### 2) The parser turns raw bytes into semantic events

The parser must convert raw SysEx payloads into structured semantic events such as:

- parameter updates
- unit/type changes
- dump session progress
- control/target selection
- ACK/NACK or state status

Do not treat raw bytes as final app state.
All semantic values must be normalized before they reach the canonical shadow store.

### 3) The symbol table is required for semantic correctness

The stack should work like this:

Device bytes -> parser -> symbol-table resolution -> canonical shadow state

The symbol table is required for:

- numeric ID resolution
- enum decoding
- parameter and unit naming
- dump interpretation
- state conversion between raw and semantic values

Do not hardcode raw IDs in UI logic or downstream state handling.

### 4) The app state must never be inferred from the UI alone

The UI is a consumer of state, not a source of truth.

- actual device state comes from SysEx + parser + symbol table
- imported presets are normalized into the canonical model
- generated output frames are derived from the shadow state
- the UI should reflect canonical state, not create it

## Protocol and parser guardrails

### 1) Keep transport and protocol separate

Transport code should handle:

- USB or BLE connection lifecycle
- raw byte transmission
- event stream from device input

Protocol code should handle:

- request generation
- response framing
- sequence of SysEx commands
- dump target semantics
- ACK/NACK expectations

Do not mix connection transport internals with protocol payload logic.

### 2) Keep parser semantics separate from shell/UI concerns

The parser should not know about:

- DOM rendering
- mobile UI layout
- button states
- connection buttons
- debug panels

It should only handle:

- raw frame extraction
- payload interpretation
- semantic event creation
- state mutation hooks for the canonical model

### 3) Treat dump sessions as structured protocol state

Any request/download/upload flow must account for:

- chosen target: actual state or memory slot 1..5
- sequencing of request/response frames
- session lifecycle and status
- payload assembly and validation
- parser results feeding the shadow store

Do not assume that every protocol response is a complete app-state snapshot.
Some messages are only notifications or step markers.

### 4) Respect actual-vs-slot behavior

The following distinction is required in protocol reasoning:

- Actual device state = live amp state
- User memory slot N = stored preset snapshot
- User memory selection on amp = trigger signal, not necessarily a complete full dump payload

Follow-up sync logic is often required after a device-triggered slot change.

### 5) Debug parsing is useful only if it remains separate

The parser may feed debug tools, but the debug layer must not become a second authority.

Allowed:

- raw frame logging
- parser trace output
- event timeline view
- semantic decode inspection
- optional debug observer on parser events

Not allowed:

- writing canonical shadow state from debug code
- creating UI-level state duplication
- forcing production app logic to depend on debug tooling

### 6) Parameter writes should be coalesced, not streamed

When a user rotates a knob or drags a live control, the app may generate many rapid value changes. Those intermediate values are a UI-gesture detail, not necessarily a set of commands that must be sent to the THR-II.

The preferred policy is:

- keep the latest value in the shadow state immediately
- coalesce repeated outbound writes in a small scheduler window
- send only the final pending value to the device once the burst settles or a short maximum interval is reached
- treat this as a transport-level write policy, not as a separate UI state model

This is effectively a last-write-wins throttle. It avoids flooding the amp while preserving the final user intent and the canonical model.

## Required behavior for changes

When editing parser or protocol code, confirm:

- raw payloads are decoded into semantic events before state mutation
- symbol resolution uses the canonical symbol dictionary
- dump sessions map to the selected target correctly
- actual-state and memory-slot flows remain separate in logic
- unsolicited device-driven events are handled without UI action
- the canonical shadow state is the only mutable source for runtime app data

## Refactor checklist

Before accepting a parser or protocol change, verify:

- Is the code transport-agnostic?
- Does it follow the canonical frame/semantic/event flow?
- Are symbol resolutions centralized and consistent?
- Does it preserve actual-state vs slot semantics?
- Are debug traces isolated from the production state model?
- Does the app still use one canonical state source?
- Could a different UI or debug layer accidentally overwrite the same state?

## Default decision rule

If protocol or parser logic starts depending on DOM state, UI state, or debug-only assumptions, it is wrong.
If a parser mutation bypasses the canonical shadow model, it is wrong.
If a byte-level decode is treated as final meaningful data without symbol resolution, it is wrong.

## Preferred implementation pattern

Use this flow:

Transport -> Raw frame capture -> Parser -> Semantic event -> Shadow state -> Runtime UI

And for diagnostics:

Transport/Parser -> Debug observer/logging module

The app may be observed in parallel, but it must never be owned in parallel.
