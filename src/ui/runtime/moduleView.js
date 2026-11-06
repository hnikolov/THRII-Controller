import { KnobView } from './knobView.js';
import { LedView } from './ledView.js';
import { UnitSelectorView } from './unitSelectorView.js';

const MODULE_LED_COLOR = 'orange';
const FIVE_SLOTS = 5;

// One effect or dynamics module: header (title, badge or unit selector, LED) and its knobs.
// Built once from the layout. update() applies a view model; user changes go out through handlers.
export class ModuleView {
  constructor(config, handlers) {
    this.config = config;
    this.handlers = handlers;
    this.knobViews = [];
    this.unitSelector = null;
    this.build();
  }

  build() {
    const { config } = this;
    this.root = document.createElement('section');
    this.root.className = 'module-section';
    this.root.dataset.moduleKey = config.key;
    if (config.compact) this.root.classList.add('compact');
    if (config.knobsByType) this.root.classList.add('right-aligned-knobs');

    const header = document.createElement('div');
    header.className = 'module-head';
    const inner = document.createElement('div');
    inner.className = 'module-head-inner';

    if (config.compact) {
      const title = document.createElement('div');
      title.className = 'module-title';
      title.textContent = config.mode || '';
      const spacer = document.createElement('div');
      spacer.setAttribute('aria-hidden', 'true');
      inner.append(title, spacer);
    } else {
      const leftGroup = document.createElement('div');
      leftGroup.className = 'module-head-left';

      const title = document.createElement('div');
      title.className = 'module-title';
      title.textContent = config.title || '';
      leftGroup.append(title);

      if (config.badge) {
        const badge = document.createElement('div');
        badge.className = 'module-badge';
        badge.textContent = config.badge;
        leftGroup.append(badge);
      }
      inner.append(leftGroup);

      if (config.unitOptions) {
        this.unitSelector = new UnitSelectorView({
          ariaLabel: `${config.title || 'Module'} unit selector`,
          items: config.unitOptions,
          onChange: name => this.handlers.onUnit(name)
        }).mount(inner);
      }
    }

    const ledSlot = document.createElement('div');
    ledSlot.className = 'module-led-slot';
    header.append(inner, ledSlot);

    this.led = new LedView({
      color: MODULE_LED_COLOR,
      ariaLabel: `${config.title || config.mode || 'Module'} power`,
      onToggle: next => this.handlers.onEnable(next)
    }).mount(ledSlot);

    this.knobGrid = document.createElement('div');
    this.knobGrid.className = 'module-knobs';
    this.root.append(header, this.knobGrid);

    // Type-dependent modules get five knob slots; the slots the current type does not use are hidden.
    const slotCount = config.knobsByType ? FIVE_SLOTS : config.knobs.length;
    for (let index = 0; index < slotCount; index += 1) {
      const view = new KnobView({
        label: config.knobs ? config.knobs[index].label : '',
        onChange: value => this.handlers.onKnob(index, value)
      }).mount(this.knobGrid);
      this.knobViews.push(view);
    }
  }

  unitOptionsFor(typeName) {
    const options = this.config.unitOptions || [];
    const known = options.some(option => option.value === typeName);
    return typeName && !known ? [{ value: typeName, label: typeName }, ...options] : options;
  }

  update(model) {
    this.root.classList.toggle('is-off', !model.active);
    this.led.update({ active: model.active, color: MODULE_LED_COLOR, clickable: !!model.enableRef });
    if (this.unitSelector) {
      this.unitSelector.update({ value: model.typeName, items: this.unitOptionsFor(model.typeName) });
    }
    this.knobViews.forEach((view, index) => {
      const knob = model.knobs[index];
      view.setHidden(!knob);
      if (knob) view.update({ label: knob.label, value: knob.value, writable: !!knob.ref });
    });
  }

  mount(parent) {
    parent.appendChild(this.root);
    return this;
  }
}
