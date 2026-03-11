/**
 * ═══════════════════════════════════════════════════════════════════════
 * SERVICE WORKER - Offline support & caching strategy
 * ═══════════════════════════════════════════════════════════════════════
 */

const CACHE_NAME = 'volleyball-tournament-v1';
const RUNTIME_CACHE = 'volleyball-tournament-runtime';

const STATIC_ASSETS = [
  '/',
  '/09/',
  '/09/index.html',
  '/09/manifest.json',
  '/09/doubleElimPlugin.js',
  '/09/assets/css/base.css',
  '/09/assets/css/header.css',
  '/09/assets/css/roster.css',
  '/09/assets/css/bracket.css',
  '/09/assets/js/core/event-emitter.js',
  '/09/assets/js/modules/localization.js',
  '/09/assets/js/modules/persistence.js',
  '/09/assets/js/modules/roster-manager.js',
  '/09/assets/js/modules/pair-manager.js',
  '/09/assets/js/modules/pool-manager.js',
  '/09/assets/js/modules/court-manager.js',
  '/09/assets/js/modules/print-manager.js',
  '/09/assets/js/app.js',
  '/09/locales/en.json',
  '/09/locales/ru.json'
];

/**
 * Install event - cache static assets
 */
self.addEventListener('install', event => {
  console.log('Service Worker installing...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(error => {
        console.error('Cache error during install:', error);
      })
      .then(() => self.skipWaiting())
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

/**
 * Fetch event - Network first, fallback to cache
 */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip external requests
  if (!url.hostname.includes(self.location.hostname)) {
    return;
  }

  // Network first for JSON (localization & data)
  if (request.url.includes('.json')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const cache = caches.open(RUNTIME_CACHE);
          cache.then(c => c.put(request, response.clone()));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache first for static assets (JS, CSS, fonts)
  if (
    request.url.includes('.js') ||
    request.url.includes('.css') ||
    request.url.includes('assets/')
  ) {
    event.respondWith(
      caches.match(request)
        .then(response => response || fetch(request))
        .catch(() => {
          // Offline fallback
          if (request.url.includes('index.html')) {
            return caches.match('/09/index.html');
          }
        })
    );
    return;
  }

  // Default: Network first, fallback to cache
  event.respondWith(
    fetch(request)
      .then(response => {
        // Cache successful responses
        if (response && response.status === 200) {
          const cacheToUse = request.url.includes('api')
            ? RUNTIME_CACHE
            : CACHE_NAME;

          caches.open(cacheToUse).then(cache => {
            cache.put(request, response.clone());
          });
        }
        return response;
      })
      .catch(() => {
        // Return cached version or offline page
        return caches.match(request)
          .then(cached => cached || caches.match('/09/index.html'));
      })
  );
});

/**
 * Message event - handle messages from clients
 */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(cacheNames => {
      cacheNames.forEach(cacheName => {
        caches.delete(cacheName);
      });
    });
  }
});

console.log('Service Worker loaded');
