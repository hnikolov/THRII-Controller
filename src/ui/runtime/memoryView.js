import { PRESET_NAME_MAX } from '../../domain/presetModel.js';

// Top strip (page toggles, user memory label, connection) and footer (memory slots 1..5).
// The active slot, preset name and modified flag come from the store; typing in the label sets the preset name there.
export class MemoryView {
  constructor({ pages = [], onSelectSlot, onConnect, onPage, onName, slotCount = 5 }) {
    this.pages = pages;
    this.pageButtons = new Map();
    this.onPage = onPage;
    this.onName = onName;
    this.onSelectSlot = onSelectSlot;
    this.onConnect = onConnect;
    this.slotCount = slotCount;
    this.activeSlot = null;
    this.label = labelFor(null);
    this.modified = false;
    this.slotButtons = [];
  }

  buildTop() {
    const strip = document.createElement('div');
    strip.className = 'top-strip';

    const presetSlot = document.createElement('div');
    presetSlot.className = 'strip-item has-pages';

    // The page buttons work as tabs: the knob area (key null, a drawn knob) and the pages; exactly one is lit, and a
    // press on the lit one changes nothing. Without pages there is nothing to switch, so no tabs at all.
    const tabs = this.pages.length ? [{ key: null, label: '', title: 'Amp settings', knob: true }, ...this.pages] : [];
    tabs.forEach(({ key, label, title, knob }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = ['strip-page-button', title && 'is-icon', knob && 'is-knob'].filter(Boolean).join(' ');
      button.textContent = label;
      if (title) {
        button.setAttribute('aria-label', title);
        button.title = title;
      }
      button.addEventListener('click', () => this.onPage(key));
      this.pageButtons.set(key, button);
      presetSlot.append(button);
    });
    this.setPage(null);

    const labelSlot = document.createElement('div');
    labelSlot.className = 'strip-item center editable-memory';
    this.labelInput = document.createElement('input');
    this.labelInput.type = 'text';
    this.labelInput.className = 'strip-editable-input';
    this.labelInput.value = this.label;
    this.labelInput.setAttribute('aria-label', 'User memory label');
    this.labelInput.maxLength = PRESET_NAME_MAX;
    this.labelInput.addEventListener('focus', () => this.labelInput.select());
    this.labelInput.addEventListener('input', event => this.onName(event.target.value));
    this.labelInput.addEventListener('blur', () => { this.labelInput.value = this.label; });
    labelSlot.append(this.labelInput);

    const connectSlot = document.createElement('div');
    connectSlot.className = 'strip-item is-end';
    this.updateButton = document.createElement('button');
    this.updateButton.type = 'button';
    this.updateButton.className = 'strip-update-button';
    this.updateButton.textContent = '⇪';
    this.updateButton.title = 'App update ready. Press to update (the app restarts).';
    this.updateButton.setAttribute('aria-label', 'Update the app');
    this.updateButton.hidden = true;
    this.updateButton.addEventListener('click', () => this.onUpdate && this.onUpdate());
    connectSlot.append(this.updateButton);
    this.connectButton = document.createElement('button');
    this.connectButton.type = 'button';
    this.connectButton.className = 'strip-button';
    this.connectButton.addEventListener('click', () => this.onConnect(this.connected));
    connectSlot.append(this.connectButton);
    this.setConnection();

    strip.append(presetSlot, labelSlot, connectSlot);
    return strip;
  }

  // View-driven: the page that is shown (its key), or null for the knob area.
  setPage(shown) {
    this.pageButtons.forEach((button, key) => {
      button.classList.toggle('is-selected', key === shown);
      button.setAttribute('aria-pressed', String(key === shown));
    });
  }

  // Shell-driven: a page's work goes on while it is hidden (a generation); its button shows a dot meanwhile.
  setPageActivity(key, active) {
    const button = this.pageButtons.get(key);
    if (button) button.classList.toggle('is-active', !!active);
  }

  // Shell-driven: one press connects; once connected the same button disconnects and shows the amp's firmware version
  // (DISCONNECT until the activation has reported it). kind is the transport in use.
  // Without an amp, the app's own version shows under CONNECT.
  setConnection({ kind = null, version = '', busy = false, error = '' } = {}) {
    this.connection = { kind, version, busy, error };
    this.connected = !!kind;
    const connectedLabel = version ? `FW ${version}` : 'DISCONNECT';
    this.connectButton.textContent = busy ? 'CONNECTING' : (kind ? connectedLabel : 'CONNECT');
    if (!kind && !busy && this.appVersion) {
      const caption = document.createElement('span');
      caption.className = 'strip-caption';
      caption.textContent = `v${this.appVersion}`;
      this.connectButton.append(caption);
    }
    this.connectButton.disabled = busy;
    this.connectButton.title = kind ? `Connected over ${kind.toUpperCase()}. Press to disconnect.` : error;
  }

  // Shell-driven: the app's version, and onUpdate while an app update waits (null hides the update button).
  setAppInfo({ version = '', onUpdate = null } = {}) {
    this.appVersion = version;
    this.onUpdate = onUpdate;
    this.updateButton.hidden = !onUpdate;
    this.setConnection(this.connection);
  }

  buildFooter() {
    const strip = document.createElement('div');
    strip.className = 'footer-strip';

    for (let slotNumber = 1; slotNumber <= this.slotCount; slotNumber += 1) {
      const slot = document.createElement('div');
      slot.className = 'strip-item';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'footer-memory-button';
      button.setAttribute('aria-label', `Recall memory slot ${slotNumber}`);
      button.addEventListener('click', () => this.onSelectSlot(slotNumber));
      this.slotButtons.push(button);
      slot.append(button);
      strip.append(slot);
    }
    this.renderSlots();
    return strip;
  }

  // Store-driven update: the name is the preset name from the dump, or the default label for the slot.
  update({ activeSlot, name, modified }) {
    this.activeSlot = activeSlot;
    this.modified = !!modified && activeSlot !== null;
    this.label = name || labelFor(activeSlot);
    // While the name is being typed and is empty, the box stays empty; the default label returns when it loses focus.
    const clearing = !name && document.activeElement === this.labelInput;
    if (this.labelInput && this.labelInput.value !== this.label && !clearing) this.labelInput.value = this.label;
    this.renderSlots();
  }

  renderSlots() {
    this.slotButtons.forEach((button, index) => {
      const slotNumber = index + 1;
      const selected = this.activeSlot === slotNumber;
      button.textContent = `${slotNumber}${selected && this.modified ? ' *' : ''}`;
      button.classList.toggle('is-selected', selected && !this.modified);
      button.setAttribute('aria-pressed', String(selected && !this.modified));
    });
  }
}

function labelFor(slot) {
  return slot === null ? 'ACTUAL' : `USER MEMORY ${slot}`;
}
