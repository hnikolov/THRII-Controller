# AI screen: the simple design

Status: implemented offline on 2026-11-17 (see section 9); hardware and backend checks open.

This supersedes the top part of `new_ui_plan.md` (iterations 1 to 3). From that file it keeps the header (☰, centred name with the version letter), the SOUNDS list and the one-line credits. The measured facts in its section 2 still hold.

---

## 1. The approach

**The card is the version.** The top card shows one version, the one that plays, and everything about it is in one place:

- **above the tabs:** what was asked: sound text, guitar, pickups;
- **the tabs A B C:** which version it is. The open tab joins the parts above and below it, so they read as one thing;
- **below the tabs:** what came back: the tip.

**The fields are both the record and the draft.** They show the request of the version that plays. To make the next version you edit them and press ▶. There is no "base", no "edited" state, and no separate form for a new version: the next version is always "this one, changed".

**Making something is a row of its own.** Under the card, one row says what will be made and makes it: amp, target (`VERSION D ▾`), ▶. The status line under it reports. The row reads like a sentence: *with this amp, make version D, go.*

**Finding something is the list.** SOUNDS shows every sound with its version letters; one tap loads any of them.

The screen reads top-down: *this version* → *make the next one* → *all sounds*. Three regions, one job each. No chips, no mode labels, no diff lines: the user writes the prompt, and what is in the fields is what gets sent.

## 2. Screen

```
+-------------------------------------------------+
| [☰] [AI]     WALSH HOTEL SOLO B     [ CONNECT ] |  name centred, with the version letter
+-------------------------------------------------+
| SOUND                                       [×] |  × removes this version (B)
| +---------------------------------------------+ |
| | Joe Walsh, Hotel California solo, warm neck | |  sound text, 3 rows
| | pickup tone, more sustain                   | |
| +---------------------------------------------+ |
| GUITAR                   PICKUPS                |
| +--------------------+ +----------------------+ |
| | Gibson Les Paul    | | Humbucker            | |  pickups: free text with suggestions
| +--------------------+ +----------------------+ |
+---------+     +---------------------------------+
| [  A  ] |  B  | [  C  ]                         |  tabs: tap = load that version
+---------+     +---------------------------------+
| Roll the guitar tone back a little and pick     |  tip of B, 3 rows, scrolls if longer
| close to the neck for a warm, singing lead.     |
+-------------------------------------------------+
| YAMAHA THR10II ▾          VERSION D ▾  [  ▶  ] |  amp, target, generate
| Status text here, one line                      |
+-------------------------------------------------+
| SOUNDS                                          |
|▌Walsh Hotel Solo          A ▐B▌ C   21:59  [×] |  gold bar: the loaded sound
| Master of Puppets Rhythm  A         21:38  [×] |  letter: tap = load that version
| Santana Samba Pa Ti       A  B      21:13  [×] |  name: tap = load version A
| Clean Funk                A         20:48  [×] |  ×: removes the sound with all its versions
| … takes the remaining height, scrolls          |
+-------------------------------------------------+
| Presets by amplifier-presets.com · M. Bredeli · F. Hegelstad |
+-------------------------------------------------+
| [  1  ] [   2   ] [   3   ] [   4   ] [   5   ] |  memory strip, unchanged
+-------------------------------------------------+
```

Height budget of the 598 px page *(page height measured; the parts are estimates)*:

| Part | px |
|---|---|
| SOUND header and sound text | 92 |
| Guitar and pickups | 46 |
| Tabs | 30 |
| Tip | 62 |
| Action row and status | 60 |
| SOUNDS header | 26 |
| Credit | 18 |
| **Fixed total** | **334** |

The list gets about 264 px, which holds 9 rows. That is more than iteration 3 (about 220), because the chips, the mode labels and the version line are gone.

## 3. Rules

### 3.1 The card

