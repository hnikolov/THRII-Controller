# Presets screen: design for alignment

Status: implemented offline on 2026-11-18 (see section 9); hardware checks open. Revised before that: the status card is dropped; ↻ UPDATE moved into the loaded row.

**Goal:** turn the PRESETS menu into a screen of its own, an integral part of the app like the AI screen. It keeps every current action (Import, Export, Save to THR memory 1 to 5, Backup, Restore) and adds a persistent list of presets for quick switching.

---

## 1. What the screen is for

| Job | Example | Frequency |
|---|---|---|
| **Switch** between known presets | from "Crunch Ico LP" to "Clean Megadeth" while practising | Very often |
| **Keep** what plays now | after tuning the knobs, or after an AI result you like | Often |
| **Bring presets in** | import one file, or a whole folder of `.thrl6p` files once | Sometimes |
| **Give presets out** | export a file; save to one of the amp's five memories | Sometimes |
| **Protect the amp** | backup and restore of all five memories | Rarely |

The list is the main part: switching is the frequent job, so it gets nearly all the height. The actions sit in one row above it. Backup and Restore, the rare jobs, go to one line at the bottom.

## 2. The approach

**The list is a library of presets the app keeps.** Each entry is a complete `.thrl6p` text with its name. Tapping an entry loads it into the Actual settings, exactly as a file import does (quick import with an amp, the store only without one).

**Three regions, each saying something once:**

- **The header** says what plays now (its name), as on every screen. Nothing on this screen repeats it.
- **The action row** acts on what plays now: IMPORT, EXPORT, + ADD, SAVE TO AMP ▾.
- **The list** holds the library. The loaded entry has the gold bar. When what plays has been edited since that entry was loaded, the row says so (`*`) and offers ↻, which stores the edits in that entry.

**One rule for keeping what plays now:** ↻ exists only on the loaded list entry. Settings from anywhere else are kept with the action that fits their origin:

| Origin of the current settings | Keep them with |
|---|---|
| A list entry, edited | ↻ on its row (that entry), or + ADD (a new entry) |
| An AI result | + ADD |
| An amp memory | SAVE TO AMP (that memory or another), or + ADD |

**Amp memories stay where they are.** The memory strip at the bottom recalls them, as today. The screen only *saves* to them, and backs them up or restores them.

## 3. Screen

```
+--------------------------------------------------+
| [☰] [AI]        CRUNCH ICO LP           [CONNECT] |  ☰ is now a page toggle, lit like AI
+--------------------------------------------------+
| [ IMPORT ] [ EXPORT ] [ + ADD ] [ SAVE TO AMP ▾ ] |  actions on what plays now
+--------------------------------------------------+
| [ search…                    ]           12 / 40 |  filter, shown from 8 entries on
|▌Crunch Ico LP *           BROWN 1   [↻] [✎] [×] |  loaded (gold bar), edited: * and ↻
| Clean Megadeth            CLEAN          [✎] [×] |  tap a row = load it
| Ico Solo 1                LEAD           [✎] [×] |  amp model in muted text
| Master of Puppets Rhythm  MODERN         [✎] [×] |  the ↻ column stays empty on other
| Samba Pa Ti Bloom         BOUTIQUE       [✎] [×] |  rows, so the columns line up
| Walsh Hotel Solo          LEAD           [✎] [×] |
| … takes the remaining height, scrolls            |
+--------------------------------------------------+
| AMP MEMORIES               [ BACKUP ] [ RESTORE ] |  the rare actions, one line
+--------------------------------------------------+
|    1    |    2    |    3    |    4    |    5    |  memory strip: recall, unchanged
+--------------------------------------------------+
```

The same list in its other states:

```
|▌Crunch Ico LP             BROWN 1        [✎] [×] |  loaded, unchanged: no *, no ↻
| Clean Megadeth            CLEAN          [✎] [×] |  nothing loaded from the list (an AI
                                                      result, a memory recall): no gold bar
```

