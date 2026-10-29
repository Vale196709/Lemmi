-- Lemmi - aggiornamento 26
-- 1) cambio del profilo degli utenti (solo amministratore)
-- 2) backup completo settimanale + incrementale giornaliero, dentro il database
-- 3) misura dello spazio usato (database e archivio file)
-- Si può eseguire più volte senza danni.

------------------------------------------------------------------
-- Funzione di appoggio: l'utente collegato è amministratore?
------------------------------------------------------------------
create or replace function public.lemmi_e_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profili p
    where p.user_id = auth.uid() and p.ruolo::text = 'amministratore'
  );
$$;
revoke all on function public.lemmi_e_admin() from public, anon;
grant execute on function public.lemmi_e_admin() to authenticated;

------------------------------------------------------------------
-- 1) Cambio profilo
------------------------------------------------------------------
create or replace function public.imposta_ruolo_utente(p_user uuid, p_ruolo text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
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
$$;
revoke all on function public.imposta_ruolo_utente(uuid, text) from public, anon;
grant execute on function public.imposta_ruolo_utente(uuid, text) to authenticated;

------------------------------------------------------------------
-- 2) Backup
------------------------------------------------------------------
create table if not exists public.backup_esecuzioni (
  id bigserial primary key,
  tipo text not null check (tipo in ('completo', 'incrementale')),
  origine text not null default 'manuale',            -- manuale | automatico
  avviato_il timestamptz not null default now(),
  concluso_il timestamptz,
  esito text not null default 'in corso',             -- in corso | riuscito | fallito
  base_id bigint,                                     -- per gli incrementali: il backup completo di riferimento
  tabelle int,
  righe_nuove bigint not null default 0,              -- righe nuove o modificate
  righe_eliminate bigint not null default 0,
  byte bigint not null default 0,
  nota text
);

create table if not exists public.backup_righe (
  id bigserial primary key,
  esecuzione_id bigint not null references public.backup_esecuzioni(id) on delete cascade,
  tabella text not null,
  hash text not null,
  dati jsonb,
  eliminata boolean not null default false
);
create index if not exists backup_righe_esec_idx on public.backup_righe (esecuzione_id, tabella);
create index if not exists backup_righe_hash_idx on public.backup_righe (tabella, hash);

alter table public.backup_esecuzioni enable row level security;
alter table public.backup_righe enable row level security;

drop policy if exists backup_esecuzioni_admin on public.backup_esecuzioni;
create policy backup_esecuzioni_admin on public.backup_esecuzioni
  for select to authenticated using (public.lemmi_e_admin());
drop policy if exists backup_righe_admin on public.backup_righe;
create policy backup_righe_admin on public.backup_righe
  for select to authenticated using (public.lemmi_e_admin());

-- Scrivere si può solo attraverso la funzione esegui_backup()
revoke insert, update, delete, truncate on public.backup_esecuzioni, public.backup_righe from anon, authenticated;
revoke all on public.backup_esecuzioni, public.backup_righe from anon;
grant select on public.backup_esecuzioni, public.backup_righe to authenticated;

-- p_tipo: 'auto' (completo se l'ultimo completo ha 6 giorni o più, altrimenti incrementale), 'completo', 'incrementale'
create or replace function public.esegui_backup(p_tipo text default 'auto', p_origine text default 'manuale')
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
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
             where schemaname = 'public' and tablename not like 'backup\_%'
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
$$;
revoke all on function public.esegui_backup(text, text) from public, anon;
grant execute on function public.esegui_backup(text, text) to authenticated;

-- Stato della pianificazione automatica
create or replace function public.stato_backup()
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
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
$$;
revoke all on function public.stato_backup() from public, anon;
grant execute on function public.stato_backup() to authenticated;

-- Pianificazione: ogni notte alle 01:30 UTC (02:30 ora solare, 03:30 ora legale).
-- La funzione sceglie da sola: completo ogni 7 giorni circa, incrementale negli altri giorni.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'lemmi-backup-giornaliero';
  perform cron.schedule('lemmi-backup-giornaliero', '30 1 * * *', $c$select public.esegui_backup('auto', 'automatico')$c$);
exception when others then
  raise notice 'Pianificazione automatica NON attivata (%). Abilita pg_cron da Supabase: Database > Extensions, poi rilancia questo script.', sqlerrm;
end
$$;

------------------------------------------------------------------
-- 3) Spazio usato
------------------------------------------------------------------
create or replace function public.info_spazio()
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
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
$$;
revoke all on function public.info_spazio() from public, anon;
grant execute on function public.info_spazio() to authenticated;
