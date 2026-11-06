export class LedView {
  constructor({ color = 'orange', ariaLabel, onToggle = null }) {
    this.color = color;
    this.ariaLabel = ariaLabel;
    this.onToggle = onToggle;
    this.active = false;
    this.clickable = false;
    this.build();
  }

  build() {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.setAttribute('aria-label', this.ariaLabel);

    const inner = document.createElement('div');
    inner.className = 'led-inner-ring';
    const lens = document.createElement('div');
    lens.className = 'led-lens';
    inner.append(lens);
    this.button.append(inner);

    this.button.addEventListener('click', () => {
      if (!this.clickable || typeof this.onToggle !== 'function') return;
      this.onToggle(!this.active);
    });
    this.applyColor();
    this.setActive(this.active);
  }

  applyColor() {
    this.button.className = `led-bezel led-${this.color}`;
    this.button.classList.toggle('active', this.active);
    this.button.setAttribute('aria-pressed', String(this.active));
  }

  // Store-driven update. A non-clickable LED (for example the amp family indicator) only displays state.
  update({ active, color, clickable }) {
    this.color = color || this.color;
    this.clickable = !!clickable;
    this.button.disabled = !this.clickable;
    this.button.setAttribute('aria-disabled', String(!this.clickable));
    this.setActive(!!active);
  }

  setActive(active) {
    this.active = !!active;
    this.applyColor();
  }

  mount(parent) {
    parent.appendChild(this.button);
    return this;
  }
}
