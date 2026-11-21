const CACHE='review-shell-v3';
const ROOT=new URL('./',self.registration.scope).href;
const FONT_STYLES=new URL('fonts/reviewbox/font.css',ROOT).pathname;

async function currentFontStyles(request) {
 const cache = await caches.open(CACHE);
 try {
  const response = await fetch(request, { cache: 'no-cache' });
  if (response.ok) {
   await cache.put(request, response.clone()).catch(() => {});
   return response;
  }
  return await cache.match(request) ?? response;
 } catch (error) {
  const cached = await cache.match(request);
  if (cached) return cached;
  throw error;
 }
}

self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.add(ROOT)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('review-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||/signin|signout|callback/.test(url.pathname))return;
 if(request.mode==='navigate'){event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();void caches.open(CACHE).then(c=>c.put(ROOT,copy));}return response;}).catch(()=>caches.match(ROOT).then(r=>r||new Response('首次使用请联网打开学习空间。',{headers:{'Content-Type':'text/plain;charset=utf-8'}}))));return;}
 // This stylesheet can change which versioned font the page requests.
 if(url.pathname===FONT_STYLES){event.respondWith(currentFontStyles(request));return;}
 if(/\.(?:js|mjs|css|woff2?|svg|png|ico)$/.test(url.pathname)){event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();void caches.open(CACHE).then(c=>c.put(request,copy));}return response;})));}
});
