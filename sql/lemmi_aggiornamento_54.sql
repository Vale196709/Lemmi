-- Lemmi - aggiornamento 54 (v0.69.0): un Fratello può caricare la tavola di un altro Fratello
-- (anche in sonno, trasferito o passato all'Oriente Eterno) o di un autore non presente in anagrafica.
-- Regole scelte:
--  - tutti i Fratelli possono farlo; il grado della tavola resta al massimo il proprio, come per le proprie tavole;
--  - la tavola è visibile subito (ai Fratelli in base al grado, come le altre);
--  - la modificano o la eliminano chi l'ha caricata, Segretario e amministratore (l'autore no, se non l'ha caricata lui).
-- Il file resta nella cartella di chi lo carica; la tavola risulta dell'autore (fascicolo, storia, elenchi) e
-- registra chi l'ha caricata (colonna caricata_da).
-- Da eseguire una volta su Supabase (SQL Editor). Si può rieseguire senza danni.

-- 1) chi ha caricato la tavola per conto dell'autore (vuoto = l'autore stesso o la segreteria)
alter table public.lavori add column if not exists caricata_da uuid;
do $t$ begin
  alter table public.lavori add constraint lavori_caricata_da_fkey foreign key (caricata_da) references public.fratelli(id) on delete set null;
exception when duplicate_object then null; end $t$;

-- chi l'ha caricata la vede anche nell'elenco delle proprie righe
drop policy if exists fratello_lavori_caricati on public.lavori;
create policy fratello_lavori_caricati on public.lavori as permissive for select to authenticated
  using (caricata_da is not null and caricata_da = public.fratello_mio());

-- 2) elenco degli autori per il modulo del Fratello: solo nome, cognome e stato (nessun altro dato dell'anagrafica)
create or replace function public.elenco_autori_tavole()
 returns table(id uuid, cognome text, nome text, stato text)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select f.id, f.cognome, f.nome, f.stato::text
    from public.fratelli f
   where public.ruolo_corrente() is not null
   order by f.cognome, f.nome
$function$;
revoke all on function public.elenco_autori_tavole() from public, anon;
grant execute on function public.elenco_autori_tavole() to authenticated;

-- 3) tavole leggibili dal Fratello: in più chi l'ha caricata, se è «gestibile» da lui e l'autore (per il modulo)
drop function if exists public.tavole_per_grado();
create function public.tavole_per_grado()
 returns table(id uuid, titolo text, tema text, tipo text, autore text, grado_tornata text, stato text, data_presentazione date,
               data_consegna_prevista date, file_path text, file_nome text, mia boolean, data_discussione date,
               autore_id uuid, autore_esterno text, caricata_da_nome text, gestibile boolean)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select l.id, l.titolo, l.tema, l.tipo,
         coalesce(nullif(trim(coalesce(f.cognome, '') || ' ' || coalesce(f.nome, '')), ''), l.autore_esterno, '—') as autore,
         coalesce(l.grado_tornata, l.grado_autore) as grado_tornata, l.stato,
         l.data_presentazione, l.data_consegna_prevista, l.file_path, l.file_nome,
         coalesce(l.fratello_id = public.fratello_mio(), false) as mia, l.data_discussione,
         l.fratello_id as autore_id, l.autore_esterno,
         nullif(trim(coalesce(c.cognome, '') || ' ' || coalesce(c.nome, '')), '') as caricata_da_nome,
         (l.caricata_da = public.fratello_mio() or (l.caricata_da is null and l.fratello_id = public.fratello_mio())) as gestibile
  from public.lavori l
  left join public.fratelli f on f.id = l.fratello_id
  left join public.fratelli c on c.id = l.caricata_da
  where public.fratello_mio() is not null
    and ( l.fratello_id = public.fratello_mio()
          or l.caricata_da = public.fratello_mio()
          or public.grado_mio() = 'maestro'
          or (public.grado_mio() = 'compagno' and coalesce(l.grado_tornata, l.grado_autore) in ('apprendista', 'compagno')) )
  order by coalesce(l.data_presentazione, l.data_consegna_prevista, l.data_assegnazione) desc nulls last
$function$;
revoke all on function public.tavole_per_grado() from public, anon;
grant execute on function public.tavole_per_grado() to authenticated;

-- 4) salvataggio: come prima, più l'autore (un Fratello dell'anagrafica, oppure un nome scritto a mano)
drop function if exists public.fratello_salva_tavola(uuid, text, text, text, date, date, text, text, text, bigint);
drop function if exists public.fratello_salva_tavola(uuid, text, text, text, date, date, text, text, text, bigint, uuid, text);
create function public.fratello_salva_tavola(
  p_id uuid, p_titolo text, p_tema text, p_grado text, p_data date, p_discussa date,
  p_file_path text, p_file_nome text, p_file_tipo text, p_file_dimensione bigint,
  p_autore uuid default null, p_autore_esterno text default null)
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
  v_aut uuid;
  v_est text := nullif(left(trim(coalesce(p_autore_esterno, '')), 120), '');
  v_car uuid;