`SAVE TO AMP ▾` opens the five memories:

```
| SAVE TO AMP MEMORY            |
| [ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ] |  each asks "Overwrite memory N on the amp?", as today
```

Height budget of the 598 px page *(estimated; on a phone the page is taller, see `plan_ui_simple.md` section 9)*:

| Part | px |
|---|---|
| Action row | 44 |
| Search line | 32 |
| AMP MEMORIES line | 36 |
| **Fixed total** | **112** |

The list gets about 486 px, which holds about 16 rows of 29 px.

Row width at 390 px: ↻, ✎ and × take 32 px each, the amp model about 70 px, and the name about 200 px, which is enough for 20 characters (the preset name limit).

**First use (empty list):** the list area shows two hint lines: *"Import preset files — several at once, if you like."* and *"+ ADD keeps what plays now, for example a result of the AI screen."*

## 4. Rules

### 4.1 The action row

- **IMPORT** opens the file dialog with multiple selection.
  - One file: it is loaded and added to the list, and it becomes the loaded entry.
  - Several files: all are added, none is loaded, and the toast says "Added 9 presets".
  - A file the app refuses is reported by name and skipped.
- **EXPORT** writes the current settings to a file, as today, and adds them to the list as a new entry, under the duplicate rule of 4.3. It never changes an existing entry; that is ↻'s job.
- **+ ADD** adds the current settings under the header name and makes the new entry the loaded one. Afterwards the new row is loaded and unchanged, so the old row loses its `*` and ↻.
- **SAVE TO AMP ▾** works as today, including the read-back check and the offer to put the old content back.
- **Without an amp:** SAVE, BACKUP and RESTORE are greyed out instead of failing with "connect the amp first". IMPORT, EXPORT, + ADD and the list all work, on the app only.

### 4.2 The list

- **Tap a row:** loads that entry. About 1 s with an amp; the rows take no input meanwhile. The gold bar moves to it, and the header shows its name.
- **`*` and ↻ (loaded row only).** They show while the current settings differ from the loaded entry: any knob, type, enable, or the name in the header. The check uses the existing `comparePlan`, runs after store changes at most a few times per second, and runs only while an entry is loaded.
  - **↻** writes the current settings, with the header name, into that entry, and the `*` goes. It does not ask, because the entry is the user's own copy. The toast says "Updated".
  - Tapping the edited row's name loads the entry again, which discards the edits (back to what is stored). This is the same as tapping any row; nothing new is added.
- **✎** renames the entry in place: Enter or leaving the field keeps the name, Escape cancels. At most 20 characters, because this name goes to the amp when the entry is saved to a memory. Renaming the loaded entry also renames the header, so it does not count as an edit.
- **×** removes the entry after a question ("Remove Crunch Ico LP from the list?"). The file on disk, if there is one, is not touched. Removing the loaded entry leaves the settings playing; the list just has no loaded entry any more.
- **Amp model** in muted text (BROWN 1, CLEAN, LEAD …), read from the preset itself, so the tone family is visible without loading.
- **Order:** most recently added or updated first; loading does not reorder, as in the AI list.
- **Search** appears from 8 entries on and filters by name as you type. The loaded row stays marked when it is visible in the filtered list.

### 4.3 No accidental duplicates

- Adding a preset whose content equals an entry already in the list does not add a second copy. Examples: the same file imported twice, or + ADD or EXPORT right after loading an unchanged entry. The existing entry becomes the loaded one, and the toast says "Already in the list".
- Equal names with different content are separate entries, told apart by the amp model column and by renaming.

### 4.4 Integration

- **Header:** ☰ becomes a page toggle next to AI; the dropdown menu goes. One page at a time: pressing ☰ on the AI screen switches to Presets. The centred name and the side widths stay as measured.
- **AI screen:** + ADD keeps an AI result, also after you tuned it. No coupling between the two modules is needed: + ADD reads the current settings, whatever loaded them.
- **Memory strip:** unchanged. A recall, like an AI result, clears the loaded entry: the gold bar goes and no row offers ↻.
- **Long operations** (import with an amp, save, backup, restore) dim the screen, as they dim the knobs today.
- **Status:** results go to the app toast, as today; the screen has no status line of its own.

