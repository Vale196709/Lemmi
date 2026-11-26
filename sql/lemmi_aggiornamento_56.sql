-- Lemmi - aggiornamento 56 (v0.71.0): registro delle operazioni sugli utenti del sistema
-- L'app annota nel Registro attività ogni operazione dell'amministratore sugli utenti (creazione, cambio di profilo,
-- collegamento al Fratello, disattivazione, riattivazione, reimpostazione della password, eliminazione).
-- La password non viene mai registrata. Usa la tabella registro_attivita già esistente (voce «utenti_sistema»).
-- Da eseguire una volta su Supabase (SQL Editor). Si può rieseguire senza danni.

create or replace function public.registra_operazione_utente(p_user uuid, p_azione text, p_dettaglio jsonb default '{}'::jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_azioni text[] := array['creazione', 'profilo', 'collegamento', 'disattivazione', 'riattivazione', 'password', 'eliminazione', 'avviso'];
  v_email_admin text;
  v_email text;
  v_det jsonb := coalesce(p_dettaglio, '{}'::jsonb) - 'password';   -- la password non si registra mai
begin
  if not public.lemmi_e_admin() then
    raise exception 'Solo l''amministratore può registrare operazioni sugli utenti.';
  end if;
  if p_azione is null or array_position(v_azioni, p_azione) is null then
    raise exception 'Operazione non riconosciuta.';
  end if;
  select email::text into v_email_admin from auth.users where id = auth.uid();
  select email::text into v_email from auth.users where id = p_user;
  insert into public.registro_attivita (utente_id, utente_email, tabella, operazione, riga_id, prima, dopo)
  values (auth.uid(), v_email_admin, 'utenti_sistema',
          case p_azione when 'creazione' then 'inserimento' when 'eliminazione' then 'eliminazione' else 'modifica' end,
          p_user::text, null,
          jsonb_build_object('azione', p_azione, 'utente', coalesce(v_det->>'email', v_email)) || v_det);
end;
$function$;
revoke all on function public.registra_operazione_utente(uuid, text, jsonb) from public, anon;
grant execute on function public.registra_operazione_utente(uuid, text, jsonb) to authenticated;

-- controllo: deve restituire «registro pronto»
select case when to_regprocedure('public.registra_operazione_utente(uuid,text,jsonb)') is not null then 'registro pronto' else 'ERRORE' end as operazioni_utenti;
