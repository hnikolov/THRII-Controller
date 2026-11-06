const TOKENS = {
  VIEWBOX_SIZE: 176,
  CENTER_X: 88,
  CENTER_Y: 88,
  OUTER_RING_RADIUS: 60,
  POINTER_START_RADIUS: 36,
  POINTER_END_RADIUS: 56,
  START_DEG: 225,
  SWEEP_DEG: 270,
  MIN: 0,
  MAX: 100,
  KEY_STEP: 1,
  FAST_STEP: 10,
  DRAG_SPEED: 0.38
};

const SVG_NS = 'http://www.w3.org/2000/svg';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

// Display-only knob. Its value comes from update(); user changes are reported through onChange.
// While the pointer is down the display follows the pointer, and store updates do not override it.
export class KnobView {
  constructor({ label, onChange = null }) {
    this.label = label;
    this.onChange = onChange;
    this.value = null;
    this.writable = false;
    this.dragging = false;
    this.anchorY = 0;
    this.anchorValue = 0;
    this.isFirstTouchMove = false;
    this.build();
  }

  build() {
    this.root = document.createElement('div');
    this.root.className = 'knob-module';

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'knob';
    this.button.setAttribute('role', 'slider');
    this.button.setAttribute('aria-label', `${this.label} control`);
    this.button.setAttribute('aria-valuemin', String(TOKENS.MIN));
    this.button.setAttribute('aria-valuemax', String(TOKENS.MAX));

    this.dial = document.createElement('div');
    this.dial.className = 'dial';

    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${TOKENS.VIEWBOX_SIZE} ${TOKENS.VIEWBOX_SIZE}`);
    this.svg.setAttribute('aria-hidden', 'true');

    this.trackPath = document.createElementNS(SVG_NS, 'path');
    this.trackPath.setAttribute('class', 'track-path');
    this.activePath = document.createElementNS(SVG_NS, 'path');
    this.activePath.setAttribute('class', 'active-path');
    this.pointerLine = document.createElementNS(SVG_NS, 'line');
    this.pointerLine.setAttribute('class', 'pointer-line');

    this.centerValue = document.createElement('div');
    this.centerValue.className = 'center-value';
    this.labelNode = document.createElement('div');
    this.labelNode.className = 'label';
    this.labelNode.textContent = this.label;

    this.svg.append(this.trackPath, this.activePath, this.pointerLine);
    this.dial.append(this.svg, this.centerValue);
    this.button.append(this.dial, this.labelNode);
    this.root.append(this.button);

    this.bindEvents();
  }

  bindEvents() {
    this.button.addEventListener('mouseenter', () => this.button.focus({ preventScroll: true }));

    this.button.addEventListener('pointerdown', (event) => {
      if (!this.writable) return;
      this.button.focus({ preventScroll: true });
      this.dragging = true;
      this.anchorY = event.clientY;
      this.anchorValue = this.value;
      this.isFirstTouchMove = event.pointerType === 'touch';
      this.button.setPointerCapture(event.pointerId);
    });

    this.button.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;

      const rect = this.dial.getBoundingClientRect();
      const insideDial = (
        event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom
      );

      if (insideDial && event.pointerType !== 'touch') {
        this.setLocal(this.valueFromPoint(event.clientX, event.clientY));
        this.anchorY = event.clientY;
        this.anchorValue = this.value;
        return;
      }

      if (this.isFirstTouchMove) {
        this.anchorY = event.clientY;
        this.anchorValue = this.value;
        this.isFirstTouchMove = false;
        return;
      }

      const delta = (this.anchorY - event.clientY) * TOKENS.DRAG_SPEED;
      this.setLocal(this.anchorValue + delta);
    });

    const stopDrag = (event) => {
      this.dragging = false;
      this.isFirstTouchMove = false;
      try { this.button.releasePointerCapture(event.pointerId); } catch (_) {}
    };

    this.button.addEventListener('pointerup', stopDrag);
    this.button.addEventListener('pointercancel', stopDrag);
    this.button.addEventListener('lostpointercapture', () => {
      this.dragging = false;
      this.isFirstTouchMove = false;
    });

    this.button.addEventListener('wheel', (event) => {
      if (!this.writable) return;
      event.preventDefault();
      const step = event.shiftKey ? TOKENS.FAST_STEP : TOKENS.KEY_STEP;
      this.setLocal(this.value + (event.deltaY < 0 ? step : -step));
    }, { passive: false });

    this.button.addEventListener('keydown', (event) => {
      if (!this.writable) return;
      const step = event.shiftKey ? TOKENS.FAST_STEP : TOKENS.KEY_STEP;
      let next = this.value;
      let handled = true;

      switch (event.key) {
        case 'ArrowUp':
        case 'ArrowRight':
          next = this.value + step;
          break;
        case 'ArrowDown':
        case 'ArrowLeft':
          next = this.value - step;
          break;
        case 'PageUp':
          next = this.value + TOKENS.FAST_STEP;
          break;
        case 'PageDown':
          next = this.value - TOKENS.FAST_STEP;
          break;
        case 'Home':
          next = TOKENS.MIN;
          break;
        case 'End':
          next = TOKENS.MAX;
          break;
        default:
          handled = false;
      }

      if (!handled) return;
      event.preventDefault();
      this.setLocal(next);
    });
  }

  polar(radius, degrees) {
    const radians = ((degrees - 90) * Math.PI) / 180;
    return {
      x: TOKENS.CENTER_X + radius * Math.cos(radians),
      y: TOKENS.CENTER_Y + radius * Math.sin(radians)
    };
  }

  fullCirclePath(radius) {
    const top = this.polar(radius, 0);
    const bottom = this.polar(radius, 180);
    return `M ${top.x.toFixed(2)} ${top.y.toFixed(2)} A ${radius} ${radius} 0 1 1 ${bottom.x.toFixed(2)} ${bottom.y.toFixed(2)} A ${radius} ${radius} 0 1 1 ${top.x.toFixed(2)} ${top.y.toFixed(2)}`;
  }

  arcPath(radius, startDeg, endDeg) {
    const start = this.polar(radius, startDeg);
    const end = this.polar(radius, endDeg);
    const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }

  angleFromValue(value) {
    const ratio = (value - TOKENS.MIN) / (TOKENS.MAX - TOKENS.MIN);
    return TOKENS.START_DEG + ratio * TOKENS.SWEEP_DEG;
  }

  valueFromPoint(clientX, clientY) {
    const rect = this.dial.getBoundingClientRect();
    const x = clientX - (rect.left + rect.width / 2);
    const y = clientY - (rect.top + rect.height / 2);
    let angle = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (angle < 0) angle += 360;
    let delta = angle - TOKENS.START_DEG;
    if (delta < 0) delta += 360;
    delta = Math.max(0, Math.min(TOKENS.SWEEP_DEG, delta));
    return TOKENS.MIN + (delta / TOKENS.SWEEP_DEG) * (TOKENS.MAX - TOKENS.MIN);
  }

  render() {
    const trackRadius = TOKENS.OUTER_RING_RADIUS;
    this.trackPath.setAttribute('d', this.fullCirclePath(trackRadius));

    if (this.value === null) {
      this.activePath.setAttribute('d', '');
      this.pointerLine.style.display = 'none';
      this.centerValue.textContent = '--';
      this.button.removeAttribute('aria-valuenow');
      return;
    }

    const activeTrackRadius = trackRadius - 3; // NOTE: 3 = (active-stroke - track-stroke) / 2
    const angle = this.angleFromValue(this.value);
    const pointerStart = this.polar(TOKENS.POINTER_START_RADIUS, angle);
    const pointerEnd = this.polar(TOKENS.POINTER_END_RADIUS, angle);
    this.activePath.setAttribute('d', this.arcPath(activeTrackRadius, TOKENS.START_DEG, angle));
    this.pointerLine.style.display = '';
    this.pointerLine.setAttribute('x1', pointerStart.x.toFixed(2));
    this.pointerLine.setAttribute('y1', pointerStart.y.toFixed(2));
    this.pointerLine.setAttribute('x2', pointerEnd.x.toFixed(2));
    this.pointerLine.setAttribute('y2', pointerEnd.y.toFixed(2));
    this.centerValue.textContent = String(this.value);
    this.button.setAttribute('aria-valuenow', String(this.value));
  }

  // Store-driven update: value is 0..100, or null when the parameter is unavailable. A label can change with the type.
  update({ label, value, writable }) {
    if (label !== undefined && label !== this.label) {
      this.label = label;
      this.labelNode.textContent = label;
      this.button.setAttribute('aria-label', `${label} control`);
    }
    this.writable = !!writable && value !== null;
    this.button.disabled = !this.writable;
    if (this.dragging) return;
    this.value = value === null ? null : clamp(value, TOKENS.MIN, TOKENS.MAX);
    this.render();
  }

  // Hidden knobs take no space: the module knob row is right-aligned.
  setHidden(hidden) {
    this.root.style.display = hidden ? 'none' : '';
  }

  // User change: update the display at once, then report it. The store commit happens in the callback.
  setLocal(nextValue) {
    if (!this.writable) return;
    const next = clamp(nextValue, TOKENS.MIN, TOKENS.MAX);
    if (next === this.value) return;
    this.value = next;
    this.render();
    if (typeof this.onChange === 'function') this.onChange(next);
  }

  mount(parent) {
    parent.appendChild(this.root);
    this.render();
    return this;
  }
}
