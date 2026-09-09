---
name: thrii-state-model-shadow-sync
description: Enforces the canonical THR-II shadow-state model, sync boundaries, and write semantics so UI state cannot become a second source of truth.
applyTo: "**/*.js,**/*.html,**/*.md"
---

# THR-II State Model + Shadow Sync

Use this instruction when working on the THR-II device model, canonical state transitions, UI synchronization, preset import/export, or any code that mutates runtime values that reflect the amp.

## Purpose

This project depends on a single authoritative state model for the THR-II device. The shadow store is the canonical runtime representation of the amp state, and all UI-facing state must derive from it.

This instruction prevents drift, duplicate ownership, and accidental state mutation from view logic, debug logic, or transient UI input.

## Non-negotiable rules

### 1) Shadow state is the single source of truth

The THR-II shadow store owns the canonical runtime device model.

- parser results update it
- dump payloads reconcile into it
- imported presets are normalized into it
- outgoing writes are created from it
- UI reads from it, but does not own it

If a value exists in two places and one is not derived from the shadow state, the architecture is wrong.

### 2) UI logic must remain a consumer, not a separate authority

The runtime UI may hold ephemeral view state for interaction, layout, or selection UX, but it must not become a second authoritative device model.

Allowed:

- local selection state for the current form or tab
- transient animation state
- unsaved draft values in a wizard flow
- user intent updates that are committed to the canonical shadow state through the normal state-update path

Not allowed:

- authoritative parameter values that are not synced from the shadow store
- direct device state mutation from DOM or button handlers
- write logic that bypasses the canonical state model
- a parallel device state that lives in the UI and is treated as authoritative

The UI may send user intent into the shadow state as a controlled update, but once that update is committed it must be indistinguishable from other canonical state transitions for downstream serialization and re-sync.

### 3) Device-driven updates must reconcile into the shadow model

Any inbound THR-II change must eventually flow into the canonical state:

- actual device state reads
- dump payload decoding
- memory-slot re-selection events
- knob/parameter changes from the amp
- unsolicited status changes

These updates must merge into the same shadow model, not create side tables that lag behind and drift.

### 4) Writes must originate from the canonical model

When sending a write to the THR-II, the payload must be derived from the current canonical state.

This includes:

- parameter writes
- preset uploads
- actual-state uploads
- user slot writes
- unit or amp selection writes

Never generate serialized device payloads directly from the current DOM state if the canonical model exists.

### 5) Sync boundaries must be explicit

The project needs an explicit boundary between:

- device/input events
- semantic state normalization
- shadow-state mutation
- UI render/update

This keeps state updates deterministic and easy to debug.

### 6) Outbound writes use last-write-wins throttling

The UI may update the canonical shadow model on every knob drag or value change for responsiveness, but the protocol writer must not flush every intermediate value to the amp.

Preferred behavior:

- the shadow store is updated immediately with the newest user value
- a transport/protocol scheduler coalesces repeated outbound writes into a single pending value
- when the interaction settles or a short timer expires, the latest pending value is emitted to the THR-II
- if more updates arrive before the flush window closes, only the newest value is kept and sent

This is a better rule than a naive hard delay because it preserves responsiveness while preventing protocol floods. It also respects the canonical state model: the device writer derives from the shadow store, not from transient DOM state.

## Required state flow

The canonical flow must be:

Device input -> Parser -> Semantic decode -> Shadow state -> UI render

And for writes:

UI intent -> Canonical state -> Protocol builder -> Device

If the flow becomes:

UI -> direct protocol -> device

then the state model is bypassed and the architecture is broken.

## Data ownership rules

### Runtime UI ownership

The runtime UI owns:

- presentation
- layout
- user interaction intention
- rendering from state

The runtime UI does not own:

- device parameter values
- dump cache ownership
- canonical session state
- protocol-level truth

### Shadow-state ownership

The shadow state owns:

- current parameter values
- active amp/cabinet/effect selections
- current session context
- imported/exported preset normalization
- current state for writes and resync

### Debug UI ownership

The debug UI may observe state snapshots and event streams, but it should not write canonical values.

## Refactor and feature checklist

Before accepting a change, verify:

- Does the change update the canonical shadow state instead of local UI state?
- Is the runtime UI only reading state and dispatching user intent?
- Are writes generated from the shadow state or from the DOM?
- Did the change preserve the actual-vs-slot distinction?
- Does parser output still converge into one authoritative model?
- Did the debug layer remain observational only?
- Are imported preset values normalized before they reach the runtime state?

## Default decision rule

If a branch writes to app state directly from UI handlers, it is wrong.
If the app serializes output from DOM state instead of shadow state, it is wrong.
If the debug layer mutates canonical runtime values, it is wrong.
If there are multiple state owners for the same parameter, it is wrong.

## Preferred pattern

Use this pattern for all runtime data:

- normalize incoming device data into semantic values
- merge into the shadow store
- re-render runtime UI from shadow-store selectors
- serialize writes from the shadow store only

This keeps the app deterministic, debuggable, and safe for future refactoring and PWA release work.
