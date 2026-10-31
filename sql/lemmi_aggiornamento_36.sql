-- Lemmi - AGGIORNAMENTO 36: il Segretario legge il Conto di Loggia (sola lettura)
--
-- Serve alla Relazione annuale e al conto gestione dell'insediamento, che il Segretario prepara:
-- prima i dati economici restavano vuoti perché il Segretario non poteva leggere i movimenti del conto.
-- Il Segretario NON può inserire, modificare o eliminare movimenti, categorie o saldi: solo leggere.
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run. Si può rieseguire senza danni.

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
    m.import_id
   FROM conto_movimenti m
     LEFT JOIN categorie_movimento c ON c.id = m.categoria_id
     LEFT JOIN fratelli f ON f.id = m.fratello_id
  WHERE ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app, 'tesoriere'::ruolo_app]);

-- saldi di banca (servono al conto gestione): lettura anche per il Segretario
alter policy conto_saldi_lettura on public.conto_saldi
  using (ruolo_corrente() = ANY (ARRAY['amministratore'::ruolo_app, 'venerabile'::ruolo_app, 'segretario'::ruolo_app, 'tesoriere'::ruolo_app]));
