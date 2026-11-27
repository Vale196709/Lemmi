/* Lemmi - Info di sistema > Utenti del sistema (solo amministratore):
 * nome, cognome, grado, e-mail e profilo di chi può accedere all'app.
 * I dati vengono dalla funzione info_utenti_sistema() (script lemmi_aggiornamento_18.sql): l'e-mail sta nell'area
 * riservata di Supabase e solo una funzione con controllo "amministratore" può leggerla. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, isAdmin } = L;

  const PROFILI = { amministratore: 'Amministratore', venerabile: 'Maestro Venerabile', segretario: 'Segretario', tesoriere: 'Tesoriere', fratello: 'Maestro / Compagno / Apprendista (sola lettura, in base al grado)' };
  const PROFILI_BREVI = { amministratore: 'Amministratore', venerabile: 'Maestro Venerabile', segretario: 'Segretario', tesoriere: 'Tesoriere', fratello: 'Fratello (sola lettura)' };
  const BADGE = { amministratore: 'gold', venerabile: 'info', segretario: 'ok', tesoriere: 'warn', fratello: 'gray' };
  const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
  const dataOra = (iso) => {
    if (!iso) return 'mai';
    const d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  };

  const GIORNI_INATTIVO = 90;
  const giorniDa = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);
  const inattivo = (r) => { const g = giorniDa(r.ultimo_accesso); return g === null || g > GIORNI_INATTIVO; };
  const etichettaInattivo = (r) => {
    const g = giorniDa(r.ultimo_accesso);
    if (g === null) return 'mai entrato';
    const mesi = Math.floor(g / 30);
    return mesi >= 2 ? `nessun accesso da ${mesi} mesi` : `nessun accesso da ${g} giorni`;
  };
  // annota l'operazione nel Registro attività (script 56); se lo script manca, l'operazione resta valida lo stesso
  const annota = async (user, azione, dettaglio) => { try { chk(await state.sb.rpc('registra_operazione_utente', { p_user: user, p_azione: azione, p_dettaglio: dettaglio || {} })); } catch (e) { /* facoltativo */ } };
  const indirizzoApp = () => location.origin + location.pathname.replace(/index\.html$/, '');
  const nomeLoggia = () => { const l = state.loggia || {}; return ['R∴L∴', l.nome, l.numero ? 'n. ' + l.numero : '', l.oriente ? 'Or∴ di ' + l.oriente : ''].filter(Boolean).join(' '); };
  const testoAvviso = (tipo, email, password) => (tipo === 'nuovo'
    ? `Carissimo Fratello, è stato creato il tuo accesso a Lemmi, l’app della ${nomeLoggia()}.\n\nIndirizzo: ${indirizzoApp()}\nE-mail: ${email}\nPassword temporanea: ${password}\n\nAl primo accesso cambia la password. Un fraterno saluto.`
    : `Carissimo Fratello, la tua password di Lemmi (${nomeLoggia()}) è stata reimpostata.\n\nIndirizzo: ${indirizzoApp()}\nE-mail: ${email}\nNuova password temporanea: ${password}\n\nAppena entri cambiala. Un fraterno saluto.`);
  // pulsanti per avvisare l'utente: WhatsApp (se collegato a un Fratello con cellulare) ed e-mail; tutto gratuito, si invia a mano
  const avvisoHtml = (tipo, user, email, password, fratelloId) => {
    const testo = testoAvviso(tipo, email, password);
    const oggetto = tipo === 'nuovo' ? 'Il tuo accesso a Lemmi' : 'Lemmi: password reimpostata';
    return `<div class="actions u-avviso" data-u="${esc(user)}" style="margin-top:10px;flex-wrap:wrap"><span class="hint">Avvisa l’utente:</span>
      ${fratelloId && L.wa ? L.wa.fratello(fratelloId, testo, 'WhatsApp') : ''}
      <a class="btn ghost small" href="mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(testo)}">E-mail</a>
      <button class="btn ghost small u-copia-avviso" type="button" data-t="${esc(testo)}">Copia il messaggio</button></div>`;
  };
  const collegaAvviso = (box) => {
    const u = $('.u-avviso', box); if (!u) return;
    $$('a, [data-wa-fr]', u).forEach((b) => b.addEventListener('click', () => annota(u.dataset.u, 'avviso', { mezzo: b.matches('[data-wa-fr]') ? 'WhatsApp' : 'e-mail' })));
    $$('.u-copia-avviso', u).forEach((b) => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.t); toast('Messaggio copiato', 'ok'); } catch (e) { toast('Copia non riuscita', 'bad'); }
    }));
  };
  // seconda conferma per l'eliminazione: si scrive l'e-mail dell'utente
  function confermaScrivendo(email, chi) {
    return new Promise((ok) => {
      const ov = document.createElement('div');
      ov.className = 'modal-ov';
      ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Conferma l’eliminazione" style="max-width:520px">
        <div class="modal-h"><h2 class="m-0">Conferma l’eliminazione</h2><button class="btn ghost small" type="button" data-x>Annulla</button></div>
        <div class="modal-b"><p class="mt-0">Per eliminare definitivamente <b>${esc(chi)}</b> scrivi qui sotto la sua e-mail:</p>
          <p class="m-b8"><code style="user-select:all">${esc(email)}</code></p>
          <input id="u-del-mail" type="email" autocomplete="off" spellcheck="false" aria-label="E-mail dell’utente da eliminare">
          <div class="actions mt-14"><button class="btn danger" type="button" id="u-del-ok" disabled>Elimina definitivamente</button></div></div></div>`;
      document.body.appendChild(ov);
      const inp = $('#u-del-mail', ov), b = $('#u-del-ok', ov);
      const fine = (r) => { document.removeEventListener('keydown', tasto); ov.remove(); ok(r); };
      const tasto = (e) => { if (e.key === 'Escape') fine(false); };
      document.addEventListener('keydown', tasto);
      inp.addEventListener('input', () => { b.disabled = inp.value.trim().toLowerCase() !== String(email).toLowerCase(); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !b.disabled) fine(true); });
      b.addEventListener('click', () => fine(true));
      $('[data-x]', ov).addEventListener('click', () => fine(false));
      inp.focus();
    });
  }

  L.viste.utenti = async function (v) {
    if (!isAdmin()) { v.innerHTML = '<div class="notice bad">Questa sezione è riservata all’amministratore.</div>'; return; }
    let righe;
    try {
      righe = chk(await state.sb.rpc('info_utenti_sistema'));
    } catch (e) {
      const mancante = /could not find the function|schema cache|does not exist/i.test((e && e.message) || '');
      v.innerHTML = `<div class="page-head"><div><h1>Utenti del sistema</h1><p>Info di sistema</p></div></div>
        <div class="notice bad">${mancante ? '<b>Manca la funzione sul database.</b> Esegui su Supabase (SQL Editor) gli script <code>lemmi_aggiornamento_18.sql</code>, <code>_43</code>, <code>_44</code> e <code>_45</code>, poi ricarica la pagina.' : '<b>Impossibile leggere l’elenco.</b><br>' + esc(messaggioErrore(e))}</div>`;
      return;
    }
    const fratelli = await L.caricaFratelli();
    // e-mail dell'anagrafica, per precompilare «Nuovo utente» (la seconda e-mail esiste dopo lo script 49)
    const mailFr = {};
    let haSeconda = true;
    try {
      let r = await state.sb.from('fratelli').select('id,email,email_2');
      if (r.error) { haSeconda = false; r = await state.sb.from('fratelli').select('id,email'); }
      (r.data || []).forEach((f) => { mailFr[f.id] = [f.email, f.email_2].map((x) => String(x || '').trim()).filter(Boolean); });
    } catch (_) { /* senza e-mail si compila a mano */ }

    const conta = {};
    righe.forEach((r) => { conta[r.ruolo] = (conta[r.ruolo] || 0) + 1; });

    v.innerHTML = `
      <div class="page-head"><div><h1>Utenti del sistema</h1><p>Chi può accedere a Lemmi, con il suo profilo · visibile solo all’amministratore</p></div>
        <div class="right actions"><button class="btn gold" id="b-nu" type="button">${L.IC.plus} Nuovo utente</button></div></div>
      <div class="card" id="nu-box" hidden>
        <h2>Nuovo utente</h2>
        <p class="muted m-b14">Crea l’accesso a Lemmi: l’utente entra con la sua e-mail e la password temporanea che gli comunichi, poi può cambiarla dalla pagina Loggia.</p>
        <form id="nu-form" autocomplete="off">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px">
            <div id="nu-fr-box"><label for="nu-fr">Fratello dell’anagrafica</label><select id="nu-fr"><option value="">— nessuno / dall’e-mail, se coincide —</option>${fratelli.map((f) => `<option value="${esc(f.id)}">${esc(f.cognome)} ${esc(f.nome)}</option>`).join('')}</select></div>
            <div><label for="nu-email">E-mail</label><input id="nu-email" type="email" required placeholder="nome@esempio.it"><div id="nu-mail-sug" class="hint mt-6"></div></div>
            <div><label for="nu-nome">Nome da mostrare</label><input id="nu-nome" type="text" required placeholder="es. Mario Rossi"></div>
            <div><label for="nu-ruolo">Profilo</label><select id="nu-ruolo">${Object.keys(PROFILI).map((k) => `<option value="${k}" ${k === 'segretario' ? 'selected' : ''}>${esc(PROFILI[k])}</option>`).join('')}</select></div>
            <div><label for="nu-pw">Password temporanea</label><input id="nu-pw" type="text" required minlength="8" autocomplete="off"></div>
          </div>
          <div class="actions mt-14"><button class="btn" type="submit" id="nu-ok">Crea utente</button>
            <button class="btn ghost" type="button" id="nu-gen">Genera password</button>
            <button class="btn ghost" type="button" id="nu-ann">Annulla</button></div>
        </form>
        <div id="nu-esito"></div>
      </div>
      <div class="actions mb-10">${Object.keys(PROFILI).filter((k) => conta[k]).map((k) => `<span class="badge ${BADGE[k]}">${esc(PROFILI_BREVI[k])}: ${conta[k]}</span>`).join('')}
        ${righe.filter((r) => !r.disattivato && inattivo(r)).length ? `<span class="badge warn">${righe.filter((r) => !r.disattivato && inattivo(r)).length} senza accessi da oltre ${GIORNI_INATTIVO} giorni</span>` : ''}
        ${righe.filter((r) => r.disattivato).length ? `<span class="badge bad">${righe.filter((r) => r.disattivato).length} disattivati</span>` : ''}
        <span class="muted">${righe.length} ${righe.length === 1 ? 'utente configurato' : 'utenti configurati'}</span></div>
      <div class="actions u-filtri mb-14">
        <div class="searchbar">${L.IC.search || ''}<input id="u-q" type="search" placeholder="Cerca nome, cognome o e-mail…" aria-label="Cerca utente"></div>
        <select id="u-f-ruolo" class="w-auto" aria-label="Filtra per profilo"><option value="">Tutti i profili</option>${Object.keys(PROFILI).map((k) => `<option value="${k}">${esc(PROFILI_BREVI[k])}</option>`).join('')}</select>
        <select id="u-f-stato" class="w-auto" aria-label="Filtra per stato"><option value="">Tutti</option><option value="attivi">Attivi</option><option value="inattivi">Senza accessi da tempo</option><option value="disattivati">Disattivati</option></select>
        <span class="muted" id="u-conta"></span></div>
      <div id="pw-esito"></div>
      <div class="table-wrap"><table class="tab-utenti"><thead><tr><th>Utente</th><th>Profilo</th><th>Fratello collegato</th><th>Ultimo accesso</th><th>Azioni</th></tr></thead>
        <tbody>${righe.length ? righe.map((r) => {
          const io = String(r.user_id) === String(state.user.id);
          const nomeC = ((r.nome || '') + ' ' + (r.cognome || '')).trim();
          const etic = nomeC || r.nome_visualizzato || r.email || '';
          const dati = `data-u="${esc(r.user_id)}" data-email="${esc(r.email || '')}" data-nome="${esc(etic)}" data-fr="${esc(r.fratello_id || '')}"`;
          const cerca = [nomeC, r.nome_visualizzato, r.email].join(' ').toLowerCase();
          return `<tr class="${r.disattivato ? 'u-off' : ''}" data-riga-u data-cerca="${esc(cerca)}" data-ruolo="${esc(r.ruolo || '')}" data-stato="${r.disattivato ? 'disattivati' : inattivo(r) ? 'inattivi' : 'attivi'}">
          <td data-label="Utente"><div class="u-nome">${esc(nomeC || r.nome_visualizzato || '—')}${r.grado ? ' ' + L.badgeGrado(r.grado) : ''}</div>
            <div class="u-mail">${esc(r.email || '—')}</div></td>
          <td data-label="Profilo" data-sort="${esc(r.ruolo || '')}">${io
            ? `<span class="badge ${BADGE[r.ruolo] || 'gray'}">${esc(PROFILI[r.ruolo] || r.ruolo || '—')}</span><div class="hint">il tuo profilo</div>`
            : `<select class="sel-ruolo" ${dati} data-prima="${esc(r.ruolo || '')}" aria-label="Profilo di ${esc(r.email || '')}">
                ${!PROFILI[r.ruolo] ? `<option value="" selected>${esc(r.ruolo || '— nessuno —')}</option>` : ''}
                ${Object.keys(PROFILI).map((k) => `<option value="${k}" ${k === r.ruolo ? 'selected' : ''}>${esc(PROFILI_BREVI[k])}</option>`).join('')}</select>`}</td>
          <td data-label="Fratello collegato" data-sort="${esc(r.cognome || '')}"><select class="sel-fr" data-u="${esc(r.user_id)}" aria-label="Fratello collegato a ${esc(r.email || '')}">
            <option value="">— nessuno —</option>
            ${fratelli.map((f) => `<option value="${esc(f.id)}" ${String(f.id) === String(r.fratello_id) ? 'selected' : ''}>${esc(f.cognome)} ${esc(f.nome)}</option>`).join('')}</select>
            ${r.collegamento === 'e-mail' ? '<div class="hint">riconosciuto dall’e-mail</div>' : ''}</td>
          <td data-label="Ultimo accesso" data-sort="${esc(r.ultimo_accesso || '')}"><div class="u-acc">${esc(dataOra(r.ultimo_accesso))}</div>${r.disattivato ? '<span class="badge bad">Disattivato</span>' : inattivo(r) && !io ? `<span class="badge warn">${esc(etichettaInattivo(r))}</span>` : ''}</td>
          <td data-label="Azioni">${io ? '<span class="hint">—</span>'
            : `<div class="u-azioni"><button class="btn ghost small btn-gu" type="button" data-az="${r.disattivato ? 'riattiva' : 'disattiva'}" ${dati}>${r.disattivato ? 'Riattiva' : 'Disattiva'}</button>
              <button class="btn ghost small btn-pw" type="button" ${dati}>Password</button>
              <button class="btn ghost small btn-gu u-del" type="button" data-az="elimina" ${dati} aria-label="Elimina l’utente ${esc(r.email || '')}">Elimina</button></div>`}</td></tr>`;
        }).join('') : '<tr><td colspan="5"><div class="empty"><div>Nessun utente configurato.</div></div></td></tr>'}</tbody></table></div>
      <div class="hint mt-12">Nome, cognome e grado vengono dall’anagrafica dei Fratelli: il collegamento avviene dall’e-mail (se è la stessa dell’anagrafica) oppure scegliendo il Fratello dall’elenco. Gli utenti si creano da qui con «Nuovo utente»; con «Disattiva» si sospende l’accesso (si può riattivare), con «Elimina» lo si toglie per sempre (il Fratello resta comunque in anagrafica). Il profilo si cambia dal menu della colonna «Profilo» (non si può cambiare il proprio, per non restare senza amministratore).</div>`;

    v.insertAdjacentHTML('beforeend', '<div class="card mt-18" id="u-registro"><h2>Ultime operazioni sugli utenti</h2><div class="empty"><div>Caricamento…</div></div></div>');
    (async () => {
      const box = $('#u-registro', v);
      let op = [];
      try { op = chk(await state.sb.from('registro_attivita').select('quando,utente_email,tabella,operazione,prima,dopo').in('tabella', ['utenti_sistema', 'profili']).order('quando', { ascending: false }).limit(25)); } catch (e) { op = null; }
      const AZ = { creazione: 'Utente creato', profilo: 'Profilo cambiato', collegamento: 'Collegamento al Fratello', disattivazione: 'Utente disattivato', riattivazione: 'Utente riattivato', password: 'Password reimpostata', eliminazione: 'Utente eliminato', avviso: 'Avviso inviato' };
      const descr = (o) => {
        const d = o.dopo || {}, p = o.prima || {};
        if (o.tabella === 'utenti_sistema') return `<b>${esc(AZ[d.azione] || d.azione || o.operazione)}</b>${d.utente ? ' · ' + esc(d.utente) : ''}${d.ruolo ? ' · ' + esc(PROFILI_BREVI[d.ruolo] || d.ruolo) : ''}${d.mezzo ? ' · ' + esc(d.mezzo) : ''}`;
        if (o.operazione === 'modifica' && p.ruolo !== d.ruolo) return `<b>Profilo</b> da ${esc(PROFILI_BREVI[p.ruolo] || p.ruolo || '—')} a ${esc(PROFILI_BREVI[d.ruolo] || d.ruolo || '—')}${d.nome_visualizzato ? ' · ' + esc(d.nome_visualizzato) : ''}`;
        return `<b>Profilo ${esc(o.operazione)}</b>${(d.nome_visualizzato || p.nome_visualizzato) ? ' · ' + esc(d.nome_visualizzato || p.nome_visualizzato) : ''}`;
      };
      if (!box) return;
      if (op === null) { box.querySelector('.empty').innerHTML = '<div>Registro non disponibile.</div>'; return; }
      box.innerHTML = `<h2>Ultime operazioni sugli utenti</h2>${op.length ? `<ul class="dg-cron">${op.map((o) => `<li><span class="dg-data">${esc(dataOra(o.quando))}</span><div>${descr(o)}<div class="muted">da ${esc(o.utente_email || '—')}</div></div><span></span></li>`).join('')}</ul>` : '<div class="muted">Nessuna operazione registrata.</div>'}
        <div class="hint mt-8">L’elenco completo è in <a href="#/registro">Registro attività</a>. Le password non vengono mai registrate.</div>`;
    })();

    // ---- ricerca e filtri ----
    const filtra = () => {
      const q = $('#u-q', v).value.trim().toLowerCase(), fr = $('#u-f-ruolo', v).value, fs = $('#u-f-stato', v).value;
      let n = 0;
      $$('tr[data-riga-u]', v).forEach((tr) => {
        const vis = (!q || tr.dataset.cerca.includes(q)) && (!fr || tr.dataset.ruolo === fr) && (!fs || tr.dataset.stato === fs);
        tr.hidden = !vis; if (vis) n++;
      });
      $('#u-conta', v).textContent = (q || fr || fs) ? `${n} su ${righe.length}` : '';
    };
    ['#u-q', '#u-f-ruolo', '#u-f-stato'].forEach((sel) => $(sel, v).addEventListener(sel === '#u-q' ? 'input' : 'change', filtra));

    // ---- nuovo utente (funzione "crea-utente" su Supabase) ----
    const genPw = () => {
      const set = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const r = new Uint32Array(12); crypto.getRandomValues(r);
      return Array.from(r, (n) => set[n % set.length]).join('');
    };
    const box = $('#nu-box', v), form = $('#nu-form', v), esito = $('#nu-esito', v);
    $('#b-nu', v).addEventListener('click', () => { box.hidden = !box.hidden; if (!box.hidden) { $('#nu-pw', v).value = genPw(); $('#nu-fr', v).focus(); } });
    // precompilazione dal Fratello scelto: e-mail e nome restano modificabili; si sovrascrivono solo se non toccati a mano
    const inMail = $('#nu-email', v), inNome = $('#nu-nome', v), selRuolo = $('#nu-ruolo', v), selFr = $('#nu-fr', v), sug = $('#nu-mail-sug', v);
    let autoMail = '', autoNome = '', ruoloToccato = false;
    selRuolo.addEventListener('change', () => { ruoloToccato = true; });
    const mostraSug = () => {
      const lista = mailFr[selFr.value] || [];
      if (!selFr.value) { sug.innerHTML = ''; return; }
      if (!lista.length) { sug.innerHTML = 'Nessuna e-mail nell’anagrafica di questo Fratello: scrivila qui.'; return; }
      sug.innerHTML = lista.length > 1
        ? '<div>Dall’anagrafica, scegli quale usare:</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">' + lista.map((m) => { const on = m === inMail.value.trim(); return `<button type="button" class="btn ghost small nu-mail-pick" data-m="${esc(m)}" aria-pressed="${on}" style="max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap${on ? ';border-color:var(--gold);background:var(--gold-soft);color:var(--gold-ink)' : ''}">${esc(m)}</button>`; }).join('') + '</div>'
        : 'Dall’anagrafica del Fratello (puoi cambiarla).';
      $$('.nu-mail-pick', sug).forEach((b) => b.addEventListener('click', () => { inMail.value = autoMail = b.dataset.m; mostraSug(); }));
    };
    selFr.addEventListener('change', () => {
      const f = fratelli.find((x) => String(x.id) === selFr.value);
      const lista = mailFr[selFr.value] || [];
      if (!inMail.value.trim() || inMail.value.trim() === autoMail) inMail.value = autoMail = (f && lista[0]) || '';
      const nome = f ? (f.nome + ' ' + f.cognome).trim() : '';
      if (!inNome.value.trim() || inNome.value.trim() === autoNome) inNome.value = autoNome = nome;
      if (f && !ruoloToccato) selRuolo.value = 'fratello';
      mostraSug();
    });
    inMail.addEventListener('input', mostraSug);
    const azzera = () => { form.reset(); autoMail = autoNome = ''; ruoloToccato = false; sug.innerHTML = ''; };
    $('#nu-ann', v).addEventListener('click', () => { box.hidden = true; esito.innerHTML = ''; azzera(); });
    $('#nu-gen', v).addEventListener('click', () => { $('#nu-pw', v).value = genPw(); });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const body = { email: $('#nu-email', v).value.trim(), nome: $('#nu-nome', v).value.trim(), ruolo: $('#nu-ruolo', v).value, password: $('#nu-pw', v).value, fratello_id: $('#nu-fr', v).value || null };
      if (body.ruolo === 'fratello' && !body.fratello_id && !fratelli.length) { esito.innerHTML = '<div class="notice bad mt-14">Per il profilo Fratello serve il collegamento a un Fratello dell’anagrafica.</div>'; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) { esito.innerHTML = '<div class="notice bad mt-14">E-mail non valida.</div>'; return; }
      // e-mail diversa da quelle dell'anagrafica: chiede se salvarla anche nella scheda del Fratello
      let aggiornaAnag = null;
      const giaInAnag = mailFr[body.fratello_id] || [];
      if (body.fratello_id && !giaInAnag.some((m) => m.toLowerCase() === body.email.toLowerCase())) {
        const f = fratelli.find((x) => String(x.id) === String(body.fratello_id));
        const chi = f ? f.cognome + ' ' + f.nome : 'il Fratello';
        // dove va: nella prima e-mail se vuota, altrimenti nella seconda; se sono già piene (o manca la colonna) sostituisce l'ultima
        const r0 = await state.sb.from('fratelli').select('email' + (haSeconda ? ',email_2' : '')).eq('id', body.fratello_id).maybeSingle();
        const ora = r0.data || { email: giaInAnag[0] || '', email_2: giaInAnag[1] || '' };   // se la lettura non riesce, usa quanto già noto
        const campo = !String(ora.email || '').trim() ? 'email' : (haSeconda ? 'email_2' : 'email');
        const sostituita = String(ora[campo] || '').trim();
        if (await window.LemmiDialogo.conferma({
          titolo: 'Aggiornare anche l’anagrafica?',
          testo: 'L’e-mail ' + body.email + ' non è nella scheda di ' + chi + '. Vuoi salvarla anche lì?',
          punti: [sostituita ? 'Andrà al posto di ' + sostituita + ' (' + (campo === 'email' ? 'prima' : 'seconda') + ' e-mail).' : 'Andrà nella ' + (campo === 'email' ? 'prima' : 'seconda') + ' e-mail, oggi vuota.'],
          ok: 'Sì, salvala', annulla: 'No, solo per l’accesso', focus: 'annulla',
        })) aggiornaAnag = { id: body.fratello_id, campo };
      }
      if (!(await window.LemmiDialogo.conferma({ titolo: 'Creare l’utente?', testo: body.email + ' con il profilo «' + PROFILI[body.ruolo] + '».', ok: 'Crea utente' }))) return;
      const ok = $('#nu-ok', v); ok.disabled = true; esito.innerHTML = '';
      try {
        const { data: ses } = await state.sb.auth.getSession();
        const headers = ses && ses.session ? { Authorization: 'Bearer ' + ses.session.access_token } : {};
        const { data, error } = await state.sb.functions.invoke('crea-utente', { body, headers });
        if (error) {
          let msg = error.message || 'Errore';
          const st = error.context && error.context.status;
          try { const j = await error.context.json(); if (j && j.errore) msg = j.errore; } catch (_) { /* nessun dettaglio */ }
          if (st === 404 || /failed to send|fetch/i.test(msg)) msg = 'La funzione «crea-utente» non risulta pubblicata su Supabase: segui il passo 1 del file LEGGIMI-aggiornamento-27.txt.';
          throw new Error(msg);
        }
        if (data && data.errore) throw new Error(data.errore);
        esito.innerHTML = `<div class="notice" style="margin-top:14px;background:var(--ok-bg);color:var(--ok)"><b>Utente creato.</b> Comunicagli, possibilmente a voce, questi dati di accesso:<br>
          E-mail: <b>${esc(body.email)}</b> · Password temporanea: <b>${esc(body.password)}</b><br><span class="hint">La password non verrà più mostrata. L’utente può cambiarla dalla pagina Loggia.</span>${avvisoHtml('nuovo', (data && data.user_id) || '', body.email, body.password, (data && data.fratello_id) || body.fratello_id)}<div class="actions mt-10"><button class="btn ghost small" type="button" id="nu-agg">Aggiorna l’elenco</button></div></div>`;
        toast('Utente creato', 'ok');
        collegaAvviso(esito);
        annota((data && data.user_id) || null, 'creazione', { email: body.email, ruolo: body.ruolo, fratello_id: body.fratello_id });
        if (aggiornaAnag) {
          try {
            chk(await state.sb.from('fratelli').update({ [aggiornaAnag.campo]: body.email }).eq('id', aggiornaAnag.id));
            toast('E-mail salvata anche nell’anagrafica', 'ok');
          } catch (e) { toast('Utente creato, ma l’anagrafica non è stata aggiornata: ' + messaggioErrore(e), 'bad'); }
        }
        azzera();
        $('#nu-agg', v).addEventListener('click', () => L.route());
      } catch (e) { esito.innerHTML = `<div class="notice bad mt-14">${esc(messaggioErrore(e))}</div>`; }
      ok.disabled = false;
    });

    $$('.sel-ruolo', v).forEach((sel) => sel.addEventListener('change', async () => {
      const nuovo = sel.value, prima = sel.dataset.prima;
      if (!nuovo || nuovo === prima) return;
      if (!(await window.LemmiDialogo.chiedi('Cambiare il profilo di ' + sel.dataset.nome + ' da «' + (PROFILI[prima] || prima || 'nessuno') + '» a «' + PROFILI[nuovo] + '»?\nCambiano subito le sezioni che può vedere e modificare.', { ok: 'Cambia profilo' }))) { sel.value = prima; return; }
      sel.disabled = true;
      try {
        chk(await state.sb.rpc('imposta_ruolo_utente', { p_user: sel.dataset.u, p_ruolo: nuovo }));
        await annota(sel.dataset.u, 'profilo', { email: sel.dataset.email, ruolo: nuovo, prima: prima });
        toast('Profilo aggiornato', 'ok');
        L.route();
      } catch (e) {
        const mancante = /could not find the function|schema cache/i.test((e && e.message) || '');
        toast(mancante ? 'Manca la funzione sul database: esegui lemmi_aggiornamento_26.sql su Supabase.' : messaggioErrore(e), 'bad');
        sel.value = prima; sel.disabled = false;
      }
    }));
    // ---- disattiva / riattiva / elimina (funzioni del database) ----
    const TESTI = {
      disattiva: (c) => ['Disattivare l’utente ' + c + '?\n\nNon potrà più accedere a Lemmi (se è già dentro, esce entro circa un’ora).\nProfilo e collegamento al Fratello restano: potrai riattivarlo quando vuoi.', null, 'Utente disattivato'],
      riattiva: (c) => ['Riattivare l’utente ' + c + '?\n\nTornerà ad accedere con la sua password e il suo profilo di prima.', null, 'Utente riattivato'],
      elimina: (c) => ['Eliminare l’utente ' + c + '?\n\nPerderà l’accesso a Lemmi e l’operazione non si può annullare (per ridargli l’accesso dovrai creare un nuovo utente).\nIl Fratello resta in anagrafica con tutta la sua storia.\n\nSe vuoi solo sospendere l’accesso, usa «Disattiva».', null, 'Utente eliminato'],   // la conferma finale si fa scrivendo l’e-mail
    };
    $$('.btn-gu', v).forEach((btn) => btn.addEventListener('click', async () => {
      const az = btn.dataset.az;
      const chi = btn.dataset.nome ? btn.dataset.nome + ' (' + btn.dataset.email + ')' : btn.dataset.email;
      const [c1, c2, ok] = TESTI[az](chi);
      if (!(await window.LemmiDialogo.chiedi(c1, { elimina: az === 'elimina', ok: ({ disattiva: 'Disattiva', riattiva: 'Riattiva', elimina: 'Elimina' })[az] }))) return;
      if (c2 && !(await window.LemmiDialogo.chiedi(c2, { elimina: az === 'elimina', ok: ({ disattiva: 'Disattiva', riattiva: 'Riattiva', elimina: 'Elimina' })[az] }))) return;
      if (az === 'elimina' && btn.dataset.email && !(await confermaScrivendo(btn.dataset.email, chi))) return;
      btn.disabled = true;
      try {
        // tutto direttamente sul database (script lemmi_aggiornamento_44.sql e _45.sql)
        if (az === 'elimina') {
          chk(await state.sb.rpc('elimina_utente_sistema', { p_user: btn.dataset.u }));
          await annota(btn.dataset.u, 'eliminazione', { email: btn.dataset.email });   // l'e-mail si passa qui: dopo l'eliminazione il database non la conosce più
        }
        else {
          chk(await state.sb.rpc('imposta_disattivazione_utente', { p_user: btn.dataset.u, p_disattiva: az === 'disattiva' }));
          await annota(btn.dataset.u, az === 'disattiva' ? 'disattivazione' : 'riattivazione', { email: btn.dataset.email });
        }
        toast(ok, 'ok');
        L.route();
      } catch (e) { toast(messaggioErrore(e), 'bad'); btn.disabled = false; }
    }));
    // ---- reimposta password (funzione del database, script lemmi_aggiornamento_46.sql) ----
    $$('.btn-pw', v).forEach((btn) => btn.addEventListener('click', async () => {
      const chi = btn.dataset.nome && btn.dataset.nome !== btn.dataset.email ? btn.dataset.nome + ' (' + btn.dataset.email + ')' : btn.dataset.email;
      if (!(await window.LemmiDialogo.chiedi('Reimpostare la password di ' + chi + '?\nLa vecchia password smette di funzionare e l’utente esce da eventuali sessioni aperte. Ti mostro la nuova password temporanea da comunicargli.', { ok: 'Reimposta' }))) return;
      const nuova = genPw();
      btn.disabled = true;
      try {
        chk(await state.sb.rpc('reimposta_password_utente', { p_user: btn.dataset.u, p_password: nuova }));
        const box = $('#pw-esito', v);
        box.innerHTML = `<div class="notice ok mb-14"><b>Password reimpostata</b> per ${esc(chi)}.<br>
          Nuova password temporanea: <code id="pw-val" style="font-size:1.05rem;user-select:all">${esc(nuova)}</code>
          <button class="btn small" type="button" id="pw-copia" style="margin-left:8px">Copia</button>
          <div class="hint mt-6">Comunicala all’utente in modo riservato: qui resta visibile solo finché non cambi pagina. Potrà cambiarla dalla pagina Loggia.</div>
          ${avvisoHtml('password', btn.dataset.u, btn.dataset.email, nuova, btn.dataset.fr)}</div>`;
        collegaAvviso(box);
        annota(btn.dataset.u, 'password', { email: btn.dataset.email });
        $('#pw-copia', v).addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(nuova); toast('Password copiata', 'ok'); } catch (_) { toast('Copia non riuscita: selezionala e copiala a mano', 'warn'); }
        });
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast('Password reimpostata', 'ok');
      } catch (e) { toast(messaggioErrore(e), 'bad'); }
      btn.disabled = false;
    }));
    $$('.sel-fr', v).forEach((sel) => sel.addEventListener('change', async () => {
      sel.disabled = true;
      try {
        chk(await state.sb.rpc('collega_utente_fratello', { p_user: sel.dataset.u, p_fratello: sel.value }));
        await annota(sel.dataset.u, 'collegamento', { fratello_id: sel.value || null, fratello: sel.value ? sel.options[sel.selectedIndex].text : 'nessuno' });
        toast('Collegamento salvato', 'ok');
        L.route();
      } catch (e) { toast(messaggioErrore(e), 'bad'); sel.disabled = false; }
    }));
  };
})();
