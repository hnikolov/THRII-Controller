import { APP_VERSION, BUILD } from './src/app/version.js';

// Service worker of the installed app (plan_pwa.md 3.2, 3.4, 4.3). It keeps every file the app needs in a cache named
// after the release, so the app starts the same with or without a network, and a new release replaces it as a whole.

// Written by `python scripts/check_release.py --stamp`; do not edit by hand.
const PRECACHE = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './src/ai/aiPresets.css',
  './src/ai/aiPresets.js',
  './src/ai/api.js',
  './src/ai/config.js',
  './src/app/boot.js',
  './src/app/files.js',
  './src/app/main.js',
  './src/app/presetFlow.js',
  './src/app/version.js',
  './src/app/wakeLock.js',
  './src/core/bytes.js',
  './src/core/clock.js',
  './src/core/eventBus.js',
  './src/core/flags.js',
  './src/core/values.js',
  './src/data/thr10ii_w_symbol_table_1_44_0_a.json',
  './src/domain/presetModel.js',
  './src/presets/presetLibrary.js',
  './src/presets/presets.css',
  './src/protocol/activation.js',
  './src/protocol/builders.js',
  './src/protocol/constants.js',
  './src/protocol/counter.js',
  './src/protocol/dumpAssembly.js',
  './src/protocol/dumpParser.js',
  './src/protocol/frames.js',
  './src/protocol/identity.js',
  './src/protocol/incoming.js',
  './src/protocol/memoryPatch.js',
  './src/protocol/paramWrite.js',
  './src/protocol/symbolTable.js',
  './src/protocol/syncFlow.js',
  './src/protocol/upload.js',
  './src/protocol/writeScheduler.js',
  './src/state/applyDeviceEvent.js',
  './src/state/applyDumpPatch.js',
  './src/state/applyPreset.js',
  './src/state/selectors.js',
  './src/state/shadowStore.js',
  './src/transports/bleTransport.js',
  './src/transports/transportManager.js',
  './src/transports/usbTransport.js',
  './src/ui/runtime/ampView.js',
  './src/ui/runtime/appView.js',
  './src/ui/runtime/intents.js',
  './src/ui/runtime/knobView.js',
  './src/ui/runtime/layout.js',
  './src/ui/runtime/ledView.js',
  './src/ui/runtime/memoryView.js',
  './src/ui/runtime/moduleView.js',
  './src/ui/runtime/mount.js',
  './src/ui/runtime/runtime.css',
  './src/ui/runtime/tapTempo.js',
  './src/ui/runtime/unitSelectorView.js',
  './src/ui/runtime/viewModel.js'
];

const CACHE = `thrii-${APP_VERSION}-${BUILD}`;
const appUrl = path => new URL(path, self.location).href;
const PRECACHED = new Set(PRECACHE.map(appUrl));
const APP_PAGES = new Set([appUrl('./'), appUrl('./index.html')]);
const withoutQuery = url => url.split(/[?#]/)[0];

// cache: 'reload' bypasses the browser's HTTP cache, so a release never stores files the host sent earlier.
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE.map(path => new Request(path, { cache: 'reload' })))));
});

// The old release's cache goes only now, so a running app never mixes files of two releases.
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('thrii-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// Sent by the page when the user presses the update button.
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// Cache first, but only for the app page and the files it loads. Other pages of the same server (the development page,
// the test runner) always get fresh files, and nothing outside the list (the AI proxy, other sites) is touched.
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = withoutQuery(request.url);
  if (request.mode === 'navigate') {
    if (APP_PAGES.has(url)) event.respondWith(fromCache('./index.html', request));
    return;
  }
  if (!PRECACHED.has(url)) return;
  event.respondWith((async () => {
    const client = await self.clients.get(event.clientId);
    return client && APP_PAGES.has(withoutQuery(client.url)) ? fromCache(url, request) : fetch(request);
  })());
});

async function fromCache(key, request) {
  const cache = await caches.open(CACHE);
  return (await cache.match(appUrl(key))) || fetch(request);
}