## 5. Data

```
entry   { id, name, text, amp, time }      text: the .thrl6p; amp: model label for the list
loaded  entryId | null                     the entry the current settings came from
```

- Stored in `localStorage` under `thrii.presets`, like the AI screen's data. A `.thrl6p` text is 0.9 to 1.5 KB, so 200 entries are about 300 KB.
- **No silent dropping:** at the maximum (200, see Q4), ADD and IMPORT refuse with a message instead of removing old entries.
- `loaded` is set by a tap on a row, IMPORT of one file, + ADD and EXPORT. It is cleared when anything else is loaded (a memory recall, an AI result) and when its entry is removed.

## 6. Where it lives

The shadow store's state shape must not change, so the list is not device state and stays out of the store, like the AI screen's data.

- **`src/presets/`** (new): the list's storage and the screen, built on the same seam as `src/ai`. The source is `open({ host, ... })` from `boot`'s `presetSources`, it imports nothing from the rest of `src`, and it receives what it may use as callbacks:

  ```
  open({ host,
         run(action),          // 'export' | 'backup' | 'restore' | 'save:N' — the existing presetFlow actions
         importText(text),     // as for the AI screen
         currentText(),        // the current settings as .thrl6p text (storeToPreset + presetToText)
         differs(text),        // comparePlan of the store against a preset text → list of differences
         onChange(listener),   // store changes and loads from elsewhere (memory recall, AI result)
         isConnected() })
  ```

- **`presetFlow.js`:** Export resolves to the written text so the screen can add it. Import is replaced by the screen's own multiple pick and `importText`. Save, Backup and Restore are unchanged.
- **`files.js`:** `pickTexts(accept)` for several files, next to `pickText`.
- **Runtime:** `layout.js` turns `presetMenu` into a page `{ key: 'presets', label: '☰' }`; `memoryView.js` drops the dropdown. `boot.test.js` and the `fakeAmp` helper `menu()` change from menu items to the screen's buttons. The actions behind them, and their frames, do not change.
- **No protocol change.** Loading an entry is the existing import. Save, Backup and Restore are untouched.

## 7. Steps (after alignment)

1. **Seam:**
   - `presetSources.presets` with the callbacks of section 6.
   - Export resolving to its text.
   - `pickTexts`.
   - Tests: the same frames for Save, Backup and Restore; Export resolves to the file's text.
2. **List:** storage, add, load, rename, remove, duplicates, search. Tests in `presets.test.js`, in the style of `aiPresets.test.js`.
3. **Edited state:**
   - `*` and ↻ on the loaded row, and the greyed amp actions.
   - Tests:
     - `*` and ↻ after a knob turn, and after a header rename.
     - ↻ stores the edits and clears `*`.
     - A ✎ rename of the loaded entry is no edit.
     - + ADD moves the loaded mark to the new row.
     - No ↻ after a memory recall or an AI import.
4. **Header:** ☰ as a page toggle; the menu removed; `boot.test.js` and the `fakeAmp` helpers follow.
5. **Screenshots** at 390 px: empty, a list of 10 (the files in `doc/`), an edited loaded row, without an amp.
6. **Human checks:**
   - On a phone, switching presets from the list with the amp connected.
   - Save to a memory from the screen.
   - Backup and Restore from the screen.

## 8. Questions for you

