/* Lemmi - versione dell'app. DA AGGIORNARE a ogni aggiornamento: numero, data e una riga in "storia".
 * Compare in fondo al menu laterale (per tutti) e in Info di sistema > Stato del sistema (amministratore). */
window.LEMMI_VERSIONE = {
  numero: '0.32.0',
  data: '2026-10-30',               // data dell'ultimo aggiornamento (aaaa-mm-gg)
  storia: [
    { n: '0.32.0', data: '2026-10-30', t: 'Procedure: linee tratteggiate tra gli attori (Loggia, Collegio, GOI) nella vista a corsie' },
    { n: '0.31.0', data: '2026-10-29', t: 'Cerca in tutta l’app, Dati da completare, calendario .ics per il telefono e Relazione annuale del Venerabile' },
    { n: '0.30.0', data: '2026-10-29', t: 'Ripristino guidato da backup, registro delle attività e uscita automatica dopo 30 minuti di inattività' },
    { n: '0.29.0', data: '2026-10-29', t: 'App installabile su Android e iPhone (icona, schermo intero) e menu adatto al telefono' },
    { n: '0.28.0', data: '2026-10-29', t: 'Cruscotto compatto con la vista economica subito visibile; matricola nel piè di lista' },
    { n: '0.27.0', data: '2026-10-29', t: 'Voce Pagamenti rinominata Tesoreria; l’amministratore crea nuovi utenti da Utenti del sistema' },
    { n: '0.26.0', data: '2026-10-29', t: 'Stato del sistema: versione, profili degli utenti, spazio disponibile, backup completo settimanale e incrementale giornaliero' },
    { n: '0.25', t: 'Pratiche legate a una persona con scadenze automatiche (Cruscotto e Calendario)' },
    { n: '0.24', t: 'Procedure: vista a corsie (Loggia, Collegio, GOI)' },
    { n: '0.23', t: 'Bozze di e-mail/PEC per ogni passo; nuove procedure (Oriente Eterno, Fratello onorario, cambio titolo o sede, delega, consegne)' },
    { n: '0.22', t: 'Calendario: generazione nell’app, feste in rosso' },
    { n: '0.21', t: 'Verbali e presenze, avviso assenze a 5 e 6 mesi' },
    { n: '0.20', t: 'Procedure: flussi delle situazioni di Loggia' },
  ],
  // Limiti del piano Supabase in uso (piano Free: 500 MB di database, 1 GB di file). Cambiali se passi a un altro piano.
  inattivita_min: 30,   // minuti senza uso prima dell'uscita automatica
  limiti: { db_mb: 500, file_mb: 1024 },
};
