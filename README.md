# Lemmi · Gestione di Loggia

Applicazione web statica (HTML, CSS, JavaScript) che si collega a **Supabase**.
Nessun server da mantenere e nessun abbonamento.

## Cosa fa (versione 0.1)

- **Accesso** con e-mail e password (utenti già creati su Supabase).
- **Cruscotto** con contatori e prossime votazioni.
- **Bussanti**: elenco con ricerca, inserimento e modifica della pratica.
- **Moduli GOI precompilati**: genera **A/1** e **C/1** (ed. 2024) scrivendo i dati sui PDF originali, anche in un unico PDF. Opzione "copia per il Collegio" (A/1 senza pagina 5).
- **Documenti allegati**: caricamento di certificati, curriculum, foto e moduli firmati in un archivio privato; apertura con link temporaneo di 2 minuti.
- **Fratelli**: consultazione dell'anagrafica (sola lettura).
- **Loggia**: nome, numero e Oriente che intestano i moduli (solo amministratore).

Permessi: amministratore e Segretario inseriscono e modificano; il Venerabile consulta; solo l'amministratore elimina. Il Tesoriere non ha accesso. Le regole sono applicate dal database (RLS), non solo dall'interfaccia.

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

- *Authentication → Sign In / Providers → Email*: disattiva **Allow new users to sign up**, così nessuno può registrarsi da solo.
- Gli utenti si creano dal pannello (*Authentication → Users*) e il ruolo si assegna nella tabella `profili`.
- Se in futuro userai link via e-mail o reimpostazione password: *Authentication → URL Configuration* → imposta come **Site URL** l'indirizzo dell'app.

## Struttura

```
index.html          pagina unica
css/style.css       stile
js/config.js        configurazione Supabase
js/app.js           schermate, accesso, documenti
js/pdf.js           compilazione di A/1 e C/1 sopra i PDF originali
templates/          A1.pdf e C1.pdf (modelli ufficiali ed. 2024)
vendor/             librerie incluse (supabase-js, pdf-lib): nessun CDN
```

## Note sui moduli

- Firma e data di sottoscrizione restano in bianco, da compilare a mano.
- Il campo "Domicilio" resta uguale alla residenza se la scheda ha l'opzione "Coincide con la residenza".
- Se un testo non entra in un campo, il corpo del carattere si riduce automaticamente.
- Le posizioni dei campi sono nel file `js/pdf.js` (coordinate in punti, misurate dall'alto della pagina): se un campo risulta spostato si corregge lì.
- Se il GOI pubblica una nuova edizione dei modelli, basta sostituire i PDF in `templates/` e ricontrollare le coordinate.
