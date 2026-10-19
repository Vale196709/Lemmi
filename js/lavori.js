/* Lemmi - sezione "Lavori e tavole": assegnazione, consegna e archivio dei lavori dei Fratelli. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, fmtData, isoToIt, itToIso, oggi, IC, mascheraDate } = L;

  const BUCKET = 'tavole';
  const MAX_BYTE = 10 * 1024 * 1024;
  const MIME = {
    pdf: 'application/pdf', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    odt: 'application/vnd.oasis.opendocument.text', txt: 'text/plain',
  };
  const RUOLI_GESTIONE = ['amministratore', 'venerabile', 'segretario'];
  const RUOLI_CANCELLA = ['amministratore', 'segretario'];
  const puoGestire = () => RUOLI_GESTIONE.includes(state.profilo && state.profilo.ruolo);
  const puoCancellare = () => RUOLI_CANCELLA.includes(state.profilo && state.profilo.ruolo);

  const TIPI = { tavola: 'Tavola', formazione: 'Tornata di formazione', relazione: 'Relazione', altro: 'Altro' };
  const GRADI = { apprendista: 'Apprendista', compagno: 'Compagno d’Arte', maestro: 'Maestro' };
  const TIPI_TORNATA = { ordinaria: 'Ordinaria', informale: 'Informale', straordinaria: 'Straordinaria', agape: 'Agape' };
  const STATI = { assegnato: 'Assegnato', in_preparazione: 'In preparazione', consegnato: 'Consegnato', presentato: 'Presentato', archiviato: 'Archiviato' };
  const STATO_BADGE = { assegnato: 'gray', in_preparazione: 'warn', consegnato: 'info', presentato: 'ok', archiviato: 'gray' };
  const APERTI = ['assegnato', 'in_preparazione'];

  const lv = { righe: [], fratelli: [], tornate: {}, q: '', stato: '', grado: '' };

  const opzioni = (mappa, sel, vuoto) => (vuoto !== undefined ? `<option value="">${esc(vuoto)}</option>` : '') +
    Object.keys(mappa).map((k) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(mappa[k])}</option>`).join('');
  const nomeFratello = (id) => { const f = lv.fratelli.find((x) => x.id === id); return f ? f.cognome + ' ' + f.nome : ''; };
  const autoreDi = (l) => (l.fratello_id ? nomeFratello(l.fratello_id) : (l.autore_esterno || '')) || '—';
  const etichettaTornata = (t) => (t ? `${fmtData(t.data)} · ${TIPI_TORNATA[t.tipo] || t.tipo}${t.grado ? ' · ' + GRADI[t.grado] : ''}` : '');
  const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const estensione = (nome) => { const m = /\.([A-Za-z0-9]+)$/.exec(nome || ''); return m ? m[1].toLowerCase() : ''; };
  const nomeSicuro = (nome) => String(nome || 'file').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(-80) || 'file';
  const nuovoId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));

  async function carica() {
    const sb = state.sb;
    const [lav, fra] = await Promise.all([
      sb.from('lavori').select('*').order('created_at', { ascending: false }),
      sb.from('fratelli').select('id,cognome,nome,stato').order('cognome'),
    ]);
    lv.righe = chk(lav); lv.fratelli = chk(fra);
    const ids = Array.from(new Set(lv.righe.map((r) => r.tornata_id).filter(Boolean)));
    lv.tornate = {};
    if (ids.length) chk(await sb.from('tornate').select('id,data,tipo,grado').in('id', ids)).forEach((t) => { lv.tornate[t.id] = t; });
  }

  /* ---------- finestra ---------- */
  function finestra(titolo, corpo, opt) {
    const ov = document.createElement('div');
    ov.className = 'modal-ov';
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titolo)}">
      <div class="modal-h"><h2 style="margin:0">${esc(titolo)}</h2><button class="btn ghost small" type="button" data-x>Chiudi</button></div>
      <div class="modal-b"><form novalidate>${corpo}<div class="err" data-err style="margin-top:10px"></div>
        <div class="actions" style="margin-top:14px"><button class="btn gold" type="submit">${esc(opt.testoOk || 'Salva')}</button>${opt.extra || ''}</div></form></div></div>`;
    document.body.appendChild(ov);
    const tasto = (e) => { if (e.key === 'Escape') chiudi(); };
    const chiudi = () => { document.removeEventListener('keydown', tasto); ov.remove(); };
    document.addEventListener('keydown', tasto);
    $('[data-x]', ov).onclick = chiudi;
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) chiudi(); });
    const f = $('form', ov);
    const errore = (msg) => { $('[data-err]', ov).textContent = msg; };
    mascheraDate(ov);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); errore('');
      const b = $('button[type=submit]', f); b.disabled = true;
      try { await opt.onSubmit(f, chiudi, errore); } catch (e) { errore(messaggioErrore(e)); }
      b.disabled = false;
    });
    return { ov, f, chiudi, errore };
  }

  /* ---------- file ---------- */
  async function scaricaFile(l) {
    const r = chk(await state.sb.storage.from(BUCKET).createSignedUrl(l.file_path, 60, { download: l.file_nome || true }));
    const a = document.createElement('a');
    a.href = r.signedUrl; a.rel = 'noopener noreferrer'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
  }
  const rimuoviOggetto = async (path) => { if (path) { try { await state.sb.storage.from(BUCKET).remove([path]); } catch (e) { /* si ripulisce a mano se serve */ } } };

  /* ---------- nuovo / modifica ---------- */
  async function apriLavoro(l) {
    const nuovo = !l;
    const x = l || { titolo: '', tema: '', tipo: 'tavola', fratello_id: null, autore_esterno: '', grado_autore: '', grado_tornata: '', tornata_id: '', data_assegnazione: oggi(), data_consegna_prevista: '', data_presentazione: '', stato: 'assegnato', note: '' };
    // tornate selezionabili: dagli ultimi 4 mesi in avanti, più quella già collegata
    const da = new Date(); da.setMonth(da.getMonth() - 4);
    const tor = chk(await state.sb.from('tornate').select('id,data,tipo,grado').gte('data', da.toISOString().slice(0, 10)).neq('stato', 'annullata').order('data').limit(250));
    if (x.tornata_id && !tor.find((t) => t.id === x.tornata_id) && lv.tornate[x.tornata_id]) tor.push(lv.tornate[x.tornata_id]);
    tor.sort((a, b) => a.data.localeCompare(b.data));
    const esterno = !!(x.autore_esterno && !x.fratello_id);

    const corpo = `<div class="form-grid">
      <div class="f s8"><label for="l-tit">Titolo <span class="req">*</span></label><input id="l-tit" name="titolo" value="${esc(x.titolo)}"></div>
      <div class="f s4"><label for="l-tipo">Tipo</label><select id="l-tipo" name="tipo">${opzioni(TIPI, x.tipo)}</select></div>
      <div class="f s12"><label for="l-tema">Tema / argomento</label><input id="l-tema" name="tema" value="${esc(x.tema || '')}"></div>
      <div class="f s6"><label for="l-aut">Autore <span class="req">*</span></label>
        <input id="l-aut" name="autore" list="dl-l-aut" autocomplete="off" placeholder="${esterno ? 'Nome e cognome dell’autore' : 'Scrivi il cognome e scegli dall’elenco'}" value="${esc(esterno ? x.autore_esterno : (x.fratello_id ? nomeFratello(x.fratello_id) : ''))}">
        <datalist id="dl-l-aut">${lv.fratelli.map((f) => `<option value="${esc(f.cognome + ' ' + f.nome)}"></option>`).join('')}</datalist>
        <label style="display:flex;gap:6px;align-items:center;font-weight:500;margin-top:6px"><input type="checkbox" name="esterno" ${esterno ? 'checked' : ''}> Autore non iscritto in Loggia (ospite o visitatore)</label></div>
      <div class="f s3"><label for="l-ga">Grado dell’autore</label><select id="l-ga" name="grado_autore">${opzioni(GRADI, x.grado_autore, '—')}</select></div>
      <div class="f s3"><label for="l-gt">Grado della tornata</label><select id="l-gt" name="grado_tornata">${opzioni(GRADI, x.grado_tornata, '—')}</select></div>
      <div class="f s8"><label for="l-tor">Tornata prevista</label><select id="l-tor" name="tornata_id"><option value="">— da stabilire —</option>${tor.map((t) => `<option value="${esc(t.id)}" ${t.id === x.tornata_id ? 'selected' : ''}>${esc(etichettaTornata(t))}</option>`).join('')}</select></div>
      <div class="f s4"><label for="l-stato">Stato</label><select id="l-stato" name="stato">${opzioni(STATI, x.stato)}</select></div>
      <div class="f s4"><label for="l-d1">Assegnazione</label><input id="l-d1" name="data_assegnazione" value="${esc(isoToIt(x.data_assegnazione))}" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off"></div>
      <div class="f s4"><label for="l-d2">Consegna prevista</label><input id="l-d2" name="data_consegna_prevista" value="${esc(isoToIt(x.data_consegna_prevista))}" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off"></div>
      <div class="f s4"><label for="l-d3">Presentazione</label><input id="l-d3" name="data_presentazione" value="${esc(isoToIt(x.data_presentazione))}" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off"></div>
      <div class="f s12"><label for="l-note">Note</label><textarea id="l-note" name="note" rows="3">${esc(x.note || '')}</textarea></div>
      <div class="f s12"><label for="l-file">File della tavola (PDF, Word, ODT o testo, fino a 10 MB)</label>
        ${x.file_path ? `<div class="hint" style="margin-bottom:6px">File attuale: <b>${esc(x.file_nome || 'allegato')}</b>${x.file_dimensione ? ' · ' + kb(x.file_dimensione) : ''}. Scegliendone un altro, lo sostituisci.</div>
          <label style="display:flex;gap:6px;align-items:center;font-weight:500;margin-bottom:6px"><input type="checkbox" name="rimuovi_file"> Rimuovi il file attuale</label>` : ''}
        <input id="l-file" name="file" type="file" accept=".pdf,.doc,.docx,.odt,.txt"></div></div>`;
    const extra = !nuovo && puoCancellare() ? '<button class="btn danger" type="button" data-del>Elimina</button>' : '';

    const m = finestra(nuovo ? 'Nuovo lavoro' : 'Modifica lavoro', corpo, {
      extra,
      onSubmit: async (f, chiudi, errore) => {
        const e = f.elements;
        const titolo = e.titolo.value.trim();
        if (!titolo) return errore('Indica il titolo.');
        const testoAutore = e.autore.value.trim();
        let fratello_id = null, autore_esterno = null;
        if (e.esterno.checked) {
          if (!testoAutore) return errore('Indica il nome dell’autore.');
          autore_esterno = testoAutore;
        } else {
          const t = testoAutore.toLowerCase().replace(/\s+/g, ' ');
          const fr = lv.fratelli.find((q) => (q.cognome + ' ' + q.nome).toLowerCase() === t || (q.nome + ' ' + q.cognome).toLowerCase() === t);
          if (!fr) return errore(testoAutore ? 'Autore non trovato: scegli dall’elenco, oppure spunta “Autore non iscritto in Loggia”.' : 'Indica l’autore: scrivi il cognome e scegli dall’elenco.');
          fratello_id = fr.id;
        }
        const d1 = itToIso(e.data_assegnazione.value), d2 = itToIso(e.data_consegna_prevista.value), d3 = itToIso(e.data_presentazione.value);
        if ([d1, d2, d3].includes('ERR')) return errore('Controlla le date: usa il formato gg/mm/aaaa.');
        let data_presentazione = d3;
        if (e.stato.value === 'presentato' && !data_presentazione && e.tornata_id.value) {
          const t = tor.find((q) => q.id === e.tornata_id.value); if (t) data_presentazione = t.data;
        }
        const dati = {
          titolo, tema: e.tema.value.trim() || null, tipo: e.tipo.value, fratello_id, autore_esterno,
          grado_autore: e.grado_autore.value || null, grado_tornata: e.grado_tornata.value || null,
          tornata_id: e.tornata_id.value || null, data_assegnazione: d1, data_consegna_prevista: d2, data_presentazione,
          stato: e.stato.value, note: e.note.value.trim() || null,
        };

        // file
        const id = nuovo ? nuovoId() : l.id;
        const file = e.file.files && e.file.files[0];
        let caricato = null;
        if (file) {
          const ext = estensione(file.name);
          if (!MIME[ext]) return errore('Formato non ammesso: usa PDF, Word (doc, docx), ODT o testo.');
          if (file.size > MAX_BYTE) return errore('Il file supera i 10 MB.');
          const path = id + '/' + Date.now() + '_' + nomeSicuro(file.name);
          chk(await state.sb.storage.from(BUCKET).upload(path, file, { contentType: MIME[ext], upsert: false }));
          caricato = path;
          Object.assign(dati, { file_path: path, file_nome: file.name, file_tipo: MIME[ext], file_dimensione: file.size });
        } else if (!nuovo && e.rimuovi_file && e.rimuovi_file.checked) {
          Object.assign(dati, { file_path: null, file_nome: null, file_tipo: null, file_dimensione: null });
        }
        try {
          if (nuovo) chk(await state.sb.from('lavori').insert(Object.assign({ id }, dati)));
          else chk(await state.sb.from('lavori').update(dati).eq('id', id));
        } catch (er) {
          await rimuoviOggetto(caricato);          // il salvataggio non è riuscito: niente file orfani
          throw er;
        }
        if (!nuovo && l.file_path && ('file_path' in dati) && dati.file_path !== l.file_path) await rimuoviOggetto(l.file_path);
        chiudi(); toast('Lavoro salvato', 'ok'); L.route();
      },
    });

    // il grado dell'autore si propone in base al grado attuale del Fratello scelto
    let ultimo = null;
    const proponiGrado = async () => {
      const e = m.f.elements;
      if (e.esterno.checked) return;
      const t = e.autore.value.trim().toLowerCase().replace(/\s+/g, ' ');
      const fr = lv.fratelli.find((q) => (q.cognome + ' ' + q.nome).toLowerCase() === t || (q.nome + ' ' + q.cognome).toLowerCase() === t);
      if (!fr || fr.id === ultimo) return;
      ultimo = fr.id;
      if (e.grado_autore.value) return;
      try {
        const r = chk(await state.sb.from('v_fratelli_completi').select('grado_attuale').eq('id', fr.id).maybeSingle());
        const g = r && String(r.grado_attuale || '').toLowerCase();
        if (g && GRADI[g] && !e.grado_autore.value) e.grado_autore.value = g;
      } catch (er) { /* facoltativo */ }
    };
    m.f.elements.autore.addEventListener('change', proponiGrado);
    m.f.elements.autore.addEventListener('input', proponiGrado);
    m.f.elements.esterno.addEventListener('change', () => {
      m.f.elements.autore.placeholder = m.f.elements.esterno.checked ? 'Nome e cognome dell’autore' : 'Scrivi il cognome e scegli dall’elenco';
      if (m.f.elements.esterno.checked) m.f.elements.autore.removeAttribute('list'); else m.f.elements.autore.setAttribute('list', 'dl-l-aut');
    });
    if (esterno) m.f.elements.autore.removeAttribute('list');
    // scegliendo la tornata, si propone il suo grado
    m.f.elements.tornata_id.addEventListener('change', () => {
      const t = tor.find((q) => q.id === m.f.elements.tornata_id.value);
      if (t && t.grado && !m.f.elements.grado_tornata.value) m.f.elements.grado_tornata.value = t.grado;
    });

    const del = $('[data-del]', m.ov);
    if (del) del.onclick = async () => {
      if (!window.confirm('Eliminare definitivamente questo lavoro e il file allegato?')) return;
      try {
        if (l.file_path) chk(await state.sb.storage.from(BUCKET).remove([l.file_path]));
        chk(await state.sb.from('lavori').delete().eq('id', l.id));
        m.chiudi(); toast('Lavoro eliminato', 'ok'); L.route();
      } catch (er) { m.errore(messaggioErrore(er)); }
    };
  }

  /* ---------- vista ---------- */
  L.viste.lavori = async function (v) {
    await carica();
    const oggiIso = oggi();
    v.innerHTML = `
      <div class="page-head"><div><h1>Lavori e tavole</h1><p>Lavori assegnati ai Fratelli e tavole presentate in Loggia</p></div>
        <div class="right actions">${puoGestire() ? `<button class="btn gold" id="lv-new">${IC.plus} Nuovo lavoro</button>` : ''}</div></div>
      <div class="actions" style="margin-bottom:14px;flex-wrap:wrap">
        <div class="searchbar">${IC.search}<input id="lv-q" type="search" placeholder="Cerca per titolo, tema o autore…" value="${esc(lv.q)}"></div>
        <select id="lv-stato" style="width:auto"><option value="">Tutti gli stati</option><option value="_aperti" ${lv.stato === '_aperti' ? 'selected' : ''}>Da completare</option>${opzioni(STATI, lv.stato)}</select>
        <select id="lv-grado" style="width:auto">${opzioni(GRADI, lv.grado, 'Tutti i gradi')}</select>
        <span class="muted" id="lv-conta"></span></div>
      <div id="lv-corpo"></div>`;
    if (puoGestire()) $('#lv-new').onclick = () => apriLavoro(null).catch((e) => toast(messaggioErrore(e), 'bad'));
    $('#lv-q').addEventListener('input', (e) => { lv.q = e.target.value; disegna(); });
    $('#lv-stato').addEventListener('change', (e) => { lv.stato = e.target.value; disegna(); });
    $('#lv-grado').addEventListener('change', (e) => { lv.grado = e.target.value; disegna(); });

    function disegna() {
      const q = lv.q.trim().toLowerCase();
      const lista = lv.righe.filter((r) => {
        if (lv.stato === '_aperti' ? !APERTI.includes(r.stato) : (lv.stato && r.stato !== lv.stato)) return false;
        if (lv.grado && r.grado_tornata !== lv.grado && r.grado_autore !== lv.grado) return false;
        if (!q) return true;
        return [r.titolo, r.tema, autoreDi(r)].some((s) => String(s || '').toLowerCase().includes(q));
      });
      $('#lv-conta').textContent = lista.length + (lista.length === 1 ? ' lavoro' : ' lavori');
      const c = $('#lv-corpo');
      if (!lista.length) {
        c.innerHTML = `<div class="card empty">${IC.inbox}<div>${lv.righe.length ? 'Nessun risultato.' : 'Nessun lavoro registrato.' + (puoGestire() ? ' Usa “Nuovo lavoro” per assegnarne uno.' : '')}</div></div>`;
        return;
      }
      c.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Lavoro</th><th>Autore</th><th>Tornata</th><th>Consegna</th><th>Stato</th><th>File</th><th></th></tr></thead><tbody>
        ${lista.map((r) => {
          const t = lv.tornate[r.tornata_id];
          const ritardo = APERTI.includes(r.stato) && r.data_consegna_prevista && r.data_consegna_prevista < oggiIso;
          return `<tr>
            <td><b>${esc(r.titolo)}</b><div class="hint">${esc(TIPI[r.tipo] || r.tipo)}${r.tema ? ' · ' + esc(r.tema) : ''}</div></td>
            <td>${esc(autoreDi(r))}${r.grado_autore ? `<div class="hint">${esc(GRADI[r.grado_autore])}</div>` : ''}</td>
            <td>${t ? esc(etichettaTornata(t)) : '<span class="muted">da stabilire</span>'}${!t && r.grado_tornata ? `<div class="hint">${esc(GRADI[r.grado_tornata])}</div>` : ''}</td>
            <td>${r.data_consegna_prevista ? fmtData(r.data_consegna_prevista) : '—'}${ritardo ? '<div><span class="badge bad">in ritardo</span></div>' : ''}</td>
            <td><span class="badge ${STATO_BADGE[r.stato]}">${esc(STATI[r.stato])}</span>${r.data_presentazione ? `<div class="hint">${fmtData(r.data_presentazione)}</div>` : ''}</td>
            <td>${r.file_path ? `<button class="btn ghost small" data-dl="${esc(r.id)}" title="${esc(r.file_nome || '')}">Scarica</button>` : '<span class="muted">—</span>'}</td>
            <td class="act">${puoGestire() ? `<button class="btn ghost small" data-mod="${esc(r.id)}">Modifica</button>` : ''}</td></tr>`;
        }).join('')}</tbody></table></div>`;
      $$('[data-mod]', c).forEach((b) => b.addEventListener('click', () => apriLavoro(lv.righe.find((x) => x.id === b.dataset.mod)).catch((e) => toast(messaggioErrore(e), 'bad'))));
      $$('[data-dl]', c).forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        try { await scaricaFile(lv.righe.find((x) => x.id === b.dataset.dl)); } catch (e) { toast(messaggioErrore(e), 'bad'); }
        b.disabled = false;
      }));
    }
    disegna();
  };

  /* ---------- riquadro nella scheda del Fratello ---------- */
  L.schedaExtra = L.schedaExtra || [];
  L.schedaExtra.push(async (v, fratelloId) => {
    if (!puoGestire()) return;
    const righe = chk(await state.sb.from('lavori').select('id,titolo,tipo,stato,tornata_id,data_presentazione').eq('fratello_id', fratelloId).order('created_at', { ascending: false }));
    const ids = Array.from(new Set(righe.map((r) => r.tornata_id).filter(Boolean)));
    const tor = {};
    if (ids.length) chk(await state.sb.from('tornate').select('id,data').in('id', ids)).forEach((t) => { tor[t.id] = t; });
    const html = `<div class="card"><h2>Lavori e tavole <small>${righe.length}</small></h2>
      ${righe.length ? `<div class="table-wrap"><table><tbody>${righe.map((r) => `<tr><td><b>${esc(r.titolo)}</b><div class="hint">${esc(TIPI[r.tipo] || r.tipo)}</div></td>
        <td>${tor[r.tornata_id] ? fmtData(tor[r.tornata_id].data) : '<span class="muted">data da stabilire</span>'}</td>
        <td><span class="badge ${STATO_BADGE[r.stato]}">${esc(STATI[r.stato])}</span></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="empty">${IC.inbox}<div>Nessun lavoro registrato per questo Fratello.</div></div>`}
      <div style="margin-top:10px"><a href="#/lavori">Vai a Lavori e tavole</a></div></div>`;
    v.insertAdjacentHTML('beforeend', html);
  });
})();
