/**
 * @file service-worker.js handles the caching of app assets for offline functionality.
 */

const CACHE_NAME = 'progression-cache-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/js/main.js',
  '/js/eventHandlers.js',
  '/js/googleSheetsService.js',
  '/js/planGenerator.js',
  '/js/state.js',
  '/js/ui.js',
  '/js/utils.js',
  '/exercises.json',
  '/manifest.json'
  // Chart.js removed to avoid CORS issues
];

// Install the service worker and cache all the app assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(URLS_TO_CACHE);
      })
  );
});

// Fetch assets from the cache or the network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // Not in cache - fetch from network
        return fetch(event.request);
      }
    )
  );
});

// Clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
