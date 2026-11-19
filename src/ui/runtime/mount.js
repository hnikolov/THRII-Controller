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
    // App shell info from index.html: { version, onUpdate } (onUpdate only while an app update waits).
    setAppInfo: info => app.memory.setAppInfo(info),
    // Feedback from the shell: a short status text, and the busy state of a long operation.
    setStatus: text => app.setStatus(text),
    setBusy: busy => app.setBusy(busy),
    // A page's background work (key of layout.pages): a dot on its button while it runs.
    setPageActivity: (key, active) => app.memory.setPageActivity(key, active),
    destroy() {
      app.setStatus('');
      unsubscribe();
      rootEl.replaceChildren();
    }
  };
}
