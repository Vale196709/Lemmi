-- Lemmi - AGGIORNAMENTO 39: collegamento automatico dei bonifici dei Fratelli
--
-- Nuova funzione riconcilia_ripartito: registra il versamento di un bonifico ripartendolo su più scadenze
-- (es. 600 € = rata 1 da 300 € + rata 2 da 300 € della capitazione). Ciò che avanza resta come acconto
-- non collegato a una scadenza. Usata da «Collega in automatico» nel Conto di Loggia.
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run. Si può rieseguire senza danni.

CREATE OR REPLACE FUNCTION public.riconcilia_ripartito(p_movimento uuid, p_voce uuid, p_fratello uuid, p_anno integer,
                                                      p_scadenze uuid[] DEFAULT '{}'::uuid[], p_note text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m public.conto_movimenti%rowtype;
  resto numeric(12,2);
  sc uuid;
  res numeric(12,2);
  quota numeric(12,2);
  n integer := 0;
begin
  if coalesce(public.ruolo_corrente()::text, '') not in ('amministratore', 'tesoriere') then
    raise exception 'Operazione riservata ad amministratore e Tesoriere.';
  end if;
  select * into m from public.conto_movimenti where id = p_movimento for update;
  if not found then raise exception 'Movimento non trovato.'; end if;
  if m.importo <= 0 then raise exception 'Solo le entrate si collegano a un versamento.'; end if;
  if m.stato_riconciliazione = 'riconciliato' then raise exception 'Il movimento è già riconciliato.'; end if;
  if p_fratello is null then raise exception 'Manca il Fratello.'; end if;

  resto := m.importo;
  foreach sc in array coalesce(p_scadenze, '{}'::uuid[]) loop
    exit when resto <= 0;
    select s.importo_dovuto - coalesce((select sum(v.importo) from public.versamenti v where v.scadenza_id = s.id), 0)
      into res from public.scadenze s
     where s.id = sc and s.fratello_id = p_fratello and s.voce_id = p_voce;
    continue when res is null or res <= 0;
    quota := least(resto, res);
    insert into public.versamenti (data_versamento, voce_id, fratello_id, anno, importo, scadenza_id, modalita, riferimento, movimento_id, note)
    values (m.data_operazione, p_voce, p_fratello, p_anno, quota, sc, 'bonifico', m.riferimento_banca, m.id, p_note);
    resto := resto - quota; n := n + 1;
  end loop;
  if resto > 0 then   -- eccedenza (o nessuna scadenza aperta): acconto non collegato
    insert into public.versamenti (data_versamento, voce_id, fratello_id, anno, importo, scadenza_id, modalita, riferimento, movimento_id, note)
    values (m.data_operazione, p_voce, p_fratello, p_anno, resto, null, 'bonifico', m.riferimento_banca, m.id, p_note);
    n := n + 1;
  end if;

  update public.conto_movimenti
     set stato_riconciliazione = 'riconciliato',
         fratello_id = p_fratello,
         categoria_id = coalesce(categoria_id, (select id from public.categorie_movimento where nome = 'Versamenti dei Fratelli'))
   where id = m.id;
  return n;
end $function$
;

revoke all on function public.riconcilia_ripartito(uuid, uuid, uuid, integer, uuid[], text) from public, anon;
grant execute on function public.riconcilia_ripartito(uuid, uuid, uuid, integer, uuid[], text) to authenticated;
