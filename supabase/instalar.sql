-- =====================================================================
--  Barbería · CodeFix — Servidor (Supabase)
--  Pega este archivo (o instalar-corto.sql) en Supabase → SQL Editor → Run.
--  Se puede volver a ejecutar sin perder datos.
--  Todas las reglas están aquí: la app solo llama a estas funciones.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- Constantes
-- ---------------------------------------------------------------------
create or replace function public.admin_email() returns text
language sql immutable as $$ select 'juanjosuecastilloloyola@gmail.com'::text $$;

create or replace function public.tz() returns text
language sql immutable as $$ select 'America/Santiago'::text $$;

create or replace function public.db_version() returns text
language sql immutable as $$ select '1.2'::text $$;

-- Lo nuevo de esta versión (llega en el push a todos al actualizar).
create or replace function public.notas_version() returns text
language sql immutable as $$ select 'Actualizaciones más simples: te avisamos al tiro cuando hay una versión nueva.'::text $$;

-- Límites Free / Premium (un solo lugar para cambiarlos).
create or replace function public.limite(p_que text, p_premium boolean) returns int
language sql immutable as $$
  select case p_que
    when 'barberos'  then case when p_premium then 10 else 3 end     -- contando al dueño
    when 'clientes'  then case when p_premium then 500 else 40 end
    when 'servicios' then case when p_premium then 100 else 8 end
    when 'ofertas'   then case when p_premium then 50 else 1 end
    when 'activas'   then case when p_premium then 3 else 1 end      -- horas activas del cliente
    when 'dias'      then case when p_premium then 45 else 14 end    -- días hacia adelante
  end
$$;

-- ---------------------------------------------------------------------
-- Perfiles y barberías
-- Roles: admin (Josué) · owner (dueño de una barbería) · barber · client
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text not null,
  nombre          text not null default '',
  role            text not null default 'client' check (role in ('admin', 'owner', 'barber', 'client')),
  barberia_id     uuid,
  plan            text not null default 'free' check (plan in ('free', 'premium')),
  premium_until   timestamptz,
  trial_used      boolean not null default false,
  suspended       boolean not null default false,
  telefono        text,
  avatar          text not null default '🙂',
  foto            text,
  color           text,
  cumple          date,
  descripcion     text,
  horario         jsonb,
  activo          boolean not null default true,
  agenda_abierta  boolean not null default true,
  saldo           int not null default 0 check (saldo >= 0),
  bloqueado       boolean not null default false,
  notas           text,
  favorito        uuid,
  clave_temporal  boolean not null default false,
  tour_visto      boolean not null default false,
  aviso_vence_at  timestamptz,
  failed_redeems  int not null default 0,
  last_failed_at  timestamptz,
  created_by      uuid,
  last_seen       timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists profiles_barberia_idx on public.profiles (barberia_id, role);
alter table public.profiles enable row level security;

create table if not exists public.barberias (
  id                   uuid primary key default gen_random_uuid(),
  codigo               text not null unique,
  nombre               text not null default 'Mi barbería',
  owner_id             uuid unique references public.profiles (id) on delete cascade,
  logo                 text,
  color                text,
  portada              text,
  direccion            text,
  whatsapp             text,
  abono                int not null default 4000 check (abono between 0 and 100000),
  link_pago            text,
  datos_transferencia  text,
  bienvenida           text,
  horario              jsonb not null default '[
    {"e":"a","i":"10:00","f":"20:00","ci":"14:00","cf":"15:00"},
    {"e":"a","i":"10:00","f":"20:00","ci":"14:00","cf":"15:00"},
    {"e":"a","i":"10:00","f":"20:00","ci":"14:00","cf":"15:00"},
    {"e":"a","i":"10:00","f":"20:00","ci":"14:00","cf":"15:00"},
    {"e":"a","i":"10:00","f":"20:00","ci":"14:00","cf":"15:00"},
    {"e":"c","i":"10:00","f":"15:00"},
    {"e":"c","i":"10:00","f":"15:00"}]'::jsonb,
  comision             int not null default 50 check (comision between 0 and 100),
  sellos_meta          int not null default 10 check (sellos_meta between 3 and 30),
  created_at           timestamptz not null default now()
);
alter table public.barberias enable row level security;
-- v1.1: el dueño decide si sus barberos pueden crear clientes.
alter table public.barberias add column if not exists barberos_crean_clientes boolean not null default true;

do $$ begin
  alter table public.profiles add constraint profiles_barberia_fk
    foreign key (barberia_id) references public.barberias (id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_favorito_fk
    foreign key (favorito) references public.profiles (id) on delete set null;
exception when duplicate_object then null; end $$;

-- Invitaciones: el servidor las prepara antes de crear la cuenta (registro cerrado).
create table if not exists public.user_invites (
  email        text primary key,
  nombre       text not null default '',
  role         text not null check (role in ('owner', 'barber', 'client')),
  barberia_id  uuid references public.barberias (id) on delete cascade,
  telefono     text,
  extra        jsonb not null default '{}'::jsonb,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table public.user_invites enable row level security;

create or replace function public.nuevo_codigo() returns text
language plpgsql volatile set search_path = '' as $$
declare c text; abc text := 'abcdefghjkmnpqrstuvwxyz23456789';
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    exit when not exists (select 1 from public.barberias where codigo = c);
  end loop;
  return c;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  inv public.user_invites;
  es_admin boolean := lower(new.email) = public.admin_email();
  b uuid;
begin
  select * into inv from public.user_invites
  where email = lower(new.email) and created_at > now() - interval '1 hour';
  if not es_admin and inv.email is null then
    raise exception 'El registro está cerrado. Tu barbería te crea la cuenta.';
  end if;
  insert into public.profiles (id, email, nombre, role, barberia_id, telefono, created_by)
  values (new.id, lower(new.email), left(coalesce(inv.nombre, 'Administrador'), 80),
          case when es_admin then 'admin' else inv.role end,
          case when es_admin then null else inv.barberia_id end,
          inv.telefono, inv.created_by)
  on conflict (id) do nothing;
  if not es_admin and inv.role = 'owner' then
    insert into public.barberias (codigo, nombre, owner_id, whatsapp)
    values (public.nuevo_codigo(), left(coalesce(nullif(inv.extra ->> 'barberia', ''), inv.nombre), 80), new.id, inv.telefono)
    returning id into b;
    update public.profiles set barberia_id = b where id = new.id;
  end if;
  delete from public.user_invites where email = lower(new.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Si la cuenta de Josué ya existía antes de instalar.
insert into public.profiles (id, email, nombre, role)
select u.id, lower(u.email), 'Administrador', 'admin' from auth.users u
where lower(u.email) = public.admin_email()
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Quién es quién
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = auth.uid() and p.role = 'admin' and lower(u.email) = public.admin_email()
  )
$$;

create or replace function public.admin_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.profiles where role = 'admin' and email = public.admin_email() limit 1
$$;

create or replace function public.is_premium(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = uid and not p.suspended
    and (p.role = 'admin' or (p.plan = 'premium' and (p.premium_until is null or p.premium_until > now()))))
$$;

-- La barbería es Premium si su dueño lo es.
create or replace function public.barberia_premium(bid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.is_premium(b.owner_id) from public.barberias b where b.id = bid), false)
$$;

create or replace function public.yo() returns public.profiles
language sql stable security definer set search_path = '' as $$
  select * from public.profiles where id = auth.uid()
$$;

-- Perfil del usuario actual; error si no hay sesión o está suspendido.
create or replace function public.yo_activo() returns public.profiles
language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Inicia sesión primero'; end if;
  if me.suspended then raise exception 'Tu cuenta está suspendida'; end if;
  if me.role <> 'admin' and me.barberia_id is not null and exists (
       select 1 from public.barberias b join public.profiles o on o.id = b.owner_id
       where b.id = me.barberia_id and o.suspended) then
    raise exception 'Esta barbería está suspendida. Contacta a CodeFix.';
  end if;
  return me;
end $$;

create or replace function public.es_staff(p public.profiles) returns boolean
language sql immutable as $$ select p.role in ('owner', 'barber') $$;

create or replace function public.rango(p_role text) returns int
language sql immutable as $$
  select case p_role when 'admin' then 4 when 'owner' then 3 when 'barber' then 2 else 1 end
$$;

-- Nombre visible.
create or replace function public.nombre_de(p public.profiles) returns text
language sql immutable as $$
  select case when p.role = 'admin' then 'CodeFix (soporte)'
              else coalesce(nullif(p.nombre, ''), split_part(p.email, '@', 1)) end
$$;

create or replace function public.mi_cuenta() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; b public.barberias; o public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then return null; end if;
  update public.profiles set last_seen = now() where id = me.id and (last_seen is null or last_seen < now() - interval '5 minutes');
  select * into b from public.barberias where id = me.barberia_id;
  select * into o from public.profiles where id = b.owner_id;
  return jsonb_build_object(
    'id', me.id, 'email', me.email, 'nombre', me.nombre, 'role', me.role, 'plan', me.plan,
    'premium_until', me.premium_until, 'is_premium', public.is_premium(me.id), 'trial_used', me.trial_used,
    'suspended', me.suspended or coalesce(o.suspended and me.role <> 'admin', false),
    'telefono', me.telefono, 'avatar', me.avatar, 'foto', me.foto, 'color', me.color, 'cumple', me.cumple,
    'descripcion', me.descripcion, 'saldo', me.saldo, 'bloqueado', me.bloqueado, 'favorito', me.favorito,
    'clave_temporal', me.clave_temporal, 'tour_visto', me.tour_visto, 'agenda_abierta', me.agenda_abierta,
    'is_admin', public.is_admin(),
    'barberia', case when b.id is null then null else jsonb_build_object(
      'id', b.id, 'codigo', b.codigo, 'nombre', b.nombre, 'logo', b.logo, 'color', b.color, 'portada', b.portada,
      'direccion', b.direccion, 'whatsapp', b.whatsapp, 'abono', b.abono, 'link_pago', b.link_pago,
      'datos_transferencia', b.datos_transferencia, 'bienvenida', b.bienvenida, 'horario', b.horario,
      'comision', b.comision, 'sellos_meta', b.sellos_meta, 'barberos_crean_clientes', b.barberos_crean_clientes,
      'premium', public.is_premium(b.owner_id), 'premium_until', o.premium_until, 'owner_id', b.owner_id) end);
end $$;

-- Datos mínimos para la pantalla de inicio de sesión (sin cuenta): logo, nombre y WhatsApp.
create or replace function public.barberia_publica(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('codigo', b.codigo, 'nombre', b.nombre, 'logo', b.logo, 'color', b.color, 'whatsapp', b.whatsapp)
  from public.barberias b where b.codigo = lower(trim(p_codigo))
$$;

-- ---------------------------------------------------------------------
-- Ajustes del admin y secretos
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key    text primary key,
  value  text not null
);
alter table public.app_settings enable row level security;
insert into public.app_settings (key, value) values ('precio_premium', '4900') on conflict do nothing;

create or replace function public.ajustes_publicos() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings where key <> 'url_enviar'
$$;

create or replace function public.admin_ajuste(p_key text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if p_key not in ('precio_premium', 'link_pago', 'whatsapp_admin', 'version_liberada', 'datos_transferencia') then
    raise exception 'Ajuste no permitido';
  end if;
  if p_key = 'link_pago' and coalesce(p_value, '') <> '' and p_value !~* '^https://' then
    raise exception 'El link debe empezar con https://';
  end if;
  if coalesce(trim(p_value), '') = '' then delete from public.app_settings where key = p_key;
  else insert into public.app_settings (key, value) values (p_key, left(trim(p_value), 300))
       on conflict (key) do update set value = excluded.value; end if;
end $$;

create table if not exists public.app_secrets (
  name   text primary key,
  value  text not null
);
alter table public.app_secrets enable row level security;

create or replace function public.admin_secreto(p_name text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if p_name not in ('vapid_public', 'vapid_private') then raise exception 'Nombre no permitido'; end if;
  insert into public.app_secrets (name, value) values (p_name, p_value)
  on conflict (name) do update set value = excluded.value;
end $$;

create or replace function public.admin_secretos_estado() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return (select coalesce(jsonb_object_agg(name, true), '{}'::jsonb) from public.app_secrets);
end $$;

create or replace function public.config_publica() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('vapid_public', (select value from public.app_secrets where name = 'vapid_public'))
$$;

create or replace function public.secretos() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(name, value), '{}'::jsonb) from public.app_secrets
$$;

-- ---------------------------------------------------------------------
-- Push: dispositivos de cada cuenta
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists push_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

create or replace function public.guardar_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function public.quitar_push(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;

create or replace function public.tengo_push() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.push_subscriptions where user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------
-- Avisos (notificaciones): uno por destinatario, con estado
--   ✓ Enviado (creado) · ✓✓ Recibido (push entregado o abierto en la app) · Visto (lo tocó)
-- ---------------------------------------------------------------------
create table if not exists public.avisos (
  id            uuid primary key default gen_random_uuid(),
  de            uuid references public.profiles (id) on delete set null,
  para          uuid not null references public.profiles (id) on delete cascade,
  tipo          text not null default 'aviso' check (tipo in ('aviso', 'chat', 'reserva', 'plan', 'oferta', 'difusion')),
  titulo        text not null,
  cuerpo        text not null default '',
  url           text,
  reserva_id    uuid,
  difusion      uuid,
  push          text not null default 'pendiente' check (push in ('pendiente', 'enviando', 'enviado', 'sin_push', 'fallo')),
  push_at       timestamptz,
  entregado_at  timestamptz,
  visto_at      timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists avisos_para_idx on public.avisos (para, created_at desc);
create index if not exists avisos_de_idx on public.avisos (de, created_at desc);
create index if not exists avisos_push_idx on public.avisos (push) where push = 'pendiente';
create index if not exists avisos_reserva_idx on public.avisos (reserva_id);
create index if not exists avisos_difusion_idx on public.avisos (difusion);
alter table public.avisos enable row level security;

create or replace function public.avisar(p_de uuid, p_para uuid, p_tipo text, p_titulo text, p_cuerpo text,
                                         p_url text, p_reserva uuid default null, p_difusion uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.avisos (de, para, tipo, titulo, cuerpo, url, reserva_id, difusion)
  select p_de, p_para, p_tipo, left(p_titulo, 90), left(coalesce(p_cuerpo, ''), 300), p_url, p_reserva, p_difusion
  where p_para is not null and p_para is distinct from p_de
$$;

-- Despierta al enviador de push al tiro (si pg_net está disponible). Si no, lo hace el cron cada minuto.
create or replace function public.despertar_enviador() returns trigger
language plpgsql security definer set search_path = '' as $$
declare url text := (select value from public.app_settings where key = 'url_enviar');
begin
  -- Una sola llamada por transacción aunque se creen muchos avisos.
  if url is not null and coalesce(current_setting('barberia.desperto', true), '') = '' then
    perform set_config('barberia.desperto', '1', true);
    begin
      execute 'select net.http_post(url := $1, headers := ''{"Content-Type":"application/json"}''::jsonb, body := ''{}''::jsonb)' using url;
    exception when others then null;
    end;
  end if;
  return null;
end $$;
drop trigger if exists avisos_despertar on public.avisos;
create trigger avisos_despertar after insert on public.avisos
  for each statement execute function public.despertar_enviador();

-- Mi campanita (sin los avisos de chat, que se ven en Mensajes).
create or replace function public.mis_avisos() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  update public.avisos set entregado_at = now() where para = auth.uid() and entregado_at is null;
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) into r from (
    select a.id, a.tipo, a.titulo, a.cuerpo, a.url, a.created_at, a.visto_at, a.reserva_id,
           case when a.de is null then 'Sistema' else public.nombre_de(p) end as de
    from public.avisos a left join public.profiles p on p.id = a.de
    where a.para = auth.uid() and a.tipo <> 'chat' and a.created_at > now() - interval '60 days'
    order by a.created_at desc limit 80) x;
  return r;
end $$;

create or replace function public.marcar_vistos(p_ids uuid[] default null) returns void
language sql security definer set search_path = '' as $$
  update public.avisos set visto_at = now(), entregado_at = coalesce(entregado_at, now())
  where para = auth.uid() and visto_at is null and (p_ids is null or id = any(p_ids))
$$;

-- Avisos que yo envié (para ver ✓ / ✓✓ / Visto).
create or replace function public.avisos_enviados() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select a.id, a.titulo, a.cuerpo, a.created_at, a.visto_at, a.reserva_id, a.difusion,
           (a.push = 'enviado' or a.entregado_at is not null) as recibido, public.nombre_de(p) as para
    from public.avisos a join public.profiles p on p.id = a.para
    where a.de = auth.uid() and a.tipo not in ('chat', 'difusion') and a.created_at > now() - interval '30 days'
    order by a.created_at desc limit 100) x
$$;

-- Contadores para la barra (se consulta cada ~30 s). Marca como recibidos mis mensajes y avisos.
create or replace function public.resumen() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; pend int := 0;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then return null; end if;
  update public.messages set delivered_at = now() where recipient = me.id and delivered_at is null;
  update public.avisos set entregado_at = now() where para = me.id and entregado_at is null;
  if me.role = 'owner' then
    select count(*) into pend from public.reservas r
    where r.barberia_id = me.barberia_id and r.estado in ('agendada', 'por_aprobar') and r.fin > now();
  elsif me.role = 'barber' then
    select count(*) into pend from public.reservas r
    where r.barbero_id = me.id and r.estado in ('agendada', 'por_aprobar') and r.fin > now();
  elsif me.role = 'admin' then
    select count(*) into pend from public.requests where status = 'pendiente';
  end if;
  return jsonb_build_object(
    'avisos', (select count(*) from public.avisos where para = me.id and visto_at is null and tipo <> 'chat'),
    'mensajes', (select count(*) from public.messages where recipient = me.id and read_at is null),
    'pendientes', pend);
end $$;

-- Aviso de prueba a mí mismo (para revisar que el push llegue a este celular).
create or replace function public.aviso_prueba() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  if (select count(*) from public.avisos where para = auth.uid() and titulo = '🔔 Prueba' and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Máximo 5 pruebas por hora';
  end if;
  perform public.avisar(null, auth.uid(), 'aviso', '🔔 Prueba', 'Si ves esto, las notificaciones funcionan ✅', 'avisos');
end $$;

-- ---------------------------------------------------------------------
-- Funciones SOLO del enviador de push (Edge Function "enviar")
-- ---------------------------------------------------------------------
create or replace function public.tomar_push() returns jsonb
language sql security definer set search_path = '' as $$
  with t as (
    update public.avisos set push = 'enviando'
    where id in (select id from public.avisos where push = 'pendiente' order by created_at limit 200 for update skip locked)
    returning id, para, titulo, cuerpo, url, tipo, de
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'titulo', t.titulo, 'cuerpo', t.cuerpo, 'url', t.url, 'tipo', t.tipo,
    'icono', (select b.logo from public.profiles p join public.barberias b on b.id = p.barberia_id where p.id = t.para),
    'subs', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
             from public.push_subscriptions s where s.user_id = t.para))), '[]'::jsonb)
  from t
$$;

create or replace function public.terminar_push(p_ok uuid[], p_sin uuid[], p_fallo uuid[]) returns void
language sql security definer set search_path = '' as $$
  update public.avisos set push = case when id = any(p_ok) then 'enviado' when id = any(p_sin) then 'sin_push' else 'fallo' end,
         push_at = now()
  where id = any(p_ok || p_sin || p_fallo)
$$;

create or replace function public.quitar_endpoint(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint
$$;

-- ---------------------------------------------------------------------
-- Crear cuentas (lo llama la Edge Function con la clave de servidor)
--   admin → dueño (y su barbería) · dueño → barberos y clientes de su barbería
-- ---------------------------------------------------------------------
create or replace function public.preparar_invitacion(p_caller uuid, p_email text, p_nombre text, p_rol text,
                                                      p_telefono text, p_barberia text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.profiles;
  em text := lower(trim(coalesce(p_email, '')));
  prem boolean;
  n int;
begin
  select * into c from public.profiles where id = p_caller;
  if c.id is null or c.suspended then return jsonb_build_object('ok', false, 'error', 'Sin permiso'); end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'error', 'Correo no válido'); end if;
  if coalesce(trim(p_nombre), '') = '' then return jsonb_build_object('ok', false, 'error', 'Falta el nombre'); end if;
  if exists (select 1 from public.profiles where email = em) then
    return jsonb_build_object('ok', false, 'error', 'Ese correo ya tiene cuenta');
  end if;
  if c.role = 'admin' and lower(c.email) = public.admin_email() then
    if p_rol <> 'owner' then return jsonb_build_object('ok', false, 'error', 'El administrador crea barberías'); end if;
  elsif c.role = 'owner' then
    if p_rol not in ('barber', 'client') then return jsonb_build_object('ok', false, 'error', 'Solo puedes crear barberos y clientes'); end if;
    prem := public.is_premium(c.id);
    if p_rol = 'barber' then
      select count(*) + 1 into n from public.profiles where barberia_id = c.barberia_id and role = 'barber';
      if n >= public.limite('barberos', prem) then
        return jsonb_build_object('ok', false, 'error', 'Llegaste al máximo de ' || public.limite('barberos', prem) ||
          ' barberos (contándote)' || case when prem then '' else '. Con Premium puedes tener hasta 10.' end);
      end if;
    else
      select count(*) into n from public.profiles where barberia_id = c.barberia_id and role = 'client';
      if n >= public.limite('clientes', prem) then
        return jsonb_build_object('ok', false, 'error', 'Llegaste al máximo de ' || public.limite('clientes', prem) ||
          ' clientes' || case when prem then '' else '. Con Premium puedes tener hasta 500.' end);
      end if;
    end if;
    if (select count(*) from public.profiles where created_by = c.id and created_at > now() - interval '1 day') >= 60 then
      return jsonb_build_object('ok', false, 'error', 'Máximo 60 cuentas nuevas por día');
    end if;
  elsif c.role = 'barber' then
    -- v1.1: los barberos también crean clientes (de toda la barbería), si el dueño lo permite.
    if p_rol <> 'client' then return jsonb_build_object('ok', false, 'error', 'Solo puedes crear clientes'); end if;
    if not c.activo or not coalesce((select barberos_crean_clientes from public.barberias where id = c.barberia_id), false) then
      return jsonb_build_object('ok', false, 'error', 'El dueño no tiene activado que los barberos creen clientes');
    end if;
    prem := public.barberia_premium(c.barberia_id);
    select count(*) into n from public.profiles where barberia_id = c.barberia_id and role = 'client';
    if n >= public.limite('clientes', prem) then
      return jsonb_build_object('ok', false, 'error', 'La barbería llegó al máximo de ' || public.limite('clientes', prem) || ' clientes');
    end if;
    if (select count(*) from public.profiles where created_by = c.id and created_at > now() - interval '1 day') >= 30 then
      return jsonb_build_object('ok', false, 'error', 'Máximo 30 cuentas nuevas por día');
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'Sin permiso para crear cuentas');
  end if;
  insert into public.user_invites (email, nombre, role, barberia_id, telefono, extra, created_by)
  values (em, left(trim(p_nombre), 80), p_rol, case when p_rol = 'owner' then null else c.barberia_id end,
          nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), ''),
          jsonb_build_object('barberia', left(trim(coalesce(p_barberia, '')), 80)), c.id)
  on conflict (email) do update set nombre = excluded.nombre, role = excluded.role, barberia_id = excluded.barberia_id,
    telefono = excluded.telefono, extra = excluded.extra, created_by = excluded.created_by, created_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cancelar_invitacion(p_email text) returns void
