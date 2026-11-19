import { boot } from './boot.js';
import { APP_VERSION } from './version.js';
import { keepScreenOn } from './wakeLock.js';

// Entry of the installed app (index.html): the shared composition plus what only the app shell does (plan_pwa.md 3, 4):
// the screen kept on, a guard against an accidental reload, and the service worker with its update offer.
// The development page calls boot() directly and does none of this.
export async function main(rootEl, bootOptions) {
  const app = await boot(rootEl, bootOptions);
  keepScreenOn();
  // F5, Ctrl+R or closing the tab while an amp is connected: the browser asks first (a reload drops the connection).
  const guard = event => {
    if (app.isConnected()) event.preventDefault();
  };
  window.addEventListener('beforeunload', guard);
  app.setAppInfo({ version: APP_VERSION });
  if ('serviceWorker' in navigator) watchUpdates(app, guard).catch(() => {});
  return app;
}

// A new release installs in the background and waits. It is applied when the user presses the update button, or by the
// browser once no window of the app is open; never by a reload of its own (plan_pwa.md 3.3, 3.6).
async function watchUpdates(app, guard) {
  const registration = await navigator.serviceWorker.register('./sw.js', { type: 'module', updateViaCache: 'none' });

  const update = () => {
    const waiting = registration.waiting;
    if (!waiting || app.isBusy()) return;
    if (app.isConnected() && !window.confirm('Updating restarts the app and disconnects the amp. Update now?')) return;
    window.removeEventListener('beforeunload', guard);
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    waiting.postMessage('skipWaiting');
  };
  // Only an update of a running app is offered; the very first install has nothing to replace.
  const offer = () => {
    if (registration.waiting && navigator.serviceWorker.controller) app.setAppInfo({ version: APP_VERSION, onUpdate: update });
  };

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (installing) installing.addEventListener('statechange', () => { if (installing.state === 'installed') offer(); });
  });
  // An installed app may stay open for days: look for a release each time it comes back to the front.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registration.update().catch(() => {});
  });
  offer();
}
