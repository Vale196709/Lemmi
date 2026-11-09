-- Ambiente minimo che imita le parti di Supabase usate dallo schema: ruoli, utenti di accesso, archivi file, pianificazioni.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, last_sign_in_at timestamptz);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema if not exists storage;
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
alter table storage.objects enable row level security;
create schema if not exists cron;
create table if not exists cron.job (jobname text, schedule text, active boolean);
