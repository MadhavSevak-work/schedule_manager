const CACHE_NAME = 'chronos-v4';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon.png'
];

// Install Service Worker
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('⚡ Service Worker caching assets');
      return cache.addAll(ASSETS).catch(err => {
        console.error('SW Caching error during install:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Service Worker
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('🗑️ Service Worker clearing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Interceptor
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  
  // Do not intercept database API calls
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  
  e.respondWith(
    fetch(e.request).then((networkResponse) => {
      if (e.request.method === 'GET' && networkResponse.ok) {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseClone);
        });
      }
      return networkResponse;
    }).catch(() => {
      if (e.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
      return caches.match(e.request).then((cachedResponse) => {
        return cachedResponse || new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
