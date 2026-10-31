-- Lemmi - STRUTTURA COMPLETA DEL DATABASE (esportata da Supabase il 31/10/2026 con sql/esporta_schema.sql)
-- Solo struttura, nessun dato. Serve come documentazione e per ricostruire il database in caso di emergenza.
-- Ordine: tabelle, indici, viste, funzioni, trigger, regole di sicurezza (RLS), archivi file, pianificazioni.
-- NB: per una ricostruzione, eseguire prima le tabelle senza le chiavi esterne o in ordine di dipendenza.

create table if not exists public.backup_esecuzioni (
  id bigint not null default nextval('backup_esecuzioni_id_seq'::regclass),
  tipo text not null,
  origine text not null default 'manuale'::text,
  avviato_il timestamp with time zone not null default now(),
  concluso_il timestamp with time zone,
  esito text not null default 'in corso'::text,
  base_id bigint,
  tabelle integer,
  righe_nuove bigint not null default 0,
  righe_eliminate bigint not null default 0,
  byte bigint not null default 0,
  nota text,
  constraint backup_esecuzioni_tipo_check CHECK ((tipo = ANY (ARRAY['completo'::text, 'incrementale'::text]))),
  constraint backup_esecuzioni_pkey PRIMARY KEY (id)
);
alter table public.backup_esecuzioni enable row level security;

create table if not exists public.backup_righe (
  id bigint not null default nextval('backup_righe_id_seq'::regclass),
  esecuzione_id bigint not null,
  tabella text not null,
  hash text not null,
  dati jsonb,
  eliminata boolean not null default false,
  constraint backup_righe_esecuzione_id_fkey FOREIGN KEY (esecuzione_id) REFERENCES backup_esecuzioni(id) ON DELETE CASCADE,
  constraint backup_righe_pkey PRIMARY KEY (id)
);
alter table public.backup_righe enable row level security;

create table if not exists public.bussanti (
  id uuid not null default gen_random_uuid(),
  tipo_domanda tipo_domanda not null default 'iniziazione'::tipo_domanda,
  cognome text not null,
  nome text not null,
  luogo_nascita text,
  provincia_nascita character(2),
  data_nascita date,
  indirizzo text,
  cap text,
  citta text,
  provincia character(2),
  domicilio_indirizzo text,
  domicilio_cap text,
  domicilio_citta text,
  domicilio_provincia character(2),
  codice_fiscale text,
  cellulare text,
  email text,
  titolo_studio text,
  professione text,
  competenza_territoriale text,
  competenza_luogo text,
  presentatore_id uuid,
  dichiarazioni jsonb not null default '{}'::jsonb,
  note_dichiarazioni text,
  referenti jsonb not null default '[]'::jsonb,
  provenienza jsonb not null default '{}'::jsonb,
  data_domanda date,
  data_presa_in_considerazione date,
  data_comunicazione_collegio date,
  data_prima_votazione date,
  data_seconda_votazione date,
  creato_il timestamp with time zone not null default now(),
  aggiornato_il timestamp with time zone not null default now(),
  constraint bussanti_codice_fiscale_check CHECK (((codice_fiscale IS NULL) OR (codice_fiscale ~ '^[A-Z0-9]{16}$'::text))),
  constraint bussanti_competenza_territoriale_check CHECK ((competenza_territoriale = ANY (ARRAY['residenza'::text, 'sede_lavoro'::text]))),
  constraint bussanti_referenti_check CHECK (((jsonb_typeof(referenti) = 'array'::text) AND (jsonb_array_length(referenti) <= 3))),
  constraint bussanti_presentatore_id_fkey FOREIGN KEY (presentatore_id) REFERENCES fratelli(id) ON DELETE SET NULL,
  constraint bussanti_pkey PRIMARY KEY (id)
);
alter table public.bussanti enable row level security;

create table if not exists public.cariche_storico (
  id uuid not null default gen_random_uuid(),
  fratello_id uuid not null,
  carica text not null,
  anno_dal integer,
  anno_al integer,
  note text,
  constraint cariche_storico_check CHECK (((anno_dal IS NULL) OR (anno_al IS NULL) OR (anno_al >= anno_dal))),
  constraint cariche_storico_carica_fkey FOREIGN KEY (carica) REFERENCES elenco_cariche(nome),
  constraint cariche_storico_fratello_id_fkey FOREIGN KEY (fratello_id) REFERENCES fratelli(id) ON DELETE CASCADE,
  constraint cariche_storico_pkey PRIMARY KEY (id)
);
alter table public.cariche_storico enable row level security;

create table if not exists public.categorie_movimento (
  id uuid not null default gen_random_uuid(),
  nome text not null,
  tipo text not null,
  attiva boolean not null default true,
  note text,
  creato_il timestamp with time zone not null default now(),
  aggiornato_il timestamp with time zone not null default now(),
  constraint categorie_movimento_tipo_check CHECK ((tipo = ANY (ARRAY['entrata'::text, 'uscita'::text]))),
  constraint categorie_movimento_pkey PRIMARY KEY (id),
  constraint categorie_movimento_nome_key UNIQUE (nome)
);
alter table public.categorie_movimento enable row level security;

create table if not exists public.conto_movimenti (
  id uuid not null default gen_random_uuid(),
  import_id uuid,
  data_operazione date not null,
  data_valuta date,
  descrizione text,
  importo numeric(12,2) not null,
  saldo numeric(12,2),
  riferimento_banca text,
  impronta text not null,
  stato_riconciliazione text not null default 'da_riconciliare'::text,
  note text,
  creato_il timestamp with time zone not null default now(),
  aggiornato_il timestamp with time zone not null default now(),
  categoria_id uuid,
  fratello_id uuid,
  origine text not null default 'banca'::text,
  evento_id uuid,
  bussante_id uuid,
  constraint conto_movimenti_origine_check CHECK ((origine = ANY (ARRAY['banca'::text, 'manuale'::text]))),
  constraint conto_movimenti_stato_riconciliazione_check CHECK ((stato_riconciliazione = ANY (ARRAY['da_riconciliare'::text, 'riconciliato'::text, 'ignorato'::text]))),
  constraint conto_movimenti_bussante_id_fkey FOREIGN KEY (bussante_id) REFERENCES bussanti(id) ON DELETE SET NULL,
  constraint conto_movimenti_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES categorie_movimento(id) ON DELETE SET NULL,
  constraint conto_movimenti_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES eventi_conto(id) ON DELETE SET NULL,
  constraint conto_movimenti_fratello_id_fkey FOREIGN KEY (fratello_id) REFERENCES fratelli(id) ON DELETE SET NULL,
  constraint conto_movimenti_import_id_fkey FOREIGN KEY (import_id) REFERENCES import_estratti(id) ON DELETE SET NULL,
  constraint conto_movimenti_pkey PRIMARY KEY (id),
  constraint conto_movimenti_impronta_key UNIQUE (impronta)
);
alter table public.conto_movimenti enable row level security;

create table if not exists public.conto_saldi (
  id uuid not null default gen_random_uuid(),
  data date not null,
  saldo numeric(12,2) not null,
  fonte text,
  created_at timestamp with time zone not null default now(),
  constraint conto_saldi_pkey PRIMARY KEY (id),
  constraint conto_saldi_data_key UNIQUE (data)
);
alter table public.conto_saldi enable row level security;

create table if not exists public.cronologia_modifiche (
  id bigint not null,
  quando timestamp with time zone not null default now(),
  utente uuid,
  tabella text not null,
  operazione text not null,
  riga_id text,
  prima jsonb,
  dopo jsonb,
  constraint cronologia_modifiche_pkey PRIMARY KEY (id)
);
alter table public.cronologia_modifiche enable row level security;

create table if not exists public.documenti (
  id uuid not null default gen_random_uuid(),
  bussante_id uuid,
  fratello_id uuid,
  tipo tipo_documento not null,
  nome_file text not null,
  percorso text not null,
  mime text,
  dimensione bigint,
  note text,
  caricato_da uuid default auth.uid(),
  creato_il timestamp with time zone not null default now(),
  constraint documenti_check CHECK ((num_nonnulls(bussante_id, fratello_id) = 1)),
  constraint documenti_bussante_id_fkey FOREIGN KEY (bussante_id) REFERENCES bussanti(id) ON DELETE CASCADE,
  constraint documenti_fratello_id_fkey FOREIGN KEY (fratello_id) REFERENCES fratelli(id) ON DELETE CASCADE,
  constraint documenti_pkey PRIMARY KEY (id),
  constraint documenti_percorso_key UNIQUE (percorso)
);
alter table public.documenti enable row level security;

create table if not exists public.elenco_cariche (
  nome text not null,
  ordine integer not null default 100,
  constraint elenco_cariche_pkey PRIMARY KEY (nome)
);
alter table public.elenco_cariche enable row level security;

create table if not exists public.elezioni (
  id uuid not null default gen_random_uuid(),
  anno_massonico integer not null,
  data_elezione date,
  tornata_id uuid,
  nulla_osta_data date,
  nulla_osta_note text,
  dati jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint elezioni_tornata_id_fkey FOREIGN KEY (tornata_id) REFERENCES tornate(id) ON DELETE SET NULL,
  constraint elezioni_pkey PRIMARY KEY (id),
  constraint elezioni_anno_massonico_key UNIQUE (anno_massonico)
);
alter table public.elezioni enable row level security;

create table if not exists public.eventi_conto (
  id uuid not null default gen_random_uuid(),
  nome text not null,
  data_evento date,
  parole_chiave text,
  note text,
  created_at timestamp with time zone not null default now(),
  constraint eventi_conto_pkey PRIMARY KEY (id)
);
alter table public.eventi_conto enable row level security;

create table if not exists public.fasce_eta (
  id uuid not null default gen_random_uuid(),
  eta_da integer not null,
  importo numeric(10,2) not null,
  descrizione text,
  aggiornato_il timestamp with time zone not null default now(),
  constraint fasce_eta_eta_da_check CHECK (((eta_da >= 0) AND (eta_da <= 120))),
  constraint fasce_eta_importo_check CHECK ((importo >= (0)::numeric)),
  constraint fasce_eta_pkey PRIMARY KEY (id),
  constraint fasce_eta_eta_da_key UNIQUE (eta_da)
);
alter table public.fasce_eta enable row level security;

create table if not exists public.fratelli (
  id uuid not null default gen_random_uuid(),
  cognome text not null,
  nome text not null,
  data_nascita date,
  matricola text,
  indirizzo text,
  cap text,
  citta text,
  provincia character(2),
  professione text,
  cellulare text,
  email text,
  stato stato_fratello not null default 'attivo'::stato_fratello,
  anno_iniziazione integer,
  data_iniziazione date,
  note_riservate text,
  creato_il timestamp with time zone not null default now(),
  aggiornato_il timestamp with time zone not null default now(),
  constraint fratelli_pkey PRIMARY KEY (id),
  constraint fratelli_matricola_key UNIQUE (matricola)
);
alter table public.fratelli enable row level security;

create table if not exists public.import_estratti (
  id uuid not null default gen_random_uuid(),
  nome_file text not null,
  periodo_dal date,
  periodo_al date,
  righe_totali integer,
  righe_nuove integer,
  note text,
  caricato_da uuid default auth.uid(),
  creato_il timestamp with time zone not null default now(),
  constraint import_estratti_pkey PRIMARY KEY (id)
);
alter table public.import_estratti enable row level security;

