/* Lemmi - Agapi: adesioni dei Fratelli, ospiti, coperti e quote (script sql/lemmi_aggiornamento_42.sql).
 * - Calendario: su ogni tornata con agape un'etichetta «Agape · N» apre l'elenco delle adesioni.
 *   Venerabile, Segretario, Tesoriere e amministratore segnano risposte, ospiti, note e incassi.
 * - Area del Fratello: «Partecipo» / «Non partecipo» sulle prossime agapi, con il numero di ospiti.
 * - Aggiornamento 43 (sql/lemmi_aggiornamento_43.sql): obiettivo di coperti con indicatore «N / obiettivo» e ospiti con nome
 *   (tipo, chi li invita, cellulare, risposta, incasso). I coperti sono: Fratelli presenti + ospiti indicati come numero +
 *   ospiti con nome confermati.
 * - Aggiornamento 44 (sql/lemmi_aggiornamento_44.sql): pagamenti per partecipante (bonifico o contanti), con il riquadro
 *   dei contanti da versare in banca e «Segna come versati». */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, fmtData, eur, oggi } = L;

  const GESTORI = ['amministratore', 'venerabile', 'segretario', 'tesoriere'];
  const gestisce = () => GESTORI.includes(state.profilo && state.profilo.ruolo);
  const haAgape = (t) => !!t && (t.tipo === 'agape' || t.con_agape === true);
  const MANCA_SQL = 'Per le adesioni alle agapi esegui prima lo script sql/lemmi_aggiornamento_42.sql nell’editor SQL di Supabase.';
  const mancaSql = (e) => /agape_adesioni|aderisci_agape|schema cache|does not exist|Could not find/i.test((e && e.message) || '');
  const num = (x) => Number(x || 0);
  const MANCA_SQL43 = 'Per obiettivo e ospiti con nome esegui prima lo script sql/lemmi_aggiornamento_43.sql nell’editor SQL di Supabase.';
  const mancaSql43 = (e) => /agape_ospiti|obiettivo_coperti/i.test((e && e.message) || '');
  const TIPO_OSP = { ospite: 'Ospite', visitatore: 'Visitatore (altra Loggia)', familiare: 'Familiare' };
  const STATO_OSP = { si: 'confermato', no: 'rifiuta', nr: 'invitato' };
  const importo = (txt) => { const x = String(txt || '').trim().replace(/[€\s]/g, ''); return x === '' ? null : Number(x.includes(',') ? x.replace(/\./g, '').replace(',', '.') : x); };

  // conteggi per tornata: { id: { si, no, ospiti, nom } } (vuoto se lo script non è stato eseguito)
  async function conteggi(ids) {
    const out = {};
    const get = (id) => out[id] || (out[id] = { si: 0, no: 0, ospiti: 0, nom: 0 });
    try {
      chk(await state.sb.from('agape_adesioni').select('tornata_id,partecipa,ospiti').in('tornata_id', ids)).forEach((a) => {
        const c = get(a.tornata_id);
        if (a.partecipa) { c.si++; c.ospiti += num(a.ospiti); } else c.no++;
      });
    } catch (e) { /* tabella assente: nessun conteggio */ }
    try {
      chk(await state.sb.from('agape_ospiti').select('tornata_id,stato').in('tornata_id', ids)).forEach((o) => { if (o.stato === 'confermato') get(o.tornata_id).nom++; });
    } catch (e) { /* script 43 non eseguito: nessun ospite con nome */ }
    return out;
  }

  function badge(t, c) {
    const coperti = c ? c.si + c.ospiti + c.nom : 0, ob = num(t.obiettivo_coperti);
    const conta = ob ? ' · ' + coperti + '/' + ob + ' coperti' : (c ? ' · ' + coperti + (coperti === 1 ? ' coperto' : ' coperti') : '');
    const testo = 'Agape' + conta + (t.quota_agape ? ' · ' + eur(t.quota_agape) : '');
    const cl = ob && coperti >= ob ? 'badge ok' : 'badge gold';
    return gestisce() ? `<button type="button" class="${cl}" data-agape="${esc(t.id)}" title="Adesioni all’agape">${esc(testo)}</button>` : `<span class="${cl}">${esc(testo)}</span>`;
  }

  /* ---------- finestra delle adesioni (gestione) ---------- */
  async function apri(t) {
    if (!t) return;
    let fr, ad;
    try {
      [fr, ad] = await Promise.all([
        state.sb.from('fratelli').select('id,cognome,nome,stato,cellulare').order('cognome').order('nome').then(chk),
        state.sb.from('agape_adesioni').select('*').eq('tornata_id', t.id).then(chk),
      ]);
    } catch (e) { toast(mancaSql(e) ? MANCA_SQL : messaggioErrore(e), 'bad'); return; }
    let os = [], ospOk = true;   // ospiti con nome (script 43)
    try { os = chk(await state.sb.from('agape_ospiti').select('*').eq('tornata_id', t.id).order('cognome').order('nome')); } catch (e) { ospOk = false; }
    let pag = [], pagOk = true;   // pagamenti (script 44)
    try { pag = chk(await state.sb.from('agape_pagamenti').select('*').eq('tornata_id', t.id).order('data').order('creato_il')); } catch (e) { pagOk = false; }
    const per = {}; ad.forEach((a) => { per[a.fratello_id] = a; });
    // invitati: i Fratelli attivi, più chiunque abbia già una risposta registrata
    const elenco = fr.filter((f) => f.stato === 'attivo' || per[f.id]);
    const quota = num(t.quota_agape);
    const chiusa = t.data < oggi();
    const attivi = fr.filter((f) => f.stato === 'attivo');
    const pagati = (k, id) => pag.filter((p) => (k === 'f' ? p.fratello_id : p.ospite_id) === id);
    const somma = (l) => l.reduce((x, p) => x + num(p.importo), 0);
    const dovutoF = (id) => { const a = per[id]; return a && a.partecipa && quota ? (1 + num(a.ospiti)) * quota : 0; };
    const dovutoO = (o) => (o.stato === 'confermato' ? quota : 0);
    const cellaPag = (k, id, dov, vecchio) => {
      if (!pagOk) return vecchio;
      const v = somma(pagati(k, id)), ok = dov && v >= dov;
      return `<button type="button" class="btn ghost small ag-pagb${ok ? ' ok' : ''}" data-pag="${k}:${esc(id)}" title="Pagamenti">${esc(eur(v))}${dov ? ' / ' + esc(eur(dov)) : ''}</button>`;
    };
    const nomeFr = (id) => { const f = fr.find((x) => x.id === id); return f ? f.cognome + ' ' + f.nome : ''; };
    const sezOspiti = ospOk ? `<h3 class="ag-h3">Ospiti con nome</h3>
        <p class="hint">Per gli ospiti elencati qui non usare anche la colonna «Ospiti» del Fratello che li porta, altrimenti vengono contati due volte. Contano nei coperti solo quando la risposta è «Sì».</p>
        <div class="table-wrap"><table><thead><tr><th>Ospite</th><th>Tipo</th><th>Invitato da</th><th>Risposta</th><th>Contatto</th><th>Note</th><th class="num">Incassato</th><th></th></tr></thead><tbody id="ag-osp-righe"></tbody></table></div>
        <form id="ag-osp-form" class="ag-osp-form" autocomplete="off">
          <input name="cognome" placeholder="Cognome" aria-label="Cognome dell’ospite" maxlength="80">
          <input name="nome" placeholder="Nome" aria-label="Nome dell’ospite" maxlength="80">
          <select name="tipo" aria-label="Tipo di ospite">${Object.keys(TIPO_OSP).map((k) => `<option value="${k}">${esc(TIPO_OSP[k])}</option>`).join('')}</select>
          <select name="invitato_da" aria-label="Invitato da"><option value="">Invitato da…</option>${attivi.map((f) => `<option value="${esc(f.id)}">${esc(f.cognome + ' ' + f.nome)}</option>`).join('')}</select>
          <input name="contatto" placeholder="Cellulare (facoltativo)" inputmode="tel" aria-label="Cellulare dell’ospite" maxlength="40">
          <button class="btn small" type="submit">Aggiungi ospite</button></form>` : `<div class="notice" style="margin-top:14px">Per l’obiettivo di coperti e gli ospiti con nome esegui prima lo script <b>sql/lemmi_aggiornamento_43.sql</b> nell’editor SQL di Supabase.</div>`;

    const ov = document.createElement('div');
    ov.className = 'modal-ov';
    ov.innerHTML = `<div class="modal wide" role="dialog" aria-modal="true" aria-label="Adesioni all’agape">
      <div class="modal-h"><div><h2 style="margin:0">Agape del ${fmtData(t.data)}</h2>
        <div class="hint">${quota ? 'Quota ' + eur(quota) + ' a persona' : 'Quota non indicata'}${t.adesioni_entro ? ' · adesioni entro il ' + fmtData(t.adesioni_entro) : ''}${t.luogo ? ' · ' + esc(t.luogo) : ''}</div></div>
        <button class="btn ghost small" type="button" data-x>Chiudi</button></div>
      <div class="modal-b">
        <div class="ag-kpi" id="ag-kpi"></div>
        ${ospOk ? `<div class="ag-ob"><label for="ag-ob">Obiettivo coperti</label><input id="ag-ob" type="number" min="1" max="500" inputmode="numeric" value="${num(t.obiettivo_coperti) || ''}" placeholder="es. 25"><div class="ag-prog" id="ag-prog" hidden><i></i></div><span class="hint" id="ag-prog-t"></span></div>` : ''}
        <div class="ag-cassa" id="ag-cassa" hidden></div>
        <div class="actions" style="margin-bottom:12px">
          <div class="searchbar" style="flex:1 1 220px">${L.IC.search}<input id="ag-q" type="search" placeholder="Cerca un Fratello…"></div>
          <select id="ag-f" style="width:auto"><option value="">Tutti</option><option value="si">Partecipano</option><option value="no">Non partecipano</option><option value="nr">Senza risposta</option></select>
          <button class="btn ghost small" type="button" id="ag-copia">Copia elenco per il ristorante</button>
          ${L.wa ? `<button class="btn ghost small wa" type="button" id="ag-wa">Invito su WhatsApp</button>` : ''}
        </div>
        ${chiusa ? '<div class="notice" style="margin-bottom:10px">L’agape si è già svolta: puoi ancora correggere presenze e incassi.</div>' : ''}
        <div class="table-wrap"><table><thead><tr><th>Fratello</th><th>Risposta</th><th>Ospiti</th><th>Note</th><th class="num">Incassato</th></tr></thead><tbody id="ag-righe"></tbody></table></div>
        <p class="hint" style="margin-top:10px">Ogni modifica si salva da sola. Le risposte date dal Fratello nella sua area sono segnate con «dall’app».</p>
        ${sezOspiti}
      </div></div>`;
    document.body.appendChild(ov);
    const chiudi = () => { document.removeEventListener('keydown', escTasto); ov.remove(); L.route(); };
    const escTasto = (e) => { if (e.key === 'Escape') chiudi(); };
    document.addEventListener('keydown', escTasto);
    $('[data-x]', ov).onclick = chiudi;
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) chiudi(); });

    const kpi = () => {
      const si = ad.filter((a) => a.partecipa), no = ad.filter((a) => !a.partecipa);
      const nomSi = os.filter((o) => o.stato === 'confermato'), nomInv = os.filter((o) => o.stato === 'invitato');
      const ospiti = si.reduce((s, a) => s + num(a.ospiti), 0) + nomSi.length, coperti = si.length + ospiti;
      const nr = elenco.filter((f) => !per[f.id]).length;
      const incassato = pagOk ? somma(pag) : ad.reduce((x, a) => x + num(a.incassato), 0) + os.reduce((x, o) => x + num(o.incassato), 0);
      const ob = num(t.obiettivo_coperti), mancano = Math.max(0, ob - coperti);
      $('#ag-kpi', ov).innerHTML = `<div><span>Fratelli presenti</span><b>${si.length}</b></div><div><span>Ospiti</span><b>${ospiti}</b></div>
        <div><span>Coperti</span><b>${coperti}</b></div>${ob ? `<div><span>Obiettivo</span><b>${ob}</b></div><div><span>Mancano</span><b style="color:${mancano ? 'var(--warn)' : 'var(--ok)'}">${mancano}</b></div>` : ''}
        <div><span>Assenti</span><b>${no.length}</b></div><div><span>Fratelli senza risposta</span><b>${nr}</b></div>${nomInv.length ? `<div><span>Ospiti da confermare</span><b>${nomInv.length}</b></div>` : ''}
        ${quota ? `<div><span>Da incassare</span><b>${eur(coperti * quota)}</b></div>` : ''}<div><span>Incassato</span><b style="color:${quota && incassato >= coperti * quota && coperti ? 'var(--ok)' : 'inherit'}">${eur(incassato)}</b></div>`;
      cassa();
      const prog = $('#ag-prog', ov), pt = $('#ag-prog-t', ov);
      if (prog && pt) {
        if (ob) {
          prog.hidden = false;
          prog.firstElementChild.style.width = Math.min(100, Math.round(coperti / ob * 100)) + '%';
          prog.classList.toggle('ok', coperti >= ob);
          pt.textContent = coperti < ob ? coperti + ' di ' + ob + ' · mancano ' + mancano : coperti === ob ? 'Obiettivo raggiunto: ' + coperti + ' coperti' : 'Obiettivo superato di ' + (coperti - ob);
        } else { prog.hidden = true; pt.textContent = ''; }
      }
    };

    const seg = (f, a) => {
      const v = a ? (a.partecipa ? 'si' : 'no') : 'nr';
      const b = (k, t) => `<button type="button" class="${k}" data-r="${k}" data-f="${esc(f.id)}" aria-pressed="${v === k}">${t}</button>`;
      return `<div class="ag-seg" role="group" aria-label="Risposta di ${esc(f.cognome)}">${b('si', 'Sì')}${b('no', 'No')}${b('nr', '—')}</div>`;
    };
    const disegna = () => {
      const q = $('#ag-q', ov).value.trim().toLowerCase(), filtro = $('#ag-f', ov).value;
      const righe = elenco.filter((f) => (!q || (f.cognome + ' ' + f.nome).toLowerCase().includes(q))
        && (!filtro || (filtro === 'nr' ? !per[f.id] : per[f.id] && per[f.id].partecipa === (filtro === 'si'))));
      $('#ag-righe', ov).innerHTML = righe.length ? righe.map((f) => {
        const a = per[f.id];
        return `<tr data-riga="${esc(f.id)}"><td><b>${esc(f.cognome)} ${esc(f.nome)}</b>${a && a.risposta_da === 'fratello' ? ' <span class="badge info">dall’app</span>' : ''}${f.stato !== 'attivo' ? ` <span class="hint">(${esc(L.etichettaStato(f.stato))})</span>` : ''}</td>
          <td>${seg(f, a)}</td>
          <td><input class="ag-osp" type="number" min="0" max="20" data-osp="${esc(f.id)}" value="${a && a.partecipa ? num(a.ospiti) : 0}" ${a && a.partecipa ? '' : 'disabled'} aria-label="Ospiti"></td>
          <td><input data-note="${esc(f.id)}" value="${esc((a && a.note) || '')}" placeholder="es. vegetariano" ${a ? '' : 'disabled'} aria-label="Note"></td>
          <td class="num">${cellaPag('f', f.id, dovutoF(f.id), `<input data-inc="${esc(f.id)}" inputmode="decimal" style="width:96px;text-align:right" value="${a && a.incassato !== null && a.incassato !== undefined ? esc(String(a.incassato).replace('.', ',')) : ''}" placeholder="${a && a.partecipa && quota ? esc(String((1 + num(a.ospiti)) * quota).replace('.', ',')) : ''}" ${a && a.partecipa ? '' : 'disabled'} aria-label="Incassato">`)}</td></tr>`;
      }).join('') : '<tr><td colspan="5"><div class="empty">Nessun Fratello in questo elenco.</div></td></tr>';
      kpi();
    };

    // salvataggio di una riga (risposta, ospiti, note, incasso)
    async function salva(fid, modifiche) {
      const prima = per[fid];
      try {
        if (modifiche === null) {
          if (prima) chk(await state.sb.from('agape_adesioni').delete().eq('id', prima.id));
          delete per[fid];
        } else {
          const dati = Object.assign({ tornata_id: t.id, fratello_id: fid, partecipa: prima ? prima.partecipa : true, ospiti: prima ? prima.ospiti : 0, note: prima ? prima.note : null, incassato: prima ? prima.incassato : null }, modifiche, { risposta_da: modifiche.partecipa !== undefined ? 'segreteria' : (prima ? prima.risposta_da : 'segreteria') });
          if (!dati.partecipa) { dati.ospiti = 0; }
          const r = chk(await state.sb.from('agape_adesioni').upsert(dati, { onConflict: 'tornata_id,fratello_id' }).select().single());
          per[fid] = r;
        }
        ad = Object.values(per);
      } catch (e) { toast(mancaSql(e) ? MANCA_SQL : messaggioErrore(e), 'bad'); }
    }

    const corpo = $('#ag-righe', ov);
    corpo.addEventListener('click', async (e) => {
      const pg = e.target.closest('[data-pag]');
      if (pg) { const [k, id] = pg.dataset.pag.split(':'); apriPag(k, id); return; }
      const b = e.target.closest('[data-r]');
      if (!b) return;
      const fid = b.dataset.f, r = b.dataset.r;
      b.parentElement.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      await salva(fid, r === 'nr' ? null : { partecipa: r === 'si' });
      disegna();
    });
    corpo.addEventListener('change', async (e) => {
      const el = e.target;
      if (el.dataset.osp) {
        const n = Math.max(0, Math.min(20, Math.round(num(el.value))));
        await salva(el.dataset.osp, { ospiti: n });
      } else if (el.dataset.note !== undefined && el.hasAttribute('data-note')) {
        await salva(el.dataset.note, { note: el.value.trim() || null });
      } else if (el.dataset.inc) {
        const v = importo(el.value);
        if (v !== null && !(v >= 0)) { toast('Importo non valido: scrivi per esempio 35,00.', 'bad'); return; }
        await salva(el.dataset.inc, { incassato: v });
      } else return;
      disegna();
    });
    $('#ag-q', ov).addEventListener('input', disegna);
    $('#ag-f', ov).addEventListener('change', disegna);

    // elenco per il ristorante: coperti, nomi e note (Fratelli e ospiti con nome confermati)
    $('#ag-copia', ov).addEventListener('click', async () => {
      const si = elenco.filter((f) => per[f.id] && per[f.id].partecipa);
      const ospConf = os.filter((o) => o.stato === 'confermato');
      const coperti = si.reduce((s, f) => s + 1 + num(per[f.id].ospiti), 0) + ospConf.length;
      const righe = [`Agape del ${fmtData(t.data)} – ${coperti} coperti`, '', ...si.map((f) => {
        const a = per[f.id];
        return `• ${f.cognome} ${f.nome}${num(a.ospiti) ? ' + ' + num(a.ospiti) + (num(a.ospiti) === 1 ? ' ospite' : ' ospiti') : ''}${a.note ? ' (' + a.note + ')' : ''}`;
      }), ...ospConf.map((o) => `• ${o.cognome} ${o.nome} (${(TIPO_OSP[o.tipo] || 'Ospite').toLowerCase()}${o.invitato_da ? ', ospite di ' + nomeFr(o.invitato_da) : ''})${o.note ? ' – ' + o.note : ''}`)];
      const testo = righe.join('\n');
      try { await navigator.clipboard.writeText(testo); toast('Elenco copiato: incollalo nel messaggio al ristorante', 'ok'); }
      catch (e) { window.prompt('Copia l’elenco:', testo); }
    });
    // invito per il gruppo WhatsApp
    const wa = $('#ag-wa', ov);
    if (wa) wa.addEventListener('click', () => {
      const l = state.loggia || {};
      const testo = [`R∴L∴ ${l.nome || ''}${l.numero ? ' n. ' + l.numero : ''}`, '', `*Agape fraterna* – ${fmtData(t.data)}${t.ora ? ', ore ' + String(t.ora).slice(0, 5) : ''}`,
        t.luogo ? 'Luogo: ' + t.luogo : '', quota ? 'Quota: ' + eur(quota) + ' a persona' : '',
        `Conferma la tua presenza${t.adesioni_entro ? ' entro il ' + fmtData(t.adesioni_entro) : ''} dall’app (La mia scheda › Prossime tornate) o rispondendo a questo messaggio, indicando eventuali ospiti.`].filter((x) => x !== '').join('\n');
      const w = window.open('https://wa.me/?text=' + encodeURIComponent(testo), '_blank');
      if (!w) location.href = 'https://wa.me/?text=' + encodeURIComponent(testo);
    });

    /* ---------- obiettivo di coperti ---------- */
    const ob = $('#ag-ob', ov);
    if (ob) ob.addEventListener('change', async () => {
      const txt = ob.value.trim(), v = txt === '' ? null : Math.round(Number(txt));
      if (v !== null && !(v >= 1 && v <= 500)) { toast('Obiettivo non valido: scrivi un numero da 1 a 500.', 'bad'); ob.value = t.obiettivo_coperti || ''; return; }
      try {
        const r = chk(await state.sb.from('tornate').update({ obiettivo_coperti: v }).eq('id', t.id).select('id'));
        if (!r.length) throw new Error('Non hai i permessi per modificare l’obiettivo di questa agape.');
        t.obiettivo_coperti = v; kpi();
        toast(v ? 'Obiettivo di ' + v + ' coperti salvato' : 'Obiettivo tolto', 'ok');
      } catch (er) { toast(mancaSql43(er) ? MANCA_SQL43 : messaggioErrore(er), 'bad'); ob.value = t.obiettivo_coperti || ''; }
    });

    /* ---------- ospiti con nome ---------- */
    const testoOspite = (o) => { const l = state.loggia || {};
      return [`Buongiorno ${o.nome},`, `ti invitiamo con piacere all’agape fraterna del ${fmtData(t.data)}${t.ora ? ', ore ' + String(t.ora).slice(0, 5) : ''}${t.luogo ? ', presso ' + t.luogo : ''}.`,
        quota ? 'Quota: ' + eur(quota) + ' a persona.' : '', `Ti chiediamo di confermare la tua presenza${t.adesioni_entro ? ' entro il ' + fmtData(t.adesioni_entro) : ''} rispondendo a questo messaggio.`,
        l.nome ? `Loggia ${l.nome}${l.numero ? ' n. ' + l.numero : ''}` : ''].filter(Boolean).join('\n'); };
    const segO = (o) => {
      const v = o.stato === 'confermato' ? 'si' : o.stato === 'rifiuta' ? 'no' : 'nr';
      const b = (k, x) => `<button type="button" class="${k}" data-or="${k}" data-o="${esc(o.id)}" aria-pressed="${v === k}">${x}</button>`;
      return `<div class="ag-seg" role="group" aria-label="Risposta di ${esc(o.cognome)}">${b('si', 'Sì')}${b('no', 'No')}${b('nr', '—')}</div>`;
    };
    const disegnaOsp = () => {
      const corpoO = $('#ag-osp-righe', ov); if (!corpoO) return;
      corpoO.innerHTML = os.length ? os.map((o) => {
        const n = L.wa && L.wa.numeroWa ? L.wa.numeroWa(o.contatto) : '';
        const waLink = n ? ` <a class="btn ghost small wa" target="_blank" rel="noopener" href="https://wa.me/${n}?text=${encodeURIComponent(testoOspite(o))}" title="Invito su WhatsApp">WhatsApp</a>` : '';
        return `<tr data-ospite="${esc(o.id)}"><td><b>${esc(o.cognome)} ${esc(o.nome)}</b></td><td>${esc(TIPO_OSP[o.tipo] || o.tipo)}</td><td>${esc(nomeFr(o.invitato_da)) || '—'}</td>
          <td>${segO(o)}</td><td>${esc(o.contatto || '')}${waLink}</td>
          <td><input data-onote="${esc(o.id)}" value="${esc(o.note || '')}" placeholder="es. vegetariano" aria-label="Note"></td>
          <td class="num">${cellaPag('o', o.id, dovutoO(o), `<input data-oinc="${esc(o.id)}" inputmode="decimal" style="width:96px;text-align:right" value="${o.incassato !== null && o.incassato !== undefined ? esc(String(o.incassato).replace('.', ',')) : ''}" placeholder="${o.stato === 'confermato' && quota ? esc(String(quota).replace('.', ',')) : ''}" aria-label="Incassato">`)}</td>
          <td><button type="button" class="btn danger small" data-odel="${esc(o.id)}">Elimina</button></td></tr>`;
      }).join('') : '<tr><td colspan="8"><div class="empty">Nessun ospite con nome: aggiungine uno qui sotto.</div></td></tr>';
      kpi();
    };
    async function salvaOsp(id, mod) {
      try { const r = chk(await state.sb.from('agape_ospiti').update(mod).eq('id', id).select().single()); os = os.map((o) => (o.id === id ? r : o)); }
      catch (e) { toast(mancaSql43(e) ? MANCA_SQL43 : messaggioErrore(e), 'bad'); }
    }
    const corpoO = $('#ag-osp-righe', ov);
    if (corpoO) {
      corpoO.addEventListener('click', async (e) => {
        const r = e.target.closest('[data-or]'), d = e.target.closest('[data-odel]'), pg = e.target.closest('[data-pag]');
        if (pg) { const [k, id] = pg.dataset.pag.split(':'); apriPag(k, id); return; }
        if (r) {
          r.parentElement.querySelectorAll('button').forEach((x) => { x.disabled = true; });
          await salvaOsp(r.dataset.o, { stato: STATO_OSP[r.dataset.or] });
          disegnaOsp();
        } else if (d) {
          const o = os.find((x) => x.id === d.dataset.odel); if (!o) return;
          L.eliminaConAnnulla({ domanda: 'Eliminare l’ospite ' + o.cognome + ' ' + o.nome + ' dall’elenco?', messaggio: 'Ospite ' + o.cognome + ' ' + o.nome + ' eliminato', el: d.closest('tr'),
            esegui: async () => chk(await state.sb.from('agape_ospiti').delete().eq('id', o.id)),
            dopo: () => { os = os.filter((x) => x.id !== o.id); disegnaOsp(); } });
        }
      });
      corpoO.addEventListener('change', async (e) => {
        const el = e.target;
        if (el.hasAttribute('data-onote')) await salvaOsp(el.dataset.onote, { note: el.value.trim() || null });
        else if (el.hasAttribute('data-oinc')) {
          const v = importo(el.value);
          if (v !== null && !(v >= 0)) { toast('Importo non valido: scrivi per esempio 35,00.', 'bad'); return; }
          await salvaOsp(el.dataset.oinc, { incassato: v });
        } else return;
        disegnaOsp();
      });
      $('#ag-osp-form', ov).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const f = ev.target.elements, cognome = f.cognome.value.trim(), nome = f.nome.value.trim();
        if (!cognome || !nome) { toast('Scrivi cognome e nome dell’ospite.', 'bad'); return; }
        const dati = { tornata_id: t.id, cognome, nome, tipo: f.tipo.value, invitato_da: f.invitato_da.value || null, contatto: f.contatto.value.trim() || null, stato: 'invitato' };
        try {
          const r = chk(await state.sb.from('agape_ospiti').insert(dati).select().single());
          os.push(r); os.sort((a, b) => (a.cognome + ' ' + a.nome).localeCompare(b.cognome + ' ' + b.nome, 'it'));
          ev.target.reset(); disegnaOsp(); toast('Ospite aggiunto: segna «Sì» quando conferma', 'ok'); f.cognome.focus();
        } catch (e) { toast(mancaSql43(e) ? MANCA_SQL43 : messaggioErrore(e), 'bad'); }
      });
    }

    /* ---------- contanti da versare ---------- */
    const cassa = () => {
      const box = $('#ag-cassa', ov); if (!box) return;
      if (!pagOk) { box.hidden = false; box.innerHTML = 'Per registrare bonifici e contanti esegui prima lo script <b>sql/lemmi_aggiornamento_44.sql</b> nell’editor SQL di Supabase.'; return; }
      if (!pag.length) { box.hidden = true; box.innerHTML = ''; return; }
      const con = pag.filter((p) => p.metodo === 'contanti'), dav = con.filter((p) => !p.versato_il), ver = con.filter((p) => p.versato_il);
      box.hidden = false;
      box.innerHTML = `<span>Bonifici <b>${esc(eur(somma(pag.filter((p) => p.metodo === 'bonifico'))))}</b></span>
        <span>Contanti <b>${esc(eur(somma(con)))}</b> (già versati ${esc(eur(somma(ver)))})</span>
        ${dav.length ? `<span class="ag-dav">Da versare in banca: <b>${esc(eur(somma(dav)))}</b> · ${dav.length} ${dav.length === 1 ? 'pagamento' : 'pagamenti'}</span>
        <input type="date" id="ag-vdata" value="${esc(oggi())}" aria-label="Data del versamento"><button type="button" class="btn small" id="ag-versa">Segna come versati</button>` : ''}`;
    };
    $('#ag-cassa', ov).addEventListener('click', async (e) => {
      if (!e.target.closest('#ag-versa')) return;
      const data = $('#ag-vdata', ov).value, dav = pag.filter((p) => p.metodo === 'contanti' && !p.versato_il);
      if (!data) { toast('Indica la data del versamento.', 'bad'); return; }
      if (!dav.length) return;
      if (!confirm('Segnare come versati in banca ' + eur(somma(dav)) + ' di contanti (' + dav.length + (dav.length === 1 ? ' pagamento' : ' pagamenti') + ') con data ' + fmtData(data) + '?')) return;
      try {
        const r = chk(await state.sb.from('agape_pagamenti').update({ versato_il: data }).eq('tornata_id', t.id).eq('metodo', 'contanti').is('versato_il', null).select());
        const m = {}; r.forEach((x) => { m[x.id] = x; });
        pag = pag.map((p) => m[p.id] || p);
        toast('Contanti segnati come versati', 'ok');
      } catch (er) { toast(mancaSql(er) ? MANCA_SQL : messaggioErrore(er), 'bad'); }
      disegna(); disegnaOsp();
    });

    /* ---------- pagamenti di un partecipante ---------- */
    function apriPag(k, id) {
      const pers = k === 'f' ? fr.find((f) => f.id === id) : os.find((o) => o.id === id);
      if (!pers) return;
      const nome = pers.cognome + ' ' + pers.nome;
      const dov = k === 'f' ? dovutoF(id) : dovutoO(pers);
      const sub = document.createElement('div');
      sub.className = 'modal-ov';
      sub.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Pagamenti di ${esc(nome)}">
        <div class="modal-h"><div><h2 style="margin:0">Pagamenti</h2><div class="hint">${esc(nome)}</div></div><button class="btn ghost small" type="button" data-x2>Chiudi</button></div>
        <div class="modal-b"><div class="ag-kpi" id="pg-kpi"></div>
          <div class="table-wrap"><table><thead><tr><th>Data</th><th>Metodo</th><th class="num">Importo</th><th>Nota</th><th></th></tr></thead><tbody id="pg-righe"></tbody></table></div>
          <form id="pg-form" class="ag-osp-form" autocomplete="off">
            <input name="importo" inputmode="decimal" placeholder="Importo €" aria-label="Importo" style="max-width:120px">
            <select name="metodo" aria-label="Metodo"><option value="contanti">Contanti</option><option value="bonifico">Bonifico</option></select>
            <input name="data" type="date" value="${esc(oggi())}" aria-label="Data del pagamento">
            <input name="nota" placeholder="Nota (facoltativa)" aria-label="Nota" maxlength="120">
            <button class="btn small" type="submit">Aggiungi pagamento</button></form></div></div>`;
      document.body.appendChild(sub);
      const rendi = () => {
        const l = pagati(k, id), tot = somma(l);
        $('#pg-kpi', sub).innerHTML = (dov ? `<div><span>Dovuto</span><b>${esc(eur(dov))}</b></div>` : '') +
          `<div><span>Pagato</span><b style="color:${dov && tot >= dov ? 'var(--ok)' : 'inherit'}">${esc(eur(tot))}</b></div>` +
          (dov ? `<div><span>${tot > dov ? 'In più' : 'Residuo'}</span><b>${esc(eur(Math.abs(dov - tot)))}</b></div>` : '');
        $('#pg-form', sub).elements.importo.placeholder = dov > tot ? String(Math.round((dov - tot) * 100) / 100).replace('.', ',') : 'Importo €';
        $('#pg-righe', sub).innerHTML = l.length ? l.map((p) => `<tr data-p="${esc(p.id)}"><td>${esc(fmtData(p.data))}</td><td>${p.metodo === 'contanti' ? 'Contanti' : 'Bonifico'}</td><td class="num">${esc(eur(p.importo))}</td>
          <td>${esc(p.nota || '')}${p.metodo === 'contanti' ? (p.versato_il ? ` <span class="badge ok">versato il ${esc(fmtData(p.versato_il))}</span>` : ' <span class="badge warn">da versare</span>') : ''}</td>
          <td>${p.versato_il ? `<button type="button" class="btn ghost small" data-rimetti="${esc(p.id)}">Rimetti da versare</button> ` : ''}<button type="button" class="btn danger small" data-pdel="${esc(p.id)}">Elimina</button></td></tr>`).join('')
          : '<tr><td colspan="5"><div class="empty">Nessun pagamento registrato.</div></td></tr>';
      };
      const chiudiSub = () => { document.removeEventListener('keydown', escSub, true); sub.remove(); disegna(); disegnaOsp(); };
      const escSub = (e) => { if (e.key === 'Escape') { e.stopPropagation(); chiudiSub(); } };
      document.addEventListener('keydown', escSub, true);
      $('[data-x2]', sub).onclick = chiudiSub;
      sub.addEventListener('mousedown', (e) => { if (e.target === sub) chiudiSub(); });
      $('#pg-righe', sub).addEventListener('click', async (e) => {
        const d = e.target.closest('[data-pdel]'), rm = e.target.closest('[data-rimetti]');
        if (rm) {
          try { const r = chk(await state.sb.from('agape_pagamenti').update({ versato_il: null }).eq('id', rm.dataset.rimetti).select().single()); pag = pag.map((p) => (p.id === r.id ? r : p)); rendi(); }
          catch (er) { toast(messaggioErrore(er), 'bad'); }
        } else if (d) {
          const p = pag.find((x) => x.id === d.dataset.pdel); if (!p) return;
          L.eliminaConAnnulla({ domanda: 'Eliminare il pagamento di ' + eur(p.importo) + ' del ' + fmtData(p.data) + (p.versato_il ? ' (già segnato come versato in banca)' : '') + '?', messaggio: 'Pagamento eliminato', el: d.closest('tr'),
            esegui: async () => chk(await state.sb.from('agape_pagamenti').delete().eq('id', p.id)),
            dopo: () => { pag = pag.filter((x) => x.id !== p.id); rendi(); } });
        }
      });
      $('#pg-form', sub).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const f = ev.target.elements, v = importo(f.importo.value);
        if (v === null || !(v > 0)) { toast('Scrivi un importo valido, per esempio 35,00.', 'bad'); return; }
        if (!f.data.value) { toast('Indica la data del pagamento.', 'bad'); return; }
        const dati = { tornata_id: t.id, importo: v, metodo: f.metodo.value, data: f.data.value, nota: f.nota.value.trim() || null };
        dati[k === 'f' ? 'fratello_id' : 'ospite_id'] = id;
        try {
          const r = chk(await state.sb.from('agape_pagamenti').insert(dati).select().single());
          pag.push(r); ev.target.reset(); f.data.value = oggi(); rendi(); toast('Pagamento registrato', 'ok'); f.importo.focus();
        } catch (er) { toast(mancaSql(er) ? 'Per i pagamenti esegui prima sql/lemmi_aggiornamento_44.sql nell’editor SQL di Supabase.' : messaggioErrore(er), 'bad'); }
      });
      rendi();
      $('#pg-form', sub).elements.importo.focus();
    }
    disegna();
    disegnaOsp();
  }

  /* ---------- area del Fratello: risposta alle prossime agapi ---------- */
  async function mieAdesioni(ids) {
    const out = {};
    if (!ids.length) return out;
    try { chk(await state.sb.from('agape_adesioni').select('tornata_id,partecipa,ospiti,note').in('tornata_id', ids)).forEach((a) => { out[a.tornata_id] = a; }); } catch (e) { /* script non eseguito */ }
    return out;
  }
  function boxFratello(t, a) {
    const v = a ? (a.partecipa ? 'si' : 'no') : 'nr';
    const chiuse = t.adesioni_entro && oggi() > t.adesioni_entro;
    return `<div class="ag-box" data-agbox="${esc(t.id)}"><b>Agape</b>${t.quota_agape ? ' · ' + eur(t.quota_agape) : ''}${t.adesioni_entro ? ` · rispondi entro il ${fmtData(t.adesioni_entro)}` : ''}
      ${chiuse ? `<span>${v === 'si' ? 'Hai confermato la partecipazione' + (a && a.ospiti ? ' con ' + a.ospiti + (a.ospiti === 1 ? ' ospite' : ' ospiti') : '') : v === 'no' ? 'Hai indicato che non parteciperai' : 'Adesioni chiuse: rivolgiti al Segretario'}</span>`
        : `<div class="ag-seg" role="group" aria-label="La tua risposta"><button type="button" class="si" data-agr="si" aria-pressed="${v === 'si'}">Partecipo</button><button type="button" class="no" data-agr="no" aria-pressed="${v === 'no'}">Non partecipo</button></div>
        <label style="display:flex;gap:6px;align-items:center;font-weight:500">Ospiti <select data-agosp style="width:auto;padding:5px 8px">${[0, 1, 2, 3, 4, 5].map((n) => `<option ${a && a.partecipa && num(a.ospiti) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`}</div>`;
  }
  // chiamata dall'area del Fratello dopo aver disegnato la pagina
  async function montaFratello(v, tornate) {
    const conAgape = tornate.filter(haAgape);
    if (!conAgape.length) return;
    const mie = await mieAdesioni(conAgape.map((t) => t.id));
    conAgape.forEach((t) => {
      const cella = $(`[data-tornata="${t.id}"]`, v);
      if (cella) cella.insertAdjacentHTML('beforeend', boxFratello(t, mie[t.id]));
    });
    $$('[data-agbox]', v).forEach((box) => {
      const tid = box.dataset.agbox;
      const invia = async (partecipa) => {
        const sel = $('[data-agosp]', box);
        $$('button', box).forEach((b) => { b.disabled = true; });
        try {
          chk(await state.sb.rpc('aderisci_agape', { p_tornata: tid, p_partecipa: partecipa, p_ospiti: partecipa && sel ? Number(sel.value) : 0, p_note: null }));
          toast(partecipa ? 'Partecipazione confermata, grazie' : 'Assenza registrata', 'ok');
          L.route();
        } catch (e) {
          toast(mancaSql(e) ? 'Le adesioni non sono ancora attive: avvisa il Segretario.' : messaggioErrore(e), 'bad');
          $$('button', box).forEach((b) => { b.disabled = false; });
        }
      };
      $$('[data-agr]', box).forEach((b) => b.addEventListener('click', () => invia(b.dataset.agr === 'si')));
      const sel = $('[data-agosp]', box);
      if (sel) sel.addEventListener('change', () => { if ($('[data-agr="si"]', box).getAttribute('aria-pressed') === 'true') invia(true); });
    });
  }

  L.agapi = { gestisce, haAgape, conteggi, badge, apri, montaFratello };
})();
