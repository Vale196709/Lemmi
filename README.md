# Lemmi · Gestione di Loggia

Applicazione web statica (HTML, CSS, JavaScript) che si collega a **Supabase**.
Nessun server da mantenere e nessun abbonamento.

## Cosa fa (versione 0.1)

- **Accesso** con e-mail e password (utenti già creati su Supabase), con recupero della password via e-mail e cambio password dalla pagina Loggia.
- **Cruscotto** con contatori e prossime votazioni.
- **Bussanti**: elenco con ricerca, inserimento e modifica della pratica.
- **Moduli GOI precompilati**: genera **A/1** e **C/1** (ed. 2024) scrivendo i dati sui PDF originali, anche in un unico PDF. Opzione "copia per il Collegio" (A/1 senza pagina 5).
- **Documenti allegati**: caricamento di certificati, curriculum, foto e moduli firmati in un archivio privato; apertura con link temporaneo di 2 minuti.
- **Pagamenti e quote**: scadenze della capitazione (per fasce d'età, in unica rata o in due), aumenti di salario, iniziazioni; registrazione dei versamenti, anche per il Tronco della Vedova; riepilogo per voce e per Fratello. Richiede l'esecuzione dello script `lemmi_pagamenti.sql` su Supabase.
- **Conto di Loggia** (dentro Pagamenti): importazione dell'estratto conto della banca (xls, xlsx, csv) senza doppioni, categorie di entrata e di costo che si possono aggiungere (es. rimborso partecipazione Gran Loggia), movimenti inseriti a mano e collegamento dei bonifici dei Fratelli ai versamenti. Richiede lo script `lemmi_pagamenti_2.sql`.
- **Copia di sicurezza** (pagina Loggia, solo amministratore): scarica tutti i dati in un unico file Excel, un foglio per tabella.
- **Storia**: cariche ricoperte dai Fratelli per anno di competenza, consultabili per anno o per Fratello, con note.
- **Fratelli**: elenco con intestazioni ordinabili (clic sul titolo della colonna), ricerca e filtri per stato e grado. Ogni nome apre la **scheda del Fratello**: dati anagrafici e storia in ordine cronologico (iniziazione, passaggi di grado, cariche). Amministratore e Segretario possono aggiungere e correggere cariche, passaggi di grado e date di nascita e di iniziazione.
- **Lavori e tavole** (sotto Fratelli): lavori assegnati ai Fratelli con tipo, tema, autore (anche ospiti), gradi, tornata prevista, date di assegnazione, consegna e presentazione, stato e file allegato (PDF, Word, ODT o testo, fino a 10 MB, in un'area privata). Avvisi sui lavori in ritardo; il lavoro compare anche nella tornata del Calendario e nel **fascicolo del Fratello**, nella sua scheda (con download dei file e pulsante "Aggiungi lavoro"). Riservato ad amministratore, Venerabile e Segretario (cancella solo amministratore e Segretario). Richiede lo script `lemmi_officina_lavori.sql`.
- **Scheda del Fratello = storia completa**: la linea del tempo riporta la domanda da Bussante (domanda, presa in considerazione, votazioni), l'iniziazione, i passaggi di grado, le cariche e le tavole presentate. Il Bussante si riconosce per cognome e nome (e data di nascita, se nota a entrambi).
- **Calendario**: tornate ordinarie (1° e 3° mercoledì), informali via web (2° e 4° lunedì), straordinarie e agapi. Il pulsante "Genera calendario" crea le date dell'anno saltando le sospensioni (estate e feste di fine anno, modificabili); ogni tornata ha ora, grado (scelto di volta in volta), luogo o collegamento online, ordine del giorno, relatore e stato. Amministratore, Venerabile e Segretario inseriscono e modificano; amministratore e Segretario eliminano; tutti i ruoli consultano. Richiede lo script `lemmi_officina_calendario.sql`.
- **Loggia**: nome, numero e Oriente che intestano i moduli (solo amministratore).

Permessi: amministratore e Segretario inseriscono e modificano i bussanti; il Venerabile consulta; solo l'amministratore elimina. Il Tesoriere vede solo Pagamenti e Loggia: insieme all'amministratore registra scadenze e versamenti, mentre Venerabile e Segretario consultano. Le regole sono applicate dal database (RLS), non solo dall'interfaccia.

## 1. Configurazione

Apri `js/config.js` e inserisci:

- `SUPABASE_URL`: Supabase → Project Settings → API → *Project URL*
- `SUPABASE_ANON_KEY`: la chiave **anon public**

La chiave *anon* è fatta per stare nel browser. **Non usare mai la chiave `service_role`.**

## 2. Provare in locale (facoltativo)

I modelli PDF vengono caricati con `fetch`, quindi non basta aprire `index.html` con doppio clic. Da una cartella con Python installato:

```
python3 -m http.server 8000
```

poi apri http://localhost:8000

## 3. Pubblicare su GitHub Pages

1. Crea un repository su GitHub (es. `lemmi`).
2. Carica tutti i file di questa cartella (*Add file → Upload files*).
3. *Settings → Pages → Build and deployment*: sorgente **Deploy from a branch**, ramo `main`, cartella `/ (root)`.
4. Dopo un minuto l'app è raggiungibile all'indirizzo che GitHub mostra nella stessa pagina.

Nota: sul piano gratuito GitHub Pages richiede un repository **pubblico**. Nel repository ci sono solo codice e modelli vuoti, nessun dato personale: i dati restano su Supabase, protetti dall'accesso con password. Se preferisci un repository privato, puoi pubblicare gratis su Cloudflare Pages o Netlify collegando lo stesso repository.

## 4. Sicurezza su Supabase (consigliato)

- **Registrazioni libere:** in *Authentication → Sign In / Providers → Email* disattiva **Allow new users to sign up**, così nessuno può registrarsi da solo. Gli utenti si creano dal pannello (*Authentication → Users*) e il ruolo si assegna nella tabella `profili`.
- **Recupero password:** in *Authentication → URL Configuration* imposta come **Site URL** l'indirizzo dell'app (es. `https://TUO-UTENTE.github.io/lemmi/`) e aggiungilo anche tra i **Redirect URLs**. Senza questo passaggio il link ricevuto per e-mail non riporta all'app.
- **Chiave di accesso:** Supabase sta sostituendo le chiavi `anon` con le chiavi **publishable** (iniziano con `sb_publishable_`). La libreria inclusa (supabase-js 2.117.2) le accetta. Per passare: *Project Settings → API Keys → Publishable and secret API keys*, copia la chiave publishable e incollala in `js/config.js` al posto della chiave `anon`. Fallo dopo aver verificato che l'accesso funzioni, e mai con chiavi `secret` o `service_role`.
- **Copia di sicurezza:** scaricala dalla pagina Loggia una volta al mese e prima di ogni aggiornamento.

## Struttura

```
index.html          pagina unica
css/style.css       stile
js/config.js        configurazione Supabase
js/app.js           schermate, accesso, documenti
js/pdf.js           compilazione di A/1 e C/1 sopra i PDF originali
js/pagamenti.js     scadenze, versamenti e riepilogo
js/estratto.js      lettura degli estratti conto della banca
js/conto.js         scheda Conto di Loggia
js/storia.js        storia delle cariche dei Fratelli
js/fratelli.js      elenco Fratelli e scheda con la storia
js/calendario.js    calendario delle tornate
js/backup.js        copia di sicurezza in Excel
templates/          A1.pdf e C1.pdf (modelli ufficiali ed. 2024)
vendor/             librerie incluse (supabase-js, pdf-lib, SheetJS per i file Excel): nessun CDN
```

## Note sui moduli

- Firma e data di sottoscrizione restano in bianco, da compilare a mano.
- Il campo "Domicilio" resta uguale alla residenza se la scheda ha l'opzione "Coincide con la residenza".
- Se un testo non entra in un campo, il corpo del carattere si riduce automaticamente.
- Le posizioni dei campi sono nel file `js/pdf.js` (coordinate in punti, misurate dall'alto della pagina): se un campo risulta spostato si corregge lì.
- Se il GOI pubblica una nuova edizione dei modelli, basta sostituire i PDF in `templates/` e ricontrollare le coordinate.

## Estratti conto

- Il file viene letto nel browser, sul computer di chi lo carica: non passa da altri servizi. Il programma riconosce da solo la riga delle intestazioni e le colonne (data, descrizione, importo oppure dare/avere, saldo); se non ci riesce, le colonne si indicano a mano nella finestra di importazione.
- Importando lo stesso periodo più volte i movimenti già presenti vengono ignorati.
- La libreria per i file Excel è SheetJS 0.18.5, l'ultima pubblicata sul registro npm. Usa l'importazione solo con file scaricati direttamente dalla tua banca.