create table if not exists public.lavori (
  id uuid not null default gen_random_uuid(),
  titolo text not null,
  tema text,
  tipo text not null default 'tavola'::text,
  fratello_id uuid,
  autore_esterno text,
  grado_autore text,
  grado_tornata text,
  tornata_id uuid,
  data_assegnazione date default CURRENT_DATE,
  data_consegna_prevista date,
  data_presentazione date,
  stato text not null default 'assegnato'::text,
  note text,
  file_path text,
  file_nome text,
  file_tipo text,
  file_dimensione bigint,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint lavori_grado_autore_check CHECK ((grado_autore = ANY (ARRAY['apprendista'::text, 'compagno'::text, 'maestro'::text]))),
  constraint lavori_grado_tornata_check CHECK ((grado_tornata = ANY (ARRAY['apprendista'::text, 'compagno'::text, 'maestro'::text]))),
  constraint lavori_stato_check CHECK ((stato = ANY (ARRAY['assegnato'::text, 'in_preparazione'::text, 'consegnato'::text, 'presentato'::text, 'archiviato'::text]))),
  constraint lavori_tipo_check CHECK ((tipo = ANY (ARRAY['tavola'::text, 'formazione'::text, 'relazione'::text, 'altro'::text]))),
  constraint lavori_fratello_id_fkey FOREIGN KEY (fratello_id) REFERENCES fratelli(id) ON DELETE SET NULL,
  constraint lavori_tornata_id_fkey FOREIGN KEY (tornata_id) REFERENCES tornate(id) ON DELETE SET NULL,
  constraint lavori_pkey PRIMARY KEY (id)
);
alter table public.lavori enable row level security;

create table if not exists public.loggia (
  id boolean not null default true,
  nome text,
  numero text,
  oriente text,
  aggiornato_il timestamp with time zone not null default now(),
  constraint loggia_id_check CHECK (id),
  constraint loggia_pkey PRIMARY KEY (id)
);
alter table public.loggia enable row level security;

create table if not exists public.messaggi (
  id uuid not null default gen_random_uuid(),
  modello_id uuid,
  categoria categoria_messaggio not null,
  oggetto text not null,
  corpo text not null,
  valori jsonb not null default '{}'::jsonb,
  stato stato_messaggio not null default 'bozza'::stato_messaggio,
  canale text,
  creato_da uuid default auth.uid(),
  approvato_da uuid,
  approvato_il timestamp with time zone,
  inviato_il timestamp with time zone,
  creato_il timestamp with time zone not null default now(),
  aggiornato_il timestamp with time zone not null default now(),
  constraint messaggi_modello_id_fkey FOREIGN KEY (modello_id) REFERENCES modelli_messaggio(id) ON DELETE SET NULL,
  constraint messaggi_pkey PRIMARY KEY (id)
);
alter table public.messaggi enable row level security;

create table if not exists public.messaggi_destinatari (
  id uuid not null default gen_random_uuid(),
  messaggio_id uuid not null,
  fratello_id uuid,
  email text not null,
  esito text,
  constraint messaggi_destinatari_fratello_id_fkey FOREIGN KEY (fratello_id) REFERENCES fratelli(id) ON DELETE SET NULL,
  constraint messaggi_destinatari_messaggio_id_fkey FOREIGN KEY (messaggio_id) REFERENCES messaggi(id) ON DELETE CASCADE,
  constraint messaggi_destinatari_pkey PRIMARY KEY (id),
  constraint messaggi_destinatari_messaggio_id_fratello_id_key UNIQUE (messaggio_id, fratello_id)
);
alter table public.messaggi_destinatari enable row level security;

create table if not exists public.modelli_loggia (
  id uuid not null default gen_random_uuid(),
  categoria text not null default 'altro'::text,
  nome text not null,
  descrizione text,
  file_path text not null,
  file_nome text,
  mime text,
  dimensione bigint,
  creato_il timestamp with time zone not null default now(),
  creato_da uuid default auth.uid(),
  constraint modelli_loggia_pkey PRIMARY KEY (id)
);
alter table public.modelli_loggia enable row level security;

create table if not exists public.modelli_messaggio (
  id uuid not null default gen_random_uuid(),
  codice text not null,
  nome text not null,
  categoria categoria_messaggio not null,
  oggetto text not null,
  corpo text not null,
  campi jsonb not null default '[]'::jsonb,
  attivo boolean not null default true,
  creato_il timestamp with time zone not null default now(),
  aggiornato_il timestamp with time zone not null default now(),
  constraint modelli_messaggio_pkey PRIMARY KEY (id),
  constraint modelli_messaggio_codice_key UNIQUE (codice)
);
alter table public.modelli_messaggio enable row level security;

create table if not exists public.parametri_quote (
  id boolean not null default true,
  eta_giorno integer not null default 1,
  eta_mese integer not null default 1,
  aggiornato_il timestamp with time zone not null default now(),
  constraint parametri_quote_eta_giorno_check CHECK (((eta_giorno >= 1) AND (eta_giorno <= 31))),
  constraint parametri_quote_eta_mese_check CHECK (((eta_mese >= 1) AND (eta_mese <= 12))),
  constraint parametri_quote_id_check CHECK (id),
  constraint parametri_quote_pkey PRIMARY KEY (id)
);
alter table public.parametri_quote enable row level security;

create table if not exists public.passaggi_grado (
  id uuid not null default gen_random_uuid(),
  fratello_id uuid not null,
  grado grado_massonico not null,
  anno integer,
  data date,
  constraint passaggi_grado_fratello_id_fkey FOREIGN KEY (fratello_id) REFERENCES fratelli(id) ON DELETE CASCADE,
  constraint passaggi_grado_pkey PRIMARY KEY (id)
);
alter table public.passaggi_grado enable row level security;

create table if not exists public.piano_rate (
  id uuid not null default gen_random_uuid(),
  voce_id uuid not null,
  modalita text not null,
  rata_n integer not null,
  giorno integer not null,
  mese integer not null,
  percentuale numeric(5,2) not null,
  constraint piano_rate_giorno_check CHECK (((giorno >= 1) AND (giorno <= 31))),
  constraint piano_rate_mese_check CHECK (((mese >= 1) AND (mese <= 12))),
  constraint piano_rate_modalita_check CHECK ((modalita = ANY (ARRAY['unica'::text, 'due_rate'::text]))),
  constraint piano_rate_percentuale_check CHECK (((percentuale > (0)::numeric) AND (percentuale <= (100)::numeric))),
  constraint piano_rate_rata_n_check CHECK ((rata_n >= 1)),
  constraint piano_rate_voce_id_fkey FOREIGN KEY (voce_id) REFERENCES voci_quota(id) ON DELETE CASCADE,
  constraint piano_rate_pkey PRIMARY KEY (id),
  constraint piano_rate_voce_id_modalita_rata_n_key UNIQUE (voce_id, modalita, rata_n)
);
alter table public.piano_rate enable row level security;

create table if not exists public.pratiche (
  id uuid not null default gen_random_uuid(),
  procedura text not null,
  titolo text not null,
  rif_tipo text,
  rif_id text,
  rif_nome text,
  stato text not null default 'in_corso'::text,
  creata_il timestamp with time zone not null default now(),
  creata_da uuid default auth.uid(),
  chiusa_il timestamp with time zone,
  constraint pratiche_procedura_check CHECK ((procedura = ANY (ARRAY['bussante'::text, 'grado'::text, 'exeat'::text, 'consegne'::text]))),
  constraint pratiche_rif_tipo_check CHECK ((rif_tipo = ANY (ARRAY['bussante'::text, 'fratello'::text]))),
  constraint pratiche_stato_check CHECK ((stato = ANY (ARRAY['in_corso'::text, 'conclusa'::text, 'annullata'::text]))),
  constraint pratiche_pkey PRIMARY KEY (id)
);
alter table public.pratiche enable row level security;

create table if not exists public.pratiche_date (
  pratica_id uuid not null,
  chiave text not null,
  valore text not null,
  constraint pratiche_date_pratica_id_fkey FOREIGN KEY (pratica_id) REFERENCES pratiche(id) ON DELETE CASCADE,
  constraint pratiche_date_pkey PRIMARY KEY (pratica_id, chiave)
);
alter table public.pratiche_date enable row level security;

create table if not exists public.pratiche_passi (
  pratica_id uuid not null,
  indice integer not null,
  data_fatto date not null default CURRENT_DATE,
  fatto_da uuid default auth.uid(),
  constraint pratiche_passi_pratica_id_fkey FOREIGN KEY (pratica_id) REFERENCES pratiche(id) ON DELETE CASCADE,
  constraint pratiche_passi_pkey PRIMARY KEY (pratica_id, indice)
);
alter table public.pratiche_passi enable row level security;

create table if not exists public.presenze_verbale (
  id bigint not null,
  verbale_id uuid not null,
  fratello_id text not null,
  esito text not null,
  constraint presenze_verbale_esito_check CHECK ((esito = ANY (ARRAY['presente'::text, 'giustificato'::text, 'assente'::text]))),
  constraint presenze_verbale_verbale_id_fkey FOREIGN KEY (verbale_id) REFERENCES verbali(id) ON DELETE CASCADE,
  constraint presenze_verbale_pkey PRIMARY KEY (id),
  constraint presenze_verbale_verbale_id_fratello_id_key UNIQUE (verbale_id, fratello_id)
);
alter table public.presenze_verbale enable row level security;

create table if not exists public.profili (
  user_id uuid not null,
  ruolo ruolo_app not null,
  nome_visualizzato text,
  fratello_id uuid,
  constraint profili_fratello_id_fkey FOREIGN KEY (fratello_id) REFERENCES fratelli(id) ON DELETE SET NULL,
  constraint profili_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint profili_pkey PRIMARY KEY (user_id)
);
alter table public.profili enable row level security;

create table if not exists public.registro_attivita (
  id bigint not null default nextval('registro_attivita_id_seq'::regclass),
  quando timestamp with time zone not null default now(),
  utente_id uuid,
  utente_email text,
  tabella text not null,
  operazione text not null,
  riga_id text,
  prima jsonb,
  dopo jsonb,
  constraint registro_attivita_operazione_check CHECK ((operazione = ANY (ARRAY['inserimento'::text, 'modifica'::text, 'eliminazione'::text]))),
  constraint registro_attivita_pkey PRIMARY KEY (id)
);
alter table public.registro_attivita enable row level security;

create table if not exists public.scadenze (
  id uuid not null default gen_random_uuid(),
  voce_id uuid not null,
  fratello_id uuid not null,
  anno integer not null,
  rata_n integer not null default 1,
  rate_totali integer not null default 1,
  eta_calcolata integer,
  importo_base numeric(10,2) not null,
  sconto numeric(10,2) not null default 0,
  importo_dovuto numeric(10,2) default GREATEST((importo_base - sconto), (0)::numeric),
  data_scadenza date,
  motivo_eccezione text,
  note text,
  creato_da uuid default auth.uid(),
  creato_il timestamp with time zone not null default now(),
  aggiornato_il timestamp with time zone not null default now(),
  constraint scadenze_anno_check CHECK (((anno >= 2000) AND (anno <= 2100))),
  constraint scadenze_check CHECK ((rata_n <= rate_totali)),
  constraint scadenze_importo_base_check CHECK ((importo_base >= (0)::numeric)),
  constraint scadenze_rata_n_check CHECK ((rata_n >= 1)),
  constraint scadenze_rate_totali_check CHECK ((rate_totali >= 1)),
  constraint scadenze_sconto_check CHECK ((sconto >= (0)::numeric)),
  constraint scadenze_fratello_id_fkey FOREIGN KEY (fratello_id) REFERENCES fratelli(id) ON DELETE RESTRICT,
  constraint scadenze_voce_id_fkey FOREIGN KEY (voce_id) REFERENCES voci_quota(id),
  constraint scadenze_pkey PRIMARY KEY (id),
  constraint scadenze_voce_id_fratello_id_anno_rata_n_key UNIQUE (voce_id, fratello_id, anno, rata_n)
);
alter table public.scadenze enable row level security;

