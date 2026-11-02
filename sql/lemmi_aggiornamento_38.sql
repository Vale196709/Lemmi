-- Lemmi - AGGIORNAMENTO 38: più conti bancari (BNL e BancoPosta) e giroconti
--
-- Ogni movimento e ogni saldo di banca indica ora a quale conto appartiene (BancoPosta o BNL).
-- I movimenti già presenti restano su BancoPosta.
-- Nuovo tipo di categoria "giroconto": i trasferimenti tra i conti della Loggia (es. i 11.700 € del
-- 24/03/2026 dalla BNL a BancoPosta) restano visibili nel Conto di Loggia ma NON contano
-- né come entrate né come uscite (Cruscotto, conto gestione, relazione annuale).
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run. Si può rieseguire senza danni.

-- 1) conto su movimenti e saldi
alter table public.conto_movimenti add column if not exists conto text not null default 'BancoPosta';
alter table public.conto_saldi     add column if not exists conto text not null default 'BancoPosta';
create index if not exists conto_movimenti_conto_idx on public.conto_movimenti (conto, data_operazione);

-- un saldo per conto e per data (prima era uno solo per data)
alter table public.conto_saldi drop constraint if exists conto_saldi_data_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conto_saldi_conto_data_key') then
    alter table public.conto_saldi add constraint conto_saldi_conto_data_key unique (conto, data);
  end if;
end $$;

-- 2) categorie di tipo "giroconto" (valgono sia in entrata sia in uscita)
alter table public.categorie_movimento drop constraint if exists categorie_movimento_tipo_check;
alter table public.categorie_movimento add constraint categorie_movimento_tipo_check
  check (tipo = any (array['entrata'::text, 'uscita'::text, 'giroconto'::text]));
insert into public.categorie_movimento (nome, tipo, note)
values ('Giroconto tra conti', 'giroconto', 'Trasferimenti tra i conti della Loggia: esclusi da entrate e uscite')
on conflict (nome) do update set tipo = 'giroconto';

-- 3) vista dei movimenti: in fondo le nuove colonne conto e giroconto
create or replace view public.v_conto_movimenti as
 SELECT m.id,
    m.data_operazione,
    m.data_valuta,
    m.descrizione,
    m.importo,
    m.saldo,
    m.riferimento_banca,
    m.origine,
    m.stato_riconciliazione,
    m.categoria_id,
    c.nome AS categoria,
    m.fratello_id,
        CASE
            WHEN f.id IS NULL THEN NULL::text
            ELSE (f.cognome || ' '::text) || f.nome
        END AS fratello,
    m.note,
    m.import_id,
    m.conto,
    COALESCE(c.tipo = 'giroconto'::text, false) AS giroconto
   FROM conto_movimenti m
     LEFT JOIN categorie_movimento c ON c.id = m.categoria_id
     LEFT JOIN fratelli f ON f.id = m.fratello_id
  WHERE ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app, 'tesoriere'::ruolo_app]);

-- 4) importazione: registra anche il conto di ogni movimento
CREATE OR REPLACE FUNCTION public.importa_movimenti(p_nome_file text, p_righe jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_imp uuid;
  tot integer;
  nuove integer;
  dal date;
  al date;
begin
  if coalesce(public.ruolo_corrente()::text, '') not in ('amministratore', 'tesoriere') then
    raise exception 'Operazione riservata ad amministratore e Tesoriere.';
  end if;
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'Nessuna riga da importare.';
  end if;
  tot := jsonb_array_length(p_righe);
  if tot > 5000 then raise exception 'Troppe righe in un solo import (massimo 5000).'; end if;

  select min((x ->> 'data_operazione')::date), max((x ->> 'data_operazione')::date)
    into dal, al from jsonb_array_elements(p_righe) as x;

  insert into public.import_estratti (nome_file, periodo_dal, periodo_al, righe_totali)
  values (coalesce(nullif(trim(p_nome_file), ''), 'estratto'), dal, al, tot)
  returning id into v_imp;

  with ins as (
    insert into public.conto_movimenti
      (import_id, data_operazione, data_valuta, descrizione, importo, saldo, riferimento_banca,
       impronta, categoria_id, stato_riconciliazione, origine, conto)
    select v_imp,
           (x ->> 'data_operazione')::date,
           nullif(x ->> 'data_valuta', '')::date,
           x ->> 'descrizione',
           (x ->> 'importo')::numeric,
           nullif(x ->> 'saldo', '')::numeric,
           nullif(x ->> 'riferimento_banca', ''),
           x ->> 'impronta',
           nullif(x ->> 'categoria_id', '')::uuid,
           case when nullif(x ->> 'categoria_id', '') is null then 'da_riconciliare' else 'riconciliato' end, 'banca',
           coalesce(nullif(trim(x ->> 'conto'), ''), 'BancoPosta')
    from jsonb_array_elements(p_righe) as x
    on conflict (impronta) do nothing
    returning 1
  )
  select count(*) into nuove from ins;

  update public.import_estratti set righe_nuove = nuove where id = v_imp;
  return jsonb_build_object('import_id', v_imp, 'righe_totali', tot, 'righe_nuove', nuove,
                            'righe_gia_presenti', tot - nuove);
end $function$
;
