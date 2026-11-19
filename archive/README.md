# Archive

History of how the app was built. Nothing here is maintained or used by the app, the tests, or the tools; links inside these files may point to files that no longer exist.

## plans/

The plans of the migration from the single-file prototype to the modular app, as they stood when the work was finished (2026-11-19):

| File | Covers |
|---|---|
| `plan.md` | The migration plan: phases 0 to 8, decisions, hardware findings and checks |
| `plan_pwa.md` | Phases 9 to 11: installable offline app, versioned updates, retiring the prototype, the structure cleanup |
| `plan_ui.md`, `plan_ui_simple.md`, `new_ui_plan.md` | Design iterations of the Import AI screen |
| `presets_ui_plan.md` | Design of the Presets screen |

## The legacy prototype

`thrii_ctrl.html`, the original single-file prototype, was removed. It is kept one checkout away under the git tag `legacy-prototype`:

```
git checkout legacy-prototype
python -m http.server 8080
```

then open `http://localhost:8080/thrii_ctrl.html`. Return with `git checkout main`.

## Where things live now

- How the app is built: `architecture.md`, `CLAUDE.md`
- Testing: `doc/testing.md`
- Publishing and updates: `doc/release.md`
- Protocol notes: `doc/`
