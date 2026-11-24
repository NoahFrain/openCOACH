// Bump V on every release (and BUILD in app.js). The page checks for a new sw.js on launch, on resume
// and every 30 min; a changed V installs a fresh cache and the page offers a reload.
const V='opencoach-v1-4',FILES=['./','index.html','config.js','native.js','pro.js','app.js','shell.js','gains.js','gains-core.js','macros.js','macros-core.js','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png','vendor/html5-qrcode.min.js'];
// cache:'reload' skips the HTTP cache. GitHub Pages sends max-age=600, so without it a fresh service
// worker can fill its new cache with the previous release's files.
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(FILES.map(f=>new Request(f,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
// Same-origin app shell: network-first (revalidating past the HTTP cache) with a short timeout so weak
// signal doesn't stall launch; the network fetch keeps running and refreshes the cache.
// Cross-origin API requests (food databases) pass straight through.
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.origin!==self.location.origin)return;
  e.respondWith((async()=>{
    const cached=await caches.match(e.request,{ignoreSearch:true});
    const net=fetch(u.href,{cache:'no-cache',credentials:'same-origin'}).then(r=>{if(r&&r.ok&&r.type==='basic'){const c=r.clone();caches.open(V).then(ch=>ch.put(e.request,c))}return r});
    try{
      return await (cached?Promise.race([net,new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),3000))]):net);
    }catch(err){
      return cached||(await caches.match('index.html'))||Response.error();
    }
  })());
});
