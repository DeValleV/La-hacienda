const CACHE_VERSION = 'la-hacienda-shell-v17';
const APP_SHELL = [
  '/', '/index.html', '/offline.html', '/manifest.webmanifest', '/icons/app-icon.svg',
  '/src/styles.css', '/src/inventory.css', '/src/sales-summary.css', '/src/release.js', '/src/sound.js', '/src/haptics.js',
  '/src/excel.js', '/src/api.js', '/src/offline.js', '/src/app.js', '/src/pwa.js',
  '/src/views/InventoryView.js', '/src/views/SalesView.js', '/src/views/ShiftSummaryView.js',
  '/src/views/HistoryView.js', '/src/views/SettingsView.js',
  '/sounds/click_002.wav',
  '/sounds/tick_001.wav',
  '/sounds/select_002.wav',
  '/sounds/back_001.wav',
  '/sounds/toggle_001.wav',
  '/sounds/open_001.wav',
  '/sounds/close_001.wav',
  '/sounds/confirmation_001.wav',
  '/sounds/confirmation_003.wav',
  '/sounds/error_004.wav',
  '/sounds/question_001.wav',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('la-hacienda-shell-') && key !== CACHE_VERSION).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function appShell(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || caches.match('/offline.html');
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(appShell(request));
    return;
  }
  // Red primero para que una actualización publicada no quede escondida detrás
  // de una versión antigua del shell; la caché sigue siendo el respaldo offline.
  event.respondWith(appShell(request));
});
