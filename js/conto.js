/* Lemmi - scheda "Conto di Loggia" (dentro Pagamenti).
 * Import dell'estratto conto della banca, categorie di costo, riconciliazione dei bonifici dei Fratelli. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L || !L.tabsPagamenti) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, fmtData, isoToIt, itToIso, oggi, isAdmin, IC, campo } = L;
  const E = window.LemmiEstratto;

  const cs = { cat: [], mov: [], eventi: [], bussanti: [], tesoreria2: false, filtri: { q: '', stato: '', cat: '', tipo: '' } };
  const STATO = { da_riconciliare: ['Da riconciliare', 'warn'], riconciliato: ['Riconciliato', 'ok'], ignorato: ['Ignorato', 'gray'] };
  const CAT_FRATELLI = 'Versamenti dei Fratelli';
  const uuid = () => (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));

  async function carica(P) {
    const anno = P.pag.anno;
    try {
      const [m, k] = await Promise.all([
        state.sb.from('v_conto_movimenti').select('*').gte('data_operazione', anno + '-01-01').lte('data_operazione', anno + '-12-31').order('data_operazione', { ascending: false }),
        state.sb.from('categorie_movimento').select('*').order('nome'),
      ]);
      cs.mov = chk(m); cs.cat = chk(k);
      cs.eventi = []; cs.bussanti = []; cs.tesoreria2 = false;
      try {   // eventi e collegamenti ai bussanti (script lemmi_tesoreria_2.sql)
        const [ex, ev] = await Promise.all([
          state.sb.from('conto_movimenti').select('id,evento_id,bussante_id').gte('data_operazione', anno + '-01-01').lte('data_operazione', anno + '-12-31'),
          state.sb.from('eventi_conto').select('*').order('nome'),
        ]);
        const mappa = {}; chk(ex).forEach((x) => { mappa[x.id] = x; });
        cs.mov.forEach((x) => { const e = mappa[x.id]; x.evento_id = e ? e.evento_id : null; x.bussante_id = e ? e.bussante_id : null; });
        cs.eventi = chk(ev); cs.tesoreria2 = true;
      } catch (e) { cs.tesoreria2 = false; }
      try { cs.bussanti = chk(await state.sb.from('bussanti').select('id,cognome,nome')); } catch (e) { cs.bussanti = []; }
    } catch (e) {
      if (/schema cache|does not exist|Could not find/i.test((e && e.message) || '')) throw new Error('Mancano le tabelle del conto di Loggia: esegui lo script lemmi_pagamenti_2.sql nell\'editor SQL di Supabase.');
      throw e;
    }
  }

  const catPerTipo = (tipo, conFratelli) => cs.cat.filter((c) => c.attiva && c.tipo === tipo && (conFratelli || c.nome !== CAT_FRATELLI));
  const catPerNome = (nome) => cs.cat.find((c) => c.nome === nome && c.attiva);

  /* Categorie suggerite in fase di import: regole sul testo del movimento (modificabili a mano dopo l'import).
   * Le categorie che non esistono ancora vengono create al momento dell'importazione. */
  const REGOLE = [
    { tipo: 'uscita', re: /tenuta conto|canone (del )?conto|canone carta|commissioni utenze|imposta di bollo|spese.*conto|spese di gestione/, cat: 'Spese di tenuta conto' },
    { tipo: 'uscita', re: /(?=.*rimborso)(?=.*gran loggia)/, cat: 'Rimborso partecipazione Gran Loggia' },
    { tipo: 'uscita', re: /(?=.*grande oriente)(?=.*ammissione)/, cat: 'Quota di ammissione GOI (bussanti)' },
    { tipo: 'uscita', re: /(?=.*grande oriente)(?=.*(saldo estratto|capitazion))/, cat: 'Versamento capitazioni al GOI' },
    { tipo: 'uscita', re: /collegio dei mm/, cat: 'Quote Collegio dei MM.VV.' },
    { tipo: 'uscita', re: /rimborso/, cat: 'Rimborsi spese ai Fratelli' },
    { tipo: 'uscita', re: /\bcena\b|agape|ristorante|villa grant|catering/, cat: 'Agapi e cene' },
    { tipo: 'entrata', re: /quota (di )?(ingresso|iscrizione)/, cat: 'Quote di ingresso bussanti' },
    { tipo: 'entrata', re: /agape|festa della luce|\bcena\b/, cat: 'Quote agapi ed eventi' },
  ];
  function regolaPer(m) {
    const d = E.norm(m.descrizione);
    const tipo = Number(m.importo) < 0 ? 'uscita' : 'entrata';
    return REGOLE.find((r) => r.tipo === tipo && r.re.test(d)) || null;
  }
  function suggerisciCategoria(m) { const r = regolaPer(m); return r ? (catPerNome(r.cat) || null) : null; }
  function categorieMancanti(movs) {
    const viste = new Set(), out = [];
    movs.forEach((m) => { const r = regolaPer(m); if (r && !catPerNome(r.cat) && !viste.has(r.cat)) { viste.add(r.cat); out.push({ nome: r.cat, tipo: r.tipo }); } });
    return out;
  }
  function nomeCategoriaSuggerita(m) { const r = regolaPer(m); return r ? r.cat : null; }

  /* Lettore PDF (pdf.js): si carica solo quando serve */
  function caricaPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((ok, ko) => {
      const sc = document.createElement('script');
      sc.src = 'vendor/pdf.min.js';
      sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; ok(window.pdfjsLib); };
      sc.onerror = () => ko(new Error('Lettore PDF non caricato: controlla che la cartella vendor sia stata pubblicata e ricarica la pagina.'));
      document.head.appendChild(sc);
    });
  }

  /* Fratello suggerito dal testo di un bonifico (cognome e nome presenti nella descrizione) */
  function suggerisciFratello(frat, descr) {
    const d = ' ' + E.norm(descr).replace(/[^a-z0-9 ]/g, ' ') + ' ';
    const punti = frat.map((f) => {
      const c = E.norm(f.cognome).replace(/[^a-z0-9 ]/g, ' ').trim(), n = E.norm(f.nome).replace(/[^a-z0-9 ]/g, ' ').trim();
      let p = 0;
      if (c.length >= 3 && d.includes(' ' + c + ' ')) p += 1;
      if (p && n.length >= 3 && d.includes(' ' + n + ' ')) p += 1;
      return { f, p };
    }).filter((x) => x.p > 0).sort((a, b) => b.p - a.p);
    if (!punti.length || (punti[1] && punti[1].p === punti[0].p)) return null;
    return punti[0].f;
  }

  /* ---------- scheda ---------- */
  async function render(c, P) {
    await carica(P);
    const { eur, canPay } = P;
    const pos = cs.mov.filter((x) => Number(x.importo) > 0).reduce((a, x) => a + Number(x.importo), 0);
    const neg = cs.mov.filter((x) => Number(x.importo) < 0).reduce((a, x) => a + Math.abs(Number(x.importo)), 0);
    const daRic = cs.mov.filter((x) => x.stato_riconciliazione === 'da_riconciliare').length;
    c.innerHTML = `
      <div class="grid stats">
        <div class="stat"><div class="n">${eur(pos)}</div><div class="l">Entrate ${P.pag.anno}</div></div>
        <div class="stat"><div class="n">${eur(neg)}</div><div class="l">Uscite ${P.pag.anno}</div></div>
        <div class="stat"><div class="n" style="color:${pos - neg < 0 ? 'var(--bad)' : 'inherit'}">${eur(pos - neg)}</div><div class="l">Saldo del periodo</div></div>
        <div class="stat"><div class="n">${daRic}</div><div class="l">Movimenti da riconciliare</div></div></div>
      <div class="actions" style="margin-bottom:14px">
        <div class="searchbar">${IC.search}<input id="c-q" type="search" placeholder="Cerca nella descrizione…" value="${esc(cs.filtri.q)}"></div>
        <select id="c-tipo" style="width:auto"><option value="">Entrate e uscite</option><option value="e" ${cs.filtri.tipo === 'e' ? 'selected' : ''}>Solo entrate</option><option value="u" ${cs.filtri.tipo === 'u' ? 'selected' : ''}>Solo uscite</option></select>
        <select id="c-stato" style="width:auto"><option value="">Tutti gli stati</option>${Object.entries(STATO).map(([k, v]) => `<option value="${k}" ${cs.filtri.stato === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>
        <select id="c-cat" style="width:auto"><option value="">Tutte le categorie</option><option value="-" ${cs.filtri.cat === '-' ? 'selected' : ''}>Senza categoria</option>${cs.cat.map((k) => `<option value="${esc(k.id)}" ${cs.filtri.cat === k.id ? 'selected' : ''}>${esc(k.nome)}</option>`).join('')}</select>
        <span class="muted" id="c-conta"></span>
        ${canPay() ? `<span class="right actions"><button class="btn gold" id="c-imp">${IC.up} Importa estratto conto</button><button class="btn ghost" id="c-man">Nuovo movimento</button><button class="btn ghost" id="c-cat-g">Categorie</button>${cs.tesoreria2 ? '<button class="btn ghost" id="c-evt-g">Eventi</button>' : ''}</span>` : ''}
      </div>
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>Descrizione</th><th>Categoria</th><th class="num">Importo</th><th>Stato</th><th></th></tr></thead><tbody id="c-righe"></tbody></table></div>`;

    const disegna = () => {
      const q = cs.filtri.q.trim().toLowerCase();
      const f = cs.mov.filter((x) => (!q || String(x.descrizione || '').toLowerCase().includes(q) || String(x.fratello || '').toLowerCase().includes(q))
        && (!cs.filtri.tipo || (cs.filtri.tipo === 'e' ? Number(x.importo) > 0 : Number(x.importo) < 0))
        && (!cs.filtri.stato || x.stato_riconciliazione === cs.filtri.stato)
        && (!cs.filtri.cat || (cs.filtri.cat === '-' ? !x.categoria_id : x.categoria_id === cs.filtri.cat)));
      $('#c-conta').textContent = f.length + (f.length === 1 ? ' movimento' : ' movimenti');
      $('#c-righe').innerHTML = f.length ? f.map((x) => {
        const entrata = Number(x.importo) > 0; const st = STATO[x.stato_riconciliazione] || ['—', 'gray'];
        return `<tr><td>${fmtData(x.data_operazione)}</td>
          <td>${esc(x.descrizione)}${x.fratello ? ` <span class="badge info">${esc(x.fratello)}</span>` : ''}${x.evento_id && nomeEvento(x.evento_id) ? ` <span class="badge gold">${esc(nomeEvento(x.evento_id))}</span>` : ''}${x.bussante_id && nomeBussante(x.bussante_id) ? ` <span class="badge gray">Bussante: ${esc(nomeBussante(x.bussante_id))}</span>` : ''}${x.origine === 'manuale' ? ' <span class="badge gray">manuale</span>' : ''}${x.note ? `<div class="hint">${esc(x.note)}</div>` : ''}</td>
          <td>${x.categoria ? esc(x.categoria) : '<span class="muted">—</span>'}</td>
          <td class="num" style="color:${entrata ? 'var(--ok)' : 'var(--bad)'}"><b>${eur(x.importo)}</b></td>
          <td><span class="badge ${st[1]}">${st[0]}</span></td>
          <td class="act">${canPay() ? `${entrata && x.stato_riconciliazione === 'da_riconciliare' ? `<button class="btn ghost small" data-lega="${esc(x.id)}">Collega versamento</button> ` : ''}${x.stato_riconciliazione !== 'ignorato' && (!entrata || x.stato_riconciliazione === 'da_riconciliare') ? `<button class="btn ghost small" data-cat="${esc(x.id)}">Categoria</button> ` : ''}${cs.tesoreria2 ? `<button class="btn ghost small" data-evt="${esc(x.id)}">Evento</button> ` : ''}${x.stato_riconciliazione === 'da_riconciliare' ? `<button class="btn ghost small" data-ign="${esc(x.id)}">Ignora</button>` : ''}${x.stato_riconciliazione === 'ignorato' ? `<button class="btn ghost small" data-rip="${esc(x.id)}">Ripristina</button>` : ''}${isAdmin() && x.origine === 'manuale' ? ` <button class="btn danger small" data-delm="${esc(x.id)}">Elimina</button>` : ''}` : ''}</td></tr>`;
      }).join('') : `<tr><td colspan="6"><div class="empty">${IC.inbox}<div>${cs.mov.length ? 'Nessun risultato.' : 'Nessun movimento nel ' + P.pag.anno + '.' + (canPay() ? ' Importa l’estratto conto della banca per iniziare.' : '')}</div></div></td></tr>`;
      const trova = (id) => cs.mov.find((x) => x.id === id);
      $$('[data-lega]', c).forEach((b) => b.addEventListener('click', () => apriCollega(trova(b.dataset.lega), P).catch((e) => toast(messaggioErrore(e), 'bad'))));
      $$('[data-cat]', c).forEach((b) => b.addEventListener('click', () => apriCategoria(trova(b.dataset.cat), P).catch((e) => toast(messaggioErrore(e), 'bad'))));
      $$('[data-evt]', c).forEach((b) => b.addEventListener('click', () => apriEvento(trova(b.dataset.evt), P)));
      $$('[data-ign]', c).forEach((b) => b.addEventListener('click', () => cambiaStato(b.dataset.ign, 'ignorato')));
      $$('[data-rip]', c).forEach((b) => b.addEventListener('click', () => cambiaStato(b.dataset.rip, 'da_riconciliare')));
      $$('[data-delm]', c).forEach((b) => b.addEventListener('click', () => eliminaManuale(b.dataset.delm)));
    };
    $('#c-q').addEventListener('input', (e) => { cs.filtri.q = e.target.value; disegna(); });
    $('#c-tipo').addEventListener('change', (e) => { cs.filtri.tipo = e.target.value; disegna(); });
    $('#c-stato').addEventListener('change', (e) => { cs.filtri.stato = e.target.value; disegna(); });
    $('#c-cat').addEventListener('change', (e) => { cs.filtri.cat = e.target.value; disegna(); });
    if (canPay()) {
      $('#c-imp').onclick = () => apriImporta(P);
      $('#c-man').onclick = () => apriManuale(P).catch((e) => toast(messaggioErrore(e), 'bad'));
      $('#c-cat-g').onclick = () => apriCategorie(P);
      if ($('#c-evt-g')) $('#c-evt-g').onclick = () => apriEventi(P);
    }
    disegna();
  }

  async function cambiaStato(id, stato) {
    try { chk(await state.sb.from('conto_movimenti').update({ stato_riconciliazione: stato }).eq('id', id)); L.route(); }
    catch (e) { toast(messaggioErrore(e), 'bad'); }
  }
  async function eliminaManuale(id) {
    if (!window.confirm('Eliminare questo movimento inserito a mano?')) return;
    try { chk(await state.sb.from('conto_movimenti').delete().eq('id', id)); toast('Movimento eliminato', 'ok'); L.route(); }
    catch (e) { toast(messaggioErrore(e), 'bad'); }
  }

  /* ---------- import dell'estratto conto ---------- */
  function apriImporta(P) {
    if (!E || !window.XLSX) { toast('Lettore di file Excel non caricato: ricarica la pagina.', 'bad'); return; }
    let an = null; let nomeFile = '';
    const corpo = `<div class="form-grid">
      <div class="f"><label for="i-file">File dell’estratto conto (PDF di BancoPosta, oppure .xls, .xlsx o .csv)</label><input id="i-file" class="vis" type="file" accept=".pdf,.xls,.xlsx,.csv,.txt"></div>
      <div class="f hint">Il file viene letto sul tuo computer. I movimenti già importati in precedenza vengono riconosciuti e non si duplicano.</div>
      <div class="f" id="i-esito"></div></div>`;
    const m = P.modal('Importa estratto conto', corpo, {
      conferma: 'Importa i movimenti',
      onSubmit: async (f, chiudi, errore) => {
        if (!an || !an.movimenti.length) return errore('Scegli un file e controlla che i movimenti siano stati riconosciuti.');
        if (an.pdf && !an.verifica.ok && !($('#i-forza', m.ov) && $('#i-forza', m.ov).checked)) return errore('I movimenti non quadrano con i totali dell’estratto: controlla il file oppure spunta «Importa comunque».');
        const nuove = categorieMancanti(an.movimenti);
        if (nuove.length) { const cr = chk(await state.sb.from('categorie_movimento').insert(nuove).select('*')); cs.cat = cs.cat.concat(cr); }
        const righe = an.movimenti.map((x) => { const k = suggerisciCategoria(x); return Object.assign({}, x, { categoria_id: k ? k.id : null }); });
        const auto = righe.filter((x) => x.categoria_id).length;
        const r = chk(await state.sb.rpc('importa_movimenti', { p_nome_file: nomeFile, p_righe: righe }));
        const extra = await collegaAutomatico(righe, an);
        chiudi();
        P.avviso('Estratto conto importato', `<div class="kv"><div><span>Movimenti nuovi</span><b>${Number(r.righe_nuove)}</b></div><div><span>Già presenti (ignorati)</span><b>${Number(r.righe_gia_presenti)}</b></div><div><span>Categorizzati in automatico</span><b>${auto}</b></div></div>
          <div class="notice" style="margin-top:14px">Ora assegna una categoria alle uscite rimaste e collega i bonifici dei Fratelli ai versamenti con «Collega versamento».</div>${extra}`);
        L.route();
      },
    });
    const esito = $('#i-esito', m.ov);

    const verificaPdf = () => {
      const v = an.verifica, b = an.banca;
      if (v.ok) return `<div class="notice" style="margin-top:10px;background:var(--ok-bg);color:#145c40"><b>Quadra con l’estratto della banca</b> (${v.verificati.join(', ')}): entrate ${P.eur(v.entrate)}, uscite ${P.eur(v.uscite)}${b.saldoFinale !== null ? ', saldo finale ' + P.eur(b.saldoFinale) : ''}.</div>`;
      return `<div class="notice bad" style="margin-top:10px"><b>Attenzione: i movimenti letti non quadrano con i totali dell’estratto.</b> ${v.falliti.length ? 'Non tornano: ' + v.falliti.join(', ') + '. ' : ''}${v.senzaTotali ? 'Nel PDF non ho trovato i totali per il controllo. ' : ''}Letto: entrate ${P.eur(v.entrate)}, uscite ${P.eur(v.uscite)}.
        <label style="display:flex;gap:6px;align-items:center;font-weight:500;margin-top:8px"><input type="checkbox" id="i-forza"> Importa comunque (dopo aver controllato i movimenti)</label></div>`;
    };
    const disegna = () => {
      const r = E.riepilogo(an.movimenti);
      const opt = (sel) => `<option value="">— nessuna —</option>${an.etichette.map((t, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${E.lettera(i)} · ${esc(t)}</option>`).join('')}`;
      const mp = an.mappa;
      esito.innerHTML = `
        ${an.movimenti.length
          ? `<div class="notice" style="background:var(--ok-bg);color:#145c40"><b>${r.righe} movimenti</b> dal ${fmtData(r.dal)} al ${fmtData(r.al)} · entrate ${P.eur(r.entrate)} · uscite ${P.eur(r.uscite)}${an.scartate ? ` · ${an.scartate} righe non valide ignorate (totali, intestazioni…)` : ''}</div>`
          : '<div class="notice bad">Non sono riuscito a riconoscere i movimenti: indica qui sotto quali colonne contengono data e importo.</div>'}
        ${an.pdf ? '' : `<details ${an.movimenti.length ? '' : 'open'} style="margin-top:10px"><summary style="cursor:pointer;font-weight:600">Controlla il riconoscimento delle colonne</summary>
          <div class="form-grid" style="margin-top:12px">
            <div class="f s4"><label for="k-riga">Riga delle intestazioni</label><input id="k-riga" type="number" min="1" max="200" value="${an.rigaIntestazione + 1}"></div>
            <div class="f s4"><label for="k-data">Data dell’operazione</label><select id="k-data">${opt(mp.data)}</select></div>
            <div class="f s4"><label for="k-valuta">Data valuta</label><select id="k-valuta">${opt(mp.valuta)}</select></div>
            <div class="f s4"><label for="k-d1">Descrizione</label><select id="k-d1">${opt(mp.descrizione[0] === undefined ? null : mp.descrizione[0])}</select></div>
            <div class="f s4"><label for="k-d2">Descrizione (seconda colonna)</label><select id="k-d2">${opt(mp.descrizione[1] === undefined ? null : mp.descrizione[1])}</select></div>
            <div class="f s4"><label for="k-saldo">Saldo</label><select id="k-saldo">${opt(mp.saldo)}</select></div>
            <div class="f s4"><label for="k-imp">Importo (con segno)</label><select id="k-imp">${opt(mp.importo)}</select></div>
            <div class="f s4"><label for="k-dare">Dare / uscite</label><select id="k-dare">${opt(mp.dare)}</select></div>
            <div class="f s4"><label for="k-avere">Avere / entrate</label><select id="k-avere">${opt(mp.avere)}</select></div>
            <div class="f hint">Usa «Importo» se la banca ha una sola colonna con il segno, oppure «Dare» e «Avere» se sono separate.</div></div></details>`}
        ${an.pdf ? verificaPdf() : ''}
        ${an.movimenti.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Data</th><th>Descrizione</th><th>Categoria suggerita</th><th class="num">Importo</th></tr></thead><tbody>
          ${an.movimenti.slice(0, 6).map((x) => { const cn = nomeCategoriaSuggerita(x); return `<tr><td>${fmtData(x.data_operazione)}</td><td>${esc(x.descrizione.length > 110 ? x.descrizione.slice(0, 107) + '…' : x.descrizione)}</td><td>${cn ? esc(cn) + (catPerNome(cn) ? '' : ' <span class="badge info">nuova</span>') : '<span class="muted">—</span>'}</td><td class="num">${P.eur(x.importo)}</td></tr>`; }).join('')}
          ${an.movimenti.length > 6 ? `<tr><td colspan="4" class="muted">… e altri ${an.movimenti.length - 6} movimenti</td></tr>` : ''}</tbody></table></div>` : ''}`;
      if (!an.pdf) $$('select, input', esito).forEach((el) => el.addEventListener('change', ricalcola));
    };

    const ricalcola = () => {
      const g = (id) => { const v = $('#' + id, esito).value; return v === '' ? null : Number(v); };
      const riga = Math.max(0, (Number($('#k-riga', esito).value) || 1) - 1);
      const mappa = { data: g('k-data'), valuta: g('k-valuta'), descrizione: [g('k-d1'), g('k-d2')].filter((x) => x !== null), importo: g('k-imp'), dare: g('k-dare'), avere: g('k-avere'), saldo: g('k-saldo'), riferimento: null };
      const etichette = (an.griglia[riga] || []).map((c, i) => (String(c).trim() ? String(c).trim() : 'Colonna ' + E.lettera(i)));
      const { movimenti, scartate } = E.estrai(an.griglia, riga, mappa);
      an = Object.assign({}, an, { rigaIntestazione: riga, mappa, etichette: etichette.length ? etichette : an.etichette, movimenti, scartate });
      disegna();
    };

    $('#i-file', m.ov).addEventListener('change', async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      nomeFile = file.name;
      esito.innerHTML = '<div class="loading" style="padding:20px"><span class="spin"></span></div>';
      try {
        if (/\.pdf$/i.test(file.name)) {
          if (!window.LemmiEstrattoPdf) throw new Error('Modulo di lettura PDF non caricato: ricarica la pagina.');
          const r = await window.LemmiEstrattoPdf.leggi(await file.arrayBuffer(), await caricaPdfJs());
          if (!r.movimenti.length) throw new Error('Non ho trovato movimenti nel PDF: è l’estratto conto BancoPosta originale? In alternativa usa il file Excel o CSV.');
          an = { pdf: true, movimenti: r.movimenti, scartate: 0, verifica: r.verifica, banca: r.banca, griglia: [], etichette: [], mappa: { descrizione: [] }, rigaIntestazione: 0 };
        } else {
          const griglia = E.leggiFile(await file.arrayBuffer(), file.name);
          an = E.analizza(griglia);
        }
        disegna();
      } catch (e) {
        an = null;
        esito.innerHTML = `<div class="notice bad">Impossibile leggere il file: ${esc(e.message || e)}</div>`;
      }
    });
  }

  /* ---------- categoria di un movimento ---------- */
  /* ---------- eventi, bussanti e saldi (script lemmi_tesoreria_2.sql) ---------- */
  const nomeEvento = (id) => { const e = cs.eventi.find((x) => x.id === id); return e ? e.nome : ''; };
  const nomeBussante = (id) => { const b = cs.bussanti.find((x) => x.id === id); return b ? b.cognome + ' ' + b.nome : ''; };
  const paroleChiave = (ev) => String(ev.parole_chiave || '').split(',').map((t) => E.norm(t)).filter((t) => t.length >= 3);
  const eventoPerTesto = (descr) => { const d = E.norm(descr); return cs.eventi.find((ev) => paroleChiave(ev).some((k) => d.includes(k))) || null; };
  function bussantePerTesto(descr) {
    const d = ' ' + E.norm(descr).replace(/[^a-z0-9 ]/g, ' ') + ' ';
    const t = cs.bussanti.filter((b) => d.includes(' ' + E.norm(b.cognome).replace(/[^a-z0-9 ]/g, ' ') + ' ') && d.includes(' ' + E.norm(b.nome).replace(/[^a-z0-9 ]/g, ' ') + ' '));
    return t.length === 1 ? t[0] : null;
  }
  const CAT_BUSSANTI = ['Quote di ingresso bussanti', 'Quota di ammissione GOI (bussanti)'];

  async function aggiornaPerImpronte(campo, valore, impronte) {
    for (let i = 0; i < impronte.length; i += 80) chk(await state.sb.from('conto_movimenti').update({ [campo]: valore }).in('impronta', impronte.slice(i, i + 80)));
  }
  /* Dopo l'importazione: assegna gli eventi (parole chiave), collega i versamenti dei bussanti e registra i saldi della banca */
  async function collegaAutomatico(righe, an) {
    let html = '';
    try {
      if (cs.tesoreria2) {
        const perEvento = {}, perBussante = {};
        righe.forEach((x) => {
          const ev = eventoPerTesto(x.descrizione); if (ev) (perEvento[ev.id] = perEvento[ev.id] || []).push(x.impronta);
          const r = regolaPer(x);
          if (r && CAT_BUSSANTI.includes(r.cat)) { const b = bussantePerTesto(x.descrizione); if (b) (perBussante[b.id] = perBussante[b.id] || []).push(x.impronta); }
        });
        for (const id of Object.keys(perEvento)) await aggiornaPerImpronte('evento_id', id, perEvento[id]);
        for (const id of Object.keys(perBussante)) await aggiornaPerImpronte('bussante_id', id, perBussante[id]);
        const nEv = Object.values(perEvento).reduce((a, l) => a + l.length, 0), nBu = Object.values(perBussante).reduce((a, l) => a + l.length, 0);
        if (nEv || nBu) html += `<div class="kv" style="margin-top:12px"><div><span>Assegnati a un evento</span><b>${nEv}</b></div><div><span>Collegati a un bussante</span><b>${nBu}</b></div></div>`;
      }
    } catch (e) { html += `<div class="notice" style="margin-top:12px">Collegamenti automatici non riusciti: ${esc(messaggioErrore(e))}</div>`; }
    try {
      if (an.pdf && an.banca) {
        const sal = [];
        if (an.banca.saldoIniziale !== null && an.banca.dataSaldoIniziale) sal.push({ data: an.banca.dataSaldoIniziale, saldo: an.banca.saldoIniziale, fonte: 'estratto PDF' });
        if (an.banca.saldoFinale !== null && an.banca.dataSaldoFinale) sal.push({ data: an.banca.dataSaldoFinale, saldo: an.banca.saldoFinale, fonte: 'estratto PDF' });
        if (sal.length) chk(await state.sb.from('conto_saldi').upsert(sal, { onConflict: 'data' }));
      }
    } catch (e) { /* senza la tabella dei saldi il Cruscotto userà solo i movimenti */ }
    return html;
  }

  function apriEvento(mov, P) {
    if (!mov) return;
    const corpo = `<div class="form-grid">
      <div class="f"><div class="kv"><div><span>Movimento</span><b>${esc(mov.descrizione.length > 90 ? mov.descrizione.slice(0, 87) + '…' : mov.descrizione)}</b></div><div><span>Importo</span><b>${P.eur(mov.importo)}</b></div></div></div>
      <div class="f s6"><label for="ev-sel">Evento</label><select id="ev-sel" name="evento"><option value="">— nessuno —</option>${cs.eventi.map((x) => `<option value="${esc(x.id)}" ${x.id === mov.evento_id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}<option value="_nuovo">+ Nuovo evento…</option></select></div>
      <div class="f s6 hidden" id="ev-nw"><label for="ev-nome">Nome del nuovo evento</label><input id="ev-nome" name="nuovo" placeholder="es. Festa della Luce 2026"></div>
      ${cs.bussanti.length ? `<div class="f"><label for="ev-bus">Bussante a cui riferire il movimento (facoltativo)</label><input id="ev-bus" name="bussante" list="dl-ev-bus" autocomplete="off" value="${esc(mov.bussante_id ? nomeBussante(mov.bussante_id) : '')}" placeholder="Scrivi il cognome e scegli dall’elenco"><datalist id="dl-ev-bus">${cs.bussanti.map((b) => `<option value="${esc(b.cognome + ' ' + b.nome)}"></option>`).join('')}</datalist></div>` : ''}</div>`;
    const m = P.modal('Evento e bussante', corpo, {
      onSubmit: async (f, chiudi, errore) => {
        let evento_id = f.elements.evento.value || null;
        if (evento_id === '_nuovo') {
          const nome = f.elements.nuovo.value.trim();
          if (!nome) return errore('Indica il nome del nuovo evento.');
          const cr = chk(await state.sb.from('eventi_conto').insert({ nome }).select('*'));
          evento_id = cr[0].id;
        }
        let bussante_id = null;
        if (f.elements.bussante) {
          const t = E.norm(f.elements.bussante.value);
          if (t) {
            const b = cs.bussanti.find((x) => E.norm(x.cognome + ' ' + x.nome) === t || E.norm(x.nome + ' ' + x.cognome) === t);
            if (!b) return errore('Bussante non trovato: scegli dall’elenco oppure lascia vuoto.');
            bussante_id = b.id;
          }
        }
        chk(await state.sb.from('conto_movimenti').update({ evento_id, bussante_id }).eq('id', mov.id));
        chiudi(); toast('Movimento aggiornato', 'ok'); L.route();
      },
    });
    const sel = m.f.elements.evento;
    sel.addEventListener('change', () => $('#ev-nw', m.f).classList.toggle('hidden', sel.value !== '_nuovo'));
  }

  function totaliEvento(id) {
    const l = cs.mov.filter((x) => x.evento_id === id);
    const ent = l.filter((x) => Number(x.importo) > 0).reduce((a, x) => a + Number(x.importo), 0);
    const usc = l.filter((x) => Number(x.importo) < 0).reduce((a, x) => a - Number(x.importo), 0);
    return { n: l.length, ent, usc, ris: ent - usc };
  }

  function apriEventi(P) {
    const righe = cs.eventi.map((ev) => { const t = totaliEvento(ev.id); return `<tr><td><b>${esc(ev.nome)}</b>${ev.data_evento ? `<div class="hint">${fmtData(ev.data_evento)}</div>` : ''}${ev.parole_chiave ? `<div class="hint">Parole chiave: ${esc(ev.parole_chiave)}</div>` : ''}</td>
      <td class="num">${t.n}</td><td class="num">${P.eur(t.ent)}</td><td class="num">${P.eur(t.usc)}</td><td class="num" style="color:${t.ris >= 0 ? 'var(--ok)' : 'var(--bad)'}"><b>${P.eur(t.ris)}</b></td>
      <td class="act"><button class="btn ghost small" data-ev-mod="${esc(ev.id)}">Modifica</button></td></tr>`; }).join('');
    const corpo = `<p class="muted" style="margin-top:0">Un evento raggruppa entrate e uscite di una stessa occasione (agape, festa, cena) e ne mostra il risultato. Le <b>parole chiave</b> servono ad assegnare da soli i movimenti all’importazione (es. «festa della luce, bomarzo, villa grant»).</p>
      <div class="table-wrap"><table><thead><tr><th>Evento</th><th class="num">Mov.</th><th class="num">Entrate</th><th class="num">Uscite</th><th class="num">Risultato</th><th></th></tr></thead><tbody>
      ${righe || '<tr><td colspan="6"><div class="empty">Nessun evento: creane uno con «Nuovo evento».</div></td></tr>'}</tbody></table></div>
      <div class="actions" style="margin-top:12px"><button class="btn gold" type="button" data-ev-new>Nuovo evento</button><button class="btn ghost" type="button" data-ev-appl>Applica le parole chiave ai movimenti senza evento</button></div>`;
    const m = P.modal('Eventi del ' + P.pag.anno, corpo, { senzaConferma: true });
    $('[data-ev-new]', m.ov).onclick = () => { m.chiudi(); apriEventoForm(null, P); };
    $$('[data-ev-mod]', m.ov).forEach((b) => b.addEventListener('click', () => { m.chiudi(); apriEventoForm(cs.eventi.find((x) => x.id === b.dataset.evMod), P); }));
    $('[data-ev-appl]', m.ov).onclick = async () => {
      try {
        const per = {};
        cs.mov.filter((x) => !x.evento_id).forEach((x) => { const ev = eventoPerTesto(x.descrizione); if (ev) (per[ev.id] = per[ev.id] || []).push(x.id); });
        let n = 0;
        for (const id of Object.keys(per)) { chk(await state.sb.from('conto_movimenti').update({ evento_id: id }).in('id', per[id])); n += per[id].length; }
        m.chiudi(); toast(n ? n + (n === 1 ? ' movimento assegnato' : ' movimenti assegnati') : 'Nessun movimento da assegnare', 'ok'); L.route();
      } catch (e) { toast(messaggioErrore(e), 'bad'); }
    };
  }

  function apriEventoForm(ev, P) {
    const corpo = `<div class="form-grid">
      <div class="f s8"><label for="ef-nome">Nome <span class="req">*</span></label><input id="ef-nome" name="nome" value="${esc(ev ? ev.nome : '')}" placeholder="es. Festa della Luce 2026"></div>
      <div class="f s4"><label for="ef-data">Data</label><input id="ef-data" name="data" value="${esc(ev ? isoToIt(ev.data_evento) : '')}" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off"></div>
      <div class="f s12"><label for="ef-kw">Parole chiave (separate da virgola)</label><input id="ef-kw" name="kw" value="${esc(ev ? ev.parole_chiave || '' : '')}" placeholder="es. festa della luce, bomarzo, villa grant"></div>
      <div class="f s12"><label for="ef-note">Note</label><input id="ef-note" name="note" value="${esc(ev ? ev.note || '' : '')}"></div></div>`;
    const extra = ev ? '<button class="btn danger" type="button" data-ef-del>Elimina evento</button>' : '';
    const m = P.modal(ev ? 'Modifica evento' : 'Nuovo evento', corpo, {
      extra,
      onSubmit: async (f, chiudi, errore) => {
        const nome = f.elements.nome.value.trim();
        if (!nome) return errore('Indica il nome dell’evento.');
        const d = itToIso(f.elements.data.value);
        if (d === 'ERR') return errore('Data non valida: usa gg/mm/aaaa.');
        const dati = { nome, data_evento: d, parole_chiave: f.elements.kw.value.trim() || null, note: f.elements.note.value.trim() || null };
        if (ev) chk(await state.sb.from('eventi_conto').update(dati).eq('id', ev.id)); else chk(await state.sb.from('eventi_conto').insert(dati));
        chiudi(); toast('Evento salvato', 'ok'); L.route();
      },
    });
    const del = $('[data-ef-del]', m.ov);
    if (del) del.onclick = async () => {
      if (!window.confirm('Eliminare questo evento? I movimenti restano, ma non saranno più assegnati a un evento.')) return;
      try { chk(await state.sb.from('eventi_conto').delete().eq('id', ev.id)); m.chiudi(); toast('Evento eliminato', 'ok'); L.route(); }
      catch (e) { toast(messaggioErrore(e), 'bad'); }
    };
  }

  /* riquadro "Pagamenti" nella scheda del bussante */
  L.bussanteExtra = L.bussanteExtra || [];
  L.bussanteExtra.push(async (v, id) => {
    const [mv, ct] = await Promise.all([
      state.sb.from('conto_movimenti').select('data_operazione,descrizione,importo,categoria_id').eq('bussante_id', id).order('data_operazione'),
      state.sb.from('categorie_movimento').select('id,nome'),
    ]);
    const righe = chk(mv), cat = {}; chk(ct).forEach((k) => { cat[k.id] = k.nome; });
    const eurFmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
    const ent = righe.filter((x) => Number(x.importo) > 0).reduce((a, x) => a + Number(x.importo), 0);
    const usc = righe.filter((x) => Number(x.importo) < 0).reduce((a, x) => a - Number(x.importo), 0);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h2>Pagamenti del bussante <small>${righe.length}</small></h2>
      ${righe.length ? `<div class="table-wrap"><table><tbody>${righe.map((x) => `<tr><td>${fmtData(x.data_operazione)}</td><td>${esc(x.descrizione.length > 80 ? x.descrizione.slice(0, 77) + '…' : x.descrizione)}<div class="hint">${esc(cat[x.categoria_id] || '')}</div></td>
        <td class="num" style="color:${Number(x.importo) > 0 ? 'var(--ok)' : 'var(--bad)'}"><b>${eurFmt.format(Number(x.importo))}</b></td></tr>`).join('')}</tbody></table></div>
        <div class="kv" style="margin-top:10px"><div><span>Incassato dal bussante</span><b>${eurFmt.format(ent)}</b></div><div><span>Girato al GOI</span><b>${eurFmt.format(usc)}</b></div><div><span>Resta alla Loggia</span><b>${eurFmt.format(ent - usc)}</b></div></div>`
        : '<div class="empty"><div>Nessun bonifico collegato. In Conto di Loggia, il pulsante «Evento» di un movimento permette di riferirlo a questo bussante.</div></div>'}`;
    v.appendChild(card);
  });

  async function apriCategoria(mov, P) {
    const frat = await P.fratelliPag();
    const tipo = Number(mov.importo) > 0 ? 'entrata' : 'uscita';
    const lista = catPerTipo(tipo);
    const corpo = `<div class="form-grid">
      <div class="f"><div class="kv"><div><span>Data</span><b>${fmtData(mov.data_operazione)}</b></div><div><span>Importo</span><b>${P.eur(mov.importo)}</b></div></div><div class="hint" style="margin-top:6px">${esc(mov.descrizione)}</div></div>
      <div class="f s6"><label for="x-cat">Categoria</label><select id="x-cat" name="categoria"><option value="">— nessuna —</option>${P.opzioni(lista.map((k) => ({ v: k.id, t: k.nome })), mov.categoria_id)}</select></div>
      ${P.campoFratello(frat, { id: 'x-frat', label: 'Fratello interessato (es. rimborso)', req: false })}
      ${campo('note', 'Note', mov.note || '', { cls: 's12' })}
      <div class="f hint">${tipo === 'entrata' ? 'Per i versamenti dei Fratelli usa «Collega versamento». Qui si classificano le altre entrate (interessi, rimborsi…).' : 'Se manca la categoria che ti serve, creala da «Categorie».'}</div></div>`;
    const m = P.modal('Categoria del movimento', corpo, {
      onSubmit: async (f, chiudi, errore) => {
        const nome = f.elements.fratello.value.trim();
        const fid = nome ? P.idFratello(frat, nome) : null;
        if (nome && !fid) return errore('Fratello non trovato: scrivi il cognome e scegli dall’elenco, oppure lascia vuoto.');
        const cat = f.elements.categoria.value || null;
        chk(await state.sb.from('conto_movimenti').update({ categoria_id: cat, fratello_id: fid, note: f.elements.note.value.trim() || null, stato_riconciliazione: cat ? 'riconciliato' : 'da_riconciliare' }).eq('id', mov.id));
        chiudi(); toast('Movimento aggiornato', 'ok'); L.route();
      },
    });
    const att = frat.find((x) => x.id === mov.fratello_id);
    if (att) m.f.elements.fratello.value = att.cognome + ' ' + att.nome;
  }

  /* ---------- collega un bonifico a un versamento ---------- */
  async function apriCollega(mov, P) {
    const frat = await P.fratelliPag();
    const voci = P.pag.voci;
    const anno0 = Number(String(mov.data_operazione).slice(0, 4));
    const sug = suggerisciFratello(frat, mov.descrizione);
    const corpo = `<div class="form-grid">
      <div class="f"><div class="kv"><div><span>Data</span><b>${fmtData(mov.data_operazione)}</b></div><div><span>Importo</span><b>${P.eur(mov.importo)}</b></div></div><div class="hint" style="margin-top:6px">${esc(mov.descrizione)}</div></div>
      ${P.campoFratello(frat, { wid: 'w-frat', id: 'l-frat' })}
      <div class="f s6"><label for="l-voce">Voce</label><select id="l-voce" name="voce">${P.opzioni(voci.map((x) => ({ v: x.id, t: x.nome })), '')}</select></div>
      <div class="f s4" id="w-anno"><label for="l-anno">Anno della quota</label><input id="l-anno" name="anno" inputmode="numeric" maxlength="4" value="${anno0}"></div>
      <div class="f s8" id="w-scad"><label for="l-scad">Scadenza da saldare</label><select id="l-scad" name="scadenza"></select></div>
      ${campo('note', 'Note', '', { cls: 's12' })}
      ${sug ? `<div class="f hint">Fratello riconosciuto dalla descrizione del bonifico: ${esc(sug.cognome + ' ' + sug.nome)}. Verifica che sia corretto.</div>` : ''}</div>`;
    const m = P.modal('Collega il bonifico a un versamento', corpo, {
      conferma: 'Registra il versamento',
      onSubmit: async (f, chiudi, errore) => {
        const v = voci.find((x) => x.id === f.elements.voce.value);
        if (!v) return errore('Scegli la voce.');
        let fid = null, anno = anno0, scad = null;
        if (v.personale) {
          fid = P.idFratello(frat, f.elements.fratello.value);
          anno = Number(f.elements.anno.value);
          if (!fid) return errore('Indica il nome del Fratello: scrivi il cognome e scegli dall’elenco.');
          if (!Number.isInteger(anno) || anno < 2000 || anno > 2100) return errore('Anno non valido (4 cifre).');
          scad = f.elements.scadenza.value || null;
        }
        chk(await state.sb.rpc('riconcilia_con_versamento', { p_movimento: mov.id, p_voce: v.id, p_fratello: fid, p_anno: anno, p_scadenza: scad, p_note: f.elements.note.value.trim() || null }));
        chiudi(); toast('Versamento registrato e movimento riconciliato', 'ok'); L.route();
      },
    });
    const f = m.f;
    if (sug) f.elements.fratello.value = sug.cognome + ' ' + sug.nome;
    const aggiorna = () => {
      const v = voci.find((x) => x.id === f.elements.voce.value);
      const pers = v ? v.personale : true;
      ['w-anno', 'w-scad'].forEach((id) => $('#' + id, f).classList.toggle('hidden', !pers));
      f.elements.fratello.disabled = !pers;
      f.elements.fratello.placeholder = pers ? 'Scrivi il cognome e scegli dall’elenco' : 'Voce collettiva: non serve indicare il Fratello';
      if (!pers) { f.elements.fratello.value = ''; return; }
      const fid = P.idFratello(frat, f.elements.fratello.value);
      const aperte = P.pag.righe.filter((r) => r.fratello_id === fid && v && r.voce_codice === v.codice && r.anno === Number(f.elements.anno.value) && Number(r.residuo) > 0);
      f.elements.scadenza.innerHTML = '<option value="">— nessuna (acconto non collegato) —</option>' + aperte.map((r) =>
        `<option value="${esc(r.id)}">${fmtData(r.data_scadenza)}${r.rate_totali > 1 ? ' · rata ' + r.rata_n + '/' + r.rate_totali : ''} · residuo ${P.eur(r.residuo)}</option>`).join('');
      if (aperte.length === 1) f.elements.scadenza.value = aperte[0].id;
    };
    // se il Fratello è riconosciuto, propone la voce che ha una scadenza aperta
    if (sug) {
      const aperta = P.pag.righe.find((r) => r.fratello_id === sug.id && Number(r.residuo) > 0 && r.anno === anno0);
      const vv = aperta && voci.find((x) => x.codice === aperta.voce_codice);
      if (vv) f.elements.voce.value = vv.id;
    }
    ['voce', 'fratello', 'anno'].forEach((n) => f.elements[n].addEventListener('change', aggiorna));
    f.elements.fratello.addEventListener('input', aggiorna);
    f.elements.anno.addEventListener('input', aggiorna);
    aggiorna();
  }

  /* ---------- movimento inserito a mano ---------- */
  async function apriManuale(P) {
    const frat = await P.fratelliPag();
    const corpo = `<div class="form-grid">
      <div class="f s4"><label for="y-tipo">Tipo</label><select id="y-tipo" name="tipo"><option value="uscita">Uscita (spesa)</option><option value="entrata">Entrata</option></select></div>
      ${campo('data', 'Data', oggi(), { type: 'date', cls: 's4' })}
      ${campo('importo', 'Importo (€)', '', { cls: 's4', ph: 'es. 150,00' })}
      <div class="f s6"><label for="y-cat">Categoria</label><select id="y-cat" name="categoria"></select></div>
      ${P.campoFratello(frat, { id: 'y-frat', label: 'Fratello interessato (es. rimborso)', req: false })}
      ${campo('descrizione', 'Descrizione', '', { cls: 's12', ph: 'es. Rimborso trasferta Gran Loggia' })}
      ${campo('note', 'Note', '', { cls: 's12' })}
      <div class="f hint">Usa questa scheda solo per movimenti che non compaiono sull’estratto conto (per esempio spese pagate in contanti): quelli della banca si importano dal file.</div></div>`;
    const m = P.modal('Nuovo movimento', corpo, {
      conferma: 'Registra',
      onSubmit: async (f, chiudi, errore) => {
        const data = itToIso(f.elements.data.value);
        if (!data || data === 'ERR') return errore('Inserisci la data nel formato gg/mm/aaaa.');
        const imp = P.leggiImporto(f.elements.importo.value);
        if (imp === null || Number.isNaN(imp) || imp <= 0) return errore('Importo non valido: usa cifre, ad esempio 150 oppure 150,50.');
        const descr = f.elements.descrizione.value.trim();
        if (!descr) return errore('Scrivi una descrizione.');
        const nome = f.elements.fratello.value.trim();
        const fid = nome ? P.idFratello(frat, nome) : null;
        if (nome && !fid) return errore('Fratello non trovato: scrivi il cognome e scegli dall’elenco, oppure lascia vuoto.');
        const uscita = f.elements.tipo.value === 'uscita';
        chk(await state.sb.from('conto_movimenti').insert({
          data_operazione: data, descrizione: descr, importo: uscita ? -imp : imp, impronta: 'manuale-' + uuid(), origine: 'manuale',
          stato_riconciliazione: 'riconciliato', categoria_id: f.elements.categoria.value || null, fratello_id: fid, note: f.elements.note.value.trim() || null,
        }));
        chiudi(); toast('Movimento registrato', 'ok'); L.route();
      },
    });
    const f = m.f;
    const agg = () => { f.elements.categoria.innerHTML = '<option value="">— nessuna —</option>' + catPerTipo(f.elements.tipo.value).map((k) => `<option value="${esc(k.id)}">${esc(k.nome)}</option>`).join(''); };
    f.elements.tipo.addEventListener('change', agg);
    agg();
  }

  /* ---------- gestione delle categorie ---------- */
  function apriCategorie(P) {
    const corpo = `<div id="cg-lista"></div>
      <div class="form-grid" style="margin-top:16px;border-top:1px dashed var(--line);padding-top:14px">
        <div class="f s6"><label for="cg-nome">Nuova categoria</label><input id="cg-nome" placeholder="es. Spese di cancelleria"></div>
        <div class="f s3"><label for="cg-tipo">Tipo</label><select id="cg-tipo"><option value="uscita">Uscita (costo)</option><option value="entrata">Entrata</option></select></div>
        <div class="f s3"><label>&nbsp;</label><button class="btn gold" type="button" id="cg-add">Aggiungi</button></div></div>`;
    const m = P.modal('Categorie di entrate e costi', corpo, { senzaConferma: true });
    const lista = $('#cg-lista', m.ov);
    const err = $('[data-err]', m.ov);
    const disegna = () => {
      lista.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Categoria</th><th>Tipo</th><th></th></tr></thead><tbody>${cs.cat.map((k) => `<tr>
        <td><b>${esc(k.nome)}</b>${k.attiva ? '' : ' <span class="badge gray">disattivata</span>'}</td><td><span class="badge ${k.tipo === 'entrata' ? 'ok' : 'warn'}">${k.tipo === 'entrata' ? 'Entrata' : 'Uscita'}</span></td>
        <td class="act"><button class="btn ghost small" type="button" data-ren="${esc(k.id)}">Rinomina</button> <button class="btn ghost small" type="button" data-tog="${esc(k.id)}">${k.attiva ? 'Disattiva' : 'Riattiva'}</button></td></tr>`).join('') || '<tr><td colspan="3"><div class="empty">Nessuna categoria.</div></td></tr>'}</tbody></table></div>`;
      $$('[data-ren]', lista).forEach((b) => b.addEventListener('click', async () => {
        const k = cs.cat.find((x) => x.id === b.dataset.ren);
        const nuovo = (window.prompt('Nuovo nome della categoria:', k.nome) || '').trim();
        if (!nuovo || nuovo === k.nome) return;
        await modifica(k.id, { nome: nuovo });
      }));
      $$('[data-tog]', lista).forEach((b) => b.addEventListener('click', async () => {
        const k = cs.cat.find((x) => x.id === b.dataset.tog);
        await modifica(k.id, { attiva: !k.attiva });
      }));
    };
    const ricarica = async () => { cs.cat = chk(await state.sb.from('categorie_movimento').select('*').order('nome')); disegna(); L.route(); };
    const modifica = async (id, dati) => { err.textContent = ''; try { chk(await state.sb.from('categorie_movimento').update(dati).eq('id', id)); await ricarica(); } catch (e) { err.textContent = messaggioErrore(e); } };
    $('#cg-add', m.ov).onclick = async () => {
      err.textContent = '';
      const nome = $('#cg-nome', m.ov).value.trim();
      if (!nome) { err.textContent = 'Scrivi il nome della categoria.'; return; }
      try { chk(await state.sb.from('categorie_movimento').insert({ nome, tipo: $('#cg-tipo', m.ov).value })); $('#cg-nome', m.ov).value = ''; toast('Categoria aggiunta', 'ok'); await ricarica(); }
      catch (e) { err.textContent = messaggioErrore(e); }
    };
    disegna();
  }

  L.tabsPagamenti.push({ id: 'conto', titolo: 'Conto di Loggia', ruoli: ['amministratore', 'venerabile', 'tesoriere'], senzaKpi: true, render });
})();
