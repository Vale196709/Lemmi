-- Lemmi - aggiornamento 59 (script 46): reimposta la password di un utente (la nuova password la sceglie l'app e la mostra all'amministratore).
-- Da eseguire una volta su Supabase (SQL Editor). Solo l'amministratore puo' usarla, mai su se' stesso.
create or replace function public.reimposta_password_utente(p_user uuid, p_password text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'auth', 'extensions'
as $function$
begin
  if not public.lemmi_ruolo_in('amministratore') then
    raise exception 'Solo l''amministratore può reimpostare le password.';
  end if;
  if p_user = auth.uid() then
    raise exception 'La tua password si cambia dalla pagina Loggia.';
  end if;
  if p_password is null or length(p_password) < 8 then
    raise exception 'La password deve avere almeno 8 caratteri.';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'Utente non trovato.';
  end if;
  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
   where id = p_user;
  delete from auth.sessions where user_id = p_user;   -- chiude le sessioni aperte con la vecchia password
end;
$function$;

grant execute on function public.reimposta_password_utente(uuid, text) to authenticated;
