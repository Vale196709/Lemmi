/* Lemmi - BACKUP COMPLETO dell'applicazione (solo amministratore).
 * Crea un unico archivio ZIP cifrato (AES-256, apribile con 7-Zip) con:
 *   dati/            tutte le tabelle in JSON
 *   utenti/          elenco utenti di accesso con ruolo (senza password)
 *   file/            i file caricati (documenti, tavole, modelli)
 *   struttura/       struttura del database (sql/schema_completo.sql)
 *   codice/          tutto il codice dell'app, preso dal repository pubblicato
 *   ripristino/      script SQL per ricaricare dati e profili, più LEGGIMI con i passi
 *   manifest.json    elenco di tutto con impronta SHA-256, per verificare l'integrità
 * Nessun dato esce dal browser: l'archivio si crea qui e si scarica sul dispositivo. */
(function () {
  'use strict';

  // tabelle in ordine di dipendenza (chiavi esterne): così lo script di ripristino gira in un solo passaggio
  const TABELLE = ['categorie_movimento', 'conto_saldi', 'cronologia_modifiche', 'elenco_cariche', 'fasce_eta', 'fratelli', 'import_estratti', 'loggia',
    'modelli_loggia', 'modelli_messaggio', 'parametri_quote', 'pratiche', 'registro_attivita', 'tornate', 'verbali', 'voci_quota', 'agape_adesioni',
    'agape_ospiti', 'bussanti', 'cariche_storico', 'elezioni', 'eventi_conto', 'lavori', 'messaggi', 'passaggi_grado', 'piano_rate', 'pratiche_date',
    'pratiche_passi', 'presenze_verbale', 'profili', 'scadenze', 'conto_movimenti', 'documenti', 'messaggi_destinatari', 'agape_pagamenti', 'versamenti'];
  // non leggibili dall'app (nessuna regola di lettura) e comunque da non esportare: chiavi delle notifiche e dispositivi iscritti
  const ESCLUSE = ['push_chiavi', 'push_inviati', 'push_iscrizioni', 'backup_esecuzioni', 'backup_righe'];
  const CHIAVI = { elenco_cariche: ['nome'], pratiche_date: ['pratica_id', 'chiave'], pratiche_passi: ['pratica_id', 'indice'], profili: ['user_id'] };
  const GENERATE = { scadenze: ['importo_dovuto'] };               // colonne calcolate dal database: non si inseriscono
  const IDENTITA = ['cronologia_modifiche', 'presenze_verbale'];   // colonne id "generated always as identity"
  const FILE_DA = [
    { tabella: 'documenti', colonna: 'percorso', bucket: 'documenti-loggia' },
    { tabella: 'lavori', colonna: 'file_path', bucket: 'tavole' },
    { tabella: 'modelli_loggia', colonna: 'file_path', bucket: 'modelli' },
  ];
  const CHIAVE_ULTIMO = 'lemmi_ultimo_backup_completo';

  const enc = new TextEncoder();
  const qid = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const mb = (b) => (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + ' MB';
  async function sha256(bytes) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(h).map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  function letteraleSql(testo) {                                   // testo tra dollari, con un'etichetta che non compare nel testo
    let i = 1; while (testo.indexOf('$j' + i + '$') >= 0) i++;
    return '$j' + i + '$' + testo + '$j' + i + '$';
  }

  async function leggiTabella(sb, t) {
    const ord = CHIAVI[t] || ['id'], righe = [], passo = 1000;
    for (let da = 0; ; da += passo) {
      let q = sb.from(t).select('*');
      ord.forEach((c) => { q = q.order(c, { ascending: true }); });
      const r = await q.range(da, da + passo - 1);
      if (r.error) throw new Error(r.error.message || String(r.error));
      righe.push(...(r.data || []));
      if (!r.data || r.data.length < passo) break;
    }
    return righe;
  }

  /* ---------- script SQL di ripristino ---------- */
  function sqlDati(dati) {
    const o = ['-- Lemmi - ripristino dei dati. Eseguire DOPO schema_completo.sql e DOPO aver creato gli archivi file.',
      '-- Una sola esecuzione nel SQL Editor di Supabase. Ripetibile: le righe già presenti non vengono duplicate.', 'begin;', ''];
    const attese = [];
    TABELLE.filter((t) => t !== 'profili').forEach((t) => {
      const righe = dati[t];
      if (!righe || !righe.length) return;
      const colonne = [...new Set(righe.flatMap((r) => Object.keys(r)))].filter((c) => !(GENERATE[t] || []).includes(c));
      const lista = colonne.map(qid).join(', ');
      o.push('-- ' + t + ' (' + righe.length + ' righe)');
      o.push('alter table public.' + t + ' disable trigger user;');
      o.push('insert into public.' + t + ' (' + lista + ')' + (IDENTITA.includes(t) ? ' overriding system value' : '') +
        '\nselect ' + lista + ' from jsonb_populate_recordset(null::public.' + t + ', ' + letteraleSql(JSON.stringify(righe)) + '::jsonb)\non conflict do nothing;');
      o.push('alter table public.' + t + ' enable trigger user;');
      if (IDENTITA.includes(t)) o.push("select setval(pg_get_serial_sequence('public." + t + "', 'id'), (select coalesce(max(id), 1) from public." + t + '));');
      if (t === 'registro_attivita') o.push("select setval('public.registro_attivita_id_seq', (select coalesce(max(id), 1) from public.registro_attivita));");
      o.push('');
      attese.push("('" + t + "', " + righe.length + ')');
    });
    o.push('commit;', '', '-- Controllo finale: la colonna "presenti" deve essere uguale (o maggiore) di "attese".');
    o.push('with attese(tabella, attese) as (values ' + attese.join(', ') + ')');
    o.push("select tabella, attese, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', tabella), false, true, '')))[1]::text::int as presenti from attese order by tabella;");
    return o.join('\n') + '\n';
  }

  function sqlProfili(profili, utenti) {
    const emailDi = new Map((utenti || []).map((u) => [u.user_id, u.email]));
    const recs = (profili || []).map((p) => ({ email: emailDi.get(p.user_id) || null, ruolo: p.ruolo, nome_visualizzato: p.nome_visualizzato, fratello_id: p.fratello_id }));
    const lit = letteraleSql(JSON.stringify(recs));
    return ['-- Lemmi - ripristino dei profili (ruoli). Eseguire DOPO aver creato gli utenti in Authentication > Users e DOPO ripristino/1_dati.sql.',
      '-- Gli utenti si ritrovano dall\'indirizzo e-mail: nel progetto nuovo hanno un identificativo diverso.', 'begin;',
      'alter table public.profili disable trigger user;',
      'insert into public.profili (user_id, ruolo, nome_visualizzato, fratello_id)',
      'select u.id, p.ruolo::public.ruolo_app, p.nome_visualizzato, p.fratello_id',
      'from jsonb_to_recordset(' + lit + '::jsonb) as p(email text, ruolo text, nome_visualizzato text, fratello_id uuid)',
      'join auth.users u on lower(u.email) = lower(p.email)',
      'on conflict (user_id) do update set ruolo = excluded.ruolo, nome_visualizzato = excluded.nome_visualizzato, fratello_id = excluded.fratello_id;',
      'alter table public.profili enable trigger user;', 'commit;', '',
      '-- Utenti dell\'archivio che NON esistono ancora in Authentication (creali e riesegui questo script):',
      'select p.email, p.ruolo from jsonb_to_recordset(' + lit + '::jsonb) as p(email text, ruolo text)',
      'where not exists (select 1 from auth.users u where lower(u.email) = lower(p.email));', ''].join('\n');
  }

  function leggimi(info) {
    const t = info.tabelle, righeTot = Object.values(t).reduce((a, b) => a + b, 0);
    return `LEMMI - BACKUP COMPLETO DELL'APPLICAZIONE
Creato il ${info.creato} con la versione ${info.versione} dell'app.

COSA CONTIENE
  dati/          ${Object.keys(t).length} tabelle in formato JSON (${righeTot} righe in tutto)
  utenti/        elenco degli utenti di accesso con il ruolo (NESSUNA password)
  file/          i file caricati, nelle cartelle documenti-loggia, tavole, modelli (${info.fileScaricati} file${info.senzaFile ? ': NON inclusi in questo archivio' : ''})
  struttura/     schema_completo.sql: struttura del database (tabelle, funzioni, regole di sicurezza)
  codice/        tutto il codice dell'app (${info.codiceFile} file; i file vuoti, come .nojekyll, sono elencati in FILE-VUOTI.txt e vanno ricreati vuoti${info.codiceCompleto ? '' : ': ATTENZIONE, elenco parziale, vedi manifest.json'})
  ripristino/    script SQL per ricaricare dati e profili
  manifest.json  elenco di tutto con impronta SHA-256 per verificare che nulla sia stato alterato

COME SI APRE
  L'archivio e' cifrato (ZIP con AES-256). Si apre con 7-Zip (gratuito, 7-zip.org) inserendo la password scelta al momento della creazione.
  Se la password va persa, l'archivio NON si puo' recuperare. Conservalo in un posto sicuro, FUORI da Supabase e FUORI dal repository GitHub
  (che e' pubblico): contiene dati personali.

COME RIPRISTINARE TUTTO (in un progetto Supabase nuovo o vuoto)
  1. Crea il progetto su supabase.com. Annota l'indirizzo del progetto e la chiave pubblica ("anon") in Project Settings > API.
  2. SQL Editor: incolla struttura/schema_completo.sql ed esegui. Deve finire senza errori.
  3. Storage: crea tre archivi PRIVATI con limite di 10 MB per file, con questi nomi esatti: documenti-loggia, modelli, tavole.
  4. Authentication > Users: crea gli utenti elencati in utenti/utenti.json (Add user > Create new user, o Invite). Ognuno poi imposta una
     nuova password con "Password dimenticata".
  5. SQL Editor: esegui ripristino/1_dati.sql. In fondo mostra una tabella di controllo: "presenti" deve essere uguale ad "attese".
  6. SQL Editor: esegui ripristino/2_profili.sql. Ricollega gli utenti ai loro ruoli. L'ultima query elenca eventuali utenti ancora mancanti.
  7. Storage: carica i file della cartella file/<archivio>/ nello stesso archivio, mantenendo gli stessi percorsi.
  8. Database > Extensions: abilita pg_cron e pg_net. Poi nel SQL Editor ricrea i due job pianificati (sostituisci l'indirizzo del progetto
     nel secondo con quello nuovo):
       select cron.schedule('lemmi-backup-giornaliero', '30 1 * * *', $c$select public.esegui_backup('auto', 'automatico')$c$);
       vedi codice/sql/lemmi_aggiornamento_35.sql per il job 'lemmi-notifiche' (alle 07:00).
  9. Edge Functions: pubblica le funzioni di codice/supabase/functions (crea-utente e notifiche). I segreti SUPABASE_URL e
     SUPABASE_SERVICE_ROLE_KEY li fornisce Supabase da solo.
 10. Codice: crea un repository GitHub con il contenuto della cartella codice/, modifica js/config.js con indirizzo e chiave pubblica nuovi
     e attiva GitHub Pages. NON mettere mai nel codice la chiave "service_role".
 11. Accedi, apri "Stato del sistema" e controlla che i numeri tornino con il manifest.
 12. Notifiche: le chiavi si rigenerano da sole; ogni utente deve riattivare le notifiche dal proprio dispositivo.

COSA NON E' IN QUESTO ARCHIVIO
  - Password degli utenti (non sono accessibili: ognuno la reimposta).
  - Chiavi e iscrizioni delle notifiche push (non leggibili dall'app: si rigenerano).
  - Tabelle dei backup interni (backup_esecuzioni, backup_righe): sono copie dei dati gia' presenti qui.
  - Impostazioni del progetto Supabase (indirizzi di reindirizzamento, modelli delle e-mail): vanno riconfigurate a mano.
  - La struttura e' quella del file sql/schema_completo.sql del repository: se la struttura del database e' cambiata dopo l'ultimo
    aggiornamento di quel file, rigenerala con sql/esporta_schema.sql.
${info.anomalie.length ? '\nANOMALIE DURANTE LA CREAZIONE\n' + info.anomalie.map((a) => '  - ' + a).join('\n') + '\n' : ''}`;
  }

  /* ---------- creazione dell'archivio ---------- */
  async function creaArchivio(ctx) {
    const { sb, writer, opzioni } = ctx, prog = ctx.progresso || (() => {});
    const voci = [], anomalie = [], vuoti = [];
    const aggiungi = async (nome, contenuto, livello) => {
      const bytes = typeof contenuto === 'string' ? enc.encode(contenuto) : contenuto;
      // i file vuoti (per esempio .nojekyll) non si cifrano bene in tutti i programmi: si elencano a parte, da ricreare vuoti
      if (!bytes.length) { voci.push({ nome, byte: 0, sha256: await sha256(bytes), vuoto: true }); vuoti.push(nome); return; }
      voci.push({ nome, byte: bytes.length, sha256: await sha256(bytes) });
      await writer.add(nome, new ctx.zip.Uint8ArrayReader(bytes), livello === undefined ? {} : { level: livello });
    };

    // 1) dati
    const dati = {}, tabelle = {};
    for (let i = 0; i < TABELLE.length; i++) {
      const t = TABELLE[i];
      prog('Leggo la tabella ' + t + ' (' + (i + 1) + ' di ' + TABELLE.length + ')', i / TABELLE.length * 0.4);
      try { dati[t] = await leggiTabella(sb, t); tabelle[t] = dati[t].length; await aggiungi('dati/' + t + '.json', JSON.stringify(dati[t], null, 1)); }
      catch (e) { anomalie.push('Tabella ' + t + ' non letta: ' + e.message); }
    }

    // 2) utenti
    let utenti = [];
    try {
      const r = await sb.rpc('info_utenti_sistema');
      if (r.error) throw new Error(r.error.message);
      utenti = r.data || [];
      await aggiungi('utenti/utenti.json', JSON.stringify(utenti, null, 1));
    } catch (e) { anomalie.push('Elenco utenti non letto: ' + e.message); }

    // 3) script di ripristino
    prog('Preparo gli script di ripristino', 0.42);
    await aggiungi('ripristino/1_dati.sql', sqlDati(dati));
    await aggiungi('ripristino/2_profili.sql', sqlProfili(dati.profili, utenti));

    // 4) file caricati
    let fileScaricati = 0, fileTot = 0;
    if (opzioni.file) {
      const elenco = [];
      FILE_DA.forEach((f) => (dati[f.tabella] || []).forEach((r) => { if (r[f.colonna]) elenco.push({ bucket: f.bucket, path: r[f.colonna] }); }));
      fileTot = elenco.length;
      for (let i = 0; i < elenco.length; i++) {
        const f = elenco[i];
        prog('Scarico il file ' + (i + 1) + ' di ' + elenco.length, 0.45 + (i / Math.max(1, elenco.length)) * 0.35);
        try {
          const r = await sb.storage.from(f.bucket).download(f.path);
          if (r.error || !r.data) throw new Error((r.error && r.error.message) || 'vuoto');
          await aggiungi('file/' + f.bucket + '/' + f.path.replace(/^\/+/, '').replace(/\.\.\//g, ''), new Uint8Array(await r.data.arrayBuffer()), 0);
          fileScaricati++;
        } catch (e) { anomalie.push('File ' + f.bucket + '/' + f.path + ' non scaricato: ' + e.message); }
      }
    }

    // 5) struttura e codice
    prog('Aggiungo la struttura del database', 0.82);
    try { const s = await ctx.leggiTesto('sql/schema_completo.sql'); await aggiungi('struttura/schema_completo.sql', s); }
    catch (e) { anomalie.push('sql/schema_completo.sql non letto: ' + e.message); }
    let codiceFile = 0, codiceCompleto = true;
    try {
      const el = await ctx.elencoCodice();
      codiceCompleto = !!(el && el.completo);
      const percorsi = (el && el.percorsi) || [];
      for (let i = 0; i < percorsi.length; i++) {
        if (i % 10 === 0) prog('Aggiungo il codice dell\'app (' + i + ' di ' + percorsi.length + ')', 0.84 + (i / Math.max(1, percorsi.length)) * 0.12);
        try { const b = await ctx.leggiBinario(percorsi[i]); if (b) { await aggiungi('codice/' + percorsi[i], b, 0); codiceFile++; } else anomalie.push('Codice: ' + percorsi[i] + ' non scaricato'); }
        catch (e) { anomalie.push('Codice: ' + percorsi[i] + ' non scaricato (' + e.message + ')'); }
      }
      if (!codiceCompleto) anomalie.push('Elenco del codice parziale: non sono riuscito a leggere l\'elenco completo dal repository.');
    } catch (e) { codiceCompleto = false; anomalie.push('Codice dell\'app non letto: ' + e.message); }

    // 6) guida e manifest (ultimi: il manifest descrive tutto il resto)
    prog('Chiudo l\'archivio', 0.97);
    if (vuoti.length) await aggiungi('FILE-VUOTI.txt', 'File vuoti da ricreare (vuoti) con questi nomi e percorsi:\n' + vuoti.map((n) => '  ' + n).join('\n') + '\n');
    const info = { creato: ctx.creato, versione: ctx.versione, tabelle, fileScaricati, senzaFile: !opzioni.file, codiceFile, codiceCompleto, anomalie };
    await aggiungi('LEGGIMI-RIPRISTINO.txt', leggimi(info));
    const manifest = { formato: 1, creato_il: ctx.creato, app_versione: ctx.versione, tabelle,
      file: { inclusi: !!opzioni.file, attesi: fileTot, scaricati: fileScaricati },
      codice: { file: codiceFile, completo: codiceCompleto }, anomalie, voci };
    const bytesManifest = enc.encode(JSON.stringify(manifest, null, 1));
    await writer.add('manifest.json', new ctx.zip.Uint8ArrayReader(bytesManifest));
    return { tabelle, righe: Object.values(tabelle).reduce((a, b) => a + b, 0), fileScaricati, fileTot, codiceFile, codiceCompleto, anomalie, voci: voci.length };
  }

  /* ---------- parte visibile ---------- */
  function card() {
    return `<div class="card" id="bkc-card"><h2>Backup completo dell’applicazione</h2>
      <p class="muted">Un unico archivio ZIP cifrato con una password: dati, file caricati, elenco utenti, struttura del database, codice dell’app e guida di ripristino. Si apre con 7-Zip (gratuito). Si crea e si scarica qui, sul tuo dispositivo: nulla viene inviato altrove.</p>
      <div style="display:grid;gap:10px;max-width:460px;margin-top:10px">
        <label><input type="checkbox" id="bkc-file" checked> Includi i file caricati (documenti, tavole, modelli)</label>
        <label>Password dell’archivio (almeno 12 caratteri)<br><input type="password" id="bkc-pw" autocomplete="new-password" style="width:100%"></label>
        <label>Ripeti la password<br><input type="password" id="bkc-pw2" autocomplete="new-password" style="width:100%"></label>
        <label><input type="checkbox" id="bkc-ok"> Ho salvato la password in un posto sicuro: se la perdo, l’archivio non si può aprire</label>
        <div class="actions"><button class="btn" type="button" id="bkc-vai">Crea il backup completo</button></div>
        <progress id="bkc-pr" max="100" value="0" hidden style="width:100%"></progress>
        <div id="bkc-st" class="muted" aria-live="polite"></div>
      </div>
      <div class="hint" style="margin-top:10px">Conserva l’archivio fuori da Supabase (computer, chiavetta, disco esterno) e <b>mai nel repository GitHub</b>, che è pubblico. Consiglio: una copia a settimana, o dopo ogni modifica importante.</div></div>`;
  }

  function collega(radice) {
    const $ = (s) => radice.querySelector(s);
    const L = window.Lemmi, vai = $('#bkc-vai');
    if (!vai) return;
    const stato = (t, frazione) => { $('#bkc-st').textContent = t; const p = $('#bkc-pr'); if (frazione != null) { p.hidden = false; p.value = Math.round(frazione * 100); } };
    vai.addEventListener('click', async () => {
      const pw = $('#bkc-pw').value, pw2 = $('#bkc-pw2').value, conFile = $('#bkc-file').checked;
      if (pw.length < 12) return L.toast('La password deve avere almeno 12 caratteri.', 'bad');
      if (pw !== pw2) return L.toast('Le due password non coincidono.', 'bad');
      if (!$('#bkc-ok').checked) return L.toast('Conferma di aver salvato la password.', 'bad');
      const oggi = new Date().toISOString().slice(0, 10), nomeFile = 'Lemmi-backup-completo-' + oggi + '.zip';
      let ws = null;
      try {
        // dove salvare: con Chrome/Edge su computer si scrive direttamente su disco (nessun limite di memoria); altrove si scarica alla fine
        if (window.showSaveFilePicker) {
          try { ws = await (await window.showSaveFilePicker({ suggestedName: nomeFile, types: [{ description: 'Archivio ZIP', accept: { 'application/zip': ['.zip'] } }] })).createWritable(); }
          catch (e) { if (e && e.name === 'AbortError') return; ws = null; }
        }
        vai.disabled = true;
        stato('Preparo…', 0.01);
        const zip = await L.libreria('zip');
        zip.configure({ useWebWorkers: false });
        if (!ws && conFile) {
          try {
            const r = await L.state.sb.rpc('info_spazio');
            const tot = ((r.data && r.data.file) || []).reduce((a, x) => a + (Number(x.byte) || 0), 0);
            if (tot > 200 * 1048576 && !(await window.LemmiDialogo.conferma({ titolo: 'File molto grandi', testo: 'I file caricati occupano circa ' + mb(tot) + ': su questo dispositivo la creazione potrebbe fallire per mancanza di memoria. Meglio usare un computer con Chrome o Edge, oppure togliere la spunta ai file.', ok: 'Continua comunque', annulla: 'Annulla' }))) { vai.disabled = false; return; }
          } catch (_) { /* senza la stima si prosegue */ }
        }
        const writer = new zip.ZipWriter(ws || new zip.BlobWriter('application/zip'), { password: pw, encryptionStrength: 3, zipCrypto: false, level: 5 });
        const base = new URL('.', location.href).href;
        const rel = (p) => new URL(p, base).href;
        const risultato = await creaArchivio({
          sb: L.state.sb, writer, zip, opzioni: { file: conFile }, progresso: stato,
          creato: new Date().toLocaleString('it-IT'), versione: (window.LEMMI_VERSIONE || {}).numero || 'n/d',
          leggiTesto: async (p) => { const r = await fetch(rel(p), { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); },
          leggiBinario: async (p) => { const r = await fetch(rel(p), { cache: 'no-cache' }); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; },
          elencoCodice: () => elencoCodiceRepo(base, rel),
        });
        const blob = await writer.close();
        if (!ws) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = nomeFile; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 60000);
        }
        try { localStorage.setItem(CHIAVE_ULTIMO, new Date().toISOString()); } catch (_) { /* il promemoria non si aggiorna */ }
        stato('Archivio creato: ' + risultato.righe + ' righe in ' + Object.keys(risultato.tabelle).length + ' tabelle, ' + risultato.fileScaricati + ' file, ' + risultato.codiceFile + ' file di codice.' +
          (risultato.anomalie.length ? ' Attenzione: ' + risultato.anomalie.length + ' anomalie, elencate nel file LEGGIMI-RIPRISTINO.txt dentro l’archivio.' : ' Nessuna anomalia.'), 1);
        L.toast(risultato.anomalie.length ? 'Backup creato con ' + risultato.anomalie.length + ' anomalie' : 'Backup completo creato', risultato.anomalie.length ? 'bad' : 'ok');
        $('#bkc-pw').value = ''; $('#bkc-pw2').value = ''; $('#bkc-ok').checked = false;
      } catch (e) {
        if (ws) { try { await ws.abort(); } catch (_) { /* già chiuso */ } }
        stato('Non riuscito: ' + (e && e.message ? e.message : e), null);
        L.toast('Backup completo non riuscito', 'bad');
      } finally { vai.disabled = false; }
    });
  }

  // elenco dei file del repository: da GitHub (indirizzo ricavato da quello dell'app); se non disponibile, dai file che l'app stessa usa
  async function elencoCodiceRepo(base, rel) {
    try {
      const u = new URL(base);
      if (/\.github\.io$/.test(u.hostname)) {
        const owner = u.hostname.split('.')[0], repo = u.pathname.split('/').filter(Boolean)[0] || (owner + '.github.io');
        for (const ramo of ['main', 'master']) {
          const r = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/trees/' + ramo + '?recursive=1');
          if (!r.ok) continue;
          const j = await r.json();
          const percorsi = (j.tree || []).filter((x) => x.type === 'blob').map((x) => x.path);
          if (percorsi.length) return { percorsi, completo: !j.truncated };
        }
      }
    } catch (_) { /* si passa all'elenco di riserva */ }
    const set = new Set(['index.html', 'sw.js', 'manifest.webmanifest', 'README.md', 'sql/schema_completo.sql']);
    try {
      const html = await (await fetch(rel('index.html'), { cache: 'no-cache' })).text();
      (html.match(/(?:src|href)="(?!https?:|\/\/|#|data:)[^"]+"/g) || []).forEach((m) => set.add(m.slice(m.indexOf('"') + 1, -1).split('?')[0]));
    } catch (_) { /* resta l'elenco minimo */ }
    return { percorsi: [...set], completo: false };
  }

  const API = { card, collega, creaArchivio, sqlDati, sqlProfili, CHIAVE_ULTIMO };
  if (typeof window !== 'undefined') window.LemmiBackupCompleto = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
