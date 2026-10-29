/* Lemmi - Pratiche: una procedura avviata per una persona, con passi salvati nel database,
 * date di partenza e scadenze calcolate (Regolamento dell'Ordine, artt. 3, 8/ter, 10, 13, 15; Regolamento della segreteria, art. 7).
 * Richiede lo script sql/lemmi_pratiche.sql. Se le tabelle non esistono, l'app resta com'era. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, toast, fmtData, oggi } = L;
  const sb = () => state.sb;
  const ruolo = () => (state.profilo && state.profilo.ruolo) || '';
  const scrive = () => ['segretario', 'amministratore'].includes(ruolo());
  const vede = () => ['segretario', 'amministratore', 'venerabile'].includes(ruolo());

  /* ---------- calcolo delle date ---------- */
  const valida = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || '');
  const parse = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const fmt = (dt) => dt.toISOString().slice(0, 10);
  const addG = (iso, n) => { const d = parse(iso); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
  const addM = (iso, n) => {
    const d = parse(iso); const g = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
    const ult = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(g, ult)); return fmt(d);
  };
  const giorniA = (iso) => Math.round((parse(iso) - parse(oggi())) / 86400000);

  const DEF = {
    bussante: {
      rif: 'bussante',
      date: [
        { k: 'c1', l: 'Invio del C/1 al Collegio' },
        { k: 'v1', l: 'Prima votazione' },
        { k: 'contrari', l: 'Voti contrari alla prima votazione', num: true },
        { k: 'v2', l: 'Seconda votazione' },
      ],
      calc(d) {
        const it = []; const av = [];
        if (valida(d.c1)) {
          const min = addG(d.c1, 60);
          it.push({ k: 'v1min', l: 'Prima votazione: non prima del', data: min, tipo: 'dal', passo: 5 });
          it.push({ k: 'aff', l: 'Affissione al Collegio: almeno fino al', data: addG(d.c1, 30), tipo: 'dal', passo: 2 });
          it.push({ k: 'comm', l: 'Relazione dei commissari: entro il', data: addG(d.c1, 30), tipo: 'entro', passo: 3 });
          if (valida(d.v1) && d.v1 < min) av.push('La prima votazione è prima dei 60 giorni di preavviso dall’invio del C/1.');
        }
        const n = d.contrari === undefined || d.contrari === '' ? null : Number(d.contrari);
        if (valida(d.v1) && n !== null && !isNaN(n) && n > 0) {
          const mesi = n <= 2 ? 3 : (n === 3 ? 6 : 12);
          const min2 = addM(d.v1, mesi);
          it.push({ k: 'v2min', l: `Seconda votazione (${n} ${n === 1 ? 'voto contrario' : 'voti contrari'}): non prima del`, data: min2, tipo: 'dal', passo: 7 });
          if (valida(d.v2) && d.v2 < min2) av.push(`La seconda votazione è prima dei ${mesi} mesi richiesti dopo la prima.`);
        }
        if (valida(d.v2)) it.push({ k: 'v2com', l: 'Comunicare la data della seconda votazione a Collegio e Gran Segreteria: entro il', data: addG(d.v2, -30), tipo: 'entro', passo: 6 });
        return { it, av };
      },
    },
    grado: {
      rif: 'fratello',
      date: [
        { k: 'anz', l: 'Iniziazione o ultimo passaggio di grado' },
        { k: 'vot', l: 'Votazione in Loggia' },
        { k: 'cer', l: 'Cerimonia' },
      ],
      calc(d) {
        const it = []; const av = [];
        if (valida(d.anz)) {
          const min = addM(d.anz, 12);
          it.push({ k: 'anno', l: 'Proposta possibile dal (un anno nel grado)', data: min, tipo: 'dal', passo: 0 });
          if (valida(d.vot) && d.vot < min) av.push('La votazione è prima di un anno di permanenza nel grado: serve il Nulla Osta per l’abbreviazione dei termini (art. 10 Cost.).');
        }
        return { it, av };
      },
    },
    exeat: {
      rif: 'fratello',
      date: [{ k: 'rich', l: 'Ricezione della richiesta di Exeat da parte della Loggia di provenienza' }, { k: 'ex', l: 'Data dell’Exeat' }],
      calc(d) {
        const it = [];
        if (valida(d.rich)) it.push({ k: 'conc', l: 'Exeat considerato concesso (se nessuna risposta) dal', data: addG(d.rich, 30), tipo: 'dal', passo: 3 });
        return { it, av: [] };
      },
    },
    consegne: {
      rif: null,
      date: [{ k: 'eff', l: 'Efficacia della nomina del nuovo Segretario' }, { k: 'cons', l: 'Data effettiva della consegna' }],
      calc(d) {
        const it = []; const av = [];
        if (valida(d.eff)) {
          const lim = addG(d.eff, 20);
          it.push({ k: 'vent', l: 'Consegna ordinata dell’archivio: entro il', data: lim, tipo: 'entro', passo: 4 });
          if (valida(d.cons) && d.cons > lim) av.push('La consegna è oltre i 20 giorni previsti dal manuale della Loggia.');
        }
        return { it, av };
      },
    },
  };
  const nomeProc = (k) => (L.PROCEDURE && L.PROCEDURE[k] ? L.PROCEDURE[k].t : k);
  const passiTot = (k) => (L.PROCEDURE && L.PROCEDURE[k] ? L.PROCEDURE[k].s.length : 0);
  const passoTitolo = (k, i) => (L.PROCEDURE && L.PROCEDURE[k] && L.PROCEDURE[k].s[i] ? L.PROCEDURE[k].s[i].t : '');

  /* ---------- caricamento ---------- */
  async function caricaTutto(soloAperte) {
    let q = sb().from('pratiche').select('*').order('creata_il', { ascending: false });
    if (soloAperte) q = q.eq('stato', 'in_corso');
    const pr = chk(await q);
    if (!pr.length) return [];
    const ids = pr.map((p) => p.id);
    const [pa, da] = await Promise.all([
      sb().from('pratiche_passi').select('pratica_id,indice').in('pratica_id', ids),
      sb().from('pratiche_date').select('pratica_id,chiave,valore').in('pratica_id', ids),
    ]);
    const passi = chk(pa), date = chk(da);
    return pr.map((p) => {
      const fatti = new Set(passi.filter((x) => x.pratica_id === p.id).map((x) => x.indice));
      const d = {}; date.filter((x) => x.pratica_id === p.id).forEach((x) => { d[x.chiave] = x.valore; });
      const def = DEF[p.procedura];
      return { p, fatti, d, calc: def ? def.calc(d) : { it: [], av: [] } };
    });
  }

  const scadenzeDi = (lista) => {
    const o = oggi(); const out = [];
    lista.filter((x) => x.p.stato === 'in_corso').forEach((x) => x.calc.it.forEach((s) => {
      if (x.fatti.has(s.passo)) return;
      if (s.tipo === 'entro' || s.data >= o) out.push(Object.assign({ pr: x.p }, s));
    }));
    return out.sort((a, b) => a.data.localeCompare(b.data));
  };
  const badgeScad = (s) => {
    const g = giorniA(s.data);
    if (s.tipo === 'entro' && g < 0) return '<span class="badge bad">Scaduta</span>';
    if (g === 0) return '<span class="badge warn">Oggi</span>';
    if (g > 0 && g <= 7) return `<span class="badge warn">tra ${g} ${g === 1 ? 'giorno' : 'giorni'}</span>`;
    return g > 0 ? `<span class="badge">tra ${g} giorni</span>` : '';
  };
  const righeScad = (sc, conPratica) => `<div class="table-wrap"><table><tbody>${sc.map((s) => `
    <tr class="click" data-go="#/procedure/${esc(s.pr.procedura)}/${esc(s.pr.id)}"><td><b>${fmtData(s.data)}</b></td>
    <td>${esc(s.l)}${conPratica ? `<div class="muted">${esc(s.pr.titolo)}</div>` : ''}</td><td>${badgeScad(s)}</td></tr>`).join('')}</tbody></table></div>`;
  const collega = (root) => $$('[data-go]', root).forEach((r) => { if (!r.dataset.gov) { r.dataset.gov = '1'; r.addEventListener('click', () => { location.hash = r.dataset.go; }); } });

  /* ---------- avvio di una pratica ---------- */
  const TIPO_DOM = { iniziazione: 'Iniziazione', riammissione: 'Riammissione', regolarizzazione: 'Regolarizzazione' };
  async function avvia(k, pre) {
    const def = DEF[k]; if (!def || !scrive()) return;
    let persone = [];
    try {
      if (def.rif === 'bussante') persone = chk(await sb().from('bussanti').select('id,cognome,nome,tipo_domanda,data_comunicazione_collegio,data_prima_votazione,data_seconda_votazione').order('cognome'));
      else if (def.rif === 'fratello') persone = (await L.caricaFratelli()).map((f) => ({ id: f.id, cognome: f.cognome, nome: f.nome }));
    } catch (e) { toast(L.messaggioErrore(e), 'bad'); return; }
    const ov = document.createElement('div'); ov.className = 'modal-ov';
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Avvia pratica">
      <div class="modal-h"><h2>Avvia pratica: ${esc(nomeProc(k))}</h2><button class="btn ghost small" type="button" data-x>Chiudi</button></div>
      <div class="modal-b"><div class="form-grid">
        ${def.rif ? `<div class="f s12"><label for="pa-p">${def.rif === 'bussante' ? 'Bussante' : 'Fratello'}</label><select id="pa-p"><option value="">— scegli —</option>${persone.map((x) => `<option value="${esc(x.id)}">${esc(x.cognome)} ${esc(x.nome)}</option>`).join('')}</select></div>` : ''}
        <div class="f s12"><label for="pa-t">Titolo della pratica</label><input id="pa-t"></div></div>
        <div class="actions" style="margin-top:14px"><button class="btn gold" type="button" id="pa-ok">Avvia</button><button class="btn ghost" type="button" data-x>Annulla</button></div>
      </div></div>`;
    document.body.appendChild(ov);
    const chiudi = () => ov.remove();
    $$('[data-x]', ov).forEach((b) => { b.onclick = chiudi; });
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) chiudi(); });
    const sel = $('#pa-p', ov); const tit = $('#pa-t', ov);
    let toccato = false;
    const titoloDi = () => {
      const x = sel ? persone.find((z) => String(z.id) === sel.value) : null;
      const nome = x ? `${x.nome} ${x.cognome}` : '';
      if (k === 'bussante') return x ? `${TIPO_DOM[x.tipo_domanda] || 'Pratica'} di ${nome}` : '';
      if (k === 'grado') return x ? `Passaggio di grado di ${nome}` : '';
      if (k === 'exeat') return x ? `Exeat di ${nome}` : '';
      return `Consegne tra segretari ${new Date().getFullYear()}`;
    };
    tit.addEventListener('input', () => { toccato = true; });
    if (sel) sel.addEventListener('change', () => { if (!toccato) tit.value = titoloDi(); });
    if (sel && pre && pre.rif_id) sel.value = String(pre.rif_id);
    tit.value = titoloDi();
    $('#pa-ok', ov).onclick = async () => {
      const x = sel ? persone.find((z) => String(z.id) === sel.value) : null;
      if (def.rif && !x) { toast('Scegli la persona.', 'bad'); return; }
      const titolo = tit.value.trim(); if (!titolo) { toast('Scrivi un titolo.', 'bad'); return; }
      const btn = $('#pa-ok', ov); btn.disabled = true;
      try {
        const r = chk(await sb().from('pratiche').insert({
          procedura: k, titolo, rif_tipo: def.rif, rif_id: x ? String(x.id) : null, rif_nome: x ? `${x.cognome} ${x.nome}` : null,
        }).select('id').single());
        if (k === 'bussante' && x) {
          const righe = [['c1', x.data_comunicazione_collegio], ['v1', x.data_prima_votazione], ['v2', x.data_seconda_votazione]]
            .filter((a) => valida(a[1])).map((a) => ({ pratica_id: r.id, chiave: a[0], valore: a[1] }));
          if (righe.length) chk(await sb().from('pratiche_date').insert(righe));
        }
        chiudi(); location.hash = `#/procedure/${k}/${r.id}`;
      } catch (e) { btn.disabled = false; toast(L.messaggioErrore(e), 'bad'); }
    };
    (sel || tit).focus();
  }

  /* ---------- una pratica nella pagina Procedure ---------- */
  const campoHtml = (f, val, dis) => `<div class="f s4"><label for="pd-${f.k}">${esc(f.l)}</label>${f.num
    ? `<input id="pd-${f.k}" data-k="${f.k}" inputmode="numeric" maxlength="2" value="${esc(val || '')}" ${dis ? 'disabled' : ''}>`
    : `<input id="pd-${f.k}" data-k="${f.k}" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off" value="${esc(L.isoToIt(val))}" ${dis ? 'disabled' : ''}>`}</div>`;

  async function contesto(id) {
    let p;
    try { p = chk(await sb().from('pratiche').select('*').eq('id', id).maybeSingle()); } catch (e) { return null; }
    if (!p || !DEF[p.procedura]) return null;
    const [pa, da] = await Promise.all([
      sb().from('pratiche_passi').select('indice').eq('pratica_id', id),
      sb().from('pratiche_date').select('chiave,valore').eq('pratica_id', id),
    ]);
    let cur = new Set(chk(pa).map((x) => x.indice));
    const d = {}; chk(da).forEach((x) => { d[x.chiave] = x.valore; });
    const def = DEF[p.procedura];
    const apertaSc = scrive() && p.stato === 'in_corso';
    const ctx = {
      procedura: p.procedura, scrive: apertaSc, fatti: Array.from(cur), titolo: p.titolo, testa: '',
      sottotitolo: `<a href="#/procedure/${esc(p.procedura)}">← Tutte le procedure</a> · ${esc(nomeProc(p.procedura))} · <span class="badge ${p.stato === 'in_corso' ? 'gold' : (p.stato === 'conclusa' ? 'ok' : '')}">${p.stato === 'in_corso' ? 'In corso' : (p.stato === 'conclusa' ? 'Conclusa' : 'Annullata')}</span>${p.rif_id ? ` · <a href="${p.rif_tipo === 'bussante' ? '#/bussanti/' + esc(p.rif_id) : '#/fratelli'}">${p.rif_tipo === 'bussante' ? 'Scheda del bussante' : 'Anagrafica dei Fratelli'}</a>` : ''}`,
      pannello: `<div class="card" id="pr-pannello"><h2>Date della pratica</h2>
        <div class="form-grid">${def.date.map((f) => campoHtml(f, d[f.k], !apertaSc)).join('')}</div>
        ${apertaSc ? '<div class="actions" style="margin-top:10px"><button class="btn gold" type="button" id="pr-salva">Salva date</button></div>' : ''}
        <h2 style="margin-top:18px">Scadenze calcolate</h2><div id="pr-scad"></div>
        ${scrive() ? `<div class="actions" style="margin-top:14px">${p.stato === 'in_corso'
          ? '<button class="btn ghost small" type="button" data-st="conclusa">Segna come conclusa</button><button class="btn ghost small" type="button" data-st="annullata">Annulla la pratica</button>'
          : '<button class="btn ghost small" type="button" data-st="in_corso">Riapri la pratica</button>'}</div>` : ''}</div>`,
      async salva(arr) {
        const nuovi = arr.filter((i) => !cur.has(i)); const tolti = Array.from(cur).filter((i) => !arr.includes(i));
        try {
          if (tolti.length) chk(await sb().from('pratiche_passi').delete().eq('pratica_id', id).in('indice', tolti));
          if (nuovi.length) chk(await sb().from('pratiche_passi').insert(nuovi.map((i) => ({ pratica_id: id, indice: i }))));
          cur = new Set(arr);
          if (ctx.disegnaScad) ctx.disegnaScad();
        } catch (e) { toast(L.messaggioErrore(e), 'bad'); }
      },
      monta(v) {
        L.mascheraDate(v);
        ctx.disegnaScad = () => {
          const c = def.calc(d); const el = $('#pr-scad', v); if (!el) return;
          const it = c.it.filter((s) => !cur.has(s.passo));
          el.innerHTML = (c.av.length ? c.av.map((a) => `<div class="notice warn">${esc(a)}</div>`).join('') : '')
            + (it.length ? `<div class="table-wrap"><table><tbody>${it.map((s) => `<tr><td><b>${fmtData(s.data)}</b></td><td>${esc(s.l)}<div class="muted">Passo ${s.passo + 1}: ${esc(passoTitolo(p.procedura, s.passo))}</div></td><td>${badgeScad(s)}</td></tr>`).join('')}</tbody></table></div>`
              : '<div class="empty">Inserisci le date di partenza per vedere le scadenze.</div>');
        };
        ctx.disegnaScad();
        const bs = $('#pr-salva', v);
        if (bs) bs.onclick = async () => {
          const righe = []; const via = [];
          for (const f of def.date) {
            const raw = $('#pd-' + f.k, v).value.trim();
            let val = '';
            if (raw) {
              if (f.num) { if (!/^\d{1,2}$/.test(raw)) { toast(`${f.l}: scrivi un numero.`, 'bad'); return; } val = raw; }
              else { const iso = L.itToIso(raw); if (iso === 'ERR') { toast(`${f.l}: data non valida (gg/mm/aaaa).`, 'bad'); return; } val = iso; }
            }
            if (val) righe.push({ pratica_id: id, chiave: f.k, valore: val }); else via.push(f.k);
          }
          try {
            if (righe.length) chk(await sb().from('pratiche_date').upsert(righe, { onConflict: 'pratica_id,chiave' }));
            if (via.length) chk(await sb().from('pratiche_date').delete().eq('pratica_id', id).in('chiave', via));
            Object.keys(d).forEach((k2) => delete d[k2]); righe.forEach((r) => { d[r.chiave] = r.valore; });
            ctx.disegnaScad(); toast('Date salvate.', 'ok');
          } catch (e) { toast(L.messaggioErrore(e), 'bad'); }
        };
        $$('[data-st]', v).forEach((b) => b.addEventListener('click', async () => {
          const st = b.dataset.st;
          if (st === 'annullata' && !confirm('Annullare questa pratica?')) return;
          try {
            chk(await sb().from('pratiche').update({ stato: st, chiusa_il: st === 'in_corso' ? null : new Date().toISOString() }).eq('id', id));
            L.route();
          } catch (e) { toast(L.messaggioErrore(e), 'bad'); }
        }));
      },
    };
    return ctx;
  }

  /* ---------- blocco nella guida di una procedura ---------- */
  async function blocco(k) {
    if (!DEF[k] || !vede()) return '';
    let lista;
    try { lista = await caricaTutto(true); } catch (e) { return ''; }
    lista = lista.filter((x) => x.p.procedura === k);
    const tot = passiTot(k);
    return `<div class="card" id="pr-blocco" style="margin:0 0 14px"><div class="actions" style="justify-content:space-between;flex-wrap:wrap">
      <h2 style="margin:0">Pratiche in corso: ${esc(nomeProc(k))}</h2>${scrive() ? '<button class="btn gold" type="button" id="pr-avvia">Avvia una pratica</button>' : ''}</div>
      ${lista.length ? `<div class="table-wrap"><table><tbody>${lista.map((x) => `<tr class="click" data-go="#/procedure/${esc(k)}/${esc(x.p.id)}"><td><b>${esc(x.p.titolo)}</b></td><td>${x.fatti.size} di ${tot} passi</td><td>${esc(prossimo(k, x.fatti))}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="muted" style="margin-top:8px">Nessuna pratica avviata. Questa pagina resta una guida: le spunte sono solo sul tuo browser.</div>'}</div>`;
  }
  const prossimo = (k, fatti) => {
    const n = passiTot(k);
    for (let i = 0; i < n; i++) if (!fatti.has(i)) return 'Prossimo: ' + passoTitolo(k, i);
    return 'Tutti i passi fatti';
  };

  function monta(v, k, pr) {
    if (pr) { pr.monta(v); return; }
    collega(v);
    const b = $('#pr-avvia', v); if (b) b.onclick = () => avvia(k);
  }

  /* ---------- Cruscotto ---------- */
  L.cruscottoExtra = L.cruscottoExtra || [];
  L.cruscottoExtra.unshift(async (v) => {
    if (!vede()) return;
    let lista;
    try { lista = await caricaTutto(true); } catch (e) { return; }
    if (!lista.length && !scrive()) return;
    const tutte = scadenzeDi(lista), sc = tutte.slice(0, 3);
    const cardPratiche = `<div class="card compact"><h2>Pratiche in corso${lista.length > 3 ? ` <small>${lista.length} in totale · <a href="#/procedure">tutte</a></small>` : ''}</h2>${lista.length ? `<div class="table-wrap"><table><tbody>${lista.slice(0, 3).map((x) => `
        <tr class="click" data-go="#/procedure/${esc(x.p.procedura)}/${esc(x.p.id)}"><td><b>${esc(x.p.titolo)}</b><div class="muted">${esc(prossimo(x.p.procedura, x.fatti))}</div></td><td>${x.fatti.size} di ${passiTot(x.p.procedura)}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty">Nessuna pratica in corso. Puoi avviarne una dalla sezione Procedure.</div>'}</div>`;
    const cardScad = `<div class="card compact"><h2>Prossime scadenze${tutte.length > 3 ? ` <small>${tutte.length} in totale · <a href="#/calendario">calendario</a></small>` : ''}</h2>${sc.length ? righeScad(sc, true) : '<div class="empty">Nessuna scadenza calcolata. Inserisci le date nelle pratiche.</div>'}</div>`;
    const dest = $('#seg-cr', v);
    if (dest) { dest.insertAdjacentHTML('beforeend', cardPratiche + cardScad); collega(dest); return; }
    const sez = document.createElement('section'); sez.id = 'pratiche-cr'; sez.style.marginTop = '28px';
    sez.innerHTML = `<div class="grid cols-2">${cardPratiche}${cardScad}</div>`;
    v.appendChild(sez); collega(sez);
  });

  /* ---------- Calendario ---------- */
  const calOrig = L.viste.calendario;
  if (calOrig) {
    L.viste.calendario = async function (v, parti) {
      await calOrig.call(this, v, parti);
      try {
        if (!vede()) return;
        const sc = scadenzeDi(await caricaTutto(true)).slice(0, 10);
        const corpo = $('#c-corpo', v);
        if (!sc.length || !corpo) return;
        corpo.insertAdjacentHTML('beforebegin', `<div class="card" style="margin-bottom:14px"><h2>Scadenze delle pratiche</h2>${righeScad(sc, true)}</div>`);
        collega(v);
      } catch (e) { /* facoltativo */ }
    };
  }

  /* ---------- scheda del bussante ---------- */
  L.bussanteExtra = L.bussanteExtra || [];
  L.bussanteExtra.push(async (v, id) => {
    if (!vede()) return;
    let lista;
    try { lista = (await caricaTutto(false)).filter((x) => x.p.rif_tipo === 'bussante' && x.p.rif_id === String(id) && x.p.stato !== 'annullata'); } catch (e) { return; }
    const sez = document.createElement('div'); sez.className = 'card'; sez.style.marginTop = '14px';
    sez.innerHTML = `<div class="actions" style="justify-content:space-between;flex-wrap:wrap"><h2 style="margin:0">Pratica e procedura</h2>${scrive() && !lista.some((x) => x.p.stato === 'in_corso') ? '<button class="btn gold" type="button" id="pr-avvia-b">Avvia la pratica</button>' : ''}</div>
      ${lista.length ? `<div class="table-wrap"><table><tbody>${lista.map((x) => `<tr class="click" data-go="#/procedure/${esc(x.p.procedura)}/${esc(x.p.id)}"><td><b>${esc(x.p.titolo)}</b></td><td>${x.p.stato === 'conclusa' ? 'Conclusa' : x.fatti.size + ' di ' + passiTot(x.p.procedura) + ' passi'}</td><td>${x.p.stato === 'in_corso' ? esc(prossimo(x.p.procedura, x.fatti)) : ''}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="muted" style="margin-top:8px">Nessuna procedura avviata per questa persona.</div>'}`;
    v.appendChild(sez); collega(sez);
    const b = $('#pr-avvia-b', sez); if (b) b.onclick = () => avvia('bussante', { rif_id: id });
  });

  L.pratiche = { contesto, blocco, monta, avvia };
})();
