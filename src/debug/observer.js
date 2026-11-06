import { toHex } from '../core/bytes.js';

export function createRawObserver(bus, limit = 500) {
  const frames = [];
  const listeners = new Set();

  function push(entry) {
    frames.push(entry);
    if (frames.length > limit) frames.shift();
    listeners.forEach(listener => listener(entry));
  }

  const offIn = bus.on('raw:in', ({ bytes, source }) => push({ dir: 'in', label: 'RX ' + source, hex: toHex(bytes) }));
  const offOut = bus.on('raw:out', ({ bytes, label }) => push({ dir: 'out', label: label || 'TX', hex: toHex(bytes) }));
  const offNote = bus.on('note', ({ text }) => push({ dir: 'note', label: text, hex: '' }));

  return {
    frames: () => frames.slice(),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    detach() {
      offIn();
      offOut();
      offNote();
    }
  };
}