language sql security definer set search_path = '' as $$
  delete from public.user_invites where email = lower(trim(p_email))
$$;

-- Después de crear la cuenta: si el dueño crea su primer barbero, su agenda se cierra a clientes (la puede abrir).
create or replace function public.cuenta_creada(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles; b public.barberias;
begin
  select * into p from public.profiles where id = p_id;
  select * into b from public.barberias where id = p.barberia_id;
  if p.role = 'barber' and (select count(*) from public.profiles where barberia_id = p.barberia_id and role = 'barber') = 1 then
    update public.profiles set agenda_abierta = false where id = b.owner_id;
  end if;
  return jsonb_build_object('id', p.id, 'codigo', b.codigo, 'barberia', b.nombre);
end $$;

-- ¿Quién puede restablecer la clave de quién? admin → cualquiera; dueño → su gente.
create or replace function public.puede_restablecer(p_caller uuid, p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles c, public.profiles t
    where c.id = p_caller and t.id = p_target and c.id <> t.id and not c.suspended and t.role <> 'admin'
      and ((c.role = 'admin' and lower(c.email) = public.admin_email())
           or (c.role = 'owner' and t.barberia_id = c.barberia_id and t.role in ('barber', 'client'))))
$$;

create or replace function public.marcar_clave_temporal(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.profiles set clave_temporal = true where id = p_id
$$;

create or replace function public.clave_cambiada() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set clave_temporal = false where id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Premium: keys mensuales, activación directa, solicitudes y prueba
-- ---------------------------------------------------------------------
create table if not exists public.licenses (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,
  tipo         text not null check (tipo in ('barberia', 'cliente')),
  para_nombre  text not null default '',
  meses        int not null default 1 check (meses between 1 and 12),
  precio       int not null default 0,
  nota         text,
  origen       text not null default 'key' check (origen in ('key', 'directo', 'solicitud')),
  created_at   timestamptz not null default now(),
  redeemed_by  uuid references public.profiles (id) on delete set null,
  redeemed_at  timestamptz,
  inicio       timestamptz,
  termino      timestamptz,
  revoked      boolean not null default false
);
alter table public.licenses enable row level security;

create or replace function public.nueva_key() returns text
language sql volatile as $$
  select 'BARB-' || string_agg(substr(k, i, 4), '-')
  from (select upper(replace(gen_random_uuid()::text, '-', '')) as k) s, generate_series(1, 9, 4) as i
$$;

create or replace function public.admin_crear_key(p_tipo text, p_para text, p_meses int default 1, p_precio int default null,
                                                  p_nota text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.licenses;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if p_tipo not in ('barberia', 'cliente') then raise exception 'Tipo no válido'; end if;
  insert into public.licenses (key, tipo, para_nombre, meses, precio, nota)
  values (public.nueva_key(), p_tipo, left(coalesce(trim(p_para), ''), 80), greatest(1, least(12, coalesce(p_meses, 1))),
          coalesce(p_precio, (select value::int from public.app_settings where key = 'precio_premium'), 4900) * greatest(1, least(12, coalesce(p_meses, 1))),
          p_nota)
  returning * into l;
  return to_jsonb(l);
end $$;

-- Suma meses al Premium de una cuenta y deja el registro en la key.
create or replace function public.extender_premium(p_user uuid, p_lic uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare l public.licenses; p public.profiles; ini timestamptz; fin timestamptz;
begin
  select * into l from public.licenses where id = p_lic;
  select * into p from public.profiles where id = p_user for update;
  ini := greatest(coalesce(case when p.plan = 'premium' then p.premium_until end, now()), now());
  fin := ini + make_interval(months => l.meses);
  update public.profiles set plan = 'premium', premium_until = fin, failed_redeems = 0, aviso_vence_at = null where id = p_user;
  update public.licenses set redeemed_by = p_user, redeemed_at = now(), inicio = ini, termino = fin,
    para_nombre = case when para_nombre = '' then public.nombre_de(p) else para_nombre end
  where id = p_lic;
  perform public.avisar(public.admin_id(), p_user, 'plan', '⭐ ¡Premium activado!',
    'Tu Premium dura hasta el ' || to_char(fin at time zone public.tz(), 'DD/MM/YYYY') || '.', 'plan');
  return fin;
end $$;

create or replace function public.canjear_key(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; l public.licenses; k text := upper(regexp_replace(coalesce(p_key, ''), '\s', '', 'g'));
begin
  me := public.yo_activo();
  if me.role not in ('owner', 'client') then raise exception 'Esta cuenta no usa keys'; end if;
  if me.failed_redeems >= 10 and me.last_failed_at > now() - interval '1 hour' then
    raise exception 'Demasiados intentos. Espera una hora.';
  end if;
  select * into l from public.licenses where key = k for update;
  if l.id is null or l.revoked or l.redeemed_by is not null
     or (l.tipo = 'barberia' and me.role <> 'owner') or (l.tipo = 'cliente' and me.role <> 'client') then
    update public.profiles set failed_redeems = case when last_failed_at > now() - interval '1 hour' then failed_redeems + 1 else 1 end,
      last_failed_at = now() where id = me.id;
    raise exception 'Key no válida, ya usada o de otro tipo';
  end if;
  perform public.extender_premium(me.id, l.id);
  perform public.avisar(me.id, public.admin_id(), 'plan', '🔑 Key activada', public.nombre_de(me) || ' activó ' || l.key, 'admin');
  return public.mi_cuenta();
end $$;

-- Activación directa (sin key): queda igual registrada en el historial.
create or replace function public.admin_activar(p_user uuid, p_meses int default 1, p_precio int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles; l public.licenses;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  select * into p from public.profiles where id = p_user;
  if p.role not in ('owner', 'client') then raise exception 'Solo barberías (dueños) y clientes tienen Premium'; end if;
  insert into public.licenses (key, tipo, para_nombre, meses, precio, origen)
  values (public.nueva_key(), case when p.role = 'owner' then 'barberia' else 'cliente' end, public.nombre_de(p),
          greatest(1, least(12, coalesce(p_meses, 1))),
          coalesce(p_precio, (select value::int from public.app_settings where key = 'precio_premium'), 4900) * greatest(1, least(12, coalesce(p_meses, 1))),
          'directo')
  returning * into l;
  return jsonb_build_object('hasta', public.extender_premium(p_user, l.id), 'key', l.key);
end $$;

create or replace function public.admin_revocar_key(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  update public.licenses set revoked = true where id = p_id returning redeemed_by into uid;
  if uid is not null then
    update public.profiles set premium_until = now() where id = uid and plan = 'premium';
  end if;
end $$;

create or replace function public.admin_quitar_premium(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  update public.profiles set plan = 'free', premium_until = null where id = p_user and role <> 'admin';
end $$;

create or replace function public.admin_suspender(p_user uuid, p_suspender boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  update public.profiles set suspended = coalesce(p_suspender, false) where id = p_user and role <> 'admin';
end $$;

create table if not exists public.requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('pago', 'prueba')),
  note        text,
  status      text not null default 'pendiente' check (status in ('pendiente', 'aprobada', 'rechazada')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.requests enable row level security;

-- Prueba de 7 días: se activa sola, una vez por cuenta.
create or replace function public.probar_premium() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := public.yo_activo();
  if me.role not in ('owner', 'client') then raise exception 'Esta cuenta no tiene plan'; end if;
  if me.trial_used then raise exception 'Ya usaste tu prueba gratis'; end if;
  if public.is_premium(me.id) then raise exception 'Ya eres Premium'; end if;
  update public.profiles set plan = 'premium', premium_until = now() + interval '7 days', trial_used = true where id = me.id;
  insert into public.requests (user_id, kind, status, resolved_at) values (me.id, 'prueba', 'aprobada', now());
  perform public.avisar(me.id, public.admin_id(), 'plan', '🎁 Prueba Premium',
    public.nombre_de(me) || ' (' || case when me.role = 'owner' then 'barbería' else 'cliente' end || ') activó sus 7 días gratis', 'admin');
  return public.mi_cuenta();
end $$;

-- "Ya pagué": le llega un push a Josué para que active.
create or replace function public.ya_pague(p_nota text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; b text;
begin
  me := public.yo_activo();
  if me.role not in ('owner', 'client') then raise exception 'Esta cuenta no tiene plan'; end if;
  if exists (select 1 from public.requests where user_id = me.id and kind = 'pago' and status = 'pendiente') then
    raise exception 'Ya avisaste tu pago. Josué lo revisará pronto.';
  end if;
  insert into public.requests (user_id, kind, note) values (me.id, 'pago', left(p_nota, 200));
  select nombre into b from public.barberias where id = me.barberia_id;
  perform public.avisar(me.id, public.admin_id(), 'plan', '💰 Ya pagué · ' || public.nombre_de(me),
    case when me.role = 'owner' then 'Barbería ' else 'Cliente de ' end || coalesce(b, '') ||
    coalesce(' · ' || nullif(trim(p_nota), ''), ''), 'admin');
end $$;

create or replace function public.admin_resolver(p_id uuid, p_aprobar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.requests;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  select * into r from public.requests where id = p_id and status = 'pendiente' for update;
  if r.id is null then raise exception 'La solicitud ya fue atendida'; end if;
  update public.requests set status = case when p_aprobar then 'aprobada' else 'rechazada' end, resolved_at = now() where id = p_id;
  if p_aprobar then perform public.admin_activar(r.user_id, 1, null);
  else perform public.avisar(public.admin_id(), r.user_id, 'plan', 'Pago no encontrado',
         'No encontramos tu pago. Escríbele a CodeFix por el chat.', 'plan'); end if;
end $$;

-- Cada día: avisa 3 días antes de que venza el Premium.
create or replace function public.avisar_vencimientos() returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; p record;
begin
  for p in select * from public.profiles
           where plan = 'premium' and premium_until between now() and now() + interval '3 days'
             and (aviso_vence_at is null or aviso_vence_at < premium_until - interval '4 days') loop
    perform public.avisar(public.admin_id(), p.id, 'plan', '⏳ Tu Premium vence pronto',
      'Vence el ' || to_char(p.premium_until at time zone public.tz(), 'DD/MM/YYYY') || '. Renuévalo en Mi plan para no perder tus beneficios.', 'plan');
    update public.profiles set aviso_vence_at = now() where id = p.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Servicios, bloqueos y ofertas
-- ---------------------------------------------------------------------
create table if not exists public.servicios (
  id           uuid primary key default gen_random_uuid(),
  barberia_id  uuid not null references public.barberias (id) on delete cascade,
  nombre       text not null,
  precio       int not null default 0 check (precio between 0 and 10000000),
  duracion     int not null default 30 check (duracion between 5 and 480),
  categoria    text,
  descripcion  text,
  foto         text,
  visible      boolean not null default true,
  orden        int not null default 0,
  barberos     uuid[],
  created_at   timestamptz not null default now()
);
create index if not exists servicios_barberia_idx on public.servicios (barberia_id, orden);
alter table public.servicios enable row level security;

create table if not exists public.bloqueos (
  id           uuid primary key default gen_random_uuid(),
  barberia_id  uuid not null references public.barberias (id) on delete cascade,
  barbero_id   uuid references public.profiles (id) on delete cascade,
  desde        timestamptz not null,
  hasta        timestamptz not null check (hasta > desde),
  motivo       text,
  created_by   uuid,
  created_at   timestamptz not null default now()
);
create index if not exists bloqueos_idx on public.bloqueos (barberia_id, desde);
alter table public.bloqueos enable row level security;

create table if not exists public.ofertas (
  id           uuid primary key default gen_random_uuid(),
  barberia_id  uuid not null references public.barberias (id) on delete cascade,
  titulo       text not null,
  detalle      text,
  precio       text,
  imagen       text,
  vip          boolean not null default false,
  activa       boolean not null default true,
  hasta        date,
  created_at   timestamptz not null default now()
);
alter table public.ofertas enable row level security;

-- ---------------------------------------------------------------------
-- Reservas: una hora de un barbero. El servidor impide tomar dos veces la misma hora.
-- Estados: esperando_abono (15 min) · por_aprobar · agendada · confirmada · atendida · no_vino · anulada
-- ---------------------------------------------------------------------
create table if not exists public.reservas (
  id              uuid primary key default gen_random_uuid(),
  barberia_id     uuid not null references public.barberias (id) on delete cascade,
  barbero_id      uuid not null references public.profiles (id) on delete cascade,
  cliente_id      uuid references public.profiles (id) on delete set null,
  cliente_nombre  text,
  inicio          timestamptz not null,
  fin             timestamptz not null check (fin > inicio),
  servicios       jsonb not null default '[]'::jsonb,
  total           int not null default 0,
  abono           int not null default 0,
  pagado_con      text check (pagado_con in ('link', 'transferencia', 'saldo', 'interno')),
  estado          text not null check (estado in ('esperando_abono', 'por_aprobar', 'agendada', 'confirmada',
                                                  'atendida', 'no_vino', 'anulada')),
  consultar       boolean not null default false,
  expira_at       timestamptz,
  comprobante     text,
  comprobante_at  timestamptz,
  nota            text,
  creada_por      uuid,
  confirmada_at   timestamptz,
  anulada_at      timestamptz,
  anulada_por     uuid,
  motivo          text,
  abono_destino   text check (abono_destino in ('saldo', 'perdido')),
  recordado24     boolean not null default false,
  recordado2      boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists reservas_barberia_idx on public.reservas (barberia_id, inicio);
create index if not exists reservas_barbero_idx on public.reservas (barbero_id, inicio);
create index if not exists reservas_cliente_idx on public.reservas (cliente_id, inicio desc);
create index if not exists reservas_vence_idx on public.reservas (expira_at) where estado in ('esperando_abono', 'por_aprobar');
alter table public.reservas enable row level security;

do $$ begin
  alter table public.reservas add constraint reservas_sin_choque
    exclude using gist (barbero_id with =, tstzrange(inicio, fin, '[)') with &&)
    where (estado in ('esperando_abono', 'por_aprobar', 'agendada', 'confirmada'));
exception when duplicate_object or duplicate_table then null; end $$;

create or replace function public.pesos(n int) returns text
language sql immutable as $$ select '$' || replace(to_char(coalesce(n, 0), 'FM999,999,999'), ',', '.') $$;

create or replace function public.fecha_txt(t timestamptz) returns text
language sql stable as $$
  select (array['lun','mar','mié','jue','vie','sáb','dom'])[extract(isodow from t at time zone public.tz())::int]
         || ' ' || to_char(t at time zone public.tz(), 'DD/MM HH24:MI')
$$;

-- Horario que rige para un barbero (el suyo si la barbería es Premium y lo tiene; si no, el de la barbería).
create or replace function public.horario_de(p_barbero uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when p.horario is not null and public.barberia_premium(p.barberia_id) then p.horario else b.horario end
  from public.profiles p join public.barberias b on b.id = p.barberia_id where p.id = p_barbero
$$;

-- Valida que la hora calce con el horario y bloqueos. Devuelve 'a' (abierto) o 'c' (a consultar).
create or replace function public.validar_hora(p_barbero uuid, p_inicio timestamptz, p_fin timestamptz) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  h jsonb := public.horario_de(p_barbero);
  li timestamp := p_inicio at time zone public.tz();
  lf timestamp := p_fin at time zone public.tz();
  d jsonb;
  bid uuid := (select barberia_id from public.profiles where id = p_barbero);
begin
  if h is null then raise exception 'Barbero no encontrado'; end if;
  d := h -> (extract(isodow from li)::int - 1);
  if d is null or coalesce(d ->> 'e', 'x') = 'x' then raise exception 'Ese día no se atiende'; end if;
  if li::date <> (lf - interval '1 second')::date then raise exception 'La hora debe terminar el mismo día'; end if;
  if li::time < (d ->> 'i')::time or lf::time > (d ->> 'f')::time or lf::time = '00:00'::time then
    raise exception 'Fuera del horario (% a %)', d ->> 'i', d ->> 'f';
  end if;
  if coalesce(d ->> 'ci', '') <> '' and coalesce(d ->> 'cf', '') <> ''
     and li::time < (d ->> 'cf')::time and lf::time > (d ->> 'ci')::time then
    raise exception 'Ese horario choca con la colación (% a %)', d ->> 'ci', d ->> 'cf';
  end if;
  if exists (select 1 from public.bloqueos k where k.barberia_id = bid and (k.barbero_id is null or k.barbero_id = p_barbero)
             and tstzrange(k.desde, k.hasta) && tstzrange(p_inicio, p_fin)) then
    raise exception 'Ese horario está bloqueado';
  end if;
  return d ->> 'e';
end $$;

-- ¿Este barbero recibe reservas de clientes? Cada barbero (y el dueño) tiene su interruptor "agenda abierta".
create or replace function public.reservable(p public.profiles) returns boolean
language sql immutable as $$
  select not p.suspended and p.activo and p.role in ('owner', 'barber') and p.agenda_abierta
$$;

-- Libera las horas apartadas sin abono (15 min) y las "por aprobar" sin respuesta.
create or replace function public.liberar_vencidas() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in update public.reservas set estado = 'anulada', anulada_at = now(), motivo = 'No se abonó a tiempo'
           where estado = 'esperando_abono' and expira_at < now() returning * loop
    n := n + 1;
    perform public.avisar(null, r.cliente_id, 'reserva', '⌛ Hora liberada',
      'No alcanzaste a abonar en 15 minutos. La hora del ' || public.fecha_txt(r.inicio) || ' quedó libre.', 'horas', r.id);
  end loop;
  for r in update public.reservas set estado = 'anulada', anulada_at = now(), motivo = 'El barbero no alcanzó a responder',
              abono_destino = case when abono > 0 and pagado_con in ('link', 'transferencia', 'saldo') then 'saldo' end
           where estado = 'por_aprobar' and expira_at < now() returning * loop
    n := n + 1;
    if r.abono_destino = 'saldo' then update public.profiles set saldo = saldo + r.abono where id = r.cliente_id; end if;
    perform public.avisar(null, r.cliente_id, 'reserva', 'Hora no aprobada',
      'El barbero no alcanzó a responder tu solicitud del ' || public.fecha_txt(r.inicio) ||
      case when r.abono_destino = 'saldo' then '. Tu abono quedó como saldo a favor.' else '.' end, 'horas', r.id);
    perform public.avisar_espera(r.barberia_id, r.barbero_id, r.inicio);
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Lista de espera (cliente Premium): avisa cuando se libera una hora ese día
-- ---------------------------------------------------------------------
create table if not exists public.lista_espera (
  id           uuid primary key default gen_random_uuid(),
  barberia_id  uuid not null references public.barberias (id) on delete cascade,
  barbero_id   uuid references public.profiles (id) on delete cascade,
  cliente_id   uuid not null references public.profiles (id) on delete cascade,
  fecha        date not null,
  avisado      boolean not null default false,
  created_at   timestamptz not null default now()
);
create unique index if not exists lista_espera_uni on public.lista_espera (cliente_id, fecha, coalesce(barbero_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.lista_espera enable row level security;

create or replace function public.avisar_espera(p_barberia uuid, p_barbero uuid, p_inicio timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare e record; f date := (p_inicio at time zone public.tz())::date;
begin
  if p_inicio < now() then return; end if;
  for e in update public.lista_espera set avisado = true
           where barberia_id = p_barberia and fecha = f and not avisado and (barbero_id is null or barbero_id = p_barbero)
           returning * loop
    perform public.avisar(null, e.cliente_id, 'reserva', '🔔 Se liberó una hora',
      'Hay una hora libre el ' || public.fecha_txt(p_inicio) || '. ¡Tómala antes que otro!', 'agendar');
  end loop;
end $$;

create or replace function public.unirse_espera(p_fecha date, p_barbero uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := public.yo_activo();
  if me.role <> 'client' then raise exception 'Solo clientes'; end if;
  if not public.is_premium(me.id) then raise exception 'La lista de espera es Premium ⭐'; end if;
  if p_fecha < (now() at time zone public.tz())::date then raise exception 'Esa fecha ya pasó'; end if;
  if (select count(*) from public.lista_espera where cliente_id = me.id and not avisado and fecha >= current_date) >= 5 then
    raise exception 'Máximo 5 días en lista de espera';
  end if;
  insert into public.lista_espera (barberia_id, barbero_id, cliente_id, fecha)
  values (me.barberia_id, p_barbero, me.id, p_fecha) on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------
-- Ver la barbería (cliente y equipo): barberos, servicios, ofertas
-- ---------------------------------------------------------------------
create or replace function public.ver_barberia() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; prem_cli boolean; staff boolean;
begin
  me := public.yo_activo();
  if me.barberia_id is null then raise exception 'Sin barbería'; end if;
  prem_cli := public.is_premium(me.id);
  staff := public.es_staff(me);
  return jsonb_build_object(
    'barberos', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'nombre', public.nombre_de(p), 'avatar', p.avatar, 'foto', p.foto, 'descripcion', p.descripcion,
        'es_dueno', p.role = 'owner', 'reservable', public.reservable(p), 'activo', p.activo, 'agenda_abierta', p.agenda_abierta,
        'horario', public.horario_de(p.id), 'telefono', case when staff then p.telefono end)
        order by (p.role = 'owner') desc, p.nombre), '[]'::jsonb)
      from public.profiles p where p.barberia_id = me.barberia_id and p.role in ('owner', 'barber')
        and (staff or p.activo)),
    'servicios', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'nombre', s.nombre, 'precio', s.precio, 'duracion', s.duracion, 'categoria', s.categoria,
        'descripcion', s.descripcion, 'foto', s.foto, 'visible', s.visible, 'orden', s.orden, 'barberos', s.barberos)
        order by s.orden, s.nombre), '[]'::jsonb)
      from public.servicios s where s.barberia_id = me.barberia_id and (staff or s.visible)),
    'ofertas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'titulo', o.titulo, 'vip', o.vip, 'activa', o.activa, 'hasta', o.hasta, 'created_at', o.created_at,
        'bloqueada', o.vip and not prem_cli and not staff,
        'detalle', case when o.vip and not prem_cli and not staff then null else o.detalle end,
        'precio', case when o.vip and not prem_cli and not staff then null else o.precio end,
        'imagen', case when o.vip and not prem_cli and not staff then null else o.imagen end)
        order by o.created_at desc), '[]'::jsonb)
      from public.ofertas o where o.barberia_id = me.barberia_id
        and (staff or (o.activa and (o.hasta is null or o.hasta >= (now() at time zone public.tz())::date)))));
end $$;

-- ---------------------------------------------------------------------
-- Calendario: horas ocupadas en un rango (cada uno ve el detalle que le corresponde)
--   dueño: todo con detalle · barbero: el detalle de las suyas · cliente: solo las suyas
-- ---------------------------------------------------------------------
create or replace function public.ocupacion(p_desde date, p_hasta date, p_barberia uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  bid uuid;
  t0 timestamptz;
  t1 timestamptz;
begin
  perform public.liberar_vencidas();
  if public.is_admin() and p_barberia is not null then
    select * into me from public.profiles where id = auth.uid();
    bid := p_barberia;
  else
    me := public.yo_activo();
    bid := me.barberia_id;
  end if;
  if bid is null then raise exception 'Sin barbería'; end if;
  if p_hasta < p_desde or p_hasta - p_desde > 400 then raise exception 'Rango no válido'; end if;
  t0 := (p_desde::timestamp) at time zone public.tz();
  t1 := ((p_hasta + 1)::timestamp) at time zone public.tz();
  return jsonb_build_object(
    'reservas', (select coalesce(jsonb_agg(
      case when me.role in ('owner', 'admin') or (me.role = 'barber' and r.barbero_id = me.id) or r.cliente_id = me.id then
        jsonb_build_object('id', r.id, 'barbero_id', r.barbero_id, 'inicio', r.inicio, 'fin', r.fin, 'estado', r.estado,
          'mia', r.cliente_id = me.id, 'detalle', true, 'cliente_id', r.cliente_id,
          'cliente', coalesce(c.nombre, r.cliente_nombre, 'Cliente'), 'cliente_avatar', c.avatar, 'cliente_tel', c.telefono,
          'cliente_premium', public.is_premium(c.id),
          'servicios', r.servicios, 'total', r.total, 'abono', r.abono, 'pagado_con', r.pagado_con,
          'consultar', r.consultar, 'expira_at', r.expira_at, 'tiene_comprobante', r.comprobante is not null,
          'nota', r.nota, 'confirmada_at', r.confirmada_at, 'motivo', r.motivo, 'abono_destino', r.abono_destino,
          'created_at', r.created_at)
      else jsonb_build_object('id', null, 'barbero_id', r.barbero_id, 'inicio', r.inicio, 'fin', r.fin,
          'estado', 'ocupado', 'mia', false, 'detalle', false) end order by r.inicio), '[]'::jsonb)
      from public.reservas r left join public.profiles c on c.id = r.cliente_id
      where r.barberia_id = bid and r.inicio < t1 and r.fin > t0
        and (r.estado in ('esperando_abono', 'por_aprobar', 'agendada', 'confirmada', 'atendida', 'no_vino')
             or (r.estado = 'anulada' and (me.role in ('owner', 'admin') or r.barbero_id = me.id or r.cliente_id = me.id)))
        and (me.role in ('owner', 'admin', 'barber') or r.estado not in ('atendida', 'no_vino') or r.cliente_id = me.id)),
    'bloqueos', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'barbero_id', k.barbero_id, 'desde', k.desde,
        'hasta', k.hasta, 'motivo', case when me.role <> 'client' then k.motivo end) order by k.desde), '[]'::jsonb)
      from public.bloqueos k where k.barberia_id = bid and k.desde < t1 and k.hasta > t0));
end $$;

-- ---------------------------------------------------------------------
-- Reservar (cliente)
-- ---------------------------------------------------------------------
create or replace function public.reservar(p_barbero uuid, p_inicio timestamptz, p_servicios uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  bar public.profiles;
  b public.barberias;
  prem boolean;
  dur int;
  tot int;
  items jsonb;
  dia text;
  fin_ timestamptz;
  r public.reservas;
  usa_saldo boolean;
begin
  me := public.yo_activo();
  if me.role <> 'client' then raise exception 'Solo los clientes reservan desde aquí'; end if;
  if me.bloqueado then raise exception 'Tu cuenta no puede reservar. Escríbele a tu barbería.'; end if;
  select * into b from public.barberias where id = me.barberia_id;
  select * into bar from public.profiles where id = p_barbero and barberia_id = me.barberia_id and role in ('owner', 'barber');
  if bar.id is null then raise exception 'Barbero no encontrado'; end if;
  if not public.reservable(bar) then
    raise exception '% no tiene la agenda abierta. Escríbele por el chat para coordinar.', public.nombre_de(bar);
  end if;
  prem := public.is_premium(me.id);
  if coalesce(cardinality(p_servicios), 0) = 0 then raise exception 'Agrega al menos un servicio'; end if;
  select coalesce(sum(s.duracion), 0), coalesce(sum(s.precio), 0),
         coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'precio', s.precio, 'duracion', s.duracion)), '[]'::jsonb)
    into dur, tot, items
  from unnest(p_servicios) as u(id) join public.servicios s on s.id = u.id
  where s.barberia_id = b.id and s.visible and (s.barberos is null or p_barbero = any(s.barberos));
  if jsonb_array_length(items) <> cardinality(p_servicios) then
    raise exception 'Algún servicio no está disponible con este barbero';
  end if;
  if extract(epoch from p_inicio)::bigint % 900 <> 0 then raise exception 'Elige una hora del calendario'; end if;
  if p_inicio < now() + interval '1 hour' then raise exception 'Reserva con al menos 1 hora de anticipación'; end if;
  if p_inicio > now() + make_interval(days => public.limite('dias', prem)) then
    raise exception 'Puedes reservar hasta % días adelante%', public.limite('dias', prem),
      case when prem then '' else ' (Premium: 45 días)' end;
  end if;
  if (select count(*) from public.reservas where cliente_id = me.id and fin > now()
      and estado in ('esperando_abono', 'por_aprobar', 'agendada', 'confirmada')) >= public.limite('activas', prem) then
    raise exception 'Ya tienes % hora(s) activa(s)%', public.limite('activas', prem),
      case when prem then '' else '. Con Premium puedes tener hasta 3.' end;
  end if;
  if (select count(*) from public.reservas where cliente_id = me.id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Máximo 5 reservas por día';
  end if;
  fin_ := p_inicio + make_interval(mins => dur);
  dia := public.validar_hora(p_barbero, p_inicio, fin_);
  perform public.liberar_vencidas();
  usa_saldo := b.abono = 0 or me.saldo >= b.abono;
  begin
    insert into public.reservas (barberia_id, barbero_id, cliente_id, inicio, fin, servicios, total, abono, pagado_con, estado,
                                 consultar, expira_at, creada_por)
    values (b.id, p_barbero, me.id, p_inicio, fin_, items, tot, b.abono,
            case when usa_saldo then 'saldo' end,
            case when not usa_saldo then 'esperando_abono' when dia = 'c' then 'por_aprobar' else 'agendada' end,
            dia = 'c',
            case when not usa_saldo then now() + interval '15 minutes'
                 when dia = 'c' then least(now() + interval '12 hours', p_inicio - interval '1 hour') end,
            me.id)
    returning * into r;
  exception when exclusion_violation then
    raise exception 'Esa hora se acaba de ocupar. Elige otra 🙏';
  end;
  if usa_saldo then
    update public.profiles set saldo = saldo - b.abono where id = me.id;
    perform public.notificar_reserva(r);
  end if;
  return to_jsonb(r) - 'comprobante';
end $$;

-- Aviso al barbero de la hora y al dueño.
create or replace function public.notificar_reserva(r public.reservas) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.profiles; own uuid; t text; cu text;
begin
  select * into c from public.profiles where id = r.cliente_id;
  select owner_id into own from public.barberias where id = r.barberia_id;
  t := case when r.estado = 'por_aprobar' then '🟡 Solicitud de hora (a consultar)' else '📅 Nueva reserva' end;
  cu := public.nombre_de(c) || ' · ' || public.fecha_txt(r.inicio) || ' · ' ||
        (select string_agg(x ->> 'nombre', ' + ') from jsonb_array_elements(r.servicios) x) ||
        case when r.pagado_con = 'saldo' then ' · abono con saldo a favor' when r.comprobante is not null then ' · 🧾 con comprobante' else '' end;
  perform public.avisar(r.cliente_id, r.barbero_id, 'reserva', t, cu, 'agenda?r=' || r.id, r.id);
  if own <> r.barbero_id then perform public.avisar(r.cliente_id, own, 'reserva', t, cu, 'agenda?r=' || r.id, r.id); end if;
end $$;

-- "Ya aboné": con la foto del comprobante, que también llega al chat del barbero.
create or replace function public.ya_abone(p_reserva uuid, p_comprobante text, p_medio text default 'transferencia') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; r public.reservas;
begin
  me := public.yo_activo();
  select * into r from public.reservas where id = p_reserva and cliente_id = me.id for update;
  if r.id is null then raise exception 'Reserva no encontrada'; end if;
  if r.estado <> 'esperando_abono' then raise exception 'Esta reserva ya no espera abono'; end if;
  if r.expira_at < now() then
    perform public.liberar_vencidas();
    raise exception 'Se pasaron los 15 minutos y la hora se liberó. Vuelve a reservar.';
  end if;
  if coalesce(p_comprobante, '') !~ '^data:image/(jpeg|png|webp);base64,' or length(p_comprobante) > 400000 then
    raise exception 'Adjunta la foto del comprobante';
  end if;
  update public.reservas set estado = case when consultar then 'por_aprobar' else 'agendada' end,
    pagado_con = case when p_medio = 'link' then 'link' else 'transferencia' end,
    comprobante = p_comprobante, comprobante_at = now(),
    expira_at = case when consultar then least(now() + interval '12 hours', inicio - interval '1 hour') end
  where id = r.id returning * into r;
  insert into public.messages (sender, recipient, body, imagen, reserva_id, sistema)
  values (me.id, r.barbero_id, '🧾 Comprobante de abono (' || public.pesos(r.abono) || ') · ' || public.fecha_txt(r.inicio), p_comprobante, r.id, true);
  perform public.notificar_reserva(r);
  return to_jsonb(r) - 'comprobante';
end $$;

create or replace function public.ver_comprobante(p_reserva uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles; r public.reservas;
begin
  me := public.yo_activo();
  select * into r from public.reservas where id = p_reserva;
  if r.id is null or not (r.cliente_id = me.id or r.barbero_id = me.id or (me.role = 'owner' and r.barberia_id = me.barberia_id)) then
    raise exception 'Sin permiso';
  end if;
  return r.comprobante;
end $$;

-- Mis horas (cliente): próximas e historial, con si el barbero vio el aviso.
create or replace function public.mis_horas() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles;
begin
  perform public.liberar_vencidas();
  me := public.yo_activo();
  return (select coalesce(jsonb_agg(x order by x.inicio desc), '[]'::jsonb) from (
    select r.id, r.inicio, r.fin, r.estado, r.servicios, r.total, r.abono, r.pagado_con, r.expira_at, r.consultar,
           r.motivo, r.abono_destino, r.created_at, r.confirmada_at, r.barbero_id, public.nombre_de(p) as barbero,
           p.avatar as barbero_avatar, p.foto as barbero_foto,
           (select max(a.visto_at) from public.avisos a where a.reserva_id = r.id and a.para = r.barbero_id) as visto_barbero
    from public.reservas r join public.profiles p on p.id = r.barbero_id
    where r.cliente_id = me.id and r.inicio > now() - interval '365 days'
    order by r.inicio desc limit 100) x);
end $$;

-- Anular (cliente): con 24 h (o 1 h si reservó para el mismo día) el abono queda a favor; si no, se pierde.
create or replace function public.anular_mia(p_reserva uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; r public.reservas; limite_ timestamptz; dest text; own uuid;
begin
  me := public.yo_activo();
  select * into r from public.reservas where id = p_reserva and cliente_id = me.id for update;
  if r.id is null then raise exception 'Reserva no encontrada'; end if;
  if r.estado not in ('esperando_abono', 'por_aprobar', 'agendada', 'confirmada') then raise exception 'Esta hora ya no se puede anular'; end if;
  if r.inicio < now() then raise exception 'Esta hora ya pasó'; end if;
  limite_ := case when r.created_at > r.inicio - interval '24 hours' then r.inicio - interval '1 hour' else r.inicio - interval '24 hours' end;
  if r.estado = 'esperando_abono' or coalesce(r.pagado_con, '') not in ('link', 'transferencia', 'saldo') or r.abono = 0 then dest := null;
  elsif now() <= limite_ then dest := 'saldo';
  else dest := 'perdido'; end if;
  update public.reservas set estado = 'anulada', anulada_at = now(), anulada_por = me.id, motivo = 'Anulada por el cliente',
    abono_destino = dest where id = r.id;
  if dest = 'saldo' then update public.profiles set saldo = saldo + r.abono where id = me.id; end if;
  if r.estado <> 'esperando_abono' then
    select owner_id into own from public.barberias where id = r.barberia_id;
    perform public.avisar(me.id, r.barbero_id, 'reserva', '❌ Hora anulada',
      public.nombre_de(me) || ' anuló su hora del ' || public.fecha_txt(r.inicio), 'agenda?r=' || r.id, r.id);
    if own <> r.barbero_id then
      perform public.avisar(me.id, own, 'reserva', '❌ Hora anulada',
        public.nombre_de(me) || ' anuló su hora del ' || public.fecha_txt(r.inicio), 'agenda?r=' || r.id, r.id);
    end if;
    perform public.avisar_espera(r.barberia_id, r.barbero_id, r.inicio);
  end if;
  return jsonb_build_object('abono_destino', dest, 'abono', r.abono, 'limite', limite_);
end $$;

-- ---------------------------------------------------------------------
-- Acciones del equipo sobre una hora
-- ---------------------------------------------------------------------
create or replace function public.reserva_staff(p_reserva uuid) returns public.reservas
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; r public.reservas;
begin
  me := public.yo_activo();
  select * into r from public.reservas where id = p_reserva for update;
  if r.id is null or not ((me.role = 'owner' and r.barberia_id = me.barberia_id) or (me.role = 'barber' and r.barbero_id = me.id)) then
    raise exception 'Sin permiso sobre esta hora';
  end if;
  return r;
end $$;

-- Confirmar (agendada → confirmada) o aprobar (por_aprobar → confirmada).
create or replace function public.confirmar_hora(p_reserva uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reservas; bname text;
begin
  r := public.reserva_staff(p_reserva);
  if r.estado not in ('agendada', 'por_aprobar') then raise exception 'Esta hora no está pendiente'; end if;
  update public.reservas set estado = 'confirmada', confirmada_at = now(), expira_at = null where id = r.id;
  select public.nombre_de(p) into bname from public.profiles p where p.id = r.barbero_id;
  perform public.avisar(auth.uid(), r.cliente_id, 'reserva', '✅ Tu hora está confirmada',
    public.fecha_txt(r.inicio) || ' con ' || bname || '. ¡Te esperamos!', 'horas', r.id);
end $$;

create or replace function public.rechazar_hora(p_reserva uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reservas; dest text;
begin
  r := public.reserva_staff(p_reserva);
  if r.estado not in ('esperando_abono', 'por_aprobar', 'agendada', 'confirmada') then raise exception 'Esta hora ya no está activa'; end if;
  dest := case when r.abono > 0 and r.pagado_con in ('link', 'transferencia', 'saldo') and r.estado <> 'esperando_abono' then 'saldo' end;
  update public.reservas set estado = 'anulada', anulada_at = now(), anulada_por = auth.uid(),
    motivo = coalesce(nullif(trim(p_motivo), ''), 'Anulada por la barbería'), abono_destino = dest where id = r.id;
  if dest = 'saldo' then update public.profiles set saldo = saldo + r.abono where id = r.cliente_id; end if;
  perform public.avisar(auth.uid(), r.cliente_id, 'reserva', '❌ Tu hora fue anulada',
    public.fecha_txt(r.inicio) || coalesce(' · ' || nullif(trim(p_motivo), ''), '') ||
    case when dest = 'saldo' then '. Tu abono quedó como saldo a favor.' else '' end, 'horas', r.id);
  perform public.avisar_espera(r.barberia_id, r.barbero_id, r.inicio);
end $$;

-- Marcar Atendida (pasa sola a la Caja) o No vino.
create or replace function public.marcar_hora(p_reserva uuid, p_estado text, p_medio text default 'efectivo', p_propina int default 0)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reservas; nv int;
begin
  r := public.reserva_staff(p_reserva);
  if p_estado not in ('atendida', 'no_vino') then raise exception 'Estado no válido'; end if;
  if r.estado not in ('agendada', 'confirmada', 'por_aprobar', 'atendida', 'no_vino') then raise exception 'Esta hora no se puede marcar'; end if;
  if r.inicio > now() + interval '30 minutes' then raise exception 'Todavía no llega la hora'; end if;
  update public.reservas set estado = p_estado, expira_at = null,
    abono_destino = case when p_estado = 'no_vino' and abono > 0 and pagado_con in ('link', 'transferencia', 'saldo') then 'perdido' else abono_destino end
  where id = r.id;
  if p_estado = 'atendida' then
    insert into public.caja (barberia_id, barbero_id, reserva_id, fecha, servicio, monto, abono, medio, cliente_id, cliente_nombre, propina, created_by)
    select r.barberia_id, r.barbero_id, r.id, r.inicio,
           (select string_agg(x ->> 'nombre', ' + ') from jsonb_array_elements(r.servicios) x),
           r.total, case when r.pagado_con in ('link', 'transferencia', 'saldo') then r.abono else 0 end,
           case when p_medio = 'transferencia' then 'transferencia' else 'efectivo' end,
           r.cliente_id, coalesce((select nombre from public.profiles where id = r.cliente_id), r.cliente_nombre),
           greatest(0, coalesce(p_propina, 0)), auth.uid()
    on conflict (reserva_id) do nothing;
  else
    delete from public.caja where reserva_id = r.id;
    select count(*) into nv from public.reservas where cliente_id = r.cliente_id and estado = 'no_vino';
    if nv >= 3 then
      perform public.avisar(null, (select owner_id from public.barberias where id = r.barberia_id), 'aviso',
        '⚠️ Cliente con ' || nv || ' "No vino"', coalesce((select nombre from public.profiles where id = r.cliente_id), 'Un cliente') ||
        ' ya faltó ' || nv || ' veces. Puedes bloquearlo para reservar en Clientes.', 'clientes');
    end if;
  end if;
end $$;

-- Mover una hora (otro horario u otro barbero).
create or replace function public.mover_hora(p_reserva uuid, p_barbero uuid, p_inicio timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; r public.reservas; bar public.profiles; fin_ timestamptz;
begin
  r := public.reserva_staff(p_reserva);
  me := public.yo();
  if r.estado not in ('esperando_abono', 'por_aprobar', 'agendada', 'confirmada') then raise exception 'Esta hora ya no está activa'; end if;
  select * into bar from public.profiles where id = coalesce(p_barbero, r.barbero_id) and barberia_id = r.barberia_id and role in ('owner', 'barber');
  if bar.id is null then raise exception 'Barbero no encontrado'; end if;
  if me.role = 'barber' and bar.id <> me.id then raise exception 'Solo el dueño puede pasar una hora a otro barbero'; end if;
  if p_inicio < now() then raise exception 'Esa hora ya pasó'; end if;
  fin_ := p_inicio + (r.fin - r.inicio);
  begin
    update public.reservas set barbero_id = bar.id, inicio = p_inicio, fin = fin_, recordado24 = false, recordado2 = false where id = r.id;
  exception when exclusion_violation then raise exception 'Esa hora ya está ocupada';
  end;
  perform public.avisar(auth.uid(), r.cliente_id, 'reserva', '🔁 Tu hora cambió',
    'Ahora es el ' || public.fecha_txt(p_inicio) || ' con ' || public.nombre_de(bar) || '.', 'horas', r.id);
end $$;

-- Hora creada por el equipo (cliente que escribió, llamó o llegó). Sin restricciones de horario.
create or replace function public.crear_hora(p_barbero uuid, p_inicio timestamptz, p_servicios uuid[], p_cliente uuid,
                                             p_nombre text default null, p_minutos int default null, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.profiles; bar public.profiles; c public.profiles; dur int; tot int; items jsonb; r public.reservas;
begin
  me := public.yo_activo();
  if not public.es_staff(me) then raise exception 'Solo la barbería'; end if;
  select * into bar from public.profiles where id = p_barbero and barberia_id = me.barberia_id and role in ('owner', 'barber');
  if bar.id is null then raise exception 'Barbero no encontrado'; end if;
  if me.role = 'barber' and bar.id <> me.id then raise exception 'Solo puedes agendar en tu calendario'; end if;
  if p_cliente is not null then
    select * into c from public.profiles where id = p_cliente and barberia_id = me.barberia_id and role = 'client';
    if c.id is null then raise exception 'Cliente no encontrado'; end if;
  elsif coalesce(trim(p_nombre), '') = '' then raise exception 'Elige un cliente o escribe un nombre';
  end if;
  select coalesce(sum(s.duracion), 0), coalesce(sum(s.precio), 0),
         coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'precio', s.precio, 'duracion', s.duracion)), '[]'::jsonb)
    into dur, tot, items
  from unnest(coalesce(p_servicios, '{}')) as u(id) join public.servicios s on s.id = u.id where s.barberia_id = me.barberia_id;
  dur := coalesce(nullif(p_minutos, 0), nullif(dur, 0), 30);
  if dur not between 5 and 480 then raise exception 'Duración no válida'; end if;
  begin
    insert into public.reservas (barberia_id, barbero_id, cliente_id, cliente_nombre, inicio, fin, servicios, total, abono,
                                 pagado_con, estado, confirmada_at, creada_por, nota)
    values (me.barberia_id, bar.id, c.id, case when c.id is null then left(trim(p_nombre), 60) end, p_inicio,
            p_inicio + make_interval(mins => dur), items, tot, 0, 'interno', 'confirmada', now(), me.id, left(p_nota, 200))
    returning * into r;
  exception when exclusion_violation then raise exception 'Esa hora ya está ocupada';
  end;
  if c.id is not null then
    perform public.avisar(me.id, c.id, 'reserva', '📅 Te agendamos una hora',
      public.fecha_txt(p_inicio) || ' con ' || public.nombre_de(bar) || '. ¡Te esperamos!', 'horas', r.id);
  end if;
  return to_jsonb(r) - 'comprobante';
end $$;

-- Historial de avisos de una hora (quién lo vio y cuándo).
create or replace function public.avisos_de_reserva(p_reserva uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles; r public.reservas;
begin
  me := public.yo_activo();
  select * into r from public.reservas where id = p_reserva;
  if r.id is null or not (r.cliente_id = me.id or r.barbero_id = me.id or (me.role = 'owner' and r.barberia_id = me.barberia_id)) then
    raise exception 'Sin permiso';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('titulo', a.titulo, 'para', public.nombre_de(p), 'created_at', a.created_at,
            'recibido', a.push = 'enviado' or a.entregado_at is not null, 'visto_at', a.visto_at) order by a.created_at), '[]'::jsonb)
          from public.avisos a join public.profiles p on p.id = a.para where a.reserva_id = r.id);
end $$;

-- Bloqueos de horario (feriados, vacaciones, "hoy salgo antes").
create or replace function public.guardar_bloqueo(p_desde timestamptz, p_hasta timestamptz, p_barbero uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := public.yo_activo();
  if not public.es_staff(me) then raise exception 'Solo la barbería'; end if;
  if me.role = 'barber' and p_barbero is distinct from me.id then raise exception 'Solo puedes bloquear tu calendario'; end if;
  if p_barbero is not null and not exists (select 1 from public.profiles where id = p_barbero and barberia_id = me.barberia_id) then
    raise exception 'Barbero no encontrado';
  end if;
  if p_hasta <= p_desde or p_hasta - p_desde > interval '90 days' then raise exception 'Rango no válido'; end if;
  insert into public.bloqueos (barberia_id, barbero_id, desde, hasta, motivo, created_by)
  values (me.barberia_id, p_barbero, p_desde, p_hasta, left(p_motivo, 80), me.id);
end $$;

create or replace function public.borrar_bloqueo(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := public.yo_activo();
  delete from public.bloqueos where id = p_id and barberia_id = me.barberia_id
    and (me.role = 'owner' or (me.role = 'barber' and barbero_id = me.id));
end $$;

-- ---------------------------------------------------------------------
-- Caja de cortes
-- ---------------------------------------------------------------------
create table if not exists public.caja (
  id              uuid primary key default gen_random_uuid(),
  barberia_id     uuid not null references public.barberias (id) on delete cascade,
  barbero_id      uuid not null references public.profiles (id) on delete cascade,
  reserva_id      uuid unique references public.reservas (id) on delete set null,
  fecha           timestamptz not null default now(),
  servicio        text not null,
  monto           int not null check (monto between 0 and 10000000),
  abono           int not null default 0,
  medio           text not null default 'efectivo' check (medio in ('efectivo', 'transferencia')),
  cliente_id      uuid references public.profiles (id) on delete set null,
  cliente_nombre  text,
  propina         int not null default 0,
  nota            text,
  created_by      uuid,
  created_at      timestamptz not null default now()
);
create index if not exists caja_idx on public.caja (barberia_id, fecha desc);
create index if not exists caja_barbero_idx on public.caja (barbero_id, fecha desc);
alter table public.caja enable row level security;

create or replace function public.anotar_corte(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; bar uuid := coalesce(nullif(p ->> 'barbero_id', '')::uuid, auth.uid()); cli uuid := nullif(p ->> 'cliente_id', '')::uuid;
begin
  me := public.yo_activo();
  if not public.es_staff(me) then raise exception 'Solo la barbería'; end if;
  if me.role = 'barber' and bar <> me.id then raise exception 'Solo tu caja'; end if;
  if not exists (select 1 from public.profiles where id = bar and barberia_id = me.barberia_id and role in ('owner', 'barber')) then
    raise exception 'Barbero no encontrado';
  end if;
  if cli is not null and not exists (select 1 from public.profiles where id = cli and barberia_id = me.barberia_id) then cli := null; end if;
  if coalesce(trim(p ->> 'servicio'), '') = '' then raise exception 'Falta el servicio'; end if;
  if coalesce((p ->> 'monto')::int, -1) < 0 then raise exception 'Falta el monto'; end if;
  if nullif(p ->> 'id', '') is not null then
    update public.caja set servicio = left(trim(p ->> 'servicio'), 80), monto = (p ->> 'monto')::int,
      medio = case when p ->> 'medio' = 'transferencia' then 'transferencia' else 'efectivo' end,
      cliente_id = cli, cliente_nombre = coalesce(left(nullif(trim(p ->> 'cliente_nombre'), ''), 60), (select nombre from public.profiles where id = cli)),
      propina = greatest(0, coalesce((p ->> 'propina')::int, 0)), nota = left(p ->> 'nota', 200)
    where id = (p ->> 'id')::uuid and barberia_id = me.barberia_id and (me.role = 'owner' or barbero_id = me.id);
  else
    insert into public.caja (barberia_id, barbero_id, fecha, servicio, monto, medio, cliente_id, cliente_nombre, propina, nota, created_by)
    values (me.barberia_id, bar, coalesce(nullif(p ->> 'fecha', '')::timestamptz, now()), left(trim(p ->> 'servicio'), 80), (p ->> 'monto')::int,
            case when p ->> 'medio' = 'transferencia' then 'transferencia' else 'efectivo' end, cli,
            coalesce(left(nullif(trim(p ->> 'cliente_nombre'), ''), 60), (select nombre from public.profiles where id = cli)),
            greatest(0, coalesce((p ->> 'propina')::int, 0)), left(p ->> 'nota', 200), me.id);
  end if;
end $$;

create or replace function public.borrar_corte(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := public.yo_activo();
  delete from public.caja where id = p_id and barberia_id = me.barberia_id and (me.role = 'owner' or barbero_id = me.id);
end $$;

-- Free: solo el día de hoy. Premium: cualquier rango y (dueño) todos los barberos.
create or replace function public.ver_caja(p_desde date, p_hasta date, p_barbero uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles; prem boolean; hoy date := (now() at time zone public.tz())::date; quien uuid;
begin
  me := public.yo_activo();
  if not public.es_staff(me) then raise exception 'Solo la barbería'; end if;
  prem := public.barberia_premium(me.barberia_id);
  if not prem and (p_desde <> hoy or p_hasta <> hoy) then raise exception 'Los reportes de caja son Premium ⭐'; end if;
  if me.role = 'barber' then quien := me.id;
  elsif p_barbero is null and not prem then quien := me.id;
  else quien := p_barbero; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'barbero_id', k.barbero_id, 'barbero', public.nombre_de(p),
      'fecha', k.fecha, 'servicio', k.servicio, 'monto', k.monto, 'abono', k.abono, 'medio', k.medio, 'cliente_id', k.cliente_id,
      'cliente', k.cliente_nombre, 'propina', k.propina, 'nota', k.nota, 'reserva_id', k.reserva_id) order by k.fecha desc), '[]'::jsonb)
    from public.caja k join public.profiles p on p.id = k.barbero_id
    where k.barberia_id = me.barberia_id and (quien is null or k.barbero_id = quien)
      and (k.fecha at time zone public.tz())::date between p_desde and p_hasta);
end $$;

-- ---------------------------------------------------------------------
-- Ajustes de la barbería (dueño), equipo, servicios y ofertas
-- ---------------------------------------------------------------------
create or replace function public.horario_valido(h jsonb) returns boolean
language plpgsql immutable as $$
declare d jsonb;
begin
  if jsonb_typeof(h) <> 'array' or jsonb_array_length(h) <> 7 then return false; end if;
  for d in select * from jsonb_array_elements(h) loop
    if coalesce(d ->> 'e', '') not in ('a', 'c', 'x') then return false; end if;
    if d ->> 'e' <> 'x' then
      if (d ->> 'i') !~ '^\d\d:\d\d$' or (d ->> 'f') !~ '^\d\d:\d\d$' or (d ->> 'i') >= (d ->> 'f') then return false; end if;
      if coalesce(d ->> 'ci', '') <> '' and ((d ->> 'ci') !~ '^\d\d:\d\d$' or (d ->> 'cf') !~ '^\d\d:\d\d$' or (d ->> 'ci') >= (d ->> 'cf')) then
        return false;
      end if;
    end if;
  end loop;
  return true;
end $$;

create or replace function public.img_ok(t text, maxlen int) returns boolean
language sql immutable as $$
  select t is null or t = '' or (t ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' and length(t) <= maxlen)
$$;

create or replace function public.guardar_barberia(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; prem boolean;
begin
  me := public.yo_activo();
  if me.role <> 'owner' then raise exception 'Solo el dueño'; end if;
  prem := public.is_premium(me.id);
  if p ? 'horario' and not public.horario_valido(p -> 'horario') then raise exception 'Horario no válido'; end if;
  if not public.img_ok(p ->> 'logo', 30000) or not public.img_ok(p ->> 'portada', 150000) then raise exception 'Imagen muy pesada'; end if;
  if coalesce(p ->> 'link_pago', '') <> '' and p ->> 'link_pago' !~* '^https://' then raise exception 'El link de pago debe empezar con https://'; end if;
  if (coalesce(p ->> 'color', '') <> '' or coalesce(p ->> 'portada', '') <> '') and not prem then
    raise exception 'Colores y portada son Premium ⭐';
  end if;
  update public.barberias set
    nombre = coalesce(left(nullif(trim(p ->> 'nombre'), ''), 80), nombre),
    direccion = case when p ? 'direccion' then left(nullif(trim(p ->> 'direccion'), ''), 160) else direccion end,
    whatsapp = case when p ? 'whatsapp' then nullif(regexp_replace(coalesce(p ->> 'whatsapp', ''), '[^0-9+]', '', 'g'), '') else whatsapp end,
    abono = case when p ? 'abono' then greatest(0, least(100000, (p ->> 'abono')::int)) else abono end,
    link_pago = case when p ? 'link_pago' then nullif(trim(p ->> 'link_pago'), '') else link_pago end,
    datos_transferencia = case when p ? 'datos_transferencia' then left(nullif(trim(p ->> 'datos_transferencia'), ''), 400) else datos_transferencia end,
    bienvenida = case when p ? 'bienvenida' then left(nullif(trim(p ->> 'bienvenida'), ''), 300) else bienvenida end,
    horario = case when p ? 'horario' then p -> 'horario' else horario end,
    logo = case when p ? 'logo' then nullif(p ->> 'logo', '') else logo end,
    color = case when p ? 'color' then nullif(p ->> 'color', '') else color end,
    portada = case when p ? 'portada' then nullif(p ->> 'portada', '') else portada end,
    comision = case when p ? 'comision' then greatest(0, least(100, (p ->> 'comision')::int)) else comision end,
    sellos_meta = case when p ? 'sellos_meta' then greatest(3, least(30, (p ->> 'sellos_meta')::int)) else sellos_meta end,
    barberos_crean_clientes = case when p ? 'barberos_crean_clientes' then coalesce((p ->> 'barberos_crean_clientes')::boolean, true) else barberos_crean_clientes end
  where id = me.barberia_id;
  return public.mi_cuenta();
end $$;

-- Abrir / cerrar ("agenda llena") la agenda a clientes: cada barbero la suya; el dueño, la de cualquiera de su equipo.
drop function if exists public.set_agenda_abierta(boolean);
create or replace function public.set_agenda_abierta(p_abierta boolean, p_barbero uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; quien uuid;
begin
  me := public.yo_activo();
  if not public.es_staff(me) then raise exception 'Solo la barbería'; end if;
  quien := coalesce(p_barbero, me.id);
  if quien <> me.id and me.role <> 'owner' then raise exception 'Solo el dueño puede cambiar la agenda de otro barbero'; end if;
  update public.profiles set agenda_abierta = coalesce(p_abierta, false)
  where id = quien and barberia_id = me.barberia_id and role in ('owner', 'barber');
  if not found then raise exception 'Barbero no encontrado'; end if;
end $$;

-- Mi perfil (todos).
create or replace function public.guardar_perfil(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; prem boolean;
begin
  me := public.yo_activo();
  prem := public.is_premium(me.id) or (public.es_staff(me) and public.barberia_premium(me.barberia_id));
  if not public.img_ok(p ->> 'foto', 40000) then raise exception 'Foto muy pesada'; end if;
  if p ? 'favorito' and nullif(p ->> 'favorito', '') is not null then
    if not prem then raise exception 'Barbero favorito es Premium ⭐'; end if;
    if not exists (select 1 from public.profiles where id = (p ->> 'favorito')::uuid and barberia_id = me.barberia_id and role in ('owner', 'barber')) then
      raise exception 'Barbero no encontrado';
    end if;
  end if;
  update public.profiles set
    nombre = coalesce(left(nullif(trim(p ->> 'nombre'), ''), 80), nombre),
    telefono = case when p ? 'telefono' then nullif(regexp_replace(coalesce(p ->> 'telefono', ''), '[^0-9+]', '', 'g'), '') else telefono end,
    avatar = case when p ? 'avatar' then coalesce(left(nullif(p ->> 'avatar', ''), 8), '🙂') else avatar end,
    foto = case when p ? 'foto' then nullif(p ->> 'foto', '') else foto end,
    color = case when p ? 'color' then nullif(p ->> 'color', '') else color end,
    cumple = case when p ? 'cumple' then nullif(p ->> 'cumple', '')::date else cumple end,
    descripcion = case when p ? 'descripcion' and public.es_staff(me) then left(nullif(trim(p ->> 'descripcion'), ''), 200) else descripcion end,
    favorito = case when p ? 'favorito' then nullif(p ->> 'favorito', '')::uuid else favorito end,
    tour_visto = case when p ? 'tour_visto' then coalesce((p ->> 'tour_visto')::boolean, tour_visto) else tour_visto end
  where id = me.id;
  return public.mi_cuenta();
end $$;

-- Equipo (dueño): activar/desactivar, y en Premium editar perfil y horario propio de cada barbero.
create or replace function public.guardar_barbero(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; prem boolean;
begin
  me := public.yo_activo();
  if me.role <> 'owner' then raise exception 'Solo el dueño'; end if;
  if not exists (select 1 from public.profiles where id = p_id and barberia_id = me.barberia_id and role in ('barber', 'owner')) then
    raise exception 'Barbero no encontrado';
  end if;
  prem := public.is_premium(me.id);
  if (p ? 'nombre' or p ? 'foto' or p ? 'descripcion' or p ? 'horario') and not prem and p_id <> me.id then
    raise exception 'Editar el perfil y horario de tus barberos es Premium ⭐';
  end if;
  if p ? 'horario' and p -> 'horario' <> 'null'::jsonb and not public.horario_valido(p -> 'horario') then raise exception 'Horario no válido'; end if;
  if p ? 'horario' and p -> 'horario' <> 'null'::jsonb and not prem then raise exception 'Horario por barbero es Premium ⭐'; end if;
  if not public.img_ok(p ->> 'foto', 40000) then raise exception 'Foto muy pesada'; end if;
  update public.profiles set
    activo = case when p ? 'activo' and role = 'barber' then coalesce((p ->> 'activo')::boolean, activo) else activo end,
    nombre = coalesce(left(nullif(trim(p ->> 'nombre'), ''), 80), nombre),
    foto = case when p ? 'foto' then nullif(p ->> 'foto', '') else foto end,
    descripcion = case when p ? 'descripcion' then left(nullif(trim(p ->> 'descripcion'), ''), 200) else descripcion end,
    horario = case when p ? 'horario' then case when p -> 'horario' = 'null'::jsonb then null else p -> 'horario' end else horario end,
    telefono = case when p ? 'telefono' then nullif(regexp_replace(coalesce(p ->> 'telefono', ''), '[^0-9+]', '', 'g'), '') else telefono end
  where id = p_id;
end $$;

create or replace function public.guardar_servicio(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; prem boolean; sid uuid := nullif(p ->> 'id', '')::uuid; bars uuid[];
begin
  me := public.yo_activo();
  if me.role <> 'owner' then raise exception 'Solo el dueño administra los servicios'; end if;
  prem := public.is_premium(me.id);
  if coalesce(trim(p ->> 'nombre'), '') = '' then raise exception 'Falta el nombre'; end if;
  if coalesce((p ->> 'duracion')::int, 0) not between 5 and 480 then raise exception 'Duración entre 5 y 480 minutos'; end if;
  if coalesce(p ->> 'foto', '') <> '' and not prem then raise exception 'Fotos de servicios son Premium ⭐'; end if;
  if not public.img_ok(p ->> 'foto', 60000) then raise exception 'Foto muy pesada'; end if;
  if jsonb_typeof(p -> 'barberos') = 'array' and jsonb_array_length(p -> 'barberos') > 0 then
    if not prem then raise exception 'Elegir qué barbero hace cada servicio es Premium ⭐'; end if;
    select array_agg(x::uuid) into bars from jsonb_array_elements_text(p -> 'barberos') x
    where exists (select 1 from public.profiles where id = x::uuid and barberia_id = me.barberia_id);
  end if;
  if sid is null then
    if (select count(*) from public.servicios where barberia_id = me.barberia_id) >= public.limite('servicios', prem) then
      raise exception 'Llegaste al máximo de % servicios%', public.limite('servicios', prem), case when prem then '' else '. Con Premium son ilimitados.' end;
    end if;
    insert into public.servicios (barberia_id, nombre, precio, duracion, categoria, descripcion, foto, visible, orden, barberos)
    values (me.barberia_id, left(trim(p ->> 'nombre'), 60), greatest(0, coalesce((p ->> 'precio')::int, 0)), (p ->> 'duracion')::int,
            left(nullif(trim(p ->> 'categoria'), ''), 30), left(nullif(trim(p ->> 'descripcion'), ''), 200), nullif(p ->> 'foto', ''),
            coalesce((p ->> 'visible')::boolean, true),
            coalesce((p ->> 'orden')::int, (select coalesce(max(orden), 0) + 1 from public.servicios where barberia_id = me.barberia_id)), bars)
    returning id into sid;
  else
    update public.servicios set nombre = left(trim(p ->> 'nombre'), 60), precio = greatest(0, coalesce((p ->> 'precio')::int, 0)),
      duracion = (p ->> 'duracion')::int, categoria = left(nullif(trim(p ->> 'categoria'), ''), 30),
      descripcion = left(nullif(trim(p ->> 'descripcion'), ''), 200),
      foto = case when p ? 'foto' then nullif(p ->> 'foto', '') else foto end,
      visible = coalesce((p ->> 'visible')::boolean, visible), orden = coalesce((p ->> 'orden')::int, orden), barberos = bars
    where id = sid and barberia_id = me.barberia_id;
  end if;
  return sid;
end $$;

create or replace function public.borrar_servicio(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (public.yo_activo()).role <> 'owner' then raise exception 'Solo el dueño'; end if;
  delete from public.servicios where id = p_id and barberia_id = (public.yo()).barberia_id;
end $$;

create or replace function public.guardar_oferta(p jsonb, p_avisar boolean default true) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; prem boolean; oid uuid := nullif(p ->> 'id', '')::uuid; o public.ofertas; c record; bname text;
begin
  me := public.yo_activo();
  if me.role <> 'owner' then raise exception 'Solo el dueño publica ofertas'; end if;
  prem := public.is_premium(me.id);
  if coalesce(trim(p ->> 'titulo'), '') = '' then raise exception 'Falta el título'; end if;
  if coalesce((p ->> 'vip')::boolean, false) and not prem then raise exception 'Ofertas VIP son Premium ⭐'; end if;
  if not public.img_ok(p ->> 'imagen', 120000) then raise exception 'Imagen muy pesada'; end if;
  if oid is null then
    if (select count(*) from public.ofertas where barberia_id = me.barberia_id and activa
        and (hasta is null or hasta >= current_date)) >= public.limite('ofertas', prem) then
      raise exception 'Puedes tener % oferta(s) activa(s)%', public.limite('ofertas', prem), case when prem then '' else '. Con Premium, ilimitadas.' end;
    end if;
    insert into public.ofertas (barberia_id, titulo, detalle, precio, imagen, vip, hasta)
    values (me.barberia_id, left(trim(p ->> 'titulo'), 80), left(p ->> 'detalle', 400), left(p ->> 'precio', 30),
            nullif(p ->> 'imagen', ''), coalesce((p ->> 'vip')::boolean, false), nullif(p ->> 'hasta', '')::date)
    returning * into o;
    if p_avisar then
      select nombre into bname from public.barberias where id = me.barberia_id;
      for c in select id from public.profiles where barberia_id = me.barberia_id and role = 'client' and not suspended
               and (not o.vip or public.is_premium(id)) loop
        perform public.avisar(me.id, c.id, 'oferta', (case when o.vip then '⭐ Oferta VIP · ' else '🏷️ ' end) || o.titulo,
          coalesce(o.detalle, bname), 'ofertas');
      end loop;
    end if;
    oid := o.id;
  else
    update public.ofertas set titulo = left(trim(p ->> 'titulo'), 80), detalle = left(p ->> 'detalle', 400), precio = left(p ->> 'precio', 30),
      imagen = case when p ? 'imagen' then nullif(p ->> 'imagen', '') else imagen end, vip = coalesce((p ->> 'vip')::boolean, vip),
      activa = coalesce((p ->> 'activa')::boolean, activa), hasta = nullif(p ->> 'hasta', '')::date
    where id = oid and barberia_id = me.barberia_id;
  end if;
  return oid;
end $$;

create or replace function public.borrar_oferta(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (public.yo_activo()).role <> 'owner' then raise exception 'Solo el dueño'; end if;
  delete from public.ofertas where id = p_id and barberia_id = (public.yo()).barberia_id;
end $$;

-- ---------------------------------------------------------------------
-- Clientes (equipo)
-- ---------------------------------------------------------------------
create or replace function public.mis_clientes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := public.yo_activo();
  if not public.es_staff(me) then raise exception 'Solo la barbería'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'nombre', c.nombre, 'email', case when me.role = 'owner' then c.email end, 'telefono', c.telefono,
      'avatar', c.avatar, 'foto', c.foto, 'premium', public.is_premium(c.id), 'premium_until', c.premium_until,
      'saldo', c.saldo, 'bloqueado', c.bloqueado, 'notas', c.notas, 'cumple', c.cumple, 'clave_temporal', c.clave_temporal,
      'created_at', c.created_at, 'last_seen', c.last_seen,
      'visitas', (select count(*) from public.reservas r where r.cliente_id = c.id and r.estado = 'atendida'),
      'no_vino', (select count(*) from public.reservas r where r.cliente_id = c.id and r.estado = 'no_vino'),
      'ultima', (select max(r.inicio) from public.reservas r where r.cliente_id = c.id and r.estado = 'atendida'),
      'proxima', (select min(r.inicio) from public.reservas r where r.cliente_id = c.id and r.inicio > now()
                  and r.estado in ('agendada', 'confirmada', 'por_aprobar', 'esperando_abono')),
      'creado_por', (select public.nombre_de(x) from public.profiles x where x.id = c.created_by),
      'ultimo_barbero', (select public.nombre_de(x) from public.caja k join public.profiles x on x.id = k.barbero_id
                         where k.cliente_id = c.id order by k.fecha desc limit 1),
      'ultimo_corte', (select max(k.fecha) from public.caja k where k.cliente_id = c.id),
      'habitual', (select public.nombre_de(x) from public.caja k join public.profiles x on x.id = k.barbero_id
                   where k.cliente_id = c.id group by x.id order by count(*) desc, max(k.fecha) desc limit 1),
      'habitual_veces', (select count(*) from public.caja k where k.cliente_id = c.id
                         group by k.barbero_id order by count(*) desc, max(k.fecha) desc limit 1))
      order by c.nombre), '[]'::jsonb)
    from public.profiles c where c.barberia_id = me.barberia_id and c.role = 'client');
end $$;

create or replace function public.guardar_cliente(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := public.yo_activo();
  if me.role <> 'owner' then raise exception 'Solo el dueño'; end if;
  update public.profiles set
    nombre = coalesce(left(nullif(trim(p ->> 'nombre'), ''), 80), nombre),
    telefono = case when p ? 'telefono' then nullif(regexp_replace(coalesce(p ->> 'telefono', ''), '[^0-9+]', '', 'g'), '') else telefono end,
    notas = case when p ? 'notas' then left(nullif(trim(p ->> 'notas'), ''), 400) else notas end,
    bloqueado = case when p ? 'bloqueado' then coalesce((p ->> 'bloqueado')::boolean, false) else bloqueado end,
    saldo = case when p ? 'saldo' then greatest(0, least(1000000, (p ->> 'saldo')::int)) else saldo end
  where id = p_id and barberia_id = me.barberia_id and role = 'client';
end $$;

-- Sellos (Premium de la barbería): cortes atendidos y cuántos faltan para el gratis.
create or replace function public.mis_sellos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles; b public.barberias; n int;
begin
  me := public.yo_activo();
  select * into b from public.barberias where id = me.barberia_id;
  if not public.barberia_premium(b.id) then return null; end if;
  select count(*) into n from public.reservas where cliente_id = me.id and estado = 'atendida';
  return jsonb_build_object('total', n, 'meta', b.sellos_meta, 'actual', n % b.sellos_meta, 'premios', n / b.sellos_meta);
end $$;

-- ---------------------------------------------------------------------
-- Mensajes con ✓ Enviado · ✓✓ Recibido · ✓✓ Visto
-- Regla: quien escribe a alguien de igual o mayor rango, máx. 3 seguidos hasta que le contesten.
-- El cliente Premium y el administrador escriben sin límite.
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  sender        uuid not null references public.profiles (id) on delete cascade,
  recipient     uuid not null references public.profiles (id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 1000),
  imagen        text,
  reserva_id    uuid references public.reservas (id) on delete set null,
  sistema       boolean not null default false,
  created_at    timestamptz not null default now(),
  delivered_at  timestamptz,
  read_at       timestamptz
);
create index if not exists messages_pair_idx on public.messages (least(sender, recipient), greatest(sender, recipient), created_at desc);
create index if not exists messages_recipient_idx on public.messages (recipient, read_at);
alter table public.messages enable row level security;

create table if not exists public.blocks (
  blocker     uuid not null references public.profiles (id) on delete cascade,
  blocked     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker, blocked)
);
alter table public.blocks enable row level security;

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid not null references public.profiles (id) on delete cascade,
  reported    uuid not null references public.profiles (id) on delete cascade,
  message_id  uuid references public.messages (id) on delete set null,
  reason      text not null,
  excerpt     text,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.reports enable row level security;

create or replace function public.puede_hablar(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select a <> b and exists (
    select 1 from public.profiles pa, public.profiles pb
    where pa.id = a and pb.id = b and not pa.suspended and not pb.suspended
      and ((pa.role = 'admin' and pb.role in ('owner', 'barber')) or (pb.role = 'admin' and pa.role in ('owner', 'barber'))
           or (pa.barberia_id = pb.barberia_id and pa.role <> 'admin' and pb.role <> 'admin'
               and not (pa.role = 'client' and pb.role = 'client'))))
$$;

-- Cuántos mensajes seguidos me quedan con "otro" (null = sin límite).
create or replace function public.chat_restantes(p_other uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case
    when me.role = 'admin' then null
    when public.rango(me.role) > public.rango(o.role) then null
    when me.role = 'client' and public.is_premium(me.id) then null
    else greatest(0, 3 - (select count(*) from public.messages m
      where m.sender = me.id and m.recipient = o.id and not m.sistema
        and m.created_at > coalesce((select max(x.created_at) from public.messages x where x.sender = o.id and x.recipient = me.id), '-infinity')))::int
  end
  from public.profiles me, public.profiles o where me.id = auth.uid() and o.id = p_other
$$;

create or replace function public.enviar_mensaje(p_to uuid, p_body text, p_reserva uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; txt text := trim(coalesce(p_body, '')); left_ int; m public.messages;
begin
  me := public.yo_activo();
  if txt = '' then raise exception 'Escribe un mensaje'; end if;
  if char_length(txt) > 1000 then raise exception 'Máximo 1000 caracteres'; end if;
  if not public.puede_hablar(me.id, p_to) then raise exception 'No puedes escribirle a esta cuenta'; end if;
  if exists (select 1 from public.blocks where (blocker = p_to and blocked = me.id) or (blocker = me.id and blocked = p_to)) then
    raise exception 'La conversación está bloqueada';
  end if;
  left_ := public.chat_restantes(p_to);
  if left_ is not null and left_ <= 0 then raise exception 'Ya enviaste 3 mensajes. Espera que te respondan 🙂'; end if;
  if me.role <> 'admin' and (select count(*) from public.messages where sender = me.id and created_at > now() - interval '1 day') >= 100 then
    raise exception 'Llegaste al máximo de 100 mensajes por día';
  end if;
  if p_reserva is not null and not exists (select 1 from public.reservas where id = p_reserva and (cliente_id = me.id or barbero_id = me.id or barberia_id = me.barberia_id)) then
    p_reserva := null;
  end if;
  if p_reserva is not null then
    txt := left('📅 ' || (select public.fecha_txt(inicio) from public.reservas where id = p_reserva) || ' · ' || txt, 1000);
  end if;
  insert into public.messages (sender, recipient, body, reserva_id) values (me.id, p_to, txt, p_reserva) returning * into m;
  perform public.avisar(me.id, p_to, 'chat',
    '💬 ' || public.nombre_de(me) || case when me.role = 'client' and public.is_premium(me.id) then ' ⭐' else '' end,
    txt, 'chat?con=' || me.id);
  return jsonb_build_object('id', m.id, 'restantes', public.chat_restantes(p_to));
end $$;

create or replace function public.chat_lista() returns jsonb
language sql stable security definer set search_path = '' as $$
  with mine as (
    select case when m.sender = auth.uid() then m.recipient else m.sender end as other, m.*
    from public.messages m where m.sender = auth.uid() or m.recipient = auth.uid()
  ), last as (
    select distinct on (other) other, body, created_at, sender = auth.uid() as mio, delivered_at, read_at, imagen is not null as foto
    from mine order by other, created_at desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'other', l.other, 'nombre', public.nombre_de(p), 'rol', p.role, 'avatar', p.avatar, 'foto', p.foto,
    'premium', p.role = 'client' and public.is_premium(p.id),
    'ultimo', case when l.foto then '🧾 ' else '' end || l.body, 'ultimo_at', l.created_at, 'mio', l.mio,
    'entregado', l.delivered_at is not null, 'leido', l.read_at is not null,
    'no_leidos', (select count(*) from public.messages x where x.sender = l.other and x.recipient = auth.uid() and x.read_at is null),
    'bloqueado', exists (select 1 from public.blocks b where b.blocker = auth.uid() and b.blocked = l.other))
    order by (p.role = 'client' and public.is_premium(p.id) and exists (select 1 from public.messages x where x.sender = l.other and x.recipient = auth.uid() and x.read_at is null)) desc,
             l.created_at desc), '[]'::jsonb)
  from last l join public.profiles p on p.id = l.other
$$;

create or replace function public.chat_mensajes(p_other uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  update public.messages set read_at = now(), delivered_at = coalesce(delivered_at, now())
  where sender = p_other and recipient = auth.uid() and read_at is null;
  update public.avisos set visto_at = now(), entregado_at = coalesce(entregado_at, now())
  where para = auth.uid() and de = p_other and tipo = 'chat' and visto_at is null;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'mio', m.sender = auth.uid(), 'body', m.body,
      'imagen', m.imagen is not null, 'reserva_id', m.reserva_id, 'created_at', m.created_at,
      'delivered_at', m.delivered_at, 'read_at', m.read_at) order by m.created_at), '[]'::jsonb)
    from (select * from public.messages x
          where (x.sender = auth.uid() and x.recipient = p_other) or (x.sender = p_other and x.recipient = auth.uid())
          order by x.created_at desc limit 150) m);
end $$;

create or replace function public.chat_imagen(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select imagen from public.messages where id = p_id and (sender = auth.uid() or recipient = auth.uid())
$$;

-- Con quién puedo iniciar una conversación.
create or replace function public.mis_contactos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := public.yo_activo();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', public.nombre_de(p), 'rol', p.role,
      'avatar', p.avatar, 'foto', p.foto) order by public.rango(p.role) desc, p.nombre), '[]'::jsonb)
    from public.profiles p where public.puede_hablar(me.id, p.id) and (me.role <> 'admin' or p.role = 'owner'));
end $$;

create or replace function public.bloquear_contacto(p_other uuid, p_bloquear boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_bloquear then insert into public.blocks (blocker, blocked) values (auth.uid(), p_other) on conflict do nothing;
  else delete from public.blocks where blocker = auth.uid() and blocked = p_other; end if;
end $$;

create or replace function public.reportar_mensaje(p_message uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_message and recipient = auth.uid();
  if m.id is null then raise exception 'Mensaje no encontrado'; end if;
  insert into public.reports (reporter, reported, message_id, reason, excerpt)
  values (auth.uid(), m.sender, m.id, left(coalesce(p_motivo, 'Sin motivo'), 200), left(m.body, 300));
  perform public.avisar(auth.uid(), public.admin_id(), 'aviso', '🚩 Nuevo reporte', left(m.body, 100), 'admin');
end $$;

-- ---------------------------------------------------------------------
-- Estadísticas de la barbería (dueño Premium; el barbero ve las suyas)
-- ---------------------------------------------------------------------
create or replace function public.estadisticas(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles; t0 timestamptz; t1 timestamptz; solo uuid;
begin
  me := public.yo_activo();
  if not public.es_staff(me) then raise exception 'Solo la barbería'; end if;
  if not public.barberia_premium(me.barberia_id) then raise exception 'Las estadísticas son Premium ⭐'; end if;
  solo := case when me.role = 'barber' then me.id end;
  t0 := (p_desde::timestamp) at time zone public.tz();
  t1 := ((p_hasta + 1)::timestamp) at time zone public.tz();
  return jsonb_build_object(
    'por_barbero', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select p.id, public.nombre_de(p) as nombre,
        (select count(*) from public.reservas r where r.barbero_id = p.id and r.inicio >= t0 and r.inicio < t1 and r.estado = 'atendida') as atendidas,
        (select count(*) from public.reservas r where r.barbero_id = p.id and r.inicio >= t0 and r.inicio < t1 and r.estado = 'no_vino') as no_vino,
        (select count(*) from public.reservas r where r.barbero_id = p.id and r.inicio >= t0 and r.inicio < t1 and r.estado = 'anulada' and r.cliente_id is not null) as anuladas,
        (select coalesce(sum(k.monto + k.propina), 0) from public.caja k where k.barbero_id = p.id and k.fecha >= t0 and k.fecha < t1) as ventas,
        (select coalesce(sum(k.propina), 0) from public.caja k where k.barbero_id = p.id and k.fecha >= t0 and k.fecha < t1) as propinas,
        (select coalesce(sum(r.abono), 0) from public.reservas r where r.barbero_id = p.id and r.inicio >= t0 and r.inicio < t1
           and r.pagado_con in ('link', 'transferencia') and (r.estado in ('atendida', 'no_vino', 'confirmada', 'agendada') or r.abono_destino = 'perdido')) as abonos
      from public.profiles p where p.barberia_id = me.barberia_id and p.role in ('owner', 'barber') and (solo is null or p.id = solo)) x),
    'servicios', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select s ->> 'nombre' as nombre, count(*) as veces, sum((s ->> 'precio')::int) as total
      from public.reservas r, jsonb_array_elements(r.servicios) s
      where r.barberia_id = me.barberia_id and r.estado = 'atendida' and r.inicio >= t0 and r.inicio < t1 and (solo is null or r.barbero_id = solo)
      group by 1 order by 2 desc limit 10) x),
    'clientes', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select coalesce(c.nombre, r.cliente_nombre) as nombre, count(*) as visitas, sum(r.total) as total
      from public.reservas r left join public.profiles c on c.id = r.cliente_id
      where r.barberia_id = me.barberia_id and r.estado = 'atendida' and r.inicio >= t0 and r.inicio < t1 and (solo is null or r.barbero_id = solo)
      group by 1 order by 2 desc, 3 desc limit 10) x),
    'horas', (select coalesce(jsonb_object_agg(h, n), '{}'::jsonb) from (
      select extract(hour from r.inicio at time zone public.tz())::int as h, count(*) as n from public.reservas r
      where r.barberia_id = me.barberia_id and r.estado in ('atendida', 'confirmada', 'agendada', 'no_vino') and r.inicio >= t0 and r.inicio < t1
        and (solo is null or r.barbero_id = solo) group by 1) x),
    'dias', (select coalesce(jsonb_object_agg(d, n), '{}'::jsonb) from (
      select extract(isodow from r.inicio at time zone public.tz())::int as d, count(*) as n from public.reservas r
      where r.barberia_id = me.barberia_id and r.estado in ('atendida', 'confirmada', 'agendada', 'no_vino') and r.inicio >= t0 and r.inicio < t1
        and (solo is null or r.barbero_id = solo) group by 1) x));
