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
    await L.zipFile.scarica(BUCKET, l.file_path, l.file_nome, MIME[estensione(l.file_nome)]);
  }
  const rimuoviOggetto = async (path) => { if (path) { try { await state.sb.storage.from(BUCKET).remove([path]); } catch (e) { /* si ripulisce a mano se serve */ } } };

  /* ---------- nuovo / modifica ---------- */
  async function apriLavoro(l, predef) {
    const nuovo = !l;
    if (!lv.fratelli.length) lv.fratelli = chk(await state.sb.from('fratelli').select('id,cognome,nome,stato').order('cognome'));
    const x = l || Object.assign({ titolo: '', tema: '', fratello_id: null, autore_esterno: '', grado_tornata: '', data_presentazione: oggi(), data_discussione: null, note: '' }, predef || {});
    const esterno = !!(x.autore_esterno && !x.fratello_id);

    const corpo = `<div class="form-grid">
      <div class="f s12"><label for="l-tit">Titolo <span class="req">*</span></label><input id="l-tit" name="titolo" value="${esc(x.titolo)}"></div>
      <div class="f s12"><label for="l-tema">Tema / argomento</label><input id="l-tema" name="tema" value="${esc(x.tema || '')}"></div>
      <div class="f s6"><label for="l-aut">Autore <span class="req">*</span></label>
        <input id="l-aut" name="autore" list="dl-l-aut" autocomplete="off" placeholder="${esterno ? 'Nome e cognome dell’autore' : 'Scrivi il cognome e scegli dall’elenco'}" value="${esc(esterno ? x.autore_esterno : (x.fratello_id ? nomeFratello(x.fratello_id) : ''))}">
        <datalist id="dl-l-aut">${lv.fratelli.map((f) => `<option value="${esc(f.cognome + ' ' + f.nome)}"></option>`).join('')}</datalist>
        <label style="display:flex;gap:6px;align-items:center;font-weight:500;margin-top:6px"><input type="checkbox" name="esterno" ${esterno ? 'checked' : ''}> Autore non iscritto in Loggia (ospite o visitatore)</label></div>
      <div class="f s3"><label for="l-gt">Grado della tavola <span class="req">*</span></label><select id="l-gt" name="grado_tornata">${opzioni(GRADI, x.grado_tornata || x.grado_autore, 'Scegli…')}</select></div>
      <div class="f s3"><label for="l-d3">Data</label><input id="l-d3" name="data_presentazione" value="${esc(isoToIt(x.data_presentazione))}" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off"></div>
      <div class="f s3"><label for="l-dd">Discussa il</label><input id="l-dd" name="data_discussione" value="${esc(isoToIt(x.data_discussione))}" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off"></div>
      <div class="f s12"><label for="l-note">Note</label><textarea id="l-note" name="note" rows="3">${esc(x.note || '')}</textarea></div>
      <div class="f s12"><label for="l-file">File della tavola (PDF, Word, ODT o testo, fino a 10 MB)</label>
        ${x.file_path ? `<div class="hint" style="margin-bottom:6px">File attuale: <b>${esc(x.file_nome || 'allegato')}</b>${x.file_dimensione ? ' · ' + kb(x.file_dimensione) : ''}. Scegliendone un altro, lo sostituisci.</div>
          <label style="display:flex;gap:6px;align-items:center;font-weight:500;margin-bottom:6px"><input type="checkbox" name="rimuovi_file"> Rimuovi il file attuale</label>` : ''}
        <input id="l-file" class="vis" name="file" type="file" accept=".pdf,.doc,.docx,.odt,.txt"></div></div>`;
    const extra = !nuovo && puoCancellare() ? '<button class="btn danger" type="button" data-del>Elimina</button>' : '';

    const m = finestra(nuovo ? 'Nuova tavola' : 'Modifica tavola', corpo, {
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
        const d3 = itToIso(e.data_presentazione.value);
        const dd = itToIso(e.data_discussione.value);
        if (dd === 'ERR') return errore('Controlla la data della discussione: usa il formato gg/mm/aaaa.');
        if (d3 === 'ERR') return errore('Controlla la data: usa il formato gg/mm/aaaa.');
        if (!e.grado_tornata.value) return errore('Scegli il grado della tavola: decide chi può leggerla.');
        const dati = {
          titolo, tema: e.tema.value.trim() || null, fratello_id, autore_esterno,
          grado_autore: e.grado_tornata.value, grado_tornata: e.grado_tornata.value,
          data_presentazione: d3 || oggi(), data_discussione: dd || null, stato: 'presentato', note: e.note.value.trim() || null,
        };
        if (nuovo) dati.tipo = 'tavola';

        // file
        const id = nuovo ? nuovoId() : l.id;
        const file = e.file.files && e.file.files[0];
        let caricato = null;
        if (file) {
          const ext = estensione(file.name);
          if (!MIME[ext]) return errore('Formato non ammesso: usa PDF, Word (doc, docx), ODT o testo.');
          if (file.size > MAX_BYTE) return errore('Il file supera i 10 MB.');
          const pr = await L.zipFile.prepara(file);
          const path = L.zipFile.suffisso(id + '/' + Date.now() + '_' + nomeSicuro(file.name), pr.zippato);
          try { chk(await state.sb.storage.from(BUCKET).upload(path, pr.blob, { contentType: pr.zippato ? 'application/zip' : MIME[ext], upsert: false })); }
          catch (er) {
            const t = String((er && er.message) || er);
            if (/bucket not found/i.test(t)) throw new Error('Manca l’archivio dei file «tavole» su Supabase: esegui lo script sql/lemmi_aggiornamento_43.sql nell’editor SQL.');
            if (/row-level security|violates|not authorized|unauthorized/i.test(t)) throw new Error('Non hai il permesso di caricare file (servono i ruoli amministratore, venerabile o segretario) oppure mancano le regole di accesso: esegui di nuovo lo script schema_completo.sql.');
            throw er;
          }
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

    // il grado della tavola si propone in base al grado attuale del Fratello scelto
    let ultimo = null;
    const proponiGrado = async () => {
      const e = m.f.elements;
      if (e.esterno.checked) return;
      const t = e.autore.value.trim().toLowerCase().replace(/\s+/g, ' ');
      const fr = lv.fratelli.find((q) => (q.cognome + ' ' + q.nome).toLowerCase() === t || (q.nome + ' ' + q.cognome).toLowerCase() === t);
      if (!fr || fr.id === ultimo) return;
      ultimo = fr.id;
      if (e.grado_tornata.value) return;
      try {
        const r = chk(await state.sb.from('v_fratelli_completi').select('grado_attuale').eq('id', fr.id).maybeSingle());
        const g = r && String(r.grado_attuale || '').toLowerCase();
        if (g && GRADI[g] && !e.grado_tornata.value) e.grado_tornata.value = g;
      } catch (er) { /* facoltativo */ }
    };
    m.f.elements.autore.addEventListener('change', proponiGrado);
    m.f.elements.autore.addEventListener('input', proponiGrado);
    m.f.elements.esterno.addEventListener('change', () => {
      m.f.elements.autore.placeholder = m.f.elements.esterno.checked ? 'Nome e cognome dell’autore' : 'Scrivi il cognome e scegli dall’elenco';
      if (m.f.elements.esterno.checked) m.f.elements.autore.removeAttribute('list'); else m.f.elements.autore.setAttribute('list', 'dl-l-aut');
    });
    if (esterno) m.f.elements.autore.removeAttribute('list');
    if (nuovo && x.fratello_id) proponiGrado();

    const del = $('[data-del]', m.ov);
    if (del) del.onclick = () => {
      m.chiudi();
      L.eliminaConAnnulla({ domanda: 'Eliminare questa tavola' + (l.file_path ? ' e il suo file' : '') + '?', messaggio: 'Tavola eliminata' + (l.file_path ? ' (con il file)' : ''), esegui: async () => {
        if (l.file_path) chk(await state.sb.storage.from(BUCKET).remove([l.file_path]));
        chk(await state.sb.from('lavori').delete().eq('id', l.id));
      } });
    };
  }

  L.lavori = { apri: apriLavoro, scarica: scaricaFile };

  /* ---------- vista ---------- */
  L.viste.lavori = async function (v) {
    await carica();
    const oggiIso = oggi();
    v.innerHTML = `
      <div class="page-head"><div><h1>Lavori e tavole</h1><p>Le tavole dei Fratelli · ogni Fratello carica e modifica le proprie, l’amministratore può modificare tutto</p></div>
        <div class="right actions">${puoGestire() ? `<button class="btn gold" id="lv-new">${IC.plus} Nuova tavola</button>` : ''}</div></div>
      <div class="actions" style="margin-bottom:14px;flex-wrap:wrap">
        <div class="searchbar">${IC.search}<input id="lv-q" type="search" placeholder="Cerca per titolo, tema o autore…" value="${esc(lv.q)}"></div>
                <select id="lv-grado" style="width:auto">${opzioni(GRADI, lv.grado, 'Tutti i gradi')}</select>
        <span class="muted" id="lv-conta"></span></div>
      <div id="lv-corpo"></div>`;
    if (puoGestire()) $('#lv-new').onclick = () => apriLavoro(null).catch((e) => toast(messaggioErrore(e), 'bad'));
    $('#lv-q').addEventListener('input', (e) => { lv.q = e.target.value; disegna(); });
    $('#lv-grado').addEventListener('change', (e) => { lv.grado = e.target.value; disegna(); });

    function disegna() {
      const q = lv.q.trim().toLowerCase();
      const lista = lv.righe.filter((r) => {
        if (lv.grado && r.grado_tornata !== lv.grado && r.grado_autore !== lv.grado) return false;
        if (!q) return true;
        return [r.titolo, r.tema, autoreDi(r)].some((s) => String(s || '').toLowerCase().includes(q));
      });
      $('#lv-conta').textContent = lista.length + (lista.length === 1 ? ' tavola' : ' tavole');
      const c = $('#lv-corpo');
      if (!lista.length) {
        c.innerHTML = `<div class="card empty">${IC.inbox}<div>${lv.righe.length ? 'Nessun risultato.' : 'Nessuna tavola registrata.' + (puoGestire() ? ' Usa “Nuova tavola” per aggiungerne una.' : '')}</div></div>`;
        return;
      }
      c.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Tavola</th><th>Autore</th><th>Grado</th><th>Data</th><th>Discussa il</th><th>File</th><th></th></tr></thead><tbody>
        ${lista.map((r) => `<tr>
            <td><b>${esc(r.titolo)}</b>${r.tema ? `<div class="hint">${esc(r.tema)}</div>` : ''}</td>
            <td>${esc(autoreDi(r))}</td>
            <td>${(r.grado_tornata || r.grado_autore) ? L.badgeGrado(r.grado_tornata || r.grado_autore) : '—'}</td>
            <td>${r.data_presentazione ? fmtData(r.data_presentazione) : '—'}</td>
            <td>${r.data_discussione ? fmtData(r.data_discussione) : '—'}</td>
            <td>${r.file_path ? `<button class="btn ghost small" data-dl="${esc(r.id)}" title="${esc(r.file_nome || '')}">Scarica</button>` : '<span class="muted">—</span>'}</td>
            <td class="act">${puoGestire() ? `<button class="btn ghost small" data-mod="${esc(r.id)}">Modifica</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
      $$('[data-mod]', c).forEach((b) => b.addEventListener('click', () => apriLavoro(lv.righe.find((x) => x.id === b.dataset.mod)).catch((e) => toast(messaggioErrore(e), 'bad'))));
      $$('[data-dl]', c).forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        try { await scaricaFile(lv.righe.find((x) => x.id === b.dataset.dl)); } catch (e) { toast(messaggioErrore(e), 'bad'); }
        b.disabled = false;
      }));
    }
    disegna();
  };

  /* ---------- fascicolo nella scheda del Fratello ---------- */
  L.schedaExtra = L.schedaExtra || [];
  L.schedaExtra.push(async (v, fratelloId) => {
    if (!puoGestire()) return;
    const righe = chk(await state.sb.from('lavori').select('*').eq('fratello_id', fratelloId).order('created_at', { ascending: false }));
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h2 style="margin:0;flex:1">Tavole <small>${righe.length}</small></h2>
        <button class="btn gold small" data-nuovo>${IC.plus} Aggiungi tavola</button></div>
      ${righe.length ? `<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Tavola</th><th>Grado</th><th>Data</th><th>File</th><th></th></tr></thead><tbody>${righe.map((r) => `<tr>
        <td><b>${esc(r.titolo)}</b>${r.tema ? `<div class="hint">${esc(r.tema)}</div>` : ''}</td>
        <td>${(r.grado_tornata || r.grado_autore) ? L.badgeGrado(r.grado_tornata || r.grado_autore) : '—'}</td>
        <td>${r.data_presentazione ? fmtData(r.data_presentazione) : '—'}</td>
        <td>${r.file_path ? `<button class="btn ghost small" data-dl="${esc(r.id)}" title="${esc(r.file_nome || '')}">Scarica</button>` : '<span class="muted">—</span>'}</td>
        <td class="act"><button class="btn ghost small" data-mod="${esc(r.id)}">Modifica</button></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="empty">${IC.inbox}<div>Nessuna tavola registrata per questo Fratello.</div></div>`}
      <div style="margin-top:10px"><a href="#/lavori">Vai all’elenco completo</a></div>`;
    v.appendChild(card);
    $('[data-nuovo]', card).onclick = () => apriLavoro(null, { fratello_id: fratelloId }).catch((e) => toast(messaggioErrore(e), 'bad'));
    $$('[data-mod]', card).forEach((b) => b.addEventListener('click', () => apriLavoro(righe.find((x) => x.id === b.dataset.mod)).catch((e) => toast(messaggioErrore(e), 'bad'))));
    $$('[data-dl]', card).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try { await scaricaFile(righe.find((x) => x.id === b.dataset.dl)); } catch (e) { toast(messaggioErrore(e), 'bad'); }
      b.disabled = false;
    }));
  });
})();
