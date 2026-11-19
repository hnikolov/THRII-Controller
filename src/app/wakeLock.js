// Keeps the screen on while the app is visible: a dimmed or locked phone suspends the page and drops the Bluetooth link.
// The browser releases the lock whenever the page is hidden, so it is asked for again on every return. Without support,
// or when refused (battery saver), the screen may dim as usual; nothing else changes.
export function keepScreenOn() {
  if (!('wakeLock' in navigator)) return;
  const request = () => {
    if (document.visibilityState === 'visible') navigator.wakeLock.request('screen').catch(() => {});
  };
  document.addEventListener('visibilitychange', request);
  request();
}
