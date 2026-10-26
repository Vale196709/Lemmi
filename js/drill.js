/* Lemmi - approfondimento (drill-down) dei grafici e dei riquadri del Cruscotto.
 * Un clic su una barra, una voce o un contatore apre una finestra con il dettaglio; da lì si può scendere
 * ancora (anno > mese > categoria > movimenti, voce di quota > Fratello...) e tornare indietro dal percorso in alto.
 * Gli elementi cliccabili portano data-drill="<tipo>": i moduli registrano il proprio tipo con L.drill.registra(). */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, fmtData, eur } = L;

  const pila = [];
  const gestori = {};
  let ov = null;

  /* ---------- finestra a livelli ---------- */
  function chiudi() {
    document.removeEventListener('keydown', tasti);
    if (ov) ov.remove();
    ov = null; pila.length = 0;
  }
  function tasti(e) { if (e.key === 'Escape') chiudi(); }

  function apri(livello) {
    pila.push(livello);
    disegna();
  }

  function disegna() {
    const liv = pila[pila.length - 1];
    if (!liv) return chiudi();
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'modal-ov';
      ov.innerHTML = '<div class="modal wide" role="dialog" aria-modal="true"><div class="modal-h"><div class="drill-head"><nav class="drill-crumb" aria-label="Percorso"></nav><h2 style="margin:0"></h2></div><button class="btn ghost small" type="button" data-x>Chiudi</button></div><div class="modal-b"></div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('mousedown', (e) => { if (e.target === ov) chiudi(); });
      $('[data-x]', ov).addEventListener('click', chiudi);
      ov.addEventListener('click', (e) => { const a = e.target.closest('a[href^="#/"]'); if (a) chiudi(); });
      document.addEventListener('keydown', tasti);
    }
    $('h2', ov).textContent = liv.titolo || liv.t;
    const crumb = $('.drill-crumb', ov);
    crumb.innerHTML = pila.length > 1 ? pila.map((p, i) => (i < pila.length - 1
      ? `<button type="button" class="crumb-b" data-lv="${i}">${esc(p.t)}</button><span class="crumb-s">›</span>`
      : `<span class="crumb-c">${esc(p.t)}</span>`)).join('') : '';
    $$('[data-lv]', crumb).forEach((b) => b.addEventListener('click', () => { pila.length = Number(b.dataset.lv) + 1; disegna(); }));
    const corpo = $('.modal-b', ov);
    corpo.innerHTML = typeof liv.html === 'function' ? liv.html() : (liv.html || '');
    $('.modal', ov).scrollTop = 0;
    // le righe con data-go aprono un livello più in basso
    $$('[data-go]', corpo).forEach((el) => {
      const vai = () => { const f = liv.vai && liv.vai[el.dataset.go]; if (f) { const n = f(el); if (n) apri(n); } };
      el.addEventListener('click', vai);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vai(); } });
    });
    if (liv.bind) liv.bind(corpo, { apri, chiudi, ridisegna: disegna });
  }

  /* ---------- componenti riutilizzabili ---------- */
  const num = (x) => Number(x || 0);
  const colore = (n) => (n >= 0 ? 'var(--ok)' : 'var(--bad)');

  function kpi(voci) {
    return `<div class="drill-kpi">${voci.map((k) => `<div><span>${esc(k.l)}</span><b style="${k.c ? 'color:' + k.c : ''}">${k.v}</b></div>`).join('')}</div>`;
  }

  // barre orizzontali cliccabili: voci = [{k, etichetta, valore, extra}], ogni riga porta data-go="<azione>" e data-k
  function barre(voci, o) {
    o = o || {};
    if (!voci.length) return '<div class="empty"><div>Nessun dato.</div></div>';
    const tot = voci.reduce((a, x) => a + x.valore, 0), max = Math.max(...voci.map((x) => x.valore), 0);
    return voci.map((x, i) => `<div class="drill-bar" ${o.azione ? `data-go="${esc(o.azione)}" data-i="${i}" role="button" tabindex="0"` : ''}>
      <div class="drill-bar-t"><span>${esc(x.etichetta)}</span><b>${eur(x.valore)}${tot ? ` <span class="muted" style="font-weight:400">${Math.round(x.valore / tot * 100)}%</span>` : ''}</b></div>
      <div class="drill-bar-b"><div style="width:${max > 0 ? Math.max(2, x.valore / max * 100) : 0}%;background:${o.colore || 'var(--gold)'}"></div></div></div>`).join('');
  }

  // tabella con filtri a bollini. cfg: {righe, colonne:[{t,v(r)->html,num}], filtri:[{t,v(r)->string}], totali(righe)->html, vuoto}
  function tabella(corpo, cfg) {
    const sel = cfg.filtri ? cfg.filtri.map(() => '') : [];
    const cont = document.createElement('div');
    corpo.appendChild(cont);
    const filtra = () => cfg.righe.filter((r) => cfg.filtri.every((f, i) => !sel[i] || String(f.v(r)) === sel[i]));
    const disegnaT = () => {
      const righe = filtra();
      const bollini = (cfg.filtri || []).map((f, i) => {
        const conta = {};
        // il conteggio di ogni bollino tiene conto degli altri filtri attivi
        cfg.righe.filter((r) => cfg.filtri.every((g, j) => j === i || !sel[j] || String(g.v(r)) === sel[j])).forEach((r) => { const k = String(f.v(r)); conta[k] = (conta[k] || 0) + 1; });
        const chiavi = Object.keys(conta).sort((a, b) => (f.ord ? f.ord(a, b) : a.localeCompare(b, 'it', { numeric: true })));
        if (chiavi.length < 2 && !sel[i]) return '';
        const totale = Object.values(conta).reduce((a, x) => a + x, 0);
        return `<div class="chips"><span class="chips-l">${esc(f.t)}</span><button type="button" class="chip ${sel[i] ? '' : 'on'}" data-f="${i}" data-v="">Tutti (${totale})</button>${chiavi.map((k) => `<button type="button" class="chip ${sel[i] === k ? 'on' : ''}" data-f="${i}" data-v="${esc(k)}">${esc(f.nome ? f.nome(k) : k)} (${conta[k]})</button>`).join('')}</div>`;
      }).join('');
      cont.innerHTML = `${bollini}<div class="table-wrap"><table><thead><tr>${cfg.colonne.map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(c.t)}</th>`).join('')}</tr></thead>
        <tbody>${righe.length ? righe.map((r) => `<tr>${cfg.colonne.map((c) => `<td${c.num ? ' class="num"' : ''}>${c.v(r)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cfg.colonne.length}"><div class="empty"><div>${esc(cfg.vuoto || 'Nessun elemento.')}</div></div></td></tr>`}</tbody>
        ${cfg.totali && righe.length ? `<tfoot><tr><td colspan="${cfg.colonne.length}">${cfg.totali(righe)}</td></tr></tfoot>` : ''}</table></div>
        <div class="hint" style="margin-top:8px">${righe.length} ${righe.length === 1 ? 'elemento' : 'elementi'} · clicca sull’intestazione di una colonna per ordinare</div>`;
      $$('.chip', cont).forEach((b) => b.addEventListener('click', () => { sel[Number(b.dataset.f)] = b.dataset.v; disegnaT(); }));
    };
    disegnaT();
  }

  // elenco di movimenti di conto con totali (entrate, uscite, saldo)
  function movimenti(corpo, righe, o) {
    o = o || {};
    const ordinate = righe.slice().sort((a, b) => String(b.data_operazione).localeCompare(String(a.data_operazione)));
    tabella(corpo, {
      righe: ordinate,
      colonne: [
        { t: 'Data', v: (r) => fmtData(r.data_operazione) },
        { t: 'Descrizione', v: (r) => esc(r.descrizione || '—') },
        { t: 'Categoria', v: (r) => (r.categoria ? esc(r.categoria) : '<span class="muted">—</span>') },
        { t: 'Importo', num: true, v: (r) => `<b style="color:${colore(num(r.importo))}">${eur(r.importo)}</b>` },
      ],
      filtri: o.filtri || [],
      vuoto: 'Nessun movimento.',
      totali: (rr) => {
        const en = rr.filter((x) => num(x.importo) > 0).reduce((a, x) => a + num(x.importo), 0);
        const us = rr.filter((x) => num(x.importo) < 0).reduce((a, x) => a - num(x.importo), 0);
        return `<div class="drill-tot"><span>Entrate <b style="color:var(--ok)">${eur(en)}</b></span><span>Uscite <b style="color:var(--bad)">${eur(us)}</b></span><span>Saldo <b style="color:${colore(en - us)}">${eur(en - us)}</b></span></div>`;
      },
    });
    corpo.insertAdjacentHTML('beforeend', '<div style="margin-top:10px"><a href="#/pagamenti/conto">Apri il Conto di Loggia</a></div>');
  }

  /* ---------- registrazione dei gestori e clic ---------- */
  function registra(tipo, fn) { gestori[tipo] = fn; }

  function clic(e) {
    const el = e.target.closest('[data-drill]');
    if (!el || !state.user) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    const f = gestori[el.dataset.drill];
    if (!f) return;
    e.preventDefault();
    Promise.resolve(f(el)).catch((x) => L.toast(L.messaggioErrore(x), 'bad'));
  }
  document.addEventListener('click', clic);
  document.addEventListener('keydown', clic);

  /* ---------- Cruscotto di segreteria: Fratelli, bussanti, votazioni ---------- */
  const TIPI = { iniziazione: 'Iniziazione', riammissione: 'Riammissione', cancellazione_pena: 'Riammissione (cancellazione pena)', regolarizzazione: 'Regolarizzazione', affiliazione_estero: 'Affiliazione dall’estero' };
  const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');

  registra('fratelli', async (el) => {
    const stato = el.dataset.k || '';
    const tutti = chk(await state.sb.from('v_fratelli_completi').select('id,cognome,nome,matricola,stato,grado_attuale,carica_attuale').order('cognome').order('nome'));
    const righe = tutti.filter((x) => !stato || (x.stato || 'n/d') === stato);
    apri({
      t: stato || 'Fratelli', titolo: stato ? 'Fratelli · stato: ' + stato : 'Fratelli in anagrafica',
      html: kpi([{ l: 'Fratelli', v: righe.length }]),
      bind: (corpo) => tabella(corpo, {
        righe,
        colonne: [
          { t: 'Matricola', v: (r) => esc(r.matricola || '—') },
          { t: 'Nominativo', v: (r) => `<a class="nome" href="#/fratelli/${esc(r.id)}">${esc(r.cognome)} ${esc(r.nome)}</a>` },
          { t: 'Stato', v: (r) => esc(r.stato || '—') },
          { t: 'Grado', v: (r) => esc(cap(r.grado_attuale) || '—') },
          { t: 'Carica', v: (r) => esc(r.carica_attuale || '—') },
        ],
        filtri: [{ t: 'Grado', v: (r) => cap(r.grado_attuale) || 'n/d' }].concat(stato ? [] : [{ t: 'Stato', v: (r) => r.stato || 'n/d' }]),
      }),
    });
  });

  async function bussanti() {
    return chk(await state.sb.from('bussanti').select('id,cognome,nome,tipo_domanda,data_domanda,data_prima_votazione,data_seconda_votazione').order('cognome').order('nome'));
  }
  registra('bussanti', async () => {
    const righe = await bussanti();
    apri({
      t: 'Bussanti', titolo: 'Pratiche di bussanti', html: kpi([{ l: 'Pratiche', v: righe.length }]),
      bind: (corpo) => tabella(corpo, {
        righe,
        colonne: [
          { t: 'Nominativo', v: (r) => `<a class="nome" href="#/bussanti/${esc(r.id)}">${esc(r.cognome)} ${esc(r.nome)}</a>` },
          { t: 'Domanda', v: (r) => `<span class="badge gold">${esc(TIPI[r.tipo_domanda] || r.tipo_domanda)}</span>` },
          { t: 'Presentata il', v: (r) => fmtData(r.data_domanda) },
          { t: '1ª votazione', v: (r) => fmtData(r.data_prima_votazione) },
          { t: '2ª votazione', v: (r) => (r.tipo_domanda === 'iniziazione' ? fmtData(r.data_seconda_votazione) : '—') },
        ],
        filtri: [{ t: 'Domanda', v: (r) => r.tipo_domanda, nome: (k) => TIPI[k] || k }],
      }),
    });
  });
  registra('votazioni', async () => {
    const righe = await bussanti(), o = L.oggi(), ev = [];
    righe.forEach((b) => {
      if (b.data_prima_votazione && b.data_prima_votazione >= o) ev.push({ d: b.data_prima_votazione, t: 'Prima votazione', b });
      if (b.tipo_domanda === 'iniziazione' && b.data_seconda_votazione && b.data_seconda_votazione >= o) ev.push({ d: b.data_seconda_votazione, t: 'Seconda votazione', b });
    });
    apri({
      t: 'Votazioni', titolo: 'Votazioni in programma', html: kpi([{ l: 'Votazioni', v: ev.length }]),
      bind: (corpo) => tabella(corpo, {
        righe: ev,
        colonne: [
          { t: 'Data', v: (r) => `<b>${fmtData(r.d)}</b>` },
          { t: 'Votazione', v: (r) => esc(r.t) },
          { t: 'Bussante', v: (r) => `<a class="nome" href="#/bussanti/${esc(r.b.id)}">${esc(r.b.cognome)} ${esc(r.b.nome)}</a>` },
          { t: 'Domanda', v: (r) => esc(TIPI[r.b.tipo_domanda] || r.b.tipo_domanda) },
        ],
        filtri: [{ t: 'Votazione', v: (r) => r.t }],
        vuoto: 'Nessuna votazione in programma.',
      }),
    });
  });

  L.drill = { apri, chiudi, registra, kpi, barre, tabella, movimenti, colore };
})();
