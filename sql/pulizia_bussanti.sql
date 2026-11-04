-- =====================================================================
-- Lemmi · Pulizia dei dati dei bussanti eliminati (aggiornamento 43)
--
-- QUANDO USARLO: DOPO aver eliminato il bussante dall'app
--   (Fratelli/Bussanti › scheda del bussante › «Elimina pratica»).
--   L'app cancella la scheda, i documenti e i file nell'archivio privato.
--   Questo script toglie i dati rimasti in giro nel database:
--     · pratiche (e relativi passi e date) del bussante;
--     · righe del Registro delle attività e della cronologia delle modifiche;
--     · copie nei backup (così il bussante non torna con un ripristino).
--   I bussanti ANCORA presenti nell'app non vengono toccati.
--   I movimenti del Conto di Loggia restano: perdono solo il collegamento.
--
-- COME: Supabase › SQL Editor › incolla tutto › Run.
-- In fondo compare un riepilogo con quante righe sono state tolte.
-- =====================================================================

begin;

-- bussanti ancora esistenti (da NON toccare)
create temp table _vivi on commit drop as
  select id::text as id from public.bussanti;

-- pratiche legate a bussanti che non esistono più
create temp table _pratiche on commit drop as
  select id::text as id from public.pratiche
  where rif_tipo = 'bussante' and rif_id is not null
    and rif_id not in (select id from _vivi);

-- aggiungo anche le pratiche già cancellate in passato ma rimaste nei registri
insert into _pratiche
  select distinct coalesce(prima, dopo)->>'id' from public.registro_attivita
  where tabella = 'pratiche' and coalesce(prima, dopo)->>'rif_tipo' = 'bussante'
    and coalesce(prima, dopo)->>'rif_id' not in (select id from _vivi)
    and coalesce(prima, dopo)->>'id' is not null
  except select id from _pratiche;

-- 1) pratiche (passi e date si cancellano in automatico)
create temp table _conta (voce text, righe bigint) on commit drop;
with d as (delete from public.pratiche where id::text in (select id from _pratiche) returning 1)
insert into _conta select 'Pratiche del bussante', count(*) from d;

-- regola comune per riconoscere le righe di registro che parlano di bussanti eliminati
create function pg_temp._da_togliere(t text, j jsonb) returns boolean language sql as $f$
  select case
    when t = 'bussanti'  then j->>'id' not in (select id from _vivi)
    when t = 'documenti' then j->>'bussante_id' is not null and j->>'bussante_id' not in (select id from _vivi)
    when t = 'pratiche'  then j->>'id' in (select id from _pratiche)
    when t in ('pratiche_passi', 'pratiche_date') then j->>'pratica_id' in (select id from _pratiche)
    else false end
$f$;

-- 2) Registro delle attività
with d as (delete from public.registro_attivita
           where pg_temp._da_togliere(tabella, coalesce(prima, dopo)) returning 1)
insert into _conta select 'Registro delle attività', count(*) from d;

-- 3) Cronologia delle modifiche
with d as (delete from public.cronologia_modifiche
           where pg_temp._da_togliere(tabella, coalesce(prima, dopo)) returning 1)
insert into _conta select 'Cronologia delle modifiche', count(*) from d;

-- 4) Copie nei backup (anche i segni di «riga eliminata» con la stessa impronta)
with h as (select distinct tabella, hash from public.backup_righe
           where dati is not null and pg_temp._da_togliere(tabella, dati)),
     d as (delete from public.backup_righe r using h
           where r.tabella = h.tabella and r.hash = h.hash returning 1)
insert into _conta select 'Copie nei backup', count(*) from d;

-- riepilogo
select voce as "Cosa", righe as "Righe tolte" from _conta
union all
select 'Bussanti rimasti nell’app (non toccati)', count(*) from _vivi
union all
select 'File orfani nell’archivio documenti-loggia', count(*)
  from storage.objects o
  where o.bucket_id = 'documenti-loggia'
    and not exists (select 1 from public.documenti d where d.percorso = o.name);

commit;