- The card always shows the **loaded** version: its request in the fields, its letter in the open tab, its tip below.
- **Tap a tab:** the version is loaded from its stored text (no backend call; about 1 s with an amp). Its request replaces the fields and its tip replaces the tip.
- **Edit the fields:** they become the request of the next generation. Nothing else changes until ▶.
- **×** in the SOUND header removes the loaded version from the list. The card then loads the first remaining version (A, or the next letter if A was the one removed). The amp plays that version. If B was the only version, × removes the whole sound and asks first, as the list's × does. The traget pre-selects `NEW SOUND`

### 3.2 The action row

- **Amp ▾:** the amplifier of the request, pre-selected from the connected amp as today.
- **Target ▾** offers every letter of the loaded sound plus `NEW SOUND`:

  ```
  NEW SOUND
  A  (replace)
  B  (replace)
  C  (replace)
  D               ← pre-selected
  E
  ```

  - **Pre-selection:** the first free letter. When all five are taken, it is the letter after the last one generated, wrapping from E to A.
  - **An existing letter is an overwrite:** ▶ asks "Replace version A of Walsh Hotel Solo?" first. That covers the E → A wrap and a deliberate "redo B".
  - **NEW SOUND:** ▶ creates a new sound whose first version is A. It appears at the top of SOUNDS. The fields are not cleared, so "Joe Walsh…" can be rewritten into "Santana…" instead of being typed from nothing.
- **▶** generates from the fields, the amp and the target as they are at the moment of the press. While it runs, ▶ becomes **■** (cancel) and the status line shows `Generating D · 14 s`.
- **After a generation:** the new version is loaded, the card shows it, and the target moves to the next letter. The app toast reports the import; the status line shows errors only, in red.

### 3.3 The list

- **Tap a letter:** that version of that sound is loaded and shown in the card.
- **Tap a name:** version A of that sound is loaded (your choice; A is the base of every collection).
- **×:** removes the sound with all its versions. It always asks first.
- **Order:** the newest generation first. A sound moves to the top when a version is added to it. No times are shown: the order tells what is recent.
- **✎** (every row, like ×) renames the sound without loading it: Enter or leaving the field keeps the name, Escape cancels, and an empty name keeps the old one. At most 40 characters.

## 4. What the sketch leaves open, with a proposal for each

| # | Gap | Proposal |
|---|---|---|
| G1 | **How a new sound is started.** The sketch has no NEW button. | `NEW SOUND` as the first entry of the target dropdown (3.2). No extra button, and the target is always visible in one place. |
| G2 | **Edited fields and a tab tap.** If you change the text and then tap A to listen again, the fields take A's request and your text is lost. | Keep the simple rule - the card always shows the loaded version. Phase 2 adds a remembered draft only if this hurts in use. See Q1. |
| G3 | **Whether fields show the version or an edit.** After editing, the fields no longer say what B was generated from, while the tab still says B. | Optional: a gold edge on a field that differs from the loaded version's request. It needs no state, only a comparison, and it shows at a glance that ▶ will send something new. See Q2. |
| G4 | **Removing A, or the last version.** | Load the first remaining letter; removing the last version removes the sound, with a question first (3.1). |
| G5 | **Progress and cancel.** | ▶ turns into ■; elapsed seconds on the status line (3.2). |
| G6 | **Comparing while a generation runs** (it takes up to a minute). | Tabs and list letters stay usable, so you can keep listening to A and B. The fields stay editable: the request already left. When D arrives it is loaded, as today. See Q3. |
| G7 | **The target is fixed at the press.** If you load Santana while Walsh D is being generated, the result still goes to Walsh as D. | The target is taken at the press. When the result arrives it is loaded, and the card and list follow it. |
| G8 | **The amp plays something else.** After a memory recall or a file import, the amp no longer plays the card's version. | The card still shows the last AI version; the header name tells the truth. This is accepted, because the AI module does not see the store. See Q4. |
| G9 | **Collection name.** Each generation returns its own preset name. | *Revised 2026-11-18.* A sound is an umbrella for related presets (e.g. "Metallica" with clean, rhythm and lead versions). It starts with the name of its first version and can be renamed with ✎ on its row; that name never goes to the amp. A version is loaded with its own (generated) name, which the app header shows and where it can be renamed before Export or Save. A version gets its letter only when an earlier letter of the same sound already has its name ("Walsh Hotel Solo B"), with the name cut to 18 characters so it fits `PRESET_NAME_MAX = 20`. |
| G10 | **First use, no sounds.** | No tabs and no tip; the target shows only `NEW SOUND`. The list area shows the two hint lines from `plan_ui.md` 5.2. |
| G11 | **An import that runs** (about 1 s with an amp). | Tabs, letters, × and ▶ take no input until it ends, as list rows do today. |
| G12 | **Accessibility.** | The tabs are `role="tab"` with the open one selected. ▶ has the spoken name "Generate version D" (or "Generate a new sound"). Ctrl+Enter in the sound text still generates. |
| G13 | **Background generation.** | Optional: a dot on the AI button while a generation runs, so you can play on the knob screen and see it is coming. This is one more callback from the shell (`setActivity`). |

