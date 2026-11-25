-- Lemmi - aggiornamento 64 (script 48): tavole semplificate
-- Nuovo processo: ogni Fratello carica, modifica ed elimina le proprie tavole (niente assegnazione ne' stati);
-- tutti leggono le tavole in base al grado (regola gia' in uso: tavole_per_grado); l'amministratore modifica tutto.
-- Il Fratello scrive solo tramite le funzioni qui sotto e solo nella propria cartella dell'archivio "tavole":
-- non puo' toccare le tavole degli altri ne' collegare a una propria tavola il file di un altro.
-- Da eseguire una volta su Supabase (SQL Editor). Si puo' rieseguire senza danni.

-- 1) i lavori gia' registrati non hanno piu' stati di avanzamento: diventano tutti semplici tavole
update public.lavori set stato = 'presentato' where stato in ('assegnato', 'in_preparazione', 'consegnato');

-- 2) il Fratello scrive file solo nella propria cartella (fratelli/<suo id>/...)
drop policy if exists tavole_inserimento_fratello on storage.objects;
create policy tavole_inserimento_fratello on storage.objects as permissive for insert to authenticated
  with check (bucket_id = 'tavole'
    and public.ruolo_corrente() = 'fratello'::public.ruolo_app
    and public.fratello_mio() is not null
    and (storage.foldername(name))[1] = 'fratelli'
    and (storage.foldername(name))[2] = public.fratello_mio()::text);

-- 2b) e vede i file della propria cartella (serve anche per poterli togliere quando non sono piu usati)
drop policy if exists tavole_lettura_cartella_fratello on storage.objects;
create policy tavole_lettura_cartella_fratello on storage.objects as permissive for select to authenticated
  using (bucket_id = 'tavole'
    and public.ruolo_corrente() = 'fratello'::public.ruolo_app
    and public.fratello_mio() is not null
    and (storage.foldername(name))[1] = 'fratelli'
    and (storage.foldername(name))[2] = public.fratello_mio()::text);

-- 3) e toglie solo file della propria cartella che non servono ad altre tavole
drop policy if exists tavole_cancellazione_fratello on storage.objects;
create policy tavole_cancellazione_fratello on storage.objects as permissive for delete to authenticated
  using (bucket_id = 'tavole'
    and public.ruolo_corrente() = 'fratello'::public.ruolo_app
    and public.fratello_mio() is not null
    and (storage.foldername(name))[1] = 'fratelli'
    and (storage.foldername(name))[2] = public.fratello_mio()::text
    and not exists (select 1 from public.lavori l where l.file_path = storage.objects.name));

-- 4) nuova tavola (p_id nullo) oppure modifica di una propria: titolo, tema, grado, data, file (obbligatorio solo la prima volta)
drop function if exists public.fratello_carica_tavola(uuid, text, text, text, text, text, bigint);
create or replace function public.fratello_salva_tavola(
  p_id uuid, p_titolo text, p_tema text, p_grado text, p_data date,
  p_file_path text, p_file_nome text, p_file_tipo text, p_file_dimensione bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  fm uuid := public.fratello_mio();
  gradi text[] := array['apprendista', 'compagno', 'maestro'];
  mio text := public.grado_mio();
  l public.lavori;
  nuovo_id uuid;
begin
  if public.ruolo_corrente() is distinct from 'fratello'::public.ruolo_app or fm is null then
    raise exception 'Solo un Fratello collegato alla propria scheda può gestire le proprie tavole.';
  end if;
  if p_titolo is null or length(trim(p_titolo)) = 0 then
    raise exception 'Scrivi il titolo della tavola.';
  end if;
  if p_grado is null or array_position(gradi, p_grado) is null then
    raise exception 'Scegli il grado della tavola.';
  end if;
  if array_position(gradi, p_grado) > coalesce(array_position(gradi, mio), 1) then
    raise exception 'Non puoi indicare un grado superiore al tuo.';
  end if;
  if p_file_path is not null and (p_file_path not like 'fratelli/' || fm::text || '/%' or length(p_file_path) > 300) then
    raise exception 'Il file deve stare nella tua cartella.';
  end if;
  if p_id is null then
    if p_file_path is null or p_file_nome is null then
      raise exception 'Scegli il file della tavola.';
    end if;
    insert into public.lavori (titolo, tema, tipo, fratello_id, stato, grado_autore, grado_tornata, data_presentazione, data_assegnazione,
                               file_path, file_nome, file_tipo, file_dimensione)
    values (left(trim(p_titolo), 200), nullif(left(trim(coalesce(p_tema, '')), 300), ''), 'tavola', fm, 'presentato', p_grado, p_grado,
            coalesce(p_data, current_date), current_date, p_file_path, left(p_file_nome, 200), p_file_tipo, p_file_dimensione)
    returning id into nuovo_id;
    return jsonb_build_object('id', nuovo_id, 'vecchio_file', null);
  end if;
  select * into l from public.lavori where id = p_id for update;
  if not found or l.fratello_id is distinct from fm then
    raise exception 'Questa tavola non risulta tua.';
  end if;
  update public.lavori
     set titolo = left(trim(p_titolo), 200), tema = nullif(left(trim(coalesce(p_tema, '')), 300), ''),
         grado_autore = p_grado, grado_tornata = p_grado, data_presentazione = coalesce(p_data, l.data_presentazione, current_date),
         stato = 'presentato', updated_at = now(),
         file_path = coalesce(p_file_path, l.file_path), file_nome = case when p_file_path is null then l.file_nome else left(p_file_nome, 200) end,
         file_tipo = case when p_file_path is null then l.file_tipo else p_file_tipo end,
         file_dimensione = case when p_file_path is null then l.file_dimensione else p_file_dimensione end
   where id = p_id;
  return jsonb_build_object('id', p_id, 'vecchio_file', case when p_file_path is not null and l.file_path is distinct from p_file_path then l.file_path else null end);
end;
$function$;
revoke all on function public.fratello_salva_tavola(uuid, text, text, text, date, text, text, text, bigint) from public, anon;
grant execute on function public.fratello_salva_tavola(uuid, text, text, text, date, text, text, text, bigint) to authenticated;

-- 5) elimina una propria tavola; restituisce il percorso del file, che l'app toglie poi dall'archivio
create or replace function public.fratello_elimina_tavola(p_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  fm uuid := public.fratello_mio();
  l public.lavori;
begin
  if public.ruolo_corrente() is distinct from 'fratello'::public.ruolo_app or fm is null then
    raise exception 'Solo un Fratello collegato alla propria scheda può eliminare le proprie tavole.';
  end if;
  select * into l from public.lavori where id = p_id for update;
  if not found or l.fratello_id is distinct from fm then
    raise exception 'Questa tavola non risulta tua.';
  end if;
  delete from public.lavori where id = p_id;
  return l.file_path;
end;
$function$;
revoke all on function public.fratello_elimina_tavola(uuid) from public, anon;
grant execute on function public.fratello_elimina_tavola(uuid) to authenticated;
