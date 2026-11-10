import { UnitSelectorView } from './unitSelectorView.js';

// Top strip (presets, user memory label, connection) and footer (memory slots 1..5).
// The active slot, preset name and modified flag come from the store; the label text box is local only.
export class MemoryView {
  constructor({ presetMenu, onSelectSlot, onConnect, slotCount = 5 }) {
    this.presetMenu = presetMenu;
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
    presetSlot.className = 'strip-item';
    this.presetSelector = new UnitSelectorView({
      ariaLabel: `${this.presetMenu.label} actions`,
      className: 'align-left',
      items: this.presetMenu.items,
      displayValue: this.presetMenu.label,
      onChange: () => {
        // Preset actions are not wired yet.
      }
    }).mount(presetSlot);
    this.presetSelector.update({ value: '', items: this.presetMenu.items, displayValue: this.presetMenu.label });

    const labelSlot = document.createElement('div');
    labelSlot.className = 'strip-item center editable-memory';
    this.labelInput = document.createElement('input');
    this.labelInput.type = 'text';
    this.labelInput.className = 'strip-editable-input';
    this.labelInput.value = this.label;
    this.labelInput.setAttribute('aria-label', 'User memory label');
    this.labelInput.addEventListener('input', (event) => {
      this.label = event.target.value;
    });
    labelSlot.append(this.labelInput);

    const connectSlot = document.createElement('div');
    connectSlot.className = 'strip-item';
    this.connectButton = document.createElement('button');
    this.connectButton.type = 'button';
    this.connectButton.className = 'strip-button';
    this.connectButton.addEventListener('click', () => this.onConnect(this.connected));
    connectSlot.append(this.connectButton);
    this.setConnection();

    strip.append(presetSlot, labelSlot, connectSlot);
    return strip;
  }

  // Shell-driven: one press connects; once connected the same button disconnects and shows the amp's firmware version
  // (DISCONNECT until the activation has reported it). kind is the transport in use.
  setConnection({ kind = null, version = '', busy = false, error = '' } = {}) {
    this.connected = !!kind;
    const connectedLabel = version ? `FW ${version}` : 'DISCONNECT';
    this.connectButton.textContent = busy ? 'CONNECTING' : (kind ? connectedLabel : 'CONNECT');
    this.connectButton.disabled = busy;
    this.connectButton.title = kind ? `Connected over ${kind.toUpperCase()}. Press to disconnect.` : error;
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
    const label = name || labelFor(activeSlot);
    if (label !== this.label) {
      this.label = label;
      if (this.labelInput) this.labelInput.value = label;
    }
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
