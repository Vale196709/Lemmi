/* Lemmi - Agapi: adesioni dei Fratelli, ospiti, coperti e quote (script sql/lemmi_aggiornamento_42.sql).
 * - Calendario: su ogni tornata con agape un'etichetta «Agape · N» apre l'elenco delle adesioni.
 *   Venerabile, Segretario, Tesoriere e amministratore segnano risposte, ospiti, note e incassi.
 * - Area del Fratello: «Partecipo» / «Non partecipo» sulle prossime agapi, con il numero di ospiti.
 * - Aggiornamento 43 (sql/lemmi_aggiornamento_43.sql): obiettivo di coperti con indicatore «N / obiettivo» e ospiti con nome
 *   (tipo, chi li invita, cellulare, risposta, incasso). I coperti sono: Fratelli presenti + ospiti indicati come numero +
 *   ospiti con nome confermati.
 * - Aggiornamento 44 (sql/lemmi_aggiornamento_44.sql): pagamenti per partecipante (bonifico o contanti), con il riquadro
 *   dei contanti da versare in banca e «Segna come versati».
 * - Aggiornamento 45 (sql/lemmi_aggiornamento_45.sql): l'agape si collega a un evento del Conto di Loggia; entrate e uscite
 *   in banca, bonifici da abbinare ai partecipanti, versamento dei contanti, margine e costo a coperto. */
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
  const MANCA_SQL45 = 'Per il collegamento con la Tesoreria esegui prima lo script sql/lemmi_aggiornamento_45.sql nell’editor SQL di Supabase.';
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
    // Tesoreria (script 45): evento collegato e movimenti di banca; li vedono amministratore, Venerabile e Tesoriere
    const ruolo = (state.profilo && state.profilo.ruolo) || '';
    const scrive = ['amministratore', 'tesoriere'].includes(ruolo);
    let bancaOk = pagOk && ['amministratore', 'venerabile', 'tesoriere'].includes(ruolo), tes45 = true, eventi = [], movs = [], evento = null;
    const caricaBanca = async () => {
      if (!bancaOk) return;
      try {
        eventi = chk(await state.sb.from('eventi_conto').select('id,nome,data_evento,tornata_id').order('nome'));
        evento = eventi.find((e) => e.tornata_id === t.id) || null;
        movs = evento ? chk(await state.sb.from('conto_movimenti').select('id,data_operazione,descrizione,importo,fratello_id').eq('evento_id', evento.id).order('data_operazione')) : [];
      } catch (e) { if (/tornata_id/i.test((e && e.message) || '')) tes45 = false; else bancaOk = false; }
    };
    await caricaBanca();
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
        <div class="ag-banca" id="ag-banca" hidden></div>
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
      cassa(); banca();
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
          <td>${esc(p.nota || '')}${p.metodo === 'contanti' ? (p.versato_il ? ` <span class="badge ok">versato il ${esc(fmtData(p.versato_il))}</span>` : ' <span class="badge warn">da versare</span>') : ''}${p.movimento_id || p.versamento_id ? ' <span class="badge info">in banca</span>' : ''}</td>
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
          try { const r = chk(await state.sb.from('agape_pagamenti').update(tes45 ? { versato_il: null, versamento_id: null } : { versato_il: null }).eq('id', rm.dataset.rimetti).select().single()); pag = pag.map((p) => (p.id === r.id ? r : p)); rendi(); }
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

    /* ---------- Tesoreria: evento, movimenti di banca, riepilogo ---------- */
    const alloc = (m) => somma(pag.filter((p) => p.movimento_id === m.id || p.versamento_id === m.id));
    const copertiTot = () => { const si = ad.filter((a) => a.partecipa); return si.length + si.reduce((x, a) => x + num(a.ospiti), 0) + os.filter((o) => o.stato === 'confermato').length; };
    const banca = () => {
      const box = $('#ag-banca', ov); if (!box) return;
      if (!bancaOk) { box.hidden = true; box.innerHTML = ''; return; }
      box.hidden = false;
      if (!tes45) { box.innerHTML = 'Per collegare l’agape alla Tesoreria esegui prima lo script <b>sql/lemmi_aggiornamento_45.sql</b> nell’editor SQL di Supabase.'; return; }
      const liberi = eventi.filter((e) => !e.tornata_id || e.tornata_id === t.id);
      const sel = `<label for="ag-ev"><b>Evento in Tesoreria</b></label><select id="ag-ev" style="width:auto" ${scrive ? '' : 'disabled'}><option value="">— nessuno —</option>${liberi.map((e) => `<option value="${esc(e.id)}" ${evento && evento.id === e.id ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}${scrive ? '<option value="_nuovo">+ Crea un evento per questa agape…</option>' : ''}</select>`;
      if (!evento) { box.innerHTML = sel + '<span class="hint">Collega l’agape a un evento del Conto di Loggia per vedere entrate e uscite in banca.</span>'; return; }
      const ent = movs.filter((m) => num(m.importo) > 0), usc = movs.filter((m) => num(m.importo) < 0);
      const entTot = ent.reduce((x, m) => x + num(m.importo), 0), abb = ent.reduce((x, m) => x + Math.min(alloc(m), num(m.importo)), 0);
      const uscTot = -usc.reduce((x, m) => x + num(m.importo), 0), inc = somma(pag), cop = copertiTot();
      const daAbb = entTot - abb, marg = inc - uscTot, nonVer = pag.filter((p) => p.metodo === 'bonifico' && !p.movimento_id).length;
      box.innerHTML = sel + (scrive ? '<button type="button" class="btn small" id="ag-abbina">Abbina movimenti</button>' : '') +
        `<div class="ag-kpi" style="flex:1 1 100%;margin:6px 0 0"><div><span>Entrate in banca</span><b>${esc(eur(entTot))}</b></div>
          <div><span>Da abbinare</span><b style="color:${daAbb > 0.005 ? 'var(--warn)' : 'var(--ok)'}">${esc(eur(Math.max(0, daAbb)))}</b></div>
          <div><span>Uscite (ristorante)</span><b>${esc(eur(uscTot))}</b></div><div><span>Incassato registrato</span><b>${esc(eur(inc))}</b></div>
          <div><span>Margine</span><b style="color:${marg >= 0 ? 'var(--ok)' : 'var(--bad)'}">${esc(eur(marg))}</b></div>${cop && uscTot ? `<div><span>Costo a coperto</span><b>${esc(eur(uscTot / cop))}</b></div>` : ''}</div>
        ${nonVer ? `<span class="hint" style="flex:1 1 100%">${nonVer} ${nonVer === 1 ? 'bonifico registrato' : 'bonifici registrati'} a mano non ancora verificati in banca.</span>` : ''}`;
    };
    $('#ag-banca', ov).addEventListener('change', async (e) => {
      if (e.target.id !== 'ag-ev') return;
      const v = e.target.value; let nome = null;
      if (v === '_nuovo') {
        nome = (window.prompt('Nome dell’evento in Tesoreria:', 'Agape ' + String(t.data).slice(0, 4)) || '').trim();
        if (!nome) { banca(); return; }
      }
      try {
        if (evento) chk(await state.sb.from('eventi_conto').update({ tornata_id: null }).eq('id', evento.id).select('id'));
        if (nome) chk(await state.sb.from('eventi_conto').insert({ nome, data_evento: t.data, tornata_id: t.id }).select('id'));
        else if (v) { const r = chk(await state.sb.from('eventi_conto').update({ tornata_id: t.id }).eq('id', v).select('id')); if (!r.length) throw new Error('Non hai i permessi per modificare gli eventi della Tesoreria.'); }
        toast(v ? 'Agape collegata all’evento' : 'Collegamento tolto', 'ok');
      } catch (er) { toast(/tornata_id/i.test((er && er.message) || '') ? MANCA_SQL45 : (er && er.code === '23505' ? 'Quell’evento è già collegato a un’altra agape.' : messaggioErrore(er)), 'bad'); }
      await caricaBanca(); banca();
    });
    $('#ag-banca', ov).addEventListener('click', (e) => { if (e.target.closest('#ag-abbina')) apriAbbina(); });

    // abbinamento dei movimenti di banca ai partecipanti
    function apriAbbina() {
      if (!evento) return;
      const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const suggerisci = (m) => {
        if (m.fratello_id && fr.some((f) => f.id === m.fratello_id)) return 'f:' + m.fratello_id;
        const d = norm(m.descrizione);
        for (const f of elenco) if (d.includes(norm(f.cognome)) && d.includes(norm(f.nome))) return 'f:' + f.id;
        for (const o of os) if (d.includes(norm(o.cognome)) && d.includes(norm(o.nome))) return 'o:' + o.id;
        return /contant|versamento/.test(d) ? 'c' : '';
      };
      const opzioniChi = (sel) => `<option value="">— scegli —</option><option value="c" ${sel === 'c' ? 'selected' : ''}>Versamento di contanti</option>
        <optgroup label="Fratelli">${elenco.map((f) => `<option value="f:${esc(f.id)}" ${sel === 'f:' + f.id ? 'selected' : ''}>${esc(f.cognome + ' ' + f.nome)}</option>`).join('')}</optgroup>
        ${os.length ? `<optgroup label="Ospiti con nome">${os.map((o) => `<option value="o:${esc(o.id)}" ${sel === 'o:' + o.id ? 'selected' : ''}>${esc(o.cognome + ' ' + o.nome)}</option>`).join('')}</optgroup>` : ''}`;
      let extra = [];
      const sub = document.createElement('div');
      sub.className = 'modal-ov';
      sub.innerHTML = `<div class="modal wide" role="dialog" aria-modal="true" aria-label="Abbina movimenti">
        <div class="modal-h"><div><h2 style="margin:0">Abbina movimenti</h2><div class="hint">Entrate in banca di «${esc(evento.nome)}» non ancora attribuite a chi ha pagato</div></div><button class="btn ghost small" type="button" data-x2>Chiudi</button></div>
        <div class="modal-b"><label style="display:flex;gap:6px;align-items:center;font-weight:500;margin-bottom:10px"><input type="checkbox" id="ab-extra"> Mostra anche le entrate degli ultimi 120 giorni non collegate a nessun evento</label>
          <div class="table-wrap"><table><thead><tr><th>Data</th><th>Descrizione</th><th class="num">Importo</th><th class="num">Da abbinare</th><th>Chi ha pagato</th><th></th></tr></thead><tbody id="ab-righe"></tbody></table></div>
          <p class="hint" style="margin-top:10px">Per un bonifico si registra un pagamento «Bonifico» alla persona scelta. Per un «Versamento di contanti» tutti i contanti ancora da versare risultano versati con la data del movimento. Se un bonifico copre più persone, abbinalo una volta per ciascuna cambiando l’importo.</p></div></div>`;
      document.body.appendChild(sub);
      const righeDa = () => [
        ...movs.filter((m) => num(m.importo) > 0).map((m) => ({ m, dentro: true, res: num(m.importo) - alloc(m) })),
        ...extra.filter((m) => !movs.some((x) => x.id === m.id)).map((m) => ({ m, dentro: false, res: num(m.importo) })),
      ].filter((r) => r.res > 0.005);
      const rendi = () => {
        const l = righeDa();
        $('#ab-righe', sub).innerHTML = l.length ? l.map(({ m, dentro, res }) => `<tr data-m="${esc(m.id)}"><td>${esc(fmtData(m.data_operazione))}</td><td>${esc(m.descrizione || '')}${dentro ? '' : ' <span class="badge warn">senza evento</span>'}</td>
          <td class="num">${esc(eur(m.importo))}</td><td class="num"><input data-abi="${esc(m.id)}" inputmode="decimal" style="width:92px;text-align:right" value="${esc(String(Math.round(res * 100) / 100).replace('.', ','))}" aria-label="Importo da abbinare"></td>
          <td><select data-abs="${esc(m.id)}" aria-label="Chi ha pagato">${opzioniChi(suggerisci(m))}</select></td><td><button type="button" class="btn small" data-abb="${esc(m.id)}">Abbina</button></td></tr>`).join('')
          : '<tr><td colspan="6"><div class="empty">Tutte le entrate dell’evento sono già abbinate.</div></td></tr>';
      };
      const chiudiSub = () => { document.removeEventListener('keydown', escSub, true); sub.remove(); disegna(); disegnaOsp(); };
      const escSub = (e) => { if (e.key === 'Escape') { e.stopPropagation(); chiudiSub(); } };
      document.addEventListener('keydown', escSub, true);
      $('[data-x2]', sub).onclick = chiudiSub;
      sub.addEventListener('mousedown', (e) => { if (e.target === sub) chiudiSub(); });
      $('#ab-extra', sub).addEventListener('change', async (e) => {
        if (!e.target.checked) { extra = []; rendi(); return; }
        const d = new Date(String(t.data) + 'T00:00:00'); d.setDate(d.getDate() - 120);
        const da = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        try { extra = chk(await state.sb.from('conto_movimenti').select('id,data_operazione,descrizione,importo,fratello_id').is('evento_id', null).gt('importo', 0).gte('data_operazione', da).order('data_operazione')); }
        catch (er) { toast(messaggioErrore(er), 'bad'); e.target.checked = false; return; }
        rendi();
      });
      $('#ab-righe', sub).addEventListener('click', async (e) => {
        const b = e.target.closest('[data-abb]'); if (!b) return;
        const id = b.dataset.abb, riga = righeDa().find((r) => r.m.id === id); if (!riga) return;
        const { m, dentro, res } = riga;
        const chi = $('[data-abs="' + id + '"]', sub).value, v = importo($('[data-abi="' + id + '"]', sub).value);
        if (!chi) { toast('Scegli chi ha pagato.', 'bad'); return; }
        if (chi !== 'c' && (v === null || !(v > 0) || v > res + 0.005)) { toast('Importo non valido: al massimo ' + eur(res) + '.', 'bad'); return; }
        let dav = [];
        if (chi === 'c') {
          dav = pag.filter((p) => p.metodo === 'contanti' && !p.versato_il);
          if (!dav.length) { toast('Non ci sono contanti da versare: registra prima i pagamenti in contanti.', 'bad'); return; }
          if (Math.abs(somma(dav) - num(m.importo)) > 0.005 && !confirm('I contanti da versare sono ' + eur(somma(dav)) + ' ma il movimento è di ' + eur(m.importo) + '. Segnarli lo stesso come versati con questo movimento?')) return;
        }
        b.disabled = true;
        try {
          if (!dentro) {
            const r = chk(await state.sb.from('conto_movimenti').update({ evento_id: evento.id }).eq('id', m.id).select('id'));
            if (!r.length) throw new Error('Non hai i permessi per collegare il movimento all’evento.');
            movs.push(m); extra = extra.filter((x) => x.id !== m.id);
          }
          if (chi === 'c') {
            const r = chk(await state.sb.from('agape_pagamenti').update({ versato_il: m.data_operazione, versamento_id: m.id }).in('id', dav.map((p) => p.id)).select());
            const mp = {}; r.forEach((x) => { mp[x.id] = x; }); pag = pag.map((p) => mp[p.id] || p);
            toast('Contanti segnati come versati con questo movimento', 'ok');
          } else {
            const dati = { tornata_id: t.id, importo: v, metodo: 'bonifico', data: m.data_operazione, nota: 'Bonifico del ' + fmtData(m.data_operazione), movimento_id: m.id };
            dati[chi[0] === 'f' ? 'fratello_id' : 'ospite_id'] = chi.slice(2);
            pag.push(chk(await state.sb.from('agape_pagamenti').insert(dati).select().single()));
            toast('Bonifico abbinato', 'ok');
          }
        } catch (er) { toast(/movimento_id|versamento_id/i.test((er && er.message) || '') ? MANCA_SQL45 : messaggioErrore(er), 'bad'); }
        rendi(); kpi();
      });
      rendi();
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
