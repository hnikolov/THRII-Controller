import { AppView } from './appView.js';
import { RUNTIME_LAYOUT } from './layout.js';
import { selectRuntimeModel } from './viewModel.js';

// The only entry point the shells call. Renders the store state and re-renders on every store commit.
export function mountRuntime(rootEl, { store, intents, layout = RUNTIME_LAYOUT }) {
  const app = new AppView(layout, intents).mount(rootEl);
  app.update(selectRuntimeModel(store.getState(), layout));
  const unsubscribe = store.subscribe(state => app.update(selectRuntimeModel(state, layout)));

  return {
    // Connection status from the shell: { kind: 'ble' | 'usb' (connected) or null, version, busy, error }.
    setConnection: status => app.memory.setConnection(status),
    destroy() {
      unsubscribe();
      rootEl.replaceChildren();
    }
  };
}
