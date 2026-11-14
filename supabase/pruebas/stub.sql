-- Simula lo mínimo de Supabase para probar instalar.sql en un PostgreSQL local.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object('sub', auth.uid(), 'email', (select email from auth.users where id = auth.uid())) $$;
create function auth.email() returns text language sql stable as $$ select auth.jwt() ->> 'email' $$;
grant execute on function auth.jwt(), auth.email() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Desde G32 instalar.sql necesita pgcrypto, storage y cron (copiado de SaaS/pruebas/stub.sql, sin grants por defecto).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
-- storage
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint,
  allowed_mime_types text[], created_at timestamptz default now(), owner uuid);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets, name text,
  owner uuid, owner_id text, metadata jsonb default '{}'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(), path_tokens text[] generated always as (string_to_array(name, '/')) stored, unique (bucket_id, name));
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant usage on schema storage to authenticated, anon, service_role;
grant select, insert, update, delete on storage.objects, storage.buckets to authenticated, anon, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create function storage.filename(name text) returns text language sql immutable as
  $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
create function storage.extension(name text) returns text language sql immutable as
  $$ select reverse(split_part(reverse(name), '.', 1)) $$;
-- cron (pg_cron)
create schema cron;
grant usage on schema cron to postgres;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true, username text default current_user);
create table cron.job_run_details (runid bigserial, jobid bigint, status text, return_message text, start_time timestamptz, end_time timestamptz);
create function cron.schedule(n text, s text, c text) returns bigint language sql as
  $$ insert into cron.job (jobname, schedule, command) values (n, s, c)
     on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
create function cron.schedule(s text, c text) returns bigint language sql as
  $$ insert into cron.job (schedule, command) values (s, c) returning jobid $$;
create function cron.unschedule(id bigint) returns boolean language sql as $$ delete from cron.job where jobid = id; select true $$;
create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname = n; select true $$;
