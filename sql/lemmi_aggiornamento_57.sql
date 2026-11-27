-- Lemmi - aggiornamento 57 (v0.74.0): «Novità» nel Cruscotto
-- Ultimi documenti pubblicati (tavole con file e Biblioteca), con le STESSE regole di lettura già in uso:
--  - tavole: amministratore, Venerabile e Segretario vedono tutte; gli altri come in «tavole_per_grado»
--    (le proprie, quelle caricate da sé, Maestro tutte, Compagno quelle di Compagno e Apprendista);
--  - Biblioteca: come la regola «biblioteca_lettura» (ufficio per amministratore, Venerabile, Segretario
--    e per chi l'ha caricato; «fratelli» per tutti gli utenti dell'app).
-- La data di pubblicazione di una tavola è quella di caricamento del file nell'archivio.
-- Da eseguire una volta in Supabase > SQL Editor. Si può rieseguire senza danni.

create or replace function public.novita_documenti(p_giorni integer default 30, p_limite integer default 3)
returns table(genere text, id uuid, titolo text, dettaglio text, grado text, categoria text, quando timestamptz)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  with tav as (
    select 'tavola'::text as genere, l.id, l.titolo,
           coalesce(nullif(trim(coalesce(f.cognome, '') || ' ' || coalesce(f.nome, '')), ''), l.autore_esterno) as dettaglio,
           coalesce(l.grado_tornata, l.grado_autore) as grado, null::text as categoria,
           coalesce(o.created_at, l.created_at) as quando
    from public.lavori l
    left join public.fratelli f on f.id = l.fratello_id
    left join storage.objects o on o.bucket_id = 'tavole' and o.name = l.file_path
    where l.file_path is not null
      and ( public.ruolo_corrente() in ('amministratore', 'venerabile', 'segretario')
            or ( public.fratello_mio() is not null
                 and ( l.fratello_id = public.fratello_mio()
                       or l.caricata_da = public.fratello_mio()
                       or public.grado_mio() = 'maestro'
                       or (public.grado_mio() = 'compagno' and coalesce(l.grado_tornata, l.grado_autore) in ('apprendista', 'compagno')) ) ) )
  ), bib as (
    select 'biblioteca'::text, b.id, b.titolo, b.autore, null::text, b.categoria, b.creato_il
    from public.biblioteca b
    where public.lemmi_ruolo_in(variadic array['amministratore', 'venerabile', 'segretario'])
       or b.creato_da = auth.uid()
       or (public.ruolo_corrente() is not null and b.visibilita = 'fratelli')
  )
  select * from (select * from tav union all select * from bib) x
  where auth.uid() is not null
    and x.quando >= now() - make_interval(days => greatest(coalesce(p_giorni, 30), 1))
  order by x.quando desc
  limit least(greatest(coalesce(p_limite, 3), 1), 20)
$function$;

revoke all on function public.novita_documenti(integer, integer) from public, anon;
grant execute on function public.novita_documenti(integer, integer) to authenticated;
