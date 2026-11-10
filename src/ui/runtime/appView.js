import { AmpView } from './ampView.js';
import { MemoryView } from './memoryView.js';
import { ModuleView } from './moduleView.js';
import { defaultsForType, knobToValue, nextFamilyModel } from './viewModel.js';

// Whole runtime tree. Built once; update() applies a view model. User actions become intents here.
export class AppView {
  constructor(layout, intents) {
    this.layout = layout;
    this.intents = intents;
    this.model = null;
    this.modules = new Map();
    this.memory = new MemoryView({
      presetMenu: layout.presetMenu,
      onSelectSlot: slot => this.intents.selectSlot(slot),
      onConnect: connected => (connected ? this.intents.disconnect() : this.intents.connect())
    });
    this.build();
  }

  build() {
    const { layout } = this;
    this.root = document.createElement('main');
    this.root.className = 'thr-app';
    this.root.append(this.memory.buildTop());

    const body = document.createElement('div');
    body.className = 'ui-body';

    this.amp = new AmpView({
      ampGroups: layout.ampGroups,
      cabinets: layout.cabinets,
      knobs: layout.amp.knobs
    }, {
      onModel: name => this.selectModel(name),
      onFamily: () => this.cycleAmpFamily(),
      onCabinet: name => this.selectCabinet(name),
      onKnob: (index, percent) => this.setKnob(null, index, percent)
    });
    this.amp.mount(body);

    layout.rows.forEach((row) => {
      const rowEl = document.createElement('div');
      if (row.type === 'dual') {
        rowEl.className = 'module-row dual';
        row.modules.forEach(config => this.mountModule(rowEl, config));
      } else {
        rowEl.className = 'module-row';
        this.mountModule(rowEl, row.module);
      }
      body.append(rowEl);
    });

    this.root.append(body, this.memory.buildFooter());
  }

  mountModule(parent, config) {
    const view = new ModuleView(config, {
      onKnob: (index, percent) => this.setKnob(config.key, index, percent),
      onEnable: next => this.setEnable(config.key, next),
      onUnit: name => this.selectUnit(config, name)
    }).mount(parent);
    this.modules.set(config.key, view);
  }

  update(model) {
    this.model = model;
    this.amp.update(model.amp);
    this.modules.forEach((view, key) => view.update(model.modules[key]));
    this.memory.update(model.memory);
  }

  // User actions become intents; the store marks the memory as modified.
  setKnob(moduleKey, index, percent) {
    const knobs = moduleKey ? this.model.modules[moduleKey].knobs : this.model.amp.knobs;
    const ref = knobs[index] && knobs[index].ref;
    if (!ref) return;
    this.intents.setParam(ref, knobToValue(ref, percent));
  }

  setEnable(moduleKey, next) {
    const ref = this.model.modules[moduleKey].enableRef;
    if (!ref) return;
    this.intents.setParam(ref, next);
  }

  selectModel(name) {
    const unitId = this.model.amp.unitId;
    if (unitId === null) return;
    this.intents.selectUnit(unitId, name);
  }

  // The LED tap steps to the next amp family, keeping the model's position in it.
  cycleAmpFamily() {
    const unitId = this.model.amp.unitId;
    const next = nextFamilyModel(this.model.amp.modelName);
    if (unitId === null || !next) return;
    this.intents.selectUnit(unitId, next);
  }

  selectCabinet(name) {
    const ref = this.model.amp.cabinet.ref;
    const index = this.layout.cabinets.indexOf(name);
    if (!ref || index < 0) return;
    this.intents.setParam(ref, index);
  }

  // A type pick switches the module on (the defaults and the enable go to the amp after the select frames).
  selectUnit(config, name) {
    const module = this.model.modules[config.key];
    if (module.unitId === null) return;
    this.intents.selectUnit(module.unitId, name, defaultsForType(config, name), module.enableRef);
  }

  mount(parent) {
    parent.replaceChildren(this.root);
    return this;
  }
}
