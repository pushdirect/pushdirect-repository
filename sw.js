// PushDirect Promotion Network — pushdirect.network
// Service Worker | PWA + RollerAds + Monetag

// ── RollerAds ──
self.opts = {
    zoneID: 2822452,
    swDomain: "push-sdk.com",
}
importScripts("https://push-sdk.com/f/sw.js")

// ── Monetag (In-Page Push + verification) ──
self.options = {
    "domain": "3nbf4.com",
    "zoneId": 11024607
}
self.lary = ""
importScripts('https://3nbf4.com/act/files/service-worker.min.js?r=sw')

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
