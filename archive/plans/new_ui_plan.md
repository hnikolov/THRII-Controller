# AI screen: redesign proposal (iteration 3)

**Goal:** clean, feature-rich UI with seamless app integration and good usability.

Planning only; nothing is implemented. Numbers marked *measured* come from headless Chrome screenshots of `dev.html`'s composition (mock fixture, 390 px frame) on 2026-11-17; everything else is an estimate.

**What changed in this iteration** (your input):

- **The SOUND card is always visible and editable**, also while you make versions. A version may target another guitar or pickup for the same sound.
- **You shape the whole prompt of each version.** The backend keeps no context between requests, so the app no longer composes "description + changes". What you see in the card is exactly what is sent.

---

## 1. What the user does on this screen

| Job | Example | Frequency |
|---|---|---|
| **Tune** the current sound | "more sustain", "less gain", or the same sound for a Les Paul instead of a Strat | Many times per sound |
| **Compare** versions | A against B against C, guitar in hand | Many times per sound |
| **Go back** to an earlier sound | from Santana back to Metallica | Several times per session |
| **Start** a new sound | artist, song, part; guitar; pickups | Once per sound |

Two facts shape the design:

- **The guitar is in the user's hands.** Every frequent action must be one or two taps, and typing should be editing, not starting over.
- **Each request stands alone.** A version is a complete request: sound text, guitar, pickups and amp. The app helps write it; it does not hide any part of it.

## 2. The current screen (measured)

```
frame 656 px = top strip 28 + page 598 + memory strip 28            (measured)
page 598     = request form 201 + list 354 + credit 43              (measured)
```

- **Versions look like duplicates.** Two "Walsh Hotel Solo" rows and two "Santana Samba Pa Ti" rows are told apart only by the time and a truncated prompt; the difference between them is cut off.
- **The tip opens inside the list** and pushes the rows down.
- **The style differs from the knob screen.** The knob screen uses full-width sections with an 11 px uppercase header line and 1 px ink rules; the AI screen uses form captions.
- **The header name is off centre.** PRESETS + AI is 121 px, CONNECT 72 px *(measured)*, so "ACTUAL" sits about 25 px right of the screen centre.
- The import result is reported twice: on the AI status line and in the app toast.

What already works and stays: loading an entry re-imports its stored text with no backend call, and puts its request back into the form. Iteration 3 builds on exactly that.

## 3. Evaluation of the original sketch

| Element | Verdict | Reason |
|---|---|---|
| SOUND form on top, always there | **Keep** (iteration 2 hid it; that was wrong) | A version may change any field, so the whole request must be at hand. |
| Card layout like the knob screen | **Keep** | Use the knob screen's own section header line and rules. |
| Active version card with name, time, tip | **Keep** | It holds the "compare" job. |
| Versions A, B, C as folder tabs joined to the card | **Keep, tabs on top** | Tabs on top of their content are the convention; below, they read as pagination. |
| Up to five versions, then overwrite | **Keep** | The button says what will be replaced. |
| `×` removes a version; `×` in the list removes a sound | **Keep** | Removing a sound with several versions asks first. |
| Sound list with a gold bar | **Keep, show the version letters in each row** | Any version of any sound is one tap away. |
| Credits on one line | **Keep** | Saves about 25 px. |
| Name centred on screen | **Keep** | Achieved with a symmetric grid (5.1). |
| `[PRST]` | **Replace with ☰** | It is the only way to make the left group narrow enough to centre the name. |
| `[NEW]` and `[ADD as 'D']` side by side | **Replace with one button and a target in the card header** | The two actions read the same fields, so the only real choice is *where the result goes*. One dropdown in the card header shows that, and the button repeats it. |

## 4. The core idea

**The SOUND card is the request of the next generation.** It always shows a complete request and you edit it in place.

1. **It starts from the version you are listening to.** Loading B fills the card with B's sound text, guitar, pickups and amp. To make the next version you *edit* B's request, so a small change is a small edit.
2. **It shows what you changed.** Every field that differs from B gets a gold edge, and the header says `FROM B · EDITED ↺`. ↺ puts B's request back. You always know what the next version will differ in, before you spend a minute generating it.
3. **The header says where the result goes.** On the right of the card header is the target, in the same dropdown style as `PHASER ▾` on the knob screen: `VERSION D ▾`, or `NEW SOUND`. The generate button repeats it: `▶ VERSION D` or `▶ NEW SOUND`. A single control decides; nothing is guessed from the text.
4. **Chips edit the sound text with one tap.** MORE GAIN, LESS GAIN, MORE SUSTAIN, BRIGHTER, DARKER, MORE ROOM. A tap appends the phrase to the text ("…, more sustain"); a chip whose phrase is already in the text is lit, and tapping it again removes it. Typing is optional for the common tweaks.

