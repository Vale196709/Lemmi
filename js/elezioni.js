/* Lemmi - sezione "Elezioni": elezione annuale del Maestro Venerabile e dei Dignitari (artt. 20, 21, 31, 49 del Regolamento). */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, fmtData, isoToIt, itToIso, oggi, IC, mascheraDate } = L;

  const RUOLI = ['amministratore', 'venerabile', 'segretario'];
  const puoGestire = () => RUOLI.includes(state.profilo && state.profilo.ruolo);
  const CARICHE = [
    { k: 'mv', t: 'Maestro Venerabile' }, { k: 's1', t: '1° Sorvegliante' }, { k: 's2', t: '2° Sorvegliante' },
    { k: 'oratore', t: 'Oratore' }, { k: 'tesoriere', t: 'Tesoriere' },
  ];
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const MAIL_GRAN_SEGRETERIA = 'gran.segreteria@grandeoriente.it';

  const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const nomeCompleto = (f) => (f ? f.nome + ' ' + f.cognome : '');
  const elencoNome = (f) => f.cognome + ' ' + f.nome;
  const annoMassonicoPredefinito = () => { const d = new Date(); return d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear(); };

  const el = { anno: annoMassonicoPredefinito(), riga: null, dati: null, frat: [], valut: [], tesoroNoto: false, filtro: '' };

  const datiVuoti = () => ({ data_elezione: null, presenti: '', giustificati: '', votanti: '', segretario: '', votazioni: {} });
  const votazione = (k) => {
    const v = el.dati.votazioni[k] || (el.dati.votazioni[k] = { righe: [], nulli: '' });
    while (v.righe.length < 5) v.righe.push({ n: '', v: '' });
    return v;
  };

  /* ---------- caricamento ---------- */
  async function carica() {
    const sb = state.sb;
    const r = await Promise.all([
      sb.from('fratelli').select('id,cognome,nome,stato').order('cognome').order('nome'),
      sb.from('v_fratelli_completi').select('id,grado_attuale'),
      sb.from('passaggi_grado').select('fratello_id,grado,anno,data'),
      sb.from('cariche_storico').select('fratello_id,carica,anno_dal,anno_al'),
      sb.from('v_scadenze_stato').select('fratello_id,stato,residuo').eq('stato', 'Scaduto'),
      sb.from('elezioni').select('*').eq('anno_massonico', el.anno).maybeSingle(),
    ]);
    try { var rigaEl = chk(r[5]); } catch (e) {
      if (/schema cache|does not exist|Could not find/i.test((e && e.message) || '')) throw new Error('La tabella delle elezioni non è ancora presente: esegui lo script lemmi_elezioni.sql nell\'editor SQL di Supabase.');
      throw e;
    }
    const frat = chk(r[0]);
    const grado = {}; chk(r[1]).forEach((x) => { grado[x.id] = String(x.grado_attuale || '').toLowerCase(); });
    const pass = chk(r[2]), cari = chk(r[3]);
    let scaduti = new Set(); el.tesoroNoto = false;
    try { scaduti = new Set(chk(r[4]).filter((x) => Number(x.residuo) > 0).map((x) => x.fratello_id)); el.tesoroNoto = true; } catch (e) { /* senza accesso: nessun controllo */ }
    el.riga = rigaEl;
    el.dati = Object.assign(datiVuoti(), (rigaEl && rigaEl.dati) || {});
    if (rigaEl && rigaEl.data_elezione) el.dati.data_elezione = rigaEl.data_elezione;
    el.dati.votazioni = el.dati.votazioni || {};
    el.frat = frat.filter((f) => /^attiv/i.test(String(f.stato || '')) || grado[f.id] === 'maestro');
    el.pass = pass; el.cari = cari; el.scaduti = scaduti; el.grado = grado;
    ricalcola();
  }

  /* ---------- regole di eleggibilità ---------- */
  const diffAnni = (a, b) => {
    const da = new Date(a), db = new Date(b);
    let y = db.getFullYear() - da.getFullYear();
    const m = db.getMonth() - da.getMonth();
    if (m < 0 || (m === 0 && db.getDate() < da.getDate())) y--;
    return y;
  };
  const classeCarica = (c) => {
    const n = norm(c);
    if (/gran\b|gran /.test(n) || /aggiunt/.test(n)) return null;
    if (/venerabile/.test(n)) return 'mv';
    if (/sorvegliante|oratore|segretario|tesoriere/.test(n)) return 'dig';
    return null;
  };
  const anniDi = (c) => { const a = []; for (let y = c.anno_dal; y <= (c.anno_al || c.anno_dal); y++) a.push(y); return a; };

  function valuta(f) {
    const E = el.dati.data_elezione || oggi();
    const annoCorr = Number(E.slice(0, 4));
    const o = { f, maestro: el.grado[f.id] === 'maestro', anniM: null, anniDig: 0, consecMv: 0, mv: { ok: true, motivi: [] }, dig: { ok: true, motivi: [] }, avvisi: [] };
    if (!o.maestro) { const m = 'non è Maestro'; o.mv = { ok: false, motivi: [m] }; o.dig = { ok: false, motivi: [m] }; return o; }
    const p = el.pass.filter((x) => x.fratello_id === f.id && String(x.grado).toLowerCase() === 'maestro').map((x) => x.data || (x.anno ? x.anno + '-12-31' : null)).filter(Boolean).sort()[0];
    if (p) {
      o.anniM = diffAnni(p, E);
      if (o.anniM < 1) o.dig.motivi.push('meno di 1 anno da Maestro');
      if (o.anniM < 3) o.mv.motivi.push('meno di 3 anni da Maestro');
    } else o.avvisi.push('data del passaggio a Maestro non registrata: verifica l’anzianità');
    const mie = el.cari.filter((c) => c.fratello_id === f.id);
    const anniDig = new Set(); const anniMv = new Set();
    mie.forEach((c) => { const k = classeCarica(c.carica); if (k) anniDi(c).forEach((y) => anniDig.add(y)); if (k === 'mv') anniDi(c).forEach((y) => anniMv.add(y)); });
    o.anniDig = anniDig.size;
    if (o.anniDig < 1) o.mv.motivi.push('nessun anno come Dignitario');
    let y = anniMv.has(annoCorr) ? annoCorr : (anniMv.has(annoCorr - 1) ? annoCorr - 1 : null);
    while (y !== null && anniMv.has(y)) { o.consecMv++; y--; }
    if (o.consecMv >= 3) o.mv.motivi.push('già ' + o.consecMv + ' mandati consecutivi come Venerabile');
    else if (anniMv.size && !o.consecMv && [...anniMv].some((a) => annoCorr - a < 3)) o.avvisi.push('Venerabile negli ultimi tre anni: verifica il triennio di non rieleggibilità (art. 20)');
    if (el.scaduti.has(f.id)) { const m = 'non in regola con il tesoro'; o.mv.motivi.push(m); o.dig.motivi.push(m); }
    o.mv.ok = o.mv.motivi.length === 0; o.dig.ok = o.dig.motivi.length === 0;
    if (!p && o.mv.ok) o.mv.ok = null;
    if (!p && o.dig.ok) o.dig.ok = null;
    return o;
  }
  function ricalcola() { el.valut = el.frat.filter((f) => el.grado[f.id] === 'maestro').map(valuta); }
  const trovaFratello = (testo) => {
    const t = norm(testo); if (!t) return null;
    return el.frat.find((f) => norm(f.cognome + ' ' + f.nome) === t || norm(f.nome + ' ' + f.cognome) === t) || null;
  };

  /* ---------- votazioni: calcoli ---------- */
  const votanti = () => Math.max(0, parseInt(el.dati.votanti, 10) || 0);
  const maggioranza = () => (votanti() ? Math.floor(votanti() / 2) + 1 : 0);
  function esito(k) {
    const v = votazione(k);
    const righe = v.righe.filter((r) => String(r.n).trim());
    let totale = parseInt(v.nulli, 10) || 0; righe.forEach((r) => { totale += parseInt(r.v, 10) || 0; });
    const ord = righe.map((r) => ({ nome: r.n.trim(), voti: parseInt(r.v, 10) || 0 })).sort((a, b) => b.voti - a.voti);
    const vincitore = ord.length && maggioranza() && ord[0].voti >= maggioranza() && (!ord[1] || ord[1].voti < ord[0].voti) ? ord[0].nome : null;
    return { totale, vincitore, ord };
  }

  /* ---------- persistenza ---------- */
  async function salva(silenzioso) {
    const d = el.dati;
    const riga = { anno_massonico: el.anno, data_elezione: d.data_elezione || null, nulla_osta_data: d.nulla_osta_data || null, dati: d };
    if (el.riga) chk(await state.sb.from('elezioni').update(riga).eq('id', el.riga.id));
    else { const n = chk(await state.sb.from('elezioni').insert(riga).select('*').maybeSingle()); el.riga = n || null; }
    if (!silenzioso) toast('Elezioni salvate', 'ok');
  }

  async function creaTornata() {
    const d = el.dati.data_elezione;
    if (!d) throw new Error('Indica prima la data delle elezioni.');
    const odg = 'Elezione del Maestro Venerabile e dei Dignitari di Loggia (artt. 20, 21 e 31 del Regolamento) · Tornata di Famiglia in terzo grado';
    const gia = chk(await state.sb.from('tornate').select('id,tipo').eq('data', d).in('tipo', ['ordinaria', 'straordinaria']).order('tipo').limit(1));
    let id;
    if (gia.length) { id = gia[0].id; chk(await state.sb.from('tornate').update({ di_famiglia: true, grado: 'maestro', ordine_del_giorno: odg }).eq('id', id)); }
    else {
      const nuova = chk(await state.sb.from('tornate').insert({ data: d, tipo: 'straordinaria', grado: 'maestro', di_famiglia: true, ordine_del_giorno: odg }).select('id').maybeSingle());
      id = nuova && nuova.id;
    }
    if (el.riga && id) chk(await state.sb.from('elezioni').update({ tornata_id: id }).eq('id', el.riga.id));
    return !!gia.length;
  }

  /* ---------- dati per i PDF ---------- */
  async function anagraficheVincitori(fratelli) {
    const ids = fratelli.map((f) => f.id);
    const base = 'id,cognome,nome,data_nascita,indirizzo,cap,citta,provincia,professione,cellulare,email';
    let righe;
    try { righe = chk(await state.sb.from('fratelli').select(base + ',luogo_nascita,provincia_nascita,codice_fiscale').in('id', ids)); }
    catch (e) { righe = chk(await state.sb.from('fratelli').select(base).in('id', ids)); }
    const m = {}; righe.forEach((x) => { m[x.id] = x; });
    return m;
  }
  function schedaAutocert(a) {
    if (!a) return {};
    const via = String(a.indirizzo || '').replace(/^\s*via\s+/i, '').trim();
    return {
      nome: nomeCompleto(a), luogo: [a.luogo_nascita, a.provincia_nascita ? '(' + a.provincia_nascita + ')' : ''].filter(Boolean).join(' '),
      nascita: a.data_nascita ? fmtData(a.data_nascita) : '', citta: [a.cap, a.citta, a.provincia ? '(' + a.provincia + ')' : ''].filter(Boolean).join(' '),
      via: via, tel: a.cellulare || '', email: a.email || '', cf: a.codice_fiscale || '', attivita: a.professione || '',
    };
  }
  const mancanti = (a) => {
    const s = schedaAutocert(a), m = [];
    [['luogo', 'luogo di nascita'], ['nascita', 'data di nascita'], ['citta', 'città'], ['via', 'indirizzo'], ['tel', 'telefono'], ['email', 'e-mail'], ['cf', 'codice fiscale'], ['attivita', 'professione']].forEach(([k, t]) => { if (!s[k]) m.push(t); });
    return m;
  };

  async function generaPdf(btn) {
    const d = el.dati;
    const vinc = {}; const nomi = {};
    for (const c of CARICHE) {
      const e = esito(c.k);
      if (!e.vincitore) throw new Error('Per ' + c.t + ' non risulta ancora un eletto: controlla i voti e la maggioranza assoluta.');
      const f = trovaFratello(e.vincitore);
      if (!f) throw new Error('Per ' + c.t + ' il nome «' + e.vincitore + '» non corrisponde a un Fratello dell’elenco.');
      vinc[c.k] = f; nomi[c.k] = nomeCompleto(f);
    }
    if (new Set(CARICHE.map((c) => vinc[c.k].id)).size < CARICHE.length) throw new Error('Lo stesso Fratello risulta eletto a più cariche: controlla le votazioni.');
    if (!d.data_elezione) throw new Error('Indica la data delle elezioni.');
    if (!d.presenti || !votanti()) throw new Error('Indica i Fratelli presenti e i votanti.');
    await salva(true);
    const anag = await anagraficheVincitori(CARICHE.map((c) => vinc[c.k]));
    const dt = d.data_elezione.split('-');
    const righeDi = (k) => votazione(k).righe.filter((r) => String(r.n).trim()).map((r) => { const f = trovaFratello(r.n); return { nome: f ? nomeCompleto(f) : r.n.trim(), voti: String(parseInt(r.v, 10) || 0) }; });
    const dati = {
      annoMassonico: el.anno, loggia: state.loggia || {}, giorno: String(parseInt(dt[2], 10)), mese: MESI[parseInt(dt[1], 10) - 1], anno2: dt[0].slice(2),
      cariche: Object.assign({}, nomi, { segretario: d.segretario || '' }), presenti: String(d.presenti), giustificati: String(d.giustificati || '0'),
      votanti: String(votanti()), maggioranza: String(maggioranza()),
      mv: { righe: righeDi('mv'), nulli: String(parseInt(votazione('mv').nulli, 10) || 0) },
      dign: {}, proclamati: nomi, autocert: {},
    };
    ['s1', 's2', 'oratore', 'tesoriere'].forEach((k) => { dati.dign[k] = { righe: righeDi(k), nulli: String(parseInt(votazione(k).nulli, 10) || 0) }; });
    CARICHE.forEach((c) => { dati.autocert[c.k] = schedaAutocert(anag[vinc[c.k].id]); });

    const r = await fetch('templates/ELEZIONI.pdf');
    if (!r.ok) throw new Error('Modello templates/ELEZIONI.pdf non trovato.');
    const bytes = await window.LemmiElezioniPdf.compila(new Uint8Array(await r.arrayBuffer()), dati);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'Elezioni_cariche_' + el.anno + '.pdf'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    const manc = CARICHE.map((c) => ({ c: c.t, f: vinc[c.k], m: mancanti(anag[vinc[c.k].id]) })).filter((x) => x.m.length);
    return manc;
  }

  /* ---------- vista ---------- */
  L.viste.elezioni = async function (v) {
    await carica();
    const d = el.dati;
    const E = d.data_elezione;
    const scadConv = E ? new Date(new Date(E).getTime() - 15 * 86400000).toISOString().slice(0, 10) : null;
    const fuoriFinestra = E && (E.slice(5) < '11-15' || E.slice(5) > '12-15');

    v.innerHTML = `
      <div class="page-head"><div><h1>Elezioni delle cariche</h1><p>Maestro Venerabile e Dignitari · anno massonico ${esc(el.anno)}</p></div>
        <div class="right actions"><button class="btn gold" id="e-salva">Salva</button></div></div>
      <div class="notice" style="margin-bottom:14px">Modelli GOI edizione 2024, con l’anno massonico aggiornato. Firme e date restano in bianco: i documenti si stampano e si firmano a mano.</div>
      <div id="e-prep"></div><div id="e-cand"></div><div id="e-voti"></div><div id="e-doc"></div>`;

    /* 1. preparazione */
    $('#e-prep').innerHTML = `<div class="card"><h2>1. Preparazione</h2><div class="form-grid">
      <div class="f s3"><label for="e-anno">Anno massonico</label><input id="e-anno" inputmode="numeric" maxlength="4" value="${esc(el.anno)}"></div>
      <div class="f s4"><label for="e-data">Data della tornata elettorale</label><input id="e-data" value="${esc(isoToIt(E))}" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off"></div>
      <div class="f s5"><label>&nbsp;</label><button class="btn ghost" type="button" id="e-torn">Metti la tornata in Calendario</button></div></div>
      ${E ? `<div class="hint" style="margin-top:8px">Convocazione da spedire entro il <b>${fmtData(scadConv)}</b> (almeno 15 giorni prima, con raccomandata, a mano o e-mail, anche al Presidente del Collegio: art. 31 del Regolamento).</div>
      ${oggi() > scadConv ? '<div class="notice" style="margin-top:8px">La data limite per la convocazione è già passata: verifica i termini.</div>' : ''}
      ${fuoriFinestra ? '<div class="notice" style="margin-top:8px">La data è fuori dal periodo delle elezioni di Loggia (15 novembre - 15 dicembre, art. 49 del Regolamento): verifica il decreto di quest’anno.</div>' : ''}` : '<div class="hint" style="margin-top:8px">Le elezioni di Loggia si tengono di norma tra il 15 novembre e il 15 dicembre (art. 49), in un’unica tornata di terzo grado.</div>'}</div>`;
    $('#e-anno').addEventListener('change', (e) => { const n = parseInt(e.target.value, 10); if (n > 2000 && n < 2100) { el.anno = n; L.route(); } });
    $('#e-data').addEventListener('change', (e) => { const i = itToIso(e.target.value); if (i === 'ERR') return toast('Data non valida: usa gg/mm/aaaa.', 'bad'); d.data_elezione = i; salva(true).then(() => L.route()).catch((er) => toast(messaggioErrore(er), 'bad')); });
    mascheraDate($('#e-prep'));
    $('#e-torn').onclick = async () => {
      try { if (!el.riga) await salva(true); const esisteva = await creaTornata(); toast(esisteva ? 'Tornata già in calendario: segnata come tornata di Famiglia' : 'Tornata creata in Calendario', 'ok'); }
      catch (e) { toast(messaggioErrore(e), 'bad'); }
    };

    /* 2. candidabili */
    const disegnaCand = () => {
      const q = norm(el.filtro);
      const righe = el.valut.filter((x) => !q || norm(x.f.cognome + ' ' + x.f.nome).includes(q));
      const chip = (r, t) => (r.ok === true ? `<span class="badge ok">${t}: sì</span>` : r.ok === null ? `<span class="badge warn">${t}: da verificare</span>` : `<span class="badge bad" title="${esc(r.motivi.join('; '))}">${t}: no</span>`);
      $('#e-cand').innerHTML = `<div class="card"><h2>2. Chi si può eleggere <small>${el.valut.filter((x) => x.mv.ok).length} per Venerabile · ${el.valut.filter((x) => x.dig.ok).length} per Dignitario</small></h2>
        <p class="muted" style="margin-top:0">Venerabile: almeno 3 anni da Maestro e un anno da Dignitario, massimo tre mandati consecutivi (art. 20). Dignitari: almeno un anno da Maestro (art. 21). Elettori e candidati devono essere in regola con il tesoro${el.tesoroNoto ? '' : ' (non posso verificarlo con i tuoi permessi)'}. Restano da controllare a mano le incompatibilità con altre cariche (Giunta, Consiglio dell’Ordine, ecc.).</p>
        <div class="searchbar" style="margin-bottom:10px">${IC.search}<input id="e-q" type="search" placeholder="Cerca un Maestro…" value="${esc(el.filtro)}"></div>
        <div class="table-wrap"><table><thead><tr><th>Maestro</th><th>Da Maestro</th><th>Anni da Dignitario</th><th>Venerabile</th><th>Dignitario</th><th>Note</th></tr></thead><tbody>
        ${righe.length ? righe.map((x) => `<tr><td><b>${esc(elencoNome(x.f))}</b></td><td>${x.anniM === null ? '—' : x.anniM + (x.anniM === 1 ? ' anno' : ' anni')}</td><td>${x.anniDig}</td>
          <td>${chip(x.mv, 'V')}${x.mv.motivi.length ? `<div class="hint">${esc(x.mv.motivi.join('; '))}</div>` : ''}</td><td>${chip(x.dig, 'D')}${x.dig.motivi.length ? `<div class="hint">${esc(x.dig.motivi.join('; '))}</div>` : ''}</td>
          <td class="hint">${esc(x.avvisi.join('; '))}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty">Nessun Maestro trovato.</div></td></tr>'}</tbody></table></div></div>`;
      $('#e-q').addEventListener('input', (e) => { el.filtro = e.target.value; disegnaCand(); const i = $('#e-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
    };
    disegnaCand();

    /* 3. votazioni */
    const maestri = el.valut.map((x) => x.f);
    const datalist = `<datalist id="dl-maestri">${maestri.map((f) => `<option value="${esc(elencoNome(f))}"></option>`).join('')}</datalist>`;
    const bloccoVoti = (c) => {
      const vt = votazione(c.k);
      return `<div class="card" style="margin:12px 0 0;background:var(--surface-2,#fafafa)"><h3 style="margin:0 0 8px">${esc(c.t)} <span class="muted" data-esito="${c.k}"></span></h3><div class="form-grid">
        ${vt.righe.map((r, i) => `<div class="f s8"><label class="muted" style="font-size:.8rem">${i + 1}° Fratello</label><input list="dl-maestri" data-n="${c.k}:${i}" value="${esc(r.n)}" autocomplete="off" placeholder="Cognome e nome"></div>
          <div class="f s4"><label class="muted" style="font-size:.8rem">Voti</label><input data-v="${c.k}:${i}" inputmode="numeric" maxlength="3" value="${esc(r.v)}"></div>`).join('')}
        <div class="f s4"><label class="muted" style="font-size:.8rem">Nulli o dispersi</label><input data-nul="${c.k}" inputmode="numeric" maxlength="3" value="${esc(vt.nulli)}"></div></div></div>`;
    };
    $('#e-voti').innerHTML = `<div class="card"><h2>3. Votazioni</h2>${datalist}
      <p class="muted" style="margin-top:0">Inserisci il risultato dell’ultima votazione per ogni carica (quella in cui qualcuno ha raggiunto la maggioranza assoluta). Il Segretario non si elegge: lo nomina il Venerabile. Il modello prevede fino a cinque Fratelli per carica.</p>
      <div class="form-grid">
        <div class="f s4"><label for="e-pres">Fratelli presenti</label><input id="e-pres" inputmode="numeric" maxlength="3" value="${esc(d.presenti)}"></div>
        <div class="f s4"><label for="e-giu">Assenti giustificati</label><input id="e-giu" inputmode="numeric" maxlength="3" value="${esc(d.giustificati)}"></div>
        <div class="f s4"><label for="e-vot">Votanti</label><input id="e-vot" inputmode="numeric" maxlength="3" value="${esc(d.votanti)}"></div></div>
      <div class="hint" id="e-magg" style="margin:6px 0 4px"></div>
      ${CARICHE.map(bloccoVoti).join('')}</div>`;
    const aggiornaEsiti = () => {
      $('#e-magg').innerHTML = votanti() ? `Maggioranza assoluta: <b>${maggioranza()}</b> voti su ${votanti()} votanti.` : 'Indica i votanti per calcolare la maggioranza assoluta.';
      CARICHE.forEach((c) => {
        const e = esito(c.k); const n = votazione(c.k).righe.some((r) => String(r.n).trim());
        const t = $(`[data-esito="${c.k}"]`); if (!t) return;
        const f = e.vincitore ? trovaFratello(e.vincitore) : null;
        const val = f ? el.valut.find((x) => x.f.id === f.id) : null;
        const inel = val && !(c.k === 'mv' ? val.mv : val.dig).ok && (c.k === 'mv' ? val.mv : val.dig).ok !== null ? ' · attenzione: ' + (c.k === 'mv' ? val.mv : val.dig).motivi.join('; ') : '';
        t.textContent = !n ? '' : e.vincitore ? '→ eletto: ' + e.vincitore + ' (schede: ' + e.totale + (votanti() && e.totale !== votanti() ? ', ma i votanti sono ' + votanti() : '') + ')' + inel : '→ nessuno ha ancora la maggioranza assoluta: serve un’altra votazione';
      });
    };
    $('#e-voti').addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'e-pres') d.presenti = t.value; else if (t.id === 'e-giu') d.giustificati = t.value; else if (t.id === 'e-vot') d.votanti = t.value;
      else if (t.dataset.n) { const [k, i] = t.dataset.n.split(':'); votazione(k).righe[i].n = t.value; }
      else if (t.dataset.v) { const [k, i] = t.dataset.v.split(':'); votazione(k).righe[i].v = t.value.replace(/\D/g, ''); t.value = votazione(k).righe[i].v; }
      else if (t.dataset.nul) { votazione(t.dataset.nul).nulli = t.value.replace(/\D/g, ''); t.value = votazione(t.dataset.nul).nulli; }
      aggiornaEsiti();
    });
    aggiornaEsiti();

    /* 4. documenti */
    $('#e-doc').innerHTML = `<div class="card"><h2>4. Documenti da inviare</h2>
      <div class="form-grid"><div class="f s6"><label for="e-seg">Segretario che redige il verbale</label><input id="e-seg" list="dl-maestri" value="${esc(d.segretario)}" placeholder="Cognome e nome" autocomplete="off"></div></div>
      <p class="muted">Il pacchetto contiene il processo verbale (pagine 1-3, con la pagina delle firme dei Maestri presenti) e le autocertificazioni del Maestro Venerabile e dei Dignitari (pagine 4-5), compilate con i dati dell’anagrafica. Dopo le firme, il verbale va inviato a <b>${MAIL_GRAN_SEGRETERIA}</b> per ottenere il Nulla Osta all’insediamento.</p>
      <div class="actions"><button class="btn gold" id="e-pdf">${IC.pdf || ''} Genera il pacchetto PDF</button></div>
      <div id="e-pdf-esito"></div>
      <h3 style="margin:18px 0 6px">Nulla Osta</h3><div class="form-grid"><div class="f s4"><label for="e-no">Ricevuto il</label><input id="e-no" value="${esc(isoToIt(d.nulla_osta_data))}" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off"></div></div></div>`;
    mascheraDate($('#e-doc'));
    $('#e-seg').addEventListener('input', (e) => { d.segretario = e.target.value; });
    $('#e-no').addEventListener('change', (e) => { const i = itToIso(e.target.value); if (i === 'ERR') return toast('Data non valida: usa gg/mm/aaaa.', 'bad'); d.nulla_osta_data = i; });
    $('#e-pdf').onclick = async (ev) => {
      const b = ev.currentTarget; b.disabled = true; $('#e-pdf-esito').innerHTML = '';
      try {
        const manc = await generaPdf(b);
        $('#e-pdf-esito').innerHTML = `<div class="notice" style="margin-top:10px">PDF generato. Stampa, fai firmare e invia a ${MAIL_GRAN_SEGRETERIA}.</div>` +
          (manc.length ? `<div class="notice" style="margin-top:8px"><b>Dati mancanti in anagrafica</b> (da completare a mano sul modulo o nella scheda del Fratello):<br>${manc.map((x) => esc(x.c + ' ' + nomeCompleto(x.f) + ': ' + x.m.join(', '))).join('<br>')}</div>` : '');
      } catch (e) { $('#e-pdf-esito').innerHTML = `<div class="notice" style="margin-top:10px;background:var(--bad-soft,#fde8e8);color:var(--bad,#a12)">${esc(messaggioErrore(e))}</div>`; }
      b.disabled = false;
    };
    $('#e-salva').onclick = async () => { try { await salva(false); } catch (e) { toast(messaggioErrore(e), 'bad'); } };
  };
})();
