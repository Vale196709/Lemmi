/* Lemmi - service worker, per rendere l'app installabile su telefono.
 * Prima prova sempre la rete (così gli aggiornamenti arrivano subito); la copia salvata serve solo se non c'è
 * connessione, e solo per i file del sito. I dati di Supabase (altro indirizzo) non vengono mai salvati qui. */
const CACHE = 'lemmi-guscio-v4';

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
  // Librerie, modelli PDF e icone cambiano di rado: si usa subito la copia salvata e intanto la si aggiorna dalla rete.
  // Il codice dell'app (html, js, css) invece arriva sempre prima dalla rete, così gli aggiornamenti si vedono subito.
  if (/\/(vendor|templates|icons)\//.test(url.pathname)) {
    e.respondWith(caches.open(CACHE).then((c) => c.match(r).then((salvata) => {
      const rete = fetch(r).then((risp) => { if (risp && risp.ok && risp.type === 'basic') c.put(r, risp.clone()).catch(() => {}); return risp; });
      if (salvata) { e.waitUntil(rete.catch(() => {})); return salvata; }
      return rete;
    })));
    return;
  }
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

// ---- notifiche (aggiornamento 35): mostra l'avviso e, al tocco, apre l'app nella pagina giusta ----
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { testo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titolo || 'Lemmi', {
    body: d.testo || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang: 'it', data: { url: d.url || '#/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const dest = new URL('./' + ((e.notification.data && e.notification.data.url) || ''), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((finestre) => {
    for (const w of finestre) { if ('focus' in w) { w.navigate(dest).catch(() => {}); return w.focus(); } }
    return self.clients.openWindow(dest);
  }));
});
