/* Lemmi - Notifiche sul telefono (pagina Loggia / Il mio accesso).
 * Ogni utente attiva gli avvisi sul proprio dispositivo: tornata del giorno dopo, votazioni dei bussanti,
 * quote in scadenza, consegna delle tavole, secondo il suo profilo. Gratuito: usa le notifiche standard del browser
 * (Web Push) e la funzione "notifiche" su Supabase, che ogni mattina controlla cosa c'è da ricordare.
 * Su iPhone funziona solo con l'app installata sulla schermata Home (iOS 16.4 o successivo). */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, esc, chk, toast, messaggioErrore } = L;

  const supportato = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const iPhone = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const installata = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const chiaveBin = (b64) => {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  };
  const dispositivo = () => {
    const ua = navigator.userAgent;
    const so = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Mac/i.test(ua) ? 'Mac' : /Windows/i.test(ua) ? 'Windows' : 'Altro';
    const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    return so + ' · ' + br;
  };

  async function funzione(azione) {
    const { data, error } = await state.sb.functions.invoke('notifiche', { body: { azione } });
    if (error) {
      let msg = error.message || 'Errore';
      try { const j = await error.context.json(); if (j && j.errore) msg = j.errore; } catch (_) { /* nessun dettaglio */ }
      const st = error.context && error.context.status;
      if (st === 404 || /failed to send|fetch/i.test(msg)) msg = 'La funzione «notifiche» non risulta pubblicata su Supabase (vedi LEGGIMI dell’aggiornamento 35).';
      throw new Error(msg);
    }
    if (data && data.errore) throw new Error(data.errore);
    return data;
  }

  async function iscrizioneAttuale() {
    if (!supportato()) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
  }

  // attesa con limite di tempo: se il servizio in background non risponde si segnala invece di restare bloccati
  const conLimite = (p, ms, msg) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error(msg)), ms))]);

  async function attiva(avviso) {
    avviso('Rispondi alla richiesta del browser (di solito in alto a sinistra, accanto all’indirizzo): scegli «Consenti».');
    const permesso = await Notification.requestPermission();
    if (permesso !== 'granted') throw new Error('Permesso non concesso: abilita le notifiche per questo sito nelle impostazioni del browser (icona accanto all’indirizzo) e riprova.');
    avviso('1/4 · Preparo il servizio in background dell’app…');
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) reg = await navigator.serviceWorker.register('sw.js');
    reg = await conLimite(navigator.serviceWorker.ready, 15000, 'Passo 1: il servizio in background dell’app non è pronto. Ricarica la pagina con Ctrl+F5 e riprova.');
    avviso('2/4 · Chiedo la chiave al server di Lemmi (la prima volta può servire qualche secondo)…');
    const { chiave } = await conLimite(funzione('chiave'), 30000, 'Passo 2: la funzione «notifiche» su Supabase non risponde. Controlla che sia pubblicata con il nome notifiche e che «Verify JWT» sia spento.');
    if (!chiave) throw new Error('Passo 2: la funzione «notifiche» non ha restituito la chiave.');
    avviso('3/4 · Registro questo dispositivo presso il servizio di notifica del browser…');
    const sub = await conLimite(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiaveBin(chiave) }), 30000,
      'Passo 3: il browser non completa la registrazione. Se usi Brave o una modalità con protezioni avanzate, abilita i servizi di notifica di Google o prova con Chrome/Edge.');
    avviso('4/4 · Salvo il dispositivo…');
    const j = sub.toJSON();
    await state.sb.from('push_iscrizioni').delete().eq('endpoint', j.endpoint);   // se era già registrato, si rinnova
    chk(await state.sb.from('push_iscrizioni').insert({ endpoint: j.endpoint, chiavi: j.keys, dispositivo: dispositivo() }));
  }

  async function disattiva() {
    const sub = await iscrizioneAttuale();
    if (sub) {
      try { chk(await state.sb.from('push_iscrizioni').delete().eq('endpoint', sub.endpoint)); } catch (e) { /* si toglie comunque dal dispositivo */ }
      await sub.unsubscribe();
    }
  }

  async function scheda(v) {
    const box = document.createElement('div');
    box.className = 'card'; box.style.marginTop = '18px';
    v.appendChild(box);
    const disegna = async () => {
      let stato, azioni = '';
      if (!supportato()) {
        stato = iPhone() && !installata()
          ? 'Su iPhone le notifiche funzionano solo con l’app installata: in Safari tocca <b>Condividi › Aggiungi alla schermata Home</b>, poi apri Lemmi dall’icona e torna qui.'
          : 'Questo browser non supporta le notifiche. Prova con Chrome, Edge, Firefox o Safari aggiornati.';
      } else if (Notification.permission === 'denied') {
        stato = 'Le notifiche sono <b>bloccate</b> per Lemmi: riattivale dalle impostazioni del browser (icona del lucchetto accanto all’indirizzo) o del telefono.';
      } else {
        const sub = await iscrizioneAttuale();
        stato = sub ? '<span class="badge ok">Attive su questo dispositivo</span>' : '<span class="badge gray">Non attive su questo dispositivo</span>';
        azioni = sub
          ? '<button class="btn ghost" id="nt-prova" type="button">Manda una prova</button><button class="btn ghost" id="nt-off" type="button">Disattiva</button>'
          : '<button class="btn gold" id="nt-on" type="button">Attiva le notifiche</button>';
      }
      const ruolo = state.profilo && state.profilo.ruolo;
      const cosa = ruolo === 'fratello' ? 'della tornata del giorno dopo, delle tue quote in scadenza e della consegna delle tue tavole'
        : ruolo === 'tesoriere' ? 'della tornata del giorno dopo e delle quote in scadenza'
          : ruolo === 'amministratore' ? 'della tornata del giorno dopo, delle votazioni dei bussanti e delle quote in scadenza'
            : 'della tornata del giorno dopo e delle votazioni dei bussanti';
      box.innerHTML = `<h2>Notifiche sul telefono</h2>
        <p class="muted" style="margin:0 0 10px">Ogni mattina Lemmi ti avvisa ${cosa}. Vale per questo dispositivo: attivale su ognuno che usi.</p>
        <div class="actions">${stato}${azioni}</div><div class="err" id="nt-err" style="margin-top:8px"></div>`;
      const conErrore = (id, fn, ok) => { const b = $(id, box); if (b) b.addEventListener('click', async () => {
        const msg = $('#nt-err', box);
        b.disabled = true; msg.className = 'hint'; msg.textContent = '';
        try { await fn((t) => { msg.className = 'hint'; msg.textContent = t; }); if (ok) toast(ok, 'ok'); await disegna(); }
        catch (e) { b.disabled = false; msg.className = 'err'; msg.textContent = messaggioErrore(e); }
      }); };
      conErrore('#nt-on', attiva, 'Notifiche attivate su questo dispositivo');
      conErrore('#nt-off', disattiva, 'Notifiche disattivate su questo dispositivo');
      conErrore('#nt-prova', async () => { const r = await funzione('prova'); if (!r || !r.inviati) throw new Error('Nessun avviso inviato: disattiva e riattiva le notifiche.'); }, 'Avviso di prova inviato');
    };
    try { await disegna(); } catch (e) { box.innerHTML = `<h2>Notifiche sul telefono</h2><div class="notice bad">${esc(messaggioErrore(e))}</div>`; }
  }

  L.estensioniLoggia = L.estensioniLoggia || [];
  L.estensioniLoggia.push(scheda);
})();
