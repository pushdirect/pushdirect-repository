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
const CACHE = 'pd-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/index.html'])));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Only intercept same-origin GET — leave RollerAds/Monetag traffic alone
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      }
      return res;
    }))
  );
});
