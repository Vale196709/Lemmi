# Lemmi · Gestione di Loggia

Applicazione web statica (HTML, CSS, JavaScript) che si collega a **Supabase**.
Nessun server da mantenere e nessun abbonamento.

## Cosa fa (versione 0.1)

- **Accesso** con e-mail e password (utenti già creati su Supabase), con recupero della password via e-mail e cambio password dalla pagina Loggia.
- **Cruscotto** compatto: una barra con Fratelli, bussanti, votazioni e Fratelli per stato (cliccabili), tre riquadri da 3 righe (prossime votazioni, pratiche in corso, prossime scadenze) e, subito sotto e senza scorrere, la vista economica.
- **Bussanti**: elenco con ricerca, inserimento e modifica della pratica.
- **Moduli GOI precompilati**: genera **A/1** e **C/1** (ed. 2024) scrivendo i dati sui PDF originali, anche in un unico PDF. Opzione "copia per il Collegio" (A/1 senza pagina 5).
- **Documenti allegati**: caricamento di certificati, curriculum, foto e moduli firmati in un archivio privato; apertura con link temporaneo di 2 minuti.
- **Tesoreria (pagamenti e quote)**: scadenze della capitazione (per fasce d'età, in unica rata o in due), aumenti di salario, iniziazioni; registrazione dei versamenti, anche per il Tronco della Vedova; riepilogo per voce e per Fratello. Richiede l'esecuzione dello script `lemmi_pagamenti.sql` su Supabase.
- **Conto di Loggia** (dentro Tesoreria): importazione dell'estratto conto della banca (xls, xlsx, csv) senza doppioni, categorie di entrata e di costo che si possono aggiungere (es. rimborso partecipazione Gran Loggia), movimenti inseriti a mano e collegamento dei bonifici dei Fratelli ai versamenti. Richiede lo script `lemmi_pagamenti_2.sql`.
- **Copia di sicurezza** (pagina Loggia, solo amministratore): scarica tutti i dati in un unico file Excel, un foglio per tabella.
- **Storia**: cariche ricoperte dai Fratelli per anno di competenza, consultabili per anno o per Fratello, con note.
- **Fratelli**: elenco con intestazioni ordinabili (clic sul titolo della colonna), ricerca e filtri per stato e grado. Ogni nome apre la **scheda del Fratello**: dati anagrafici e storia in ordine cronologico (iniziazione, passaggi di grado, cariche). Amministratore e Segretario possono aggiungere e correggere cariche, passaggi di grado e date di nascita e di iniziazione.
- **Lavori e tavole** (sotto Fratelli): lavori assegnati ai Fratelli con tipo, tema, autore (anche ospiti), gradi, tornata prevista, date di assegnazione, consegna e presentazione, stato e file allegato (PDF, Word, ODT o testo, fino a 10 MB, in un'area privata). Avvisi sui lavori in ritardo; il lavoro compare anche nella tornata del Calendario e nel **fascicolo del Fratello**, nella sua scheda (con download dei file e pulsante "Aggiungi lavoro"). Riservato ad amministratore, Venerabile e Segretario (cancella solo amministratore e Segretario). Richiede lo script `lemmi_officina_lavori.sql`.
- **Scheda del Fratello = storia completa**: la linea del tempo riporta la domanda da Bussante (domanda, presa in considerazione, votazioni), l'iniziazione, i passaggi di grado, le cariche e le tavole presentate. Il Bussante si riconosce per cognome e nome (e data di nascita, se nota a entrambi).
- **Elezioni cariche** (sotto Fratelli): preparazione (data, scadenza della convocazione a 15 giorni, controllo del periodo 15 novembre - 15 dicembre, tornata di Famiglia in Calendario), elenco di chi si può eleggere con i requisiti degli artt. 20 e 21 calcolati dalla storia dei Fratelli, registro delle votazioni con maggioranza assoluta, e PDF compilati sui modelli GOI 2024 (processo verbale e autocertificazioni, anno massonico aggiornato). Firme e date restano in bianco. Richiede lo script `lemmi_elezioni.sql`, il modello `templates/ELEZIONI.pdf` e, per le autocertificazioni, luogo di nascita e codice fiscale in anagrafica.
- **Ordinamento e formati**: ogni tabella dell'app si ordina cliccando sull'intestazione della colonna (un secondo clic inverte); il Calendario è ora un'unica tabella ordinabile. Tutti gli importi in euro sono nel formato 1.234,56 €.
- **Tesoreria**: schede in ordine Conto di Loggia, Scadenze, Riepilogo (Versamenti è nascosta: per riattivarla mettere `MOSTRA_VERSAMENTI = true` in `js/pagamenti.js`). Il Conto di Loggia mostra i totali di entrate, uscite e saldo dei movimenti visualizzati (cambiano con i filtri) e i totali per categoria.
- **Anagrafica dei Fratelli**: dalla scheda, «Modifica anagrafica» permette ad amministratore e Segretario di cambiare tutti i campi (nome, nascita, codice fiscale, indirizzo, contatti, stato, iniziazione). Richiede la parte 1 di `lemmi_utenti_permessi.sql`.
- **Piè di lista** (sotto Fratelli): elenco dei Fratelli aggiornato al 30 giugno o al 31 dicembre (matricola, grado, cognome e nome, data di nascita, indirizzo, professione, cellulare, e-mail, percentuale di esonero della capitazione), con scelta degli stati da includere, evidenza dei dati mancanti in anagrafe e firmatari proposti dalle cariche dell'anno (Oratore, Maestro Venerabile, Segretario). Scarica l'Excel e il PDF in A4 orizzontale da firmare, da inviare all'Anagrafe, alla Gran Segreteria e alla Segreteria del Collegio.
- **Insediamento delle cariche** (Elezioni cariche, riquadro 5): data dell'insediamento, nomina del Segretario e degli Ufficiali, verbale di trapasso dei poteri (Venerabile neoeletto o confermato, con la circolare GOI dell'anno), relazione sui lavori (con bozza preparata dai dati dell'app), conto gestione (calcolato dal Conto di Loggia, con controllo del pareggio) e aggiornamenti. Genera i PDF sui modelli GOI 2024 con gli anni aggiornati, divisi per destinatario: Anagrafe (promessa solenne e nomina del Segretario), Gran Segreteria (nomina Ufficiali, trapasso, relazione e conto) e Aggiornamenti (GOI e Collegio). Un pulsante registra le cariche nella storia dei Fratelli. Richiede `templates/INSEDIAMENTO.pdf`.
- **Vista economica nel Cruscotto** (amministratore, Venerabile e Tesoriere; il Tesoriere vede solo questa): liquidità stimata (ultimo saldo di banca registrato dall'estratto PDF più i movimenti successivi), entrate, uscite e risultato dell'anno, grafico mensile, da dove arrivano e dove vanno i soldi per categoria, stato delle quote dei Fratelli per voce, quote scadute, risultato degli eventi e movimenti da sistemare. Richiede lo script `lemmi_tesoreria_2.sql`.
- **Eventi di Conto di Loggia**: un evento (es. Festa della Luce 2026) raggruppa entrate e uscite e ne mostra il risultato. Le parole chiave dell'evento assegnano da sole i movimenti all'importazione; il pulsante «Evento» di un movimento lo assegna a mano.
- **Versamenti dei bussanti**: i bonifici di ingresso e la quota GOI girata si collegano al bussante (in automatico se nella causale compaiono cognome e nome) e compaiono nella sua scheda con quanto resta alla Loggia.
- **Estratto conto in PDF** (Tesoreria > Conto di Loggia > Importa): legge direttamente il PDF di BancoPosta (oltre a Excel e CSV), ricostruisce entrate e uscite dalle colonne e le confronta con i totali e il saldo finale stampati dalla banca: se non quadrano, non importa (salvo conferma esplicita). Suggerisce le categorie dalle descrizioni (spese bancarie, quota di ammissione GOI dei bussanti, versamento capitazioni al GOI, quote del Collegio, rimborsi, agapi e cene, quote di ingresso dei bussanti, quote di agapi ed eventi) e crea quelle che mancano. Il file resta sul computer. Il lettore PDF è pdf.js di Mozilla (licenza Apache 2.0, gratuito), nella cartella `vendor`.
- **Calendario**: rituali (ordinarie) il 1° e 3° lunedì del mese, conferenze via web (informali) il 2° e 4° lunedì, più straordinarie e agapi. Il quinto lunedì è a scelta del Venerabile: «Genera calendario» può inserirlo come tornata da stabilire (opzione da spuntare). La generazione avviene direttamente nell'app (non richiede più la funzione SQL `genera_calendario`), salta le sospensioni (estate e feste di fine anno, modificabili), non duplica le tornate già presenti e prima di creare avvisa quali date cadono in un giorno di festa. Le **feste** (nazionali, Pasqua e Lunedì dell'Angelo calcolati per ogni anno, Santi Pietro e Paolo se l'Oriente è Roma) sono evidenziate in rosso nell'elenco, con il nome della festa. Ogni tornata ha ora, grado, luogo o collegamento, relatore, ordine del giorno e stato.
- **Procedure** (menu, prima di Template): i passi da fare nelle diverse situazioni, come flusso verticale. Otto procedure: Bussante e iniziazione, Passaggio di grado, Trasferimento (Exeat), Assonnamento, Depennamento, Riammissione e regolarizzazione, Elezione e insediamento delle cariche, Piè di lista semestrale. Ogni passo indica chi agisce (Loggia, Collegio, GOI, interessato), i moduli GOI (cliccabili: aprono la compilazione in Template o la scheda del bussante), le scadenze e il collegamento alla sezione dell'app dove si lavora. I punti di decisione (voti contrari, Exeat negato, depennamento) sono con bordo tratteggiato. Ogni procedura ha spunte dei passi fatti con barra di avanzamento (promemoria personale, salvato solo nel browser), riepilogo di moduli e scadenze e pulsante Stampa o salva PDF. Nessuno script SQL. Accessibile ad amministratore, Venerabile e Segretario.
- **Verbali e presenze** (sotto Fratelli/Bussanti): *registro dei verbali di tornata*. Dal generatore (Template › Verbali di tornata) la nuova scheda **Presenze** elenca i Fratelli attivi che possono partecipare a quel grado (tornata di Apprendista: tutti; di Compagno: Compagni e Maestri; di Maestro: Maestri); tutti partono presenti e si segna solo chi manca (assente giustificato o assente). Numero dei presenti e assenti giustificati si compilano da soli nel testo. Il pulsante «Salva nel registro» (amministratore e Segretario) conserva data, presenze, ospiti e testo. Il **Registro** mostra i verbali per anno con presenti e assenti, li riapre nel generatore, li elimina e segnala le tornate già svolte secondo il Calendario senza verbale. **Presenze dei Fratelli**: per ogni Fratello tornate, presenze, giustificate, assenze, percentuale e ultima presenza o giustificazione, con avviso giallo vicino ai 6 mesi e rosso oltre i 6 mesi di assenza (art. 12 Costituzione), con rimando alla procedura di depennamento. Il conteggio è indicativo (non considera sospensione estiva e dispense). Richiede `lemmi_aggiornamento_19.sql`. Le tabelle `verbali` e `presenze_verbale` sono incluse nella copia di sicurezza.
- **Template** (menu): tutti i modelli in un unico posto. *Verbali di tornata* nei tre gradi (Apprendista, Compagno, Maestro): si inseriscono data (o si sceglie dal Calendario), presenti, assenti giustificati, ospiti, sostituzioni delle cariche e firmatari; il testo si prepara da solo sul modello della Loggia (anno di Vera Luce e mese massonico calcolati, tavola precedente e prossima tornata proposte dal Calendario, firmatari dalla Storia delle cariche), si può correggere a mano e si scarica in Word (.docx), con avviso se restano parti tra parentesi quadre da completare. *Moduli GOI*: scorciatoie alle schede che li compilano, download dei modelli vuoti e compilazione guidata dei moduli dell'iter dopo votazione e cerimonia: **N/1** (brevetto Iniziazione), **C/3** (arricchimento del piè di lista), **N/2-3** (brevetto Compagno/Maestro), **C/3 bis** (promozione/elevazione), **E/1** (rilascio Exeat), **E/2** (accoglimento trasferimento), **D/1** (depennamento, assonnamento, trasferimento, Oriente Eterno), **D/2** (verbale del Consiglio di disciplina), **V/1** (variazioni anagrafiche), **C/2** (rinuncia/rigetto della domanda), **N/4** (brevetto di riammissione/regolarizzazione), **A/2** (domanda di riammissione / cancellazione pena, 5 pagine) e **A/R** (domanda di regolarizzazione, 4 pagine). Nella scheda del bussante, per le domande diverse dall'iniziazione, il pulsante A/1 è sostituito dal modello giusto (A/2 o A/R), che si apre già compilato nella sezione Template. Si sceglie il Fratello o il bussante, i dati anagrafici si compilano da soli, il PDF si scrive sopra il modello ufficiale 2024 del Corso Segretari; firma, visto e data di trasmissione restano in bianco. *Modelli della Loggia*: archivio per categoria (verbali, tegolature, fogli presenze, calendario, inviti e agapi, logo e timbro, tavole) con caricamento di file fino a 10 MB (amministratore e Segretario caricano ed eliminano, Venerabile consulta). Richiede `lemmi_aggiornamento_18.sql`.
- **Info di sistema** (ex Configurazione): contiene Loggia e, solo per l'amministratore, **Utenti del sistema**: nome, cognome, grado, e-mail, profilo e ultimo accesso di chi può entrare nell'app. Il Fratello si riconosce dall'e-mail dell'anagrafica oppure si collega a mano dall'elenco. Richiede `lemmi_aggiornamento_18.sql`.
- **Grafici del Cruscotto drillabili**: un clic su un mese del grafico, su una categoria, su una voce di quota, sui riquadri (liquidità, entrate, uscite, risultato, quote, Fratelli, bussanti, votazioni) apre il dettaglio e permette di scendere ancora (mese > categoria > movimenti; voce > Fratello; stato > elenco dei Fratelli), con bollini di filtro, totali e percorso per tornare indietro. I nomi dei Fratelli aprono la scheda.
- **Stato del sistema** (Info di sistema, solo amministratore): *versione* dell'app con data dell'ultimo aggiornamento (anche in fondo al menu, per tutti; si cambia in `js/versione.js`); *spazio disponibile* del database (dati dell'app, backup interni, sistema) e dell'archivio file (documenti, tavole, modelli) con avvisi al 70% e al 90%; *backup*: completo circa una volta alla settimana e incrementale ogni notte (solo righe nuove, modificate o eliminate), pianificati con pg_cron, conservati per 5 settimane, lanciabili anche a mano e scaricabili in Excel. Richiede `lemmi_aggiornamento_26.sql`.
- **Profilo degli utenti** (Info di sistema > Utenti del sistema): l'amministratore cambia il profilo (amministratore, Maestro Venerabile, Segretario, Tesoriere) dal menu della colonna Profilo; il proprio non si può cambiare. Richiede `lemmi_aggiornamento_26.sql`.
- **App sul telefono** (PWA): su Android (Chrome) e iPhone (Safari) si può installare con «Aggiungi a schermata Home»: icona propria e schermo intero, senza store né abbonamenti. Il menu su telefono è una barra a scorrimento orizzontale. Il file `sw.js` salva solo i file del sito per i momenti senza connessione; i dati restano su Supabase e non vengono mai salvati sul telefono dall'app.
- **Loggia**: nome, numero e Oriente che intestano i moduli (solo amministratore).

Permessi: amministratore e Segretario inseriscono e modificano i bussanti; il Venerabile consulta; solo l'amministratore elimina. Il Tesoriere vede solo Tesoreria e Loggia: insieme all'amministratore registra scadenze e versamenti, mentre Venerabile e Segretario consultano. Le regole sono applicate dal database (RLS), non solo dall'interfaccia.

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
js/drill.js         approfondimento (drill-down) dei grafici del Cruscotto
js/moduli_goi_pdf.js compilazione PDF dei moduli GOI (N/1, C/3, N/2-3, C/3 bis, E/1, E/2, D/1, D/2, V/1, C/2, N/4, A/2, A/R: coordinate sul modello, anche su più pagine)
js/template.js      Template: verbali in Word, moduli GOI, modelli della Loggia
js/verbali.js       registro dei verbali e presenze dei Fratelli
js/docx_mini.js     scrittura di file Word senza librerie
js/utenti.js        Info di sistema: utenti del sistema
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