create table if not exists public.tornate (
  id uuid not null default gen_random_uuid(),
  data date not null,
  ora time without time zone,
  tipo text not null,
  grado text,
  luogo text,
  link_online text,
  di_famiglia boolean not null default false,
  formazione boolean not null default false,
  solennita text,
  ordine_del_giorno text,
  relatore text,
  stato text not null default 'programmata'::text,
  note text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint tornate_grado_check CHECK ((grado = ANY (ARRAY['apprendista'::text, 'compagno'::text, 'maestro'::text]))),
  constraint tornate_stato_check CHECK ((stato = ANY (ARRAY['programmata'::text, 'convocata'::text, 'svolta'::text, 'annullata'::text]))),
  constraint tornate_tipo_check CHECK ((tipo = ANY (ARRAY['ordinaria'::text, 'informale'::text, 'straordinaria'::text, 'agape'::text]))),
  constraint tornate_pkey PRIMARY KEY (id),
  constraint tornate_data_tipo_key UNIQUE (data, tipo)
);
alter table public.tornate enable row level security;

create table if not exists public.verbali (
  id uuid not null default gen_random_uuid(),
  data date not null,
  grado text not null,
  presenti integer not null default 0,
  ospiti text,
  testo text,
  dati jsonb,
  creato_il timestamp with time zone not null default now(),
  aggiornato_il timestamp with time zone not null default now(),
  creato_da uuid default auth.uid(),
  constraint verbali_grado_check CHECK ((grado = ANY (ARRAY['apprendista'::text, 'compagno'::text, 'maestro'::text]))),
  constraint verbali_pkey PRIMARY KEY (id),
  constraint verbali_data_grado_key UNIQUE (data, grado)
);
alter table public.verbali enable row level security;

create table if not exists public.versamenti (
  id uuid not null default gen_random_uuid(),
  data_versamento date not null,
  voce_id uuid not null,
  fratello_id uuid,
  anno integer not null,
  importo numeric(10,2) not null,
  scadenza_id uuid,
  modalita text,
  riferimento text,
  movimento_id uuid,
  note text,
  creato_da uuid default auth.uid(),
  creato_il timestamp with time zone not null default now(),
  aggiornato_il timestamp with time zone not null default now(),
  constraint versamenti_anno_check CHECK (((anno >= 2000) AND (anno <= 2100))),
  constraint versamenti_importo_check CHECK ((importo > (0)::numeric)),
  constraint versamenti_modalita_check CHECK ((modalita = ANY (ARRAY['contanti'::text, 'bonifico'::text, 'carta'::text, 'assegno'::text, 'altro'::text]))),
  constraint versamenti_fratello_id_fkey FOREIGN KEY (fratello_id) REFERENCES fratelli(id) ON DELETE RESTRICT,
  constraint versamenti_movimento_id_fkey FOREIGN KEY (movimento_id) REFERENCES conto_movimenti(id) ON DELETE SET NULL,
  constraint versamenti_scadenza_id_fkey FOREIGN KEY (scadenza_id) REFERENCES scadenze(id) ON DELETE RESTRICT,
  constraint versamenti_voce_id_fkey FOREIGN KEY (voce_id) REFERENCES voci_quota(id),
  constraint versamenti_pkey PRIMARY KEY (id)
);
alter table public.versamenti enable row level security;

create table if not exists public.voci_quota (
  id uuid not null default gen_random_uuid(),
  codice text not null,
  nome text not null,
  personale boolean not null default true,
  tipo_importo text not null,
  importo_fisso numeric(10,2),
  gradi_applicabili text[],
  attiva boolean not null default true,
  note text,
  creato_il timestamp with time zone not null default now(),
  aggiornato_il timestamp with time zone not null default now(),
  esenzione_eta_sotto integer,
  esenzione_importo numeric(10,2),
  constraint voce_fisso_ha_importo CHECK (((tipo_importo <> 'fisso'::text) OR (importo_fisso IS NOT NULL))),
  constraint voci_quota_importo_fisso_check CHECK (((importo_fisso IS NULL) OR (importo_fisso >= (0)::numeric))),
  constraint voci_quota_tipo_importo_check CHECK ((tipo_importo = ANY (ARRAY['fisso'::text, 'per_eta'::text, 'libero'::text]))),
  constraint voci_quota_pkey PRIMARY KEY (id),
  constraint voci_quota_codice_key UNIQUE (codice)
);
alter table public.voci_quota enable row level security;

CREATE INDEX backup_righe_esec_idx ON public.backup_righe USING btree (esecuzione_id, tabella);

CREATE INDEX backup_righe_hash_idx ON public.backup_righe USING btree (tabella, hash);

CREATE INDEX bussanti_cf_idx ON public.bussanti USING btree (codice_fiscale);

CREATE INDEX bussanti_cognome_idx ON public.bussanti USING btree (cognome, nome);

CREATE INDEX cariche_storico_fratello_id_idx ON public.cariche_storico USING btree (fratello_id);

CREATE INDEX conto_movimenti_bussante_idx ON public.conto_movimenti USING btree (bussante_id);

CREATE INDEX conto_movimenti_categoria_idx ON public.conto_movimenti USING btree (categoria_id);

CREATE INDEX conto_movimenti_data_idx ON public.conto_movimenti USING btree (data_operazione);

CREATE INDEX conto_movimenti_evento_idx ON public.conto_movimenti USING btree (evento_id);

CREATE INDEX documenti_bussante_idx ON public.documenti USING btree (bussante_id);

CREATE INDEX documenti_fratello_idx ON public.documenti USING btree (fratello_id);

CREATE INDEX lavori_fratello_idx ON public.lavori USING btree (fratello_id);

CREATE INDEX lavori_stato_idx ON public.lavori USING btree (stato);

CREATE INDEX lavori_tornata_idx ON public.lavori USING btree (tornata_id);

CREATE INDEX messaggi_destinatari_messaggio_id_idx ON public.messaggi_destinatari USING btree (messaggio_id);

CREATE INDEX passaggi_grado_fratello_id_idx ON public.passaggi_grado USING btree (fratello_id);

CREATE INDEX pratiche_rif_idx ON public.pratiche USING btree (rif_tipo, rif_id);

CREATE INDEX pratiche_stato_idx ON public.pratiche USING btree (stato);

CREATE INDEX presenze_verbale_fratello_idx ON public.presenze_verbale USING btree (fratello_id);

CREATE INDEX registro_attivita_quando_idx ON public.registro_attivita USING btree (quando DESC);

CREATE INDEX registro_attivita_tabella_idx ON public.registro_attivita USING btree (tabella, quando DESC);

CREATE INDEX scadenze_fratello_idx ON public.scadenze USING btree (fratello_id, anno);

CREATE INDEX tornate_data_idx ON public.tornate USING btree (data);

CREATE INDEX versamenti_fratello_idx ON public.versamenti USING btree (fratello_id, anno);

CREATE INDEX versamenti_scadenza_idx ON public.versamenti USING btree (scadenza_id);

create or replace view public.v_conto_movimenti as
 SELECT m.id,
    m.data_operazione,
    m.data_valuta,
    m.descrizione,
    m.importo,
    m.saldo,
    m.riferimento_banca,
    m.origine,
    m.stato_riconciliazione,
    m.categoria_id,
    c.nome AS categoria,
    m.fratello_id,
        CASE
            WHEN f.id IS NULL THEN NULL::text
            ELSE (f.cognome || ' '::text) || f.nome
        END AS fratello,
    m.note,
    m.import_id
   FROM conto_movimenti m
     LEFT JOIN categorie_movimento c ON c.id = m.categoria_id
     LEFT JOIN fratelli f ON f.id = m.fratello_id
  WHERE ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'tesoriere'::ruolo_app]);

create or replace view public.v_fratelli_completi as
 SELECT id,
    cognome,
    nome,
    data_nascita,
    matricola,
    indirizzo,
    cap,
    citta,
    provincia,
    professione,
    cellulare,
    email,
    stato,
    anno_iniziazione,
    data_iniziazione,
    note_riservate,
    creato_il,
    aggiornato_il,
    ( SELECT p.grado
           FROM passaggi_grado p
          WHERE p.fratello_id = f.id
          ORDER BY p.grado DESC
         LIMIT 1) AS grado_attuale,
    ( SELECT string_agg(c.carica, ', '::text ORDER BY c.carica) AS string_agg
           FROM cariche_storico c
          WHERE c.fratello_id = f.id AND c.anno_al IS NULL) AS carica_attuale
   FROM fratelli f;

create or replace view public.v_fratelli_tesoreria as
 SELECT id,
    cognome,
    nome,
    email,
    cellulare,
    stato
   FROM fratelli
  WHERE ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app]);

create or replace view public.v_incassi_collettivi as
 SELECT v.anno,
    q.codice AS voce_codice,
    q.nome AS voce,
    count(*) AS n_versamenti,
    sum(v.importo) AS totale
   FROM versamenti v
     JOIN voci_quota q ON q.id = v.voce_id
  WHERE NOT q.personale AND (ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app, 'tesoriere'::ruolo_app]))
  GROUP BY v.anno, q.codice, q.nome;

create or replace view public.v_riepilogo_fratello as
 SELECT anno,
    fratello_id,
    fratello,
    sum(importo_dovuto) AS dovuto,
    sum(versato) AS versato,
    sum(residuo) AS residuo,
    count(*) FILTER (WHERE stato = 'Scaduto'::text) AS scadenze_scadute
   FROM v_scadenze_stato
  GROUP BY anno, fratello_id, fratello;

create or replace view public.v_scadenze_stato as
 SELECT s.id,
    s.anno,
    s.rata_n,
    s.rate_totali,
    s.fratello_id,
    (f.cognome || ' '::text) || f.nome AS fratello,
    q.codice AS voce_codice,
    q.nome AS voce,
    s.eta_calcolata,
    s.importo_base,
    s.sconto,
    s.importo_dovuto,
    s.data_scadenza,
    COALESCE(p.versato, 0::numeric)::numeric(10,2) AS versato,
    (s.importo_dovuto - COALESCE(p.versato, 0::numeric))::numeric(10,2) AS residuo,
        CASE
            WHEN s.importo_dovuto = 0::numeric THEN 'Esente'::text
            WHEN (s.importo_dovuto - COALESCE(p.versato, 0::numeric)) <= 0::numeric THEN 'Pagato'::text
            WHEN s.data_scadenza IS NOT NULL AND s.data_scadenza < CURRENT_DATE THEN 'Scaduto'::text
            WHEN COALESCE(p.versato, 0::numeric) > 0::numeric THEN 'Parziale'::text
            ELSE 'Da pagare'::text
        END AS stato,
    s.motivo_eccezione,
    s.note
   FROM scadenze s
     JOIN voci_quota q ON q.id = s.voce_id
     JOIN fratelli f ON f.id = s.fratello_id
     LEFT JOIN ( SELECT versamenti.scadenza_id,
            sum(versamenti.importo) AS versato
           FROM versamenti
          WHERE versamenti.scadenza_id IS NOT NULL
          GROUP BY versamenti.scadenza_id) p ON p.scadenza_id = s.id
  WHERE ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app, 'tesoriere'::ruolo_app]);

create or replace view public.v_versamenti_elenco as
 SELECT v.id,
    v.data_versamento,
    v.anno,
    q.codice AS voce_codice,
    q.nome AS voce,
    v.fratello_id,
        CASE
            WHEN f.id IS NULL THEN NULL::text
            ELSE (f.cognome || ' '::text) || f.nome
        END AS fratello,
    v.importo,
    v.modalita,
    v.riferimento,
    v.scadenza_id,
    v.scadenza_id IS NULL AND q.personale AS non_collegato,
    v.movimento_id,
    v.note
   FROM versamenti v
     JOIN voci_quota q ON q.id = v.voce_id
     LEFT JOIN fratelli f ON f.id = v.fratello_id
  WHERE ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app, 'tesoriere'::ruolo_app]);