end $$;

-- ---------------------------------------------------------------------
-- Panel del super admin
-- ---------------------------------------------------------------------
create or replace function public.admin_resumen() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m0 timestamptz := date_trunc('month', now() at time zone public.tz()) at time zone public.tz();
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return jsonb_build_object(
    'barberias', (select count(*) from public.barberias),
    'barberias_premium', (select count(*) from public.barberias b where public.is_premium(b.owner_id)),
    'barberos', (select count(*) from public.profiles where role in ('owner', 'barber')),
    'clientes', (select count(*) from public.profiles where role = 'client'),
    'clientes_premium', (select count(*) from public.profiles where role = 'client' and public.is_premium(id)),
    'ingresos_mes', (select coalesce(sum(precio), 0) from public.licenses where not revoked and redeemed_at >= m0),
    'ingresos_total', (select coalesce(sum(precio), 0) from public.licenses where not revoked and redeemed_at is not null),
    'pendientes', (select count(*) from public.requests where status = 'pendiente'),
    'reportes', (select count(*) from public.reports where not resolved),
    'por_vencer', (select count(*) from public.profiles where plan = 'premium' and premium_until between now() and now() + interval '7 days'),
    'reservas_mes', (select count(*) from public.reservas where inicio >= m0 and estado <> 'anulada'),
    'dispositivos', (select count(*) from public.push_subscriptions),
    'db_mb', round(pg_database_size(current_database()) / 1048576.0, 1));
