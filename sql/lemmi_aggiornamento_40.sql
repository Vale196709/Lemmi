-- Lemmi - AGGIORNAMENTO 40: Fratelli passati all'Oriente Eterno e Fratelli trasferiti ad altra Officina
--
-- In anagrafica: data di uscita, Loggia di destinazione, riferimento dell'Exeat e note.
-- Regole sulle quote (scelte della Loggia):
--   - Oriente Eterno: restano dovute solo le rate con scadenza fino alla data; le successive (e gli anni dopo) si annullano.
--   - Trasferito: tutto l'anno dell'uscita resta dovuto; si annullano solo le quote degli anni successivi.
-- La capitazione dell'anno si genera anche per chi è uscito nel corso di quell'anno.
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run. Si può rieseguire senza danni.

alter table public.fratelli add column if not exists data_uscita date;
alter table public.fratelli add column if not exists loggia_destinazione text;
alter table public.fratelli add column if not exists exeat_rif text;
alter table public.fratelli add column if not exists note_uscita text;

-- Applica le regole d'uscita alle scadenze di un Fratello (si può richiamare più volte)
CREATE OR REPLACE FUNCTION public.applica_uscita_fratello(p_fratello uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  f public.fratelli%rowtype;
  motivo text;
  n integer;
begin
  select * into f from public.fratelli where id = p_fratello;
  if not found or f.data_uscita is null or f.stato::text not in ('oriente_eterno', 'trasferito') then return 0; end if;
  motivo := case f.stato::text when 'oriente_eterno' then 'Passato all''Oriente Eterno il ' else 'Trasferito ad altra Loggia il ' end
            || to_char(f.data_uscita, 'DD/MM/YYYY');
  update public.scadenze s
     set sconto = s.importo_base, motivo_eccezione = motivo
   where s.fratello_id = f.id
     and (s.anno > extract(year from f.data_uscita)::int
          or (f.stato::text = 'oriente_eterno' and s.anno = extract(year from f.data_uscita)::int
              and s.data_scadenza is not null and s.data_scadenza > f.data_uscita))
     and (s.sconto <> s.importo_base or s.motivo_eccezione is distinct from motivo);
  get diagnostics n = row_count;
  return n;
end $function$
;

-- Registra l'uscita (o la annulla con p_stato = 'attivo'): anagrafica + regole sulle quote
CREATE OR REPLACE FUNCTION public.registra_uscita_fratello(p_fratello uuid, p_stato text, p_data date,
                                                          p_loggia text DEFAULT NULL, p_exeat text DEFAULT NULL, p_note text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n_rip integer := 0;
  n_ann integer := 0;
begin
  if coalesce(public.ruolo_corrente()::text, '') not in ('amministratore', 'segretario') then
    raise exception 'Operazione riservata ad amministratore e Segretario.';
  end if;
  if p_stato not in ('oriente_eterno', 'trasferito', 'attivo') then raise exception 'Stato non valido.'; end if;
  if p_stato <> 'attivo' and p_data is null then raise exception 'Indica la data.'; end if;
  if not exists (select 1 from public.fratelli where id = p_fratello) then raise exception 'Fratello non trovato.'; end if;

  -- ripristina le quote annullate da una registrazione precedente (data o stato cambiati)
  update public.scadenze set sconto = 0, motivo_eccezione = null
   where fratello_id = p_fratello
     and (motivo_eccezione like 'Passato all''Oriente Eterno il %' or motivo_eccezione like 'Trasferito ad altra Loggia il %');
  get diagnostics n_rip = row_count;

  update public.fratelli
     set stato = p_stato::stato_fratello,
         data_uscita = case when p_stato = 'attivo' then null else p_data end,
         loggia_destinazione = case when p_stato = 'trasferito' then nullif(trim(p_loggia), '') end,
         exeat_rif = case when p_stato = 'trasferito' then nullif(trim(p_exeat), '') end,
         note_uscita = case when p_stato = 'attivo' then null else nullif(trim(p_note), '') end
   where id = p_fratello;

  n_ann := public.applica_uscita_fratello(p_fratello);
  return jsonb_build_object('quote_annullate', n_ann, 'quote_ripristinate', n_rip);
end $function$
;

revoke all on function public.applica_uscita_fratello(uuid) from public, anon;
revoke all on function public.registra_uscita_fratello(uuid, text, date, text, text, text) from public, anon;
grant execute on function public.registra_uscita_fratello(uuid, text, date, text, text, text) to authenticated;

-- Capitazione: comprende anche chi è uscito nel corso dell'anno
CREATE OR REPLACE FUNCTION public.crea_scadenze_capitazione(p_anno integer, p_modalita text DEFAULT 'unica'::text, p_stati text[] DEFAULT ARRAY['attivo'::text])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_voce public.voci_quota%rowtype;
  par public.parametri_quote%rowtype;
  rif date;
  r record;
  rt record;
  n_rate integer;
  somma numeric(10,2);
  eta integer;
  totale numeric(10,2);
  imp numeric(10,2);
  idx integer;
  nrow integer;
  creati integer := 0;
  senza_data integer := 0;
  senza_fascia integer := 0;
  altro_piano integer := 0;
begin
  if coalesce(public.ruolo_corrente()::text, '') not in ('amministratore', 'tesoriere') then
    raise exception 'Operazione riservata ad amministratore e Tesoriere.';
  end if;
  select * into v_voce from public.voci_quota where codice = 'CAPITAZIONE';
  if not found then raise exception 'Voce CAPITAZIONE non trovata.'; end if;
  select * into par from public.parametri_quote where id;
  select count(*), coalesce(sum(percentuale), 0) into n_rate, somma
    from public.piano_rate where voce_id = v_voce.id and modalita = p_modalita;
  if n_rate = 0 then raise exception 'Nessun piano rate "%" per la capitazione.', p_modalita; end if;
  if somma <> 100 then
    raise exception 'Le percentuali del piano "%" sommano % invece di 100.', p_modalita, somma;
  end if;
  rif := make_date(p_anno, par.eta_mese, par.eta_giorno);

  for r in
    select f.id, f.data_nascita from public.fratelli f
    where lower(f.stato::text) = any (select lower(x) from unnest(p_stati) as x)
       -- usciti nel corso dell'anno (Oriente Eterno, trasferiti): la quota dell'anno resta dovuta secondo le regole d'uscita
       or (f.stato::text in ('oriente_eterno', 'trasferito') and f.data_uscita >= make_date(p_anno, 1, 1))
  loop
    if r.data_nascita is null then senza_data := senza_data + 1; continue; end if;
    if exists (select 1 from public.scadenze s
               where s.voce_id = v_voce.id and s.fratello_id = r.id and s.anno = p_anno and s.rate_totali <> n_rate) then
      altro_piano := altro_piano + 1; continue;
    end if;
    eta := extract(year from age(rif, r.data_nascita))::integer;
    select importo into totale from public.fasce_eta where eta_da <= eta order by eta_da desc limit 1;
    if totale is null then senza_fascia := senza_fascia + 1; continue; end if;
    somma := 0; idx := 0;
    for rt in select * from public.piano_rate where voce_id = v_voce.id and modalita = p_modalita order by rata_n loop
      idx := idx + 1;
      if idx = n_rate then imp := totale - somma;
      else imp := round(totale * rt.percentuale / 100, 2); somma := somma + imp;
      end if;
      insert into public.scadenze (voce_id, fratello_id, anno, rata_n, rate_totali, eta_calcolata, importo_base, data_scadenza)
      values (v_voce.id, r.id, p_anno, rt.rata_n, n_rate, eta, imp, make_date(p_anno, rt.mese, rt.giorno))
      on conflict (voce_id, fratello_id, anno, rata_n) do nothing;
      get diagnostics nrow = row_count;
      creati := creati + nrow;
    end loop;
  end loop;

  -- regole d'uscita: per l'Oriente Eterno si annullano le rate successive alla data
  perform public.applica_uscita_fratello(x.id) from public.fratelli x
   where x.stato::text in ('oriente_eterno', 'trasferito') and x.data_uscita is not null;

  return jsonb_build_object('scadenze_create', creati, 'senza_data_nascita', senza_data,
                            'senza_fascia', senza_fascia, 'con_altro_piano_rate', altro_piano);
end $function$
;