## 5. Data

```
sound   { id, name, versions: [version] }                         at most 20 sounds, newest first
version { id, letter, request: { prompt, guitar, pickup, amp },
          name, tip, time, text }                                 at most 5 per sound
current { soundId, versionId }                                    the loaded version
fields  { prompt, guitar, pickup, amp, target }                   the card's draft, kept across reloads
```

- `request` is exactly what was sent; tapping a version puts it back into the fields.
- Size: a `.thrl6p` text is 0.9 to 1.5 KB, so 100 versions are about 150 KB of `localStorage`.
- **Migration** to a new key `thrii.aiPresets.v2`: old entries with the same name and guitar become versions of one sound (oldest = A, at most five); the rest become their own sounds. Old entries already hold prompt, guitar and pickup, so nothing is lost. The old key is read once and left in place.

## 6. What changes where

- **`src/ai/aiPresets.js`, `aiPresets.css`:** the card, tabs, action row, list and data v2. Styling uses the knob screen's section header line and rules, and gold for the selected tab, letter and bar.
- **Header:** `memoryView.js` (the symmetric grid), `layout.js` (☰ with the spoken name "Presets"), `runtime.css`.
- **Plug-in boundary unchanged:** `src/ai` imports nothing from the rest of `src`. The contract `open({ host, importText, ampModel })` stays; `setActivity` is added only if G13 is wanted.
- **No protocol change.** Loading a version is the existing import; the request to the backend has the same shape as today.

## 7. Steps

1. **Header:** ☰, symmetric grid, centred name. Measure CONNECT, DISCONNECT, CONNECTING and FW at 390 px. Update `boot.test.js` for the menu's spoken name.
2. **Data v2 and migration**, the letter in the preset name.
3. **The screen:** card with tabs and tip, action row with the target, list with letters, credit on one line, the states of G5, G6 and G10.
4. **Tests** in `aiPresets.test.js`:
   - Migration keeps every entry and groups by name and guitar.
   - A tab loads its version and fills the fields.
   - ▶ sends exactly the fields.
   - The target pre-selection covers a free letter, a gap after a removal, and the E → A wrap.
   - Overwrite asks first; NEW SOUND starts a sound at A.
   - × on the card: the first remaining letter loads, and the last version removes the sound.
   - The name with a letter stays within 20 characters.
   - A cancelled or failed generation adds nothing.
   - The target is fixed at the press.
5. **Screenshots** at 390 px on the mock fixture with fixed API answers: first use, a sound with three versions, generating, an error.
6. **`[YOU]`** One real generation with a changed guitar for the same sound, to see that the backend follows the request. It waits for your go-ahead.

**Human checks:**
- On a phone, with the guitar on the lap, the tabs, letters and ▶ are easy to hit.
- The sound text stays usable with the keyboard open.
- A version saved to a memory shows its letter on the amp.

