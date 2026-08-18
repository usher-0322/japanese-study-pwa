const CACHE='jp-study-v11';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./supabase-config.js'];
self.addEventListener('install',e=>e.waitUntil(Promise.all([caches.open(CACHE).then(c=>c.addAll(ASSETS)),self.skipWaiting()])));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',e=>{
  const req=e.request;
  const url=new URL(req.url);
  const freshFirst=req.mode==='navigate'||['.html','.js','.css'].some(ext=>url.pathname.endsWith(ext));
  if(freshFirst){
    e.respondWith(fetch(req).then(res=>{
      const copy=res.clone();
      caches.open(CACHE).then(c=>c.put(req,copy));
      return res;
    }).catch(()=>caches.match(req).then(r=>r||caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(r=>r||fetch(req)));
});
