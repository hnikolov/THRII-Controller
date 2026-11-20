import { parseThrl6Preset, presetFileName, presetToPlan, presetToText, storeToPreset } from '../domain/presetModel.js';
import { applyPresetPlan, comparePlan } from '../state/applyPreset.js';
import { findUnitById } from '../state/selectors.js';
import { parsePatchName, withPatchName } from '../protocol/dumpParser.js';
import { buildPresetPatch, memoryDifferences } from '../protocol/memoryPatch.js';
import { buildSlotUploadFrames, buildUploadFrames, UPLOAD_PACE_MS } from '../protocol/builders.js';

const SLOT_COUNT = 5;
// Time the amp gets to store an uploaded memory before it is recalled.
const UPLOAD_SETTLE_MS = 300;
const BACKUP_FORMAT = 'thrii-backup';
const ACTUAL = { kind: 'actual' };
const slotTarget = slot => ({ kind: 'slot', value: slot - 1 });

const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
const fromBase64 = text => Uint8Array.from(atob(text), ch => ch.charCodeAt(0));
const today = () => new Date().toISOString().slice(0, 10);

// The actions of the Presets screen (run) and the import of a preset text (importText). Export and import work without
// an amp (on the store); with an amp, an import also sends the preset and reads it back. Backup, Save and Restore need the amp.
// Import with an amp has two mechanisms. Quick (quickImport() true): one patch built from the preset is uploaded to the
// Actual settings. Value by value: the type selects and parameter writes of the UI edits, with their pauses. The quick
// one falls back to the other when its patch cannot be built, or when the amp then differs from the preset. A read or
// send that fails ends the import: the amp is not answering, and some 50 more frames would only add to its load
// (over BLE that fallback left the amp unresponsive until it was switched off and on).
// deps: store, sync, send(frame, label), sendPlan(modules), selectSlot(slot) -> the Actual patch after the recall (or null),
// log(text) for the trace, exclusive(label, fn), isConnected(), quickImport(),
// device() -> { firmware, identity }, lookups { idOfName, nameOf, stateIdOf, isKnownType }, files { pickText, choose, download }, confirm, notify, pause.
export function createPresetFlow(deps) {
  const { store, sync, files, notify } = deps;

  // The save dialog lets the user pick the folder (and change the file name) where the browser has one.
  // Resolves to the text written, or null when the dialog was cancelled.
  async function exportPreset() {
    const name = (store.getState().presetName || '').trim() || 'My Preset';
    const text = presetToText(storeToPreset(store.getState(), name));
    const target = await files.choose(presetFileName(name));
    if (!target) return null;
    await target.write(text);
    notify('Exported ' + name);
    return text;
  }

  // The import of a preset plan, whatever text it comes from (a file, a preset source). Resolves to the message shown.
  async function importPlan(plan) {
    let message = `Imported ${plan.presetName} (amp not connected)`;

    if (!deps.isConnected()) {
      applyPresetPlan(store, plan);
      notify(message);
      return message;
    }

    await deps.exclusive(`Importing ${plan.presetName}`, async () => {
      let differences = deps.quickImport() ? await uploadPreset(plan) : null;
      if (differences === null || differences.length) {
        if (differences) deps.log(`Quick import: the amp differs in ${differences.join(', ')}; sending the preset value by value`);
        differences = await writePreset(plan);
      }
      // The amp's own answer has replaced the store; the imported name and the modified state are put back.
      store.commit(state => {
        state.presetName = plan.presetName;
        state.activeSlot = null;
        state.modified = true;
      }, 'import');
      message = differences.length
        ? `Imported ${plan.presetName}, but the amp differs in: ${differences.join(', ')}`
        : `Imported ${plan.presetName}`;
      notify(message);
    });
    return message;
  }

  // The amp is read back after an import. Returns where it differs from the preset.
  async function readBack(plan) {
    await sync.read(ACTUAL, { apply: true });
    return comparePlan(store.getState(), plan);
  }

  // Quick import: the preset as one patch, uploaded to the Actual settings; then the amp is read back.
  // The patch is built on the amp's Actual dump, read right before the upload (buildPresetPatch). Returns where the amp
  // then differs from the preset, or null when the patch could not be built. A failed read or send throws.
  // The read is not skipped, even when an earlier read is still current: every upload that worked on the amp came right
  // after a read, and one built on an earlier read failed over BLE (no complete dump on the read-back, the amp needed a
  // power cycle; phone, 2026-11-20).
  async function uploadPreset(plan) {
    const template = await sync.read(ACTUAL);
    let frames;
    try {
      frames = buildUploadFrames(ACTUAL, buildPresetPatch(template, plan, deps.lookups));
    } catch (err) {
      deps.log(`Quick import not possible (${err.message}); sending the preset value by value`);
      return null;
    }
    for (const [index, frame] of frames.entries()) {
      await deps.send(frame, `TX import upload ${index + 1}/${frames.length}`);
      await deps.pause(UPLOAD_PACE_MS);
    }
    await deps.pause(UPLOAD_SETTLE_MS);
    return readBack(plan);
  }

  // Value-by-value import: the store first, then the type selects and writes, then the amp is read back.
  async function writePreset(plan) {
    // A type the amp already has is not selected again: fewer type switches, and its other settings stay.
    const current = store.getState();
    const modules = plan.modules.map(module => ({
      ...module,
      select: module.typeKey != null && (findUnitById(current, module.unitId) || {}).typeKey !== module.typeKey
    }));
    applyPresetPlan(store, plan);
    await deps.sendPlan(modules);
    return readBack(plan);
  }

  async function readBackup() {
    const slots = [];
    for (let slot = 1; slot <= SLOT_COUNT; slot += 1) {
      const patch = await sync.read(slotTarget(slot));
      slots.push({ slot, name: parsePatchName(patch) || '', patch: toBase64(patch) });
    }
    return { format: BACKUP_FORMAT, version: 1, date: today(), ...deps.device(), slots };
  }

  // The place for the file is chosen first, while the menu click still allows a dialog; the memories are read after that.
  async function backup() {
    if (!deps.isConnected()) throw new Error('connect the amp first');
    const target = await files.choose(`THR backup ${today()}.json`);
    if (!target) return;
    await deps.exclusive('Reading the five memories', async () => {
      await target.write(JSON.stringify(await readBackup(), null, 1) + '\n');
      notify('Backup saved');
    });
  }

  // Uploads a patch to a memory, recalls the memory and compares the Actual settings with what was sent: what the
  // memory plays. Reading the memory itself is no check: until it is recalled the amp answers that read with the
  // memory's old content (seen on hardware, also 1.3 s after the upload). True when the memory plays what was sent;
  // either way the memory is the active one afterwards.
  async function writeSlot(slot, patch) {
    const frames = buildSlotUploadFrames(slot - 1, patch);
    for (const [index, frame] of frames.entries()) {
      await deps.send(frame, `TX save memory ${slot} ${index + 1}/${frames.length}`);
      await deps.pause(UPLOAD_PACE_MS);
    }
    await deps.pause(UPLOAD_SETTLE_MS);
    const recalled = await deps.selectSlot(slot);
    const differences = recalled ? memoryDifferences(recalled, patch, deps.lookups.nameOf) : ['the memory could not be recalled'];
    deps.log(`Save check: memory ${slot} recalled, ${differences.length ? 'differs: ' + differences.join('; ') : 'plays what was sent'}`);
    return !differences.length;
  }

  // Copies what the amp plays now (its own Actual dump, with the name from the label) into a memory and makes that
  // memory the active one. The memory's previous content is read first and offered back if the write does not verify.
  async function save(slot) {
    if (!deps.isConnected()) throw new Error('connect the amp first');
    if (!deps.confirm(`Overwrite memory ${slot} on the amp?`)) return;
    await deps.exclusive(`Saving to memory ${slot}`, async () => {
      const name = (store.getState().presetName || '').trim();
      const actual = await sync.read(ACTUAL);
      const patch = name ? withPatchName(actual, name) : actual;
      const previous = await sync.read(slotTarget(slot));

      if (await writeSlot(slot, patch)) {
        notify(`Saved to memory ${slot}`);
        return;
      }
      if (!deps.confirm(`Memory ${slot} does not hold what was sent. Put its previous content back?`)) {
        notify(`Memory ${slot} was not saved correctly`);
      } else if (await writeSlot(slot, previous)) {
        notify(`Save failed; memory ${slot} is unchanged`);
      } else {
        notify(`Save failed; memory ${slot} not put back. Use RESTORE with a backup.`);
      }
    });
  }

  function parseBackup(json) {
    const slots = json && json.format === BACKUP_FORMAT && json.version === 1 && Array.isArray(json.slots) ? json.slots : null;
    if (!slots || slots.length !== SLOT_COUNT || slots.some((entry, i) => entry.slot !== i + 1 || typeof entry.patch !== 'string')) {
      throw new Error('this is not a THR backup file');
    }
    const { firmware, identity } = deps.device();
    if (json.firmware !== firmware || JSON.stringify(json.identity) !== JSON.stringify(identity)) {
      throw new Error(`the backup is from another amp or firmware (${json.firmware}); this amp has ${firmware}`);
    }
    return { date: json.date, patches: slots.map(entry => fromBase64(entry.patch)) };
  }

  async function restore() {
    if (!deps.isConnected()) throw new Error('connect the amp first');
    const file = await files.pickText('.json,application/json');
    if (!file) return;
    const { date, patches } = parseBackup(JSON.parse(file.text));
    if (!deps.confirm(`Overwrite all five memories on the amp with the backup from ${date}?`)) return;
    await deps.exclusive('Restoring the five memories', async () => {
      files.download(`THR backup ${today()} before restore.json`, JSON.stringify(await readBackup(), null, 1) + '\n');
      for (let slot = 1; slot <= SLOT_COUNT; slot += 1) {
        if (!(await writeSlot(slot, patches[slot - 1]))) {
          throw new Error(`memory ${slot} did not verify; ${slot - 1} of 5 memories were restored before it`);
        }
      }
      notify('Restored all five memories');
    });
  }

  const actions = { export: exportPreset, backup, restore, save };

  const failed = (name, err) => {
    const message = `${name} failed: ${err.message}`;
    notify(message);
    return message;
  };

  return {
    // action: 'export', 'backup', 'restore' or 'save:1' .. 'save:5'. Resolves to the action's result (Export: the text
    // written, or null); failures are reported and resolve to null, never thrown.
    async run(action) {
      const [name, slot] = action.split(':');
      try {
        return await actions[name](Number(slot));
      } catch (err) {
        failed(`${name[0].toUpperCase()}${name.slice(1)}`, err);
        return null;
      }
    },
    // Imports a .thrl6p text. Resolves to { ok, message }, the message being the one shown; never throws.
    // refused: true when the text itself cannot be loaded (nothing changed). Without it a failed import is a failure of
    // the amp or the link: the preset is fine and may be tried again.
    async importText(text) {
      let plan;
      try {
        plan = presetToPlan(parseThrl6Preset(JSON.parse(text)), deps.lookups);
      } catch (err) {
        return { ok: false, refused: true, message: failed('Import', err) };
      }
      try {
        return { ok: true, message: await importPlan(plan) };
      } catch (err) {
        return { ok: false, message: failed('Import', err) };
      }
    }
  };
}