## 8. Questions for you

| # | Question | Recommendation |
|---|---|---|
| Q1 | G2: should a tab tap replace edited fields (simple), or keep the draft until ▶? | Replace. It keeps the rule "the card is the version". Revisit only if it costs typed text in practice. |
| Q2 | G3: a gold edge on fields that differ from the loaded version? | Yes. It is cheap, and it is the only hint that ▶ will send something new. |
| Q3 | G6: when a result arrives while you are listening to another version, should it load at once (as today), or wait for a tap on its tab? | Load at once; it is what you waited for. |
| Q4 | G8: should the card dim when the amp no longer plays its version? | No for now. It would need the store, which the plug-in does not see. |
| Q5 | G13: the dot on the AI button? | Yes. It is small, and it is what makes leaving the screen during a generation safe. |
| Q6 | Is the amp per request? A version could then target a THR30II. | Yes, as today; the dropdown is in the action row and rarely changes. |

## 9. Outcome (2026-11-17, offline)

Implemented as planned, with the recommendations of section 8 taken as the answers:
- Q1: a tab replaces edited fields.
- Q2: a gold edge marks edited fields.
- Q3: a result loads at once.
- Q4: the card does not dim.
- Q5: the AI button shows a dot.
- Q6: the amp is part of each request.

- **Header** (`layout.js`, `memoryView.js`, `runtime.css`): the presets menu shows ☰; its spoken name stays "PRESETS actions". The strip is `minmax(0,1fr) auto minmax(0,1fr)` with a 150 px name. *Measured* at 390 px:
  - The name is 0 px off the frame centre.
  - The left group is 97 px; each side column is 97 px.
  - The connection labels need CONNECT 72, DISCONNECT 91, CONNECTING 92 and FW 1.44.0.a 78 px, so all fit.
- **Activity dot**: `setActivity(on)` in the source contract, `setPageActivity(key, on)` on the mount handle, and a pulsing dot on the AI button.
- **AI screen** (`src/ai/aiPresets.js`, `aiPresets.css`): the card, tabs, tip, action row, SOUNDS list and one-line credit; data v2 with the migration; the letter in the preset name. `HISTORY_MAX` became `SOUNDS_MAX = 20` in `config.js`.
- ***Measured* heights** (mock fixture, 390 px frame):

  | Part | px |
  |---|---|
  | Card | 157 |
  | Tabs | 30 |
  | Tip | 65 |
  | Action row | 37 |
  | Status | 16 |
  | Sounds header and list | 270 |
  | Credit | 24 |

  The list itself is 243 px, about 8 rows of 29 px.

Differences from the plan:

- **Target labels** are `New sound`, `Version D` and `Replace A`, not `A (replace)`. A select is as wide as its longest option, and the longer label cut the amp name to "YAMAHA TH…".
- **▶ is a plain button, not the form's submit.** While a generation runs it cancels, so an Enter in a field must not reach it. Enter in Guitar or Pickups and Ctrl+Enter in the sound text still generate.
- **Loading a sound does not reorder the list.** Only a new version moves its sound to the top (3.3, "newest generation first").
- **Correction to `new_ui_plan.md` Q6:** at 420 px and below, `runtime.css` already makes the app fill the screen height (`100dvh`). On a phone, the page, and with it the list, is taller than the 598 px of the dev frame.

Checked:
- Runner PASS 179 FAIL 0 in headless Chrome (176 before). `aiPresets.test.js` was rewritten for the new screen, and `boot.test.js` checks the icon and the activity dot.
- Gates by grep: `src/ai` imports only its own files; nothing in `src` imports it; G-ui-boundary and G-debug are clean.
- Screenshots at 390 px: knob screen and AI screen with migrated sounds.

Not checked:
- A phone: touch targets, the keyboard over the card, and the full-height layout.
- Hardware: a version saved to a memory shows its letter on the amp.
- A real generation, especially with a changed guitar for the same sound (step 7.6). It waits for your go-ahead.
