/* Lemmi - pulsante "+" con le azioni più frequenti, solo su telefono e solo dopo l'accesso.
 * Le voci dipendono dal ruolo; il Fratello semplice non lo vede. Non tocca i dati: sono scorciatoie verso schermate esistenti. */
(function () {
  'use strict';
  const AZIONI = [
    { t: 'Cerca', href: '#/cerca', ruoli: ['amministratore', 'venerabile', 'segretario'] },
    { t: 'Nuovo bussante', href: '#/bussanti/nuovo', ruoli: ['amministratore', 'segretario'] },
    { t: 'Verbale e presenze', href: '#/template/verbale/apprendista', ruoli: ['amministratore', 'segretario'] },
    { t: 'Pagamenti', href: '#/pagamenti', ruoli: ['amministratore', 'tesoriere'] },
    { t: 'Calendario', href: '#/calendario', ruoli: ['venerabile', 'tesoriere'] },
  ];
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  let radice = null, firma = '';

  const ruolo = () => { const L = window.Lemmi; return L && L.state && L.state.profilo ? L.state.profilo.ruolo : null; };
  const voci = () => AZIONI.filter((a) => a.ruoli.indexOf(ruolo()) >= 0);

  function chiudi() {
    if (!radice) return;
    radice.querySelector('.fab-menu').hidden = true;
    radice.querySelector('.fab').setAttribute('aria-expanded', 'false');
  }

  function costruisci() {
    radice = document.createElement('div');
    radice.className = 'fab-wrap';
    radice.innerHTML = '<div class="fab-menu" hidden></div><button class="fab" type="button" aria-label="Azioni rapide" aria-expanded="false" aria-haspopup="true">+</button>';
    document.body.appendChild(radice);
    const fab = radice.querySelector('.fab'), menu = radice.querySelector('.fab-menu');
    fab.addEventListener('click', () => {
      const apri = menu.hidden;
      menu.hidden = !apri;
      fab.setAttribute('aria-expanded', apri ? 'true' : 'false');
    });
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) chiudi(); });
    document.addEventListener('click', (e) => { if (radice && !radice.contains(e.target)) chiudi(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') chiudi(); });
    window.addEventListener('hashchange', chiudi);
  }

  function aggiorna() {
    const dentro = !!document.querySelector('.side');      // il menu esiste solo dopo l'accesso
    const v = dentro ? voci() : [];
    if (!v.length) { if (radice) { radice.remove(); radice = null; firma = ''; } return; }
    if (!radice) costruisci();
    const nuova = v.map((a) => a.href).join('|');
    if (nuova !== firma) {
      firma = nuova;
      radice.querySelector('.fab-menu').innerHTML = v.map((a) => '<a href="' + esc(a.href) + '">' + esc(a.t) + '</a>').join('');
    }
  }

  let in_attesa = false;
  const pianifica = () => { if (in_attesa) return; in_attesa = true; requestAnimationFrame(() => { in_attesa = false; aggiorna(); }); };
  if (typeof document !== 'undefined') {
    new MutationObserver(pianifica).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', pianifica);
    pianifica();
  }
  window.LemmiAzioniRapide = { aggiorna, voci, AZIONI };
})();