end $$;

-- Métricas por barbería: este mes vs el anterior (para el ranking y las recomendaciones).
create or replace function public.admin_barberias() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m0 timestamptz := date_trunc('month', now() at time zone public.tz()) at time zone public.tz();
        p0 timestamptz := (date_trunc('month', now() at time zone public.tz()) - interval '1 month') at time zone public.tz();
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return (select coalesce(jsonb_agg(x order by x.ventas desc), '[]'::jsonb) from (
    select b.id, b.codigo, b.nombre, b.logo, b.whatsapp, b.created_at, o.id as owner_id, o.email, o.nombre as dueno,
      o.suspended, public.is_premium(o.id) as premium, o.premium_until, o.trial_used, b.horario, b.abono,
      (select max(p.last_seen) from public.profiles p where p.barberia_id = b.id and p.role in ('owner', 'barber')) as ultima_actividad,
      (select count(*) from public.profiles p where p.barberia_id = b.id and p.role in ('owner', 'barber')) as barberos,
      (select count(*) from public.profiles p where p.barberia_id = b.id and p.role = 'client') as clientes,
      (select count(*) from public.profiles p where p.barberia_id = b.id and p.role = 'client' and p.created_at >= m0) as clientes_nuevos,
      (select count(*) from public.profiles p where p.barberia_id = b.id and p.role = 'client' and public.is_premium(p.id)) as clientes_premium,
      (select count(*) from public.servicios s where s.barberia_id = b.id) as servicios,
      (select count(*) from public.reservas r where r.barberia_id = b.id and r.inicio >= m0 and r.cliente_id is not null and r.estado <> 'anulada') as reservas,
      (select count(*) from public.reservas r where r.barberia_id = b.id and r.inicio >= p0 and r.inicio < m0 and r.cliente_id is not null and r.estado <> 'anulada') as reservas_ant,
      (select count(*) from public.reservas r where r.barberia_id = b.id and r.inicio >= m0 and r.estado = 'atendida') as atendidas,
      (select count(*) from public.reservas r where r.barberia_id = b.id and r.inicio >= m0 and r.estado = 'no_vino') as no_vino,
      (select count(*) from public.reservas r where r.barberia_id = b.id and r.inicio >= m0 and r.estado = 'anulada' and r.cliente_id is not null) as anuladas,
      (select count(*) from public.reservas r where r.barberia_id = b.id and r.inicio >= m0 and r.consultar) as fin_de_semana,
      (select coalesce(sum(k.monto + k.propina), 0) from public.caja k where k.barberia_id = b.id and k.fecha >= m0) as ventas,
      (select coalesce(sum(k.monto + k.propina), 0) from public.caja k where k.barberia_id = b.id and k.fecha >= p0 and k.fecha < m0) as ventas_ant,
      (select coalesce(sum(r.abono), 0) from public.reservas r where r.barberia_id = b.id and r.inicio >= m0 and r.pagado_con in ('link', 'transferencia')
         and r.estado <> 'anulada') as abonos,
      (select count(*) from public.ofertas f where f.barberia_id = b.id and f.activa) as ofertas
    from public.barberias b join public.profiles o on o.id = b.owner_id) x);
