export function createBus() {
  const handlers = new Map();

  return {
    on(topic, handler) {
      if (!handlers.has(topic)) handlers.set(topic, new Set());
      handlers.get(topic).add(handler);
      return () => handlers.get(topic).delete(handler);
    },

    emit(topic, payload) {
      const set = handlers.get(topic);
      if (set) [...set].forEach(handler => handler(payload));
    }
  };
}
