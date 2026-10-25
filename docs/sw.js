/* ============================================================
   Service worker.
   Two jobs:
     1. Keep the app openable with no internet at all.
     2. Receive push reminders and show them (which is what puts
        them on the Apple Watch).
   ============================================================ */
'use strict';

// Bump this string whenever the app files change, so phones pick up the new version.
const CACHE = 'elephant-v4';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './install.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll fails the whole install if any single file 404s, so add
    // them individually and tolerate misses.
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* Code and markup are network-first with a short timeout, so a message that
   is no longer true (like "push is not connected yet") can never be pinned on
   her phone by a stale cache. Icons stay cache-first. Either way the cache is
   the fallback, so the app still opens with no internet at all. */
const NETWORK_FIRST = /\.(?:html|js|css|webmanifest)$|\/$/;

function timedFetch(req, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    fetch(req).then((res) => { clearTimeout(timer); resolve(res); })
              .catch(() => { clearTimeout(timer); resolve(null); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never touch the push API

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);

    if (NETWORK_FIRST.test(url.pathname)) {
      const fresh = await timedFetch(req, 3000);
      if (fresh && fresh.ok) {
        cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      }
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      return (await cache.match('./index.html')) ||
             new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });
    }

    // Everything else (icons): cache-first, refreshed in the background.
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);

    if (cached) { event.waitUntil(network); return cached; }
    return (await network) ||
           new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });
  })());
});

/* ---------------- Push ---------------- */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* keep defaults */ }

  const title = data.title || '🐘 Time for your pill';
  const body  = data.body  || '';
  // Reminders share one tag so a newer one replaces the last; a one-off
  // announcement brings its own tag so it neither replaces nor is replaced.
  const tag = data.tag || 'pill-reminder';

  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag,
      renotify: true,
      data: { url: './index.html' }
    });
    if (tag === 'pill-reminder') {
      try { if ('setAppBadge' in self.navigator) await self.navigator.setAppBadge(1); } catch (e) {}
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { try { await c.navigate('./index.html'); } catch (e) {} return c.focus(); }
    }
    return self.clients.openWindow('./index.html');
  })());
});
