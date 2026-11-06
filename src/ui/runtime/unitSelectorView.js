// Dropdown control. A user pick calls onChange with the item value; store-driven updates use update() and never call it.
// Items are strings (value and label alike) or { value, label } objects.
const toItem = item => (typeof item === 'string' ? { value: item, label: item } : item);

export class UnitSelectorView {
  static activeInstance = null;

  constructor({ ariaLabel, className = '', items = [], groups = null, displayValue = null, onChange = null }) {
    this.ariaLabel = ariaLabel;
    this.className = className;
    this.groups = groups;
    this.optionNodes = [];
    this.items = [];
    this.displayValue = displayValue;
    this.onChange = onChange;
    this.value = '';
    this.handleDocumentPointerDown = this.handleDocumentPointerDown.bind(this);
    this.handleDocumentKeyDown = this.handleDocumentKeyDown.bind(this);
    this.build();
    this.setItems(groups ? groups.flatMap(group => group.items) : items);
  }

  build() {
    this.root = document.createElement('div');
    this.root.className = `unit-selector ${this.className || ''}`.trim();

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'unit-selector-button';
    this.button.setAttribute('aria-haspopup', 'menu');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.setAttribute('aria-label', this.ariaLabel);

    this.labelNode = document.createElement('span');
    this.labelNode.className = 'unit-selector-label';

    this.caretNode = document.createElement('span');
    this.caretNode.className = 'unit-selector-caret';
    this.caretNode.textContent = '▼';
    this.caretNode.setAttribute('aria-hidden', 'true');

    this.button.append(this.labelNode, this.caretNode);

    this.menu = document.createElement('div');
    this.menu.className = 'unit-selector-menu';
    this.menu.setAttribute('role', 'menu');

    this.root.append(this.button, this.menu);

    this.button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.root.classList.contains('open')) {
        this.close();
      } else {
        this.open();
      }
    });
  }

  renderOptions() {
    this.menu.replaceChildren();
    this.optionNodes = [];
    this.menu.classList.toggle('is-grouped', !!this.groups);
    if (this.groups) {
      this.groups.forEach((group) => {
        const column = document.createElement('div');
        column.className = `unit-selector-column${group.key ? ` family-${group.key}` : ''}`;
        const title = document.createElement('div');
        title.className = 'unit-selector-column-title';
        title.textContent = group.title;
        column.append(title, ...group.items.map(item => this.createOption(item)));
        this.menu.append(column);
      });
    } else {
      this.items.forEach(item => this.menu.append(this.createOption(item)));
    }
    this.refreshOptionState();
  }

  createOption(item) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'unit-selector-option';
    option.textContent = item.label;
    option.setAttribute('role', 'menuitemradio');
    option.addEventListener('click', (event) => {
      event.stopPropagation();
      this.close();
      this.choose(item.value);
    });
    this.optionNodes.push({ item, node: option });
    return option;
  }

  refreshOptionState() {
    this.optionNodes.forEach(({ item, node }) => {
      const selected = item.value === this.value;
      node.classList.toggle('is-selected', selected);
      node.setAttribute('aria-checked', String(selected));
    });
  }

  labelFor(value) {
    const item = this.items.find(entry => entry.value === value);
    return item ? item.label : value;
  }

  // Rebuild the menu only when the list changes, so an open menu is not reset by store updates.
  setItems(items) {
    const next = items.map(toItem);
    if (JSON.stringify(next) === JSON.stringify(this.items)) return;
    this.items = next;
    this.renderOptions();
  }

  // Store-driven update.
  update({ value, items = this.items, displayValue = this.displayValue }) {
    this.setItems(items);
    this.displayValue = displayValue;
    this.value = value == null ? '' : String(value);
    this.labelNode.textContent = this.displayValue ?? this.labelFor(this.value);
    this.refreshOptionState();
  }

  // User pick: show it at once, then report it.
  choose(value) {
    this.value = value;
    this.labelNode.textContent = this.displayValue ?? this.labelFor(value);
    this.refreshOptionState();
    if (typeof this.onChange === 'function') this.onChange(value);
  }

  open() {
    if (UnitSelectorView.activeInstance && UnitSelectorView.activeInstance !== this) {
      UnitSelectorView.activeInstance.close();
    }
    UnitSelectorView.activeInstance = this;
    this.root.classList.add('open');
    this.button.setAttribute('aria-expanded', 'true');
    this.positionMenu();
    document.addEventListener('pointerdown', this.handleDocumentPointerDown);
    document.addEventListener('keydown', this.handleDocumentKeyDown);
  }

  close() {
    this.root.classList.remove('open', 'open-up');
    this.button.setAttribute('aria-expanded', 'false');
    if (UnitSelectorView.activeInstance === this) {
      UnitSelectorView.activeInstance = null;
    }
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown);
    document.removeEventListener('keydown', this.handleDocumentKeyDown);
  }

  positionMenu() {
    this.root.classList.remove('open-up');
    const menuRect = this.menu.getBoundingClientRect();
    if (menuRect.bottom > window.innerHeight && menuRect.top > menuRect.height) {
      this.root.classList.add('open-up');
    }
  }

  handleDocumentPointerDown(event) {
    if (!this.root.contains(event.target)) {
      this.close();
    }
  }

  handleDocumentKeyDown(event) {
    if (event.key === 'Escape') {
      this.close();
      this.button.focus({ preventScroll: true });
    }
  }

  mount(parent) {
    parent.appendChild(this.root);
    return this;
  }
}
