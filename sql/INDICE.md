# Script SQL di Lemmi

Si eseguono in **Supabase › SQL Editor › Run**. Salvo dove indicato, si possono rieseguire senza danni.

## Per ricostruire tutto da zero

- `schema_completo.sql` — struttura completa del database (tabelle, regole di accesso, funzioni, archivi file). Contiene già l'effetto di tutti gli script più vecchi, anche di quelli non più presenti in questa cartella (pagamenti, tesoreria, elezioni, verbali, agapi…).
- `esporta_schema.sql` — sola lettura: produce la descrizione aggiornata della struttura, da incollare per rigenerare `schema_completo.sql`.

## Script di aggiornamento ancora presenti

| File | Cosa fa |
|---|---|
| `lemmi_aggiornamento_26.sql` | Stato del sistema: spazio, backup completo e incrementale |
| `lemmi_aggiornamento_30.sql` | Sicurezza e registro delle attività |
| `lemmi_aggiornamento_35.sql` | Libro Matricola, area dei Fratelli, notifiche sul telefono |
| `lemmi_aggiornamento_36.sql` | Il Segretario legge il Conto di Loggia (sola lettura) |
| `lemmi_aggiornamento_38.sql` | Più conti bancari (BNL e BancoPosta) e giroconti |
| `lemmi_aggiornamento_39.sql` | Collegamento automatico dei bonifici dei Fratelli |
| `lemmi_aggiornamento_40.sql` | Fratelli passati all'Oriente Eterno o trasferiti ad altra Officina |
| `lemmi_aggiornamento_42.sql` | Adesioni alle agapi |
| `lemmi_aggiornamento_43.sql` | Utenti del sistema: si vede se un utente è attivo o disattivato |
| `lemmi_aggiornamento_46.sql` | Reimposta la password di un utente |
| `lemmi_aggiornamento_47.sql` | Archivio cartaceo: registro degli originali, movimenti, funzione di prelievo/trasmissione/rientro |
| `lemmi_aggiornamento_48.sql` | Tavole semplificate: nessuno stato, ogni Fratello carica/modifica/elimina le proprie (regole sui file e funzioni `fratello_salva_tavola`, `fratello_elimina_tavola`) |
| `lemmi_aggiornamento_49.sql` | Seconda e-mail nell'anagrafica dei Fratelli (colonna `email_2`) |
| `lemmi_aggiornamento_50.sql` | Sicurezza: vista `v_fratelli_completi` filtrata per profilo; codice segreto per l'invio automatico delle notifiche |
| `lemmi_aggiornamento_51.sql` | Modalità «Tornata»: funzione `registra_tronco` per il Tronco della Vedova in Tesoreria (anche dal Segretario) |
| `lemmi_aggiornamento_52.sql` | Archivi dei file: accettano anche gli ZIP creati dalla compressione (errore «mime type application/zip is not supported») |
| `lemmi_aggiornamento_53.sql` | Caselle e rinnovi (cartella 04): PEC, PEO, dominio, scadenze, recupero, cambio password — senza password |
| `lemmi_aggiornamento_54.sql` | Tavole caricate da un Fratello per conto di un altro autore (colonna `caricata_da`, `elenco_autori_tavole`, nuove `fratello_salva_tavola` e `tavole_per_grado`) |
| `lemmi_aggiornamento_55.sql` | Diario della segreteria (cartella 08): attività verso Loggia e GOI con cronologia di invii, riscontri e solleciti |
| `lemmi_aggiornamento_56.sql` | Registro delle operazioni sugli utenti del sistema (`registra_operazione_utente`, voce «utenti_sistema» del Registro attività) |
| `lemmi_aggiornamento_57.sql` | «Novità» nel Cruscotto: ultimi documenti pubblicati (tavole e Biblioteca) con le stesse regole di lettura (`novita_documenti`) |
| `pulizia_bussanti.sql` | Da usare solo dopo aver eliminato un bussante dall'app: toglie i dati rimasti |

## Attenzione alla numerazione

- Il numero **43** è stato usato due volte: per le agapi (obiettivo coperti e ospiti, v0.44.0) e per gli utenti (v0.58.0). In questa cartella c'è solo quello degli utenti.
- Gli script **44** e **45** delle agapi (pagamenti, collegamento con la Tesoreria) e le funzioni per disattivare ed eliminare gli utenti non sono più qui. I loro effetti sono nel database in uso; vanno verificati nello `schema_completo.sql` (vedi sotto).
- Da ora in avanti ogni script nuovo prende il numero successivo all'ultimo (il prossimo è il **58**), e va aggiunto a questa tabella.

## Come tenere allineato lo schema

Dopo ogni script che cambia il database: eseguire `esporta_schema.sql`, rigenerare `schema_completo.sql` e controllare che `npm run test:db` passi (lo fa da solo anche GitHub).
