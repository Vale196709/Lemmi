-- Lemmi - AGGIORNAMENTO 42: adesioni alle agapi
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run. Si può rieseguire senza danni.
-- Cosa fa:
--   1. nel Calendario ogni tornata può avere un'agape (le «Agapi» lo sono sempre) con la quota a persona
--      e la data entro cui aderire
--   2. nuova tabella delle adesioni: chi partecipa, quanti ospiti porta, note (es. esigenze alimentari) e incasso
--   3. ogni Fratello con un accesso conferma o disdice la propria partecipazione dalla sua area personale;
--      vede solo la propria adesione e non può segnare da sé l'incasso
--   4. collega la nuova tabella al registro delle attività e ai backup

-- ============ 1. agape nelle tornate ============
alter table public.tornate add column if not exists con_agape boolean not null default false;
alter table public.tornate add column if not exists quota_agape numeric(10,2);
alter table public.tornate add column if not exists adesioni_entro date;
do $$ begin
  alter table public.tornate add constraint tornate_quota_agape_check check (quota_agape is null or quota_agape >= 0);
exception when duplicate_object then null; end $$;

-- ============ 2. adesioni ============
create table if not exists public.agape_adesioni (
  id uuid primary key default gen_random_uuid(),
  tornata_id uuid not null references public.tornate(id) on delete cascade,
  fratello_id uuid not null references public.fratelli(id) on delete cascade,
  partecipa boolean not null,
  ospiti integer not null default 0 check (ospiti between 0 and 20),
  note text,
  incassato numeric(10,2) check (incassato is null or incassato >= 0),
  risposta_da text not null default 'segreteria' check (risposta_da in ('segreteria', 'fratello')),
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  unique (tornata_id, fratello_id)
);
create index if not exists agape_adesioni_tornata_idx on public.agape_adesioni (tornata_id);
alter table public.agape_adesioni enable row level security;

-- Venerabile, Segretario, Tesoriere e amministratore vedono e gestiscono tutte le adesioni
drop policy if exists agape_gestione on public.agape_adesioni;
create policy agape_gestione on public.agape_adesioni for all to authenticated
  using (public.ruolo_corrente()::text in ('amministratore', 'venerabile', 'segretario', 'tesoriere'))
  with check (public.ruolo_corrente()::text in ('amministratore', 'venerabile', 'segretario', 'tesoriere'));
-- il Fratello legge solo la propria adesione (la modifica passa dalla funzione qui sotto)
drop policy if exists agape_propria_lettura on public.agape_adesioni;
create policy agape_propria_lettura on public.agape_adesioni for select to authenticated
  using (fratello_id = public.fratello_mio());
revoke all on public.agape_adesioni from anon;
grant select, insert, update, delete on public.agape_adesioni to authenticated;

-- aggiornato_il sempre corretto
create or replace function public.agape_aggiornato() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin new.aggiornato_il := now(); return new; end $$;
drop trigger if exists agape_aggiornato on public.agape_adesioni;
create trigger agape_aggiornato before update on public.agape_adesioni for each row execute function public.agape_aggiornato();

-- ============ 3. risposta del Fratello dalla sua area ============
create or replace function public.aderisci_agape(p_tornata uuid, p_partecipa boolean, p_ospiti integer default 0, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fr uuid := public.fratello_mio();
  t public.tornate%rowtype;
begin
  if v_fr is null then raise exception 'Il tuo accesso non è collegato a una scheda di Fratello'; end if;
  select * into t from public.tornate where id = p_tornata;
  if not found then raise exception 'Tornata non trovata'; end if;
  if not (t.tipo = 'agape' or t.con_agape) then raise exception 'Per questa tornata non è prevista un''agape'; end if;
  if t.stato = 'annullata' then raise exception 'La tornata è stata annullata'; end if;
  if t.data < current_date then raise exception 'L''agape si è già svolta'; end if;
  if t.adesioni_entro is not null and current_date > t.adesioni_entro then
    raise exception 'Le adesioni si sono chiuse il %: rivolgiti al Segretario', to_char(t.adesioni_entro, 'DD/MM/YYYY');
  end if;
  insert into public.agape_adesioni (tornata_id, fratello_id, partecipa, ospiti, note, risposta_da)
  values (p_tornata, v_fr, p_partecipa, case when p_partecipa then greatest(0, least(coalesce(p_ospiti, 0), 20)) else 0 end,
          nullif(trim(coalesce(p_note, '')), ''), 'fratello')
  on conflict (tornata_id, fratello_id) do update
    set partecipa = excluded.partecipa, ospiti = excluded.ospiti, note = excluded.note, risposta_da = 'fratello';
end $$;
revoke all on function public.aderisci_agape(uuid, boolean, integer, text) from public, anon;
grant execute on function public.aderisci_agape(uuid, boolean, integer, text) to authenticated;

-- ============ 4. registro delle attività ============
do $$ begin
  if exists (select 1 from pg_proc where proname = 'lemmi_audit') then
    execute 'drop trigger if exists lemmi_audit on public.agape_adesioni';
    execute 'create trigger lemmi_audit after insert or update or delete on public.agape_adesioni for each row execute function public.lemmi_audit()';
  end if;
end $$;

notify pgrst, 'reload schema';
