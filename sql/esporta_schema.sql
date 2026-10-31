-- Lemmi - ESPORTAZIONE DELLA STRUTTURA DEL DATABASE (sola lettura: non modifica nulla)
--
-- A cosa serve: conservare nel repository la descrizione completa del database
-- (tabelle, colonne, vincoli, viste, funzioni, regole di sicurezza RLS, trigger, archivi file).
-- Così, se il progetto Supabase andasse perso, si può ricostruire; e si possono verificare i permessi.
--
-- Come si usa:
--   1. Supabase > SQL Editor > New query: incolla tutto questo file e premi Run.
--   2. Il risultato è una tabella con una sola colonna "definizione".
--   3. Scarica il risultato (pulsante di download sopra il risultato, formato CSV) e allegalo in chat.
-- I DATI dei Fratelli NON vengono esportati: solo la struttura.
-- La funzione d'appoggio è temporanea (schema pg_temp): sparisce da sola a fine sessione.
-- Se un oggetto non si riesce a leggere, al suo posto compare una riga "-- ERRORE ..." e l'esportazione prosegue.

create or replace function pg_temp.lemmi_schema() returns setof text
language plpgsql as $fn$
declare
  r record;
  t text;
begin
  -- 0a. tipi personalizzati (elenchi di valori, es. ruolo_app)
  for r in
    select t.typname::text as nome, string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) as valori
    from pg_type t join pg_namespace n on n.oid = t.typnamespace join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public' group by t.typname order by t.typname
  loop
    return next format('do $t$ begin create type public.%I as enum (%s); exception when duplicate_object then null; end $t$;', r.nome, r.valori);
  end loop;

  -- 0b. contatori (sequenze) usati come numerazione automatica
  for r in
    select c.relname::text as nome from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'i')
    order by c.relname
  loop
    return next format('create sequence if not exists public.%I;', r.nome);
  end loop;

  -- 1. tabelle con colonne, vincoli e RLS
  for r in
    select c.oid, c.relname::text as nome, c.relrowsecurity as rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') order by c.relname
  loop
    begin
      select format(E'create table if not exists public.%I (\n%s%s\n);%s', r.nome,
               (select string_agg(format('  %I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                                         case when a.attnotnull then ' not null' else '' end,
                                         case when a.attgenerated = 's' then ' generated always as (' || pg_get_expr(d.adbin, d.adrelid) || ') stored'
                                              when a.attidentity in ('a', 'd') then ' generated ' || case a.attidentity when 'a' then 'always' else 'by default' end || ' as identity'
                                              else coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '') end), E',\n' order by a.attnum)
                  from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                  where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped),
               coalesce(E',\n' || (select string_agg(format('  constraint %I %s', co.conname, pg_get_constraintdef(co.oid)), E',\n' order by co.contype, co.conname)
                                   from pg_constraint co where co.conrelid = r.oid), ''),
               case when r.rls then format(E'\nalter table public.%I enable row level security;', r.nome) else '' end)
        into t;
      return next t;
    exception when others then return next format('-- ERRORE sulla tabella %s: %s', r.nome, sqlerrm);
    end;
  end loop;

  -- 2. indici (esclusi quelli creati dai vincoli)
  for r in
    select ic.relname::text as nome, ic.oid
    from pg_index x join pg_class ic on ic.oid = x.indexrelid join pg_class tc on tc.oid = x.indrelid
    join pg_namespace n on n.oid = tc.relnamespace
    where n.nspname = 'public' and not exists (select 1 from pg_constraint co where co.conindid = x.indexrelid)
    order by ic.relname
  loop
    begin return next pg_get_indexdef(r.oid) || ';';
    exception when others then return next format('-- ERRORE sull''indice %s: %s', r.nome, sqlerrm);
    end;
  end loop;

  -- 3. viste
  for r in
    select c.oid, c.relname::text as nome
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm') order by c.relname
  loop
    begin return next format(E'create or replace view public.%I as\n%s', r.nome, pg_get_viewdef(r.oid, true));
    exception when others then return next format('-- ERRORE sulla vista %s: %s', r.nome, sqlerrm);
    end;
  end loop;

  -- 4. funzioni
  for r in
    select p.oid, p.proname::text as nome
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p') order by p.proname
  loop
    begin return next pg_get_functiondef(r.oid) || ';';
    exception when others then return next format('-- ERRORE sulla funzione %s: %s', r.nome, sqlerrm);
    end;
  end loop;

  -- 5. trigger
  for r in
    select tg.oid, tg.tgname::text as nome
    from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not tg.tgisinternal order by tg.tgname
  loop
    begin return next pg_get_triggerdef(r.oid) || ';';
    exception when others then return next format('-- ERRORE sul trigger %s: %s', r.nome, sqlerrm);
    end;
  end loop;

  -- 6. regole di sicurezza (RLS) delle tabelle e dell'archivio file
  begin
    for r in
      select p.* from pg_policies p where p.schemaname in ('public', 'storage') order by p.schemaname, p.tablename, p.policyname
    loop
      return next format(E'create policy %I on %I.%I as %s for %s to %s%s%s;', r.policyname, r.schemaname, r.tablename,
                         r.permissive, r.cmd, array_to_string(r.roles, ', '),
                         coalesce(E'\n  using (' || r.qual || ')', ''), coalesce(E'\n  with check (' || r.with_check || ')', ''));
    end loop;
  exception when others then return next '-- ERRORE sulle regole di sicurezza: ' || sqlerrm;
  end;

  -- 7. archivi dei file (bucket)
  begin
    for r in execute 'select id::text as id, public, file_size_limit from storage.buckets order by id' loop
      return next format('-- archivio file: %s (privato: %s, limite: %s byte)', r.id, not r.public, coalesce(r.file_size_limit::text, 'nessuno'));
    end loop;
  exception when others then return next '-- ERRORE sugli archivi dei file: ' || sqlerrm;
  end;

  -- 8. backup automatici: la pianificazione richiede l'estensione pg_cron
  if to_regclass('cron.job') is null then
    return next '-- ATTENZIONE: estensione pg_cron NON attiva: i backup automatici non sono pianificati';
  else
    begin
      for r in execute 'select jobname::text as nome, schedule::text as quando, active from cron.job order by jobname' loop
        return next format('-- pianificazione %s: %s (attiva: %s)', r.nome, r.quando, r.active);
      end loop;
    exception when others then return next '-- ERRORE sulle pianificazioni: ' || sqlerrm;
    end;
  end if;
end
$fn$;

select pg_temp.lemmi_schema() as definizione;
