# Lemmi · Gestione di Loggia

Applicazione web statica (HTML, CSS, JavaScript) che si collega a **Supabase**.
Nessun server da mantenere e nessun abbonamento.

Versione in uso: vedi `js/versione.js` (compare anche in fondo al menu dell'app).

- **Funzioni dell'app, per modulo:** [docs/funzioni.md](docs/funzioni.md)
- **Elenco degli script SQL e come usarli:** [sql/INDICE.md](sql/INDICE.md)
- **Note di ogni aggiornamento:** cartella [docs/aggiornamenti](docs/aggiornamenti)

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

## Prove automatiche

`npm test` esegue le prove sul codice; `npm run test:db` ricostruisce il database da `sql/schema_completo.sql` e lo controlla.
Si avviano da sole a ogni modifica caricata su GitHub (cartella `.github/workflows`).
