// Service worker del portale: rende il sito installabile come app.
// Strategia "prima la rete": si carica sempre la versione più recente del sito;
// la copia in cache dei file del sito (mai i dati di Supabase) serve solo senza connessione.

const CACHE = 'portale-condominio-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    } catch (err) {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === 'navigate') return (await caches.match('./')) ?? Response.error();
      throw err;
    }
  })());
});
