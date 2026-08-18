const CACHE='jp-study-v7';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./supabase-config.js'];
self.addEventListener('install',e=>e.waitUntil(Promise.all([caches.open(CACHE).then(c=>c.addAll(ASSETS)),self.skipWaiting()])));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
