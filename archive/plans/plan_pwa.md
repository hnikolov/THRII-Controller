# Phases 9 to 11: PWA release, app version, screen wake, legacy retirement, cleanup

Status: planning only (2026-11-18). Nothing in this file is implemented. It refines Phases 9 and 10 of [plan.md](plan.md); once agreed, plan.md's Phase 9 and 10 sections should point here.

Read first: [plan.md](plan.md) sections 0, 3, 4, 5 (P5, P8, decision 6), `.github/instructions/pwa-release-discipline.instructions.md`, [CLAUDE.md](CLAUDE.md).

---

## 1. Review of the current Phase 9 and 10 text

What the current text gets wrong or leaves out, checked against the code on disk.

| # | Where | Finding | Fix in this plan |
|---|---|---|---|
| R1 | 9 step 5 | Says "create `src/app/boot.js`". It exists since Phase 6 and is shared by `thrii_ui.html` and `dev.html`. | Only `src/app/main.js` is new (9C). |
| R2 | 9 step 1 | Says to point `src/protocol/symbolTable.js` at the copy. The URL actually used is `SYMBOL_TABLE_URL` in `src/app/boot.js:27`; the default in `symbolTable.js:12` is a fallback. Only the `.json` form is used by `src/`; the `.js` form is legacy-only. | Copy the `.json` only; change both URLs (9A). |
| R3 | 9 / 10 | Six unit tests fetch `doc/thr10ii_w_symbol_table_1_44_0_a.json` (`dumpParser`, `effectParams`, `preset`, `runtime`, `syncFlow`, `unitTypeWrite`). Removing the `doc/` copy in Phase 10 would break them. | Tests move to `src/data/` in 9A; `doc/` copies stay (D6). |
| R4 | 10 step 2 | "Remove the `doc/` symbol copies" contradicts step 1 (legacy keeps using `../doc/`) and CLAUDE.md ("do not modify `doc/`"). | Keep `doc/` as reference material (D6). |
| R5 | 9 step 4 | No versioning or update rule. A versioned cache only updates when `sw.js` changes byte-wise; nothing forces that on a commit. | Version file plus content stamp, enforced by the release check (section 3). |
| R6 | 9 step 4 | Precache list is hand-written. A missing file makes the service worker install fail (`cache.addAll` is all-or-nothing); a stale one breaks offline. The CSS files loaded at run time (`runtime.css`, `presets.css`, `aiPresets.css` via `new URL(..., import.meta.url)`) are easy to miss. | The release script generates and checks the list (9D). |
| R7 | 9 | No update user experience. An automatic reload while a preset is being uploaded or saved to a memory slot could leave the amp with partial data (risk register, Phase 7). | Update waits for the user's tap; never reloads on its own (3.3). |
| R8 | 9 | A service worker registered from `index.html` on `localhost:8080` has scope `/` and would also control `dev.html` and `test/runner.html`, serving them cached (stale) modules. | The worker serves from cache only for the app page (3.4). |
| R9 | 9 | No hosting target. Service worker, Web Bluetooth, Web MIDI and Wake Lock all need HTTPS (or localhost). | D1: GitHub Pages for the app; the proxy is a separate Cloudflare Worker (1.1). |
| R10 | 9 | Import AI calls `/api`, which exists only in `scripts/serve.py` (local proxy). On a static host it fails. You want to show the authors the hosted app and ask their permission for the proxy (P19). | D3: `index.html` loads the AI plug-in; the button shows only where a proxy answers (section 5); the authors are contacted with the app's URL (5.3). |
| R16 | 9 | Pull-to-refresh (swipe down) and F5 reload the page, which drops the amp connection and any running upload. | D8: section 4.2. |
| R17 | 10 | Plan did not say what happens to `dev.html`. | D10: kept, unchanged in role (section 8). |
| R11 | 9 | Saved lists (preset library, AI sounds) are in `localStorage`, which is per origin. Lists made on `localhost:8080` do not appear in the hosted app. | Say so in H9; carry them over by file export/import if needed. |
| R12 | 9 | No screen wake. On a phone the screen dims and locks, and Chrome suspends the page, which drops BLE. | Wake lock (section 4). |
| R13 | H9, H10 | Human gates test the installed PWA on the PC only. The target is a phone (390x844, portrait). | H9 and H10 run on the phone too, plus an update check. |
| R14 | 9 | Manifest lacks `id`, `scope`, and a maskable icon; `start_url` `./index.html` differs from what GitHub Pages serves for the folder (`./`). | Manifest fields in 9B. |
| R15 | 10 | Files that name `thrii_ui.html` besides plan.md: `CLAUDE.md`, `architecture.md`, `dev.html`. | Listed in 10B. |

Already fine: all four flags (`coalesceWrites`, `autoActivate`, `slotSync`, `quickImport`) default to on in `src/core/flags.js`, so `index.html` needs no flag handling.

### 1.1 What is already in place (checked 2026-11-19, before Phase 9)