end $$;

create or replace function public.admin_barberia(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m0 timestamptz := date_trunc('month', now() at time zone public.tz()) at time zone public.tz();
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return jsonb_build_object(
    'equipo', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'email', p.email, 'rol', p.role,
        'activo', p.activo, 'last_seen', p.last_seen,
        'atendidas', (select count(*) from public.reservas r where r.barbero_id = p.id and r.inicio >= m0 and r.estado = 'atendida'),
        'ventas', (select coalesce(sum(k.monto + k.propina), 0) from public.caja k where k.barbero_id = p.id and k.fecha >= m0))
        order by p.role desc, p.nombre), '[]'::jsonb)
      from public.profiles p where p.barberia_id = p_id and p.role in ('owner', 'barber')),
    'servicios', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select s ->> 'nombre' as nombre, count(*) as veces from public.reservas r, jsonb_array_elements(r.servicios) s
      where r.barberia_id = p_id and r.estado = 'atendida' and r.inicio >= now() - interval '90 days' group by 1 order by 2 desc limit 8) x),
    'catalogo', (select coalesce(jsonb_agg(jsonb_build_object('nombre', s.nombre, 'precio', s.precio, 'duracion', s.duracion) order by s.orden), '[]'::jsonb)
      from public.servicios s where s.barberia_id = p_id),
    'horas', (select coalesce(jsonb_object_agg(h, n), '{}'::jsonb) from (
      select extract(hour from r.inicio at time zone public.tz())::int as h, count(*) as n from public.reservas r
      where r.barberia_id = p_id and r.estado <> 'anulada' and r.inicio >= now() - interval '90 days' group by 1) x),
    'dias', (select coalesce(jsonb_object_agg(d, n), '{}'::jsonb) from (
      select extract(isodow from r.inicio at time zone public.tz())::int as d, count(*) as n from public.reservas r
      where r.barberia_id = p_id and r.estado <> 'anulada' and r.inicio >= now() - interval '90 days' group by 1) x),
    'meses', (select coalesce(jsonb_agg(x order by x.mes), '[]'::jsonb) from (
      select to_char(date_trunc('month', k.fecha at time zone public.tz()), 'YYYY-MM') as mes, sum(k.monto + k.propina) as ventas, count(*) as cortes
      from public.caja k where k.barberia_id = p_id and k.fecha >= now() - interval '6 months' group by 1) x));
