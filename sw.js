// PushDirect Promotion Network — pushdirect.network
// Service Worker | PWA + RollerAds + Monetag

// ── RollerAds ──
self.opts = {
    zoneID: 2822452,
    swDomain: "push-sdk.com",
}
importScripts("https://push-sdk.com/f/sw.js")

// ── Monetag (In-Page Push) ──
// IPP renders entirely client-side via the page tag (see activateMonetag()).
// It needs NO service worker. A second push SW here conflicts with RollerAds and,
// if its remote import 404s, aborts SW installation — so it is intentionally omitted.

// ── PWA: Cache (same-origin only, does not interfere with push/ads) ──
// v2: HTML is network-first so nav/content changes go live immediately.
//     Static assets stay cache-first for speed. Bumping the cache name
//     purges the old pd-v1 cache that was serving stale HTML.
const CACHE = 'pd-v3';

self.addEventListener('install', e => {
  // Do NOT precache HTML — that is what caused stale pages to persist.
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Only handle same-origin GET — leave RollerAds/Monetag traffic alone
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // Network-first: always try the live page, fall back to cache offline
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() =>
        caches.match(req).then(c => c || caches.match('/'))
      )
    );
    return;
  }

  // Cache-first for static assets (logo, icons, scripts, css)
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});
