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

with
tabelle as (
  select c.oid, c.relname as nome, c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
),
colonne as (
  select t.nome, string_agg(
           format('  %I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                  case when a.attnotnull then ' not null' else '' end,
                  coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')),
           E',\n' order by a.attnum) as righe
  from tabelle t
  join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = t.oid and d.adnum = a.attnum
  group by t.nome
),
vincoli as (
  select t.nome, string_agg(format('  constraint %I %s', co.conname, pg_get_constraintdef(co.oid)), E',\n' order by co.contype, co.conname) as righe
  from tabelle t join pg_constraint co on co.conrelid = t.oid
  group by t.nome
)
select definizione from (
  -- 1. tabelle
  select 1 as ord, t.nome as chiave,
         format(E'create table if not exists public.%I (\n%s%s\n);%s', t.nome, c.righe,
                coalesce(E',\n' || v.righe, ''),
                case when t.rls then format(E'\nalter table public.%I enable row level security;', t.nome) else '' end) as definizione
  from tabelle t join colonne c using (nome) left join vincoli v using (nome)
  union all
  -- 2. indici (esclusi quelli creati dai vincoli)
  select 2, i.indexname, i.indexdef || ';'
  from pg_indexes i
  where i.schemaname = 'public'
    and i.indexname not in (select conname from pg_constraint)
  union all
  -- 3. viste
  select 3, v.viewname, format(E'create or replace view public.%I as\n%s', v.viewname, pg_get_viewdef(format('public.%I', v.viewname)::regclass, true))
  from pg_views v where v.schemaname = 'public'
  union all
  -- 4. funzioni
  select 4, p.proname, pg_get_functiondef(p.oid) || ';'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f', 'p')
  union all
  -- 5. trigger
  select 5, tg.tgname, pg_get_triggerdef(tg.oid) || ';'
  from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not tg.tgisinternal
  union all
  -- 6. regole di sicurezza (RLS) delle tabelle
  select 6, p.tablename || '.' || p.policyname,
         format(E'create policy %I on %I.%I as %s for %s to %s%s%s;', p.policyname, p.schemaname, p.tablename,
                p.permissive, p.cmd, array_to_string(p.roles, ', '),
                coalesce(E'\n  using (' || p.qual || ')', ''), coalesce(E'\n  with check (' || p.with_check || ')', ''))
  from pg_policies p where p.schemaname in ('public', 'storage')
  union all
  -- 7. archivi dei file (bucket)
  select 7, b.id, format('-- archivio file: %s (privato: %s, limite: %s byte)', b.id, not b.public, coalesce(b.file_size_limit::text, 'nessuno'))
  from storage.buckets b
  union all
  -- 8. backup automatici: la pianificazione richiede l'estensione pg_cron (qui si controlla solo se è attiva)
  select 8, 'pg_cron', case when to_regclass('cron.job') is null
    then '-- ATTENZIONE: estensione pg_cron NON attiva: i backup automatici non sono pianificati'
    else '-- estensione pg_cron attiva' end
) x
order by ord, chiave;
