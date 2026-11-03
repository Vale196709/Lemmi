/* Lemmi - Ricorrenze nel Cruscotto: compleanni e anniversari di iniziazione dei Fratelli attivi
 * nei prossimi 14 giorni, con il messaggio di auguri già scritto da inviare su WhatsApp con un tocco. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, esc, chk, fmtData, oggi } = L;

  const GIORNI_AVANTI = 14;
  const MOSTRATE = 3;
  const SOCI = ['amministratore', 'venerabile', 'segretario'];
  const GG = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  const IC_TORTA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21h16v-7a2 2 0 00-2-2H6a2 2 0 00-2 2z"/><path d="M4 16c1.3 1 2.7 1 4 0s2.7-1 4 0 2.7 1 4 0 2.7-1 4 0M12 12V8M12 5.5c.8-.6.8-1.6 0-2.5-.8.9-.8 1.9 0 2.5z"/></svg>';
  const IC_LUCE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/></svg>';

  const utc = (iso) => { const [a, m, g] = iso.split('-').map(Number); return Date.UTC(a, m - 1, g); };
  const bisestile = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;

  // prossima ricorrenza (da oggi in avanti) della data iso: { data, anni, giorni }
  function prossima(iso, oggiIso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    const a0 = Number(m[1]), me = Number(m[2]);
    let g = Number(m[3]);
    let anno = Number(oggiIso.slice(0, 4));
    for (let i = 0; i < 2; i++, anno++) {
      const gg = me === 2 && g === 29 && !bisestile(anno) ? 28 : g;   // nati il 29 febbraio: il 28 negli anni non bisestili
      const data = anno + '-' + String(me).padStart(2, '0') + '-' + String(gg).padStart(2, '0');
      const giorni = Math.round((utc(data) - utc(oggiIso)) / 86400000);
      if (giorni >= 0) return { data, anni: anno - a0, giorni };
    }
    return null;
  }

  const quando = (r) => (r.giorni === 0 ? 'oggi' : r.giorni === 1 ? 'domani' : GG[new Date(utc(r.data)).getUTCDay()] + ' ' + fmtData(r.data).slice(0, 5));
  const intestazione = () => {
    const l = state.loggia || {};
    return ['R∴L∴ ' + (l.nome || ''), l.numero ? 'n. ' + l.numero : ''].filter(Boolean).join(' ').trim();
  };
  function testoAuguri(r) {
    const n = r.f.nome || '';
    if (r.tipo === 'cmp') {
      return [`Carissimo Fratello ${n},`, `ti giungano i più fraterni auguri di buon compleanno da parte di tutti i Fratelli della ${intestazione()}.`, '', 'Un triplice fraterno abbraccio.'].join('\n');
    }
    return [`Carissimo Fratello ${n},`, `${r.giorni === 0 ? 'oggi ricorre' : 'il ' + fmtData(r.data) + ' ricorre'} l’anniversario della tua iniziazione: ${r.anni} ${r.anni === 1 ? 'anno' : 'anni'} di cammino insieme nella ${intestazione()}.`, '', 'Un triplice fraterno abbraccio.'].join('\n');
  }

  async function ricorrenze() {
    const fr = chk(await state.sb.from('fratelli').select('id,cognome,nome,data_nascita,data_iniziazione,stato,cellulare').eq('stato', 'attivo'));
    const o = oggi(), out = [];
    fr.forEach((f) => {
      const c = prossima(f.data_nascita, o);
      if (c && c.giorni <= GIORNI_AVANTI) out.push(Object.assign({ tipo: 'cmp', f }, c));
      const i = prossima(f.data_iniziazione, o);
      if (i && i.anni > 0 && i.giorni <= GIORNI_AVANTI) out.push(Object.assign({ tipo: 'ini', f }, i));
    });
    return out.sort((a, b) => a.giorni - b.giorni || (a.tipo === b.tipo ? 0 : a.tipo === 'cmp' ? -1 : 1) || a.f.cognome.localeCompare(b.f.cognome, 'it'));
  }

  const riga = (r) => `<div class="ric">
      <div class="ric-ic ${r.tipo}" title="${r.tipo === 'cmp' ? 'Compleanno' : 'Anniversario di iniziazione'}">${r.tipo === 'cmp' ? IC_TORTA : IC_LUCE}</div>
      <div class="ric-t"><b><a href="#/fratelli/${esc(r.f.id)}">${esc(r.f.cognome)} ${esc(r.f.nome)}</a></b>
        <span class="ric-quando${r.giorni === 0 ? ' oggi' : ''}">${quando(r)}</span> · ${r.tipo === 'cmp' ? `compie ${r.anni} anni` : `${r.anni} ${r.anni === 1 ? 'anno' : 'anni'} dall’iniziazione`}</div>
      ${L.wa && r.f.cellulare ? L.wa.fratello(r.f.id, testoAuguri(r), '') : ''}</div>`;

  L.cruscottoExtra = L.cruscottoExtra || [];
  L.cruscottoExtra.push(async (v) => {
    if (!SOCI.includes(state.profilo && state.profilo.ruolo)) return;
    const dest = $('#seg-cr', v);
    if (!dest) return;
    let lista;
    try { lista = await ricorrenze(); } catch (e) { return; }
    const oggiN = lista.filter((r) => r.giorni === 0).length;
    dest.insertAdjacentHTML('beforeend', `<div class="card compact" id="cr-ric"><h2>Ricorrenze${lista.length ? ` <small>${oggiN ? oggiN + ' oggi · ' : ''}prossimi ${GIORNI_AVANTI} giorni</small>` : ''}</h2>
      ${lista.length ? `<div class="ric-list">${lista.slice(0, MOSTRATE).map(riga).join('')}</div>
        ${lista.length > MOSTRATE ? `<details style="margin-top:6px"><summary style="cursor:pointer;font-size:.84rem">altre ${lista.length - MOSTRATE}</summary><div class="ric-list" style="margin-top:6px">${lista.slice(MOSTRATE).map(riga).join('')}</div></details>` : ''}`
        : `<div class="empty">Nessun compleanno o anniversario di iniziazione nei prossimi ${GIORNI_AVANTI} giorni.</div>`}</div>`);
  });

  L.ricorrenze = { prossima, ricorrenze };
})();
