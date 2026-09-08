---
name: thrii-pwa-release-discipline
description: Keeps the THR-II app PWA-ready by enforcing a clean release bundle, separate debug tooling, and a production-first runtime shell.
applyTo: "**/*.js,**/*.html,**/*.md"
---

# THR-II PWA Release Discipline

Use this instruction when working on the production app shell, service worker setup, manifest configuration, runtime boot logic, deployment concerns, or anything that affects the shipped PWA build.

## Purpose

This app is intended to be released as a progressive web app. The release build must stay clean, deterministic, and focused on real runtime use.

This instruction protects the app from shipping debug overlays, developer-only logic, protocol inspection UI, or other non-production concerns in the final bundle.

## Non-negotiable rules

### 1) The production app must have a clean entry shell

The app should expose a top-level production entry point, typically `index.html`, which acts as the PWA shell and bootstraps the runtime app.

- runtime UI should load from the production shell
- the shell should not contain protocol-debug tooling
- the shell should not become a mixed debug + runtime UI container

### 2) Debug tooling must be excluded from the release bundle

The final release build must not include debug-only modules, raw SysEx traces, parser inspection panels, or developer callbacks.

Allowed:

- runtime-only UI
- production state model
- production connection flow
- manifest and service worker setup

Not allowed:

- debug tab logic embedded in the runtime shell
- raw frame diagnostics in the production UI
- parser trace UI in the release build
- developer-only events that are required for runtime behavior

### 3) Runtime app should stay mobile-first and production-focused

The runtime UI is intended to be a portrait-first, phone-oriented controller surface.

- keep controls optimized for real-world use
- keep the layout focused on device operation
- avoid debug clutter and developer tooling in the main UI
- preserve a clean product experience even when the app is running locally in development

### 4) Keep the PWA shell and runtime logic separate

The production shell should be lightweight and stable.

- service worker and manifest are deployment concerns
- runtime app logic belongs to the controller app itself
- debug modules and diagnostic code should remain optional and separate from the release shell

### 5) The released app must remain deterministic

The production build must behave consistently across environments and should not depend on debug-only imports, development-only toggles, or hidden runtime features.

## Required release behavior

The production app flow should be:

index.html -> PWA shell -> runtime app bootstrap -> connected THR-II controller UI

The debug flow should be:

development build only -> debug module / debug panel / debug page

The release build must not require debug code to function.

## Release checklist

Before shipping or validating a release build, confirm:

- the runtime shell boots without debug logic
- debug modules are excluded from the release bundle
- the PWA manifest and service worker are separate from controller logic
- the app is usable without parser debug panels or raw tracing UI
- no feature path depends on a debug-only import
- no state authority exists outside the canonical shadow model

## Default decision rule

If the release build still contains parser trace panels, raw debug dumps, or debug UI state ownership, it is not ready for PWA release.
If the runtime app needs debug code to run, the architecture is wrong.
If the manifest or shell depends on non-production behavior, the architecture is wrong.

## Preferred implementation pattern

Use a clean split:

- release shell: `index.html`, manifest, service worker, runtime bootstrap
- runtime app: controller logic, state model, protocol layer, transport layer
- debug module: optional, isolated, development-only, excluded from release build

This keeps the app production-safe, maintainable, and aligned with a clean PWA deployment model.