end $$;

create or replace function public.admin_usuarios(p_rol text default null, p_barberia uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'email', p.email, 'rol', p.role,
      'barberia', b.nombre, 'barberia_id', b.id, 'premium', public.is_premium(p.id), 'plan', p.plan, 'premium_until', p.premium_until,
      'suspended', p.suspended, 'telefono', p.telefono, 'last_seen', p.last_seen, 'created_at', p.created_at, 'trial_used', p.trial_used)
      order by b.nombre nulls first, public.rango(p.role) desc, p.nombre), '[]'::jsonb)
    from public.profiles p left join public.barberias b on b.id = p.barberia_id
    where p.role <> 'admin' and (p_rol is null or p.role = p_rol) and (p_barberia is null or p.barberia_id = p_barberia)
    limit 3000);
end $$;

create or replace function public.admin_keys() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'key', l.key, 'tipo', l.tipo, 'para', l.para_nombre,
      'meses', l.meses, 'precio', l.precio, 'nota', l.nota, 'origen', l.origen, 'created_at', l.created_at,
      'usada_por', coalesce(p.nombre, p.email), 'barberia', b.nombre, 'redeemed_at', l.redeemed_at,
      'inicio', l.inicio, 'termino', l.termino, 'revoked', l.revoked) order by l.created_at desc), '[]'::jsonb)
    from public.licenses l left join public.profiles p on p.id = l.redeemed_by left join public.barberias b on b.id = p.barberia_id);
