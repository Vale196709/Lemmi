-- Lemmi - aggiornamento 50 (v0.65.0): sicurezza dalla review globale
-- Da eseguire una volta su Supabase (SQL Editor). Si può rieseguire senza danni.
--
-- 1. Vista v_fratelli_completi: finora non filtrava per profilo. Ora la leggono per intero solo amministratore,
--    Maestro Venerabile, Segretario e Tesoriere; un utente con profilo Fratello vede solo la propria riga.
--    Le note riservate restano visibili solo ad amministratore, Venerabile e Segretario.
--    Le funzioni che la usano (capitazione, grado_mio, utenti, biblioteca) continuano a funzionare come prima.
-- 2. Notifiche: l'invio automatico del mattino porta con sé un codice segreto generato qui sotto;
--    la funzione «notifiche» aggiornata rifiuta l'invio massivo senza quel codice.

-- prima: com'erano impostate le viste (solo informativo, compare nei risultati)
select c.relname as vista, coalesce(array_to_string(c.reloptions, ', '), 'nessuna opzione') as opzioni
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'v' order by 1;

-- 1. vista dei Fratelli con filtro per profilo

create or replace view public.v_fratelli_completi with (security_invoker = false) as
 SELECT id,
    cognome,
    nome,
    data_nascita,
    matricola,
    indirizzo,
    cap,
    citta,
    provincia,
    professione,
    cellulare,
    email,
    stato,
    anno_iniziazione,
    data_iniziazione,
    CASE
        WHEN ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app]) THEN note_riservate
        ELSE NULL::text
    END AS note_riservate,
    creato_il,
    aggiornato_il,
    ( SELECT p.grado
           FROM passaggi_grado p
          WHERE p.fratello_id = f.id
          ORDER BY p.grado DESC
         LIMIT 1) AS grado_attuale,
    ( SELECT string_agg(c.carica, ', '::text ORDER BY c.carica) AS string_agg
           FROM cariche_storico c
          WHERE c.fratello_id = f.id AND c.anno_al IS NULL) AS carica_attuale
   FROM fratelli f
  WHERE (ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app, 'tesoriere'::ruolo_app])) OR f.id = fratello_mio();

-- 2. codice segreto per l'invio automatico delle notifiche
alter table public.push_chiavi add column if not exists segreto_cron text;
update public.push_chiavi set segreto_cron = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
 where id = 1 and segreto_cron is null;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'lemmi-notifiche';
  perform cron.schedule('lemmi-notifiche', '0 7 * * *', $c$
    select net.http_post(
      url := 'https://ykdxvxklppidopqultpw.supabase.co/functions/v1/notifiche',
      headers := jsonb_build_object('Content-Type', 'application/json',
                   'x-lemmi-segreto', coalesce((select segreto_cron from public.push_chiavi where id = 1), '')),
      body := '{"azione": "invia"}'::jsonb
    );
    delete from public.push_inviati where inviato_il < now() - interval '60 days';
  $c$);
exception when others then
  raise notice 'Pianificazione delle notifiche NON aggiornata (%): controlla che pg_cron e pg_net siano attivi in Database > Extensions.', sqlerrm;
end $$;

-- controllo: deve restituire «filtro attivo» e «codice presente» (se le notifiche sono già state attivate)
select (select case when pg_get_viewdef('public.v_fratelli_completi'::regclass) ilike '%fratello_mio()%' then 'filtro attivo' else 'filtro MANCANTE' end) as vista_fratelli,
       (select case when segreto_cron is not null then 'codice presente' else 'nessun codice (notifiche mai attivate)' end from public.push_chiavi where id = 1) as notifiche;
