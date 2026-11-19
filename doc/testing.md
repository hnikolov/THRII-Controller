# Testing

How the THR-II Controller is tested, what the tests need, and how to run them. There is no Node.js and no test framework to install: the tests are ES modules that run in the browser, and the tooling around them is Python (standard library only).

## What the tests need

**Only the files in this repository and a local web server.** The tests never use the internet, the Cloudflare proxy Worker, or an amplifier, so they run the same offline.

| What the app normally uses | What the tests use instead |
|---|---|
| The amp over USB or Bluetooth | `test/support/fakeAmp.js`: boots the real app with a fake transport that answers like the amp (identity reply, dumps, acknowledgements) |
| Real timers (write coalescing, sync timeouts, pacing) | `test/support/fakeClock.js`: time is advanced by the test, so timing rules are checked exactly and quickly |
| The preset generator (through the proxy) | A fake `fetch` passed into `createApi` (`test/unit/aiPresets.test.js`): the test plays the backend, including failures and slow answers |
| Bytes captured from the amp | Transcripts in `test/fixtures/transcripts/`, read by `test/support/transcripts.js` |
| Preset files | Sample `.thrl6p` files in `test/fixtures/presets/` |
| The symbol table | The same JSON file the app loads, fetched from the local server |

Expected results that must not drift (byte-level frames, the canonical state after an import) are golden files in `test/fixtures/*.golden.json`. They are changed only with the owner's approval.

## How the tests are written

- `test/support/assert.js` is the whole harness: `it(name, fn)`, `assertEqual`, `assertDeepEqual`, `assertTrue`. A test is an `async` function; a thrown error is a failure.
- One file per module or feature in `test/unit/`, named `<topic>.test.js`.
- **A new test file runs only once it is imported in `test/runner.html`.**
- Pure modules (bytes, builders, parsers, store, scheduler) are tested directly. Features that cross layers (connect, sync, preset import, the presets and AI screens) are tested through `bootApp()` from `fakeAmp.js`, which runs the real composition in `src/app/boot.js` against the fake amp and clicks the real UI.

## Running the tests

### In the browser (by hand)

From the repository root:

```
python -m http.server 8080
```

Open `http://localhost:8080/test/runner.html`. The page shows `PASS n FAIL m` at the top and the failure messages below. There is no per-test filter: to run one file, narrow the imports in `test/runner.html` for the moment.

### With one command (headless)

```
python scripts/run_tests.py
```

Added in Phase 9 (step 9F of `plan_pwa.md`). It starts a local server on a free port, opens `test/runner.html` in the installed Chrome without a window (headless, in a throw-away profile), waits for the run to finish, prints the summary and the failures, and exits with a non-zero code when any test fails. It needs Chrome and Python, nothing else, and works offline.

### Automatically on every push

The GitHub Pages workflow (`.github/workflows/pages.yml`, Phase 9) runs the release check and `scripts/run_tests.py` on GitHub's runner before it publishes the app. A failing test stops the deploy, so it never reaches the installed apps.

## Other checks

- **Release check:** `python scripts/check_release.py` (Phase 9) checks that the published file list is complete, contains no debug code, and that the version stamp is current.
- **Standing gates:** the import rules in `CLAUDE.md` (no debug imports in runtime code, no protocol imports in the runtime UI, every state change through `commit`), checked with grep after changes.
- **Hardware:** the real amp over USB and Bluetooth is tested by hand with `dev.html`, following the checklists in the plans. Unit tests cannot replace this; a change is called verified on hardware only after such a check.
