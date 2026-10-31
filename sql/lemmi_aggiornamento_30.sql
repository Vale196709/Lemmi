-- Lemmi - aggiornamento 30 (sicurezza)
-- 1) Registro delle attività: chi ha inserito, modificato o eliminato cosa (solo amministratore)
-- 2) Ripristino guidato da un backup, tabella per tabella, senza cancellare nulla di ciò che c'è ora
-- Richiede lo script dell'aggiornamento 26 già eseguito. Si può rieseguire senza danni.

------------------------------------------------------------------
-- 1) Registro delle attività
------------------------------------------------------------------
create table if not exists public.registro_attivita (
  id bigserial primary key,
  quando timestamptz not null default now(),
  utente_id uuid,
  utente_email text,
  tabella text not null,
  operazione text not null check (operazione in ('inserimento', 'modifica', 'eliminazione')),
  riga_id text,
  prima jsonb,          -- modifica: solo i campi cambiati, valore precedente; eliminazione: la riga
  dopo jsonb            -- modifica: solo i campi cambiati, nuovo valore; inserimento: la riga
);
create index if not exists registro_attivita_quando_idx on public.registro_attivita (quando desc);
create index if not exists registro_attivita_tabella_idx on public.registro_attivita (tabella, quando desc);

alter table public.registro_attivita enable row level security;
drop policy if exists registro_attivita_admin on public.registro_attivita;
create policy registro_attivita_admin on public.registro_attivita
  for select to authenticated using (public.lemmi_e_admin());
revoke insert, update, delete, truncate on public.registro_attivita from anon, authenticated;
revoke all on public.registro_attivita from anon;
grant select on public.registro_attivita to authenticated;

create or replace function public.lemmi_audit()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
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
$$;

-- il registro si tiene per 24 mesi (la pulizia parte con il backup notturno)
create or replace function public.pulisci_registro()
returns void
language sql security definer
set search_path = public, pg_temp
as $$
  delete from public.registro_attivita where quando < now() - interval '24 months';
$$;
revoke all on function public.pulisci_registro() from public, anon, authenticated;

-- collega il registro a tutte le tabelle dell'app (se in futuro aggiungi tabelle, rilancia questo script)
do $$
declare t record;
begin
  for t in select tablename from pg_tables
           where schemaname = 'public' and tablename not like 'backup\_%'
             and tablename not in ('registro_attivita', 'cronologia_modifiche') loop
    execute format('drop trigger if exists lemmi_audit on public.%I', t.tablename);
    execute format('create trigger lemmi_audit after insert or update or delete on public.%I for each row execute function public.lemmi_audit()', t.tablename);
  end loop;
end
$$;

------------------------------------------------------------------
-- Backup: aggiornato per non copiare il registro e per pulirlo
------------------------------------------------------------------
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
$$;
revoke all on function public.esegui_backup(text, text) from public, anon;
grant execute on function public.esegui_backup(text, text) to authenticated;


------------------------------------------------------------------
-- 2) Ripristino guidato
-- Principio: non si cancella mai nulla di ciò che c'è ora. Si possono solo
--   - recuperare le righe che nel backup c'erano e ora non ci sono più ("eliminate")
--   - riportare alla versione del backup le righe modificate dopo ("modificate")
-- Prima di ogni ripristino parte da solo un backup (incrementale) di sicurezza dello stato attuale.
------------------------------------------------------------------
create or replace function public._ripristino_stato(p_esec bigint, p_tabella text)
returns table (hash text, dati jsonb)
language sql stable security definer
set search_path = public, pg_temp
as $$
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
$$;
revoke all on function public._ripristino_stato(bigint, text) from public, anon, authenticated;

create or replace function public._tabella_ok(p_tabella text)
returns void
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if p_tabella is null or p_tabella !~ '^[a-z_][a-z0-9_]*$' or p_tabella like 'backup\_%' or p_tabella = 'registro_attivita'
     or not exists (select 1 from pg_tables where schemaname = 'public' and tablename = p_tabella) then
    raise exception 'Tabella non valida: %', p_tabella;
  end if;
end;
$$;
revoke all on function public._tabella_ok(text) from public, anon, authenticated;

-- prepara due tabelle temporanee (_rk_cur: stato attuale, _rk_bk: stato nel backup) con la chiave di ogni riga
create or replace function public._ripristino_prepara(p_esec bigint, p_tabella text)
returns text[]
language plpgsql security definer
set search_path = public, pg_temp
as $$
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
$$;
revoke all on function public._ripristino_prepara(bigint, text) from public, anon, authenticated;

create or replace function public._ripristino_confronta(p_esec bigint, p_tabella text, p_campioni boolean)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
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
$$;
revoke all on function public._ripristino_confronta(bigint, text, boolean) from public, anon, authenticated;

-- Confronto tra un backup e lo stato attuale: senza tabella, il riepilogo di tutte; con tabella, anche gli esempi
create or replace function public.anteprima_ripristino(p_esec bigint, p_tabella text default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
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
$$;
revoke all on function public.anteprima_ripristino(bigint, text) from public, anon;
grant execute on function public.anteprima_ripristino(bigint, text) to authenticated;

-- p_modo: 'eliminate' (rimette le righe cancellate) | 'modificate' (riporta le righe alla versione del backup)
create or replace function public.ripristina_tabella(p_esec bigint, p_tabella text, p_modo text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
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
$$;
revoke all on function public.ripristina_tabella(bigint, text, text) from public, anon;
grant execute on function public.ripristina_tabella(bigint, text, text) to authenticated;