| Item | State | Effect on Phase 9 |
|---|---|---|
| Proxy | **Done, as a standalone Cloudflare Worker** (`cloudflare/proxy-worker.js`, deployed at `thrii-proxy.hnikolov.workers.dev`). Checked live: `/api/health` 200, `/api/amplifiers` forwarded (no `User-Agent` needed), 403 without an allowed `Origin`, CORS preflight 204. | No Pages Function (the old 9D step 3 is dropped). The hosted app's origin must be added to `ALLOWED_ORIGINS` and the Worker redeployed (9D). |
| `API_BASE` | Points at the Worker (`src/ai/config.js`); `'/api'` is kept as a comment. | Every environment, localhost included, uses the Worker. `serve.py`'s proxy is only used if `API_BASE` is set back to `'/api'`. |
| AI screen | In the app; `thrii_ui.html` and `dev.html` load it unconditionally. | Only the health check (`aiAvailable`) is missing (9C). |
| `AMP_ID_BY_MODEL` | `0x00`, `0x01`, `0x02` mapped. | None. |
| `README.md`, `LICENSE` | Present. | Not part of the release set. |
| Protocol PDF and its text copy | Removed from `doc/`; references point at martinzw's repository. | None. |
| `doc/cloudflare_proxy_worker.md` | Setup guide for the Worker. | Gets the `ALLOWED_ORIGINS` step for the hosted origin. |
| GitHub Pages | Repository is public; Pages is not enabled yet (`has_pages: false`, the Pages URL answers 404). | Enabled with source "GitHub Actions" (9D). |
| Unit tests | Run headless on 2026-11-19: **PASS 177 FAIL 6**, before any Phase 9 change. 3 tests fetch `doc/walsh-hotel-solo.thrl6p` and `doc/neo-classical-fury.thrl6p`, which now exist only in the untracked `presets/` folder (the server answers a 404 page, hence "Unexpected token '<'"). 3 presets-screen tests time out ("Added 2 presets…", "no loaded row", "Added 10 presets"); not yet known whether that is a real failure or headless timing. | Fixed first, in 9.0. |
| Everything else in Phase 9 (`src/data/`, `index.html`, manifest, icons, `version.js`, `wakeLock.js`, `main.js`, `sw.js`, `check_release.py`, overscroll CSS, `/api/health` in `serve.py`) | Not started. | As planned below. |

---

## 2. Decisions

Recommendations are in bold. Change any before Phase 9 starts.

| # | Question | Recommendation |
|---|---|---|
| D1 | Hosting | **Decided: GitHub Pages, published by a GitHub Actions workflow** (`.github/workflows/pages.yml`). A push to `main` runs the release check and the unit tests (9F), then publishes only the release set from `python scripts/check_release.py --out dist`, so `dev.html`, `test/`, `doc/`, `presets/`, `scripts/` and `cloudflare/` stay off the site. No Node: the workflow uses Python and GitHub's own Pages actions. App address: `https://hnikolov.github.io/THRII-Controller/` (a sub-path, so every path in the app stays relative and the service worker's scope is `/THRII-Controller/`). The proxy stays the standalone Worker (1.1); its `ALLOWED_ORIGINS` gets `https://hnikolov.github.io`. Moving to Cloudflare Pages later stays possible: the same `--out dist` folder is what it would publish. |
| D2 | Version scheme | **`APP_VERSION` set by hand (for example `1.0.0`) plus a `BUILD` stamp (short content hash) written by the release script.** The hash guarantees an update whenever any shipped file changes; the version is what you read. |
| D3 | Import AI in the release | **`index.html` loads the AI plug-in, and `src/ai/` is shipped and precached.** The AI button shows only when the proxy answers (D9). The authors are asked whether they prefer CORS or the proxy (5.3). |
| D4 | When the screen stays on | **Whenever the app is visible**, connected or not (your wording: "while using the app"). Alternative: only while an amp is connected, which saves battery when the app is left open idle. |
| D5 | Where the version and the update control show | **Version on the connection strip when no amp is connected (where the firmware version shows once connected); a small `UPDATE` button on the top strip when an update is waiting.** |
| D6 | `doc/` symbol table copies | **Kept.** `doc/` is reference material; the legacy page loads the `.js` form from it. |
| D8 | Accidental reload | **Pull-to-refresh disabled by CSS; a "leave page?" prompt on reload or close while an amp is connected** (section 4.2). |
| D9 | When the AI button shows | **Decided by asking the proxy, not by the host name**: `GET <API_BASE>/health`, answered by the Worker (and by `serve.py`) without calling the generator (section 5). |
| D10 | `dev.html` after Phase 10 | **Kept as the development page.** It does not load `index.html` (section 8). |
| D7 | Stamping on commit | **Manual: run `python scripts/check_release.py --stamp` before a release commit; the check (and the deploy workflow) fails if the stamp is stale.** Optional: a Python pre-commit hook in `scripts/hooks/` enabled with `git config core.hooksPath scripts/hooks`, which stamps automatically. |

---

## 3. App version and update flow

### 3.1 Single source of the version

`src/app/version.js`:

```js
export const APP_VERSION = '1.0.0';
export const BUILD = '3f9c2a1e'; // written by scripts/check_release.py --stamp
```

- The page imports it to display the version (D5).
- `sw.js` is a module service worker (`type: 'module'`, Chrome 91+; the app needs Chrome anyway for Web MIDI and Web Bluetooth) and imports it too. The cache name is `thrii-${APP_VERSION}-${BUILD}`.
- The browser compares the service worker script **and its imported modules** byte by byte on each update check. Any change to `version.js` therefore installs a new worker. That is the mechanism that turns a commit into an app update.
- `BUILD` = first 8 hex digits of SHA-256 over the precached files (path and contents, sorted, `version.js` excluded). Changing any shipped file without restamping fails the release check, so a release can never ship new files under an old cache name.