| # | Question | Recommendation |
|---|---|---|
| Q1 | Should ↻ show only on the loaded row while it is edited (proposed), or always on the loaded row, disabled while unchanged? | Only while edited. It then doubles as the "edited" signal next to the `*`, and an unchanged row stays as quiet as the others. |
| Q2 | Should Export add to the list? You asked for it; the alternative is Export writing a file only, with + ADD for the list. | As you asked: Export adds, with the duplicate rule of 4.3, so exporting a loaded, unchanged entry adds nothing. |
| Q3 | The amp model column (BROWN 1, CLEAN …): wanted? | Yes. It is the only cue to a preset's character without loading it, and it costs nothing. |
| Q4 | List size limit: 200 entries? | 200, refusing to add beyond it rather than dropping old entries. |
| Q5 | ☰ for the Presets page, or a text label (`PRESETS` would break the centred name)? | ☰. It is already there, and the header widths are measured with it. |
| Q6 | Backup of the list itself (all entries in one file), since browser storage can be cleared? | Later. A `LIST` pair of buttons next to BACKUP/RESTORE would fit when wanted. |
| Q7 | Show the names of the five amp memories on this screen? It needs reading all five memories, as Backup does: a few seconds and frames on every showing. | No for now. The memory strip recalls them, and the header then shows the name. |
| Q8 | Should the AI screen get a direct "add to Presets" button? | No. + ADD here already covers it, and it keeps the two modules independent. |

## 9. Outcome (2026-11-18, offline)

Implemented as planned, with the recommendations of section 8 taken as the answers:
- Q1: ↻ only while the loaded row is edited.
- Q2: Export adds.
- Q3: the amp model column.
- Q4: 200 entries.
- Q5: ☰.
- Q6 to Q8: later or no.

- **`src/presets/presetLibrary.js`, `presets.css`** (new): the screen and its list. It imports nothing from the rest of `src`; boot hands it every operation (section 6).
- **Where the screen comes from:** boot always creates it; it is not a `presetSources` plug-in, because Save, Backup and Restore must always exist. Its page is `presets` in `layout.pages`. Shells need no change; without the symbol table there is no Presets page, as presets could not work then anyway.
- **"Loaded from the list"** uses a generation count in boot. It moves on every dump read (connect, memory recall, an amp-side slot press) and after every successful import. The screen notes the count when it loads an entry and drops the loaded mark when the count moves. Any other import, such as an AI result, ends the mark the same way.
- **Edited** = the header name differs, or `comparePlan` finds a difference. The loaded entry's plan is cached, so the check after each store change does not parse the text again.
- **`presetFlow.js`:**
  - Export resolves to the text written.
  - `run()` resolves to the action's result.
  - The `import` action is gone; the screen picks the files (`files.pickTexts`, new) and loads through `importText`.
- **Runtime:** the PRESETS dropdown is gone (`presetMenu`, `intents.presetAction`, the sections CSS). Page buttons take an optional `title` (spoken name), and an icon label gets the icon size.

Differences from the plan:

- **Import of several files:** files already in the list (same text) are not counted as added.
- **The rename field** goes through the app's name cleaning (printable ASCII, 20 characters), so the entry's name and the header stay equal.
- **Save to a memory** clears the loaded mark: the save recalls the memory to check it, and that recall is a dump read. The settings are unchanged, but they now live in that memory.

Checked:
- Runner PASS 183 FAIL 0 in headless Chrome (176 before this feature).
  - `presets.test.js` (new, 4 tests): import of one file and of several, duplicates, refused files, the edited mark and ↻, + Add, Export, a load from elsewhere, a header rename, rename, remove, search, a reload, and a memory recall with an amp.
  - `presetFlow.test.js` and `boot.test.js` drive the screen instead of the menu; the frames they check are unchanged.
  - The menu-stacking test of `runtime.test.js` was removed with the menu.
- Gates by grep: `src/presets` and `src/ai` import nothing from `src`; G-ui-boundary and G-debug are clean.
- Screenshot at 390 px: 10 sample presets, one loaded and edited.

Not checked:
- A phone.
- Hardware (section 7, step 6). After a quick import on a real amp, the read-back might differ slightly from the file, for example in rounding. The loaded row would then show `*` at once. The fake amp gives no evidence either way; this needs a look on the amp.
