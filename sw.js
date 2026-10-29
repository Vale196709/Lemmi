/* Lemmi - service worker minimo, per rendere l'app installabile su telefono.
 * Prima prova sempre la rete (così gli aggiornamenti arrivano subito); la copia salvata serve solo se non c'è
 * connessione, e solo per i file del sito. I dati di Supabase (altro indirizzo) non vengono mai salvati qui. */
const CACHE = 'lemmi-guscio-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomi) => Promise.all(nomi.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || r.headers.has('range')) return;
  const url = new URL(r.url);
  if (url.origin !== self.location.origin) return;           // Supabase e altri servizi: sempre rete, mai copia
  e.respondWith(
    fetch(r).then((risp) => {
      if (risp && risp.ok && risp.type === 'basic') {
        const copia = risp.clone();
        caches.open(CACHE).then((c) => c.put(r, copia)).catch(() => {});
      }
      return risp;
    }).catch(() => caches.match(r).then((c) => c || (r.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
