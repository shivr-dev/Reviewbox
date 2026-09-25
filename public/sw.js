const CACHE='review-shell-v2';
const ROOT=new URL('./',self.registration.scope).href;
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.add(ROOT)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('review-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||/signin|signout|callback/.test(url.pathname))return;
 if(request.mode==='navigate'){event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();void caches.open(CACHE).then(c=>c.put(ROOT,copy));}return response;}).catch(()=>caches.match(ROOT).then(r=>r||new Response('首次使用请联网打开学习空间。',{headers:{'Content-Type':'text/plain;charset=utf-8'}}))));return;}
 if(/\.(?:js|mjs|css|woff2?|svg|png|ico)$/.test(url.pathname)){event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();void caches.open(CACHE).then(c=>c.put(request,copy));}return response;})));}
});
