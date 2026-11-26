/* Lemmi - Area del Fratello: con il profilo "fratello" ciascuno vede i propri dati
 * (anagrafica, storia, tavole, quote) e le prossime tornate del suo grado. Sola lettura, tranne il caricamento
 * delle proprie tavole (script sql/lemmi_aggiornamento_48.sql) e di quelle caricate per conto di altri autori
 * (anche Fratelli in sonno, trasferiti o all'Oriente Eterno, o autori non presenti in anagrafica: script 54).
 * Tavole degli altri: il Maestro le vede tutte, il Compagno quelle di Compagno e Apprendista, l'Apprendista solo le proprie.
 * Le regole di sicurezza del database (lemmi_aggiornamento_35.sql) garantiscono che non possa leggere altro. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, esc, chk, fmtData, eur, oggi } = L;

  const GRADI = ['apprendista', 'compagno', 'maestro'];
  const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
  const BADGE = { Pagato: 'ok', Esente: 'gray', Parziale: 'warn', Scaduto: 'bad', 'Da pagare': 'info' };
  const TIPO_T = { ordinaria: 'Tornata rituale', informale: 'Conferenza via web', straordinaria: 'Tornata straordinaria', agape: 'Agape' };
  const $ = (sel, el) => (el || document).querySelector(sel);
  const MAX_BYTE = 10 * 1024 * 1024;
  const MIME = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', odt: 'application/vnd.oasis.opendocument.text', txt: 'text/plain' };
  const estensione = (n) => { const m = /\.([A-Za-z0-9]+)$/.exec(n || ''); return m ? m[1].toLowerCase() : ''; };
  const nomeSicuro = (n) => String(n || 'file').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(-80) || 'file';
  const nuovoId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  // Finestra per una tavola: nuova (lavoro = null) oppure modifica di una propria (il file si cambia solo se ne scegli un altro)
  const STATO_FR = { in_sonno: 'in sonno', oriente_eterno: 'Oriente Eterno', trasferito: 'trasferito' };
  const nomeAutore = (a) => a.cognome + ' ' + a.nome;
  const etichettaAutore = (a) => nomeAutore(a) + (STATO_FR[a.stato] ? ' — ' + STATO_FR[a.stato] : '');
  let autoriCache = null;
  async function elencoAutori() {
    if (autoriCache) return autoriCache;
    try { autoriCache = chk(await state.sb.rpc('elenco_autori_tavole')) || []; } catch (e) { autoriCache = null; return []; }
    return autoriCache;
  }

  async function tavolaModulo(fr, lavoro, gradiOk, dopo) {
    const autori = (await elencoAutori()).filter((a) => a.id !== fr.id);
    // di chi è la tavola: «mia», di un altro Fratello dell'anagrafica, o di un autore non presente in anagrafica
    const chiIniz = !lavoro ? 'mia' : lavoro.autore_esterno && !lavoro.autore_id ? 'esterno' : lavoro.autore_id && lavoro.autore_id !== fr.id ? 'altro' : 'mia';
    const autIniz = lavoro && lavoro.autore_id && lavoro.autore_id !== fr.id ? (autori.find((a) => a.id === lavoro.autore_id) || null) : null;
    const nuova = !lavoro;
    const gradoIniz = (lavoro && (lavoro.grado_tornata || lavoro.grado_autore)) || gradiOk[gradiOk.length - 1];
    const ov = document.createElement('div');
    ov.className = 'modal-ov';
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${nuova ? 'Carica una tavola' : 'Modifica la tavola'}">
      <div class="modal-h"><h2 style="margin:0">${nuova ? 'Carica una tavola' : 'Modifica la tavola'}</h2><button class="btn ghost small" type="button" data-x>Chiudi</button></div>
      <div class="modal-b"><form novalidate><div class="form-grid">
        <div class="f s12"><label for="tv-titolo">Titolo <span class="req">*</span></label><input id="tv-titolo" name="titolo" maxlength="200" autocomplete="off" value="${esc(lavoro ? lavoro.titolo : '')}"></div>
        <div class="f s12"><label for="tv-chi">Di chi è la tavola</label><select id="tv-chi" name="chi">
            <option value="mia" ${chiIniz === 'mia' ? 'selected' : ''}>È mia</option>
            ${autori.length ? `<option value="altro" ${chiIniz === 'altro' ? 'selected' : ''}>Di un altro Fratello della Loggia (anche in sonno, trasferito o all’Oriente Eterno)</option>` : ''}
            <option value="esterno" ${chiIniz === 'esterno' ? 'selected' : ''}>Di un autore non presente in anagrafica</option></select></div>
        <div class="f s12" id="tv-box-altro" ${chiIniz === 'altro' ? '' : 'style="display:none"'}><label for="tv-autore">Autore</label>
          <input id="tv-autore" name="autore" list="tv-dl-autori" autocomplete="off" placeholder="Scrivi il cognome e scegli dall’elenco" value="${esc(autIniz ? etichettaAutore(autIniz) : '')}">
          <datalist id="tv-dl-autori">${autori.map((a) => `<option value="${esc(etichettaAutore(a))}"></option>`).join('')}</datalist>
          <div class="hint">La tavola andrà nel fascicolo dell’autore; risulterà caricata da te e potrai modificarla o eliminarla.</div></div>
        <div class="f s12" id="tv-box-est" ${chiIniz === 'esterno' ? '' : 'style="display:none"'}><label for="tv-autore-est">Nome e cognome dell’autore</label>
          <input id="tv-autore-est" name="autore_est" maxlength="120" autocomplete="off" placeholder="Es. un Fratello scomparso prima dell’app, o un ospite" value="${esc((lavoro && !lavoro.autore_id && lavoro.autore_esterno) || '')}"></div>
        <div class="f s12"><label for="tv-tema">Tema o argomento (facoltativo)</label><input id="tv-tema" name="tema" maxlength="300" autocomplete="off" value="${esc((lavoro && lavoro.tema) || '')}"></div>
        <div class="f s6"><label for="tv-grado">Grado della tavola <span class="req">*</span></label><select id="tv-grado" name="grado">${gradiOk.map((g) => `<option value="${g}" ${g === gradoIniz ? 'selected' : ''}>${esc(cap(g))}</option>`).join('')}</select></div>
        <div class="f s6"><label for="tv-data">Data</label><input id="tv-data" name="data" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off" value="${esc(L.isoToIt((lavoro && lavoro.data_presentazione) || oggi()))}"></div>
        <div class="f s6"><label for="tv-disc">Discussa il (facoltativo)</label><input id="tv-disc" name="discussa" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off" value="${esc(L.isoToIt((lavoro && lavoro.data_discussione) || ''))}"></div>
        <div class="f s12"><label for="tv-file">${nuova ? 'File' : 'Sostituisci il file (facoltativo)'} <span class="hint">PDF, Word, ODT o testo, fino a 10 MB</span></label>
          ${!nuova && lavoro.file_nome ? `<div class="hint" style="margin-bottom:6px">File attuale: <b>${esc(lavoro.file_nome)}</b></div>` : ''}
          <input id="tv-file" name="file" type="file" class="vis" accept=".pdf,.doc,.docx,.odt,.txt"></div></div>
        <div class="err" data-err style="margin-top:10px"></div>
        <div class="actions" style="margin-top:14px"><button class="btn gold" type="submit">${nuova ? 'Carica' : 'Salva'}</button></div></form></div></div>`;
    document.body.appendChild(ov);
    L.mascheraDate(ov);
    const tasto = (e) => { if (e.key === 'Escape') chiudi(); };
    const chiudi = () => { document.removeEventListener('keydown', tasto); ov.remove(); };
    document.addEventListener('keydown', tasto);
    $('[data-x]', ov).onclick = chiudi;
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) chiudi(); });
    const errore = (m) => { $('[data-err]', ov).textContent = m; };
    const selChi = $('#tv-chi', ov);
    selChi.addEventListener('change', () => { $('#tv-box-altro', ov).style.display = selChi.value === 'altro' ? '' : 'none'; $('#tv-box-est', ov).style.display = selChi.value === 'esterno' ? '' : 'none'; });
    $('form', ov).addEventListener('submit', async (ev) => {
      ev.preventDefault(); errore('');
      const f = ev.target, b = $('button[type=submit]', f);
      const titolo = f.elements.titolo.value.trim();
      if (!titolo) return errore('Scrivi il titolo della tavola.');
      const data = f.elements.data.value.trim() ? L.itToIso(f.elements.data.value.trim()) : null;
      if (data === 'ERR') return errore('Scrivi la data nel formato gg/mm/aaaa.');
      const disc = f.elements.discussa.value.trim() ? L.itToIso(f.elements.discussa.value.trim()) : null;
      if (disc === 'ERR') return errore('Scrivi la data della discussione nel formato gg/mm/aaaa.');
      // autore
      let pAutore = null, pEsterno = null;
      if (selChi.value === 'altro') {
        const t = f.elements.autore.value.trim().toLowerCase().replace(/\s+/g, ' ');
        const a = autori.find((x) => etichettaAutore(x).toLowerCase() === t || nomeAutore(x).toLowerCase() === t || (x.nome + ' ' + x.cognome).toLowerCase() === t);
        if (!a) return errore(t ? 'Autore non trovato: scegli dall’elenco, oppure indica «Di un autore non presente in anagrafica».' : 'Indica l’autore: scrivi il cognome e scegli dall’elenco.');
        pAutore = a.id;
      } else if (selChi.value === 'esterno') {
        pEsterno = f.elements.autore_est.value.trim();
        if (!pEsterno) return errore('Scrivi nome e cognome dell’autore.');
      }
      const file = f.elements.file.files && f.elements.file.files[0];
      if (nuova && !file) return errore('Scegli il file da caricare.');
      let ext = '';
      if (file) {
        ext = estensione(file.name);
        if (!MIME[ext]) return errore('Formato non ammesso: usa PDF, Word (doc, docx), ODT o testo.');
        if (file.size > MAX_BYTE) return errore('Il file supera i 10 MB.');
      }
      b.disabled = true; b.textContent = 'Salvataggio…';
      let path = null;
      try {
        let pr = null;
        if (file) {
          pr = await L.zipFile.prepara(file);
          path = L.zipFile.suffisso('fratelli/' + fr.id + '/' + nuovoId() + '/' + Date.now() + '_' + nomeSicuro(file.name), pr.zippato);
          const su = await state.sb.storage.from('tavole').upload(path, pr.blob, { contentType: pr.zippato ? 'application/zip' : MIME[ext], upsert: false });
          if (su.error) throw su.error;
        }
        const rr = chk(await state.sb.rpc('fratello_salva_tavola', {
          p_id: lavoro ? lavoro.id : null, p_titolo: titolo, p_tema: f.elements.tema.value.trim() || null, p_grado: f.elements.grado.value, p_data: data, p_discussa: disc,
          p_file_path: path, p_file_nome: file ? file.name : null, p_file_tipo: file ? MIME[ext] : null, p_file_dimensione: file ? file.size : null,
          ...(selChi.value !== 'mia' || chiIniz !== 'mia' ? { p_autore: pAutore, p_autore_esterno: pEsterno } : {}),   // senza autore diverso si chiama come prima (va anche senza lo script 54)
        }));
        const vecchio = rr && rr.vecchio_file;
        if (vecchio) { try { await state.sb.storage.from('tavole').remove([vecchio]); } catch (e2) { /* il file sostituito resta nell'archivio */ } }
        chiudi(); L.toast(nuova ? 'Tavola caricata.' : 'Tavola aggiornata.', 'ok'); dopo();
      } catch (e) {
        if (path) { try { await state.sb.storage.from('tavole').remove([path]); } catch (e3) { /* niente file orfani, se possibile */ } }
        const t = String((e && e.message) || e);
        errore(/bucket not found/i.test(t) ? 'L’archivio delle tavole non è pronto: avvisa l’amministratore.'
          : /could not find the function.*p_autore/i.test(t) ? 'Per caricare la tavola di un altro autore serve lo script 54 su Supabase: avvisa l’amministratore.'
          : /row-level security|not authorized|unauthorized|violates|does not exist|could not find the function/i.test(t) ? 'Non è possibile salvare: l’accesso potrebbe non essere collegato alla tua scheda, oppure manca lo script 48 su Supabase. Avvisa l’amministratore.'
          : t);
        b.disabled = false; b.textContent = nuova ? 'Carica' : 'Salva';
      }
    });
    const primo = $('#tv-titolo', ov); if (primo) primo.focus();
  }

  const leggi = async (q) => { try { return chk(await q); } catch (e) { return []; } };

  L.vistaFratello = async function (v) {
    const fr = (await leggi(state.sb.from('fratelli').select('*').limit(2)))[0];
    const head = `<div class="page-head"><div><h1>La mia scheda</h1><p>${esc(state.loggia.nome || 'La tua Loggia')}${state.loggia.oriente ? ' · Oriente di ' + esc(state.loggia.oriente) : ''}</p></div></div>`;
    if (!fr) {
      v.innerHTML = head + `<div class="notice">Il tuo accesso non è ancora collegato alla tua scheda in anagrafica. Chiedi all’amministratore di collegarlo (Info di sistema › Utenti del sistema).</div>`;
      return;
    }
    const [pass, car, lav, quote, tor] = await Promise.all([
      leggi(state.sb.from('passaggi_grado').select('grado,anno,data').order('data')),
      leggi(state.sb.from('cariche_storico').select('carica,anno_dal,anno_al,note').order('anno_dal')),
      leggi(state.sb.rpc('tavole_per_grado')),
      leggi(state.sb.rpc('mie_quote')),
      leggi(state.sb.from('tornate').select('*').gte('data', oggi()).neq('stato', 'annullata').order('data').limit(20)),
    ]);
    const proprie = await leggi(state.sb.from('lavori').select('id,titolo,tema,stato,file_path,file_nome,data_presentazione,grado_tornata,grado_autore,data_discussione').eq('fratello_id', fr.id).order('created_at', { ascending: false }));
    // «Le mie tavole»: quelle che posso gestire (le mie e quelle caricate da me per conto di altri); senza lo script 54 come prima
    const conScript54 = lav.length && 'gestibile' in lav[0];
    const mie = conScript54 ? lav.filter((l) => l.gestibile) : (proprie.length ? proprie : lav.filter((l) => l.mia));
    const altre = lav;   // l'elenco della Loggia comprende anche le proprie (segnate «tua»)
    const mioGrado = pass.reduce((m, p) => Math.max(m, GRADI.indexOf(String(p.grado))), 0);
    const mioGradoNome = cap(GRADI[mioGrado]);
    const linkFile = (l) => (l.file_path ? ` <a href="javascript:void(0)" class="scarica-tavola" data-p="${esc(l.file_path)}" data-n="${esc(l.file_nome || 'tavola')}" title="Scarica il file">⬇ scarica</a>` : '');
    const tornate = tor.filter((t) => !pass.length || !t.grado || GRADI.indexOf(String(t.grado)) <= mioGrado).slice(0, 5);   // grado non registrato: si mostrano tutte
    const aperte = quote.filter((q) => Number(q.residuo) > 0 && q.stato !== 'Esente');
    const daVersare = aperte.reduce((a, q) => a + Number(q.residuo), 0);

    const storia = [];
    if (fr.data_iniziazione || fr.anno_iniziazione) storia.push({ tipo: 0, k: fr.data_iniziazione || String(fr.anno_iniziazione), t: 'Iniziazione', d: fr.data_iniziazione ? fmtData(fr.data_iniziazione) : String(fr.anno_iniziazione) });
    pass.filter((p) => p.grado !== 'apprendista').forEach((p) => storia.push({ tipo: 1, k: p.data || String(p.anno || ''), t: p.grado === 'compagno' ? 'Passaggio a Compagno d’Arte' : 'Elevazione a Maestro', d: p.data ? fmtData(p.data) : (p.anno || '') }));
    car.forEach((c) => storia.push({ tipo: 2, k: String(c.anno_dal || ''), t: c.carica, d: c.anno_dal ? (c.anno_al && c.anno_al !== c.anno_dal ? c.anno_dal + '–' + c.anno_al : String(c.anno_dal)) : '', n: c.note }));
    storia.sort((a, b) => String(a.k).localeCompare(String(b.k)));

    const kv = (l, x) => `<div><span>${l}</span><b>${x ? esc(x) : '—'}</b></div>`;
    v.innerHTML = head + `
      <div class="cr-strip">
        <div class="cr-kpis">
          <div class="cr-kpi"><b>${esc(fr.cognome)} ${esc(fr.nome)}</b></div>
          ${pass.length ? `<div class="cr-kpi"><span>Grado</span> <b style="font-size:1rem">${esc(cap(GRADI[mioGrado]))}</b></div>` : ''}
          ${fr.matricola ? `<div class="cr-kpi"><span>Matricola</span> <b style="font-size:1rem">${esc(fr.matricola)}</b></div>` : ''}
          <div class="cr-kpi"><span>Da versare</span> <b style="font-size:1rem;color:${daVersare > 0 ? 'var(--bad)' : 'var(--ok)'}">${eur(daVersare)}</b></div>
        </div>
      </div>
      <div class="grid cols-2">
        <div class="card"><h2>Prossime tornate</h2>
          ${tornate.length ? `<div class="table-wrap"><table><tbody>${tornate.map((t) => `<tr><td><b>${fmtData(t.data)}</b>${t.ora ? `<div class="hint">ore ${esc(String(t.ora).slice(0, 5))}</div>` : ''}</td>
            <td data-tornata="${esc(t.id)}">${esc(TIPO_T[t.tipo] || cap(t.tipo))}${t.grado ? ' ' + L.badgeGrado(t.grado) : ''}
              ${t.ordine_del_giorno ? `<div class="hint">${esc(t.ordine_del_giorno)}</div>` : ''}
              ${t.link_online && /^https:\/\//i.test(t.link_online) ? `<div><a href="${esc(t.link_online)}" target="_blank" rel="noopener">Collegamento online</a></div>` : t.luogo ? `<div class="hint">${esc(t.luogo)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>
            <div style="margin-top:10px"><a href="#/calendario">Tutto il calendario</a></div>` : '<div class="empty"><div>Nessuna tornata in calendario.</div></div>'}</div>
        <div class="card"><h2>Le mie quote</h2>
          ${quote.length ? `<div class="table-wrap"><table><thead><tr><th>Voce</th><th class="num">Da versare</th><th>Stato</th></tr></thead><tbody>${quote.slice(0, 12).map((q) => `<tr>
            <td><b>${esc(q.voce)}</b> ${esc(q.anno)}${q.rate_totali > 1 ? ` <span class="muted">· rata ${q.rata_n}/${q.rate_totali}</span>` : ''}<div class="hint">${eur(q.importo_dovuto)}${q.data_scadenza ? ' · scadenza ' + fmtData(q.data_scadenza) : ''}</div></td>
            <td class="num"><b>${eur(q.residuo)}</b></td><td>${L.badgeStato(L.statoQuota(q), L.statoQuota(q))}</td></tr>`).join('')}</tbody></table></div>
            <p class="hint" style="margin-top:8px">Per versamenti o chiarimenti rivolgiti al Tesoriere.</p>` : '<div class="empty"><div>Nessuna quota registrata.</div></div>'}</div>
        <div class="card"><h2>La mia storia</h2>
          ${storia.length ? `<div class="timeline tl-v">${storia.map((s) => L.vocetl({ tipo: s.tipo, etichetta: s.d, titolo: s.t, dettaglio: s.n })).join('')}</div>` : '<div class="empty"><div>Nessun dato registrato.</div></div>'}</div>
        <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h2 style="margin:0">Le mie tavole</h2>
            <button class="btn gold small" type="button" id="tv-carica">+ Carica una tavola</button></div>
          ${mie.length ? `<div class="table-wrap tv-mie" style="margin-top:10px"><table><tbody>${mie.map((l) => `<tr data-riga="${esc(l.id || '')}"><td><b>${esc(l.titolo)}</b>${linkFile(l)}${conScript54 && !l.mia ? `<div class="hint">di <b>${esc(l.autore)}</b> · caricata da te</div>` : ''}
              <div class="hint">${(l.grado_tornata || l.grado_autore) ? L.badgeGrado(l.grado_tornata || l.grado_autore) + ' · ' : ''}${l.data_presentazione ? fmtData(l.data_presentazione) : 'senza data'}${l.data_discussione ? ' · discussa il ' + fmtData(l.data_discussione) : ''}${l.tema ? ' · ' + esc(l.tema) : ''}</div></td>
            <td class="act">${l.id ? `<button class="btn ghost small" type="button" data-tv="${esc(l.id)}">Modifica</button> <button class="btn ghost small" type="button" data-tv-del="${esc(l.id)}">Elimina</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><div>Nessuna tavola. Con «Carica una tavola» puoi aggiungere la tua.</div></div>'}
          <p class="hint" style="margin-top:8px">Formati ammessi: PDF, Word, ODT o testo, fino a 10 MB. Il grado che scegli decide chi può leggere la tavola.</p></div>
      </div>
      <div class="card"><h2>Tavole della Loggia</h2><p class="hint" style="margin-bottom:8px">${mioGradoNome === 'Maestro' ? 'Come Maestro vedi tutte le tavole.' : mioGradoNome === 'Compagno' ? 'Vedi le tavole in grado di Compagno e di Apprendista, oltre alle tue.' : 'Come Apprendista vedi le tue tavole; quelle degli altri Fratelli le vedrai salendo di grado.'}</p>
        ${altre.length ? `
        <div class="table-wrap"><table><thead><tr><th>Tavola</th><th>Autore</th><th>Grado</th><th>Data</th><th>Discussa il</th></tr></thead><tbody>${altre.map((l) => `<tr><td><b>${esc(l.titolo)}</b>${linkFile(l)}${l.tema ? `<div class="hint">${esc(l.tema)}</div>` : ''}</td>
          <td>${esc(l.autore)}${l.mia ? ' <span class="badge info">tua</span>' : ''}${l.caricata_da_nome ? `<div class="hint">caricata da ${esc(l.caricata_da_nome)}</div>` : ''}</td><td>${l.grado_tornata ? L.badgeGrado(l.grado_tornata) : '—'}</td>
          <td>${l.data_presentazione ? fmtData(l.data_presentazione) : '—'}</td><td>${l.data_discussione ? fmtData(l.data_discussione) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><div>Nessuna tavola disponibile.</div></div>'}</div>
      <div class="card"><h2>I miei dati</h2><div class="kv">
        ${kv('Data di nascita', fr.data_nascita ? fmtData(fr.data_nascita) : '')}${kv('Luogo di nascita', [fr.luogo_nascita, fr.provincia_nascita ? '(' + fr.provincia_nascita + ')' : ''].filter(Boolean).join(' '))}
        ${kv('Indirizzo', [fr.indirizzo, fr.cap, fr.citta, fr.provincia ? '(' + fr.provincia + ')' : ''].filter(Boolean).join(' '))}
        ${kv('Professione', fr.professione)}${kv('Cellulare', fr.cellulare)}${kv('E-mail', fr.email)}${'email_2' in fr && fr.email_2 ? kv('Seconda e-mail', fr.email_2) : ''}
      </div><p class="hint" style="margin-top:12px">Se un dato è sbagliato o manca, comunicalo al Segretario. Le notifiche sul telefono si attivano da «Il mio accesso».</p></div>`;
    const gradiOk = GRADI.slice(0, mioGrado + 1);
    const apri = (l) => tavolaModulo(fr, l, gradiOk, () => L.route()).catch((e) => L.toast(L.messaggioErrore(e), 'bad'));
    const carica = $('#tv-carica', v); if (carica) carica.onclick = () => apri(null);
    v.querySelectorAll('[data-tv]').forEach((b) => b.addEventListener('click', () => { const l = mie.find((x) => x.id === b.dataset.tv); if (l) apri(l); }));
    v.querySelectorAll('[data-tv-del]').forEach((b) => b.addEventListener('click', () => {
      const l = mie.find((x) => x.id === b.dataset.tvDel); if (!l) return;
      L.eliminaConAnnulla({
        domanda: 'Eliminare la tavola «' + l.titolo + '»' + (conScript54 && !l.mia ? ' di ' + l.autore : '') + ' e il suo file?', messaggio: 'Tavola eliminata', el: b.closest('tr'),
        esegui: async () => {
          const path = chk(await state.sb.rpc('fratello_elimina_tavola', { p_id: l.id }));
          if (path) { try { await state.sb.storage.from('tavole').remove([path]); } catch (e) { /* file rimasto nell'archivio */ } }
        }, dopo: () => L.route(),
      });
    }));
    v.querySelectorAll('.scarica-tavola').forEach((a) => a.addEventListener('click', async () => {
      try {
        await L.zipFile.scarica('tavole', a.dataset.p, a.dataset.n);
      } catch (e) { window.alert('Non è stato possibile scaricare il file: ' + ((e && e.message) || e)); }
    }));
    if (L.agapi) { try { await L.agapi.montaFratello(v, tornate); } catch (e) { /* facoltativo */ } }
  };
})();
