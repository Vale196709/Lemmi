-- Lemmi - aggiornamento 63 (script 47): Archivio cartaceo (Regolamento della segreteria, Parte II)
-- Registro degli originali cartacei: in quale cartellina stanno, se sono in archivio, prelevati o trasmessi a un organo,
-- con lo storico dei movimenti. Leggono Venerabile, Segretario e amministratore; scrivono Segretario e amministratore.
-- Da eseguire una volta su Supabase (SQL Editor). Si puo' rieseguire senza danni.

create table if not exists public.originali_cartacei (
  id uuid not null default gen_random_uuid(),
  cartellina text not null,
  descrizione text not null,
  riferimento text,
  data_ricezione date,
  stato text not null default 'in_archivio',
  destinatario text,
  data_uscita date,
  rientro_previsto date,
  copia_in_cartellina boolean not null default false,
  scansionato boolean not null default false,
  note text,
  creato_il timestamp with time zone not null default now(),
  aggiornato_il timestamp with time zone not null default now(),
  creato_da uuid default auth.uid(),
  constraint originali_cartacei_pkey primary key (id),
  constraint originali_cartacei_cartellina_check check (cartellina = any (array['bussanti'::text, 'regolarizzazioni'::text, 'assemblee_goi'::text, 'elezioni'::text, 'associazione'::text, 'passaggi_grado'::text])),
  constraint originali_cartacei_stato_check check (stato = any (array['in_archivio'::text, 'prelevato'::text, 'trasmesso'::text])),
  constraint originali_cartacei_uscita_check check (stato = 'in_archivio' or (destinatario is not null and data_uscita is not null))
);
alter table public.originali_cartacei enable row level security;
create index if not exists originali_cartacei_cartellina_idx on public.originali_cartacei (cartellina, stato);

create table if not exists public.originali_movimenti (
  id uuid not null default gen_random_uuid(),
  originale_id uuid not null,
  data date not null,
  evento text not null,
  destinatario text,
  rientro_previsto date,
  note text,
  creato_il timestamp with time zone not null default now(),
  creato_da uuid default auth.uid(),
  constraint originali_movimenti_pkey primary key (id),
  constraint originali_movimenti_originale_fkey foreign key (originale_id) references public.originali_cartacei (id) on delete cascade,
  constraint originali_movimenti_evento_check check (evento = any (array['prelievo'::text, 'trasmissione'::text, 'rientro'::text]))
);
alter table public.originali_movimenti enable row level security;
create index if not exists originali_movimenti_originale_idx on public.originali_movimenti (originale_id, data);

drop policy if exists originali_cartacei_lettura on public.originali_cartacei;
create policy originali_cartacei_lettura on public.originali_cartacei as permissive for select to authenticated
  using (public.ruolo_corrente() = any (array['amministratore'::public.ruolo_app, 'segretario'::public.ruolo_app, 'venerabile'::public.ruolo_app]));
drop policy if exists originali_cartacei_scrittura on public.originali_cartacei;
create policy originali_cartacei_scrittura on public.originali_cartacei as permissive for all to authenticated
  using (public.ruolo_corrente() = any (array['amministratore'::public.ruolo_app, 'segretario'::public.ruolo_app]))
  with check (public.ruolo_corrente() = any (array['amministratore'::public.ruolo_app, 'segretario'::public.ruolo_app]));
drop policy if exists originali_movimenti_lettura on public.originali_movimenti;
create policy originali_movimenti_lettura on public.originali_movimenti as permissive for select to authenticated
  using (public.ruolo_corrente() = any (array['amministratore'::public.ruolo_app, 'segretario'::public.ruolo_app, 'venerabile'::public.ruolo_app]));
drop policy if exists originali_movimenti_scrittura on public.originali_movimenti;
create policy originali_movimenti_scrittura on public.originali_movimenti as permissive for all to authenticated
  using (public.ruolo_corrente() = any (array['amministratore'::public.ruolo_app, 'segretario'::public.ruolo_app]))
  with check (public.ruolo_corrente() = any (array['amministratore'::public.ruolo_app, 'segretario'::public.ruolo_app]));

-- Registra in un solo passaggio il movimento e il nuovo stato dell'originale (prelievo, trasmissione a un organo, rientro).
create or replace function public.registra_movimento_originale(p_id uuid, p_evento text, p_data date, p_destinatario text default null, p_rientro_previsto date default null, p_copia boolean default null, p_note text default null)
 returns void
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  o public.originali_cartacei;
begin
  if p_evento not in ('prelievo', 'trasmissione', 'rientro') then
    raise exception 'Movimento non valido.';
  end if;
  if p_data is null then
    raise exception 'Indica la data del movimento.';
  end if;
  select * into o from public.originali_cartacei where id = p_id for update;
  if not found then
    raise exception 'Originale non trovato.';
  end if;
  if p_evento = 'rientro' then
    if o.stato = 'in_archivio' then
      raise exception 'Questo originale risulta già in archivio.';
    end if;
    update public.originali_cartacei
       set stato = 'in_archivio', destinatario = null, data_uscita = null, rientro_previsto = null, aggiornato_il = now()
     where id = p_id;
    insert into public.originali_movimenti (originale_id, data, evento, destinatario, note)
    values (p_id, p_data, 'rientro', o.destinatario, nullif(trim(p_note), ''));
  else
    if o.stato <> 'in_archivio' then
      raise exception 'Questo originale è già fuori dall''archivio: registra prima il rientro.';
    end if;
    if p_destinatario is null or length(trim(p_destinatario)) = 0 then
      raise exception 'Indica a chi o dove va l''originale.';
    end if;
    update public.originali_cartacei
       set stato = case p_evento when 'prelievo' then 'prelevato' else 'trasmesso' end,
           destinatario = trim(p_destinatario), data_uscita = p_data,
           rientro_previsto = case p_evento when 'prelievo' then p_rientro_previsto else null end,
           copia_in_cartellina = coalesce(p_copia, copia_in_cartellina), aggiornato_il = now()
     where id = p_id;
    insert into public.originali_movimenti (originale_id, data, evento, destinatario, rientro_previsto, note)
    values (p_id, p_data, p_evento, trim(p_destinatario), case p_evento when 'prelievo' then p_rientro_previsto else null end, nullif(trim(p_note), ''));
  end if;
end;
$function$;

-- Registro delle attivita' (chi ha inserito, modificato o eliminato cosa)
drop trigger if exists lemmi_audit on public.originali_cartacei;
create trigger lemmi_audit after insert or update or delete on public.originali_cartacei for each row execute function public.lemmi_audit();
drop trigger if exists lemmi_audit on public.originali_movimenti;
create trigger lemmi_audit after insert or update or delete on public.originali_movimenti for each row execute function public.lemmi_audit();
