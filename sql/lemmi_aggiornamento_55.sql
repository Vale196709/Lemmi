-- Lemmi - aggiornamento 55 (v0.70.0): Diario della segreteria (Regolamento della segreteria, cartella 08)
-- Un fascicolo per ogni attività del Segretario verso la Loggia e il GOI (Gran Segreteria, Consiglio, Anagrafe,
-- Collegio...), in ordine di data, con oggetto, destinatario, stato, prossimo adempimento e da chi si attende risposta,
-- più la cronologia di invii, riscontri e solleciti.
-- Leggono Venerabile, Segretario e amministratore; scrivono Segretario e amministratore.
-- Da eseguire una volta su Supabase (SQL Editor). Si può rieseguire senza danni.

create table if not exists public.segreteria_attivita (
  id uuid not null default gen_random_uuid(),
  data date not null default current_date,
  oggetto text not null,
  destinatario text,
  ricorrente text,
  anno_riferimento integer,
  stato text not null default 'aperta',
  prossimo_adempimento text,
  attesa_da text,
  scadenza date,
  rif_archivio text,
  note text,
  chiusa_il date,
  creato_il timestamp with time zone not null default now(),
  aggiornato_il timestamp with time zone not null default now(),
  creato_da uuid default auth.uid(),
  constraint segreteria_attivita_pkey primary key (id),
  constraint segreteria_attivita_stato_check check (stato = any (array['aperta'::text, 'attesa'::text, 'chiusa'::text]))
);
alter table public.segreteria_attivita enable row level security;
create index if not exists segreteria_attivita_data_idx on public.segreteria_attivita (data desc);
create index if not exists segreteria_attivita_ricorrente_idx on public.segreteria_attivita (ricorrente, anno_riferimento);

create table if not exists public.segreteria_eventi (
  id uuid not null default gen_random_uuid(),
  attivita_id uuid not null,
  data date not null default current_date,
  tipo text not null,
  descrizione text,
  mezzo text,
  creato_il timestamp with time zone not null default now(),
  creato_da uuid default auth.uid(),
  constraint segreteria_eventi_pkey primary key (id),
  constraint segreteria_eventi_attivita_fkey foreign key (attivita_id) references public.segreteria_attivita(id) on delete cascade,
  constraint segreteria_eventi_tipo_check check (tipo = any (array['invio'::text, 'riscontro'::text, 'sollecito'::text, 'documento'::text, 'nota'::text]))
);
alter table public.segreteria_eventi enable row level security;
create index if not exists segreteria_eventi_attivita_idx on public.segreteria_eventi (attivita_id, data);

drop policy if exists segreteria_attivita_lettura on public.segreteria_attivita;
create policy segreteria_attivita_lettura on public.segreteria_attivita as permissive for select to authenticated
  using (public.ruolo_corrente() = any (array['amministratore'::public.ruolo_app, 'segretario'::public.ruolo_app, 'venerabile'::public.ruolo_app]));
drop policy if exists segreteria_attivita_scrittura on public.segreteria_attivita;
create policy segreteria_attivita_scrittura on public.segreteria_attivita as permissive for all to authenticated
  using (public.ruolo_corrente() = any (array['amministratore'::public.ruolo_app, 'segretario'::public.ruolo_app]))
  with check (public.ruolo_corrente() = any (array['amministratore'::public.ruolo_app, 'segretario'::public.ruolo_app]));
drop policy if exists segreteria_eventi_lettura on public.segreteria_eventi;
create policy segreteria_eventi_lettura on public.segreteria_eventi as permissive for select to authenticated
  using (public.ruolo_corrente() = any (array['amministratore'::public.ruolo_app, 'segretario'::public.ruolo_app, 'venerabile'::public.ruolo_app]));
drop policy if exists segreteria_eventi_scrittura on public.segreteria_eventi;
create policy segreteria_eventi_scrittura on public.segreteria_eventi as permissive for all to authenticated
  using (public.ruolo_corrente() = any (array['amministratore'::public.ruolo_app, 'segretario'::public.ruolo_app]))
  with check (public.ruolo_corrente() = any (array['amministratore'::public.ruolo_app, 'segretario'::public.ruolo_app]));

-- Registro delle attività (chi ha inserito, modificato o eliminato cosa)
drop trigger if exists lemmi_audit on public.segreteria_attivita;
create trigger lemmi_audit after insert or update or delete on public.segreteria_attivita for each row execute function public.lemmi_audit();
drop trigger if exists lemmi_audit on public.segreteria_eventi;
create trigger lemmi_audit after insert or update or delete on public.segreteria_eventi for each row execute function public.lemmi_audit();

-- controllo: deve restituire «diario pronto»
select case when to_regclass('public.segreteria_attivita') is not null and to_regclass('public.segreteria_eventi') is not null
            then 'diario pronto' else 'ERRORE: tabelle mancanti' end as diario_della_segreteria;
