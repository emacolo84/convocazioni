// Service worker: tiene l'app disponibile anche senza rete.
// Cambiare VERSION a ogni pubblicazione, così i telefoni scaricano la versione nuova.
const VERSION = 'cp-v2';
const SHELL = [
  './', 'index.html', 'config.js', 'manifest.webmanifest',
  'vendor/firebase-app-compat.js', 'vendor/firebase-auth-compat.js', 'vendor/firebase-firestore-compat.js',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Il traffico di Firebase (login e database) passa sempre dalla rete: lo gestisce l'SDK.
  if (/googleapis\.com$|firebaseio\.com$|firebaseapp\.com$/.test(url.hostname) && !url.hostname.startsWith('fonts.')) return;
  // Pagine e file dell'app: prima la rete, se manca si usa la copia salvata.
  // Font di Google: prima la copia salvata.
  const fromCacheFirst = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (fromCacheFirst) {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return cache.match('index.html');
      throw err;
    }
  })());
});
