/* Lemmi - Agapi: adesioni dei Fratelli, ospiti, coperti e quote (script sql/lemmi_aggiornamento_42.sql).
 * - Calendario: su ogni tornata con agape un'etichetta «Agape · N» apre l'elenco delle adesioni.
 *   Venerabile, Segretario, Tesoriere e amministratore segnano risposte, ospiti, note e incassi.
 * - Area del Fratello: «Partecipo» / «Non partecipo» sulle prossime agapi, con il numero di ospiti. */
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

  // conteggi per tornata: { id: { si, no, ospiti } } (vuoto se lo script non è stato eseguito)
  async function conteggi(ids) {
    const out = {};
    try {
      chk(await state.sb.from('agape_adesioni').select('tornata_id,partecipa,ospiti').in('tornata_id', ids)).forEach((a) => {
        const c = out[a.tornata_id] || (out[a.tornata_id] = { si: 0, no: 0, ospiti: 0 });
        if (a.partecipa) { c.si++; c.ospiti += num(a.ospiti); } else c.no++;
      });
    } catch (e) { /* tabella assente: nessun conteggio */ }
    return out;
  }

  function badge(t, c) {
    const coperti = c ? c.si + c.ospiti : 0;
    const testo = 'Agape' + (c ? ' · ' + coperti + (coperti === 1 ? ' coperto' : ' coperti') : '') + (t.quota_agape ? ' · ' + eur(t.quota_agape) : '');
    return gestisce() ? `<button type="button" class="badge gold" data-agape="${esc(t.id)}" title="Adesioni all’agape">${esc(testo)}</button>` : `<span class="badge gold">${esc(testo)}</span>`;
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
    const per = {}; ad.forEach((a) => { per[a.fratello_id] = a; });
    // invitati: i Fratelli attivi, più chiunque abbia già una risposta registrata
    const elenco = fr.filter((f) => f.stato === 'attivo' || per[f.id]);
    const quota = num(t.quota_agape);
    const chiusa = t.data < oggi();

    const ov = document.createElement('div');
    ov.className = 'modal-ov';
    ov.innerHTML = `<div class="modal wide" role="dialog" aria-modal="true" aria-label="Adesioni all’agape">
      <div class="modal-h"><div><h2 style="margin:0">Agape del ${fmtData(t.data)}</h2>
        <div class="hint">${quota ? 'Quota ' + eur(quota) + ' a persona' : 'Quota non indicata'}${t.adesioni_entro ? ' · adesioni entro il ' + fmtData(t.adesioni_entro) : ''}${t.luogo ? ' · ' + esc(t.luogo) : ''}</div></div>
        <button class="btn ghost small" type="button" data-x>Chiudi</button></div>
      <div class="modal-b">
        <div class="ag-kpi" id="ag-kpi"></div>
        <div class="actions" style="margin-bottom:12px">
          <div class="searchbar" style="flex:1 1 220px">${L.IC.search}<input id="ag-q" type="search" placeholder="Cerca un Fratello…"></div>
          <select id="ag-f" style="width:auto"><option value="">Tutti</option><option value="si">Partecipano</option><option value="no">Non partecipano</option><option value="nr">Senza risposta</option></select>
          <button class="btn ghost small" type="button" id="ag-copia">Copia elenco per il ristorante</button>
          ${L.wa ? `<button class="btn ghost small wa" type="button" id="ag-wa">Invito su WhatsApp</button>` : ''}
        </div>
        ${chiusa ? '<div class="notice" style="margin-bottom:10px">L’agape si è già svolta: puoi ancora correggere presenze e incassi.</div>' : ''}
        <div class="table-wrap"><table><thead><tr><th>Fratello</th><th>Risposta</th><th>Ospiti</th><th>Note</th><th class="num">Incassato</th></tr></thead><tbody id="ag-righe"></tbody></table></div>
        <p class="hint" style="margin-top:10px">Ogni modifica si salva da sola. Le risposte date dal Fratello nella sua area sono segnate con «dall’app».</p>
      </div></div>`;
    document.body.appendChild(ov);
    const chiudi = () => { document.removeEventListener('keydown', escTasto); ov.remove(); L.route(); };
    const escTasto = (e) => { if (e.key === 'Escape') chiudi(); };
    document.addEventListener('keydown', escTasto);
    $('[data-x]', ov).onclick = chiudi;
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) chiudi(); });

    const kpi = () => {
      const si = ad.filter((a) => a.partecipa), no = ad.filter((a) => !a.partecipa);
      const ospiti = si.reduce((s, a) => s + num(a.ospiti), 0), coperti = si.length + ospiti;
      const nr = elenco.filter((f) => !per[f.id]).length;
      const incassato = ad.reduce((s, a) => s + num(a.incassato), 0);
      $('#ag-kpi', ov).innerHTML = `<div><span>Fratelli presenti</span><b>${si.length}</b></div><div><span>Ospiti</span><b>${ospiti}</b></div>
        <div><span>Coperti</span><b>${coperti}</b></div><div><span>Assenti</span><b>${no.length}</b></div><div><span>Senza risposta</span><b>${nr}</b></div>
        ${quota ? `<div><span>Da incassare</span><b>${eur(coperti * quota)}</b></div>` : ''}<div><span>Incassato</span><b style="color:${quota && incassato >= coperti * quota && coperti ? 'var(--ok)' : 'inherit'}">${eur(incassato)}</b></div>`;
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
          <td class="num"><input data-inc="${esc(f.id)}" inputmode="decimal" style="width:96px;text-align:right" value="${a && a.incassato !== null && a.incassato !== undefined ? esc(String(a.incassato).replace('.', ',')) : ''}" placeholder="${a && a.partecipa && quota ? esc(String((1 + num(a.ospiti)) * quota).replace('.', ',')) : ''}" ${a && a.partecipa ? '' : 'disabled'} aria-label="Incassato"></td></tr>`;
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
        const s = el.value.trim().replace(/[€\s]/g, '');
        const v = s === '' ? null : Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
        if (v !== null && !(v >= 0)) { toast('Importo non valido: scrivi per esempio 35,00.', 'bad'); return; }
        await salva(el.dataset.inc, { incassato: v });
      } else return;
      disegna();
    });
    $('#ag-q', ov).addEventListener('input', disegna);
    $('#ag-f', ov).addEventListener('change', disegna);

    // elenco per il ristorante: coperti, nomi e note
    $('#ag-copia', ov).addEventListener('click', async () => {
      const si = elenco.filter((f) => per[f.id] && per[f.id].partecipa);
      const coperti = si.reduce((s, f) => s + 1 + num(per[f.id].ospiti), 0);
      const righe = [`Agape del ${fmtData(t.data)} – ${coperti} coperti`, '', ...si.map((f) => {
        const a = per[f.id];
        return `• ${f.cognome} ${f.nome}${num(a.ospiti) ? ' + ' + num(a.ospiti) + (num(a.ospiti) === 1 ? ' ospite' : ' ospiti') : ''}${a.note ? ' (' + a.note + ')' : ''}`;
      })];
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
    disegna();
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