**Edits are kept while you compare.** Once the card has edits, tapping other versions loads them for listening but leaves your draft alone (the header keeps `FROM B · EDITED`). While the card is unedited it follows whatever you load. This rule is what lets you write the next prompt while you A/B the existing versions.

**Why a version, and when a new sound:** a version is "the same musical target, tried differently", including another guitar or pickup. A new sound is a different target. The default target is a version of the sound that is loaded; switching to NEW SOUND is one tap in the card header, and the target returns to "version" after generating.

## 5. Design

### 5.1 Header

```
+--------------------------------------------------+
| [☰] [AI]        WALSH HOTEL SOLO B       [CONNECT]|   28 px
+--------------------------------------------------+
```

- Grid `minmax(0,1fr) auto minmax(0,1fr)`. The left group is aligned left and CONNECT right, so the name sits on the screen centre whatever the side widths are.
- **☰ replaces PRESETS ▾**; the menu content is unchanged. Left group about 82 px; each side column gets about 96 px with a 150 px name, which leaves room for CONNECT (72 *measured*), DISCONNECT, CONNECTING and FW 1.44.0.a (about 90 to 96 each, estimated). Phase A measures all four; if one is too wide, the name gets 140 px.
- **The version letter is part of the preset name** ("Walsh Hotel Solo B", the sound name cut to 18 characters so the whole stays within `PRESET_NAME_MAX = 20`). The AI module writes it into `data.meta.name` before `importText`. The header shows which version plays, and **Save to THR memory stores that name on the amp**.
- **AI button activity dot** while a generation runs, so you can go to the knob screen and play.

### 5.2 The screen

```
+--------------------------------------------------+
| [☰] [AI]        WALSH HOTEL SOLO B       [CONNECT]|
+--------------------------------------------------+
| SOUND  FROM B · EDITED ↺            VERSION D ▾  |  header: base, edit state, target
| ┃Joe Walsh, Hotel California solo, warm neck   |  sound text, 3 rows
| ┃pickup tone, more sustain                     |  ┃ = gold edge: differs from B
| GUITAR                   PICKUPS                 |
| ┃[ Gibson Les Paul    ]  ┃[ Humbucker        ]  |  changed for this version
| (MORE GAIN)(LESS GAIN)(■MORE SUSTAIN)(BRIGHTER)… |  chips, one row, scrolls sideways
| YAMAHA THR10II ▾                    [▶ VERSION D] |  amp (borderless), then generate
| status line (progress and errors)                |
+-----+-------+-----+------------------------------+
|  A  |▐  B  ▌|  C  |                  21:59    [×] |  version tabs; B is loaded (gold)
+-----+       +-----+------------------------------+
| STRAT · SINGLE COIL · vs A: + more sustain       |  what B is, against the version it came from
| Roll the guitar tone back a little and pick      |  tip, at most 3 lines; tap to expand
| close to the neck for a warm, singing lead …     |
+--------------------------------------------------+
| SOUNDS                                        4  |
|▌Walsh Hotel Solo          A ▐B▌ C     21:59  [×] |  gold bar: the loaded sound
| Master of Puppets Rhythm  A            21:38  [×] |  letters: tap = load that version
| Santana Samba Pa Ti       A  B         21:13  [×] |
| Clean Funk                A            20:48  [×] |
| … the list takes the remaining height, scrolls   |
+--------------------------------------------------+
| Presets by amplifier-presets.com · M. Bredeli · F. Hegelstad |
+--------------------------------------------------+
|    1    |    2    |    3    |    4    |    5    |  memory strip, unchanged
+--------------------------------------------------+
```

Height budget for the 598 px page (estimated): SOUND card 226, version card 108, SOUNDS header 26, credit 18. That is 378 px fixed, and the list gets about 220 px, which holds 7 to 8 rows. Today's form is 201 px *(measured)*; the chip row and the header line add about 25 px.

**Line by line:**

- **Card header.** `FROM B` names the base of the draft; `EDITED ↺` appears only after a change. The target dropdown offers `VERSION D` (or `REPLACE A` when five exist) and `NEW SOUND`.
- **The version line** describes the version against the one its request was edited from: guitar and pickups always, then what differs. If the new text starts with the old one, it shows the added tail ("+ more sustain"). If something was removed from the end, it shows "− …". Otherwise it shows "text rewritten". This is a plain string comparison, not a word diff.
- **The amp** stays a borderless dropdown, as today. It is part of the request and rarely changes.

### 5.3 States

**Editing → generating.** On `▶ VERSION D`, a tab `D ···14 s` appears at once in the strip. You can keep comparing A to C or go to the knob screen. When D arrives it is loaded, the card follows D (unedited), and the toast reports it. Cancel is on the placeholder tab.