begin
  if public.ruolo_corrente() is distinct from 'fratello'::public.ruolo_app or fm is null then
    raise exception 'Solo un Fratello collegato alla propria scheda può gestire le tavole.';
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
  -- autore: nome scritto a mano, un Fratello dell'anagrafica, oppure (se non indicato) chi carica
  if v_est is not null then
    v_aut := null;
  else
    v_aut := coalesce(p_autore, fm);
    if not exists (select 1 from public.fratelli where id = v_aut) then
      raise exception 'Autore non trovato in anagrafica.';
    end if;
  end if;

  if p_id is null then
    if p_file_path is null or p_file_nome is null then
      raise exception 'Scegli il file della tavola.';
    end if;
    v_car := case when v_aut is not distinct from fm then null else fm end;
    insert into public.lavori (titolo, tema, tipo, fratello_id, autore_esterno, caricata_da, stato, grado_autore, grado_tornata, data_presentazione,
                               data_discussione, data_assegnazione, file_path, file_nome, file_tipo, file_dimensione)
    values (left(trim(p_titolo), 200), nullif(left(trim(coalesce(p_tema, '')), 300), ''), 'tavola', v_aut, v_est, v_car, 'presentato', p_grado, p_grado,
            coalesce(p_data, current_date), p_discussa, current_date, p_file_path, left(p_file_nome, 200), p_file_tipo, p_file_dimensione)
    returning id into nuovo_id;
    return jsonb_build_object('id', nuovo_id, 'vecchio_file', null);
  end if;

  select * into l from public.lavori where id = p_id for update;
  if not found or not (l.caricata_da = fm or (l.caricata_da is null and l.fratello_id = fm)) then
    raise exception 'Questa tavola non l''hai caricata tu: chiedi al Segretario di modificarla.';
  end if;
  -- se cambia l'autore, chi modifica ne diventa il responsabile; se resta lo stesso, si conserva chi l'aveva caricata
  v_car := case when v_aut is not distinct from fm then null
                when v_aut is not distinct from l.fratello_id and v_est is not distinct from l.autore_esterno then l.caricata_da
                else fm end;
  update public.lavori
     set titolo = left(trim(p_titolo), 200), tema = nullif(left(trim(coalesce(p_tema, '')), 300), ''),
         fratello_id = v_aut, autore_esterno = v_est, caricata_da = v_car,
         grado_autore = p_grado, grado_tornata = p_grado, data_presentazione = coalesce(p_data, l.data_presentazione, current_date), data_discussione = p_discussa,
         stato = 'presentato', updated_at = now(),
         file_path = coalesce(p_file_path, l.file_path), file_nome = case when p_file_path is null then l.file_nome else left(p_file_nome, 200) end,
         file_tipo = case when p_file_path is null then l.file_tipo else p_file_tipo end,
         file_dimensione = case when p_file_path is null then l.file_dimensione else p_file_dimensione end
   where id = p_id;
  return jsonb_build_object('id', p_id, 'vecchio_file', case when p_file_path is not null and l.file_path is distinct from p_file_path then l.file_path else null end);
end;
$function$;
revoke all on function public.fratello_salva_tavola(uuid, text, text, text, date, date, text, text, text, bigint, uuid, text) from public, anon;
grant execute on function public.fratello_salva_tavola(uuid, text, text, text, date, date, text, text, text, bigint, uuid, text) to authenticated;

-- 5) eliminazione: chi l'ha caricata (o l'autore, se l'ha caricata lui)
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
    raise exception 'Solo un Fratello collegato alla propria scheda può eliminare le tavole.';
  end if;
  select * into l from public.lavori where id = p_id for update;
  if not found or not (l.caricata_da = fm or (l.caricata_da is null and l.fratello_id = fm)) then
    raise exception 'Questa tavola non l''hai caricata tu: chiedi al Segretario di eliminarla.';
  end if;
  delete from public.lavori where id = p_id;
  return l.file_path;
end;
$function$;
revoke all on function public.fratello_elimina_tavola(uuid) from public, anon;
grant execute on function public.fratello_elimina_tavola(uuid) to authenticated;

-- controllo: deve restituire «pronto»
select case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'lavori' and column_name = 'caricata_da')
             and to_regprocedure('public.elenco_autori_tavole()') is not null then 'pronto' else 'ERRORE' end as tavole_per_conto_di_altri;
