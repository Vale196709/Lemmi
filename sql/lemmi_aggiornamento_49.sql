-- Lemmi - aggiornamento 49 (v0.64.0): seconda e-mail nell'anagrafica dei Fratelli
-- Da eseguire una volta su Supabase (SQL Editor). Si può rieseguire senza danni.
-- Le regole di accesso (RLS) della tabella fratelli valgono anche per la nuova colonna.

alter table public.fratelli add column if not exists email_2 text;

comment on column public.fratelli.email_2 is 'Seconda e-mail del Fratello (facoltativa)';

-- controllo: deve restituire una riga con email_2
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'fratelli' and column_name = 'email_2';
