-- Imitació mínima de Supabase per provar schema.sql en un Postgres local.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
-- Supabase dona per defecte permisos de taula a aquests rols (RLS fa la feina).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
-- Imitació de pg_cron i pg_net (a Supabase són extensions reals).
create schema cron;
create table cron.job (jobname text primary key, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job values (job_name, schedule, command) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command;
  select 1::bigint $$;
create schema net;
create table net.calls (url text, headers jsonb, at timestamptz default now());
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$ insert into net.calls (url, headers) values (url, headers); select 1::bigint $$;
