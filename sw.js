// PushDirect Promotion Network — pushdirect.network
// Service Worker | OneSignal + Monetag In-Page Push (iOS fallback)
// Place this file at the ROOT of your site (same level as index.html)

// ── OneSignal (primary — handles Chrome/Firefox/Edge/Android) ──
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

// ── Monetag In-Page Push is injected via page script (no SW needed for iOS) ──
