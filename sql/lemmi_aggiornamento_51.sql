-- Lemmi - aggiornamento 51 (v0.67.0): Tronco della Vedova registrato dalla modalità «Tornata»
-- Da eseguire una volta su Supabase (SQL Editor). Si può rieseguire senza danni.
--
-- registra_tronco(tornata, importo): scrive (o corregge) in Tesoreria l'incasso del Tronco della Vedova di una tornata,
-- come versamento collettivo in contanti sulla voce del Tronco. Un solo versamento per tornata: richiamarla corregge
-- l'importo; con importo 0 il versamento si toglie. La possono usare amministratore, Segretario e Tesoriere
-- (il Segretario non scrive direttamente nei versamenti: passa solo da qui).

create or replace function public.registra_tronco(p_tornata uuid, p_importo numeric, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ruolo text := public.ruolo_corrente()::text;
  v_data date;
  v_voce uuid;
  v_rif text := 'tornata:' || p_tornata::text;
  v_id uuid;
begin
  if v_ruolo is null or v_ruolo not in ('amministratore', 'segretario', 'tesoriere') then
    raise exception 'Solo amministratore, Segretario o Tesoriere possono registrare il Tronco della Vedova.';
  end if;
  if p_importo is null or p_importo < 0 then
    raise exception 'Importo non valido.';
  end if;
  select data into v_data from public.tornate where id = p_tornata;
  if v_data is null then
    raise exception 'Tornata non trovata.';
  end if;
  select q.id into v_voce from public.voci_quota q
   where not q.personale and (q.codice ilike '%tronco%' or q.nome ilike '%tronco%' or q.nome ilike '%vedova%')
   order by q.attiva desc, q.creato_il limit 1;
  if v_voce is null then
    raise exception 'In Tesoreria manca la voce del Tronco della Vedova (voce non personale con «Tronco» nel nome).';
  end if;

  select id into v_id from public.versamenti where riferimento = v_rif and voce_id = v_voce limit 1;
  if p_importo = 0 then
    if v_id is not null then delete from public.versamenti where id = v_id; end if;
    return null;
  end if;
  if v_id is null then
    insert into public.versamenti (data_versamento, voce_id, fratello_id, anno, importo, modalita, riferimento, note)
    values (v_data, v_voce, null, extract(year from v_data)::int, round(p_importo, 2), 'contanti', v_rif,
            coalesce(nullif(trim(p_note), ''), 'Tronco della Vedova della tornata del ' || to_char(v_data, 'DD/MM/YYYY')))
    returning id into v_id;
  else
    update public.versamenti set importo = round(p_importo, 2), data_versamento = v_data, anno = extract(year from v_data)::int,
           note = coalesce(nullif(trim(p_note), ''), note), aggiornato_il = now()
     where id = v_id;
  end if;
  return v_id;
end;
$function$;

revoke all on function public.registra_tronco(uuid, numeric, text) from public, anon;
grant execute on function public.registra_tronco(uuid, numeric, text) to authenticated;

-- controllo: deve restituire una riga con la voce del Tronco trovata
select coalesce((select nome from public.voci_quota
                  where not personale and (codice ilike '%tronco%' or nome ilike '%tronco%' or nome ilike '%vedova%') limit 1),
                'ATTENZIONE: voce del Tronco non trovata in Tesoreria') as voce_tronco;
