/* Lemmi - Controllo degli aggiornamenti del database e delle funzioni su Supabase (Info di sistema > Stato del sistema).
 * Per ogni script SQL recente verifica che esista ciò che lo script crea (tabella, colonna o funzione), senza modificare
 * nulla: le funzioni si «sondano» con parametri che il database rifiuta subito (es. importo negativo), così si sa se
 * esistono senza che facciano niente. Per la funzione «notifiche» chiede la versione pubblicata.
 * Per aggiungere un controllo: una riga in CONTROLLI (script, cosa, tipo di prova). */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, esc } = L;

  const ZERO = '00000000-0000-0000-0000-000000000000';
  const VERSIONE_NOTIFICHE = '2026-11-26';     // quella dell'ultimo supabase/functions/notifiche/index.ts

  // tipo: 'tabella' (t), 'colonna' (t, c), 'funzione' (f, a = parametri che il database rifiuta senza fare nulla)
  const CONTROLLI = [
    { s: 19, cosa: 'Registro dei verbali e presenze', tipo: 'tabella', t: 'presenze_verbale' },
    { s: 26, cosa: 'Backup automatici e stato del sistema', tipo: 'tabella', t: 'backup_esecuzioni' },
    { s: 47, cosa: 'Archivio cartaceo', tipo: 'tabella', t: 'originali_cartacei' },
    { s: 48, cosa: 'Tavole caricate dai Fratelli («Discussa il»)', tipo: 'colonna', t: 'lavori', c: 'data_discussione' },
    { s: 49, cosa: 'Seconda e-mail dei Fratelli', tipo: 'colonna', t: 'fratelli', c: 'email_2' },
    { s: 50, cosa: 'Sicurezza: codice segreto delle notifiche', tipo: 'colonna', t: 'push_chiavi', c: 'segreto_cron' },
    { s: 51, cosa: 'Modalità Tornata: Tronco della Vedova in Tesoreria', tipo: 'funzione', f: 'registra_tronco', a: { p_tornata: ZERO, p_importo: -1, p_note: null } },
    { s: 52, cosa: 'Archivi dei file che accettano gli ZIP', tipo: 'manuale', nota: 'Non verificabile dall’app: se caricando un file compare «mime type application/zip is not supported», esegui lo script 52.' },
    { s: 53, cosa: 'Caselle e rinnovi', tipo: 'tabella', t: 'caselle_rinnovi' },
    { s: 54, cosa: 'Tavole caricate per conto di altri', tipo: 'colonna', t: 'lavori', c: 'caricata_da' },
    { s: 55, cosa: 'Diario della segreteria', tipo: 'tabella', t: 'segreteria_attivita' },
    { s: 56, cosa: 'Registro delle operazioni sugli utenti', tipo: 'funzione', f: 'registra_operazione_utente', a: { p_user: ZERO, p_azione: 'verifica', p_dettaglio: {} } },
    { s: 57, cosa: '«Novità» nel Cruscotto', tipo: 'funzione', f: 'novita_documenti', a: { p_giorni: 1, p_limite: 1 } },
  ];

  const mancante = (err) => {
    if (!err) return false;
    const c = String(err.code || ''), m = String(err.message || '');
    return ['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42703', '42883'].includes(c) || /could not find|does not exist|schema cache/i.test(m);
  };

  async function prova(k) {
    try {
      if (k.tipo === 'manuale') return { esito: 'info', nota: k.nota };
      if (k.tipo === 'tabella') {
        const r = await state.sb.from(k.t).select('*', { head: true, count: 'exact' }).limit(1);
        return mancante(r.error) ? { esito: 'manca' } : r.error ? { esito: 'dubbio', nota: r.error.message } : { esito: 'ok' };
      }
      if (k.tipo === 'colonna') {
        const r = await state.sb.from(k.t).select(k.c).limit(0);
        return mancante(r.error) ? { esito: 'manca' } : r.error ? { esito: 'dubbio', nota: r.error.message } : { esito: 'ok' };
      }
      if (k.tipo === 'funzione') {
        const r = await state.sb.rpc(k.f, k.a);
        // la funzione esiste se risponde, anche con un rifiuto (che è proprio quello che ci aspettiamo)
        return mancante(r.error) ? { esito: 'manca' } : { esito: 'ok' };
      }
    } catch (e) { return { esito: 'dubbio', nota: (e && e.message) || String(e) }; }
    return { esito: 'dubbio' };
  }

  async function provaNotifiche() {
    try {
      const { data, error } = await state.sb.functions.invoke('notifiche', { body: { azione: 'versione' } });
      if (!error && data && data.versione) return data.versione >= VERSIONE_NOTIFICHE ? { esito: 'ok', nota: 'pubblicata la versione del ' + data.versione.split('-').reverse().join('/') } : { esito: 'manca', nota: 'pubblicata la versione del ' + data.versione.split('-').reverse().join('/') };
      const st = error && error.context && error.context.status;
      if (st === 404) return { esito: 'info', nota: 'La funzione non risulta pubblicata: serve solo se usi le notifiche sul telefono.' };
      return { esito: 'manca', nota: 'È una versione precedente: va ripubblicata.' };
    } catch (e) { return { esito: 'dubbio', nota: 'Non raggiungibile da qui.' }; }
  }

  async function esegui() {
    const ris = await Promise.all(CONTROLLI.map(async (k) => Object.assign({ k }, await prova(k))));
    const notif = await provaNotifiche();
    return { script: ris, notifiche: notif };
  }

  const BADGE = { ok: ['ok', 'Applicato'], manca: ['bad', 'Da eseguire'], dubbio: ['warn', 'Da controllare'], info: ['gray', 'Verifica a mano'] };
  function card(r) {
    if (!r) return '';
    const mancanti = r.script.filter((x) => x.esito === 'manca');
    const nm = r.notifiche.esito === 'manca';
    return `<div class="card"><h2>Aggiornamenti del database <small>script in <code>sql/</code> e funzioni su Supabase</small></h2>
      ${mancanti.length || nm ? `<div class="notice bad mb-12"><b>Da fare:</b> ${mancanti.length ? 'su Supabase › SQL Editor esegui, in quest’ordine, ' + mancanti.map((x) => `<code>lemmi_aggiornamento_${x.k.s}.sql</code>`).join(', ') + '.' : ''}${nm ? ` Ripubblica la funzione <code>notifiche</code> (Edge Functions) con il file <code>supabase/functions/notifiche/index.ts</code>.` : ''}</div>`
        : '<div class="notice ok mb-12">Tutti gli script recenti risultano eseguiti e la funzione delle notifiche è aggiornata.</div>'}
      <div class="table-wrap"><table><thead><tr><th>Script</th><th>Che cosa aggiunge</th><th>Stato</th></tr></thead><tbody>
      ${r.script.map((x) => `<tr><td><code>lemmi_aggiornamento_${x.k.s}.sql</code></td><td>${esc(x.k.cosa)}${x.nota ? `<div class="muted">${esc(x.nota)}</div>` : ''}</td><td><span class="badge ${BADGE[x.esito][0]}">${BADGE[x.esito][1]}</span></td></tr>`).join('')}
      <tr><td><code>notifiche</code> (Edge Function)</td><td>Avvisi sul telefono${r.notifiche.nota ? `<div class="muted">${esc(r.notifiche.nota)}</div>` : ''}</td><td><span class="badge ${BADGE[r.notifiche.esito][0]}">${r.notifiche.esito === 'manca' ? 'Da ripubblicare' : BADGE[r.notifiche.esito][1]}</span></td></tr>
      </tbody></table></div>
      <div class="hint mt-8">Il controllo non modifica nulla: verifica solo che esistano le tabelle, le colonne e le funzioni create dagli script. Gli script si possono rieseguire senza danni.</div></div>`;
  }

  window.LemmiVerificaScript = { esegui, card, CONTROLLI };
})();