end $$;

create or replace function public.admin_solicitudes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'note', r.note, 'status', r.status,
      'created_at', r.created_at, 'user_id', p.id, 'nombre', p.nombre, 'email', p.email, 'rol', p.role, 'barberia', b.nombre,
      'premium_until', p.premium_until) order by r.status = 'pendiente' desc, r.created_at desc), '[]'::jsonb)
    from (select * from public.requests order by created_at desc limit 200) r
    join public.profiles p on p.id = r.user_id left join public.barberias b on b.id = p.barberia_id);
end $$;

create or replace function public.admin_ingresos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return (select coalesce(jsonb_agg(x order by x.mes desc), '[]'::jsonb) from (
    select to_char(date_trunc('month', redeemed_at at time zone public.tz()), 'YYYY-MM') as mes,
      sum(precio) filter (where tipo = 'barberia') as barberias, sum(precio) filter (where tipo = 'cliente') as clientes,
      sum(precio) as total, count(*) as activaciones
    from public.licenses where redeemed_at is not null and not revoked group by 1 order by 1 desc limit 12) x);
end $$;

-- Avisos masivos del admin (con contador de quién lo vio).
create or replace function public.admin_difundir(p_titulo text, p_cuerpo text, p_para text) returns int
language plpgsql security definer set search_path = '' as $$
declare d uuid := gen_random_uuid(); n int;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if coalesce(trim(p_titulo), '') = '' then raise exception 'Falta el título'; end if;
  insert into public.avisos (de, para, tipo, titulo, cuerpo, url, difusion)
  select auth.uid(), p.id, 'difusion', left(trim(p_titulo), 90), left(coalesce(p_cuerpo, ''), 300), 'avisos', d
  from public.profiles p
  where not p.suspended and p.role <> 'admin'
    and (p_para = 'todos'
         or (p_para = 'barberias' and p.role = 'owner')
         or (p_para = 'equipos' and p.role in ('owner', 'barber'))
         or (p_para = 'clientes' and p.role = 'client')
         or (p_para = 'barberias_free' and p.role = 'owner' and not public.is_premium(p.id))
         or (p_para = 'barberias_premium' and p.role = 'owner' and public.is_premium(p.id))
         or (p_para like 'barberia:%' and p.barberia_id::text = substr(p_para, 10)));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.admin_difusiones() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select a.difusion as id, min(a.titulo) as titulo, min(a.cuerpo) as cuerpo, min(a.created_at) as created_at, count(*) as total,
      count(*) filter (where a.push = 'enviado' or a.entregado_at is not null) as recibidos, count(a.visto_at) as vistos,
      coalesce(jsonb_agg(jsonb_build_object('nombre', public.nombre_de(p), 'visto_at', a.visto_at) order by a.visto_at nulls last), '[]'::jsonb) as detalle
    from public.avisos a join public.profiles p on p.id = a.para
    where a.de = auth.uid() and a.difusion is not null and a.created_at > now() - interval '60 days'
    group by a.difusion order by min(a.created_at) desc limit 30) x);
