// Speisenplaner Service Worker
// Strategy:
//  - App Shell (HTML/JS/CSS/Fonts) → Cache First
//  - API calls (/api/*) → Network First with Cache Fallback
//  - Images → Cache First with Network Fallback

const CACHE_VERSION = 'v1';
const APP_SHELL_CACHE = `speisenplaner-shell-${CACHE_VERSION}`;
const API_CACHE = `speisenplaner-api-${CACHE_VERSION}`;
const IMAGE_CACHE = `speisenplaner-images-${CACHE_VERSION}`;

// Resources to pre-cache (app shell)
const APP_SHELL_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
];

// ============================================================
// INSTALL: Pre-cache app shell
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Speisenplaner Service Worker...');
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => {
      console.log('[SW] Pre-caching app shell');
      // Use individual requests to avoid one bad URL blocking everything
      return Promise.allSettled(
        APP_SHELL_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Failed to cache ${url}:`, err);
          })
        )
      );
    }).then(() => {
      console.log('[SW] Install complete');
      return self.skipWaiting();
    })
  );
});

// ============================================================
// ACTIVATE: Clean up old caches
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  const validCaches = [APP_SHELL_CACHE, API_CACHE, IMAGE_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => !validCaches.includes(name))
          .map((name) => {
            console.log(`[SW] Deleting old cache: ${name}`);
            return caches.delete(name);
          })
      )
    ).then(() => {
      console.log('[SW] Activated, claiming clients');
      return self.clients.claim();
    })
  );
});

// ============================================================
// FETCH: Routing strategies
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and non-http(s)
  if (!url.protocol.startsWith('http')) return;

  // Skip cross-origin requests (except fonts/CDN)
  const isSameOrigin = url.origin === self.location.origin;
  const isFontRequest = url.hostname === 'fonts.googleapis.com' ||
                        url.hostname === 'fonts.gstatic.com';

  // ── API Calls: Network First → Cache Fallback ──
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(request, API_CACHE));
    return;
  }

  // ── Images: Cache First → Network Fallback ──
  if (
    request.destination === 'image' ||
    url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i)
  ) {
    event.respondWith(cacheFirstWithNetwork(request, IMAGE_CACHE));
    return;
  }

  // ── Google Fonts: Cache First ──
  if (isFontRequest) {
    event.respondWith(cacheFirstWithNetwork(request, APP_SHELL_CACHE));
    return;
  }

  // ── HTML/JS/CSS (App Shell): Network First → Cache ──
  if (isSameOrigin) {
    event.respondWith(networkFirstWithOfflineFallback(request, APP_SHELL_CACHE));
    return;
  }
});

// ============================================================
// Strategy: Network First → Cache Fallback
// ============================================================
async function networkFirstWithCache(request, cacheName) {
  try {
    const networkResponse = await fetchWithTimeout(request, 8000);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(cacheName);
      // Only cache successful responses
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // Network failed → try cache
    const cached = await caches.match(request);
    if (cached) {
      console.log(`[SW] Serving from cache (offline): ${request.url}`);
      return cached;
    }
    // For API calls that fail completely, return JSON error
    return new Response(
      JSON.stringify({ error: 'offline', message: 'Keine Internetverbindung' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ============================================================
// Strategy: Cache First → Network Fallback
// ============================================================
async function cacheFirstWithNetwork(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.warn(`[SW] Cache miss + network fail: ${request.url}`);
    return new Response('', { status: 408 });
  }
}

// ============================================================
// Strategy: Network First → Cache → Offline Page fallback
// ============================================================
async function networkFirstWithOfflineFallback(request, cacheName) {
  try {
    const networkResponse = await fetchWithTimeout(request, 10000);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Check if it's a navigation request → show offline page
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/offline.html');
      if (offlinePage) return offlinePage;
    }

    return new Response('Offline', { status: 503 });
  }
}

// ============================================================
// Helper: Fetch with timeout
// ============================================================
function fetchWithTimeout(request, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout')), timeout);
    fetch(request)
      .then((response) => { clearTimeout(timer); resolve(response); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

// ============================================================
// Message: Force update
// ============================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ============================================================
// PUSH NOTIFICATIONS
// ============================================================
self.addEventListener('push', (event) => {
  let data = { title: 'Kochplaner', body: 'Neue Benachrichtigung' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag: data.tag || 'general',
    data: { url: data.url || '/meal-planner' },
    vibrate: [200, 100, 200],
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Kochplaner', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/meal-planner';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

console.log('[SW] Speisenplaner Service Worker loaded');
