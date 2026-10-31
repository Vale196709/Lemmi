-- Lemmi - AGGIORNAMENTO 35: Libro Matricola, area Fratelli, notifiche sul telefono
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run. Si può rieseguire senza danni.
-- Cosa fa:
--   1. anagrafica dei Fratelli: luogo e provincia di nascita e codice fiscale (servono al Libro Matricola e alle
--      autocertificazioni delle elezioni; prima mancavano nella tabella e restavano in bianco)
--   2. nuovo profilo "fratello": ogni Fratello con un accesso vede SOLO i propri dati (scheda, storia, tavole, quote)
--      e il calendario delle tornate. Nessun accesso ai dati degli altri Fratelli, alla tesoreria o alla segreteria.
--   3. notifiche sul telefono: iscrizioni dei dispositivi e invio automatico ogni mattina alle 8 (ora italiana)

-- ============ 1. anagrafica ============
alter table public.fratelli add column if not exists luogo_nascita text;
alter table public.fratelli add column if not exists provincia_nascita character(2);
alter table public.fratelli add column if not exists codice_fiscale text;

-- ============ 2. profilo "fratello" ============
-- nuovo valore dell'elenco dei profili (nel resto dello script si confronta come testo, così funziona subito)
alter type public.ruolo_app add value if not exists 'fratello';

-- il Fratello collegato all'utente che ha fatto l'accesso, solo se ha il profilo "fratello"
create or replace function public.fratello_mio() returns uuid
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  -- collegamento salvato nel profilo oppure, se manca, il Fratello con la stessa e-mail dell'utente (solo se è uno)
  select coalesce(p.fratello_id,
           (select min(f.id::text)::uuid from public.fratelli f join auth.users u on lower(u.email) = lower(f.email)
             where u.id = auth.uid() having count(*) = 1))
  from public.profili p where p.user_id = auth.uid() and p.ruolo::text = 'fratello'
$$;
revoke all on function public.fratello_mio() from public, anon;
grant execute on function public.fratello_mio() to authenticated;

-- regole di lettura dei propri dati (si aggiungono a quelle esistenti, che restano invariate)
drop policy if exists fratello_propria_scheda on public.fratelli;
create policy fratello_propria_scheda on public.fratelli for select to authenticated using (id = public.fratello_mio());
drop policy if exists fratello_propri_passaggi on public.passaggi_grado;
create policy fratello_propri_passaggi on public.passaggi_grado for select to authenticated using (fratello_id = public.fratello_mio());
drop policy if exists fratello_proprie_cariche on public.cariche_storico;
create policy fratello_proprie_cariche on public.cariche_storico for select to authenticated using (fratello_id = public.fratello_mio());
drop policy if exists fratello_propri_lavori on public.lavori;
create policy fratello_propri_lavori on public.lavori for select to authenticated using (fratello_id = public.fratello_mio());

-- le proprie quote (dovuto, versato, residuo, stato), calcolate come nella Tesoreria
create or replace function public.mie_quote()
returns table (id uuid, anno integer, voce text, rata_n integer, rate_totali integer, importo_dovuto numeric, data_scadenza date,
               versato numeric, residuo numeric, stato text)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select s.id, s.anno, q.nome, s.rata_n, s.rate_totali, s.importo_dovuto, s.data_scadenza,
         coalesce(p.versato, 0)::numeric(10,2),
         (s.importo_dovuto - coalesce(p.versato, 0))::numeric(10,2),
         case when s.importo_dovuto = 0 then 'Esente'
              when s.importo_dovuto - coalesce(p.versato, 0) <= 0 then 'Pagato'
              when s.data_scadenza is not null and s.data_scadenza < current_date then 'Scaduto'
              when coalesce(p.versato, 0) > 0 then 'Parziale'
              else 'Da pagare' end
  from public.scadenze s
  join public.voci_quota q on q.id = s.voce_id
  left join (select v.scadenza_id, sum(v.importo) as versato from public.versamenti v where v.scadenza_id is not null group by v.scadenza_id) p
    on p.scadenza_id = s.id
  where public.fratello_mio() is not null and s.fratello_id = public.fratello_mio()
  order by s.anno desc, s.data_scadenza nulls last
$$;
revoke all on function public.mie_quote() from public, anon;
grant execute on function public.mie_quote() to authenticated;

-- l'amministratore può assegnare anche il profilo "fratello"
create or replace function public.imposta_ruolo_utente(p_user uuid, p_ruolo text)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_righe int;
begin
  if not public.lemmi_e_admin() then
    raise exception 'Solo l''amministratore può cambiare i profili';
  end if;
  if p_ruolo not in ('amministratore', 'venerabile', 'segretario', 'tesoriere', 'fratello') then
    raise exception 'Profilo non valido: %', p_ruolo;
  end if;
  if p_user = auth.uid() then
    raise exception 'Il tuo profilo non si cambia da qui (per non restare senza amministratore)';
  end if;
  execute format('update public.profili set ruolo = %L where user_id = $1', p_ruolo) using p_user;
  get diagnostics v_righe = row_count;
  if v_righe = 0 then
    raise exception 'Utente non trovato tra i profili';
  end if;
end $$;
revoke all on function public.imposta_ruolo_utente(uuid, text) from public, anon;
grant execute on function public.imposta_ruolo_utente(uuid, text) to authenticated;

-- ============ 3. notifiche sul telefono ============
create table if not exists public.push_iscrizioni (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chiavi jsonb not null,
  dispositivo text,
  creato_il timestamptz not null default now()
);
alter table public.push_iscrizioni enable row level security;
drop policy if exists push_proprie_lettura on public.push_iscrizioni;
create policy push_proprie_lettura on public.push_iscrizioni for select to authenticated using (user_id = auth.uid());
drop policy if exists push_proprie_inserimento on public.push_iscrizioni;
create policy push_proprie_inserimento on public.push_iscrizioni for insert to authenticated with check (user_id = auth.uid());
drop policy if exists push_proprie_cancellazione on public.push_iscrizioni;
create policy push_proprie_cancellazione on public.push_iscrizioni for delete to authenticated using (user_id = auth.uid());
revoke all on public.push_iscrizioni from anon;

-- chiavi del servizio di notifica e registro degli avvisi già inviati: solo la funzione su Supabase li legge
create table if not exists public.push_chiavi (
  id integer primary key default 1 check (id = 1),
  pubblica text not null,
  privata text not null,
  creato_il timestamptz not null default now()
);
alter table public.push_chiavi enable row level security;
revoke all on public.push_chiavi from anon, authenticated;

create table if not exists public.push_inviati (
  chiave text primary key,
  inviato_il timestamptz not null default now()
);
alter table public.push_inviati enable row level security;
revoke all on public.push_inviati from anon, authenticated;

-- invio automatico ogni mattina: alle 7 UTC (8 d'inverno, 9 d'estate in Italia)
do $$
begin
  create extension if not exists pg_net;
  perform cron.unschedule(jobid) from cron.job where jobname = 'lemmi-notifiche';
  perform cron.schedule('lemmi-notifiche', '0 7 * * *', $c$
    select net.http_post(
      url := 'https://ykdxvxklppidopqultpw.supabase.co/functions/v1/notifiche',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"azione": "invia"}'::jsonb
    );
    delete from public.push_inviati where inviato_il < now() - interval '60 days';
  $c$);
exception when others then
  raise notice 'Pianificazione delle notifiche NON attivata (%): controlla che pg_cron e pg_net siano attivi in Database > Extensions.', sqlerrm;
end $$;