### 3.2 Service worker (`sw.js`)

- **install:** open the new cache; fetch every precache entry with `cache: 'reload'` (bypasses the HTTP cache; static hosts send cache headers such as `max-age=600`, which would otherwise precache old files); `addAll`. No `skipWaiting` here.
- **activate:** delete every cache whose name starts with `thrii-` and is not the current one; `clients.claim()` so the first install controls the page at once.
- **fetch:** see 3.4. Precached file: cache first. Navigation inside the app scope: the cached `index.html`. Everything else (other origins, `/api`, files not in the list): network, untouched.
- **message `skipWaiting`:** call `self.skipWaiting()`. Only the page sends it, after the user's tap.

### 3.3 Page side (in `src/app/main.js`)

1. Register: `navigator.serviceWorker.register('./sw.js', { type: 'module', updateViaCache: 'none' })`.
2. Check for updates on start and each time the page becomes visible again (`visibilitychange`): `registration.update()`. An installed app on a phone may stay open for days; without this it would check rarely.
3. When a worker is waiting (`registration.waiting`, or `updatefound` then `installed` while a controller exists), show `UPDATE` (D5) through the mount handle, the same way connection status goes through `setConnection`. The runtime UI gets a callback, not the service worker.
4. On tap: post `skipWaiting` to the waiting worker; on `controllerchange`, `location.reload()`. The reload drops the amp connection; the user reconnects with CONNECT.
5. The tap is ignored while a preset upload, a memory save, or a restore is running (the app already knows these states in `presetFlow`). Closing the app fully also applies the update on the next start.
6. Never reload automatically.

### 3.4 Dev pages are not served from the cache

The worker registered from `index.html` has scope `/` on `localhost:8080` and would otherwise answer `dev.html` and `test/runner.html` module requests from its cache. Rule in the fetch handler: answer from the cache only when the request is a navigation to the app (`./` or `./index.html`) or comes from a client whose URL is the app page (`clients.get(event.clientId)`); everything else goes to the network. A few lines, and it keeps the development pages on fresh files without touching them. `/api/*` is never cached, on any page.

### 3.5 Release steps (what you do for a new version)

1. Change `APP_VERSION` in `src/app/version.js` if you want a new number.
2. `python scripts/check_release.py --stamp` (regenerates the precache list and `BUILD`).
3. `python scripts/check_release.py` (must pass), commit, push.
4. The Pages workflow checks, tests and deploys; the installed app shows `UPDATE` the next time it opens or comes to the front.

### 3.6 When the user does not tap `UPDATE`

Nothing is lost and nothing breaks; the update simply waits.

- **The running app stays on its version, complete and consistent.** The old service worker keeps serving the old cache, and the old cache is deleted only when the new worker activates. Old and new files are never mixed.
- **The new worker waits** (state "waiting") until either the user taps `UPDATE` or **no window of the app is open any more**. Then the browser activates it by itself, and the next start runs the new version. On a phone, "no window open" means the app is closed (swiped away from the recent apps), not just switched away from. A reload alone does not activate it, because the old page is still open while the new one loads (and the reload is blocked anyway, 4.2).
- **`UPDATE` comes back on every start and every return to the front** while a worker is waiting (`registration.waiting` is checked each time, 3.3 step 3), so the user can tap it whenever it suits them, for example when no amp is connected.
- **Several skipped releases do not pile up.** If a newer version is published while one is waiting, the newer one installs and replaces the waiting one; the user goes straight to the latest.
- **Offline:** the update check fails quietly and the app runs from its cache; the next check online picks the update up.
- **Never applying it:** an app that is never closed (it stays on the screen with the wake lock) stays on the old version until `UPDATE` is tapped. That is accepted: the app never restarts itself while it might be talking to the amp.

---

## 4. Screen, reload and offline behaviour

### 4.1 Screen stays on (Wake Lock)

`src/app/wakeLock.js`, used from `main.js` only (an app-shell concern, not runtime UI and not protocol):

- `navigator.wakeLock.request('screen')` on start, and again on each `visibilitychange` to visible (the browser releases the lock whenever the page is hidden).
- Unsupported browser or a rejected request (battery saver, page not visible): ignore silently. The app works the same, only the screen may dim.
- With D4 alternative: request on connect and release on disconnect instead, driven from the same `transport:status` path boot already uses.
- Needs HTTPS or localhost. Supported in Chrome on Android and desktop.
- Side effect wanted: Chrome keeps the visible page running, so a BLE connection is not dropped by a screen lock.

### 4.2 No accidental reload

A reload restarts the app: the amp connection drops, and an upload or memory save in progress is cut off.

- **Pull-to-refresh (swipe down):** `overscroll-behavior-y: none` on `html` and `body` in `src/ui/runtime/runtime.css`, and `overscroll-behavior: contain` on the scrolling lists (preset library, AI sounds), so reaching the end of a list does not hand the swipe to the browser. Chrome on Android honours this in a tab and in the installed app. (The installed app in `standalone` mode has no pull-to-refresh in current Chrome anyway; the CSS covers the browser tab and older versions.) Pure CSS, no script.
- **F5, Ctrl+R, closing the tab (PC):** `beforeunload` with `preventDefault()` while an amp is connected, so Chrome asks "Leave site?". Lives in `main.js`; reads the connection state from the boot handle. It is removed before the deliberate reload of the `UPDATE` tap (3.3), and `dev.html` does not install it (frequent reloads while developing).
- Not preventable and not needed: the system back gesture closing the installed app, and Android killing it in the background. Wake Lock keeps it in front.

