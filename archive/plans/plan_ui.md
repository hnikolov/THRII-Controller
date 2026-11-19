# THR-II Controller: UI improvement plan

**Status:** implemented offline on 2026-11-16 (U1 to U5, step U5.2 and the human checks open), with the recommended answers of section 7. See the outcome in section 9.

**Scope:** the runtime UI only (`src/ui/runtime`, `src/ai`, the composition hook in `src/app/boot.js`). No change to wire bytes, frame order, timing, state shape or golden fixtures. The rules of `plan.md` and `CLAUDE.md` apply unchanged; where this plan replaces text of `plan.md` Phase 8 (pop-up placement and mock-up in 8.2 and 8.3), `plan.md` gets a pointer to this file when the work is done.

**Read first:** `.github/instructions/mobile-runtime-ui.instructions.md`, `plan.md` Phase 8 (rules 8.1, contract 8.2), `src/ui/runtime/unitSelectorView.js`, `src/ui/runtime/memoryView.js`, `src/ai/aiPresets.js`.

---

## 1. Summary

| # | Your point | Assessment | Proposal |
|---|---|---|---|
| 1 | Amp menu misses the THR-II markings (Clean, Crunch, Lead, ...) | Agreed. The eight rows of the menu already are the eight positions of the amp's selector, in order; only the labels are missing. | A narrow label column at the left of the menu, in a muted style (section 2). |
| 2 | Presets menu is old-fashioned; five identical "Save to" items | Agreed. Ten rows, of which five differ by one digit. | Three titled sections; the five saves become one row of slot buttons (section 3). |
| 3 | Import AI needs two presses every time | Agreed. It is a place you go back and forth to, not a one-off action, so it does not belong in an action menu. | An AI toggle button in the top strip, next to PRESETS (section 4). |
| 4 | The pop-up wastes space; make it part of the app | Agreed. The pop-up loses 40 px above, 14 px each side, its own title bar, and it hides the PRESETS menu and the name. | The AI screen takes the place of the knob area, between the top strip and the memory strip, edge to edge (section 5). |
| 5 | Add the pickup configuration input | Agreed, and the request field is now known (section 5.4). | Fourth input, optional, sent as `pickupConfiguration`. |
| 6 | Fit four inputs, the button and the status without clutter | See the layout in section 5.2. | Labels sit in the field borders; guitar and pickups share a row; the amp list moves into the button row; one status line. |

Three things in this plan go beyond your list; each is marked as optional or as a question:

- The AI screen stays alive when you switch back to the knobs, so a generation keeps running while you play (section 5.3). Today the pop-up locks itself for the whole wait.
- The PRESETS menu stays usable on the AI screen, so "generate, then save to memory 3" needs no screen change.
- Suggestions for the pickup field (single coil, humbucker, P90, ...) without extra code (section 5.4).

---

## 2. Amp selection menu

### 2.1 Design

The row order in `layout.js` (`AMP_FAMILIES`) is the order of the amp's selector: Clean, Crunch, Lead, Hi Gain, Special, Bass, Aco, Flat. The menu gets a fourth column at the far left that names each row.

```
 BRIT ▼
┌──────────────────────────────────────────────────┐
│            CLASSIC      BOUTIQUE     MODERN      │  red / blue / green, as today
│           ──────────   ──────────   ──────────   │
│ clean   │ DELUXE       JUNIOR 2     CARMEN       │
│ crunch  │ DC30         MINI         SR101        │
│ lead    │ LEAD         BLONDIE     ▐BRIT▌        │  selected model: bold, as today
│ hi gain │ MODERN       F LEAD       BROWN 2      │
│ special │ BROWN 1      SOUTH        STEALTH      │
│ bass    │ EDEN BASS    MESA BASS    JK BASS 2    │
│ aco     │ CONDENSER    TUBE         DYNAMIC      │
│ flat    │ FLAT         FLAT B       FLAT V       │
└──────────────────────────────────────────────────┘
```

