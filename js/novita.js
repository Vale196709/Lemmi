/* Lemmi - «Novità» in cima al Cruscotto (v0.74.0)
 * Ultimi documenti pubblicati negli ultimi 30 giorni: tavole (con file) e Biblioteca, al massimo 3.
 * Le regole di lettura sono quelle di sempre, applicate nel database (funzione novita_documenti, script 57):
 * ognuno vede solo le tavole del suo grado e i documenti della Biblioteca che può aprire.
 * «Ho visto» nasconde le novità mostrate su questo dispositivo; ricompare quando arriva un documento nuovo.
 * Compare per tutti i profili: nel Cruscotto e nella «La mia scheda» del Fratello. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, esc, fmtData } = L;
  const GIORNI = 30, QUANTI = 3;
  const CATEGORIE = { libro: 'Libro', pubblicazione: 'Pubblicazione', foto: 'Foto', documento: 'Documento', altro: 'Altro' };
  const GRADI = { apprendista: 'Apprendista', compagno: 'Compagno', maestro: 'Maestro' };
  const IC_NUOVO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 12v5M9.5 14.5h5"/></svg>';

  const chiave = () => 'lemmi.novita.vista.' + ((state.user && state.user.id) || 'anonimo');
  const leggiVista = () => { try { return localStorage.getItem(chiave()) || ''; } catch (e) { return ''; } };
  const salvaVista = (iso) => { try { localStorage.setItem(chiave(), iso); } catch (e) { /* senza memoria del browser l'avviso resta */ } };

  async function carica() {
    const { data, error } = await state.sb.rpc('novita_documenti', { p_giorni: GIORNI, p_limite: QUANTI });
    if (error) throw error;   // script 57 non ancora eseguito: niente avviso, la pagina continua
    return data || [];
  }

  // «oggi», «ieri», «3 giorni fa» e la data
  function quando(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const g0 = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const giorni = Math.round((g0(new Date()) - g0(d)) / 86400000);
    const data = fmtData(L.isoLocale ? L.isoLocale(d) : d.toISOString().slice(0, 10));
    const ora = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (giorni <= 0) return 'oggi alle ' + ora;
    if (giorni === 1) return 'ieri alle ' + ora;
    return `${giorni} giorni fa · ${data}`;
  }

  const dove = (r) => (r.genere === 'biblioteca' ? '#/biblioteca' : (state.profilo.ruolo === 'fratello' ? '' : '#/lavori'));

  function riga(r) {
    const tipo = r.genere === 'biblioteca'
      ? `<span class="badge info">Biblioteca${r.categoria ? ' · ' + esc(CATEGORIE[r.categoria] || r.categoria) : ''}</span>`
      : `<span class="badge gold">Tavola${r.grado ? ' · ' + esc(GRADI[r.grado] || r.grado) : ''}</span>`;
    const testo = `${tipo}<span class="nv-t"><b>${esc(r.titolo)}</b>${r.dettaglio ? ` <span class="muted">di ${esc(r.dettaglio)}</span>` : ''}</span>
      <span class="nv-quando" title="Pubblicato il ${esc(fmtData(String(r.quando).slice(0, 10)))}">${esc(quando(r.quando))}</span>`;
    const href = dove(r);
    return href ? `<a class="nv-riga" href="${href}">${testo}</a>`
      : `<button type="button" class="nv-riga" data-nv-tavole>${testo}</button>`;   // Fratello: le tavole sono nella stessa pagina
  }

  // disegna l'avviso subito sotto il titolo (e sotto «Stasera», se c'è)
  function disegna(v, lista) {
    const vista = leggiVista();
    const nuove = (lista || []).filter((r) => !vista || String(r.quando) > vista);
    const vecchio = $('#cr-novita', v);
    if (vecchio) vecchio.remove();
    if (!nuove.length) return;
    const el = document.createElement('section');
    el.className = 'nv';
    el.id = 'cr-novita';
    el.setAttribute('aria-label', 'Ultimi documenti pubblicati');
    el.innerHTML = `<div class="nv-h"><span class="nv-ic">${IC_NUOVO}</span><b>${nuove.length === 1 ? 'Nuovo documento pubblicato' : 'Nuovi documenti pubblicati'}</b>
        <span class="muted nv-sub">ultimi ${GIORNI} giorni</span>
        <button type="button" class="btn ghost small nv-chiudi" title="Nasconde queste novità; ricompare quando ne arriva una nuova">Ho visto</button></div>
      <div class="nv-lista">${nuove.map(riga).join('')}</div>`;
    const dopo = $('.tn-avviso', v) || $('.page-head', v);
    if (dopo) dopo.insertAdjacentElement('afterend', el); else v.prepend(el);
    $('.nv-chiudi', el).addEventListener('click', () => {
      salvaVista(String(nuove[0].quando));   // la più recente: si nascondono tutte quelle mostrate
      el.remove();
    });
    el.querySelectorAll('[data-nv-tavole]').forEach((b) => b.addEventListener('click', () => {
      const dest = $('#af-tavole-loggia', v) || $('#af-tavole', v);
      if (dest) dest.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  // Cruscotto (amministratore, Venerabile, Segretario, Tesoriere)
  const extraNovita = async (v, anticipo) => {
    let lista;
    try { lista = await L.datiAnticipati(anticipo, carica); } catch (e) { return; }
    disegna(v, lista);
  };
  extraNovita.carica = () => carica();
  L.cruscottoExtra = L.cruscottoExtra || [];
  L.cruscottoExtra.unshift(extraNovita);   // prima degli altri riquadri: i dati arrivano insieme a quelli della pagina

  // «La mia scheda» del Fratello: la chiama area_fratello.js dopo aver disegnato la pagina
  L.novita = { async inserisci(v) { try { disegna(v, await carica()); } catch (e) { /* facoltativo */ } }, quando };
})();
