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
// v4: only /icons, /images, /screeshots are cache-first (stale-while-revalidate).
//     HTML, JS and JSON are network-first so core.js / offers-data.json changes
//     reach returning visitors immediately (v3 served pushdirect-core.js cache-first
//     forever and stored one cache entry per offers-data.json?_=timestamp request).
//     Requests with a query string are never cached.
const CACHE = 'pd-v5';
const STATIC_RE = /^\/(icons|images|screeshots)\//;

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

function cacheable(req, res) {
  return res && res.status === 200 && res.type === 'basic' && !(new URL(req.url)).search;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Only handle same-origin GET — leave RollerAds/Monetag traffic alone
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  if (!isHTML && STATIC_RE.test(url.pathname) && !url.search) {
    // Stale-while-revalidate for images/icons: instant paint, refreshed in background
    // so a creative swapped under the same filename shows on the next visit.
    e.respondWith(
      caches.match(req).then(cached => {
        const net = fetch(req).then(res => {
          if (cacheable(req, res)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
          return res;
        }).catch(() => cached);
        return cached || net;
      })
    );
    return;
  }

  // Network-first for everything else (HTML, JS, JSON): live first, cache only offline
  e.respondWith(
    fetch(req).then(res => {
      if (cacheable(req, res)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() =>
      caches.match(req).then(c => c || (isHTML ? caches.match('/') : Response.error()))
    )
  );
});