- **Style of the row labels:** `--muted` colour, 9 px, normal weight, right-aligned, with a thin `--line` rule between them and the models. They read as a legend, not as choices: no hover state, no pointer, not focusable.
- **The row of the selected model** has its label in `--ink`, so the current voicing is found at a glance.
- **Accessibility:** each model button gets an `aria-label` with its family and row ("Modern, Lead: Brit"); the label column itself is hidden from screen readers.
- The family LED tap (step to the next family, same row) is unchanged and now visibly matches the rows.

### 2.2 Width

The menu is as wide as its content. Estimated at 12 px bold: three model columns of about 85 px, two gaps of 10 px, the label column of about 50 px, 8 px padding: about 335 px of the 390 px frame. To be measured in a screenshot at 390 px (step U1.3); if it does not fit, the fallback is a 9 px label font and a 6 px column gap, not shorter names.

### 2.3 Implementation notes

- `layout.js`: `AMP_VOICES = ['Clean', 'Crunch', 'Lead', 'Hi Gain', 'Special', 'Bass', 'Aco', 'Flat']`, passed to the amp selector as `rowLabels`.
- `unitSelectorView.js`: when `rowLabels` is given, the grouped menu renders one more leading column. Rows must line up by construction, not by equal font metrics: the grouped menu becomes one grid with explicit rows (`grid-auto-flow: column`, nine rows) and the columns become `display: contents`.
- No change to values, intents or the view model apart from marking the selected row.

---

## 3. Presets menu

### 3.1 Design

```
 PRESETS ▼
┌────────────────────────────┐
│ FILE                       │
│  IMPORT        EXPORT      │
│ SAVE TO THR MEMORY         │
│  ┌───┬───┬───┬───┬───┐     │
│  │ 1 │ 2 │ 3 │ 4 │ 5 │     │
│  └───┴───┴───┴───┴───┘     │
│ ALL MEMORIES               │
│  BACKUP        RESTORE     │
└────────────────────────────┘
```

- Ten rows become three short sections; the menu is about half as high.
- The five slot buttons look like the memory buttons of the footer strip (same order, same proportions), so "save to 3" and "recall 3" are visibly the same slot.
- Section titles use the style of the amp menu's family titles (small, bold, underlined), in `--muted`.
- Import AI leaves the menu (section 4). Import Factory stays out until it exists.
- Every item keeps its action value (`export`, `import`, `save:1` ... `save:5`, `backup`, `restore`), so `presetFlow.js` and the frames it sends are untouched.

### 3.2 Implementation notes