### 4.3 Offline operation (requirement)

**The app must work fully without internet, except Import AI.** Connecting to the amp, editing, memory slots, the presets screen, file import and export, and backups all work offline. The only exception is AI generation, whose button is then hidden.

The amp is reached over USB (Web MIDI) or Bluetooth (Web Bluetooth). Both are local radio or cable links that do not use the internet, so the only thing offline breaks is loading the app's own files. The service worker solves that:

1. **First start online.** The first visit (or install) must be online. The service worker then stores every file the app needs in its cache: `index.html`, `manifest.json`, the icons, every module and stylesheet under `src/` (including `src/ai/` and the symbol table in `src/data/`). The list is generated and checked by `scripts/check_release.py` (9D), so nothing can be missing.
2. **Every later start, online or not,** is served from that cache (cache first), so it opens the same with or without a network, and quickly.
3. **No runtime dependency on the network.** Checked on 2026-11-19: the shipped code loads no external fonts, scripts, or styles (the only external address is the SVG namespace string, which is not fetched). The only `fetch` outside Import AI is the symbol table, which the service worker answers from the cache (`cache: 'no-store'` in that call affects only the browser's HTTP cache, not the service worker).
4. **Saved data is local.** The presets list, the AI sounds list and the settings are in `localStorage`; preset files are read and written through the file picker. None of it needs a network.
5. **Import AI offline:** the health check at start fails, so the AI button is not shown (5.1). If the network drops while the AI screen is open, a generation fails with the existing message and the rest of the app carries on.
6. **Updates** need a network only to be found; offline the app runs the version it has (3.6).

Checks: T2 offline (9E) and H9 step 5 (airplane mode on the phone, with Bluetooth on).

---

## 5. Import AI in the released app

### 5.1 Showing the AI button only where it can work

Yes, the app can decide this itself, and it should ask the proxy rather than look at the host name. A host-name rule (`localhost` = on) would be wrong both ways: `python -m http.server` on localhost has no proxy, and a future host with a proxy would not be on the list.

- The Worker (already) and `scripts/serve.py` (9C) answer `GET /api/health` with `200` and a tiny JSON body, **without contacting the generator** (no cost to the authors).
- `src/ai/api.js` gets `aiAvailable()`: fetches `API_BASE + '/health'` with a 1.5 s timeout; `true` only on `200`. A missing proxy (404 or 403), offline (fails at once) and a slow network (times out) all hide the button.
- The shells (`index.html`, `dev.html`) decide: `presetSources: (await aiAvailable()) ? { importAi: aiPresetSource } : {}`. This keeps G-ai: `src/ai` stays self-contained and only the shells import it. An absent source already means no button (Phase 8).
- Checked once at start. If the network goes away later, a generation fails inside the AI screen as it does today.

| `API_BASE` | Where the app runs | Health answer | AI button |
|---|---|---|---|
| Worker (current) | localhost, any server | 200 | shown |
| Worker | hosted app, origin in `ALLOWED_ORIGINS` | 200 | shown |
| Worker | hosted app, origin not listed | 403 | hidden |
| Worker | Worker deleted | fails | hidden |
| `'/api'` | `python scripts/serve.py` | 200 | shown |
| `'/api'` | `python -m http.server` | 404 | hidden |
| any | offline (installed app) | fails | hidden |

### 5.2 The hosted proxy

The standalone Worker `cloudflare/proxy-worker.js` (1.1, setup in `doc/cloudflare_proxy_worker.md`): forwards `/api/*` to `https://api.amplifier-presets.com` with the site's `Origin` and `Referer`, answers `/api/health` itself, and adds CORS headers for the origins in `ALLOWED_ORIGINS` and for localhost. It is deployed by pasting the file in the dashboard; connecting it to GitHub (a `wrangler.toml`) is optional and later.

### 5.3 The authors' permission

amplifier-presets.com is free for everyone by its authors' choice, and the app does not change how much their backend is used: a generation through the app is the same generation the user could make on their site. What needs the authors' consent is that the proxy presents itself to their backend as their own website (`Origin` and `Referer` headers). The proxy is therefore a plain forwarder with no access control, and the plan is:

1. **Deploy** the app with the proxy as in 5.2.
2. **Contact the authors** with the app's URL: credit for their work (already shown in the app, `CREDIT` in `src/ai/config.js`), an invitation to try this front end to their generator, and the question of which they prefer: (a) they allow the app's origin on their API (CORS), or (b) the app keeps using the proxy.
3. **Apply their answer:**
   - (a) `API_BASE` in `src/ai/config.js` becomes their API URL, and the Worker is removed (then `aiAvailable()` checks their API instead of `/health`).
   - (b) Nothing changes.
   - If they decline: delete the Worker. `/api/health` then fails, the AI button hides itself (5.1), and the rest of the app is unaffected. No code change in the app.

---

## 6. Phase 9: PWA shell and release check (revised)

**Status 2026-11-19: 9.0 to 9F done offline; 9D steps 4 and 5 (your GitHub and Cloudflare settings) and H9 pending.**
Verified offline: release check passes (61 files); unit tests headless PASS 185 FAIL 0 (two new: AI availability, version and update button); gates G-debug, G-ui-boundary, G-ai clean. In headless Chrome (DevTools protocol, release copy served locally): the app renders with the version under CONNECT, the service worker installs and controls the page, all 60 files are cached, no console errors, installable with a valid manifest; with the server stopped the app starts from the cache with all knobs and `dev.html` is not served from it; a new release shows the update button, the running app stays on its version until the press, the press reloads into the new version and the old cache is deleted; a skipped update is applied by closing and reopening the app. The top strip fits at 390 px with the update button shown. Not verified: anything on the phone, the GitHub Pages workflow itself, Wake Lock, the reload guard, the AI button hidden with no internet (covered by a unit test only).

Implementation notes (differences from the steps below): the update button is a `⇪` icon left of CONNECT (`.strip-update-button`), and the version shows as a small `v1.0.0` caption under CONNECT. If an amp is connected, pressing it asks first ("Updating restarts the app and disconnects the amp"). `boot()` now also returns `isConnected`, `isBusy` and `setAppInfo` for `main.js`. `.gitignore` ignores `dist/`.

### 9.0. Green tests first — done 2026-11-19

- The tests now load their sample presets from `test/fixtures/presets/` (10 files, approved): `01. EarlyVH` (from `doc/`), the two generator exports `walsh-hotel-solo` and `neo-classical-fury`, and seven more from your collection that the presets-screen test imports by name. Changed: `boot.test.js`, `preset.test.js`, `presetFlow.test.js`, `presets.test.js` (paths only). No golden file changed.
- The three presets-screen time-outs had the same cause (missing files), not headless timing.
- Result headless: **PASS 183 FAIL 0**. The testing approach is written up in `doc/testing.md`.

### 9A. Symbol table data

1. `[AGENT]` Copy `doc/thr10ii_w_symbol_table_1_44_0_a.json` to `src/data/` (JSON only).
2. `[AGENT]` Point `SYMBOL_TABLE_URL` in `src/app/boot.js` and the default in `src/protocol/symbolTable.js` at `src/data/`. Update the comment in `symbolTable.js` line 1.
3. `[AGENT]` Point the six unit tests (R3) at `src/data/`.
4. Done when: runner `PASS n FAIL 0` with the same n as before.

### 9B. Shell, manifest, icons

1. `[AGENT]` `index.html`: same as `thrii_ui.html` but imports `src/app/main.js`, links `manifest.json`, has `theme-color` `#ede6d2`, and loads the AI plug-in through the health check (5.1).
2. `[AGENT]` `src/ui/runtime/runtime.css`: overscroll rules (4.2); `src/presets/presets.css` and `src/ai/aiPresets.css`: `overscroll-behavior: contain` on their lists.
3. `[AGENT]` `manifest.json`: `id` `./`, `name` `THR-II Controller`, `short_name` `THR-II`, `start_url` `./`, `scope` `./`, `display` `standalone`, `orientation` `portrait`, `theme_color` and `background_color` `#ede6d2`, icons 192 and 512 PNG (`purpose` `any`) and one 512 PNG (`purpose` `maskable`).
4. `[AGENT]` `icons/`: generated placeholder PNGs (P8), made once with a throw-away Python script in the scratchpad; only the PNGs are kept.

### 9C. App bootstrap, version, wake lock

1. `[AGENT]` `src/app/version.js` (3.1).
2. `[AGENT]` `src/app/wakeLock.js` (4.1).
3. `[AGENT]` `src/app/main.js`: `boot()`, wake lock, the reload guard (4.2), service worker registration and the update flow (3.3). Passes the version and the update callback through the mount handle.
4. `[AGENT]` Import AI availability (5.1): `aiAvailable()` in `src/ai/api.js`; `index.html` and `dev.html` use the check; `/api/health` in `scripts/serve.py` (a few lines, so `API_BASE = '/api'` keeps working for local use).
5. `[AGENT]` `src/ui/runtime`: render the version and `UPDATE` (D5) from values given through the mount handle. No service worker or protocol code under `src/ui/runtime` (G-ui-boundary).

### 9D. Service worker and release check

1. `[AGENT]` `sw.js` (3.2, 3.4) with a `PRECACHE` array written by the script.
2. `[AGENT]` `scripts/check_release.py` (standard library only):
   - Builds the release set: `index.html`, `manifest.json`, `icons/*`, `sw.js`, and every file under `src/` except `src/debug/` and `src/ui/debug/` (`src/ai/` is included, D3).
   - `--stamp`: writes that list (minus `sw.js`) into `PRECACHE` in `sw.js` and the hash into `BUILD` in `src/app/version.js`.
   - Check mode fails when: `PRECACHE` differs from the release set; any entry does not exist; any entry is `dev.html` or under an excluded folder; any shipped file imports an excluded path (G-debug, G-ai, read from `import` lines and `new URL(...)`); `BUILD` is stale.
   - `--out <dir>`: runs the check, then copies the release set into `<dir>` (what the Pages workflow publishes, D1).
3. `[AGENT]` `.github/workflows/pages.yml`: on push to `main` (and by hand): check out, `python scripts/check_release.py`, `python scripts/run_tests.py` (9F), `python scripts/check_release.py --out dist`, then GitHub's `upload-pages-artifact` and `deploy-pages` actions. A failed check or test stops the deploy.
4. `[HUMAN]` GitHub: Settings → Pages → Source: **GitHub Actions**. Only you can do this.
5. `[AGENT]` + `[HUMAN]` Add `https://hnikolov.github.io` to `ALLOWED_ORIGINS` in `cloudflare/proxy-worker.js` and to `doc/cloudflare_proxy_worker.md`; you paste the file into the Worker and deploy.

### 9F. Tests: local, offline, and automatic

How the tests run, and what they need:

- **They never use the network or the Worker.** Every test runs against the local server: modules, fixtures and the symbol table are fetched from `localhost`. The AI tests pass a fake `fetch` into `createApi` and play the backend themselves (`test/unit/aiPresets.test.js`); the new `aiAvailable()` gets the same kind of test (200, 404, failure, timeout). The amp is `test/support/fakeAmp.js` and timers are `test/support/fakeClock.js`. So the tests run the same with the internet off.
- **By hand (as today):** `python -m http.server 8080`, open `http://localhost:8080/test/runner.html`.
- **Automatic, one command:** `[AGENT]` `scripts/run_tests.py` (standard library only): starts a local server on a free port in a thread, runs the installed Chrome headless on `test/runner.html` (`--headless=new --dump-dom` with a time budget, in a throw-away profile), reads `#summary` and `#failures` from the page, prints them, and exits non-zero on any failure. Works offline. A trial version of exactly this produced the 1.1 result.
- **On every push:** the Pages workflow (9D step 3) runs the same script on GitHub's runner (Chrome is preinstalled there) before it deploys, so a red test never reaches the installed apps.
- **Optional:** the pre-commit hook of D7 can run it too.

### 9E. Checks

- **T1:** `python scripts/run_tests.py` and the browser runner both `FAIL 0`.
- **Gates:** `python scripts/check_release.py` passes; G-debug, G-ui-boundary, G-single-writer, G-ai by grep.
- **T2 (Chrome, localhost):** `index.html` loads with no console errors; manifest valid and install offered (DevTools Application panel); offline reload renders the shell; `dev.html` and `test/runner.html` still load fresh files with the worker active (edit a file, reload, see the change).
- **T2 update:** change `APP_VERSION`, stamp, reload `index.html`: `UPDATE` appears; tap: page reloads with the new version shown; the old cache is gone.
- **T2 AI availability:** with the Worker as `API_BASE`, the AI button shows on localhost; with `API_BASE` set to an address that answers 404 (temporarily), it is hidden; the check sends only `/health` (Network panel).
- **T2 skipped update:** with an update waiting, close every app tab, open the app again: the new version runs without a tap.
- **T2 overscroll:** in Chrome DevTools phone emulation, a downward drag at the top of the main screen and of each list does not reload.

### Human gate H9

On the phone (Chrome, Android), from `https://hnikolov.github.io/THRII-Controller/`:

1. Install the app (Add to home screen); it opens standalone, portrait, with the version shown.
2. Allow the MIDI (SysEx) and Bluetooth permissions; connect over BLE (and over USB-OTG if available); run the H0 smoke subset.
3. Leave the app untouched for longer than the phone's screen timeout: the screen stays on and BLE stays connected.
4. Push a version bump; bring the app to the front: `UPDATE` appears; tap it while connected: reload, reconnect, the new version shows. Push another bump and do not tap: close the app from the recent apps and open it again: the new version shows.
5. Airplane mode (Bluetooth turned back on), start the app: it opens from the cache with no AI button; connect over BLE, change a knob, switch a memory slot, load a preset from the presets screen, import a file: all work.
6. Swipe down at the top of the main screen and of each list: no reload, the connection stays.
7. Import AI: the AI button shows; generate one sound and import it to the amp (H8a to H8b on the phone).
8. Expected and not a failure: the preset and sound lists from `localhost` are not there (R11).

On the PC: the same install and H0 smoke subset over USB.

**Stop if:** the release check finds a debug path in the release set, or an update reloads the page without a tap.

---

## 7. Phase 10: Retire the legacy prototype (revised)

**Status 2026-11-19: done offline; H10 pending.** Phase 9 was accepted after your first checks on GitHub Pages (app installed on Android, AI generation works without an amp). `thrii_ctrl.html` moved with `git mv` to `legacy/thrii_ctrl.html`; its 11 module imports now use `../src/` and the symbol table `../doc/`. Loaded headless from its new place: all modules and the symbol table (373 entries) load, no console errors. `thrii_ui.html` removed (`git rm`). Text updated: `CLAUDE.md` (intro, pages table, standing gates now name `index.html` and `sw.js`), `architecture.md` ("current implementation" text and the migration list, not the diagram), `dev.html` (comment), `doc/release.md`, and the links to the legacy page in `doc/thrii_sysex_implementation_spec.md` and `doc/thrii_sysex_parser.md`. Left as they are: test comments and `test/fixtures/smoke-baseline.json`, which record that a value came from the legacy page. Release check passes (no shipped file changed, so no new stamp); unit tests PASS 185 FAIL 0.

**Run only after H9 passes.**

### 10A. Move the legacy page

1. `[AGENT]` Move `thrii_ctrl.html` to `legacy/thrii_ctrl.html`; change its `doc/` paths (lines ~526, 764, 774, 787) to `../doc/`. It must still load and connect (smoke only, not extended).

### 10B. Remove `thrii_ui.html` (P5)

1. `[AGENT]` Delete `thrii_ui.html`.
2. `[AGENT]` Update the references: `CLAUDE.md` (pages table, commands, standing gates), `architecture.md` ("current implementation" text only, not the diagram), `dev.html` (comment or link), `plan.md` (status table, sections 1 to 3), `scripts/serve.py` docstring if it names it.
3. `[AGENT]` Grep: no file outside `plan.md` history notes names `thrii_ui.html`; nothing under `src/`, `index.html`, `sw.js` names `legacy/` or `doc/`.

### 10C. Checks

- Runner `FAIL 0`; `python scripts/check_release.py` passes (no stamp change is needed, since no shipped file changed; if one did, stamp and bump).
- `legacy/thrii_ctrl.html` loads with no console errors.

### Human gate H10

Full H0 checklist on the installed PWA on the phone (BLE) and on the PC (USB). Phase complete only on full PASS.

---

## 8. `dev.html` after Phase 10

`dev.html` stays as the development and debugging page, and it does **not** load `index.html`. It does not need to:

- `index.html` and `dev.html` are both thin shells over the same `boot()` in `src/app/boot.js`. The left pane of `dev.html` already runs exactly the runtime that `index.html` runs (same modules, same layout, same AI plug-in and health check). Any runtime change shows in both.
- Loading `index.html` in an iframe would break the debug panel: an iframe gets its own copy of every module, so the raw trace would no longer see the runtime's event bus (plan.md section 2 records this decision).
- What only `index.html` adds is app-shell behaviour that would get in the way while developing: the service worker (cached files), the reload guard, the update button, and the wake lock. `dev.html` leaves these out on purpose.
- `dev.html` is never deployed (not in the release set) and never served from the service worker's cache (3.4), so it always runs the files on disk.

What Phase 10 changes in `dev.html`: only text that names `thrii_ui.html`.

---

## 9. Phase 11: Structure review and cleanup

**Status 2026-11-19: done offline; H11 pending.** D11 decided: the legacy page is deleted, kept one checkout away under the git tag `legacy-prototype` (on commit `1e835bf`, the last one where it ran next to its `src/`). Result per finding:

| # | Result |
|---|---|
| F1 | Done: `counter.js`, `paramWrite.js`, `upload.js` merged into `builders.js` (the counter-overflow and upload-pacing comments kept, "legacy page" reworded to "original prototype"). |
| F2 | Done: `activation.js` merged into `identity.js` (`ACTIVATION_SPACING_MS` no longer exported). |
| F3 | Done: `applyDumpPatch.js` merged into `applyDeviceEvent.js`. |
| F4 | Not done (optional): two debug folders kept; merging them changes the normative tree in architecture.md and the debug-isolation rules for 44 lines. |
| F5 | Done: `core/values.js` merged into `builders.js`. |
| F6 | Corrected: there was no import from state into protocol; the real issue was the name normalization written three times (selectors.js and twice in symbolTable.js). Now one `normalizedParamName` in `symbolTable.js`, imported by the state layer. |
| F7 | Done for `readShadowParamByName`, `getLatestShadowUnitById`, `getLatestShadowUnitByName` (inlined into `findUnitByName`), `buildShadowParameterIndex`, `parseOutgoingFrameMeta`; their 3 tests removed, 1 test added for `findUnitByName`. **Open:** `buildAskGlobalParameter`, `buildSetModuleEnabled`, `buildSetModuleParameter` are unused but driven by 4 cases in `test/fixtures/builders.cases.json`; removing them needs your OK for that fixture. `loadNameOf` kept (tests use it). |
| F8 | Done: `src/presets` moved to `src/ui/presets`. |
| F9 | Not done (optional): splitting `runtime.css` would add files without removing code. |
| F10 | Done: plans archived to `archive/plans/`; no file outside the archive refers to a plan file. |

`src/` went from 57 files (the 53 of the baseline plus the 4 added in Phase 9) to 51: six files merged away. Unit tests PASS 183 FAIL 0. Release stamped, `APP_VERSION` 1.0.1.

**Run after H10 passes and the planned features are done.** A cleanup with no behaviour change: same wire bytes, frame order, timing and state shape (plan.md section 0).

Why it waits until after Phase 10: the legacy page imports from `src/` (`counter.js`, `values.js`, `builders.js`, `selectors.js` and more), so merging or deleting those files earlier would break it, and code used only by the legacy page can go only once it is retired.

### 11A. Baseline (review of 2026-11-19)

| Area | Files | Lines |
|---|---|---|
| `src/` | 53 | ~7,150 (JS ~5,575, CSS 1,576) |
| `test/` | 30 | 3,533 |
| Pages | 3 | 5,171 (`thrii_ctrl.html` 5,082) |
| Root Markdown besides `README.md` and `CLAUDE.md` | 11 | |

Findings:

| # | Finding | Planned action |
|---|---|---|
| F1 | `protocol/counter.js` (9), `paramWrite.js` (11), `upload.js` (33) all build outgoing frames; `upload.js` wraps `buildUploadUserSettingsFrames`. | Merge into `builders.js`; keep the counter overflow comment. |
| F2 | `protocol/activation.js` (22) exists to obtain and use the identity. | Merge into `identity.js`. |
| F3 | `state/applyDumpPatch.js` (37) and `applyDeviceEvent.js` both apply amp data to the store and share `ensureUnit`. | Merge into one file. |
| F4 | `src/debug/` (29) and `src/ui/debug/` (15): two folders for 44 lines. | Optional: one `src/debug/` folder; update architecture.md text and the debug-isolation instruction file. |
| F5 | `core/values.js` (11) used only by `builders.js` once the legacy page is gone. | Move into `builders.js`. |
| F6 | Layering leak: `protocol/symbolTable.js` imports `normalizedParamName` from `state/selectors.js` (protocol depends on state). `state/applyPreset.js` imports `thrTypeCode` from protocol (minor). | Move `normalizedParamName` into `symbolTable.js`; leave the second unless it grows. |
| F7 | Exports used only by the legacy page and tests: `readShadowParamByName`, `getLatestShadowUnitById`, `getLatestShadowUnitByName`, `buildShadowParameterIndex`, `buildSetModuleEnabled`, `buildSetModuleParameter`, `buildAskGlobalParameter`, `parseOutgoingFrameMeta`. | Remove with their tests, unless the legacy page is kept and still imports them (D11). |
| F8 | Preset code across five folders; `src/presets` is a UI screen (like `src/ai`) while `src/domain` holds one preset file. | Rename `src/presets` to make its role clear (e.g. `src/ui/presets`); keep the layer split. |
| F9 | `src/ui/runtime/runtime.css` (997 lines) is the largest file. | Optional: split by screen, as `presets.css` and `aiPresets.css` already are. |
| F10 | Root holds 11 planning and note files; several plans are implemented. | Move to `docs/plans/`, finished plans marked as such or archived. |

**D11 (decide before Phase 11):** after Phase 10, is `legacy/thrii_ctrl.html` still needed? If not, delete it (it stays in git history) and F5 and F7 apply in full. If yes, freeze it with its own copies of the few `src/` functions it uses, so `src/` no longer has to serve it.

### 11B. Steps

1. `[AGENT]` Re-run the review the same way: file and line counts per folder, exports used outside their file, imports that go against the layer order, files under ~40 lines, files over ~500 lines.
2. `[AGENT]` Compare with 11A: mark each finding **fixed**, **still open**, or **no longer applies**, and list new findings. Report this to you before changing anything.
3. `[AGENT]` Apply the agreed actions one finding at a time; after each, runner `FAIL 0` and the standing gates (G-debug, G-ui-boundary, G-single-writer, G-ai) by grep.
4. `[AGENT]` Update every text that names a moved or merged file: `CLAUDE.md`, `architecture.md` (text only, not the diagram), the instruction files, `plan.md`.
5. `[AGENT]` Shipped files changed, so: `python scripts/check_release.py --stamp`, bump `APP_VERSION` (patch number), `python scripts/check_release.py`.

### 11C. Checks

- Runner `FAIL 0` with the same test count, minus only the tests removed with F7.
- Golden fixtures and transcripts unchanged (any needed change stops the phase, plan.md section 0).
- `dev.html?source=mock` and `index.html` render as before (screenshots at 390x844).

### Human gate H11

Short smoke on the installed PWA (connect, knob, slot press, preset import, Import AI) after the update has been applied on the phone.

---

## 10. Files

| Phase | Creates | Modifies | Must not touch |
|---|---|---|---|
| 9 | `index.html`, `manifest.json`, `sw.js`, `icons/*.png`, `src/app/main.js`, `src/app/version.js`, `src/app/wakeLock.js`, `src/data/thr10ii_w_symbol_table_1_44_0_a.json`, `scripts/check_release.py`, `scripts/run_tests.py`, `.github/workflows/pages.yml`, `test/fixtures/presets/*.thrl6p` (with your OK) | `src/app/boot.js` (symbol URL, mount handle pass-through), `src/protocol/symbolTable.js` (default URL, comment), `src/ui/runtime` (version and `UPDATE` display, overscroll CSS), `src/presets/presets.css` and `src/ai/aiPresets.css` (overscroll), `src/ai/api.js` (`aiAvailable`), `scripts/serve.py` (`/api/health`), `dev.html` (AI health check), six unit tests (symbol path), `cloudflare/proxy-worker.js` and `doc/cloudflare_proxy_worker.md` (`ALLOWED_ORIGINS`) | `doc/`, goldens, wire bytes and timing, `thrii_ctrl.html` |
| 10 | `legacy/thrii_ctrl.html` (moved) | `CLAUDE.md`, `architecture.md` (text only), `dev.html` (text only), `plan.md` | `doc/`, architecture.md diagram, `src/` behavior |
| 11 | possibly `docs/plans/` (F10) | files named in 11A as agreed after 11B step 2; `CLAUDE.md`, `architecture.md` (text only), instruction files, `plan.md`; `src/app/version.js` and `sw.js` (stamp) | goldens, wire bytes and timing, architecture.md diagram |

---

## 11. What was checked and what was not

Checked in the code on disk: the symbol table URLs and every file that loads them; that `thrii_ui.html` is the shell `index.html` replaces and how it adds the AI plug-in; that the CSS for presets and AI is loaded at run time through `import.meta.url`; that the lists use `localStorage`; that all flags default to on; that the connection status reaches the view through the mount handle; the `/api` proxy in `scripts/serve.py`.

Also checked: `dev.html` calls the same `boot()` as `thrii_ui.html` and adds the AI plug-in the same way; `serve.py` routes only `/api/*` to the generator.

Not checked (by reasoning or documentation only): module service worker update behaviour, Wake Lock and `overscroll-behavior` on your phone's Chrome version; GitHub Pages cache headers and the Pages workflow on this repository; headless Chrome on GitHub's runner; whether the phone keeps BLE connected with the screen held on. These are what H9 tests.