end $$;

create or replace function public.admin_reportes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'excerpt', r.excerpt, 'created_at', r.created_at,
      'de', public.nombre_de(a), 'contra', public.nombre_de(b), 'contra_id', b.id) order by r.created_at desc), '[]'::jsonb)
    from public.reports r join public.profiles a on a.id = r.reporter join public.profiles b on b.id = r.reported where not r.resolved);
end $$;

create or replace function public.admin_resolver_reporte(p_id uuid, p_suspender boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reports;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  update public.reports set resolved = true where id = p_id returning * into r;
  if p_suspender then update public.profiles set suspended = true where id = r.reported and role <> 'admin'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Tareas automáticas
-- ---------------------------------------------------------------------
-- Recordatorios 24 h y 2 h antes (si la barbería o el cliente es Premium).
create or replace function public.recordatorios() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in update public.reservas x set recordado24 = true
           where x.estado in ('agendada', 'confirmada') and not x.recordado24 and x.cliente_id is not null
             and x.inicio between now() + interval '2 hours 30 minutes' and now() + interval '24 hours'
             and x.created_at < x.inicio - interval '24 hours'
             and (public.barberia_premium(x.barberia_id) or public.is_premium(x.cliente_id))
           returning x.* loop
    perform public.avisar(null, r.cliente_id, 'reserva', '⏰ Mañana tienes hora',
      public.fecha_txt(r.inicio) || '. Si no puedes ir, anula con tiempo para no perder tu abono.', 'horas', r.id);
    n := n + 1;
  end loop;
  for r in update public.reservas x set recordado2 = true, recordado24 = true
           where x.estado in ('agendada', 'confirmada') and not x.recordado2 and x.cliente_id is not null
             and x.inicio between now() and now() + interval '2 hours'
             and x.created_at < x.inicio - interval '2 hours'
             and (public.barberia_premium(x.barberia_id) or public.is_premium(x.cliente_id))
           returning x.* loop
    perform public.avisar(null, r.cliente_id, 'reserva', '💈 Tu hora es en 2 horas', public.fecha_txt(r.inicio) || '. ¡Te esperamos!', 'horas', r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Limpieza: comprobantes de más de 30 días y avisos de más de 90.
create or replace function public.limpiar() returns void
language sql security definer set search_path = '' as $$
  update public.reservas set comprobante = null where comprobante is not null and comprobante_at < now() - interval '30 days';
  update public.messages set imagen = null where imagen is not null and created_at < now() - interval '30 days';
  delete from public.avisos where created_at < now() - interval '90 days';
  delete from public.lista_espera where fecha < current_date - 1;
$$;

-- Una sola tarea por minuto que hace todo lo programado.
create or replace function public.tick() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.liberar_vencidas();
  perform public.recordatorios();
  if extract(minute from now())::int = 0 and extract(hour from now() at time zone public.tz())::int = 10 then
    perform public.avisar_vencimientos();
    perform public.limpiar();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Eliminar mi cuenta (cliente). Los datos de la barbería se conservan anónimos.
-- ---------------------------------------------------------------------
create or replace function public.eliminar_mi_cuenta() returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := public.yo_activo();
  if me.role <> 'client' then raise exception 'Para cerrar una barbería o cuenta de barbero, escribe a soporte'; end if;
  update public.reservas set estado = 'anulada', motivo = 'Cuenta eliminada', anulada_at = now()
    where cliente_id = me.id and estado in ('esperando_abono', 'por_aprobar', 'agendada', 'confirmada') and inicio > now();
  delete from auth.users where id = me.id;
end $$;

-- ---------------------------------------------------------------------
-- Permisos: nadie sin sesión ejecuta nada (salvo 3 funciones públicas);
-- con sesión, cada función revisa quién llama; las internas, solo el servidor.
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.barberia_publica(text), public.ajustes_publicos(), public.config_publica() to anon;

do $$
declare f text;
begin
  foreach f in array array[
    'public.preparar_invitacion(uuid, text, text, text, text, text)', 'public.cancelar_invitacion(text)',
    'public.cuenta_creada(uuid)', 'public.puede_restablecer(uuid, uuid)', 'public.marcar_clave_temporal(uuid)',
    'public.tomar_push()', 'public.terminar_push(uuid[], uuid[], uuid[])', 'public.quitar_endpoint(text)', 'public.secretos()',
    'public.avisar(uuid, uuid, text, text, text, text, uuid, uuid)', 'public.extender_premium(uuid, uuid)',
    'public.notificar_reserva(public.reservas)', 'public.avisar_espera(uuid, uuid, timestamptz)', 'public.liberar_vencidas()',
    'public.recordatorios()', 'public.limpiar()', 'public.tick()', 'public.avisar_vencimientos()',
    'public.reserva_staff(uuid)', 'public.nuevo_codigo()', 'public.nueva_key()']
  loop
    execute 'revoke execute on function ' || f || ' from authenticated';
  end loop;
end $$;

-- La Edge Function usa la clave de servidor (service_role), que puede llamar a todo.
do $$ begin
  execute 'grant execute on all functions in schema public to service_role';
exception when undefined_object then null; end $$;

-- ---------------------------------------------------------------------
-- Tareas programadas (Supabase: pg_cron + pg_net)
-- ---------------------------------------------------------------------
insert into public.app_settings (key, value)
values ('url_enviar', 'https://gxlabxuttnxvzkucckef.supabase.co/functions/v1/enviar')
on conflict (key) do nothing;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    create extension if not exists pg_net with schema extensions;
    perform cron.unschedule(jobid) from cron.job where jobname in ('barberia-tick', 'barberia-push');
    perform cron.schedule('barberia-tick', '* * * * *', 'select public.tick()');
    perform cron.schedule('barberia-push', '* * * * *',
      $q$select net.http_post(url := (select value from public.app_settings where key = 'url_enviar'),
                               headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb)$q$);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Actualizaciones (v1.2): al correr este archivo con una versión nueva, se libera sola
-- y les llega un push a todos para que toquen "Actualizar". Queda en el historial.
-- ---------------------------------------------------------------------
create table if not exists public.actualizaciones (
  id          uuid primary key default gen_random_uuid(),
  version     text not null,
  notas       text,
  avisados    int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.actualizaciones enable row level security;

create or replace function public.admin_actualizacion_estado() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return jsonb_build_object(
    'db_version', public.db_version(),
    'liberada', (select value from public.app_settings where key = 'version_liberada'),
    'historial', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
      select version, notas, avisados, created_at from public.actualizaciones order by created_at desc limit 10) x));
end $$;
grant execute on function public.admin_actualizacion_estado() to authenticated;
revoke execute on function public.admin_actualizacion_estado() from public, anon;

do $$
declare
  lib text := (select value from public.app_settings where key = 'version_liberada');
  v text := public.db_version();
  n int := 0;
begin
  if lib is distinct from v then
    insert into public.app_settings (key, value) values ('version_liberada', v)
    on conflict (key) do update set value = excluded.value;
    -- Si ya hay gente usando la app, se les avisa por push (en una instalación nueva, no).
    if lib is not null or exists (select 1 from public.profiles where role <> 'admin') then
      insert into public.avisos (de, para, tipo, titulo, cuerpo, url)
      select null, p.id, 'aviso', '💈 Nueva versión ' || v || ' de la app', public.notas_version() || ' Toca aquí para actualizar.', 'actualizar'
      from public.profiles p where not p.suspended;
      get diagnostics n = row_count;
    end if;
    insert into public.actualizaciones (version, notas, avisados) values (v, public.notas_version(), n);
  end if;
end $$;

select 'Barbería instalada ✅ versión ' || public.db_version() ||
       ' · liberada y avisada a ' || coalesce((select avisados from public.actualizaciones where version = public.db_version()
                                               order by created_at desc limit 1), 0) || ' persona(s)' as resultado;
