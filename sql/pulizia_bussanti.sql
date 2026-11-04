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
-- Si può rieseguire senza problemi: la seconda volta non trova nulla.
-- =====================================================================

-- 1) Pratiche legate a bussanti che non esistono più
--    (passi e date si cancellano in automatico)
delete from public.pratiche
where rif_tipo = 'bussante' and rif_id is not null
  and rif_id not in (select id::text from public.bussanti);

-- 2) Registri e backup: tolgo ogni riga che parla di bussanti eliminati
with vivi as (
  select id::text as id from public.bussanti
),
prat as (   -- pratiche dei bussanti eliminati, ricostruite dal Registro
  select distinct coalesce(prima, dopo)->>'id' as id
  from public.registro_attivita
  where tabella = 'pratiche'
    and coalesce(prima, dopo)->>'rif_tipo' = 'bussante'
    and coalesce(prima, dopo)->>'rif_id' not in (select id from vivi)
    and coalesce(prima, dopo)->>'id' is not null
),
del_reg as (
  delete from public.registro_attivita r
  where (r.tabella = 'bussanti'  and coalesce(r.prima, r.dopo)->>'id' not in (select id from vivi))
     or (r.tabella = 'documenti' and coalesce(r.prima, r.dopo)->>'bussante_id' not in (select id from vivi))
     or (r.tabella = 'pratiche'  and coalesce(r.prima, r.dopo)->>'id' in (select id from prat))
     or (r.tabella in ('pratiche_passi', 'pratiche_date') and coalesce(r.prima, r.dopo)->>'pratica_id' in (select id from prat))
  returning 1
),
del_cron as (
  delete from public.cronologia_modifiche c
  where (c.tabella = 'bussanti'  and coalesce(c.prima, c.dopo)->>'id' not in (select id from vivi))
     or (c.tabella = 'documenti' and coalesce(c.prima, c.dopo)->>'bussante_id' not in (select id from vivi))
  returning 1
),
impronte as (   -- copie nei backup (anche i segni di «riga eliminata» con la stessa impronta)
  select distinct b.tabella, b.hash
  from public.backup_righe b
  where b.dati is not null
    and (   (b.tabella = 'bussanti'  and b.dati->>'id' not in (select id from vivi))
         or (b.tabella = 'documenti' and b.dati->>'bussante_id' not in (select id from vivi))
         or (b.tabella = 'pratiche'  and b.dati->>'rif_tipo' = 'bussante' and b.dati->>'rif_id' not in (select id from vivi))
         or (b.tabella in ('pratiche_passi', 'pratiche_date') and b.dati->>'pratica_id' in (select id from prat)))
),
del_bk as (
  delete from public.backup_righe r using impronte i
  where r.tabella = i.tabella and r.hash = i.hash
  returning 1
)
select 'Registro delle attività' as "Cosa", (select count(*) from del_reg) as "Righe tolte"
union all select 'Cronologia delle modifiche', (select count(*) from del_cron)
union all select 'Copie nei backup', (select count(*) from del_bk)
union all select 'Bussanti rimasti nell’app (non toccati)', (select count(*) from vivi)
union all select 'File orfani nell’archivio documenti-loggia', (
  select count(*) from storage.objects o
  where o.bucket_id = 'documenti-loggia'
    and not exists (select 1 from public.documenti d where d.percorso = o.name));
