export function createStore(initialState) {
  const listeners = new Set();
  let scheduled = false;
  let lastSource = null;
  let changes = 0;

  // Listeners run once per batch (microtask), so a burst of commits notifies once.
  function flush() {
    scheduled = false;
    const source = lastSource;
    listeners.forEach(listener => listener(initialState, source));
  }

  return {
    getState() {
      return initialState;
    },

    commit(mutate, source) {
      const result = mutate(initialState);
      if (source === 'ui' || source === 'device') changes += 1;
      lastSource = source;
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(flush);
      }
      return result;
    },

    // Counts the commits that may go with a change on the amp: an edit ('ui', its write follows) and an event from the
    // amp ('device'). A read ('dump') and an imported preset ('import') follow the amp, they do not change it.
    changeCount() {
      return changes;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

// Live state before any device data. activeSlot is 1..5 or null (device-owned). presetName comes from the last dump.
// modified is set by any parameter change (amp or app) and cleared by a dump.
export function createEmptyDeviceState() {
  return { units: {}, activeSlot: null, presetName: null, modified: false };
}