**New sound.** Set the target to NEW SOUND. The card keeps its text, so you can adapt "Joe Walsh…" into "Santana…" rather than start empty. The header reads `SOUND  NEW` and the button `▶ NEW SOUND`. On generate, a row `Generating… 14 s` appears at the top of SOUNDS. The new sound's first version is A.

**First use** (no sounds): the target is fixed to NEW SOUND (no dropdown), the version card is absent, and the SOUNDS area shows the two hint lines from `plan_ui.md` 5.2.

### 5.4 Interactions

| Action | Result |
|---|---|
| Tap a version tab (card unedited) | Loads the version from its stored text (no backend call, about 1 s with an amp); the card takes its request. |
| Tap a version tab (card edited) | Loads the version for listening; the draft stays as it is. |
| Tap ↺ | The card takes the request of the version that is loaded now; the edits are dropped. |
| Tap a letter in a SOUNDS row | Loads that version of that sound directly (same rule for the card). |
| Tap a SOUNDS row's name | Loads the version of that sound that was played last. |
| Tap a chip | Adds its phrase to the sound text, or removes it if it is already there. |
| `▶ VERSION D` | Generates from the card as shown and adds D to the loaded sound. |
| Five versions exist | Target and button read `REPLACE A`: the oldest is replaced and its letter reused. |
| `×` on the version strip | Removes the loaded version from the list; the amp keeps playing it. No confirmation. |
| `×` on a SOUNDS row | Removes the sound and its versions; it asks first when there is more than one. |
| A generation fails | The placeholder disappears; the status line shows the reason in red; the draft stays. |

### 5.5 Visual language

- Sections are full-width blocks on `--paper` with a 1 px `--line` rule. The section header is 11 px bold uppercase, with the title left and the context or dropdown right, as `ECHO … TAPE ECHO ▾` on the knob screen.
- Gold marks the selected state everywhere, as on the memory strip: the loaded tab, the loaded letter in a list row, the gold bar of the loaded sound, the edge of an edited field, a lit chip.
- Buttons use the ink fill of today's GENERATE. Chips are outlined, 10 px uppercase.

### 5.6 Integration with the rest of the app

- **Status in one place.** The AI status line shows generation progress and errors only; import results stay in the app toast.
- **Saving a version** is ☰ → Save to THR memory N, as for any sound; the letter in the name tells the memories apart.
- **Phase C, snapshot of the knobs:** after loading B and adjusting knobs on the knob screen, `SNAPSHOT` in the version strip stores the current settings as a new version, with the version line "my edit of B". It needs one more callback from the shell, `exportText()`, built on the existing `storeToPreset`/`presetToText`.
- **Phase C, what differs in the settings:** "vs A: GAIN 56→44 · REVERB MIX 20→32", computed in `src/ai` from the two stored `.thrl6p` texts with a small name-to-label table.

## 6. Data

```
sound   { id, name, lastVersionId, versions: [version] }                              at most 20 sounds
version { id, letter, baseId, request: { prompt, guitar, pickup, amp },
          name, tip, time, text }                                                     at most 5 per sound
draft   { request, baseId, target: 'version' | 'new' }                                the card
current { soundId, versionId }
```

- `request` is exactly what was sent. `baseId` is the version whose request the draft was edited from; the version line compares against it.
- "Edited" means `draft.request` differs from the request of the version `draft.baseId`. No separate flag is stored.
- Size: a `.thrl6p` text is 0.9 to 1.5 KB (the files in `doc/`), so 100 versions are about 150 KB of `localStorage`.
- Migration to a new key (`thrii.aiPresets.v2`): old entries with the same name and guitar become versions of one sound, oldest = A, at most five; the others become their own sounds. Old entries already store prompt, guitar and pickup, so they become full requests without loss. Their `baseId` is the previous version of the same sound. The old key is read once and left in place.

## 7. Plug-in boundary

`src/ai` keeps importing nothing from the rest of `src`; the gates hold. The contract grows by optional callbacks only:

```
open({ host, importText, ampModel,          // today
       setActivity,                          // phase B: the dot on the AI button
       exportText })                         // phase C: snapshot
```

The runtime gets `setPageActivity(key, on)` in `MemoryView` for the dot. The header changes are in `memoryView.js`, `layout.js` (the menu label becomes ☰ with the spoken name "Presets") and `runtime.css`.

No protocol change and no new frame type. Loading a version is the existing import, and the letter travels in the existing name field. The request sent to the backend has the same shape as today; only its content is now edited per version.

## 8. Phases