`UnitSelectorView` already renders titled groups (the amp menu's columns). The presets menu uses the same `groups` input with a second arrangement: groups stacked vertically, the items of a group in a row. That is one CSS variant (`is-sections`) selected by a class, and no new view. The slot row is a group whose items are the five digits, with a class for the button look.

### 3.3 Considered, not proposed

- **Hold a footer memory button to save** (as on the amp itself). Fast, but invisible, easy to trigger by accident on a touch screen, and it competes with the browser's long-press menu. Could be added later on top of the menu; not instead of it.
- **A full-screen presets page.** Too heavy for seven actions.

---

## 4. Top strip with the AI button

```
today
┌────────────────────────────────────────────────┐
│ PRESETS ▼        USER MEMORY 1      FW 1.44.0.a │
└────────────────────────────────────────────────┘

proposed, knobs shown
┌────────────────────────────────────────────────┐
│ PRESETS ▼   AI     USER MEMORY 1    FW 1.44.0.a │
└────────────────────────────────────────────────┘

proposed, AI screen shown
┌────────────────────────────────────────────────┐
│ PRESETS ▼ ▐ AI ▌  WALSH HOTEL SOLO  FW 1.44.0.a │   AI lit: paper background, ink text,
└────────────────────────────────────────────────┘   like the selected memory in the footer

optional (5.3), generation running while the knobs are shown
│ PRESETS ▼   AI •   USER MEMORY 1    FW 1.44.0.a │
```

- One press shows the AI screen, the same button pressed again returns to the knobs. It is a toggle with `aria-pressed`.
- The button is there only when the shell passes the AI plug-in ("absent means invisible", rule 8.1.3 of `plan.md`, unchanged).
- The strip is 28 px high, which is small for a finger; the AI button is at least 40 px wide to compensate, and the gap to PRESETS stays 10 px or more.
- Width at 390 px with the 9 px strip font: PRESETS about 55, AI about 40, name up to 160, connection about 75, gaps 30: about 360 px. To be checked with CONNECTING showing (the longest connection text).

Alternative: a two-part switch `KNOBS | AI` instead of the lit toggle. Clearer about where the other press leads, about 35 px wider. See Q2.

---

## 5. Import AI as a screen of the app

### 5.1 Placement

The app frame has three rows: top strip, body, memory strip. The AI screen is a second body: it lies in the same row as the knob area and exactly one of the two is visible. The top strip (PRESETS, preset name, connection) and the memory strip stay where they are and keep working.

Gained against the pop-up at 390x844: the full width (390 instead of 340 px), about 790 px of height instead of a card that is cut off by its margins, no title bar, no Close button, no dimmed backdrop.

### 5.2 Layout

```
┌────────────────────────────────────────────────┐
│ PRESETS ▼ ▐ AI ▌  WALSH HOTEL SOLO  FW 1.44.0.a │
├────────────────────────────────────────────────┤
│ ┌─ SOUND ────────────────────────────────────┐ │
│ │ Joe Walsh, Hotel California solo           │ │  three text rows
│ │                                            │ │
│ │                                            │ │
│ └────────────────────────────────────────────┘ │
│ ┌─ GUITAR ───────────┐ ┌─ PICKUPS ───────────┐ │
│ │ Fender Stratocaster│ │ optional            │ │  one row, two fields
│ └────────────────────┘ └─────────────────────┘ │
│ THR10II WIRELESS ▼               [ GENERATE ]  │  amp list and button share a row
│ Imported Walsh Hotel Solo                      │  the one status line
├────────────────────────────────────────────────┤
│ GENERATED PRESETS                              │
│▌Walsh Hotel Solo    21:04  Joe Walsh, Hot…   × │  selected: gold bar and tint
│▌ Roll the guitar's tone back to 7 and use      │  its tip, directly under it
│▌ the neck pickup for the first phrases.        │
│ Walsh Hotel Solo    20:58  Hotel Californ…   × │
│ Clean Funk          20:41  Nile Rodgers r…   × │
│ Neo Classical Fury  19:12  Yngwie, fast h…   × │  the list takes the rest of the
│                                                │  height and scrolls
├────────────────────────────────────────────────┤
│ Presets by amplifier-presets.com               │  credit, in every state
│ Magnus Bredeli development · F. Hegelstad design│
├────────────────────────────────────────────────┤
│    1    │    2    │    3    │    4    │    5    │
└────────────────────────────────────────────────┘
```

How the space is saved:

- **Labels in the field border.** Each field's name is a small caption set into its top border (the look of a `fieldset` legend). No label rows, and the name stays visible when the field is filled, which a placeholder would not.
- **Sound first.** It is the field that changes on every try; guitar and pickups are typed once and kept. The form reads "what, on which guitar, go" (see Q3 for the alternative order).
- **Guitar and pickups share a row**, half the width each.
- **The amp list is demoted.** It is pre-selected from the connected amp and rarely touched, so it is a borderless dropdown in the look of the amp and cabinet selectors, left of the button, instead of a full field.
- **One status line** under the button row carries everything transient: "Generating 14 s", the import result, "Cancelled", errors (in red), and the "no amp connected" note. Its height is reserved, so nothing jumps when a message comes and goes. Today there are three places (progress, note, result status).
- **The tip belongs to the selected preset** and sits under its row, as now.
- **While generating,** the button reads CANCEL and the fields and list rows take no input.

Heights, estimated at 13 px text: sound 72, guitar and pickups 36, button row 30, status 18, gaps and padding 40: the whole form is about 200 px. On a phone with the keyboard open (about 340 px) the form and the status line stay fully visible above it; the list is what the keyboard covers.

**First use, no presets yet:** the list area shows two muted lines instead: how to describe a sound (artist, song, part), and that the preset is loaded at once.

### 5.3 Behaviour changes that come with the screen

- **Switching does not close anything.** The screen is built once and then only shown and hidden. A running generation continues while the knobs are shown; when it ends the preset is loaded as today (P20) and the status toast reports it. The rule "a stray press must not throw the wait away" is kept by construction, so the locks on Close, Escape and the backdrop disappear together with those controls.
- **Optional:** the AI button shows a dot while a generation runs in the background (sketch in section 4). It needs one more callback from the plug-in to the shell; see Q4.
- **Shown again:** the amp list is retried if the generator was not reachable, and the amp pre-selection follows a newly connected amp unless you picked one by hand.
- **Long operations** (import, save, restore) dim the AI screen like the knob area.
- **PRESETS on the AI screen** exports or saves the current settings, which after a generation are the generated preset.

### 5.4 Pickup configuration

Read from the site's own page script on 2026-11-16 (not from documentation; the contract stays unofficial):

- The site sends `pickupConfiguration` in the body of `POST /presets/generate`: the trimmed text, and the field is left out when the text is empty. Its placeholder on the site is "e.g. single coil". It is free text.
- `scripts/serve.py` forwards the request body unchanged, so the proxy needs no change.

Proposal:

- `api.js`: `generate` takes `pickup` and adds `pickupConfiguration` only when it is not empty.
- `aiPresets.js`: the PICKUPS field (optional; guitar and sound stay required). The text is kept like the guitar: in the stored draft and in every generated entry, and it returns to the form when an entry is loaded. Entries stored before this change have none and load with an empty field.
- **Optional:** a `<datalist>` with common answers (single coil, humbucker, P90, HSS, HSH, active humbucker). The field stays free text; the browser offers the list while typing. No script. See Q5.
- `ai_presets_example/CLAUDE.md` describes the request without this field. It is a reference folder that Phase 8 marked "must not touch"; the new field is recorded in the comment of `api.js` and in this plan instead (see Q6).

Not verified: that the backend accepts the field from this app. The first request with it is a real generation on the authors' backend and waits for your go-ahead, like step 8C.6 of `plan.md`.

### 5.5 How it stays a plug-in

Rule 8.1 of `plan.md` holds: `src/ai` imports nothing from the rest of `src`, nothing in `src` imports it, and gate G-ai is unchanged.

```
AI button -> intents.openPage('importAi') -> boot -> presetSources.importAi({ host, importText, ampModel })
                                                              host = the AI body element of the runtime
```

- The contract keeps its shape: `open({ host, importText, ampModel })`. `host` changes meaning from "the app frame, draw a pop-up over it" to "your own area, fill it". `open` is called on every showing: the first call builds the screen, later calls refresh it (5.3).
- `layout.js`: `importAi` leaves `presetMenu`; a new `pages` list holds `{ key: 'importAi', label: 'AI' }`. `boot` drops a page without a source, as it drops source menu items today.
- `appView.js` / `memoryView.js`: the strip button and the second body element. Which body is visible is view state of the runtime (allowed as transient view state by the mobile UI rules); it is not in the store.
- Both bodies share one grid cell and the hidden one keeps its size (`visibility`, not `display`), so the 390 px frame on `dev.html` does not change height when switching.
- `mount.js`: `overlayHost` is removed if nothing else uses it.
- `aiPresets.css`: the backdrop, card, title bar and Close rules go; the form and list rules are rewritten for the full-width screen.

---

## 6. Steps

Each block is independent and can be reviewed and merged on its own. Order: U1 and U2 first (small, no dependency), then U3, U4, U5.

**U1. Amp menu row labels**

1. `[AGENT]` `layout.js`: `AMP_VOICES`; `ampView.js` passes it as `rowLabels`.
2. `[AGENT]` `unitSelectorView.js` and `runtime.css`: label column, aligned rows, selected-row mark, `aria-label` per model.
3. `[AGENT]` Screenshot of the open menu at 390 px on `dev.html?source=mock`; apply the fallback of 2.2 if it is wider than the frame.

**Done when:** runner passes; the menu fits the frame; picking a model and the LED family step behave as before.

**U2. Presets menu sections**

1. `[AGENT]` `layout.js`: `presetMenu.groups` (File, Save to THR memory, All memories) with the existing action values; `boot.js` filters source items inside groups.
2. `[AGENT]` `memoryView.js` passes `groups`; `runtime.css`: the `is-sections` arrangement and the slot button look.
3. `[AGENT]` Tests that read the menu's items (`boot.test.js`) follow the new shape; the actions they trigger are unchanged.

**Done when:** runner passes; every action sends the same frames as before (existing preset flow tests untouched and green).

**U3. AI button and second body (runtime and hook)**

1. `[AGENT]` `layout.js` `pages`; `boot.js` filters them by `presetSources` and calls the source with the page element; `intents.js` `openPage`.
2. `[AGENT]` `memoryView.js`: the toggle button; `appView.js`: the second body, the switch, the busy dimming; `runtime.css`.
3. `[AGENT]` `boot.test.js`: no source, no button; with a fake source the button is there, the first press calls the source once with an element inside the app, a second showing calls it again with the same element, and the knob area returns on the next press.

**Done when:** runner passes; without the plug-in import in a shell the strip looks as today; G-ai, G-ui-boundary and G-debug hold.

**U4. AI screen layout**

1. `[AGENT]` `aiPresets.js`: build into the given host once, refresh on later calls; remove the pop-up, Close, Escape and backdrop handling; one status line; the empty-list hint.
2. `[AGENT]` `aiPresets.css`: the layout of 5.2.
3. `[AGENT]` `aiPresets.test.js`: the pop-up tests (backdrop, hide, reopen) are replaced by: built once, state kept across hide and show, a generation that ends while hidden still calls `importText` once and adds its entry. The request, list, delete, failure and credit tests keep their meaning.
4. `[AGENT]` Screenshots at 390x844 on the mock fixture with fixed API answers: empty, generating, result with a list, error, generator not reachable.

**Done when:** runner passes; gates hold; the form of 5.2 fits above a 340 px keyboard in the 844 px frame.

**U5. Pickup configuration**

1. `[AGENT]` `api.js`, `aiPresets.js` as in 5.4; test: the request body has `pickupConfiguration` when the field is filled and no such key when it is empty; a loaded entry restores the pickup text.
2. `[YOU]` Go-ahead for one real generation with the field filled; if the backend rejects it, the 422 text is reported and the field is taken out of the request again.

**Human checks (no new hardware behaviour; these are regression checks)**

- **HU1:** save to a memory from the new slot row, with the amp connected: the amp stores it as before.
- **HU2:** on a phone: the AI button and the slot buttons are easy to hit; the form stays visible with the keyboard open.
- **HU3:** start a generation, switch to the knobs, play; the preset arrives and the amp plays it.

---

## 7. Open questions

| # | Question | Recommendation |
|---|---|---|
| Q1 | Row label wording: as printed on the amp (CLEAN, CRUNCH, LEAD, HI GAIN, SPECIAL, BASS, ACO, FLAT)? Upper case in a smaller size, or lower case as in the sketch? | The amp's words, upper case, 9 px, muted. |
| Q2 | AI button: a lit toggle `AI`, or a two-part switch `KNOBS \| AI`? | Lit toggle; it is narrower and the strip is tight at 390 px. |
| Q3 | Field order: Sound first (changes most), or the site's order (guitar, pickups, sound)? | Sound first. |
| Q4 | The activity dot on the AI button while a generation runs in the background: now, or later? | Later; the status toast already reports the result. |
| Q5 | Pickup suggestions (`datalist`): yes or plain text field? | Yes; it costs one element and no script. |
| Q6 | May `ai_presets_example/CLAUDE.md` get the new field in its contract table, or does the folder stay frozen? | Stays frozen; the field is documented in `api.js`. |
| Q7 | Section title for Backup and Restore: ALL MEMORIES, THR BACKUP, or other? | ALL MEMORIES, if that is what the backup holds; you know the content better. |
| Q8 | Should the memory strip stay active on the AI screen? A press recalls that memory and replaces the generated settings without leaving the screen. | Yes, unchanged; it behaves the same as on the knob screen. |

## 8. Verified and not verified (planning stage)

- **Read in the code:** the amp menu (`unitSelectorView.js`, `layout.js`), the top strip (`memoryView.js`), the pop-up and its API client (`src/ai`), the hook in `boot.js`, the proxy's body forwarding (`scripts/serve.py`).
- **Read on amplifier-presets.com (2026-11-16):** the pickup input, its placeholder, and the `pickupConfiguration` request field in the site's page script.
- **Estimated, not measured:** every pixel width and height in this file.
- **Not done:** any request to the backend; anything on a phone or on hardware.

## 9. Outcome (2026-11-16, offline)

- **U1, amp menu.** `AMP_VOICES` in `layout.js`; the amp selector shows them as a muted label column, the row of the selected model in ink. Measured on the mock fixture: the menu is 366 px wide and lies inside the 390 px frame; no fallback was needed.
- **U2, presets menu.** Three sections (File, Save to THR memory, All memories); the five saves are one row of gold slot buttons. The action values are unchanged. Item names changed: "Backup" and "Restore" (were "Backup THR", "Restore THR"), and the spoken name of a slot button is "Save to THR memory N". The save failure message now says "use Restore with a backup file".
- **U3, AI button.** `layout.pages`, the toggle in the top strip, a second body element, `intents.openPage`. `presetSources` in `boot` now maps a page key to its source; `overlayHost` is gone from the mount handle.
- **U4, AI screen.** Built once into the page and kept; layout as in 5.2, except that the field names stand above the fields, as in the pop-up (your request after the first look; the captions in the border were dropped). One status line; the tip follows the selected row; a hint stands in for an empty list. Close, Escape and the backdrop are gone with the pop-up.
- **U5, pickups.** The PICKUPS field with suggestions; `pickupConfiguration` is sent only when the field is filled; the text is kept with each generated preset.

Differences from the plan:

- **Import Factory was removed** from the menu definition together with the "source item" filter in `boot` (plan: keep it filtered out). It was never offered and had no implementation; it comes back when it exists.
- **The form is 179 px high**, not about 200.
- The fields and the amp list take no input while a generation or an import runs (planned for a generation only).

Checked: runner PASS 176 FAIL 0 (headless Chrome, fresh profile; was 175, one new test for the later showings). Gates by grep: G-ai both directions, G-ui-boundary, G-debug clean. Screenshots on the mock fixture with fixed API answers, in the 390 px frame: amp menu, presets menu, AI screen with a list, generating, generator not reachable.

Not checked: a phone or a window of 420 px or less (headless Chrome on this PC does not go that narrow), so the full-height phone layout and the keyboard behaviour are unseen; the top strip with CONNECTING showing; any request to the backend, so whether it accepts `pickupConfiguration` from this app is open (U5.2); anything on hardware (HU1 to HU3).
