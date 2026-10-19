/* Lemmi - Fratelli: elenco ordinabile e scheda del singolo Fratello con la sua storia. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L || !L.pagamenti || !L.storia) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, fmtData, itToIso, canEdit, isAdmin, IC, campo } = L;
  const P = L.pagamenti;

  const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
  const GRADI = ['apprendista', 'compagno', 'maestro'];
  const RANGO = { apprendista: 1, compagno: 2, maestro: 3 };
  const rango = (g) => RANGO[String(g || '').toLowerCase()] || 0;

  const COLONNE = [
    { id: 'matricola', t: 'Matricola', v: (x) => x.matricola || '' },
    { id: 'nominativo', t: 'Nominativo', v: (x) => x.cognome + ' ' + x.nome },
    { id: 'stato', t: 'Stato', v: (x) => x.stato || '' },
    { id: 'grado', t: 'Grado', v: (x) => rango(x.grado_attuale), numerica: true },
    { id: 'carica', t: 'Carica attuale', v: (x) => x.carica_attuale || '' },
    { id: 'citta', t: 'Città', v: (x) => x.citta || '' },
    { id: 'contatti', t: 'Contatti', v: (x) => x.cellulare || x.email || '' },
  ];
  const lista = { righe: [], sort: { col: 'nominativo', dir: 1 }, q: '', stato: '', grado: '' };

  function ordina(righe) {
    const c = COLONNE.find((x) => x.id === lista.sort.col) || COLONNE[1];
    const dir = lista.sort.dir;
    return righe.slice().sort((a, b) => {
      const va = c.v(a), vb = c.v(b);
      const vuotoA = va === '' || va === 0, vuotoB = vb === '' || vb === 0;
      if (vuotoA !== vuotoB) return vuotoA ? 1 : -1;               // i valori vuoti stanno sempre in fondo
      const r = c.numerica ? va - vb : String(va).localeCompare(String(vb), 'it', { numeric: true, sensitivity: 'base' });
      return r * dir || (a.cognome + a.nome).localeCompare(b.cognome + b.nome, 'it');
    });
  }

  /* ---------- elenco ---------- */
  async function vistaLista(v) {
    lista.righe = chk(await state.sb.from('v_fratelli_completi')
      .select('id,cognome,nome,matricola,stato,grado_attuale,carica_attuale,citta,email,cellulare').order('cognome').order('nome'));
    const stati = Array.from(new Set(lista.righe.map((x) => x.stato).filter(Boolean))).sort();
    v.innerHTML = `
      <div class="page-head"><div><h1>Fratelli</h1><p>Anagrafica della Loggia · clicca su un nome per aprire la scheda</p></div></div>
      <div class="actions" style="margin-bottom:14px"><div class="searchbar">${IC.search}<input id="q" type="search" placeholder="Cerca per cognome, nome, matricola o città…" value="${esc(lista.q)}"></div>
        <select id="f-stato" style="width:auto"><option value="">Tutti gli stati</option>${P.opzioni(stati.map((s) => ({ v: s, t: cap(s) })), lista.stato)}</select>
        <select id="f-grado" style="width:auto"><option value="">Tutti i gradi</option>${P.opzioni(GRADI.map((g) => ({ v: g, t: cap(g) })), lista.grado)}</select>
        <span class="muted" id="conta"></span></div>
      <div class="table-wrap"><table><thead><tr>${COLONNE.map((c) => `<th class="sort" data-col="${c.id}" role="button" tabindex="0" title="Clicca per ordinare">${c.t} <span class="arr"></span></th>`).join('')}</tr></thead><tbody id="righe"></tbody></table></div>`;
    const disegna = () => {
      const q = lista.q.trim().toLowerCase();
      const f = ordina(lista.righe.filter((x) => (!q || [x.cognome, x.nome, x.matricola, x.citta].join(' ').toLowerCase().includes(q))
        && (!lista.stato || x.stato === lista.stato) && (!lista.grado || String(x.grado_attuale || '').toLowerCase() === lista.grado)));
      $('#conta').textContent = f.length + ' di ' + lista.righe.length;
      $$('th.sort', v).forEach((th) => {
        const attiva = th.dataset.col === lista.sort.col;
        $('.arr', th).textContent = attiva ? (lista.sort.dir === 1 ? '▲' : '▼') : '';
        th.setAttribute('aria-sort', attiva ? (lista.sort.dir === 1 ? 'ascending' : 'descending') : 'none');
      });
      $('#righe').innerHTML = f.length ? f.map((x) => `<tr><td>${esc(x.matricola) || '—'}</td>
        <td><a class="nome" href="#/fratelli/${esc(x.id)}">${esc(x.cognome)} ${esc(x.nome)}</a></td>
        <td><span class="badge ${x.stato === 'attivo' ? 'ok' : 'gray'}">${esc(cap(x.stato)) || '—'}</span></td>
        <td>${esc(cap(x.grado_attuale)) || '—'}</td><td>${esc(x.carica_attuale) || '—'}</td><td>${esc(x.citta) || '—'}</td>
        <td>${esc(x.cellulare || x.email) || '—'}</td></tr>`).join('') : '<tr><td colspan="7"><div class="empty">Nessun risultato.</div></td></tr>';
    };
    const ordinaPer = (id) => { lista.sort = { col: id, dir: lista.sort.col === id ? -lista.sort.dir : 1 }; disegna(); };
    $$('th.sort', v).forEach((th) => {
      th.addEventListener('click', () => ordinaPer(th.dataset.col));
      th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ordinaPer(th.dataset.col); } });
    });
    $('#q').addEventListener('input', (e) => { lista.q = e.target.value; disegna(); });
    $('#f-stato').addEventListener('change', (e) => { lista.stato = e.target.value; disegna(); });
    $('#f-grado').addEventListener('change', (e) => { lista.grado = e.target.value; disegna(); });
    disegna();
  }

  /* ---------- scheda del Fratello ---------- */
  const eta = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    const oggi = new Date(); let a = oggi.getFullYear() - Number(m[1]);
    if (oggi.getMonth() + 1 < Number(m[2]) || (oggi.getMonth() + 1 === Number(m[2]) && oggi.getDate() < Number(m[3]))) a--;
    return a;
  };

  function eventi(f, passaggi, cariche, extra) {
    const ev = [];
    if (f.data_iniziazione || f.anno_iniziazione) {
      const anno = f.anno_iniziazione || Number(String(f.data_iniziazione).slice(0, 4));
      ev.push({ tipo: 0, anno, chiave: f.data_iniziazione || '', etichetta: String(anno), titolo: 'Iniziazione', dettaglio: f.data_iniziazione ? fmtData(f.data_iniziazione) : '', modifica: 'date' });
    }
    passaggi.forEach((p) => ev.push({ tipo: 1, anno: p.anno, chiave: p.data || '', etichetta: String(p.anno), titolo: rango(p.grado) <= 1 ? 'Grado di ' + cap(p.grado) : 'Passaggio a ' + cap(p.grado), dettaglio: p.data ? fmtData(p.data) : '', modifica: 'grado', id: p.id }));
    cariche.forEach((c) => ev.push({ tipo: 2, anno: c.anno_dal, chiave: '', etichetta: c.anno_al && c.anno_al !== c.anno_dal ? c.anno_dal + '–' + c.anno_al : String(c.anno_dal), titolo: c.carica, dettaglio: c.note || '', modifica: 'carica', id: c.id }));
    (extra || []).forEach((e) => ev.push(e));
    const ORD = [0, 1, 2, -1, 3];   // a pari anno: Bussante, Iniziazione, Grado, Carica, Tavola
    return ev.sort((a, b) => a.anno - b.anno || ORD[a.tipo] - ORD[b.tipo] || String(a.chiave).localeCompare(String(b.chiave)));
  }

  // Eventi che arrivano da altri registri: la domanda da Bussante e le tavole presentate
  const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  async function eventiAggiuntivi(f) {
    const sb = state.sb, ev = [];
    try {   // Bussante: stessa persona = stesso cognome e nome (e, se noti a entrambi, stessa data di nascita)
      const bu = chk(await sb.from('bussanti').select('id,cognome,nome,data_nascita,tipo_domanda,data_domanda,data_presa_in_considerazione,data_prima_votazione,data_seconda_votazione'));
      bu.filter((b) => norm(b.cognome) === norm(f.cognome) && norm(b.nome) === norm(f.nome) && (!b.data_nascita || !f.data_nascita || b.data_nascita === f.data_nascita)).forEach((b) => {
        const d = b.data_domanda || b.data_presa_in_considerazione || b.data_prima_votazione;
        if (!d) return;
        const tipo = String(b.tipo_domanda || 'iniziazione').replace(/_/g, ' ');
        const parti = [b.data_domanda && 'domanda del ' + fmtData(b.data_domanda), b.data_presa_in_considerazione && 'presa in considerazione il ' + fmtData(b.data_presa_in_considerazione),
          b.data_prima_votazione && '1ª votazione il ' + fmtData(b.data_prima_votazione), b.data_seconda_votazione && '2ª votazione il ' + fmtData(b.data_seconda_votazione)].filter(Boolean);
        ev.push({ tipo: 3, anno: Number(String(d).slice(0, 4)), chiave: d, etichetta: String(String(d).slice(0, 4)), titolo: 'Bussante · domanda di ' + tipo, dettaglio: parti.join(' · '), bussante: b.id });
      });
    } catch (e) { /* facoltativo */ }
    try {   // Tavole scolpite: lavori già presentati o archiviati
      const lav = chk(await sb.from('lavori').select('*').eq('fratello_id', f.id).in('stato', ['presentato', 'archiviato']));
      const ids = Array.from(new Set(lav.map((l) => l.tornata_id).filter(Boolean)));
      const tor = {};
      if (ids.length) chk(await sb.from('tornate').select('id,data').in('id', ids)).forEach((t) => { tor[t.id] = t.data; });
      const tipi = { tavola: 'Tavola', formazione: 'Tornata di formazione', relazione: 'Relazione', altro: 'Lavoro' };
      lav.forEach((l) => {
        const d = l.data_presentazione || tor[l.tornata_id] || l.data_consegna_prevista || l.data_assegnazione;
        if (!d) return;
        ev.push({ tipo: 4, anno: Number(String(d).slice(0, 4)), chiave: d, etichetta: String(String(d).slice(0, 4)), titolo: l.titolo, id: l.id, lav: l,
          dettaglio: [tipi[l.tipo] || 'Lavoro', l.grado_tornata && 'grado di ' + l.grado_tornata, 'presentato il ' + fmtData(d)].filter(Boolean).join(' · ') });
      });
    } catch (e) { /* facoltativo */ }
    return ev;
  }

  async function scheda(v, id) {
    const sb = state.sb;
    const [fr, vc, pg, cs] = await Promise.all([
      sb.from('fratelli').select('id,cognome,nome,data_nascita,matricola,indirizzo,cap,citta,provincia,professione,cellulare,email,stato,anno_iniziazione,data_iniziazione').eq('id', id).maybeSingle(),
      sb.from('v_fratelli_completi').select('grado_attuale,carica_attuale').eq('id', id).maybeSingle(),
      sb.from('passaggi_grado').select('id,grado,anno,data').eq('fratello_id', id).order('anno'),
      sb.from('cariche_storico').select('id,fratello_id,carica,anno_dal,anno_al,note').eq('fratello_id', id),
    ]);
    const f = chk(fr), att = chk(vc) || {}, passaggi = chk(pg), cariche = chk(cs);
    if (!f) { v.innerHTML = '<div class="notice bad">Fratello non trovato.</div>'; return; }
    const kv = (l, x) => `<div><span>${l}</span><b>${x ? esc(x) : '—'}</b></div>`;
    const e = eta(f.data_nascita);
    const residenza = [f.indirizzo, [f.cap, f.citta].filter(Boolean).join(' ') + (f.provincia ? ' (' + f.provincia + ')' : '')].filter((x) => x && x.trim()).join(', ');
    const storia = eventi(f, passaggi, cariche, await eventiAggiuntivi(f));
    v.innerHTML = `
      <div class="crumb"><a href="#/fratelli">Fratelli</a> › ${esc(f.cognome)} ${esc(f.nome)}</div>
      <div class="page-head"><div><h1>${esc(f.cognome)} ${esc(f.nome)}</h1>
        <p>${f.stato ? `<span class="badge ${f.stato === 'attivo' ? 'ok' : 'gray'}">${esc(cap(f.stato))}</span> ` : ''}${att.grado_attuale ? `<span class="badge gold">${esc(cap(att.grado_attuale))}</span> ` : ''}${att.carica_attuale ? `<span class="badge info">${esc(att.carica_attuale)}</span>` : ''}</p></div>
        ${canEdit() ? `<div class="right actions"><button class="btn gold" id="s-car">${IC.plus} Aggiungi carica</button><button class="btn ghost" id="s-gra">Passaggio di grado</button><button class="btn ghost" id="s-dat">Modifica date</button></div>` : ''}</div>

      <div class="card"><h2>Dati</h2><div class="kv">
        ${kv('Matricola', f.matricola)}${kv('Data di nascita', f.data_nascita ? fmtData(f.data_nascita) + (e !== null ? ' · ' + e + ' anni' : '') : '')}
        ${kv('Iniziazione', f.data_iniziazione ? fmtData(f.data_iniziazione) : f.anno_iniziazione ? String(f.anno_iniziazione) : '')}
        ${kv('Residenza', residenza)}${kv('Professione', f.professione)}${kv('Cellulare', f.cellulare)}${kv('E-mail', f.email)}</div></div>

      <div class="card"><h2>Storia <small>${storia.length} ${storia.length === 1 ? 'evento' : 'eventi'}</small></h2>
        ${storia.length ? `<div class="timeline">${storia.map((x) => `<div class="tl-item"><div class="tl-anno">${esc(x.etichetta)}</div>
          <div class="tl-body"><span class="tl-tag">${['Iniziazione', 'Grado', 'Carica', 'Bussante', 'Tavola'][x.tipo]}</span><b>${esc(x.titolo)}</b>${x.dettaglio ? `<div class="hint">${esc(x.dettaglio)}</div>` : ''}</div>
          <div class="act">${x.tipo === 3 ? `<a class="btn ghost small" href="#/bussanti/${esc(x.bussante)}">Apri</a>` : x.tipo === 4 ? (x.lav && x.lav.file_path ? `<button class="btn ghost small" data-tav="${esc(x.id)}">Scarica</button>` : '') : canEdit() ? `<button class="btn ghost small" data-ev="${x.modifica}" data-id="${esc(x.id || '')}">Modifica</button>` : ''}</div></div>`).join('')}</div>`
          : `<div class="empty">${IC.storia}<div>Nessun evento registrato.${canEdit() ? ' Usa i pulsanti in alto per aggiungere cariche, passaggi di grado e date.' : ''}</div></div>`}</div>`;

    if (canEdit()) {
      $('#s-car').onclick = () => L.storia.apriCarica(null, { fratello_id: id }).catch((x) => toast(messaggioErrore(x), 'bad'));
      $('#s-gra').onclick = () => apriPassaggio(null, id);
      $('#s-dat').onclick = () => apriDate(f);
      $$('[data-ev]', v).forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.ev === 'date') apriDate(f);
        else if (b.dataset.ev === 'grado') apriPassaggio(passaggi.find((x) => x.id === b.dataset.id), id);
        else L.storia.apriCarica(cariche.find((x) => x.id === b.dataset.id)).catch((x) => toast(messaggioErrore(x), 'bad'));
      }));
    }
    $$('[data-tav]', v).forEach((b) => b.addEventListener('click', async () => {
      const ev = storia.find((x) => x.tipo === 4 && x.id === b.dataset.tav);
      if (!ev || !L.lavori) return;
      b.disabled = true;
      try { await L.lavori.scarica(ev.lav); } catch (e) { toast(messaggioErrore(e), 'bad'); }
      b.disabled = false;
    }));
    // riquadri aggiuntivi (es. Lavori e tavole): un errore qui non deve rompere la scheda
    for (const fn of (L.schedaExtra || [])) { try { await fn(v, id); } catch (e) { /* facoltativo */ } }
  }

  /* ---------- passaggio di grado ---------- */
  function apriPassaggio(r, fid) {
    const corpo = `<div class="form-grid">
      <div class="f s4"><label for="p-grado">Grado <span class="req">*</span></label><select id="p-grado" name="grado"><option value="">— scegli —</option>${P.opzioni(GRADI.map((g) => ({ v: g, t: cap(g) })), r ? String(r.grado).toLowerCase() : '')}</select></div>
      ${campo('data', 'Data del passaggio', r ? r.data : '', { type: 'date', cls: 's4' })}
      ${campo('anno', 'Anno (solo se la data non è nota)', r ? r.anno : '', { cls: 's4' })}
      <div class="f hint">Indica la data completa se la conosci; altrimenti basta l’anno.</div></div>`;
    const extra = r && isAdmin() ? '<button class="btn danger" type="button" data-del>Elimina</button>' : '';
    const m = P.modal(r ? 'Modifica passaggio di grado' : 'Nuovo passaggio di grado', corpo, {
      extra,
      onSubmit: async (f, chiudi, errore) => {
        const grado = f.elements.grado.value;
        if (!grado) return errore('Scegli il grado.');
        const dt = itToIso(f.elements.data.value);
        if (dt === 'ERR') return errore('Data non valida: usa il formato gg/mm/aaaa.');
        let anno = f.elements.anno.value.trim() ? Number(f.elements.anno.value) : null;
        if (dt) anno = Number(dt.slice(0, 4));   // se c'è la data, l'anno si ricava da lì
        if (anno === null) return errore('Indica la data oppure almeno l’anno.');
        if (!Number.isInteger(anno) || anno < 1900 || anno > 2100) return errore('Anno non valido (4 cifre).');
        const dati = { fratello_id: fid, grado, anno, data: dt || null };
        if (r) chk(await state.sb.from('passaggi_grado').update(dati).eq('id', r.id));
        else chk(await state.sb.from('passaggi_grado').insert(dati));
        chiudi(); toast('Passaggio di grado salvato', 'ok'); L.route();
      },
    });
    const del = $('[data-del]', m.ov);
    if (del) del.onclick = async () => {
      if (!window.confirm('Eliminare questo passaggio di grado?')) return;
      try { chk(await state.sb.from('passaggi_grado').delete().eq('id', r.id)); m.chiudi(); toast('Passaggio eliminato', 'ok'); L.route(); }
      catch (e) { $('[data-err]', m.ov).textContent = messaggioErrore(e); }
    };
  }

  /* ---------- date: nascita e iniziazione ---------- */
  function apriDate(f) {
    const corpo = `<div class="form-grid">
      ${campo('nascita', 'Data di nascita', f.data_nascita, { type: 'date', cls: 's4' })}
      ${campo('inizi', 'Data di iniziazione', f.data_iniziazione, { type: 'date', cls: 's4' })}
      ${campo('anno', 'Anno di iniziazione (se la data non è nota)', f.anno_iniziazione, { cls: 's4' })}
      <div class="f hint">La data di nascita serve a calcolare la fascia d’età della capitazione.</div></div>`;
    P.modal('Date del Fratello', corpo, {
      onSubmit: async (fm, chiudi, errore) => {
        const nasc = itToIso(fm.elements.nascita.value), ini = itToIso(fm.elements.inizi.value);
        if (nasc === 'ERR' || ini === 'ERR') return errore('Data non valida: usa il formato gg/mm/aaaa.');
        if (nasc && nasc >= new Date().toISOString().slice(0, 10)) return errore('La data di nascita deve essere nel passato.');
        let anno = fm.elements.anno.value.trim() ? Number(fm.elements.anno.value) : null;
        if (ini) anno = Number(ini.slice(0, 4));   // se c'è la data, l'anno si ricava da lì
        if (anno !== null && (!Number.isInteger(anno) || anno < 1900 || anno > 2100)) return errore('Anno di iniziazione non valido (4 cifre).');
        if (nasc && ini && ini < nasc) return errore('L’iniziazione non può precedere la nascita.');
        chk(await state.sb.from('fratelli').update({ data_nascita: nasc, data_iniziazione: ini, anno_iniziazione: anno }).eq('id', f.id));
        chiudi(); toast('Date aggiornate', 'ok'); L.route();
      },
    });
  }

  L.viste.fratelli = async function (v, parti) { return parti[1] ? scheda(v, parti[1]) : vistaLista(v); };
})();
