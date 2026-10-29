/* Lemmi - uscita automatica per inattività. Dopo N minuti senza uso (versione.js > inattivita_min) compare un
 * avviso di 60 secondi, poi si esce. Utile se l'app resta aperta su un computer condiviso o sul telefono. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state } = L;
  const MIN = Number((window.LEMMI_VERSIONE || {}).inattivita_min) || 30;
  const AVVISO = 60 * 1000;
  let ultimo = Date.now(), banner = null;

  function attivita() { if (!banner) ultimo = Date.now(); }
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach((e) => window.addEventListener(e, attivita, { passive: true }));

  function mostra(sec) {
    if (!banner) {
      banner = document.createElement('div');
      banner.setAttribute('role', 'alertdialog');
      banner.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;background:#0f1b3d;color:#f7f4ec;padding:16px 20px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);max-width:92vw;display:flex;gap:16px;align-items:center;flex-wrap:wrap';
      banner.innerHTML = '<span id="in-txt"></span><button type="button" class="btn small" id="in-resta">Resto collegato</button>';
      document.body.appendChild(banner);
      banner.querySelector('#in-resta').onclick = () => { banner.remove(); banner = null; ultimo = Date.now(); };
    }
    banner.querySelector('#in-txt').textContent = 'Nessuna attività da un po’: tra ' + sec + ' secondi uscirai dall’app.';
  }

  setInterval(() => {
    if (!state.user) { ultimo = Date.now(); return; }
    const fermo = Date.now() - ultimo, soglia = MIN * 60 * 1000;
    if (fermo >= soglia + AVVISO) {
      if (banner) { banner.remove(); banner = null; }
      ultimo = Date.now();
      try { state.sb.auth.signOut(); } catch (e) { /* già uscito */ }
    } else if (fermo >= soglia) mostra(Math.max(0, Math.ceil((soglia + AVVISO - fermo) / 1000)));
  }, 1000);

  L.sicurezza = { minuti: MIN };
})();
