---
name: thrii-mobile-runtime-ui
description: Keeps the THR-II runtime UI focused on a mobile-first, portrait-oriented control experience without debug tooling or protocol internals.
applyTo: "**/*.js,**/*.html,**/*.md"
---

# THR-II Mobile Runtime UI

Use this instruction when working on the production UI for the THR-II controller, especially the phone-first control surface, screen layout, controls, preset flow, and runtime interactions.

## Purpose

The production app is a mobile-first controller for live THR-II use. The runtime UI must be focused, readable, and production-oriented rather than protocol-debug oriented.

This keeps the app aligned with the real use case: a portrait phone interface for live editing and preset control, not a developer console.

## Non-negotiable rules

### 1) Runtime UI is mobile-first and portrait-oriented

The production app is designed for a phone-sized screen in portrait mode.

- vertical layout is the primary design
- controls should be easy to reach with one hand
- compact sections are preferred over wide desktop layouts
- the view should emphasize control flow and live state over diagnostics

Do not design the runtime UI as a multi-panel desktop debugger.

### 2) UI is a consumer of state, not the state authority

The runtime UI must reflect the canonical shadow model.

- it renders current state
- it dispatches user intent
- it may update transient local view state for UX flows
- it must not maintain a separate authoritative device model

If the UI owns the true parameter values independent of the canonical state, the architecture is wrong.

### 3) No debug clutter in the runtime UI

The runtime UI must not expose raw protocol data, parser dumps, or debug traces.

Allowed:

- connection status
- preset actions
- live control panels
- editable amp/effect settings
- preset import/export actions

Not allowed:

- raw SysEx bytes
- parser event dump
- frame diagnostics
- debug tab content in the production interface

### 4) UI must remain thin and focused

Keep the runtime UI layer responsible for:

- rendering from canonical state
- user events and control dispatch
- user feedback and connection status
- preset actions and flow

Do not put protocol logic, dump logic, symbol resolution, or parser implementation directly into the UI layer.

### 5) The UI should be replaceable without changing device logic

The runtime UI is a presentation layer around the canonical model and the protocol stack.

- restructure the UI independently from protocol code
- swap layouts or screens without changing device semantics
- keep app behavior grounded in shared state and action handlers, not UI-local values

## Required runtime flow

The production UI path should work like this:

User action -> UI intent -> Shadow state update -> Protocol builder -> Device

And after device sync:

Device -> Parser -> Shadow state -> UI render

This keeps the UI reactive and state-driven without becoming a second state authority.

## Refactor checklist

Before accepting UI changes, verify:

- is the UI still portrait-first and mobile-oriented?
- does it avoid exposing debug or protocol internals?
- does it render from canonical state rather than local device authority?
- are actions committed through the canonical state flow?
- can debug tooling be excluded without altering the main runtime UI semantics?
- is the UI still thin and not doing protocol work?

## Default decision rule

If the runtime UI holds authoritative parameter values, it is wrong.
If the runtime UI contains parser or debug logic, it is wrong.
If the UI is designed like a desktop debugger rather than a mobile controller, it is wrong.

## Preferred pattern

Use a thin runtime UI layer that consumes the shared THR-II model and dispatches action intents.

- runtime UI = controller experience only
- state/protocol layers = device truth and business logic
- debug UI = separate, optional, excluded from the final PWA release

This preserves the mobile control product goal while keeping the architecture clean and maintainable.