**Phase A: header and look (no data change).**
1. Header: ☰, the symmetric grid, the centred name. Measure the CONNECT, DISCONNECT, CONNECTING and FW labels at 390 px.
2. AI screen: section headers and rules as on the knob screen; credit on one line; import results only in the toast.
3. Tests: `boot.test.js` checks that read the menu label follow the new spoken name. Screenshots at 390 px.

**Phase B: sounds, versions, draft.**
1. Data v2 and migration; the letter in the preset name.
2. SOUND card with the base, the edit state, ↺, the target dropdown and the chips; version tabs with the version line and tip; SOUNDS with letters; placeholders while generating; the AI button dot.
3. Tests in `aiPresets.test.js`:
   - The migration keeps every entry.
   - Loading follows the card only while the card is unedited.
   - ↺ restores the base request.
   - Chips add and remove their phrase.
   - The request sent equals the card.
   - A version is added to the loaded sound, and a new sound starts at A.
   - Replacing at five versions.
   - The name with a letter stays within 20 characters.
   - The version line covers: tail added, tail removed, text rewritten, and guitar changed.
   - A failed or cancelled generation keeps the draft and leaves no tab.
4. `[YOU]` One real generation, to see that the backend handles the edited prompts and a changed guitar or pickup as expected. It is a request to the authors' backend and waits for your go-ahead.

**Phase C: integration extras (each optional).** Snapshot of the knobs as a version; the settings-difference line.

**Human checks:**
- On a phone with the keyboard open, the sound text, chips and button stay usable.
- Comparing tabs keeps an edited draft.
- A generation started on the AI screen arrives while the knob screen is shown.
- A version saved to a memory shows its letter on the amp.

## 9. Open questions

| # | Question | Recommendation |
|---|---|---|
| Q1 | When the card is edited, should tapping another version leave the draft alone (as proposed), or replace it? | Leave it. It lets you write the next prompt while you compare; ↺ is one tap when you want the version's request. |
| Q2 | Where should the target live: a dropdown in the card header (proposed), or a two-part switch `VERSION \| NEW`? | Dropdown: it matches the knob screen's module headers and has room for `REPLACE A`. |
| Q3 | Chip words: MORE GAIN, LESS GAIN, MORE SUSTAIN, BRIGHTER, DARKER, MORE ROOM? | Start with these and keep them in `config.js`. |
| Q4 | Should the amp model be part of a version's request (so a version could target a THR30II)? | Yes, it is in the request today; the card shows it, and it rarely changes. |
| Q5 | ☰ for the presets menu acceptable? | Yes; it is what lets the name sit in the centre. |
| Q6 | The frame is 656 px tall *(measured)*; on a 390x844 phone about 150 px stay empty below it. Should the app grow to the screen height? The SOUNDS list would gain about 5 rows. | A separate small task after phase B; it affects the knob screen too. |
| Q7 | Phase C (snapshot, settings difference): wanted? | Snapshot yes; the difference line later. |

Doc drift, unchanged by this plan: `plan.md` 8.2 says `HISTORY_MAX = 5` and the code uses 20; `plan.md` 8.3 still describes the pop-up.

---

## Appendix: the original sketch (for reference)

```
+-------------------------------------------------+
| [PRST] [AI] [     Preset name     ] [ CONNECT ] |
+-------------------------------------------------+
|   SOUND                                         |
| +---------------------------------------------+ |
| | Prompt text                                 | | three text rows
| +---------------------------------------------+ |
|   GUITAR                 PICKUPS                |
| +--------------------+ +----------------------+ |
| | Text               | | Text or/and dropdown | |
| +--------------------+ +----------------------+ |
| [ THRII Amp model  v ] [  NEW  ] [ ADD as 'D' ] | How to manage creating new vs adding a version?
| Status text here, one line                      |
+-------------------------------------------------+
| Active preset (B) name       | time stamp   [X] | 'X' removes a preset version ('B')
| ----------------------------------------------- |
| |Preset text/description/tips                   |
+---------+     +---------------------------------+
| [  A  ] |  B  | [  C  ]                         | preset variants, up to 5 and then overwrite
|         +-----+                                 |
+-------------------------------------------------+
|  Earlier generated preset(s) timestamp  txt [X] | 'X' removes all versions of a preset category
| |Earlier generated preset(s) timestamp  txt [X] | selected: gold bar and tint
| ... (scrollable list)                           |
+-------------------------------------------------+
| Credits: Powered by amplifier-presets.com       |
| Name 1 developer                Name 2 designer |
+-------------------------------------------------+
| [  1  ] [   2   ] [   3   ] [   4   ] [   5   ] |
+-------------------------------------------------+
```

Original question: how to create a new sound category versus a version of an existing one (Metallica → Santana, against fine-tuning Santana with more sustain and less gain). Answered in section 4.
