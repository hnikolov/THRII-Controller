---
name: thrii-debug-isolation
description: Keeps the THR-II debug tooling separate from the runtime app, so debug views remain parallel observers without becoming a second source of truth or a release-bundle dependency.
applyTo: "**/*.js,**/*.html,**/*.md"
---

# THR-II Debug Isolation

Use this instruction when working on debug panels, parser inspection, raw SysEx tracing, protocol diagnostics, or any optional developer-only tooling for the THR-II controller.

## Purpose

The runtime app is a clean production controller. The debug tooling exists to inspect protocol behavior, decode frames, and troubleshoot device communication, but it must never be mixed into the runtime app’s state ownership or shipped in the release build.

This instruction prevents debug code from becoming a second source of truth or a hidden dependency of the production app.

## Non-negotiable rules

### 1) Debug UI is a parallel observer, not a state authority

The debug UI may subscribe to transport, parser, and state events, but it must not own the canonical THR-II state.

Allowed:

- frame logging
- parser trace output
- semantic event timeline
- raw inbound/outbound SysEx dump
- optional status diagnostics
- state snapshot inspection

Not allowed:

- direct mutation of the shadow state
- direct writes into the canonical device model
- direct DOM writes that shadow runtime state values
- any debug-only model that competes with the production state model

### 2) Debug code must be isolated from the runtime UI flow

The production UI should not import debug logic into its normal event flow.

- runtime controls should not depend on debug handlers
- debug panels should not share the same state owner as runtime controls
- parser debugging should not render or mutate production controls
- debug code should be imported or mounted separately in a development build only

### 3) Debug tooling should be optional and removable

The debug module should be easy to include or exclude.

Preferred patterns:

- separate debug tab/page
- dedicated debug module imported only in development builds
- optional debug bootstrap guarded by environment or build-time flags

Avoid:

- debug code embedded in the main app script
- runtime branches that only exist for debug inspection
- conditional logic that couples production behavior to diagnostic plumbing

### 4) Production release must exclude debug logic entirely

The final PWA release must not ship with debug panels, raw frame dumps, or protocol-inspection overlays.

- runtime build = app only
- debug build = app + debug module
- release build = app without debug module

If the debug module is required for the app to work, it is structurally wrong.

## Correct architecture pattern

Use a split where the app runtime and the debug module are both fed by the same underlying device flow, but remain separated in ownership.

Preferred flow:

Device -> Transport -> Parser -> Shadow state -> Runtime UI

Parallel observer flow:

Device -> Transport/Parser -> Debug observer/logging UI

The debug module observes the same event stream but does not mutate the canonical state.

## Refactor checklist

Before accepting a debug-related change, verify:

- Is the debug UI only observing events and not mutating canonical state?
- Is the runtime controller still the only runtime-state owner?
- Is the debug module separate from the production UI layout?
- Can the debug layer be excluded from the release bundle with no app behavior change?
- Does the production build still function without any debug imports?
- Are raw protocol traces clearly isolated from runtime control logic?

## Default decision rule

If debug code writes into the same canonical state as the app, it is wrong.
If debug trace code is embedded in runtime components, it is wrong.
If a release build cannot exclude debugging without source change, the architecture is wrong.

## Preferred pattern

The cleanest implementation is:

- one canonical shadow state
- one production UI
- one optional debug observer module
- no shared state authority between production and debug flows

This allows deep protocol inspection during development without risking runtime state drift or release bundle contamination.
