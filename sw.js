// PushDirect Promotion Network — pushdirect.network
// Service Worker | OneSignal + Monetag

// ── OneSignal (Web Push — Chrome / Firefox / Edge / Android) ──
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

// ── Monetag (In-Page Push + verification) ──
self.options = {
    "domain": "3nbf4.com",
    "zoneId": 11024607
}
self.lary = ""
importScripts('https://3nbf4.com/act/files/service-worker.min.js?r=sw')