CREATE OR REPLACE FUNCTION public._ripristino_confronta(p_esec bigint, p_tabella text, p_campioni boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pk text[]; v_ele int; v_mod int; v_nuo int; v_inv int; v_ce jsonb := '[]'; v_cm jsonb := '[]';
begin
  v_pk := public._ripristino_prepara(p_esec, p_tabella);
  select count(*) into v_ele from _rk_bk b where not exists (select 1 from _rk_cur c where c.chiave = b.chiave);
  select count(*) into v_mod from _rk_bk b join _rk_cur c on c.chiave = b.chiave where b.hash <> c.hash;
  select count(*) into v_nuo from _rk_cur c where not exists (select 1 from _rk_bk b where b.chiave = c.chiave);
  select count(*) into v_inv from _rk_bk b join _rk_cur c on c.chiave = b.chiave where b.hash = c.hash;
  if p_campioni then
    select coalesce(jsonb_agg(x.dati), '[]') into v_ce
    from (select b.dati from _rk_bk b where not exists (select 1 from _rk_cur c where c.chiave = b.chiave) limit 5) x;
    select coalesce(jsonb_agg(jsonb_build_object('prima', x.bd, 'ora', x.cd)), '[]') into v_cm
    from (select b.dati as bd, c.dati as cd from _rk_bk b join _rk_cur c on c.chiave = b.chiave where b.hash <> c.hash limit 5) x;
  end if;
  return jsonb_build_object('eliminate', v_ele, 'modificate', v_mod, 'nuove', v_nuo, 'invariate', v_inv,
                            'con_chiave', cardinality(v_pk) > 0, 'esempi_eliminate', v_ce, 'esempi_modificate', v_cm);
end;
$function$
;

CREATE OR REPLACE FUNCTION public._ripristino_prepara(p_esec bigint, p_tabella text)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pk text[]; v_nonpk text[];
begin
  perform public._tabella_ok(p_tabella);
  select coalesce(array_agg(a.attname::text order by a.attnum), '{}') into v_pk
  from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
  where i.indrelid = ('public.' || quote_ident(p_tabella))::regclass and i.indisprimary;
  select coalesce(array_agg(a.attname::text order by a.attnum), '{}') into v_nonpk
  from pg_attribute a
  where a.attrelid = ('public.' || quote_ident(p_tabella))::regclass and a.attnum > 0 and not a.attisdropped
    and not (a.attname::text = any (v_pk));
  if cardinality(v_pk) = 0 then v_nonpk := '{}'; end if;     -- senza chiave primaria la chiave è la riga intera

  drop table if exists _rk_cur;
  drop table if exists _rk_bk;
  execute format('create temp table _rk_cur on commit drop as select (to_jsonb(x) - %L::text[]) as chiave, md5(to_jsonb(x)::text) as hash, to_jsonb(x) as dati from public.%I x', v_nonpk, p_tabella);
  create temp table _rk_bk on commit drop as
    select (s.dati - v_nonpk) as chiave, s.hash, s.dati from public._ripristino_stato(p_esec, p_tabella) s;
  return v_pk;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._ripristino_stato(p_esec bigint, p_tabella text)
 RETURNS TABLE(hash text, dati jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with run as (
    select id, case when tipo = 'completo' then id else base_id end as base
    from public.backup_esecuzioni where id = p_esec and esito = 'riuscito'
  ),
  catena as (
    select e.id from public.backup_esecuzioni e, run
    where e.esito = 'riuscito' and (e.id = run.base or e.base_id = run.base) and e.id <= run.id
  ),
  stato as (
    select r.hash from public.backup_righe r join catena c on c.id = r.esecuzione_id
    where r.tabella = p_tabella
    group by r.hash
    having sum(case when r.eliminata then -1 else 1 end) > 0
  )
  select s.hash,
         (select r2.dati from public.backup_righe r2 join catena c2 on c2.id = r2.esecuzione_id
          where r2.tabella = p_tabella and r2.hash = s.hash and not r2.eliminata
          order by r2.id limit 1)
  from stato s;
$function$
;

CREATE OR REPLACE FUNCTION public._tabella_ok(p_tabella text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_tabella is null or p_tabella !~ '^[a-z_][a-z0-9_]*$' or p_tabella like 'backup\_%' or p_tabella = 'registro_attivita'
     or not exists (select 1 from pg_tables where schemaname = 'public' and tablename = p_tabella) then
    raise exception 'Tabella non valida: %', p_tabella;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.anteprima_ripristino(p_esec bigint, p_tabella text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  t record; r jsonb := '{}'::jsonb;
begin
  if not public.lemmi_e_admin() then raise exception 'Solo l''amministratore'; end if;
  if not exists (select 1 from public.backup_esecuzioni where id = p_esec and esito = 'riuscito') then
    raise exception 'Backup non trovato';
  end if;
  if p_tabella is not null then
    return public._ripristino_confronta(p_esec, p_tabella, true);
  end if;
  for t in select tablename from pg_tables
           where schemaname = 'public' and tablename not like 'backup\_%' and tablename <> 'registro_attivita'
           order by tablename loop
    r := r || jsonb_build_object(t.tablename, public._ripristino_confronta(p_esec, t.tablename, false));
  end loop;
  return r;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.approva_messaggio(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not coalesce(ruolo_corrente() in ('amministratore', 'venerabile'), false) then
    raise exception 'Operazione non consentita per il tuo ruolo';
  end if;
  update messaggi
     set stato = 'approvato', approvato_da = auth.uid(), approvato_il = now()
   where id = p_id and stato = 'in_approvazione';
  if not found then
    raise exception 'Il messaggio non è in attesa di approvazione';
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.collega_utente_fratello(p_user uuid, p_fratello text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t text;
begin
  if not public.lemmi_ruolo_in('amministratore') then raise exception 'Operazione riservata all''amministratore'; end if;
  select format_type(a.atttypid, a.atttypmod) into t
    from pg_attribute a where a.attrelid = 'public.profili'::regclass and a.attname = 'fratello_id' and not a.attisdropped;
  execute format('update public.profili set fratello_id = nullif(%L, '''')::%s where user_id = %L::uuid', coalesce(p_fratello, ''), t, p_user);
end $function$
;

CREATE OR REPLACE FUNCTION public.controlla_versamento()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v public.voci_quota%rowtype;
  s public.scadenze%rowtype;
begin
  select * into v from public.voci_quota where id = new.voce_id;
  if v.personale and new.fratello_id is null then
    raise exception 'La voce "%" è personale: indica il Fratello.', v.nome;
  end if;
  if not v.personale and new.fratello_id is not null then
    raise exception 'La voce "%" è collettiva: non va collegata a un Fratello.', v.nome;
  end if;
  if new.scadenza_id is not null then
    select * into s from public.scadenze where id = new.scadenza_id;
    if s.voce_id <> new.voce_id or s.fratello_id <> new.fratello_id or s.anno <> new.anno then
      raise exception 'Il versamento non corrisponde alla scadenza scelta (voce, Fratello o anno diversi).';
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.crea_scadenza_singola(p_voce_codice text, p_fratello uuid, p_anno integer, p_importo numeric DEFAULT NULL::numeric, p_data_scadenza date DEFAULT NULL::date, p_motivo_eccezione text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.voci_quota%rowtype;
  grado text;
  imp numeric(10,2);
  nuovo uuid;
  nascita date;
  eta integer;
  sconto_aut numeric(10,2) := 0;
  motivo_aut text := null;
begin
  if coalesce(public.ruolo_corrente()::text, '') not in ('amministratore', 'tesoriere') then
    raise exception 'Operazione riservata ad amministratore e Tesoriere.';
  end if;
  select * into v from public.voci_quota where codice = upper(p_voce_codice) and attiva;
  if not found then raise exception 'Voce "%" non trovata o non attiva.', p_voce_codice; end if;
  if not v.personale then
    raise exception 'La voce "%" è collettiva: i suoi incassi si registrano senza Fratello.', v.nome;
  end if;
  if v.tipo_importo = 'per_eta' then
    raise exception 'Per la voce "%" usa crea_scadenze_capitazione.', v.nome;
  end if;
  if v.gradi_applicabili is not null then
    select grado_attuale::text into grado from public.v_fratelli_completi where id = p_fratello;
    if grado is null or not exists (select 1 from unnest(v.gradi_applicabili) g where lower(g) = lower(grado)) then
      raise exception 'La voce "%" si applica solo ai gradi: %. Grado attuale del Fratello: %.',
        v.nome, array_to_string(v.gradi_applicabili, ', '), coalesce(grado, 'non indicato');
    end if;
  end if;
  imp := coalesce(p_importo, v.importo_fisso);
  if imp is null then raise exception 'Importo obbligatorio per la voce "%".', v.nome; end if;
  if v.importo_fisso is not null and imp <> v.importo_fisso and coalesce(trim(p_motivo_eccezione), '') = '' then
    raise exception 'L''importo è diverso da quello previsto (% €): indica il motivo dell''eccezione.', v.importo_fisso;
  end if;

  -- esenzione per età
  if v.esenzione_eta_sotto is not null then
    select data_nascita into nascita from public.fratelli where id = p_fratello;
    if nascita is not null then
      eta := extract(year from age(current_date, nascita))::integer;
      if eta < v.esenzione_eta_sotto then
        if v.esenzione_importo is null then
          sconto_aut := imp;
          motivo_aut := format('Esente: meno di %s anni', v.esenzione_eta_sotto);
        else
          sconto_aut := least(v.esenzione_importo, imp);
          motivo_aut := format('Quota esentata (%s €): meno di %s anni', v.esenzione_importo, v.esenzione_eta_sotto);
        end if;
      end if;
    end if;
  end if;

  insert into public.scadenze (voce_id, fratello_id, anno, importo_base, sconto, data_scadenza, motivo_eccezione, note)
  values (v.id, p_fratello, p_anno, imp, sconto_aut, p_data_scadenza,
          nullif(concat_ws(' · ', nullif(trim(p_motivo_eccezione), ''), motivo_aut), ''), p_note)
  returning id into nuovo;
  return nuovo;
end $function$
;

CREATE OR REPLACE FUNCTION public.crea_scadenze_capitazione(p_anno integer, p_modalita text DEFAULT 'unica'::text, p_stati text[] DEFAULT ARRAY['attivo'::text])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_voce public.voci_quota%rowtype;
  par public.parametri_quote%rowtype;
  rif date;
  r record;
  rt record;
  n_rate integer;
  somma numeric(10,2);
  eta integer;
  totale numeric(10,2);
  imp numeric(10,2);
  idx integer;
  nrow integer;
  creati integer := 0;
  senza_data integer := 0;
  senza_fascia integer := 0;
  altro_piano integer := 0;
begin
  if coalesce(public.ruolo_corrente()::text, '') not in ('amministratore', 'tesoriere') then
    raise exception 'Operazione riservata ad amministratore e Tesoriere.';
  end if;
  select * into v_voce from public.voci_quota where codice = 'CAPITAZIONE';
  if not found then raise exception 'Voce CAPITAZIONE non trovata.'; end if;
  select * into par from public.parametri_quote where id;
  select count(*), coalesce(sum(percentuale), 0) into n_rate, somma
    from public.piano_rate where voce_id = v_voce.id and modalita = p_modalita;
  if n_rate = 0 then raise exception 'Nessun piano rate "%" per la capitazione.', p_modalita; end if;
  if somma <> 100 then
    raise exception 'Le percentuali del piano "%" sommano % invece di 100.', p_modalita, somma;
  end if;
  rif := make_date(p_anno, par.eta_mese, par.eta_giorno);

  for r in
    select f.id, f.data_nascita from public.fratelli f
    where lower(f.stato::text) = any (select lower(x) from unnest(p_stati) as x)
  loop
    if r.data_nascita is null then senza_data := senza_data + 1; continue; end if;
    if exists (select 1 from public.scadenze s
               where s.voce_id = v_voce.id and s.fratello_id = r.id and s.anno = p_anno and s.rate_totali <> n_rate) then
      altro_piano := altro_piano + 1; continue;
    end if;
    eta := extract(year from age(rif, r.data_nascita))::integer;
    select importo into totale from public.fasce_eta where eta_da <= eta order by eta_da desc limit 1;
    if totale is null then senza_fascia := senza_fascia + 1; continue; end if;
    somma := 0; idx := 0;
    for rt in select * from public.piano_rate where voce_id = v_voce.id and modalita = p_modalita order by rata_n loop
      idx := idx + 1;
      if idx = n_rate then imp := totale - somma;
      else imp := round(totale * rt.percentuale / 100, 2); somma := somma + imp;
      end if;
      insert into public.scadenze (voce_id, fratello_id, anno, rata_n, rate_totali, eta_calcolata, importo_base, data_scadenza)
      values (v_voce.id, r.id, p_anno, rt.rata_n, n_rate, eta, imp, make_date(p_anno, rt.mese, rt.giorno))
      on conflict (voce_id, fratello_id, anno, rata_n) do nothing;
      get diagnostics nrow = row_count;
      creati := creati + nrow;
    end loop;
  end loop;

  return jsonb_build_object('scadenze_create', creati, 'senza_data_nascita', senza_data,
                            'senza_fascia', senza_fascia, 'con_altro_piano_rate', altro_piano);
end $function$
;

CREATE OR REPLACE FUNCTION public.esegui_backup(p_tipo text DEFAULT 'auto'::text, p_origine text DEFAULT 'manuale'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tipo text := p_tipo;
  v_base bigint;
  v_base_data timestamptz;
  v_id bigint;
  v_nuove bigint := 0;
  v_elim bigint := 0;
  v_tab int := 0;
  t record;
begin
  if auth.uid() is not null and not public.lemmi_e_admin() then
    raise exception 'Solo l''amministratore può eseguire il backup';
  end if;
  if p_tipo not in ('auto', 'completo', 'incrementale') then
    raise exception 'Tipo di backup non valido: %', p_tipo;
  end if;
  if not pg_try_advisory_xact_lock(7426001) then
    raise exception 'Un altro backup è già in corso';
  end if;

  select id, avviato_il into v_base, v_base_data
  from public.backup_esecuzioni
  where tipo = 'completo' and esito = 'riuscito'
  order by avviato_il desc, id desc limit 1;

  if v_tipo = 'auto' then
    v_tipo := case when v_base is null or v_base_data <= now() - interval '6 days' then 'completo' else 'incrementale' end;
  elsif v_tipo = 'incrementale' and v_base is null then
    v_tipo := 'completo';
  end if;

  begin
    insert into public.backup_esecuzioni (tipo, origine, base_id)
    values (v_tipo, case when p_origine = 'automatico' then 'automatico' else 'manuale' end,
            case when v_tipo = 'incrementale' then v_base end)
    returning id into v_id;

    -- fotografia dello stato attuale di tutte le tabelle dell'app
    drop table if exists _cur;
    drop table if exists _stato;
    create temp table _cur (tabella text, hash text, dati jsonb) on commit drop;
    for t in select tablename from pg_tables
             where schemaname = 'public' and tablename not like 'backup\_%' and tablename <> 'registro_attivita'
             order by tablename loop
      execute format(
        'insert into _cur select distinct on (h) %L, h, j from (select to_jsonb(x) as j, md5(to_jsonb(x)::text) as h from public.%I x) s',
        t.tablename, t.tablename);
      v_tab := v_tab + 1;
    end loop;

    if v_tipo = 'completo' then
      insert into public.backup_righe (esecuzione_id, tabella, hash, dati)
      select v_id, tabella, hash, dati from _cur;
      get diagnostics v_nuove = row_count;
    else
      -- stato dell'ultimo completo + incrementali successivi
      create temp table _stato on commit drop as
        select r.tabella, r.hash
        from public.backup_righe r
        join public.backup_esecuzioni e on e.id = r.esecuzione_id
        where e.esito = 'riuscito' and (e.id = v_base or e.base_id = v_base)
        group by r.tabella, r.hash
        having sum(case when r.eliminata then -1 else 1 end) > 0;

      insert into public.backup_righe (esecuzione_id, tabella, hash, dati)
      select v_id, c.tabella, c.hash, c.dati from _cur c
      where not exists (select 1 from _stato s where s.tabella = c.tabella and s.hash = c.hash);
      get diagnostics v_nuove = row_count;

      insert into public.backup_righe (esecuzione_id, tabella, hash, dati, eliminata)
      select v_id, s.tabella, s.hash, null, true from _stato s
      where not exists (select 1 from _cur c where c.tabella = s.tabella and c.hash = s.hash);
      get diagnostics v_elim = row_count;
    end if;

    update public.backup_esecuzioni set
      esito = 'riuscito', concluso_il = now(), tabelle = v_tab,
      righe_nuove = v_nuove, righe_eliminate = v_elim,
      byte = coalesce((select sum(pg_column_size(r.dati) + 60) from public.backup_righe r where r.esecuzione_id = v_id), 0)
    where id = v_id;

    -- si conservano gli ultimi 5 backup completi (circa 5 settimane) con i loro incrementali
    delete from public.backup_esecuzioni
    where id in (select id from public.backup_esecuzioni where tipo = 'completo' and esito = 'riuscito' order by avviato_il desc, id desc offset 5)
       or base_id in (select id from public.backup_esecuzioni where tipo = 'completo' and esito = 'riuscito' order by avviato_il desc, id desc offset 5)
       or (esito = 'fallito' and avviato_il < now() - interval '60 days');

    perform public.pulisci_registro();
    return jsonb_build_object('id', v_id, 'tipo', v_tipo, 'esito', 'riuscito', 'nuove', v_nuove, 'eliminate', v_elim);
  exception when others then
    -- l'errore annulla le scritture di questo blocco: si registra solo l'esito negativo
    insert into public.backup_esecuzioni (tipo, origine, esito, concluso_il, nota, base_id)
    values (case when v_tipo = 'incrementale' then 'incrementale' else 'completo' end,
            case when p_origine = 'automatico' then 'automatico' else 'manuale' end,
            'fallito', now(), left(sqlerrm, 500), case when v_tipo = 'incrementale' then v_base end);
    return jsonb_build_object('esito', 'fallito', 'nota', left(sqlerrm, 500));
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.genera_calendario(p_anno integer, p_ora_ordinaria time without time zone DEFAULT NULL::time without time zone, p_ora_informale time without time zone DEFAULT NULL::time without time zone, p_estate_dal date DEFAULT NULL::date, p_estate_al date DEFAULT NULL::date, p_inverno_dal date DEFAULT NULL::date, p_inverno_al_gen date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  v_estate_dal  date := coalesce(p_estate_dal,     make_date(p_anno, 6, 24));
  v_estate_al   date := coalesce(p_estate_al,      make_date(p_anno, 9, 20));
  v_inv_dal     date := coalesce(p_inverno_dal,    make_date(p_anno, 12, 21));
  v_inv_al_gen  date := coalesce(p_inverno_al_gen, make_date(p_anno, 1, 7));
  d             date;
  n             int;
  inseriti      int := 0;
  righe         int;
begin
  for d in
    select g::date
    from generate_series(make_date(p_anno,1,1), make_date(p_anno,12,31), interval '1 day') g
  loop
    -- salta i giorni di sospensione
    if d between v_estate_dal and v_estate_al then continue; end if;
    if d >= v_inv_dal then continue; end if;
    if d <= v_inv_al_gen then continue; end if;

    n := ((extract(day from d)::int - 1) / 7) + 1;   -- n-esimo giorno della settimana nel mese

    if extract(isodow from d) = 3 and n in (1,3) then
      insert into public.tornate (data, ora, tipo, link_online)
      values (d, p_ora_ordinaria, 'ordinaria', null)
      on conflict (data, tipo) do nothing;
      get diagnostics righe = row_count;
      inseriti := inseriti + righe;

    elsif extract(isodow from d) = 1 and n in (2,4) then
      insert into public.tornate (data, ora, tipo)
      values (d, p_ora_informale, 'informale')
      on conflict (data, tipo) do nothing;
      get diagnostics righe = row_count;
      inseriti := inseriti + righe;
    end if;
  end loop;

  return inseriti;   -- numero di tornate create (quelle già presenti non si duplicano)
end $function$
;

CREATE OR REPLACE FUNCTION public.genera_destinatari(p_messaggio_id uuid, p_gruppo text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n int;
begin
  if not puo_modificare_messaggio(p_messaggio_id) then
    raise exception 'Operazione non consentita o messaggio non più modificabile';
  end if;
  if p_gruppo not in ('tutti_attivi', 'apprendisti', 'compagni', 'maestri') then
    raise exception 'Gruppo non valido: usa tutti_attivi, apprendisti, compagni o maestri';
  end if;
  insert into messaggi_destinatari (messaggio_id, fratello_id, email)
  select p_messaggio_id, f.id, f.email
  from fratelli f
  where f.stato = 'attivo'
    and coalesce(trim(f.email), '') <> ''
    and (p_gruppo = 'tutti_attivi'
         or (select p.grado::text from passaggi_grado p
              where p.fratello_id = f.id
              order by p.grado desc limit 1)
            = case p_gruppo when 'apprendisti' then 'apprendista'
                            when 'compagni'    then 'compagno'
                            when 'maestri'     then 'maestro' end)
  on conflict (messaggio_id, fratello_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.importa_movimenti(p_nome_file text, p_righe jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_imp uuid;
  tot integer;
  nuove integer;
  dal date;
  al date;
begin
  if coalesce(public.ruolo_corrente()::text, '') not in ('amministratore', 'tesoriere') then
    raise exception 'Operazione riservata ad amministratore e Tesoriere.';
  end if;
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'Nessuna riga da importare.';
  end if;
  tot := jsonb_array_length(p_righe);
  if tot > 5000 then raise exception 'Troppe righe in un solo import (massimo 5000).'; end if;

  select min((x ->> 'data_operazione')::date), max((x ->> 'data_operazione')::date)
    into dal, al from jsonb_array_elements(p_righe) as x;

  insert into public.import_estratti (nome_file, periodo_dal, periodo_al, righe_totali)
  values (coalesce(nullif(trim(p_nome_file), ''), 'estratto'), dal, al, tot)
  returning id into v_imp;

  with ins as (
    insert into public.conto_movimenti
      (import_id, data_operazione, data_valuta, descrizione, importo, saldo, riferimento_banca,
       impronta, categoria_id, stato_riconciliazione, origine)
    select v_imp,
           (x ->> 'data_operazione')::date,
           nullif(x ->> 'data_valuta', '')::date,
           x ->> 'descrizione',
           (x ->> 'importo')::numeric,
           nullif(x ->> 'saldo', '')::numeric,
           nullif(x ->> 'riferimento_banca', ''),
           x ->> 'impronta',
           nullif(x ->> 'categoria_id', '')::uuid,
           case when nullif(x ->> 'categoria_id', '') is null then 'da_riconciliare' else 'riconciliato' end, 'banca'
    from jsonb_array_elements(p_righe) as x
    on conflict (impronta) do nothing
    returning 1
  )
  select count(*) into nuove from ins;

  update public.import_estratti set righe_nuove = nuove where id = v_imp;
  return jsonb_build_object('import_id', v_imp, 'righe_totali', tot, 'righe_nuove', nuove,
                            'righe_gia_presenti', tot - nuove);
end $function$
;

CREATE OR REPLACE FUNCTION public.imposta_aggiornato_il()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.aggiornato_il := now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.imposta_ruolo_utente(p_user uuid, p_ruolo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_righe int;
begin
  if not public.lemmi_e_admin() then
    raise exception 'Solo l''amministratore può cambiare i profili';
  end if;
  if p_ruolo not in ('amministratore', 'venerabile', 'segretario', 'tesoriere') then
    raise exception 'Profilo non valido: %', p_ruolo;
  end if;
  if p_user = auth.uid() then
    raise exception 'Il tuo profilo non si cambia da qui (per non restare senza amministratore)';
  end if;
  -- il valore è passato come letterale, così funziona sia con colonna testo sia con enum
  execute format('update public.profili set ruolo = %L where user_id = $1', p_ruolo) using p_user;
  get diagnostics v_righe = row_count;
  if v_righe = 0 then
    raise exception 'Utente non trovato tra i profili';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.info_spazio()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v jsonb;
  v_file jsonb := '[]'::jsonb;
begin
  if not public.lemmi_e_admin() then
    raise exception 'Solo l''amministratore';
  end if;

  begin
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'byte', s, 'file', n) order by s desc), '[]'::jsonb)
      from (select bucket_id, coalesce(sum((metadata->>'size')::bigint), 0) as s, count(*) as n
            from storage.objects group by bucket_id) y
    $q$ into v_file;
  exception when others then
    v_file := '[]'::jsonb;
  end;

  select jsonb_build_object(
    'db_totale', pg_database_size(current_database()),
    'dati', coalesce((select sum(pg_total_relation_size(c.oid)) from pg_class c
                      join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'public' and c.relkind = 'r' and c.relname not like 'backup\_%'), 0),
    'backup', coalesce((select sum(pg_total_relation_size(c.oid)) from pg_class c
                        join pg_namespace n on n.oid = c.relnamespace
                        where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'backup\_%'), 0),
    'tabelle', (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'byte', b, 'righe', r) order by b desc), '[]'::jsonb)
                from (select c.relname as nome, pg_total_relation_size(c.oid) as b,
                             coalesce((select n_live_tup from pg_stat_user_tables u where u.relid = c.oid), 0) as r
                      from pg_class c join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'public' and c.relkind = 'r'
                      order by 2 desc limit 8) z),
    'file', v_file
  ) into v;
  return v;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.info_utenti_sistema()
 RETURNS TABLE(user_id text, email text, nome text, cognome text, grado text, ruolo text, nome_visualizzato text, fratello_id text, collegamento text, ultimo_accesso timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select p.user_id::text, u.email::text, f.nome::text, f.cognome::text, v.grado_attuale::text, p.ruolo::text,
         p.nome_visualizzato::text, f.id::text,
         case when p.fratello_id is not null then 'manuale' when f.id is not null then 'e-mail' else null end,
         u.last_sign_in_at
    from public.profili p
    join auth.users u on u.id = p.user_id
    left join public.fratelli f on f.id = coalesce(p.fratello_id,
         (select f2.id from public.fratelli f2 where u.email is not null and lower(f2.email) = lower(u.email) limit 1))
    left join public.v_fratelli_completi v on v.id = f.id
   where public.lemmi_ruolo_in('amministratore')
   order by case p.ruolo::text when 'amministratore' then 0 when 'venerabile' then 1 when 'segretario' then 2 when 'tesoriere' then 3 else 4 end,
            f.cognome, f.nome;
$function$
;

CREATE OR REPLACE FUNCTION public.lemmi_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_old jsonb; v_new jsonb; v_prima jsonb; v_dopo jsonb; v_id text; v_email text; v_op text;
begin
  begin
    if TG_OP = 'INSERT' then
      v_new := to_jsonb(NEW); v_dopo := v_new; v_op := 'inserimento';
      v_id := coalesce(v_new->>'id', v_new->>'user_id');
    elsif TG_OP = 'DELETE' then
      v_old := to_jsonb(OLD); v_prima := v_old; v_op := 'eliminazione';
      v_id := coalesce(v_old->>'id', v_old->>'user_id');
    else
      v_old := to_jsonb(OLD); v_new := to_jsonb(NEW); v_op := 'modifica';
      select jsonb_object_agg(e.key, e.value), jsonb_object_agg(e.key, v_old->e.key)
        into v_dopo, v_prima
      from jsonb_each(v_new) e
      where v_old->e.key is distinct from e.value;
      v_id := coalesce(v_new->>'id', v_new->>'user_id');
    end if;
    if v_op = 'modifica' and v_dopo is null then
      return NEW;                                   -- nessun campo cambiato
    end if;
    begin
      select u.email into v_email from auth.users u where u.id = auth.uid();
    exception when others then
      v_email := null;
    end;
    insert into public.registro_attivita (utente_id, utente_email, tabella, operazione, riga_id, prima, dopo)
    values (auth.uid(), v_email, TG_TABLE_NAME, v_op, v_id, v_prima, v_dopo);
  exception when others then
    null;                                           -- il registro non deve mai bloccare il lavoro
  end;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.lemmi_e_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.profili p
    where p.user_id = auth.uid() and p.ruolo::text = 'amministratore'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.lemmi_ruolo_in(VARIADIC r text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.profili p where p.user_id = auth.uid() and p.ruolo::text = any (r));
$function$
;

CREATE OR REPLACE FUNCTION public.pulisci_registro()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  delete from public.registro_attivita where quando < now() - interval '24 months';
$function$
;

CREATE OR REPLACE FUNCTION public.puo_modificare_messaggio(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from messaggi m
    where m.id = p_id
      and (ruolo_corrente() = 'amministratore'
           or (m.stato in ('bozza', 'in_approvazione')
               and (ruolo_corrente() = 'segretario'
                    or (ruolo_corrente() = 'tesoriere' and m.categoria = 'sollecito'))))
  )
$function$
;

CREATE OR REPLACE FUNCTION public.puo_vedere_messaggio(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from messaggi m
    where m.id = p_id
      and (ruolo_corrente() in ('amministratore', 'venerabile', 'segretario')
           or (ruolo_corrente() = 'tesoriere' and m.categoria = 'sollecito'))
  )
$function$
;

CREATE OR REPLACE FUNCTION public.registra_modifica()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_prima jsonb;
  v_dopo  jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_prima := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_dopo  := to_jsonb(new); end if;
  insert into cronologia_modifiche (utente, tabella, operazione, riga_id, prima, dopo)
  values (auth.uid(), tg_table_name, tg_op,
          coalesce(v_dopo ->> 'id', v_prima ->> 'id'), v_prima, v_dopo);
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.riconcilia_con_versamento(p_movimento uuid, p_voce uuid, p_fratello uuid, p_anno integer, p_scadenza uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m public.conto_movimenti%rowtype;
  nuovo uuid;
begin
  if coalesce(public.ruolo_corrente()::text, '') not in ('amministratore', 'tesoriere') then
    raise exception 'Operazione riservata ad amministratore e Tesoriere.';
  end if;
  select * into m from public.conto_movimenti where id = p_movimento for update;
  if not found then raise exception 'Movimento non trovato.'; end if;
  if m.importo <= 0 then raise exception 'Solo le entrate si collegano a un versamento.'; end if;
  if m.stato_riconciliazione = 'riconciliato' then raise exception 'Il movimento è già riconciliato.'; end if;

  insert into public.versamenti
    (data_versamento, voce_id, fratello_id, anno, importo, scadenza_id, modalita, riferimento, movimento_id, note)
  values (m.data_operazione, p_voce, p_fratello, p_anno, m.importo, p_scadenza, 'bonifico', m.riferimento_banca, m.id, p_note)
  returning id into nuovo;

  update public.conto_movimenti
     set stato_riconciliazione = 'riconciliato',
         fratello_id = p_fratello,
         categoria_id = coalesce(categoria_id, (select id from public.categorie_movimento where nome = 'Versamenti dei Fratelli'))
   where id = m.id;
  return nuovo;
end $function$
;

CREATE OR REPLACE FUNCTION public.ripristina_tabella(p_esec bigint, p_tabella text, p_modo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pk text[]; v_cols text; v_set text; v_sel text; v_nonpk text[]; v_n int := 0; v_sic jsonb; v_arr jsonb;
begin
  if not public.lemmi_e_admin() then raise exception 'Solo l''amministratore'; end if;
  if p_modo not in ('eliminate', 'modificate') then raise exception 'Modo non valido'; end if;
  if not exists (select 1 from public.backup_esecuzioni where id = p_esec and esito = 'riuscito') then
    raise exception 'Backup non trovato';
  end if;

  -- 1) si legge ora il backup scelto (prima che il backup di sicurezza possa far ruotare quelli vecchi)
  v_pk := public._ripristino_prepara(p_esec, p_tabella);

  -- 2) backup di sicurezza dello stato attuale (incrementale: non fa ruotare i backup, quindi non può cancellare quello in uso)
  v_sic := public.esegui_backup('incrementale', 'manuale');
  if coalesce(v_sic->>'esito', '') <> 'riuscito' then
    raise exception 'Backup di sicurezza non riuscito (%): ripristino annullato', coalesce(v_sic->>'nota', 'errore');
  end if;

  -- colonne scrivibili (non generate)
  select string_agg(quote_ident(a.attname::text), ',' order by a.attnum),
         array_agg(a.attname::text order by a.attnum) filter (where not (a.attname::text = any (v_pk)))
    into v_cols, v_nonpk
  from pg_attribute a
  where a.attrelid = ('public.' || quote_ident(p_tabella))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';

  if p_modo = 'eliminate' then
    select jsonb_agg(b.dati) into v_arr
    from _rk_bk b where not exists (select 1 from _rk_cur c where c.chiave = b.chiave);
    if v_arr is not null then
      execute format('insert into public.%1$I (%2$s) overriding system value select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) on conflict do nothing',
                     p_tabella, v_cols) using v_arr;
      get diagnostics v_n = row_count;
    end if;
  else
    if cardinality(v_pk) = 0 or v_nonpk is null or cardinality(v_nonpk) = 0 then
      raise exception 'Questa tabella non ha una chiave: si possono solo recuperare le righe eliminate';
    end if;
    select string_agg(quote_ident(x), ',') into v_set from unnest(v_nonpk) x;
    select string_agg('r.' || quote_ident(x), ',') into v_sel from unnest(v_nonpk) x;
    select jsonb_agg(b.dati) into v_arr
    from _rk_bk b join _rk_cur c on c.chiave = b.chiave where b.hash <> c.hash;
    if v_arr is not null then
      execute format(
        'update public.%1$I t set (%2$s) = (select %3$s from jsonb_populate_record(null::public.%1$I, b.dati) r) '
        'from (select d as dati, (d - %4$L::text[]) as chiave from jsonb_array_elements($1) d) b '
        'where (to_jsonb(t) - %4$L::text[]) = b.chiave',
        p_tabella, v_set, v_sel, v_nonpk) using v_arr;
      get diagnostics v_n = row_count;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'tabella', p_tabella, 'modo', p_modo, 'righe', v_n, 'backup_sicurezza', v_sic->'id');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ruolo_corrente()
 RETURNS ruolo_app
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select ruolo from profili where user_id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.segna_inviato(p_id uuid, p_canale text DEFAULT 'manuale'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m messaggi%rowtype;
begin
  select * into m from messaggi where id = p_id;
  if not found then
    raise exception 'Messaggio non trovato';
  end if;
  if not coalesce(ruolo_corrente() in ('amministratore', 'segretario')
                  or (ruolo_corrente() = 'tesoriere' and m.categoria = 'sollecito'), false) then
    raise exception 'Operazione non consentita per il tuo ruolo';
  end if;
  if m.stato = 'inviato' then
    raise exception 'Il messaggio risulta già inviato';
  end if;
  if m.categoria <> 'sollecito' and m.stato <> 'approvato' then
    raise exception 'Il messaggio deve prima essere approvato dal Maestro Venerabile';
  end if;
  if not exists (select 1 from messaggi_destinatari where messaggio_id = p_id) then
    raise exception 'Il messaggio non ha destinatari';
  end if;
  update messaggi
     set stato = 'inviato', inviato_il = now(), canale = p_canale
   where id = p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.stato_backup()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pian text;
begin
  if not public.lemmi_e_admin() then
    raise exception 'Solo l''amministratore';
  end if;
  begin
    select schedule into v_pian from cron.job where jobname = 'lemmi-backup-giornaliero' and active limit 1;
  exception when others then
    v_pian := null;
  end;
  return jsonb_build_object('pianificazione', v_pian);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tornate_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end $function$
;

CREATE TRIGGER elezioni_updated_at BEFORE UPDATE ON public.elezioni FOR EACH ROW EXECUTE FUNCTION tornate_set_updated_at();

CREATE TRIGGER lavori_updated_at BEFORE UPDATE ON public.lavori FOR EACH ROW EXECUTE FUNCTION tornate_set_updated_at();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.pratiche_date FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.fratelli FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.passaggi_grado FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.cariche_storico FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.modelli_messaggio FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.messaggi FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.messaggi_destinatari FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.bussanti FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.documenti FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.loggia FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.fasce_eta FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.parametri_quote FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.piano_rate FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.scadenze FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.import_estratti FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.versamenti FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.categorie_movimento FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.tornate FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.voci_quota FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.lavori FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.conto_movimenti FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.elezioni FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.eventi_conto FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.conto_saldi FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.modelli_loggia FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.verbali FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.presenze_verbale FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.pratiche FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.pratiche_passi FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.profili FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER lemmi_audit AFTER INSERT OR DELETE OR UPDATE ON public.elenco_cariche FOR EACH ROW EXECUTE FUNCTION lemmi_audit();

CREATE TRIGGER tornate_updated_at BEFORE UPDATE ON public.tornate FOR EACH ROW EXECUTE FUNCTION tornate_set_updated_at();

CREATE TRIGGER trg_bussanti_aggiornato BEFORE UPDATE ON public.bussanti FOR EACH ROW EXECUTE FUNCTION imposta_aggiornato_il();

CREATE TRIGGER trg_bussanti_cronologia AFTER INSERT OR DELETE OR UPDATE ON public.bussanti FOR EACH ROW EXECUTE FUNCTION registra_modifica();

CREATE TRIGGER trg_categorie_movimento_aggiornato BEFORE UPDATE ON public.categorie_movimento FOR EACH ROW EXECUTE FUNCTION imposta_aggiornato_il();

CREATE TRIGGER trg_categorie_movimento_cronologia AFTER INSERT OR DELETE OR UPDATE ON public.categorie_movimento FOR EACH ROW EXECUTE FUNCTION registra_modifica();

CREATE TRIGGER trg_conto_movimenti_aggiornato BEFORE UPDATE ON public.conto_movimenti FOR EACH ROW EXECUTE FUNCTION imposta_aggiornato_il();

CREATE TRIGGER trg_conto_movimenti_cronologia AFTER INSERT OR DELETE OR UPDATE ON public.conto_movimenti FOR EACH ROW EXECUTE FUNCTION registra_modifica();

CREATE TRIGGER trg_documenti_cronologia AFTER INSERT OR DELETE OR UPDATE ON public.documenti FOR EACH ROW EXECUTE FUNCTION registra_modifica();

CREATE TRIGGER trg_fasce_eta_aggiornato BEFORE UPDATE ON public.fasce_eta FOR EACH ROW EXECUTE FUNCTION imposta_aggiornato_il();

CREATE TRIGGER trg_fasce_eta_cronologia AFTER INSERT OR DELETE OR UPDATE ON public.fasce_eta FOR EACH ROW EXECUTE FUNCTION registra_modifica();

CREATE TRIGGER trg_fratelli_aggiornato BEFORE UPDATE ON public.fratelli FOR EACH ROW EXECUTE FUNCTION imposta_aggiornato_il();

CREATE TRIGGER trg_log_cariche AFTER INSERT OR DELETE OR UPDATE ON public.cariche_storico FOR EACH ROW EXECUTE FUNCTION registra_modifica();

CREATE TRIGGER trg_log_destinatari AFTER INSERT OR DELETE OR UPDATE ON public.messaggi_destinatari FOR EACH ROW EXECUTE FUNCTION registra_modifica();

CREATE TRIGGER trg_log_fratelli AFTER INSERT OR DELETE OR UPDATE ON public.fratelli FOR EACH ROW EXECUTE FUNCTION registra_modifica();

CREATE TRIGGER trg_log_messaggi AFTER INSERT OR DELETE OR UPDATE ON public.messaggi FOR EACH ROW EXECUTE FUNCTION registra_modifica();

CREATE TRIGGER trg_log_modelli AFTER INSERT OR DELETE OR UPDATE ON public.modelli_messaggio FOR EACH ROW EXECUTE FUNCTION registra_modifica();

CREATE TRIGGER trg_log_passaggi AFTER INSERT OR DELETE OR UPDATE ON public.passaggi_grado FOR EACH ROW EXECUTE FUNCTION registra_modifica();

CREATE TRIGGER trg_loggia_aggiornato BEFORE UPDATE ON public.loggia FOR EACH ROW EXECUTE FUNCTION imposta_aggiornato_il();

CREATE TRIGGER trg_messaggi_aggiornato BEFORE UPDATE ON public.messaggi FOR EACH ROW EXECUTE FUNCTION imposta_aggiornato_il();

CREATE TRIGGER trg_modelli_aggiornato BEFORE UPDATE ON public.modelli_messaggio FOR EACH ROW EXECUTE FUNCTION imposta_aggiornato_il();

CREATE TRIGGER trg_parametri_quote_aggiornato BEFORE UPDATE ON public.parametri_quote FOR EACH ROW EXECUTE FUNCTION imposta_aggiornato_il();

CREATE TRIGGER trg_scadenze_aggiornato BEFORE UPDATE ON public.scadenze FOR EACH ROW EXECUTE FUNCTION imposta_aggiornato_il();

CREATE TRIGGER trg_scadenze_cronologia AFTER INSERT OR DELETE OR UPDATE ON public.scadenze FOR EACH ROW EXECUTE FUNCTION registra_modifica();

CREATE TRIGGER trg_versamenti_aggiornato BEFORE UPDATE ON public.versamenti FOR EACH ROW EXECUTE FUNCTION imposta_aggiornato_il();

CREATE TRIGGER trg_versamenti_controllo BEFORE INSERT OR UPDATE ON public.versamenti FOR EACH ROW EXECUTE FUNCTION controlla_versamento();

CREATE TRIGGER trg_versamenti_cronologia AFTER INSERT OR DELETE OR UPDATE ON public.versamenti FOR EACH ROW EXECUTE FUNCTION registra_modifica();

CREATE TRIGGER trg_voci_quota_aggiornato BEFORE UPDATE ON public.voci_quota FOR EACH ROW EXECUTE FUNCTION imposta_aggiornato_il();

CREATE TRIGGER trg_voci_quota_cronologia AFTER INSERT OR DELETE OR UPDATE ON public.voci_quota FOR EACH ROW EXECUTE FUNCTION registra_modifica();

create policy backup_esecuzioni_admin on public.backup_esecuzioni as PERMISSIVE for SELECT to authenticated
  using (lemmi_e_admin());

create policy backup_righe_admin on public.backup_righe as PERMISSIVE for SELECT to authenticated
  using (lemmi_e_admin());

create policy bussanti_cancellazione on public.bussanti as PERMISSIVE for DELETE to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy bussanti_inserimento on public.bussanti as PERMISSIVE for INSERT to public
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])));

create policy bussanti_lettura on public.bussanti as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app])));

create policy bussanti_modifica on public.bussanti as PERMISSIVE for UPDATE to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])))
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])));

create policy cariche_storico_cancellazione on public.cariche_storico as PERMISSIVE for DELETE to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy cariche_storico_inserimento on public.cariche_storico as PERMISSIVE for INSERT to public
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])));

create policy cariche_storico_lettura on public.cariche_storico as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app])));

create policy cariche_storico_modifica on public.cariche_storico as PERMISSIVE for UPDATE to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])))
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])));

create policy categorie_movimento_cancellazione on public.categorie_movimento as PERMISSIVE for DELETE to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy categorie_movimento_inserimento on public.categorie_movimento as PERMISSIVE for INSERT to public
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy categorie_movimento_lettura on public.categorie_movimento as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy categorie_movimento_modifica on public.categorie_movimento as PERMISSIVE for UPDATE to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])))
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy conto_movimenti_cancellazione on public.conto_movimenti as PERMISSIVE for DELETE to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy conto_movimenti_inserimento on public.conto_movimenti as PERMISSIVE for INSERT to public
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy conto_movimenti_lettura on public.conto_movimenti as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy conto_movimenti_modifica on public.conto_movimenti as PERMISSIVE for UPDATE to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])))
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy conto_saldi_lettura on public.conto_saldi as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy conto_saldi_scrittura on public.conto_saldi as PERMISSIVE for ALL to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])))
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy cronologia_lettura on public.cronologia_modifiche as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy documenti_cancellazione on public.documenti as PERMISSIVE for DELETE to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy documenti_inserimento on public.documenti as PERMISSIVE for INSERT to public
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])));

create policy documenti_lettura on public.documenti as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app])));

create policy documenti_modifica on public.documenti as PERMISSIVE for UPDATE to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])))
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])));

create policy cariche_elenco_admin on public.elenco_cariche as PERMISSIVE for ALL to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app))
  with check ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy cariche_elenco_lettura on public.elenco_cariche as PERMISSIVE for SELECT to public
  using ((auth.uid() IS NOT NULL));

create policy elezioni_cancellazione on public.elezioni as PERMISSIVE for DELETE to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy elezioni_inserimento on public.elezioni as PERMISSIVE for INSERT to public
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app])));

create policy elezioni_lettura on public.elezioni as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app])));

create policy elezioni_modifica on public.elezioni as PERMISSIVE for UPDATE to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app])))
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app])));

create policy eventi_conto_lettura on public.eventi_conto as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy eventi_conto_scrittura on public.eventi_conto as PERMISSIVE for ALL to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])))
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy fasce_eta_admin on public.fasce_eta as PERMISSIVE for ALL to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app))
  with check ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy fasce_eta_lettura on public.fasce_eta as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy fratelli_cancellazione on public.fratelli as PERMISSIVE for DELETE to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy fratelli_inserimento on public.fratelli as PERMISSIVE for INSERT to public
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])));

create policy fratelli_lettura on public.fratelli as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app])));

create policy fratelli_modifica on public.fratelli as PERMISSIVE for UPDATE to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])))
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])));

create policy fratelli_modifica_ammin_segretario on public.fratelli as PERMISSIVE for UPDATE to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])))
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])));

create policy import_estratti_cancellazione on public.import_estratti as PERMISSIVE for DELETE to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy import_estratti_inserimento on public.import_estratti as PERMISSIVE for INSERT to public
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy import_estratti_lettura on public.import_estratti as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy import_estratti_modifica on public.import_estratti as PERMISSIVE for UPDATE to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])))
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy lavori_cancellazione on public.lavori as PERMISSIVE for DELETE to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])));

create policy lavori_inserimento on public.lavori as PERMISSIVE for INSERT to public
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app])));

create policy lavori_lettura on public.lavori as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app])));

create policy lavori_modifica on public.lavori as PERMISSIVE for UPDATE to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app])))
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app])));

create policy loggia_admin on public.loggia as PERMISSIVE for ALL to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app))
  with check ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy loggia_lettura on public.loggia as PERMISSIVE for SELECT to public
  using ((auth.uid() IS NOT NULL));

create policy messaggi_cancellazione on public.messaggi as PERMISSIVE for DELETE to public
  using (((ruolo_corrente() = 'amministratore'::ruolo_app) OR ((stato = 'bozza'::stato_messaggio) AND ((ruolo_corrente() = 'segretario'::ruolo_app) OR ((ruolo_corrente() = 'tesoriere'::ruolo_app) AND (categoria = 'sollecito'::categoria_messaggio))))));

create policy messaggi_inserimento on public.messaggi as PERMISSIVE for INSERT to public
  with check (((stato = 'bozza'::stato_messaggio) AND ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])) OR ((ruolo_corrente() = 'tesoriere'::ruolo_app) AND (categoria = 'sollecito'::categoria_messaggio)))));

create policy messaggi_lettura on public.messaggi as PERMISSIVE for SELECT to public
  using (((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app])) OR ((ruolo_corrente() = 'tesoriere'::ruolo_app) AND (categoria = 'sollecito'::categoria_messaggio))));

create policy messaggi_modifica on public.messaggi as PERMISSIVE for UPDATE to public
  using (((ruolo_corrente() = 'amministratore'::ruolo_app) OR ((stato = ANY (ARRAY['bozza'::stato_messaggio, 'in_approvazione'::stato_messaggio])) AND ((ruolo_corrente() = 'segretario'::ruolo_app) OR ((ruolo_corrente() = 'tesoriere'::ruolo_app) AND (categoria = 'sollecito'::categoria_messaggio))))))
  with check (((ruolo_corrente() = 'amministratore'::ruolo_app) OR ((stato = ANY (ARRAY['bozza'::stato_messaggio, 'in_approvazione'::stato_messaggio])) AND ((ruolo_corrente() = 'segretario'::ruolo_app) OR ((ruolo_corrente() = 'tesoriere'::ruolo_app) AND (categoria = 'sollecito'::categoria_messaggio))))));

create policy destinatari_cancellazione on public.messaggi_destinatari as PERMISSIVE for DELETE to public
  using (puo_modificare_messaggio(messaggio_id));

create policy destinatari_inserimento on public.messaggi_destinatari as PERMISSIVE for INSERT to public
  with check (puo_modificare_messaggio(messaggio_id));

create policy destinatari_lettura on public.messaggi_destinatari as PERMISSIVE for SELECT to public
  using (puo_vedere_messaggio(messaggio_id));

create policy destinatari_modifica on public.messaggi_destinatari as PERMISSIVE for UPDATE to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app))
  with check ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy modelli_cancellazione on public.modelli_loggia as PERMISSIVE for DELETE to authenticated
  using (lemmi_ruolo_in(VARIADIC ARRAY['amministratore'::text, 'segretario'::text]));

create policy modelli_inserimento on public.modelli_loggia as PERMISSIVE for INSERT to authenticated
  with check (lemmi_ruolo_in(VARIADIC ARRAY['amministratore'::text, 'segretario'::text]));

create policy modelli_lettura on public.modelli_loggia as PERMISSIVE for SELECT to authenticated
  using (lemmi_ruolo_in(VARIADIC ARRAY['amministratore'::text, 'venerabile'::text, 'segretario'::text]));

create policy modelli_modifica on public.modelli_loggia as PERMISSIVE for UPDATE to authenticated
  using (lemmi_ruolo_in(VARIADIC ARRAY['amministratore'::text, 'segretario'::text]))
  with check (lemmi_ruolo_in(VARIADIC ARRAY['amministratore'::text, 'segretario'::text]));

create policy modelli_lettura on public.modelli_messaggio as PERMISSIVE for SELECT to public
  using (((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app])) OR ((ruolo_corrente() = 'tesoriere'::ruolo_app) AND (categoria = 'sollecito'::categoria_messaggio))));

create policy modelli_scrittura on public.modelli_messaggio as PERMISSIVE for ALL to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])))
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])));

create policy parametri_quote_admin on public.parametri_quote as PERMISSIVE for ALL to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app))
  with check ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy parametri_quote_lettura on public.parametri_quote as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy passaggi_cancellazione on public.passaggi_grado as PERMISSIVE for DELETE to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy passaggi_inserimento on public.passaggi_grado as PERMISSIVE for INSERT to public
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])));

create policy passaggi_lettura on public.passaggi_grado as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app])));

create policy passaggi_modifica on public.passaggi_grado as PERMISSIVE for UPDATE to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])))
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])));

create policy piano_rate_admin on public.piano_rate as PERMISSIVE for ALL to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app))
  with check ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy piano_rate_lettura on public.piano_rate as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy pratiche_lettura on public.pratiche as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM profili p
  WHERE ((p.user_id = auth.uid()) AND (p.ruolo = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app, 'venerabile'::ruolo_app]))))));

create policy pratiche_scrittura on public.pratiche as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM profili p
  WHERE ((p.user_id = auth.uid()) AND (p.ruolo = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app]))))))
  with check ((EXISTS ( SELECT 1
   FROM profili p
  WHERE ((p.user_id = auth.uid()) AND (p.ruolo = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app]))))));

create policy pratiche_date_lettura on public.pratiche_date as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM profili p
  WHERE ((p.user_id = auth.uid()) AND (p.ruolo = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app, 'venerabile'::ruolo_app]))))));

create policy pratiche_date_scrittura on public.pratiche_date as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM profili p
  WHERE ((p.user_id = auth.uid()) AND (p.ruolo = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app]))))))
  with check ((EXISTS ( SELECT 1
   FROM profili p
  WHERE ((p.user_id = auth.uid()) AND (p.ruolo = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app]))))));

create policy pratiche_passi_lettura on public.pratiche_passi as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM profili p
  WHERE ((p.user_id = auth.uid()) AND (p.ruolo = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app, 'venerabile'::ruolo_app]))))));

create policy pratiche_passi_scrittura on public.pratiche_passi as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM profili p
  WHERE ((p.user_id = auth.uid()) AND (p.ruolo = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app]))))))
  with check ((EXISTS ( SELECT 1
   FROM profili p
  WHERE ((p.user_id = auth.uid()) AND (p.ruolo = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app]))))));

create policy presenze_lettura on public.presenze_verbale as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM profili p
  WHERE ((p.user_id = auth.uid()) AND (p.ruolo = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app]))))));

create policy presenze_scrittura on public.presenze_verbale as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM profili p
  WHERE ((p.user_id = auth.uid()) AND (p.ruolo = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app]))))))
  with check ((EXISTS ( SELECT 1
   FROM profili p
  WHERE ((p.user_id = auth.uid()) AND (p.ruolo = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app]))))));

create policy profili_admin on public.profili as PERMISSIVE for ALL to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app))
  with check ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy profili_lettura on public.profili as PERMISSIVE for SELECT to public
  using (((user_id = auth.uid()) OR (ruolo_corrente() = 'amministratore'::ruolo_app)));

create policy registro_attivita_admin on public.registro_attivita as PERMISSIVE for SELECT to authenticated
  using (lemmi_e_admin());

create policy scadenze_cancellazione on public.scadenze as PERMISSIVE for DELETE to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy scadenze_inserimento on public.scadenze as PERMISSIVE for INSERT to public
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy scadenze_lettura on public.scadenze as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy scadenze_modifica on public.scadenze as PERMISSIVE for UPDATE to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])))
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy tornate_cancellazione on public.tornate as PERMISSIVE for DELETE to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app])));

create policy tornate_inserimento on public.tornate as PERMISSIVE for INSERT to public
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app])));

create policy tornate_lettura on public.tornate as PERMISSIVE for SELECT to public
  using ((auth.uid() IS NOT NULL));

create policy tornate_modifica on public.tornate as PERMISSIVE for UPDATE to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app])))
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app])));

create policy verbali_lettura on public.verbali as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM profili p
  WHERE ((p.user_id = auth.uid()) AND (p.ruolo = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app]))))));

create policy verbali_scrittura on public.verbali as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM profili p
  WHERE ((p.user_id = auth.uid()) AND (p.ruolo = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app]))))))
  with check ((EXISTS ( SELECT 1
   FROM profili p
  WHERE ((p.user_id = auth.uid()) AND (p.ruolo = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app]))))));

create policy versamenti_cancellazione on public.versamenti as PERMISSIVE for DELETE to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy versamenti_inserimento on public.versamenti as PERMISSIVE for INSERT to public
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy versamenti_lettura on public.versamenti as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy versamenti_modifica on public.versamenti as PERMISSIVE for UPDATE to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])))
  with check ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy voci_quota_admin on public.voci_quota as PERMISSIVE for ALL to public
  using ((ruolo_corrente() = 'amministratore'::ruolo_app))
  with check ((ruolo_corrente() = 'amministratore'::ruolo_app));

create policy voci_quota_lettura on public.voci_quota as PERMISSIVE for SELECT to public
  using ((ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app, 'tesoriere'::ruolo_app])));

create policy documenti_loggia_cancellazione on storage.objects as PERMISSIVE for DELETE to authenticated
  using (((bucket_id = 'documenti-loggia'::text) AND (ruolo_corrente() = 'amministratore'::ruolo_app)));

create policy documenti_loggia_inserimento on storage.objects as PERMISSIVE for INSERT to authenticated
  with check (((bucket_id = 'documenti-loggia'::text) AND (ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'segretario'::ruolo_app]))));

create policy documenti_loggia_lettura on storage.objects as PERMISSIVE for SELECT to authenticated
  using (((bucket_id = 'documenti-loggia'::text) AND (ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app]))));

create policy "lemmi modelli cancellazione" on storage.objects as PERMISSIVE for DELETE to authenticated
  using (((bucket_id = 'modelli'::text) AND lemmi_ruolo_in(VARIADIC ARRAY['amministratore'::text, 'segretario'::text])));

create policy "lemmi modelli inserimento" on storage.objects as PERMISSIVE for INSERT to authenticated
  with check (((bucket_id = 'modelli'::text) AND lemmi_ruolo_in(VARIADIC ARRAY['amministratore'::text, 'segretario'::text])));

create policy "lemmi modelli lettura" on storage.objects as PERMISSIVE for SELECT to authenticated
  using (((bucket_id = 'modelli'::text) AND lemmi_ruolo_in(VARIADIC ARRAY['amministratore'::text, 'venerabile'::text, 'segretario'::text])));

create policy tavole_cancellazione on storage.objects as PERMISSIVE for DELETE to authenticated
  using (((bucket_id = 'tavole'::text) AND (ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app]))));

create policy tavole_inserimento on storage.objects as PERMISSIVE for INSERT to authenticated
  with check (((bucket_id = 'tavole'::text) AND (ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app]))));

create policy tavole_lettura on storage.objects as PERMISSIVE for SELECT to authenticated
  using (((bucket_id = 'tavole'::text) AND (ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app]))));

create policy tavole_modifica on storage.objects as PERMISSIVE for UPDATE to authenticated
  using (((bucket_id = 'tavole'::text) AND (ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app]))))
  with check (((bucket_id = 'tavole'::text) AND (ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app]))));

-- archivio file: documenti-loggia (privato: t, limite: 10485760 byte)

-- archivio file: modelli (privato: t, limite: 10485760 byte)

-- archivio file: tavole (privato: t, limite: 10485760 byte)

-- pianificazione lemmi-backup-giornaliero: 30 1 * * * (attiva: t)
