import { KnobView } from './knobView.js';
import { LedView } from './ledView.js';
import { UnitSelectorView } from './unitSelectorView.js';

// Amp header (model and cabinet dropdowns, family LED) and the five amp knobs.
export class AmpView {
  constructor(config, handlers) {
    this.config = config;
    this.handlers = handlers;
    this.knobViews = [];
    this.build();
  }

  build() {
    this.root = document.createElement('section');
    this.root.className = 'module-section amp-head';
    this.root.dataset.moduleKey = 'amp';

    const headRow = document.createElement('div');
    headRow.className = 'amp-head-row';

    this.modelSelector = new UnitSelectorView({
      ariaLabel: 'Select amp model',
      className: 'align-left is-amp',
      groups: this.config.ampGroups,
      onChange: name => this.handlers.onModel(name)
    }).mount(headRow);

    this.cabSelector = new UnitSelectorView({
      ariaLabel: 'Select speaker cabinet',
      className: 'align-right is-cab',
      items: this.config.cabinets,
      onChange: name => this.handlers.onCabinet(name)
    }).mount(headRow);

    const ledWrap = document.createElement('div');
    ledWrap.className = 'module-led-slot';
    headRow.append(ledWrap);

    this.led = new LedView({
      color: 'blue',
      ariaLabel: 'Selected amp family indicator',
      onToggle: () => this.handlers.onFamily()
    }).mount(ledWrap);

    this.knobGrid = document.createElement('div');
    this.knobGrid.className = 'amp-knobs';
    this.root.append(headRow, this.knobGrid);

    this.config.knobs.forEach((knob, index) => {
      const view = new KnobView({
        label: knob.label,
        onChange: value => this.handlers.onKnob(index, value)
      }).mount(this.knobGrid);
      this.knobViews.push(view);
    });
  }

  update(model) {
    this.modelSelector.update({ value: model.modelName });
    this.cabSelector.update({ value: model.cabinet.name, items: this.config.cabinets });
    this.led.update({ active: true, color: model.ledColor, clickable: model.unitId !== null });
    model.knobs.forEach((knob, index) => {
      this.knobViews[index].update({ value: knob.value, writable: !!knob.ref });
    });
  }

  mount(parent) {
    parent.appendChild(this.root);
    return this;
  }
}
