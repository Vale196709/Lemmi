-- Lemmi - aggiornamento 53 (v0.68.0): Caselle e rinnovi (Regolamento della segreteria, cartella 04)
-- Elenco delle caselle istituzionali (PEC, PEO), del dominio e degli altri servizi da rinnovare: gestore, scadenza,
-- recapiti di recupero, verifica in due passaggi, ultimo cambio password e dove sono custodite le credenziali.
-- LE PASSWORD NON SI SCRIVONO QUI: restano nella cartella 04 / custodia del Segretario.
-- Leggono Venerabile, Segretario e amministratore; scrivono Segretario e amministratore.
-- Da eseguire una volta su Supabase (SQL Editor). Si può rieseguire senza danni.

create table if not exists public.caselle_rinnovi (
  id uuid not null default gen_random_uuid(),
  tipo text not null,
  nome text not null,
  indirizzo text,
  gestore text,
  scadenza date,
  rinnovo_automatico boolean not null default false,
  preavviso_giorni integer not null default 30,
  recapiti_recupero text,
  due_passaggi boolean not null default false,
  ultimo_cambio_password date,
  custodia_credenziali text,
  chi_accede text,
  note text,
  attivo boolean not null default true,
  creato_il timestamp with time zone not null default now(),
  aggiornato_il timestamp with time zone not null default now(),
  creato_da uuid default auth.uid(),
  constraint caselle_rinnovi_pkey primary key (id),
  constraint caselle_rinnovi_tipo_check check (tipo = any (array['pec'::text, 'peo'::text, 'dominio'::text, 'firma'::text, 'altro'::text])),
  constraint caselle_rinnovi_preavviso_check check (preavviso_giorni between 0 and 365)
);
alter table public.caselle_rinnovi enable row level security;
create index if not exists caselle_rinnovi_scadenza_idx on public.caselle_rinnovi (attivo, scadenza);

drop policy if exists caselle_rinnovi_lettura on public.caselle_rinnovi;
create policy caselle_rinnovi_lettura on public.caselle_rinnovi as permissive for select to authenticated
  using (public.ruolo_corrente() = any (array['amministratore'::public.ruolo_app, 'segretario'::public.ruolo_app, 'venerabile'::public.ruolo_app]));
drop policy if exists caselle_rinnovi_scrittura on public.caselle_rinnovi;
create policy caselle_rinnovi_scrittura on public.caselle_rinnovi as permissive for all to authenticated
  using (public.ruolo_corrente() = any (array['amministratore'::public.ruolo_app, 'segretario'::public.ruolo_app]))
  with check (public.ruolo_corrente() = any (array['amministratore'::public.ruolo_app, 'segretario'::public.ruolo_app]));

-- Registro delle attività (chi ha inserito, modificato o eliminato cosa)
drop trigger if exists lemmi_audit on public.caselle_rinnovi;
create trigger lemmi_audit after insert or update or delete on public.caselle_rinnovi for each row execute function public.lemmi_audit();

-- controllo: deve restituire «tabella pronta»
select case when to_regclass('public.caselle_rinnovi') is not null then 'tabella pronta' else 'ERRORE: tabella mancante' end as caselle_e_rinnovi;
