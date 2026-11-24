-- Lemmi - aggiornamento 58 (script 43): in "Utenti del sistema" si vede se un utente è attivo o disattivato.
-- Da eseguire una volta su Supabase (SQL Editor). Aggiunge la colonna "disattivato" alla funzione esistente.
drop function if exists public.info_utenti_sistema();

create or replace function public.info_utenti_sistema()
 returns table(user_id text, email text, nome text, cognome text, grado text, ruolo text, nome_visualizzato text,
               fratello_id text, collegamento text, ultimo_accesso timestamp with time zone, disattivato boolean)
 language sql
 stable security definer
 set search_path to 'public', 'auth'
as $function$
  select p.user_id::text, u.email::text, f.nome::text, f.cognome::text, v.grado_attuale::text, p.ruolo::text,
         p.nome_visualizzato::text, f.id::text,
         case when p.fratello_id is not null then 'manuale' when f.id is not null then 'e-mail' else null end,
         u.last_sign_in_at,
         (u.banned_until is not null and u.banned_until > now())
    from public.profili p
    join auth.users u on u.id = p.user_id
    left join public.fratelli f on f.id = coalesce(p.fratello_id,
         (select f2.id from public.fratelli f2 where u.email is not null and lower(f2.email) = lower(u.email) limit 1))
    left join public.v_fratelli_completi v on v.id = f.id
   where public.lemmi_ruolo_in('amministratore')
   order by case p.ruolo::text when 'amministratore' then 0 when 'venerabile' then 1 when 'segretario' then 2 when 'tesoriere' then 3 else 4 end,
            f.cognome, f.nome;
$function$;

grant execute on function public.info_utenti_sistema() to authenticated;
