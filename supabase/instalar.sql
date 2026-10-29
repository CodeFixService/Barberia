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
language sql immutable as $$ select '2.21'::text $$;

-- Lo nuevo de esta versión (llega en el push a todos al actualizar).
create or replace function public.notas_version() returns text
language sql immutable as $$ select 'Menú ⋮ arriba (inicio y cerrar sesión), Volver te deja donde estabas y menú en cuadrícula.'::text $$;

-- Planes Free / Premium (v1.4): el admin los edita desde su panel. Estos son los valores de partida.
create table if not exists public.planes (
  grupo    text not null check (grupo in ('barberia', 'cliente')),
  clave    text not null,
  free     int not null default 0,
  premium  int not null default 0,
  primary key (grupo, clave)
);
alter table public.planes enable row level security;
insert into public.planes (grupo, clave, free, premium) values
  ('barberia', 'barberos', 3, 10),      -- contando al dueño
  ('barberia', 'clientes', 40, 500),
  ('barberia', 'servicios', 8, 100),
  ('barberia', 'ofertas', 1, 50),
  ('barberia', 'precio', 0, 4900),      -- precio mensual de Premium
  ('barberia', 'prueba_dias', 0, 7),    -- días de prueba gratis (0 = sin prueba)
  ('cliente', 'activas', 1, 3),         -- horas activas a la vez
  ('cliente', 'dias', 14, 45),          -- días hacia adelante para reservar
  ('cliente', 'mensajes', 3, 0),        -- mensajes seguidos sin respuesta (0 = sin límite)
  ('cliente', 'precio', 0, 4900),
  ('cliente', 'prueba_dias', 0, 7)
on conflict (grupo, clave) do nothing;

-- v2.0: opciones sí/no de cada plan (1 = incluido, 0 = no). Parten igual que antes: todo esto es Premium.
insert into public.planes (grupo, clave, free, premium) values
  ('barberia', 'estadisticas', 0, 1),
  ('barberia', 'recordatorios', 0, 1),
  ('barberia', 'caja_reportes', 0, 1),
  ('barberia', 'colores', 0, 1),
  ('barberia', 'ofertas_vip', 0, 1),
  ('barberia', 'sellos', 0, 1),
  ('barberia', 'horario_barbero', 0, 1),
  ('barberia', 'vista_todos', 0, 1),
  ('cliente', 'lista_espera', 0, 1),
  ('cliente', 'favorito', 0, 1),
  ('cliente', 'recordatorios', 0, 1),
  ('cliente', 'ofertas_vip', 0, 1),
  ('cliente', 'colores', 0, 1)
on conflict (grupo, clave) do nothing;

-- v2.1: más opciones sí/no (antes fijas como Premium) y las nuevas ventajas.
insert into public.planes (grupo, clave, free, premium) values
  ('barberia', 'fotos_servicios', 0, 1),
  ('barberia', 'servicios_barbero', 0, 1),
  ('barberia', 'editar_barberos', 0, 1),
  ('barberia', 'comisiones', 0, 1),
  ('barberia', 'resumen_mes', 0, 1),
  ('barberia', 'recuperar', 0, 1),
  ('barberia', 'recordar_wsp', 0, 1),
  ('barberia', 'cumpleanos', 0, 1),
  ('cliente', 'prioridad', 0, 1)
on conflict (grupo, clave) do nothing;

-- Claves de los planes que son opciones sí/no (0 o 1).
create or replace function public.planes_sino() returns text[]
language sql immutable as $$
  select array['estadisticas', 'recordatorios', 'caja_reportes', 'colores', 'ofertas_vip', 'sellos', 'horario_barbero', 'vista_todos',
    'lista_espera', 'favorito', 'fotos_servicios', 'servicios_barbero', 'editar_barberos', 'comisiones', 'resumen_mes', 'recuperar',
    'recordar_wsp', 'cumpleanos', 'prioridad']
$$;

-- v2.0: nombre, descripción, beneficios y duración de cada plan (los edita el admin).
create table if not exists public.planes_info (
  grupo          text not null check (grupo in ('barberia', 'cliente')),
  nivel          text not null check (nivel in ('free', 'premium')),
  nombre         text not null default '',
  descripcion    text not null default '',
  beneficios     jsonb not null default '[]'::jsonb,
  duracion_dias  int not null default 30 check (duracion_dias between 1 and 3650),
  primary key (grupo, nivel)
);
alter table public.planes_info enable row level security;
insert into public.planes_info (grupo, nivel, nombre, descripcion) values
  ('barberia', 'free', 'Free', 'Lo básico para recibir reservas con abono.'),
  ('barberia', 'premium', 'Premium', 'Todo para hacer crecer tu barbería.'),
  ('cliente', 'free', 'Free', 'Reserva tu hora y sigue tus reservas.'),
  ('cliente', 'premium', 'Premium', 'Para clientes que no quieren esperar.')
on conflict (grupo, nivel) do nothing;

create or replace function public.plan_valor(p_grupo text, p_clave text, p_premium boolean) returns int
language sql stable security definer set search_path = '' as $$
  select case when p_premium then premium else free end from public.planes where grupo = p_grupo and clave = p_clave
$$;

-- ¿El plan incluye esta opción sí/no?
create or replace function public.tiene(p_grupo text, p_clave text, p_premium boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.plan_valor(p_grupo, p_clave, p_premium), 0) > 0
$$;

-- Duración (días) de un mes de Premium.
create or replace function public.duracion_plan(p_grupo text) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select duracion_dias from public.planes_info where grupo = p_grupo and nivel = 'premium'), 30)
$$;

-- Límites Free / Premium (se leen de la tabla de planes).
create or replace function public.limite(p_que text, p_premium boolean) returns int
language sql stable security definer set search_path = '' as $$
  select public.plan_valor(case when p_que in ('activas', 'dias', 'mensajes') then 'cliente' else 'barberia' end, p_que, p_premium)
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
-- v2.0: tiempos de cada barbero (los ajusta él mismo en su perfil): descanso entre citas, cada cuánto parten sus horas
-- y cuánto le dura cada servicio ({ "<id del servicio>": minutos }; si no lo pone, usa la duración del servicio).
alter table public.profiles add column if not exists descanso_min int not null default 0;
alter table public.profiles add column if not exists paso_min int not null default 15;
alter table public.profiles add column if not exists duraciones jsonb not null default '{}'::jsonb;
alter table public.profiles drop constraint if exists profiles_descanso_check;
alter table public.profiles add constraint profiles_descanso_check check (descanso_min between 0 and 180);
alter table public.profiles drop constraint if exists profiles_paso_check;
alter table public.profiles add constraint profiles_paso_check check (paso_min in (5, 10, 15, 20, 30, 45, 60, 75, 90, 120));
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
    {"e":"a","i":"10:00","f":"15:00"},
    {"e":"x","i":"10:00","f":"15:00"}]'::jsonb,
  comision             int not null default 50 check (comision between 0 and 100),
  sellos_meta          int not null default 10 check (sellos_meta between 3 and 30),
  created_at           timestamptz not null default now()
);
alter table public.barberias enable row level security;
-- v1.1: el dueño decide si sus barberos pueden crear clientes.
alter table public.barberias add column if not exists barberos_crean_clientes boolean not null default true;
-- v1.4: dos links de pago para el abono (monto + link). El activo define el abono y el link que ven los clientes.
alter table public.barberias add column if not exists pago1_monto int;
alter table public.barberias add column if not exists pago1_link text;
alter table public.barberias add column if not exists pago2_monto int;
alter table public.barberias add column if not exists pago2_link text;
alter table public.barberias add column if not exists pago_activo smallint not null default 1;
alter table public.barberias alter column pago1_monto set default 4000;
update public.barberias set pago1_monto = abono, pago1_link = coalesce(pago1_link, link_pago) where pago1_monto is null;
-- v2.0: un texto por link (ej. "Abono normal", "Abono fin de semana").
alter table public.barberias add column if not exists pago1_texto text;
alter table public.barberias add column if not exists pago2_texto text;
-- v2.0: horario de partida para barberías nuevas: lunes a sábado abierto, domingo cerrado.
alter table public.barberias alter column horario set default '[
    {"e":"a","i":"10:00","f":"20:00","ci":"14:00","cf":"15:00"},
    {"e":"a","i":"10:00","f":"20:00","ci":"14:00","cf":"15:00"},
    {"e":"a","i":"10:00","f":"20:00","ci":"14:00","cf":"15:00"},
    {"e":"a","i":"10:00","f":"20:00","ci":"14:00","cf":"15:00"},
    {"e":"a","i":"10:00","f":"20:00","ci":"14:00","cf":"15:00"},
    {"e":"a","i":"10:00","f":"15:00"},
    {"e":"x","i":"10:00","f":"15:00"}]'::jsonb;
-- v2.0: "Días a consultar" ya no existe: cada día está abierto o cerrado (los "a consultar" pasan a abiertos).
update public.barberias set horario = (select jsonb_agg(case when d ->> 'e' = 'c' then jsonb_set(d, '{e}', '"a"') else d end order by n)
                                       from jsonb_array_elements(horario) with ordinality x(d, n))
where horario::text like '%"e": "c"%';
update public.profiles set horario = (select jsonb_agg(case when d ->> 'e' = 'c' then jsonb_set(d, '{e}', '"a"') else d end order by n)
                                      from jsonb_array_elements(horario) with ordinality x(d, n))
where horario is not null and horario::text like '%"e": "c"%';

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

-- v2.1: socios de CodeFix (ven y gestionan como el admin, pero no crean ni borran) y registro abierto de barberías.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'socio', 'owner', 'barber', 'client'));
alter table public.user_invites drop constraint if exists user_invites_role_check;
alter table public.user_invites add constraint user_invites_role_check check (role in ('socio', 'owner', 'barber', 'client'));
alter table public.profiles add column if not exists permisos jsonb;           -- socio: qué puede hacer (pagos, premium, cuentas, ajustes, avisos)
alter table public.profiles add column if not exists ref_codigo text;          -- socio: su código para el link de registro de barberías
create unique index if not exists profiles_ref_idx on public.profiles (ref_codigo) where ref_codigo is not null;
alter table public.profiles add column if not exists cumple_avisado int;       -- año en que se le envió el regalo de cumpleaños
-- v2.2: los socios también crean barberías y eliminan (todo queda en el registro de cambios). Los que ya existían parten con ambos permisos.
update public.profiles set permisos = coalesce(permisos, '{}'::jsonb) || '{"crear": true, "eliminar": true}'::jsonb
where role = 'socio' and not (coalesce(permisos, '{}'::jsonb) ? 'eliminar');
-- Quién trajo a cada barbería (otra barbería o un socio) y si ya se pagó el premio del referido.
alter table public.barberias add column if not exists referida_por uuid references public.barberias (id) on delete set null;
alter table public.barberias add column if not exists socio_id uuid references public.profiles (id) on delete set null;
alter table public.barberias add column if not exists registro_solo boolean not null default false;
alter table public.barberias add column if not exists referido_pagado boolean not null default false;
-- Abono para clientes Premium (null = el mismo; 0 = sin abono), regalo de cumpleaños, mensaje para los que no vuelven y último resumen enviado.
alter table public.barberias add column if not exists abono_premium int;
alter table public.barberias drop constraint if exists barberias_abono_premium_check;
alter table public.barberias add constraint barberias_abono_premium_check check (abono_premium is null or abono_premium between 0 and 100000);
alter table public.barberias add column if not exists regalo_cumple text;
alter table public.barberias add column if not exists mensaje_volver text;
alter table public.barberias add column if not exists resumen_enviado text;

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

-- Teléfono normalizado (últimos 9 dígitos) para reconocer a un cliente aunque no tenga cuenta.
create or replace function public.tel_norm(t text) returns text
language sql immutable as $$ select right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 9) $$;

-- v2.1: código de socio para su link de registro de barberías ("s-" + 5 letras).
create or replace function public.nuevo_ref() returns text
language plpgsql volatile set search_path = '' as $$
declare c text; abc text := 'abcdefghjkmnpqrstuvwxyz23456789';
begin
  loop
    c := 's-';
    for i in 1..5 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    exit when not exists (select 1 from public.profiles where ref_codigo = c);
  end loop;
  return c;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  inv public.user_invites;
  es_admin boolean := lower(new.email) = public.admin_email();
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  b uuid;
  bb public.barberias;
  rol text;
  bid uuid;
  v_tel text;
  v_bnom text;
  v_nom text;
  solo boolean := false;
  ref text;
  rb public.barberias;
  rs public.profiles;
  dias int;
begin
  select * into inv from public.user_invites
  where email = lower(new.email) and created_at > now() - interval '1 hour';
  if es_admin then
    insert into public.profiles (id, email, nombre, role) values (new.id, lower(new.email), 'Administrador', 'admin')
    on conflict (id) do nothing;
    return new;
  end if;
  if inv.email is not null then
    rol := inv.role; bid := inv.barberia_id; v_tel := inv.telefono;
    v_nom := left(coalesce(inv.nombre, ''), 80);
    v_bnom := left(coalesce(nullif(inv.extra ->> 'barberia', ''), inv.nombre), 80);
    insert into public.profiles (id, email, nombre, role, barberia_id, telefono, created_by)
    values (new.id, lower(new.email), v_nom, rol, bid, v_tel, inv.created_by)
    on conflict (id) do nothing;
    if rol = 'socio' then
      update public.profiles set ref_codigo = public.nuevo_ref(),
        permisos = '{"pagos": true, "premium": true, "cuentas": true, "ajustes": true, "avisos": true, "crear": true, "eliminar": true}'::jsonb where id = new.id;
    end if;
  elsif meta ->> 'rol' = 'barberia' then
    -- v2.1: cualquiera crea su barbería desde el link o QR de registro (de CodeFix, de un socio o de otra barbería).
    if public.regla('registro_barberias') <= 0 then raise exception 'El registro de barberías está cerrado por ahora. Escríbele a CodeFix.'; end if;
    if (select count(*) from public.barberias where registro_solo and created_at > now() - interval '1 hour') >= 30 then
      raise exception 'Hay muchos registros en este momento. Intenta en unos minutos 🙏';
    end if;
    v_bnom := left(trim(coalesce(meta ->> 'barberia', '')), 80);
    v_nom := left(trim(coalesce(meta ->> 'nombre', '')), 80);
    if length(v_bnom) < 2 or length(v_nom) < 2 or length(public.tel_norm(meta ->> 'telefono')) < 8 then
      raise exception 'Escribe el nombre de la barbería, tu nombre y tu WhatsApp';
    end if;
    rol := 'owner'; solo := true; v_tel := nullif(regexp_replace(meta ->> 'telefono', '[^0-9+]', '', 'g'), '');
    insert into public.profiles (id, email, nombre, role, telefono)
    values (new.id, lower(new.email), v_nom, 'owner', v_tel)
    on conflict (id) do nothing;
  elsif meta ->> 'rol' = 'cliente' and coalesce(meta ->> 'barberia', '') <> '' then
    -- v2.0: el cliente se crea su cuenta desde el link o QR de su barbería (solo así; lo demás sigue cerrado).
    select * into bb from public.barberias where codigo = lower(trim(meta ->> 'barberia'));
    if bb.id is null or exists (select 1 from public.profiles o where o.id = bb.owner_id and o.suspended) then
      raise exception 'Esta barbería no está recibiendo clientes nuevos';
    end if;
    if (select count(*) from public.profiles where barberia_id = bb.id and role = 'client')
       >= public.limite('clientes', public.barberia_premium(bb.id)) then
      raise exception 'Esta barbería llegó a su máximo de clientes con cuenta. Puedes reservar sin cuenta.';
    end if;
    if coalesce(trim(meta ->> 'nombre'), '') = '' or length(public.tel_norm(meta ->> 'telefono')) < 8 then
      raise exception 'Escribe tu nombre y tu WhatsApp';
    end if;
    rol := 'client'; bid := bb.id; v_tel := nullif(regexp_replace(meta ->> 'telefono', '[^0-9+]', '', 'g'), '');
    insert into public.profiles (id, email, nombre, role, barberia_id, telefono)
    values (new.id, lower(new.email), left(trim(meta ->> 'nombre'), 80), 'client', bid, v_tel)
    on conflict (id) do nothing;
    perform public.avisar(new.id, bb.owner_id, 'aviso', '👤 Nuevo cliente con cuenta',
      left(trim(meta ->> 'nombre'), 80) || ' se registró desde tu link.', 'clientes');
  else
    raise exception 'El registro está cerrado. Entra con el link o QR de tu barbería.';
  end if;
  if rol = 'owner' then
    dias := public.regla('dias_regalo');
    insert into public.barberias (codigo, nombre, owner_id, whatsapp, registro_solo)
    values (public.nuevo_codigo(), v_bnom, new.id, v_tel, solo)
    returning id into b;
    -- v2.0: la barbería parte con días de Premium de regalo (Reglas → días de regalo).
    update public.profiles set barberia_id = b, trial_used = true,
      plan = case when dias > 0 then 'premium' else plan end,
      premium_until = case when dias > 0 then now() + make_interval(days => dias) else premium_until end
    where id = new.id;
    -- v2.2: la barbería que crea un socio desde el panel queda a su nombre.
    if inv.created_by is not null and exists (select 1 from public.profiles where id = inv.created_by and role = 'socio') then
      update public.barberias set socio_id = inv.created_by where id = b;
    end if;
    if dias > 0 then
      insert into public.licenses (key, tipo, para_nombre, meses, dias, precio, origen, redeemed_by, redeemed_at, inicio, termino, nota)
      values (public.nueva_key(), 'barberia', v_bnom, 1, dias, 0, 'regalo',
              new.id, now(), now(), now() + make_interval(days => dias), 'Regalo de bienvenida');
    end if;
    -- v2.1: ¿quién la trajo? (código de otra barbería o de un socio, en el link de registro).
    if solo then
      ref := lower(trim(coalesce(meta ->> 'ref', '')));
      if ref like 's-%' then
        select * into rs from public.profiles where ref_codigo = ref and role = 'socio' and not suspended;
        if rs.id is not null then update public.barberias set socio_id = rs.id where id = b; end if;
      elsif ref <> '' then
        select * into rb from public.barberias where codigo = ref and id <> b;
        if rb.id is not null then
          update public.barberias set referida_por = rb.id, socio_id = rb.socio_id where id = b;
          perform public.avisar(null, rb.owner_id, 'aviso', '🤝 ' || v_bnom || ' se registró con tu link',
            'Cuando pague su primer mes de Premium, ganas ' || public.regla('dias_referido') || ' días de Premium gratis.', 'invitar');
        end if;
      end if;
      perform public.avisar_gestores(null, null, '💈 Barbería nueva: ' || v_bnom,
        v_nom || ' · ' || coalesce(v_tel, '') || ' se registró sola' ||
        coalesce(' · invitada por ' || rb.nombre, '') || coalesce(' · socio ' || public.nombre_de(rs), '') || '.', 'barberias');
    end if;
  end if;
  -- v2.0: si ya había reservado sin cuenta con este WhatsApp, sus horas y calificaciones pasan a su cuenta.
  if rol = 'client' and length(public.tel_norm(v_tel)) >= 8 then
    update public.reservas set cliente_id = new.id
    where barberia_id = bid and cliente_id is null and cliente_tel = public.tel_norm(v_tel);
    update public.calificaciones set cliente_id = new.id
    where barberia_id = bid and cliente_id is null and cliente_tel = public.tel_norm(v_tel);
    update public.lista_negra set cliente_id = new.id
    where barberia_id = bid and cliente_id is null and tel = public.tel_norm(v_tel);
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

-- v2.1: socio de CodeFix activo. Gestor = el admin o un socio con ese permiso (ver, aprobar, ajustar; nunca crear ni borrar).
create or replace function public.is_socio() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'socio' and not p.suspended)
$$;

create or replace function public.es_gestor(p_permiso text default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'socio' and not p.suspended
    and (p_permiso is null or coalesce((p.permisos ->> p_permiso)::boolean, false)))
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
  select case p_role when 'admin' then 4 when 'socio' then 4 when 'owner' then 3 when 'barber' then 2 else 1 end
$$;

-- Nombre visible.
create or replace function public.nombre_de(p public.profiles) returns text
language sql immutable as $$
  select case when p.role = 'admin' then 'CodeFix (soporte)'
              when p.role = 'socio' then coalesce(nullif(p.nombre, ''), split_part(p.email, '@', 1)) || ' · CodeFix'
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
    'descanso_min', me.descanso_min, 'paso_min', me.paso_min, 'duraciones', me.duraciones,
    'is_admin', public.is_admin(), 'is_socio', me.role = 'socio',
    'permisos', case when me.role = 'socio' then coalesce(me.permisos, '{}'::jsonb) end, 'ref_codigo', me.ref_codigo,
    'barberia', case when b.id is null then null else jsonb_build_object(
      'id', b.id, 'codigo', b.codigo, 'nombre', b.nombre, 'logo', b.logo, 'color', b.color, 'portada', b.portada,
      'direccion', b.direccion, 'whatsapp', b.whatsapp,
      -- v2.0: el barbero no ve montos ni links de pago (solo el dueño y los clientes).
      'abono', case when me.role <> 'barber' then b.abono end, 'link_pago', case when me.role <> 'barber' then b.link_pago end,
      'abono_texto', case when me.role <> 'barber' then case when b.pago_activo = 2 then b.pago2_texto else b.pago1_texto end end,
      'datos_transferencia', case when me.role <> 'barber' then b.datos_transferencia end, 'bienvenida', b.bienvenida, 'horario', b.horario,
      'calificacion', public.nota_barberia(b.id),
      'comision', b.comision, 'sellos_meta', b.sellos_meta, 'barberos_crean_clientes', b.barberos_crean_clientes,
      'pagos', case when me.role = 'owner' then jsonb_build_object('activo', b.pago_activo,
        'p1', jsonb_build_object('monto', coalesce(b.pago1_monto, b.abono), 'link', coalesce(b.pago1_link, b.link_pago), 'texto', b.pago1_texto),
        'p2', jsonb_build_object('monto', b.pago2_monto, 'link', b.pago2_link, 'texto', b.pago2_texto)) end,
      -- v2.1: abono para clientes Premium, regalo de cumpleaños y mensaje para los que no vuelven.
      'abono_premium', case when me.role <> 'barber' then b.abono_premium end, 'regalo_cumple', b.regalo_cumple, 'mensaje_volver', b.mensaje_volver,
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

-- Reglas que el admin ajusta (minutos, horas, días). Si falta una, usa el valor de partida.
create or replace function public.regla(p_clave text) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select nullif(value, '')::int from public.app_settings where key = 'regla_' || p_clave and value ~ '^-?\d+$'),
    case p_clave
      when 'minutos_pago' then 10 when 'minutos_devolucion' then 10 when 'horas_cancelacion' then 24
      when 'dias_saldo' then 90 when 'dias_regalo' then 30 when 'dias_aviso' then 3 when 'dias_comprobantes' then 30
      when 'dias_anuladas' then 30 when 'estrellas_lista_negra' then 2 when 'minutos_recordar_revision' then 15
      when 'activas_invitado' then 1 when 'apartadas_max' then 10 when 'dias_prioridad' then 3 when 'dias_sin_volver' then 45
      when 'descuento_3meses' then 15 when 'dias_referido' then 30 when 'registro_barberias' then 1 else 0 end)
$$;

-- v1.4: si ya habías cambiado el precio, los dos planes parten con ese precio (solo la primera vez).
do $$ begin
  if not exists (select 1 from public.app_settings where key = 'planes_v14') then
    update public.planes set premium = coalesce((select value::int from public.app_settings where key = 'precio_premium'), premium)
    where clave = 'precio';
    insert into public.app_settings (key, value) values ('planes_v14', '1');
  end if;
end $$;

-- v2.0: textos de la app que el admin edita.
create table if not exists public.textos (
  clave  text primary key,
  valor  text not null default ''
);
alter table public.textos enable row level security;
insert into public.textos (clave, valor) values
  ('app_lema', 'Reserva tu hora en segundos 💈'),
  ('vista_bienvenida', 'Elige tu corte, tu barbero y tu hora. No necesitas crear cuenta.'),
  ('reserva_pago', 'Tienes {minutos} minutos para pagar el abono y subir la foto del comprobante. Si no, la hora se libera.'),
  ('reserva_revision', 'Recibimos tu comprobante. Tu barbero está verificando la transferencia: apenas la apruebe, tu hora queda agendada.'),
  ('reserva_politica', 'Si cancelas dentro de los primeros {devolucion} minutos, se te devuelve el abono. Después, con {horas} horas o más de anticipación, el abono queda como saldo a favor para reagendar. Con menos de {horas} horas o si no llegas, se pierde. El abono se descuenta del total.'),
  ('premium_barberia_texto', 'Más barberos y clientes, estadísticas, recordatorios automáticos y tu barbería con tus colores.'),
  ('premium_cliente_texto', 'Reserva con más anticipación, más horas a la vez, mensajes sin límite y ofertas VIP.'),
  ('pago_instrucciones', 'Toca "Pagar", paga con Mercado Pago, toma una captura del comprobante y súbela aquí. Te avisamos apenas se apruebe.'),
  ('bienvenida_barberia', '¡Bienvenido! Completa tu perfil, tu horario, tus servicios y el link del abono para empezar a recibir reservas.'),
  ('terminos', 'Al reservar aceptas que tu nombre y WhatsApp se usen solo para gestionar tus horas con la barbería.')
on conflict (clave) do nothing;

-- v2.0: registro de cambios del admin.
create table if not exists public.auditoria (
  id          uuid primary key default gen_random_uuid(),
  quien       uuid,
  accion      text not null,
  detalle     text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists auditoria_fecha_idx on public.auditoria (created_at desc);
alter table public.auditoria enable row level security;

-- v2.2: drop por el cambio de lenguaje (sql → plpgsql). Si lo hace un socio y es algo que borra o corta, al admin le llega un aviso.
drop function if exists public.auditar(text, text);
create or replace function public.auditar(p_accion text, p_detalle text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.auditoria (quien, accion, detalle) values (auth.uid(), left(p_accion, 80), left(coalesce(p_detalle, ''), 400));
  if p_accion in ('Eliminar cuenta', 'Eliminar barbería', 'Limpieza', 'Calificación borrada', 'Quitar Premium', 'Suspender')
     and exists (select 1 from public.profiles where id = auth.uid() and role = 'socio') then
    perform public.avisar(auth.uid(), public.admin_id(), 'aviso', '📜 ' || (select public.nombre_de(p) from public.profiles p where p.id = auth.uid()) || ': ' || p_accion,
      left(coalesce(p_detalle, ''), 300), 'registro');
  end if;
end $$;

-- v2.0: links de pago de Premium (2 por plan, uno activo). El precio publicado es el del link activo.
insert into public.app_settings (key, value)
select 'links_premium', jsonb_build_object(
  'barberia', jsonb_build_object('activo', 1,
    's1', jsonb_build_object('monto', (select premium from public.planes where grupo = 'barberia' and clave = 'precio'),
                             'url', coalesce((select value from public.app_settings where key = 'link_pago_barberia'), (select value from public.app_settings where key = 'link_pago'), ''), 'texto', ''),
    's2', jsonb_build_object('monto', null, 'url', '', 'texto', '')),
  'cliente', jsonb_build_object('activo', 1,
    's1', jsonb_build_object('monto', (select premium from public.planes where grupo = 'cliente' and clave = 'precio'),
                             'url', coalesce((select value from public.app_settings where key = 'link_pago_cliente'), (select value from public.app_settings where key = 'link_pago'), ''), 'texto', ''),
    's2', jsonb_build_object('monto', null, 'url', '', 'texto', '')))::text
on conflict (key) do nothing;

create or replace function public.reglas() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_object_agg(k, public.regla(k)) from unnest(array['minutos_pago', 'minutos_devolucion', 'horas_cancelacion', 'dias_saldo',
    'dias_regalo', 'dias_aviso', 'dias_comprobantes', 'dias_anuladas', 'estrellas_lista_negra', 'minutos_recordar_revision', 'activas_invitado',
    'apartadas_max', 'dias_prioridad', 'dias_sin_volver', 'descuento_3meses', 'dias_referido', 'registro_barberias']) k
$$;

create or replace function public.ajustes_publicos() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    || jsonb_build_object('planes', (select jsonb_object_agg(g.grupo, g.v) from (
         select grupo, jsonb_object_agg(clave, jsonb_build_object('free', free, 'premium', premium)) as v
         from public.planes group by grupo) g))
    || jsonb_build_object('planes_info', (select jsonb_object_agg(g.grupo, g.v) from (
         select grupo, jsonb_object_agg(nivel, jsonb_build_object('nombre', nombre, 'descripcion', descripcion, 'beneficios', beneficios,
           'duracion_dias', duracion_dias)) as v from public.planes_info group by grupo) g))
    || jsonb_build_object('reglas', public.reglas(), 'textos', (select coalesce(jsonb_object_agg(clave, valor), '{}'::jsonb) from public.textos),
         'links_premium', (select value::jsonb from public.app_settings where key = 'links_premium'))
  from public.app_settings where key not in ('url_enviar', 'planes_v14', 'links_premium') and key not like 'regla\_%' and key not like '\_%'
$$;

-- El admin guarda los planes: { "barberia": { "clientes": { "free": 40, "premium": 500 }, ... }, "cliente": { ... } }
create or replace function public.admin_guardar_planes(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; f int; pr int;
begin
  if not public.es_gestor('ajustes') then raise exception 'Sin permiso'; end if;
  for r in select * from public.planes loop
    if p -> r.grupo -> r.clave is null then continue; end if;
    f := coalesce((p -> r.grupo -> r.clave ->> 'free')::int, r.free);
    pr := coalesce((p -> r.grupo -> r.clave ->> 'premium')::int, r.premium);
    if f < 0 or pr < 0 or f > 10000000 or pr > 10000000 then raise exception 'Valor no válido en %', r.clave; end if;
    if r.clave in ('barberos', 'dias') and (f < 1 or pr < 1) then raise exception '% debe ser al menos 1', r.clave; end if;
    -- v2.0: el precio se toma del link de pago activo (Ajustes → Precios y links).
    if r.clave = 'precio' then continue; end if;
    if r.clave = any(public.planes_sino()) then f := least(f, 1); pr := least(pr, 1); end if;
    update public.planes set free = f, premium = pr where grupo = r.grupo and clave = r.clave;
  end loop;
  -- Nombre, descripción, beneficios (uno por línea) y duración de cada plan.
  if jsonb_typeof(p -> 'info') = 'object' then
    for r in select * from public.planes_info loop
      if p -> 'info' -> r.grupo -> r.nivel is null then continue; end if;
      update public.planes_info set
        nombre = coalesce(left(nullif(trim(p -> 'info' -> r.grupo -> r.nivel ->> 'nombre'), ''), 40), nombre),
        descripcion = coalesce(left(p -> 'info' -> r.grupo -> r.nivel ->> 'descripcion', 300), descripcion),
        beneficios = case when jsonb_typeof(p -> 'info' -> r.grupo -> r.nivel -> 'beneficios') = 'array'
          then (select coalesce(jsonb_agg(left(trim(x), 160)), '[]'::jsonb) from jsonb_array_elements_text(p -> 'info' -> r.grupo -> r.nivel -> 'beneficios') x
                where trim(x) <> '') else beneficios end,
        duracion_dias = greatest(1, least(3650, coalesce((p -> 'info' -> r.grupo -> r.nivel ->> 'duracion_dias')::int, duracion_dias)))
      where grupo = r.grupo and nivel = r.nivel;
    end loop;
  end if;
  perform public.auditar('Planes', 'Cambió los planes Free / Premium');
  return public.ajustes_publicos();
end $$;

-- v2.0: links de pago de Premium. p = { barberia: { activo: 1, s1: { monto, url, texto }, s2: {…} }, cliente: {…} }
create or replace function public.admin_guardar_links(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g text; n int; act int; x jsonb; nuevo jsonb := '{}'::jsonb; m int;
begin
  if not public.es_gestor('ajustes') then raise exception 'Sin permiso'; end if;
  foreach g in array array['barberia', 'cliente'] loop
    act := coalesce((p -> g ->> 'activo')::int, 1);
    if act not in (1, 2) then raise exception 'Elige el espacio 1 o el 2'; end if;
    x := jsonb_build_object('activo', act);
    for n in 1..2 loop
      m := nullif(p -> g -> ('s' || n) ->> 'monto', '')::int;
      if m is not null and (m < 0 or m > 10000000) then raise exception 'Monto no válido'; end if;
      if coalesce(p -> g -> ('s' || n) ->> 'url', '') <> '' and p -> g -> ('s' || n) ->> 'url' !~* '^https://' then
        raise exception 'El link debe empezar con https://';
      end if;
      x := x || jsonb_build_object('s' || n, jsonb_build_object('monto', m, 'url', left(trim(coalesce(p -> g -> ('s' || n) ->> 'url', '')), 300),
             'texto', left(trim(coalesce(p -> g -> ('s' || n) ->> 'texto', '')), 300)));
    end loop;
    -- v2.1: link opcional para pagar 3 meses por adelantado (con descuento).
    if coalesce(p -> g -> 'trimestral' ->> 'url', '') <> '' and p -> g -> 'trimestral' ->> 'url' !~* '^https://' then
      raise exception 'El link de 3 meses debe empezar con https://';
    end if;
    x := x || jsonb_build_object('trimestral', jsonb_build_object('url', left(trim(coalesce(p -> g -> 'trimestral' ->> 'url', '')), 300),
           'texto', left(trim(coalesce(p -> g -> 'trimestral' ->> 'texto', '')), 300)));
    if (x -> ('s' || act) ->> 'monto') is null then raise exception 'Pon el precio del espacio % antes de activarlo', act; end if;
    nuevo := nuevo || jsonb_build_object(g, x);
    update public.planes set premium = (x -> ('s' || act) ->> 'monto')::int where grupo = g and clave = 'precio';
    insert into public.app_settings (key, value) values ('link_pago_' || g, x -> ('s' || act) ->> 'url')
    on conflict (key) do update set value = excluded.value;
  end loop;
  insert into public.app_settings (key, value) values ('links_premium', nuevo::text) on conflict (key) do update set value = excluded.value;
  update public.app_settings set value = (select premium::text from public.planes where grupo = 'barberia' and clave = 'precio') where key = 'precio_premium';
  perform public.auditar('Precios y links', 'Barbería ' || (nuevo -> 'barberia' -> ('s' || (nuevo -> 'barberia' ->> 'activo')) ->> 'monto') ||
    ' · Cliente ' || (nuevo -> 'cliente' -> ('s' || (nuevo -> 'cliente' ->> 'activo')) ->> 'monto'));
  return public.ajustes_publicos();
end $$;

-- v2.0: reglas (minutos, horas y días).
create or replace function public.admin_guardar_reglas(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k text; v int; lim int[];
begin
  if not public.es_gestor('ajustes') then raise exception 'Sin permiso'; end if;
  for k in select jsonb_object_keys(p) loop
    lim := case k
      when 'minutos_pago' then array[3, 240] when 'minutos_devolucion' then array[0, 1440] when 'horas_cancelacion' then array[0, 720]
      when 'dias_saldo' then array[1, 3650] when 'dias_regalo' then array[0, 365] when 'dias_aviso' then array[1, 60]
      when 'dias_comprobantes' then array[1, 3650] when 'dias_anuladas' then array[7, 3650] when 'estrellas_lista_negra' then array[0, 4]
      when 'minutos_recordar_revision' then array[5, 720] when 'activas_invitado' then array[1, 10]
      when 'apartadas_max' then array[1, 100] when 'dias_prioridad' then array[0, 60] when 'dias_sin_volver' then array[14, 365]
      when 'descuento_3meses' then array[0, 60] when 'dias_referido' then array[0, 365] when 'registro_barberias' then array[0, 1] end;
    if lim is null then raise exception 'Regla desconocida: %', k; end if;
    v := nullif(p ->> k, '')::int;
    if v is null or v < lim[1] or v > lim[2] then raise exception 'El valor de % debe estar entre % y %', k, lim[1], lim[2]; end if;
    insert into public.app_settings (key, value) values ('regla_' || k, v::text) on conflict (key) do update set value = excluded.value;
  end loop;
  perform public.auditar('Reglas', p::text);
  return public.reglas();
end $$;

create or replace function public.admin_guardar_textos(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if not public.es_gestor('ajustes') then raise exception 'Sin permiso'; end if;
  for k in select jsonb_object_keys(p) loop
    update public.textos set valor = left(coalesce(p ->> k, ''), 1000) where clave = k;
  end loop;
  perform public.auditar('Textos', 'Editó ' || (select string_agg(x, ', ') from jsonb_object_keys(p) x));
end $$;

create or replace function public.admin_ajuste(p_key text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_gestor('ajustes') then raise exception 'Sin permiso'; end if;
  if p_key = 'version_liberada' and not public.is_admin() then raise exception 'Solo el administrador libera versiones'; end if;
  if p_key not in ('precio_premium', 'link_pago', 'link_pago_barberia', 'link_pago_cliente', 'whatsapp_admin', 'version_liberada', 'datos_transferencia') then
    raise exception 'Ajuste no permitido';
  end if;
  if p_key like 'link_pago%' and coalesce(p_value, '') <> '' and p_value !~* '^https://' then
    raise exception 'El link debe empezar con https://';
  end if;
  if coalesce(trim(p_value), '') = '' then delete from public.app_settings where key = p_key;
  else insert into public.app_settings (key, value) values (p_key, left(trim(p_value), 300))
       on conflict (key) do update set value = excluded.value; end if;
  perform public.auditar('Ajuste', p_key || ' = ' || coalesce(nullif(trim(p_value), ''), '(vacío)'));
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
-- v1.3: "Limpiar" solo los quita de mi campanita (quien los envió conserva su ✓✓ visto). Se borran solos a los 7 días.
alter table public.avisos add column if not exists oculto boolean not null default false;
alter table public.avisos enable row level security;

create or replace function public.avisar(p_de uuid, p_para uuid, p_tipo text, p_titulo text, p_cuerpo text,
                                         p_url text, p_reserva uuid default null, p_difusion uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.avisos (de, para, tipo, titulo, cuerpo, url, reserva_id, difusion)
  select p_de, p_para, p_tipo, left(p_titulo, 90), left(coalesce(p_cuerpo, ''), 300), p_url, p_reserva, p_difusion
  where p_para is not null and p_para is distinct from p_de
$$;

-- v2.1: aviso al admin y a los socios (con el permiso indicado; null = todos).
create or replace function public.avisar_gestores(p_de uuid, p_permiso text, p_titulo text, p_cuerpo text, p_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare g record;
begin
  for g in select id from public.profiles where not suspended and ((role = 'admin' and email = public.admin_email())
             or (role = 'socio' and (p_permiso is null or coalesce((permisos ->> p_permiso)::boolean, false)))) loop
    perform public.avisar(p_de, g.id, 'aviso', p_titulo, p_cuerpo, p_url);
  end loop;
end $$;

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
    where a.para = auth.uid() and a.tipo <> 'chat' and not a.oculto and a.created_at > now() - interval '7 days'
    order by a.created_at desc limit 80) x;
  return r;
end $$;

create or replace function public.marcar_vistos(p_ids uuid[] default null) returns void
language sql security definer set search_path = '' as $$
  update public.avisos set visto_at = now(), entregado_at = coalesce(entregado_at, now())
  where para = auth.uid() and visto_at is null and (p_ids is null or id = any(p_ids))
$$;

-- Limpiar mi campanita (como borrar el caché): los marca vistos y los oculta solo para mí.
create or replace function public.limpiar_avisos() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  update public.avisos set oculto = true, visto_at = coalesce(visto_at, now()), entregado_at = coalesce(entregado_at, now())
  where para = auth.uid() and tipo <> 'chat' and not oculto;
  get diagnostics n = row_count;
  return n;
end $$;

-- Avisos que yo envié (para ver ✓ / ✓✓ / Visto).
create or replace function public.avisos_enviados() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select a.id, a.titulo, a.cuerpo, a.created_at, a.visto_at, a.reserva_id, a.difusion,
           (a.push = 'enviado' or a.entregado_at is not null) as recibido, public.nombre_de(p) as para
    from public.avisos a join public.profiles p on p.id = a.para
    where a.de = auth.uid() and a.tipo not in ('chat', 'difusion') and a.created_at > now() - interval '7 days'
    order by a.created_at desc limit 100) x
$$;

-- Contadores para la barra (se consulta cada ~30 s). Marca como recibidos mis mensajes y avisos.
create or replace function public.resumen() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; pend int := 0;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then return null; end if;
  -- v1.3: "en línea" / "visto hace…" se actualiza mientras la app está abierta.
  if me.last_seen is null or me.last_seen < now() - interval '1 minute' then
    update public.profiles set last_seen = now() where id = me.id;
  end if;
  update public.messages set delivered_at = now() where recipient = me.id and delivered_at is null;
  update public.avisos set entregado_at = now() where para = me.id and entregado_at is null;
  -- v2.0: pendientes = comprobantes por revisar (y devoluciones, para el dueño); admin = pagos por revisar.
  if me.role = 'owner' then
    select count(*) into pend from public.reservas r
    where r.barberia_id = me.barberia_id and (r.estado in ('en_revision', 'por_aprobar') or r.devolucion = 'pendiente');
  elsif me.role = 'barber' then
    select count(*) into pend from public.reservas r
    where r.barbero_id = me.id and r.estado in ('en_revision', 'por_aprobar');
  elsif me.role = 'admin' or (me.role = 'socio' and coalesce((me.permisos ->> 'pagos')::boolean, false)) then
    select count(*) into pend from public.pagos where estado = 'en_revision';
  end if;
  return jsonb_build_object(
    'avisos', (select count(*) from public.avisos where para = me.id and visto_at is null and tipo <> 'chat' and not oculto),
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
    if p_rol not in ('owner', 'socio') then return jsonb_build_object('ok', false, 'error', 'El administrador crea barberías y socios'); end if;
  elsif c.role = 'socio' then
    -- v2.2: el socio con permiso "crear" crea barberías (no socios).
    if not coalesce((c.permisos ->> 'crear')::boolean, false) then return jsonb_build_object('ok', false, 'error', 'Sin permiso para crear cuentas'); end if;
    if p_rol <> 'owner' then return jsonb_build_object('ok', false, 'error', 'El socio crea barberías'); end if;
    if (select count(*) from public.profiles where created_by = c.id and created_at > now() - interval '1 day') >= 30 then
      return jsonb_build_object('ok', false, 'error', 'Máximo 30 barberías nuevas por día');
    end if;
  elsif c.role = 'owner' then
    if p_rol not in ('barber', 'client') then return jsonb_build_object('ok', false, 'error', 'Solo puedes crear barberos y clientes'); end if;
    prem := public.is_premium(c.id);
    if p_rol = 'barber' then
      select count(*) + 1 into n from public.profiles where barberia_id = c.barberia_id and role = 'barber';
      if n >= public.limite('barberos', prem) then
        return jsonb_build_object('ok', false, 'error', 'Llegaste al máximo de ' || public.limite('barberos', prem) ||
          ' barberos (contándote)' || case when prem then '' else '. Con Premium puedes tener hasta ' || public.limite('barberos', true) || '.' end);
      end if;
    else
      select count(*) into n from public.profiles where barberia_id = c.barberia_id and role = 'client';
      if n >= public.limite('clientes', prem) then
        return jsonb_build_object('ok', false, 'error', 'Llegaste al máximo de ' || public.limite('clientes', prem) ||
          ' clientes' || case when prem then '' else '. Con Premium puedes tener hasta ' || public.limite('clientes', true) || '.' end);
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
  if c.role in ('admin', 'socio') then
    insert into public.auditoria (quien, accion, detalle)
    values (c.id, 'Crear cuenta', case p_rol when 'owner' then 'Barbería ' || coalesce(nullif(trim(p_barberia), ''), trim(p_nombre)) when 'socio' then 'Socio ' || trim(p_nombre) else trim(p_nombre) end || ' · ' || em);
  end if;
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
-- v2.2: si el admin o un socio restablece una clave, queda en el registro de cambios.
create or replace function public.puede_restablecer(p_caller uuid, p_target uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare ok boolean; quien public.profiles;
begin
  select exists (
    select 1 from public.profiles c, public.profiles t
    where c.id = p_caller and t.id = p_target and c.id <> t.id and not c.suspended and t.role <> 'admin'
      and ((c.role = 'admin' and lower(c.email) = public.admin_email())
           or (c.role = 'socio' and coalesce((c.permisos ->> 'cuentas')::boolean, false) and t.role in ('owner', 'barber', 'client'))
           or (c.role = 'owner' and t.barberia_id = c.barberia_id and t.role in ('barber', 'client')))) into ok;
  select * into quien from public.profiles where id = p_caller;
  if ok and quien.role in ('admin', 'socio') then
    insert into public.auditoria (quien, accion, detalle)
    select p_caller, 'Restablecer clave', public.nombre_de(t) || ' · ' || t.email from public.profiles t where t.id = p_target;
  end if;
  return ok;
end $$;

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
-- v2.0: Premium por días (pagos con comprobante, regalos) y nuevos orígenes en el historial.
alter table public.licenses add column if not exists dias int;
alter table public.licenses drop constraint if exists licenses_origen_check;
alter table public.licenses add constraint licenses_origen_check check (origen in ('key', 'directo', 'solicitud', 'pago', 'regalo'));
-- v2.0: las keys sin usar se desactivan (el Premium se paga con comprobante).
update public.licenses set revoked = true, nota = coalesce(nota || ' · ', '') || 'Desactivada en v2.0 (sin usar)'
where origen = 'key' and redeemed_by is null and not revoked;

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
  raise exception 'Las keys ya no se usan: el Premium se paga con comprobante (pestaña Pagos) o se activa directo.';
  if p_tipo not in ('barberia', 'cliente') then raise exception 'Tipo no válido'; end if;
  insert into public.licenses (key, tipo, para_nombre, meses, precio, nota)
  values (public.nueva_key(), p_tipo, left(coalesce(trim(p_para), ''), 80), greatest(1, least(12, coalesce(p_meses, 1))),
          coalesce(p_precio, public.plan_valor(p_tipo, 'precio', true), 4900) * greatest(1, least(12, coalesce(p_meses, 1))),
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
  -- v2.0: solo se aceptan las keys que ya estaban entregadas (las sin usar se desactivaron).
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
  if not public.es_gestor('premium') then raise exception 'Sin permiso'; end if;
  select * into p from public.profiles where id = p_user;
  if p.role not in ('owner', 'client') then raise exception 'Solo barberías (dueños) y clientes tienen Premium'; end if;
  insert into public.licenses (key, tipo, para_nombre, meses, precio, origen)
  values (public.nueva_key(), case when p.role = 'owner' then 'barberia' else 'cliente' end, public.nombre_de(p),
          greatest(1, least(12, coalesce(p_meses, 1))),
          coalesce(p_precio, public.plan_valor(case when p.role = 'owner' then 'barberia' else 'cliente' end, 'precio', true), 4900) * greatest(1, least(12, coalesce(p_meses, 1))),
          'directo')
  returning * into l;
  perform public.auditar('Activar Premium', p_meses || ' mes(es) a ' || public.nombre_de(p));
  return jsonb_build_object('hasta', public.extender_premium(p_user, l.id), 'key', l.key);
end $$;

-- v2.0: suma (o regala) días de Premium. Queda en el historial con su precio (0 = regalo).
create or replace function public.dar_premium(p_user uuid, p_dias int, p_precio int, p_origen text, p_nota text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare p public.profiles; ini timestamptz; fin timestamptz;
begin
  select * into p from public.profiles where id = p_user for update;
  if p.role not in ('owner', 'client') then raise exception 'Solo barberías (dueños) y clientes tienen Premium'; end if;
  ini := greatest(coalesce(case when p.plan = 'premium' then p.premium_until end, now()), now());
  fin := ini + make_interval(days => p_dias);
  update public.profiles set plan = 'premium', premium_until = fin, aviso_vence_at = null where id = p_user;
  insert into public.licenses (key, tipo, para_nombre, meses, dias, precio, origen, redeemed_by, redeemed_at, inicio, termino, nota)
  values (public.nueva_key(), case when p.role = 'owner' then 'barberia' else 'cliente' end, public.nombre_de(p),
          greatest(1, least(12, round(p_dias / 30.0)::int)), p_dias, greatest(0, coalesce(p_precio, 0)), p_origen, p_user, now(), ini, fin, p_nota);
  perform public.avisar(public.admin_id(), p_user, 'plan', '⭐ ¡Premium activado!',
    'Tu Premium dura hasta el ' || to_char(fin at time zone public.tz(), 'DD/MM/YYYY') || '.', 'plan');
  return fin;
end $$;

create or replace function public.admin_dias(p_user uuid, p_dias int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare fin timestamptz;
begin
  if not public.es_gestor('premium') then raise exception 'Sin permiso'; end if;
  if coalesce(p_dias, 0) not between 1 and 3650 then raise exception 'Días entre 1 y 3650'; end if;
  fin := public.dar_premium(p_user, p_dias, 0, 'regalo', 'Días de regalo del admin');
  perform public.auditar('Días de regalo', p_dias || ' días a ' || (select public.nombre_de(x) from public.profiles x where x.id = p_user));
  return jsonb_build_object('hasta', fin);
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
  if not public.es_gestor('eliminar') then raise exception 'Sin permiso'; end if;
  update public.profiles set plan = 'free', premium_until = null where id = p_user and role <> 'admin';
  perform public.auditar('Quitar Premium', (select public.nombre_de(x) from public.profiles x where x.id = p_user));
end $$;

create or replace function public.admin_suspender(p_user uuid, p_suspender boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_gestor('cuentas') then raise exception 'Sin permiso'; end if;
  update public.profiles set suspended = coalesce(p_suspender, false) where id = p_user and role <> 'admin' and (role <> 'socio' or public.is_admin());
  perform public.auditar(case when p_suspender then 'Suspender' else 'Reactivar' end, (select public.nombre_de(x) from public.profiles x where x.id = p_user));
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
declare me public.profiles; dias int;
begin
  me := public.yo_activo();
  if me.role not in ('owner', 'client') then raise exception 'Esta cuenta no tiene plan'; end if;
  -- v2.0: las barberías parten con días de regalo al crearlas; la prueba queda para los clientes.
  if me.role = 'owner' then raise exception 'Tu barbería ya partió con días de Premium de regalo'; end if;
  if me.trial_used then raise exception 'Ya usaste tu prueba gratis'; end if;
  if public.is_premium(me.id) then raise exception 'Ya eres Premium'; end if;
  dias := coalesce(public.plan_valor(case when me.role = 'owner' then 'barberia' else 'cliente' end, 'prueba_dias', true), 0);
  if dias <= 0 then raise exception 'La prueba gratis no está disponible por ahora'; end if;
  update public.profiles set plan = 'premium', premium_until = now() + make_interval(days => dias), trial_used = true where id = me.id;
  insert into public.requests (user_id, kind, status, resolved_at) values (me.id, 'prueba', 'aprobada', now());
  perform public.avisar(me.id, public.admin_id(), 'plan', '🎁 Prueba Premium',
    public.nombre_de(me) || ' (' || case when me.role = 'owner' then 'barbería' else 'cliente' end || ') activó sus ' || dias || ' días gratis', 'admin');
  return public.mi_cuenta();
end $$;

-- v2.0: pagos de Premium con foto del comprobante (barbería o cliente → Josué), se aprueban en el panel.
create table if not exists public.pagos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  tipo         text not null check (tipo in ('barberia', 'cliente')),
  monto        int not null default 0,
  dias         int not null default 30,
  comprobante  text,
  estado       text not null default 'en_revision' check (estado in ('en_revision', 'aprobado', 'rechazado')),
  nota         text,
  motivo       text,
  created_at   timestamptz not null default now(),
  resuelto_at  timestamptz
);
create index if not exists pagos_estado_idx on public.pagos (estado, created_at desc);
create index if not exists pagos_user_idx on public.pagos (user_id, created_at desc);
alter table public.pagos enable row level security;
-- Los "Ya pagué" antiguos (sin comprobante) pasan a Pagos para que se resuelvan ahí.
alter table public.requests add column if not exists migrado boolean not null default false;
with x as (
  update public.requests r set migrado = true where r.kind = 'pago' and r.status = 'pendiente' and not r.migrado returning r.*)
insert into public.pagos (user_id, tipo, monto, dias, nota, created_at)
select x.user_id, case when p.role = 'owner' then 'barberia' else 'cliente' end,
       coalesce(public.plan_valor(case when p.role = 'owner' then 'barberia' else 'cliente' end, 'precio', true), 0), 30,
       'Aviso "Ya pagué" antiguo, sin comprobante' || coalesce(' · ' || nullif(trim(x.note), ''), ''), x.created_at
from x join public.profiles p on p.id = x.user_id;

-- v2.1: se puede pagar 1 mes o 3 meses por adelantado (con descuento, Reglas → descuento 3 meses).
drop function if exists public.premium_pagar(text, text);
create or replace function public.premium_pagar(p_imagen text, p_nota text default null, p_meses int default 1) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; g text; m int; pg public.pagos; b text; meses int := case when p_meses = 3 then 3 else 1 end; d int;
begin
  me := public.yo_activo();
  if me.role not in ('owner', 'client') then raise exception 'Esta cuenta no tiene plan'; end if;
  if not public.img_ok(p_imagen, 600000) or coalesce(p_imagen, '') = '' then raise exception 'Sube la foto del comprobante'; end if;
  if exists (select 1 from public.pagos where user_id = me.id and estado = 'en_revision') then
    raise exception 'Ya tienes un comprobante en revisión. Te avisamos apenas se apruebe.';
  end if;
  d := public.regla('descuento_3meses');
  if meses = 3 and d <= 0 then raise exception 'El pago por 3 meses no está disponible por ahora'; end if;
  g := case when me.role = 'owner' then 'barberia' else 'cliente' end;
  m := coalesce(public.plan_valor(g, 'precio', true), 0);
  if meses = 3 then m := round(m * 3 * (100 - d) / 100.0)::int; end if;
  insert into public.pagos (user_id, tipo, monto, dias, comprobante, nota)
  values (me.id, g, m, public.duracion_plan(g) * meses, p_imagen,
          left(nullif(trim(coalesce(case when meses = 3 then '3 meses (-' || d || '%) · ' else '' end, '') || coalesce(p_nota, '')), ''), 200)) returning * into pg;
  select nombre into b from public.barberias where id = me.barberia_id;
  perform public.avisar_gestores(me.id, 'pagos', '💰 Pago Premium por revisar',
    public.nombre_de(me) || ' · ' || case when g = 'barberia' then 'barbería ' else 'cliente de ' end || coalesce(b, '') || ' · ' || public.pesos(m) ||
    case when meses = 3 then ' · 3 meses' else '' end, 'pagos');
  return jsonb_build_object('id', pg.id, 'estado', pg.estado);
end $$;

create or replace function public.mi_pago() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'monto', monto, 'estado', estado, 'motivo', motivo, 'created_at', created_at, 'resuelto_at', resuelto_at)
  from public.pagos where user_id = auth.uid() order by created_at desc limit 1
$$;

create or replace function public.admin_pagos(p_estado text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_gestor('pagos') then raise exception 'Sin permiso'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'tipo', g.tipo, 'monto', g.monto, 'dias', g.dias, 'estado', g.estado,
      'nota', g.nota, 'motivo', g.motivo, 'created_at', g.created_at, 'resuelto_at', g.resuelto_at, 'tiene_comprobante', g.comprobante is not null,
      'user_id', p.id, 'nombre', p.nombre, 'email', p.email, 'telefono', coalesce(p.telefono, b.whatsapp), 'rol', p.role, 'barberia', b.nombre,
      'premium_until', p.premium_until, 'premium', public.is_premium(p.id))
      order by g.created_at desc), '[]'::jsonb)
    from (select * from public.pagos where estado = coalesce(p_estado, estado) order by created_at desc limit 300) g
    join public.profiles p on p.id = g.user_id left join public.barberias b on b.id = p.barberia_id);
end $$;

create or replace function public.admin_pago_comprobante(p_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_gestor('pagos') then raise exception 'Sin permiso'; end if;
  return (select comprobante from public.pagos where id = p_id);
end $$;

create or replace function public.admin_pago_resolver(p_id uuid, p_aprobar boolean, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.pagos; fin timestamptz;
begin
  if not public.es_gestor('pagos') then raise exception 'Sin permiso'; end if;
  select * into g from public.pagos where id = p_id and estado = 'en_revision' for update;
  if g.id is null then raise exception 'Este pago ya fue revisado'; end if;
  if not p_aprobar and coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe el motivo del rechazo'; end if;
  update public.pagos set estado = case when p_aprobar then 'aprobado' else 'rechazado' end, resuelto_at = now(),
    motivo = left(nullif(trim(p_motivo), ''), 300) where id = g.id;
  if p_aprobar then
    fin := public.dar_premium(g.user_id, g.dias, g.monto, 'pago', 'Pago con comprobante');
    -- v2.1: referidos. La barbería que trajo a esta gana días de Premium cuando paga su primer mes (una sola vez).
    if g.tipo = 'barberia' and public.regla('dias_referido') > 0 then
      declare nb public.barberias; rb public.barberias;
      begin
        select * into nb from public.barberias where owner_id = g.user_id;
        if nb.referida_por is not null and not nb.referido_pagado then
          select * into rb from public.barberias where id = nb.referida_por;
          update public.barberias set referido_pagado = true where id = nb.id;
          if rb.id is not null then
            perform public.dar_premium(rb.owner_id, public.regla('dias_referido'), 0, 'regalo', 'Referido: ' || nb.nombre);
            perform public.avisar(null, rb.owner_id, 'plan', '🤝 ¡Ganaste ' || public.regla('dias_referido') || ' días de Premium!',
              nb.nombre || ' pagó su primer mes. Gracias por recomendarnos.', 'plan');
          end if;
        end if;
      end;
    end if;
  else
    perform public.avisar(public.admin_id(), g.user_id, 'plan', 'Pago Premium rechazado',
      trim(p_motivo) || '. Puedes volver a subir el comprobante en Mi plan.', 'plan');
  end if;
  perform public.auditar(case when p_aprobar then 'Pago aprobado' else 'Pago rechazado' end,
    (select public.nombre_de(x) from public.profiles x where x.id = g.user_id) || ' · ' || public.pesos(g.monto) || coalesce(' · ' || nullif(trim(p_motivo), ''), ''));
  return jsonb_build_object('hasta', fin);
end $$;

-- "Ya pagué" (v1.x): desde v2.0 se paga subiendo el comprobante.
create or replace function public.ya_pague(p_nota text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; b text;
begin
  me := public.yo_activo();
  raise exception 'Actualiza la app: ahora el pago se envía con la foto del comprobante en Mi plan.';
  if me.role not in ('owner', 'client') then raise exception 'Esta cuenta no tiene plan'; end if;
  if exists (select 1 from public.requests where user_id = me.id and kind = 'pago' and status = 'pendiente') then
    raise exception 'Ya avisaste tu pago. Lo revisaremos pronto.';
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

-- Cada día: avisa N días antes de que venza el Premium (con botón para pagar) y cuando vence.
create or replace function public.avisar_vencimientos() returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; p record; d int := public.regla('dias_aviso');
begin
  for p in select * from public.profiles
           where plan = 'premium' and role in ('owner', 'client') and premium_until between now() and now() + make_interval(days => d)
             and (aviso_vence_at is null or aviso_vence_at < premium_until - make_interval(days => d + 1)) loop
    perform public.avisar(public.admin_id(), p.id, 'plan', '⏳ Tu Premium vence pronto',
      'Vence el ' || to_char(p.premium_until at time zone public.tz(), 'DD/MM/YYYY') || '. Toca para pagar y subir tu comprobante.', 'plan');
    update public.profiles set aviso_vence_at = now() where id = p.id;
    n := n + 1;
  end loop;
  -- Venció: vuelve a Free sin perder nada (se avisa una vez).
  for p in select * from public.profiles
           where plan = 'premium' and role in ('owner', 'client') and premium_until < now() and premium_until > now() - interval '2 days'
             and (aviso_vence_at is null or aviso_vence_at < premium_until) loop
    perform public.avisar(public.admin_id(), p.id, 'plan', 'Tu Premium venció',
      'Volviste a Free: no pierdes nada, solo no puedes agregar más de lo que permite el plan. Renueva cuando quieras.', 'plan');
    update public.profiles set aviso_vence_at = now() where id = p.id;
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

-- v2.0: reservas sin cuenta (invitados), link personal, abono "en revisión", devoluciones y reagendar.
alter table public.reservas add column if not exists token text;
alter table public.reservas add column if not exists cliente_tel text;
alter table public.reservas add column if not exists reagendada int not null default 0;
alter table public.reservas add column if not exists saldo_hasta timestamptz;
alter table public.reservas add column if not exists devolucion text;
alter table public.reservas add column if not exists devuelta_at timestamptz;
alter table public.reservas add column if not exists aprobada_por uuid;
alter table public.reservas add column if not exists revision_paso int not null default 0;
alter table public.reservas add column if not exists revision_previa boolean not null default false;
update public.reservas set token = replace(gen_random_uuid()::text, '-', '') || substr(md5(random()::text), 1, 8) where token is null;
alter table public.reservas alter column token set default replace(gen_random_uuid()::text, '-', '') || substr(md5(random()::text), 1, 8);
alter table public.reservas alter column token set not null;
create unique index if not exists reservas_token_idx on public.reservas (token);
create index if not exists reservas_tel_idx on public.reservas (barberia_id, cliente_tel);
create index if not exists reservas_revision_idx on public.reservas (comprobante_at) where estado = 'en_revision';
alter table public.reservas drop constraint if exists reservas_estado_check;
alter table public.reservas add constraint reservas_estado_check check (estado in ('esperando_abono', 'en_revision', 'por_aprobar',
  'agendada', 'confirmada', 'atendida', 'no_vino', 'anulada'));
alter table public.reservas drop constraint if exists reservas_abono_destino_check;
alter table public.reservas add constraint reservas_abono_destino_check check (abono_destino in ('saldo', 'perdido', 'devolucion'));
alter table public.reservas drop constraint if exists reservas_devolucion_check;
alter table public.reservas add constraint reservas_devolucion_check check (devolucion in ('pendiente', 'devuelta', 'no_llego'));
-- v2.1: devolución de un abono que nadie alcanzó a verificar (se canceló mientras estaba en revisión).
alter table public.reservas add column if not exists sin_verificar boolean not null default false;

-- Una misma hora no se puede tomar dos veces (también mientras espera el abono o está en revisión).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservas_sin_choque' and pg_get_constraintdef(oid) like '%en_revision%') then
    alter table public.reservas drop constraint if exists reservas_sin_choque;
    -- Las horas que esperaban confirmación pasan a "en revisión"; las confirmadas quedan como "agendada" (un solo paso).
    update public.reservas set estado = 'en_revision', expira_at = null, comprobante_at = coalesce(comprobante_at, created_at)
    where estado = 'por_aprobar' or (estado = 'agendada' and confirmada_at is null and coalesce(pagado_con, '') in ('link', 'transferencia'));
    update public.reservas set estado = 'agendada', expira_at = null where estado = 'confirmada';
    update public.reservas set estado = 'agendada', expira_at = null where estado = 'agendada' and expira_at is not null;
    alter table public.reservas add constraint reservas_sin_choque
      exclude using gist (barbero_id with =, tstzrange(inicio, fin, '[)') with &&)
      where (estado in ('esperando_abono', 'en_revision', 'por_aprobar', 'agendada', 'confirmada'));
  end if;
end $$;
-- El teléfono del cliente con cuenta también queda en sus horas (lista negra y fichas por WhatsApp).
update public.reservas r set cliente_tel = public.tel_norm(p.telefono)
from public.profiles p where p.id = r.cliente_id and r.cliente_tel is null and coalesce(p.telefono, '') <> '';

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
  select case when p.horario is not null and public.tiene('barberia', 'horario_barbero', public.barberia_premium(p.barberia_id)) then p.horario else b.horario end
  from public.profiles p join public.barberias b on b.id = p.barberia_id where p.id = p_barbero
$$;

-- Valida que la hora calce con el horario y bloqueos. v2.0: cada día está abierto o cerrado ('c' antiguo = abierto).
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
  return 'a';
end $$;

-- ¿Este barbero recibe reservas de clientes? Cada barbero (y el dueño) tiene su interruptor "agenda abierta".
create or replace function public.reservable(p public.profiles) returns boolean
language sql immutable as $$
  select not p.suspended and p.activo and p.role in ('owner', 'barber') and p.agenda_abierta
$$;

-- Libera las horas apartadas sin abono (pasado el tiempo de Reglas → minutos para pagar).
-- v2.0: una hora "en revisión" (con comprobante) NO se libera sola: espera que el barbero la revise.
create or replace function public.liberar_vencidas() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in update public.reservas set estado = 'anulada', anulada_at = now(), motivo = 'No se abonó a tiempo'
           where estado = 'esperando_abono' and expira_at < now() returning * loop
    n := n + 1;
    perform public.avisar(null, r.cliente_id, 'reserva', '⌛ Hora liberada',
      'No alcanzaste a subir el comprobante a tiempo. La hora del ' || public.fecha_txt(r.inicio) || ' quedó libre.', 'horas', r.id);
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- v2.0: Calificaciones (una por visita, en ambos sentidos) y lista negra
-- ---------------------------------------------------------------------
create table if not exists public.calificaciones (
  id           uuid primary key default gen_random_uuid(),
  reserva_id   uuid references public.reservas (id) on delete set null,
  barberia_id  uuid not null references public.barberias (id) on delete cascade,
  autor        text not null check (autor in ('cliente', 'barberia')),
  cliente_id   uuid references public.profiles (id) on delete set null,
  cliente_tel  text,
  cliente_nombre text,
  estrellas    int not null check (estrellas between 1 and 5),
  motivo       text,
  comentario   text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index if not exists calificaciones_uni on public.calificaciones (reserva_id, autor) where reserva_id is not null;
create index if not exists calificaciones_barberia_idx on public.calificaciones (barberia_id, autor, created_at desc);
create index if not exists calificaciones_tel_idx on public.calificaciones (barberia_id, cliente_tel);
alter table public.calificaciones enable row level security;

create table if not exists public.lista_negra (
  id           uuid primary key default gen_random_uuid(),
  barberia_id  uuid not null references public.barberias (id) on delete cascade,
  cliente_id   uuid references public.profiles (id) on delete set null,
  tel          text,
  nombre       text,
  motivo       text,
  activo       boolean not null default true,
  agregado_por uuid references public.profiles (id) on delete set null,
  quitado_por  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  quitado_at   timestamptz
);
create index if not exists lista_negra_idx on public.lista_negra (barberia_id, activo);
alter table public.lista_negra enable row level security;

-- Promedio de estrellas que los clientes le dan a la barbería (lo ven todos).
create or replace function public.nota_barberia(p_barberia uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('promedio', round(avg(estrellas)::numeric, 1), 'total', count(*))
  from public.calificaciones where barberia_id = p_barberia and autor = 'cliente'
$$;

-- Promedio que la barbería le dio a un cliente (lo ve solo la barbería).
create or replace function public.nota_cliente(p_barberia uuid, p_cliente uuid, p_tel text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when count(*) = 0 then null else jsonb_build_object('promedio', round(avg(estrellas)::numeric, 1), 'total', count(*)) end
  from public.calificaciones where barberia_id = p_barberia and autor = 'barberia'
    and ((p_cliente is not null and cliente_id = p_cliente) or (coalesce(p_tel, '') <> '' and cliente_tel = public.tel_norm(p_tel)))
$$;

create or replace function public.en_lista_negra(p_barberia uuid, p_cliente uuid, p_tel text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'motivo', motivo, 'desde', created_at) from public.lista_negra
  where barberia_id = p_barberia and activo
    and ((p_cliente is not null and cliente_id = p_cliente) or (length(public.tel_norm(p_tel)) >= 8 and tel = public.tel_norm(p_tel)))
  order by created_at desc limit 1
$$;

-- Política de cancelación de una hora en este momento:
--   libre (no hay abono) · devolucion (primeros N minutos) · saldo (con X horas) · pierde · null (ya no se puede)
create or replace function public.politica(r public.reservas) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when r.estado = 'esperando_abono' then 'libre'
    when r.estado not in ('en_revision', 'por_aprobar', 'agendada', 'confirmada') or r.inicio <= now() then null
    when r.abono = 0 or coalesce(r.pagado_con, '') not in ('link', 'transferencia', 'saldo') then 'libre'
    when r.pagado_con <> 'saldo' and r.reagendada = 0
         and now() - coalesce(r.comprobante_at, r.created_at) <= make_interval(mins => public.regla('minutos_devolucion')) then 'devolucion'
    when r.inicio - now() >= make_interval(hours => public.regla('horas_cancelacion')) then 'saldo'
    else 'pierde' end
$$;

-- ¿Se puede reagendar ahora? (agendada con X horas de anticipación, o anulada con saldo vigente si no tiene cuenta)
create or replace function public.reagendable(r public.reservas) returns boolean
language sql stable security definer set search_path = '' as $$
  select (r.estado in ('agendada', 'confirmada') and r.inicio - now() >= make_interval(hours => public.regla('horas_cancelacion')))
      or (r.estado = 'anulada' and r.abono_destino = 'saldo' and r.cliente_id is null and r.saldo_hasta > now())
$$;

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
  if not public.tiene('cliente', 'lista_espera', public.is_premium(me.id)) then raise exception 'La lista de espera es Premium ⭐'; end if;
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
declare me public.profiles; prem_cli boolean; staff boolean; ve_vip boolean;
begin
  me := public.yo_activo();
  if me.barberia_id is null then raise exception 'Sin barbería'; end if;
  prem_cli := public.is_premium(me.id);
  staff := public.es_staff(me);
  ve_vip := staff or public.tiene('cliente', 'ofertas_vip', prem_cli);
  return jsonb_build_object(
    'barberos', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'nombre', public.nombre_de(p), 'avatar', p.avatar, 'foto', p.foto, 'descripcion', p.descripcion,
        'es_dueno', p.role = 'owner', 'reservable', public.reservable(p), 'activo', p.activo, 'agenda_abierta', p.agenda_abierta,
        'last_seen', case when staff then p.last_seen end,
        'horario', public.horario_de(p.id), 'telefono', case when staff then p.telefono end,
        'descanso', p.descanso_min, 'paso', p.paso_min, 'duraciones', p.duraciones)
        order by (p.role = 'owner') desc, p.nombre), '[]'::jsonb)
      from public.profiles p where p.barberia_id = me.barberia_id and p.role in ('owner', 'barber')
        and (staff or p.activo)),
    -- v2.0: el barbero no ve precios.
    'servicios', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'nombre', s.nombre, 'precio', case when me.role <> 'barber' then s.precio end, 'duracion', s.duracion, 'categoria', s.categoria,
        'descripcion', s.descripcion, 'foto', s.foto, 'visible', s.visible, 'orden', s.orden, 'barberos', s.barberos)
        order by s.orden, s.nombre), '[]'::jsonb)
      from public.servicios s where s.barberia_id = me.barberia_id and (staff or s.visible)),
    'ofertas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'titulo', o.titulo, 'vip', o.vip, 'activa', o.activa, 'hasta', o.hasta, 'created_at', o.created_at,
        'bloqueada', o.vip and not ve_vip,
        'detalle', case when o.vip and not ve_vip then null else o.detalle end,
        'precio', case when o.vip and not ve_vip then null else o.precio end,
        'imagen', case when o.vip and not ve_vip then null else o.imagen end)
        order by o.created_at desc), '[]'::jsonb)
      from public.ofertas o where o.barberia_id = me.barberia_id
        and (staff or (o.activa and (o.hasta is null or o.hasta >= (now() at time zone public.tz())::date)))),
    'calificacion', public.nota_barberia(me.barberia_id));
end $$;

-- ---------------------------------------------------------------------
-- Calendario: horas ocupadas en un rango (cada uno ve el detalle que le corresponde)
--   dueño: todo con detalle · barbero: el detalle de las suyas (sin montos) · cliente: solo las suyas
-- ---------------------------------------------------------------------
create or replace function public.ocupacion(p_desde date, p_hasta date, p_barberia uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  bid uuid;
  t0 timestamptz;
  t1 timestamptz;
  plata boolean;
begin
  perform public.liberar_vencidas();
  if public.es_gestor() and p_barberia is not null then
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
  plata := me.role <> 'barber';
  return jsonb_build_object(
    'reservas', (select coalesce(jsonb_agg(
      case when me.role in ('owner', 'admin', 'socio') or (me.role = 'barber' and r.barbero_id = me.id) or r.cliente_id = me.id then
        jsonb_build_object('id', r.id, 'barbero_id', r.barbero_id, 'inicio', r.inicio, 'fin', r.fin,
          'estado', case when r.estado = 'confirmada' then 'agendada' when r.estado = 'por_aprobar' then 'en_revision' else r.estado end,
          'mia', r.cliente_id = me.id, 'detalle', true, 'cliente_id', r.cliente_id,
          'cliente', coalesce(c.nombre, r.cliente_nombre, 'Cliente'), 'cliente_avatar', c.avatar,
          'cliente_tel', case when me.role <> 'client' then coalesce(c.telefono, r.cliente_tel) end,
          'invitado', r.cliente_id is null and r.creada_por is null,
          'cliente_premium', public.is_premium(c.id),
          'servicios', case when plata then r.servicios else (select coalesce(jsonb_agg(x - 'precio'), '[]'::jsonb) from jsonb_array_elements(r.servicios) x) end,
          'total', case when plata then r.total end, 'abono', case when plata then r.abono end, 'pagado_con', r.pagado_con,
          'expira_at', r.expira_at, 'tiene_comprobante', r.comprobante is not null, 'comprobante_at', r.comprobante_at,
          'token', case when me.role <> 'client' then r.token end, 'sin_verificar', r.sin_verificar,
          'nota', r.nota, 'confirmada_at', r.confirmada_at, 'motivo', r.motivo, 'abono_destino', r.abono_destino,
          'devolucion', r.devolucion, 'reagendada', r.reagendada, 'created_at', r.created_at,
          'lista_negra', case when me.role <> 'client' then public.en_lista_negra(r.barberia_id, r.cliente_id, coalesce(c.telefono, r.cliente_tel)) end,
          'nota_cliente', case when me.role <> 'client' then public.nota_cliente(r.barberia_id, r.cliente_id, coalesce(c.telefono, r.cliente_tel)) end,
          'calificado', case when me.role <> 'client' then exists (select 1 from public.calificaciones q where q.reserva_id = r.id and q.autor = 'barberia') end)
      else jsonb_build_object('id', null, 'barbero_id', r.barbero_id, 'inicio', r.inicio, 'fin', r.fin,
          'estado', 'ocupado', 'mia', false, 'detalle', false) end order by r.inicio), '[]'::jsonb)
      from public.reservas r left join public.profiles c on c.id = r.cliente_id
      where r.barberia_id = bid and r.inicio < t1 and r.fin > t0
        and (r.estado in ('esperando_abono', 'en_revision', 'por_aprobar', 'agendada', 'confirmada', 'atendida', 'no_vino')
             or (r.estado = 'anulada' and (me.role in ('owner', 'admin', 'socio') or r.barbero_id = me.id or r.cliente_id = me.id)))
        and (me.role in ('owner', 'admin', 'socio', 'barber') or r.estado not in ('atendida', 'no_vino') or r.cliente_id = me.id)),
    'bloqueos', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'barbero_id', k.barbero_id, 'desde', k.desde,
        'hasta', k.hasta, 'motivo', case when me.role <> 'client' then k.motivo end) order by k.desde), '[]'::jsonb)
      from public.bloqueos k where k.barberia_id = bid and k.desde < t1 and k.hasta > t0));
end $$;

-- ---------------------------------------------------------------------
-- Reservar
-- ---------------------------------------------------------------------
-- Lo que le dura un servicio a un barbero (su tiempo propio o la duración del servicio).
create or replace function public.duracion_con(b public.profiles, s public.servicios) returns int
language sql immutable as $$
  select coalesce(case when (b.duraciones ->> s.id::text) ~ '^\d+$' then (b.duraciones ->> s.id::text)::int end, s.duracion)
$$;

-- El barbero (o el dueño, para sí mismo) ajusta sus tiempos desde su perfil.
create or replace function public.guardar_tiempos(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; d jsonb := '{}'::jsonb; k text; v int;
begin
  me := public.yo_activo();
  if not public.es_staff(me) then raise exception 'Solo la barbería'; end if;
  if p ? 'descanso_min' and coalesce((p ->> 'descanso_min')::int, -1) not between 0 and 180 then raise exception 'El descanso va de 0 a 180 minutos'; end if;
  if p ? 'paso_min' and coalesce((p ->> 'paso_min')::int, 0) not in (5, 10, 15, 20, 30, 45, 60, 75, 90, 120) then raise exception 'Elige cada cuánto parten tus horas'; end if;
  if jsonb_typeof(p -> 'duraciones') = 'object' then
    for k in select jsonb_object_keys(p -> 'duraciones') loop
      if nullif(p -> 'duraciones' ->> k, '') is null then continue; end if;
      v := (p -> 'duraciones' ->> k)::int;
      if v not between 5 and 480 then raise exception 'Cada servicio debe durar entre 5 y 480 minutos'; end if;
      if exists (select 1 from public.servicios where id = k::uuid and barberia_id = me.barberia_id) then d := d || jsonb_build_object(k, v); end if;
    end loop;
  end if;
  update public.profiles set
    descanso_min = case when p ? 'descanso_min' then (p ->> 'descanso_min')::int else descanso_min end,
    paso_min = case when p ? 'paso_min' then (p ->> 'paso_min')::int else paso_min end,
    duraciones = case when p ? 'duraciones' then d else duraciones end
  where id = me.id;
  return public.mi_cuenta();
end $$;

-- Valida barbero, servicios y hora; devuelve duración, total y los servicios elegidos.
create or replace function public.armar_reserva(p_barberia uuid, p_barbero uuid, p_inicio timestamptz, p_servicios uuid[], p_premium boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare bar public.profiles; dur int; tot int; items jsonb;
begin
  select * into bar from public.profiles where id = p_barbero and barberia_id = p_barberia and role in ('owner', 'barber');
  if bar.id is null then raise exception 'Barbero no encontrado'; end if;
  if not public.reservable(bar) then
    raise exception '% no tiene la agenda abierta. Elige otro barbero o escríbele para coordinar.', public.nombre_de(bar);
  end if;
  if coalesce(cardinality(p_servicios), 0) = 0 then raise exception 'Agrega al menos un servicio'; end if;
  if cardinality(p_servicios) > 10 then raise exception 'Máximo 10 servicios'; end if;
  -- Cada barbero tiene sus tiempos: lo que le dura cada servicio (o la duración del servicio) + su descanso entre citas.
  select coalesce(sum(public.duracion_con(bar, s)), 0), coalesce(sum(s.precio), 0),
         coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'precio', s.precio, 'duracion', public.duracion_con(bar, s))), '[]'::jsonb)
    into dur, tot, items
  from unnest(p_servicios) as u(id) join public.servicios s on s.id = u.id
  where s.barberia_id = p_barberia and s.visible and (s.barberos is null or p_barbero = any(s.barberos));
  if jsonb_array_length(items) <> cardinality(p_servicios) then
    raise exception 'Algún servicio no está disponible con este barbero';
  end if;
  dur := dur + coalesce(bar.descanso_min, 0);
  if extract(epoch from p_inicio)::bigint % 300 <> 0 then raise exception 'Elige una hora del calendario'; end if;
  if p_inicio < now() + interval '1 hour' then raise exception 'Reserva con al menos 1 hora de anticipación'; end if;
  if p_inicio > now() + make_interval(days => public.limite('dias', p_premium)) then
    raise exception 'Puedes reservar hasta % días adelante%', public.limite('dias', p_premium),
      case when p_premium then '' else ' (Premium: ' || public.limite('dias', true) || ' días)' end;
  end if;
  -- v2.1: prioridad Premium. Los viernes y sábados con más de N días de anticipación son para clientes Premium (0 = sin prioridad).
  if public.regla('dias_prioridad') > 0 and not public.tiene('cliente', 'prioridad', p_premium)
     and extract(isodow from p_inicio at time zone public.tz()) in (5, 6)
     and (p_inicio at time zone public.tz())::date > (now() at time zone public.tz())::date + public.regla('dias_prioridad') then
    raise exception 'Los viernes y sábados con más de % días de anticipación son para clientes Premium ⭐. Elige un día más cercano.', public.regla('dias_prioridad');
  end if;
  perform public.validar_hora(p_barbero, p_inicio, p_inicio + make_interval(mins => dur));
  return jsonb_build_object('dur', dur, 'tot', tot, 'items', items);
end $$;

-- Reservar (cliente con cuenta).
create or replace function public.reservar(p_barbero uuid, p_inicio timestamptz, p_servicios uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  b public.barberias;
  prem boolean;
  x jsonb;
  r public.reservas;
  usa_saldo boolean;
begin
  me := public.yo_activo();
  if me.role <> 'client' then raise exception 'Solo los clientes reservan desde aquí'; end if;
  if me.bloqueado then raise exception 'Tu cuenta no puede reservar. Escríbele a tu barbería.'; end if;
  select * into b from public.barberias where id = me.barberia_id;
  prem := public.is_premium(me.id);
  x := public.armar_reserva(b.id, p_barbero, p_inicio, p_servicios, prem);
  if (select count(*) from public.reservas where cliente_id = me.id and fin > now()
      and estado in ('esperando_abono', 'en_revision', 'por_aprobar', 'agendada', 'confirmada')) >= public.limite('activas', prem) then
    raise exception 'Ya tienes % hora(s) activa(s)%', public.limite('activas', prem),
      case when prem then '' else '. Con Premium puedes tener hasta ' || public.limite('activas', true) || '.' end;
  end if;
  if (select count(*) from public.reservas where cliente_id = me.id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Máximo 5 reservas por día';
  end if;
  perform public.liberar_vencidas();
  -- v2.1: la barbería puede rebajar (o quitar) el abono a los clientes Premium.
  if prem and b.abono_premium is not null then b.abono := least(b.abono, b.abono_premium); end if;
  usa_saldo := b.abono = 0 or me.saldo >= b.abono;
  begin
    insert into public.reservas (barberia_id, barbero_id, cliente_id, cliente_tel, inicio, fin, servicios, total, abono, pagado_con, estado,
                                 expira_at, creada_por)
    values (b.id, p_barbero, me.id, nullif(public.tel_norm(me.telefono), ''), p_inicio, p_inicio + make_interval(mins => (x ->> 'dur')::int),
            x -> 'items', (x ->> 'tot')::int, b.abono,
            case when usa_saldo then 'saldo' end,
            case when usa_saldo then 'agendada' else 'esperando_abono' end,
            case when not usa_saldo then now() + make_interval(mins => public.regla('minutos_pago')) end,
            me.id)
    returning * into r;
  exception when exclusion_violation then
    raise exception 'Esa hora se acaba de ocupar. Elige otra 🙏';
  end;
  if usa_saldo then
    update public.profiles set saldo = saldo - b.abono where id = me.id;
    update public.reservas set confirmada_at = now() where id = r.id returning * into r;
    perform public.notificar_reserva(r);
  end if;
  return to_jsonb(r) - 'comprobante';
end $$;

-- v2.0: reservar SIN cuenta, desde el link o QR de la barbería (nombre + WhatsApp). Devuelve el link personal (token).
create or replace function public.reservar_invitado(p_codigo text, p_barbero uuid, p_inicio timestamptz, p_servicios uuid[],
                                                    p_nombre text, p_telefono text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.barberias;
  x jsonb;
  r public.reservas;
  tel text := public.tel_norm(p_telefono);
  nom text := left(trim(coalesce(p_nombre, '')), 60);
begin
  select * into b from public.barberias where codigo = lower(trim(coalesce(p_codigo, '')));
  if b.id is null or exists (select 1 from public.profiles o where o.id = b.owner_id and o.suspended) then
    raise exception 'Esta barbería no está recibiendo reservas';
  end if;
  if length(nom) < 2 then raise exception 'Escribe tu nombre'; end if;
  if length(tel) < 8 then raise exception 'Escribe tu WhatsApp (ej. +56 9 1234 5678)'; end if;
  if b.abono > 0 and b.link_pago is null and b.datos_transferencia is null then
    raise exception 'La barbería aún no configura cómo recibir el abono. Escríbele por WhatsApp.';
  end if;
  perform public.liberar_vencidas();
  x := public.armar_reserva(b.id, p_barbero, p_inicio, p_servicios, false);
  -- Antiabuso: una hora apartada a la vez por WhatsApp, horas activas según Reglas y máximo 5 al día.
  if exists (select 1 from public.reservas where barberia_id = b.id and cliente_tel = tel and estado = 'esperando_abono' and expira_at > now()) then
    raise exception 'Ya tienes una hora esperando el abono. Termina ese pago o espera que se libere.';
  end if;
  if (select count(*) from public.reservas where barberia_id = b.id and cliente_tel = tel and fin > now()
      and estado in ('esperando_abono', 'en_revision', 'por_aprobar', 'agendada', 'confirmada')) >= public.regla('activas_invitado') then
    raise exception 'Ya tienes % hora(s) activa(s) en esta barbería. Para tener más, crea tu cuenta.', public.regla('activas_invitado');
  end if;
  if (select count(*) from public.reservas where barberia_id = b.id and cliente_tel = tel and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Máximo 5 reservas por día';
  end if;
  if (select count(*) from public.reservas where barberia_id = b.id and cliente_id is null and estado = 'esperando_abono' and expira_at > now()) >= public.regla('apartadas_max') then
    raise exception 'Hay muchas reservas en proceso. Intenta en unos minutos 🙏';
  end if;
  begin
    insert into public.reservas (barberia_id, barbero_id, cliente_nombre, cliente_tel, inicio, fin, servicios, total, abono, estado, expira_at,
                                 comprobante_at)
    values (b.id, p_barbero, nom, tel, p_inicio, p_inicio + make_interval(mins => (x ->> 'dur')::int), x -> 'items', (x ->> 'tot')::int, b.abono,
            case when b.abono > 0 then 'esperando_abono' else 'en_revision' end,
            case when b.abono > 0 then now() + make_interval(mins => public.regla('minutos_pago')) end,
            case when b.abono > 0 then null else now() end)
    returning * into r;
  exception when exclusion_violation then
    raise exception 'Esa hora se acaba de ocupar. Elige otra 🙏';
  end;
  if r.estado = 'en_revision' then perform public.notificar_reserva(r); end if;
  return jsonb_build_object('token', r.token, 'estado', r.estado, 'expira_at', r.expira_at);
end $$;

-- Aviso al barbero de la hora y al dueño (con alerta si el cliente está en la lista negra).
create or replace function public.notificar_reserva(r public.reservas) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.profiles; own uuid; t text; cu text; ln jsonb;
begin
  select * into c from public.profiles where id = r.cliente_id;
  select owner_id into own from public.barberias where id = r.barberia_id;
  ln := public.en_lista_negra(r.barberia_id, r.cliente_id, coalesce(c.telefono, r.cliente_tel));
  t := case when r.estado = 'en_revision' then '🧾 Revisa el abono para aceptar la hora' else '📅 Nueva reserva' end;
  cu := coalesce(public.nombre_de(c), coalesce(r.cliente_nombre, 'Cliente') || ' (sin cuenta)') || ' · ' || public.fecha_txt(r.inicio) || ' · ' ||
        coalesce((select string_agg(x ->> 'nombre', ' + ') from jsonb_array_elements(r.servicios) x), '') ||
        case when r.pagado_con = 'saldo' then ' · abono con saldo a favor' when r.comprobante is not null then ' · 🧾 con comprobante' else '' end ||
        case when ln is not null then ' · ⚠️ LISTA NEGRA' else '' end;
  perform public.avisar(r.cliente_id, r.barbero_id, 'reserva', t, cu, 'agenda?r=' || r.id, r.id);
  if own <> r.barbero_id then perform public.avisar(r.cliente_id, own, 'reserva', t, cu, 'agenda?r=' || r.id, r.id); end if;
end $$;

-- Guarda el comprobante: el reloj se detiene y la hora queda "en revisión" (retenida) hasta que el barbero la revise.
create or replace function public.subir_comprobante(p_id uuid, p_comprobante text, p_medio text) returns public.reservas
language plpgsql security definer set search_path = '' as $$
declare r public.reservas;
begin
  select * into r from public.reservas where id = p_id for update;
  if r.estado <> 'esperando_abono' then raise exception 'Esta reserva ya no espera abono'; end if;
  if r.expira_at < now() then
    perform public.liberar_vencidas();
    raise exception 'Se pasó el tiempo y la hora se liberó. Vuelve a reservar.';
  end if;
  if coalesce(p_comprobante, '') !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' or length(p_comprobante) > 600000 then
    raise exception 'Adjunta la foto del comprobante';
  end if;
  update public.reservas set estado = 'en_revision', pagado_con = case when p_medio = 'link' then 'link' else 'transferencia' end,
    comprobante = p_comprobante, comprobante_at = now(), expira_at = null, revision_paso = 0, revision_previa = false
  where id = r.id returning * into r;
  perform public.notificar_reserva(r);
  return r;
end $$;

-- "Ya aboné" (cliente con cuenta): con la foto del comprobante, que también llega al chat del barbero.
create or replace function public.ya_abone(p_reserva uuid, p_comprobante text, p_medio text default 'transferencia') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; r public.reservas;
begin
  me := public.yo_activo();
  select * into r from public.reservas where id = p_reserva and cliente_id = me.id;
  if r.id is null then raise exception 'Reserva no encontrada'; end if;
  r := public.subir_comprobante(r.id, p_comprobante, p_medio);
  insert into public.messages (sender, recipient, body, imagen, reserva_id, sistema)
  values (me.id, r.barbero_id, '🧾 Comprobante de abono (' || public.pesos(r.abono) || ') · ' || public.fecha_txt(r.inicio), p_comprobante, r.id, true);
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

-- Mis horas (cliente): próximas e historial, con si el barbero vio el aviso y qué puede hacer con cada una.
create or replace function public.mis_horas() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles;
begin
  perform public.liberar_vencidas();
  me := public.yo_activo();
  return (select coalesce(jsonb_agg(x order by x.inicio desc), '[]'::jsonb) from (
    select r.id, r.inicio, r.fin, case when r.estado = 'confirmada' then 'agendada' when r.estado = 'por_aprobar' then 'en_revision' else r.estado end as estado,
           r.servicios, r.total, r.abono, r.pagado_con, r.expira_at, r.consultar,
           r.motivo, r.abono_destino, r.devolucion, r.sin_verificar, r.created_at, r.confirmada_at, r.comprobante_at, r.reagendada, r.barbero_id,
           public.nombre_de(p) as barbero, p.avatar as barbero_avatar, p.foto as barbero_foto,
           public.politica(r) as politica, public.reagendable(r) as reagendable,
           exists (select 1 from public.calificaciones q where q.reserva_id = r.id and q.autor = 'cliente') as calificada,
           (select max(a.visto_at) from public.avisos a where a.reserva_id = r.id and a.para = r.barbero_id) as visto_barbero
    from public.reservas r join public.profiles p on p.id = r.barbero_id
    where r.cliente_id = me.id and r.inicio > now() - interval '365 days'
    order by r.inicio desc limit 100) x);
end $$;

-- Cancelar según las reglas: devolución (primeros N min) · saldo a favor (con X horas) · pierde el abono.
create or replace function public.cancelar_reserva(r public.reservas, p_por uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pol text := public.politica(r); dest text; own uuid; quien text;
begin
  if pol is null then raise exception 'Esta hora ya no se puede anular'; end if;
  dest := case pol when 'devolucion' then 'devolucion' when 'saldo' then 'saldo' when 'pierde' then 'perdido' end;
  update public.reservas set estado = 'anulada', anulada_at = now(), anulada_por = p_por, motivo = 'Anulada por el cliente', expira_at = null,
    abono_destino = dest, devolucion = case when dest = 'devolucion' then 'pendiente' end,
    sin_verificar = dest = 'devolucion' and r.estado in ('en_revision', 'por_aprobar'),
    saldo_hasta = case when dest = 'saldo' and r.cliente_id is null then now() + make_interval(days => public.regla('dias_saldo')) end
  where id = r.id;
  if dest = 'saldo' and r.cliente_id is not null then update public.profiles set saldo = saldo + r.abono where id = r.cliente_id; end if;
  if r.estado <> 'esperando_abono' then
    select owner_id into own from public.barberias where id = r.barberia_id;
    quien := coalesce((select public.nombre_de(p) from public.profiles p where p.id = r.cliente_id), r.cliente_nombre || ' (sin cuenta)');
    perform public.avisar(r.cliente_id, r.barbero_id, 'reserva', '❌ Hora anulada',
      quien || ' anuló su hora del ' || public.fecha_txt(r.inicio), 'agenda?r=' || r.id, r.id);
    if dest = 'devolucion' then
      -- v2.1: si el abono aún estaba en revisión, nadie confirmó que llegó: se devuelve solo si la transferencia llegó.
      perform public.avisar(r.cliente_id, own, 'reserva', '💸 Devolver abono',
        case when r.estado in ('en_revision', 'por_aprobar')
          then quien || coalesce(' (' || r.cliente_tel || ')', '') || ' anuló antes de que se aprobara su abono de ' || public.pesos(r.abono) ||
               '. Revisa tu cuenta: devuélvelo solo si la transferencia llegó. Lo marcas en Inicio.'
          else 'Devuelve ' || public.pesos(r.abono) || ' a ' || quien || coalesce(' (' || r.cliente_tel || ')', '') ||
               ': anuló dentro de los primeros ' || public.regla('minutos_devolucion') || ' minutos. Márcalo como devuelto en Inicio.' end, 'hoy', r.id);
    elsif own <> r.barbero_id then
      perform public.avisar(r.cliente_id, own, 'reserva', '❌ Hora anulada',
        quien || ' anuló su hora del ' || public.fecha_txt(r.inicio), 'agenda?r=' || r.id, r.id);
    end if;
    perform public.avisar_espera(r.barberia_id, r.barbero_id, r.inicio);
  end if;
  return jsonb_build_object('abono_destino', dest, 'abono', r.abono, 'politica', pol);
end $$;

-- Reagendar a otra hora con el mismo barbero (también una hora anulada con saldo a favor, si no tiene cuenta).
create or replace function public.reagendar_reserva(r public.reservas, p_inicio timestamptz) returns public.reservas
language plpgsql security definer set search_path = '' as $$
declare dur int := (extract(epoch from (r.fin - r.inicio)) / 60)::int; bar public.profiles; prem boolean; own uuid; quien text;
begin
  if not public.reagendable(r) then
    raise exception 'Ya no se puede reagendar (faltan menos de % horas o venció el saldo)', public.regla('horas_cancelacion');
  end if;
  select * into bar from public.profiles where id = r.barbero_id;
  if not public.reservable(bar) then raise exception '% no tiene la agenda abierta. Escríbele para coordinar.', public.nombre_de(bar); end if;
  prem := r.cliente_id is not null and public.is_premium(r.cliente_id);
  if extract(epoch from p_inicio)::bigint % 300 <> 0 then raise exception 'Elige una hora del calendario'; end if;
  if p_inicio < now() + interval '1 hour' then raise exception 'Reserva con al menos 1 hora de anticipación'; end if;
  if p_inicio > now() + make_interval(days => public.limite('dias', prem)) then
    raise exception 'Puedes reservar hasta % días adelante', public.limite('dias', prem);
  end if;
  perform public.validar_hora(r.barbero_id, p_inicio, p_inicio + make_interval(mins => dur));
  begin
    update public.reservas set inicio = p_inicio, fin = p_inicio + make_interval(mins => dur), estado = 'agendada',
      abono_destino = null, saldo_hasta = null, anulada_at = null, anulada_por = null, motivo = null,
      reagendada = reagendada + 1, recordado24 = false, recordado2 = false, confirmada_at = coalesce(confirmada_at, now())
    where id = r.id returning * into r;
  exception when exclusion_violation then raise exception 'Esa hora ya está ocupada. Elige otra 🙏';
  end;
  select owner_id into own from public.barberias where id = r.barberia_id;
  quien := coalesce((select public.nombre_de(p) from public.profiles p where p.id = r.cliente_id), r.cliente_nombre || ' (sin cuenta)');
  perform public.avisar(r.cliente_id, r.barbero_id, 'reserva', '🔁 Hora reagendada', quien || ' · ahora el ' || public.fecha_txt(p_inicio), 'agenda?r=' || r.id, r.id);
  if own <> r.barbero_id then
    perform public.avisar(r.cliente_id, own, 'reserva', '🔁 Hora reagendada', quien || ' · ahora el ' || public.fecha_txt(p_inicio), 'agenda?r=' || r.id, r.id);
  end if;
  return r;
end $$;

-- Anular (cliente con cuenta).
create or replace function public.anular_mia(p_reserva uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; r public.reservas;
begin
  me := public.yo_activo();
  select * into r from public.reservas where id = p_reserva and cliente_id = me.id for update;
  if r.id is null then raise exception 'Reserva no encontrada'; end if;
  return public.cancelar_reserva(r, me.id);
end $$;

create or replace function public.reagendar_mia(p_reserva uuid, p_inicio timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; r public.reservas;
begin
  me := public.yo_activo();
  select * into r from public.reservas where id = p_reserva and cliente_id = me.id for update;
  if r.id is null then raise exception 'Reserva no encontrada'; end if;
  r := public.reagendar_reserva(r, p_inicio);
  return to_jsonb(r) - 'comprobante';
end $$;

-- ---------------------------------------------------------------------
-- v2.0: Página de la reserva SIN cuenta (link personal r/?t=…): ver, pagar, cancelar, reagendar y calificar.
-- ---------------------------------------------------------------------
create or replace function public.reserva_por_token(p_token text) returns public.reservas
language plpgsql security definer set search_path = '' as $$
declare r public.reservas;
begin
  if length(coalesce(p_token, '')) < 30 then raise exception 'Reserva no encontrada'; end if;
  select * into r from public.reservas where token = p_token for update;
  if r.id is null then raise exception 'Reserva no encontrada'; end if;
  return r;
end $$;

create or replace function public.reserva_ver(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.reservas; b public.barberias; bar public.profiles; c public.profiles;
begin
  perform public.liberar_vencidas();
  select * into r from public.reservas where token = p_token and length(coalesce(p_token, '')) >= 30;
  if r.id is null then return null; end if;
  select * into b from public.barberias where id = r.barberia_id;
  select * into bar from public.profiles where id = r.barbero_id;
  select * into c from public.profiles where id = r.cliente_id;
  return jsonb_build_object(
    'token', r.token, 'estado', case when r.estado = 'confirmada' then 'agendada' when r.estado = 'por_aprobar' then 'en_revision' else r.estado end,
    'inicio', r.inicio, 'fin', r.fin, 'servicios', r.servicios, 'total', r.total, 'abono', r.abono, 'pagado_con', r.pagado_con,
    'expira_at', r.expira_at, 'comprobante_at', r.comprobante_at, 'motivo', r.motivo, 'abono_destino', r.abono_destino,
    'devolucion', r.devolucion, 'sin_verificar', r.sin_verificar, 'saldo_hasta', r.saldo_hasta, 'reagendada', r.reagendada, 'created_at', r.created_at,
    'nombre', coalesce(c.nombre, r.cliente_nombre), 'con_cuenta', r.cliente_id is not null,
    'politica', public.politica(r), 'reagendable', public.reagendable(r) and r.cliente_id is null,
    'calificada', exists (select 1 from public.calificaciones q where q.reserva_id = r.id and q.autor = 'cliente'),
    'barbero', jsonb_build_object('id', bar.id, 'nombre', public.nombre_de(bar), 'avatar', bar.avatar, 'foto', bar.foto,
      'horario', public.horario_de(bar.id), 'reservable', public.reservable(bar), 'paso', bar.paso_min),
    'barberia', jsonb_build_object('codigo', b.codigo, 'nombre', b.nombre, 'logo', b.logo, 'color', case when public.barberia_premium(b.id) then b.color end,
      'direccion', b.direccion, 'whatsapp', b.whatsapp,
      'link_pago', case when r.estado = 'esperando_abono' then b.link_pago end,
      'abono_texto', case when r.estado = 'esperando_abono' then case when b.pago_activo = 2 then b.pago2_texto else b.pago1_texto end end,
      'datos_transferencia', case when r.estado = 'esperando_abono' then b.datos_transferencia end),
    'dias_max', public.limite('dias', false));
end $$;

create or replace function public.reserva_comprobante(p_token text, p_imagen text, p_medio text default 'transferencia') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.reservas;
begin
  r := public.reserva_por_token(p_token);
  perform public.subir_comprobante(r.id, p_imagen, p_medio);
  return public.reserva_ver(p_token);
end $$;

create or replace function public.reserva_cancelar(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.reservas; x jsonb;
begin
  r := public.reserva_por_token(p_token);
  if r.cliente_id is not null then raise exception 'Esta hora es de una cuenta: anúlala desde la app'; end if;
  x := public.cancelar_reserva(r, null);
  return x || jsonb_build_object('reserva', public.reserva_ver(p_token));
end $$;

create or replace function public.reserva_reagendar(p_token text, p_inicio timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.reservas;
begin
  r := public.reserva_por_token(p_token);
  if r.cliente_id is not null then raise exception 'Esta hora es de una cuenta: reagéndala desde la app'; end if;
  perform public.reagendar_reserva(r, p_inicio);
  return public.reserva_ver(p_token);
end $$;

-- Calificación del cliente a la barbería (una vez por visita, después de "Atendida").
create or replace function public.calificar_visita(r public.reservas, p_estrellas int, p_comentario text) returns void
language plpgsql security definer set search_path = '' as $$
declare own uuid;
begin
  if r.estado <> 'atendida' then raise exception 'Podrás calificar cuando te atiendan'; end if;
  if coalesce(p_estrellas, 0) not between 1 and 5 then raise exception 'Elige de 1 a 5 estrellas'; end if;
  if exists (select 1 from public.calificaciones where reserva_id = r.id and autor = 'cliente') then raise exception 'Ya calificaste esta visita'; end if;
  insert into public.calificaciones (reserva_id, barberia_id, autor, cliente_id, cliente_tel, cliente_nombre, estrellas, comentario, created_by)
  values (r.id, r.barberia_id, 'cliente', r.cliente_id, r.cliente_tel,
          coalesce((select nombre from public.profiles where id = r.cliente_id), r.cliente_nombre), p_estrellas,
          left(nullif(trim(p_comentario), ''), 300), r.cliente_id);
  select owner_id into own from public.barberias where id = r.barberia_id;
  perform public.avisar(r.cliente_id, own, 'aviso', '⭐ Nueva calificación', 'Te dejaron ' || p_estrellas || ' estrella(s)', 'hoy');
end $$;

create or replace function public.reserva_calificar(p_token text, p_estrellas int, p_comentario text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.reservas;
begin
  r := public.reserva_por_token(p_token);
  perform public.calificar_visita(r, p_estrellas, p_comentario);
  return public.reserva_ver(p_token);
end $$;

create or replace function public.calificar_barberia(p_reserva uuid, p_estrellas int, p_comentario text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; r public.reservas;
begin
  me := public.yo_activo();
  select * into r from public.reservas where id = p_reserva and cliente_id = me.id;
  if r.id is null then raise exception 'Reserva no encontrada'; end if;
  perform public.calificar_visita(r, p_estrellas, p_comentario);
end $$;

-- ---------------------------------------------------------------------
-- v2.0: Vista libre (sin cuenta) desde el link o QR de la barbería
-- ---------------------------------------------------------------------
create or replace function public.vista_publica(p_codigo text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.barberias; prem boolean; susp boolean;
begin
  select * into b from public.barberias where codigo = lower(trim(coalesce(p_codigo, '')));
  if b.id is null then return null; end if;
  susp := exists (select 1 from public.profiles o where o.id = b.owner_id and o.suspended);
  prem := public.barberia_premium(b.id);
  return jsonb_build_object(
    'codigo', b.codigo, 'nombre', b.nombre, 'logo', b.logo, 'color', case when prem then b.color end,
    'portada', case when prem then b.portada end, 'direccion', b.direccion, 'whatsapp', b.whatsapp, 'bienvenida', b.bienvenida,
    'horario', b.horario, 'abono', b.abono, 'suspendida', susp,
    'recibe', not susp and (b.abono = 0 or b.link_pago is not null or b.datos_transferencia is not null),
    'calificacion', public.nota_barberia(b.id),
    'registro', not susp and (select count(*) from public.profiles where barberia_id = b.id and role = 'client') < public.limite('clientes', prem),
    'dias_max', public.limite('dias', false),
    'barberos', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', public.nombre_de(p), 'avatar', p.avatar, 'foto', p.foto,
        'descripcion', p.descripcion, 'reservable', public.reservable(p), 'horario', public.horario_de(p.id),
        'descanso', p.descanso_min, 'paso', p.paso_min, 'duraciones', p.duraciones)
        order by (p.role = 'owner') desc, p.nombre), '[]'::jsonb)
      from public.profiles p where p.barberia_id = b.id and p.role in ('owner', 'barber') and p.activo and not p.suspended),
    'servicios', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'precio', s.precio, 'duracion', s.duracion,
        'categoria', s.categoria, 'descripcion', s.descripcion, 'foto', s.foto, 'barberos', s.barberos) order by s.orden, s.nombre), '[]'::jsonb)
      from public.servicios s where s.barberia_id = b.id and s.visible),
    'ofertas', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'titulo', o.titulo, 'detalle', o.detalle, 'precio', o.precio,
        'imagen', o.imagen, 'hasta', o.hasta) order by o.created_at desc), '[]'::jsonb)
      from public.ofertas o where o.barberia_id = b.id and o.activa and not o.vip
        and (o.hasta is null or o.hasta >= (now() at time zone public.tz())::date)));
end $$;

-- Horas ocupadas (sin nombres) para la vista libre. p_token marca la hora propia al reagendar.
create or replace function public.ocupacion_publica(p_codigo text, p_desde date, p_hasta date, p_token text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare bid uuid; t0 timestamptz; t1 timestamptz;
begin
  select id into bid from public.barberias where codigo = lower(trim(coalesce(p_codigo, '')));
  if bid is null then raise exception 'Barbería no encontrada'; end if;
  if p_hasta < p_desde or p_hasta - p_desde > 120 then raise exception 'Rango no válido'; end if;
  perform public.liberar_vencidas();
  t0 := (p_desde::timestamp) at time zone public.tz();
  t1 := ((p_hasta + 1)::timestamp) at time zone public.tz();
  return jsonb_build_object(
    'reservas', (select coalesce(jsonb_agg(jsonb_build_object('barbero_id', r.barbero_id, 'inicio', r.inicio, 'fin', r.fin,
        'estado', 'ocupado', 'mia', r.token = p_token, 'detalle', false) order by r.inicio), '[]'::jsonb)
      from public.reservas r where r.barberia_id = bid and r.inicio < t1 and r.fin > t0
        and r.estado in ('esperando_abono', 'en_revision', 'por_aprobar', 'agendada', 'confirmada')),
    'bloqueos', (select coalesce(jsonb_agg(jsonb_build_object('barbero_id', k.barbero_id, 'desde', k.desde, 'hasta', k.hasta)), '[]'::jsonb)
      from public.bloqueos k where k.barberia_id = bid and k.desde < t1 and k.hasta > t0));
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

-- Aprobar el abono (en revisión → agendada). Un solo paso: queda agendada y se le avisa al cliente.
create or replace function public.confirmar_hora(p_reserva uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reservas; bname text;
begin
  r := public.reserva_staff(p_reserva);
  if not (r.estado in ('en_revision', 'por_aprobar') or (r.estado = 'agendada' and r.confirmada_at is null)) then
    raise exception 'Esta hora no está pendiente';
  end if;
  update public.reservas set estado = 'agendada', confirmada_at = now(), aprobada_por = auth.uid(), expira_at = null where id = r.id;
  select public.nombre_de(p) into bname from public.profiles p where p.id = r.barbero_id;
  perform public.avisar(auth.uid(), r.cliente_id, 'reserva', '✅ Tu hora quedó agendada',
    public.fecha_txt(r.inicio) || ' con ' || bname || '. ¡Te esperamos!', 'horas', r.id);
end $$;

-- Rechazar el comprobante (la hora se libera) o anular una hora agendada (el abono queda a favor).
create or replace function public.rechazar_hora(p_reserva uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reservas; dest text; revision boolean;
begin
  r := public.reserva_staff(p_reserva);
  if r.estado not in ('esperando_abono', 'en_revision', 'por_aprobar', 'agendada', 'confirmada') then raise exception 'Esta hora ya no está activa'; end if;
  revision := r.estado in ('en_revision', 'por_aprobar');
  if revision and coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe el motivo del rechazo (ej. "No llegó la transferencia")'; end if;
  dest := case when not revision and r.abono > 0 and r.pagado_con in ('link', 'transferencia', 'saldo') and r.estado <> 'esperando_abono' then 'saldo' end;
  update public.reservas set estado = 'anulada', anulada_at = now(), anulada_por = auth.uid(), expira_at = null,
    motivo = coalesce(nullif(trim(p_motivo), ''), 'Anulada por la barbería'), abono_destino = dest,
    saldo_hasta = case when dest = 'saldo' and r.cliente_id is null then now() + make_interval(days => public.regla('dias_saldo')) end
  where id = r.id;
  if dest = 'saldo' and r.cliente_id is not null then update public.profiles set saldo = saldo + r.abono where id = r.cliente_id; end if;
  perform public.avisar(auth.uid(), r.cliente_id, 'reserva', case when revision then '❌ Tu comprobante fue rechazado' else '❌ Tu hora fue anulada' end,
    public.fecha_txt(r.inicio) || coalesce(' · ' || nullif(trim(p_motivo), ''), '') ||
    case when dest = 'saldo' then '. Tu abono quedó como saldo a favor.' else '' end, 'horas', r.id);
  perform public.avisar_espera(r.barberia_id, r.barbero_id, r.inicio);
end $$;

-- El dueño marca que ya devolvió el abono.
create or replace function public.marcar_devuelto(p_reserva uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := public.yo_activo();
  if me.role <> 'owner' then raise exception 'Solo el dueño'; end if;
  update public.reservas set devolucion = 'devuelta', devuelta_at = now()
  where id = p_reserva and barberia_id = me.barberia_id and devolucion = 'pendiente';
  if not found then raise exception 'No hay una devolución pendiente en esta hora'; end if;
end $$;

-- v2.1: la transferencia de un abono sin verificar no llegó: no hay nada que devolver.
create or replace function public.descartar_devolucion(p_reserva uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; r public.reservas;
begin
  me := public.yo_activo();
  if me.role <> 'owner' then raise exception 'Solo el dueño'; end if;
  update public.reservas set devolucion = 'no_llego', devuelta_at = now(), abono_destino = 'perdido'
  where id = p_reserva and barberia_id = me.barberia_id and devolucion = 'pendiente' and sin_verificar returning * into r;
  if r.id is null then raise exception 'Solo se descarta una devolución cuyo abono no se alcanzó a verificar'; end if;
  perform public.avisar(me.id, r.cliente_id, 'reserva', 'Abono no recibido',
    'La barbería revisó y no le llegó tu transferencia de ' || public.pesos(r.abono) || ', así que no hay devolución. Si fue un error, escríbele.', 'horas', r.id);
end $$;

-- Marcar Atendida (pasa sola a la Caja) o No vino.
create or replace function public.marcar_hora(p_reserva uuid, p_estado text, p_medio text default 'efectivo', p_propina int default 0)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reservas; nv int; me public.profiles := public.yo();
begin
  r := public.reserva_staff(p_reserva);
  if p_estado not in ('atendida', 'no_vino') then raise exception 'Estado no válido'; end if;
  if r.estado not in ('agendada', 'confirmada', 'en_revision', 'por_aprobar', 'atendida', 'no_vino') then raise exception 'Esta hora no se puede marcar'; end if;
  if r.inicio > now() + interval '30 minutes' then raise exception 'Todavía no llega la hora'; end if;
  update public.reservas set estado = p_estado, expira_at = null, confirmada_at = coalesce(confirmada_at, now()),
    abono_destino = case when p_estado = 'no_vino' and abono > 0 and pagado_con in ('link', 'transferencia', 'saldo') then 'perdido' else abono_destino end
  where id = r.id;
  if p_estado = 'atendida' then
    insert into public.caja (barberia_id, barbero_id, reserva_id, fecha, servicio, monto, abono, medio, cliente_id, cliente_nombre, propina, created_by)
    select r.barberia_id, r.barbero_id, r.id, r.inicio,
           coalesce((select string_agg(x ->> 'nombre', ' + ') from jsonb_array_elements(r.servicios) x), 'Corte'),
           r.total, case when r.pagado_con in ('link', 'transferencia', 'saldo') then r.abono else 0 end,
           case when p_medio = 'transferencia' then 'transferencia' else 'efectivo' end,
           r.cliente_id, coalesce((select nombre from public.profiles where id = r.cliente_id), r.cliente_nombre),
           case when me.role = 'barber' then 0 else greatest(0, coalesce(p_propina, 0)) end, auth.uid()
    on conflict (reserva_id) do nothing;
  else
    delete from public.caja where reserva_id = r.id;
    select count(*) into nv from public.reservas
    where barberia_id = r.barberia_id and estado = 'no_vino'
      and ((r.cliente_id is not null and cliente_id = r.cliente_id) or (r.cliente_id is null and cliente_tel = r.cliente_tel));
    if nv >= 3 then
      perform public.avisar(null, (select owner_id from public.barberias where id = r.barberia_id), 'aviso',
        '⚠️ Cliente con ' || nv || ' "No vino"', coalesce((select nombre from public.profiles where id = r.cliente_id), r.cliente_nombre, 'Un cliente') ||
        ' ya faltó ' || nv || ' veces. Califícalo para que quede en la lista negra.', 'clientes');
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
  if r.estado not in ('esperando_abono', 'en_revision', 'por_aprobar', 'agendada', 'confirmada') then raise exception 'Esta hora ya no está activa'; end if;
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

-- Hora creada por el equipo (cliente que escribió, llamó o llegó). Sin restricciones de horario. Queda agendada.
drop function if exists public.crear_hora(uuid, timestamptz, uuid[], uuid, text, int, text);
create or replace function public.crear_hora(p_barbero uuid, p_inicio timestamptz, p_servicios uuid[], p_cliente uuid,
                                             p_nombre text default null, p_minutos int default null, p_nota text default null,
                                             p_telefono text default null)
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
  select coalesce(sum(public.duracion_con(bar, s)), 0), coalesce(sum(s.precio), 0),
         coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'precio', s.precio, 'duracion', public.duracion_con(bar, s))), '[]'::jsonb)
    into dur, tot, items
  from unnest(coalesce(p_servicios, '{}')) as u(id) join public.servicios s on s.id = u.id where s.barberia_id = me.barberia_id;
  dur := coalesce(nullif(p_minutos, 0), nullif(dur, 0) + coalesce(bar.descanso_min, 0), 30);
  if dur not between 5 and 480 then raise exception 'Duración no válida'; end if;
  begin
    insert into public.reservas (barberia_id, barbero_id, cliente_id, cliente_nombre, cliente_tel, inicio, fin, servicios, total, abono,
                                 pagado_con, estado, confirmada_at, creada_por, nota)
    values (me.barberia_id, bar.id, c.id, case when c.id is null then left(trim(p_nombre), 60) end,
            nullif(public.tel_norm(coalesce(c.telefono, p_telefono)), ''), p_inicio,
            p_inicio + make_interval(mins => dur), items, tot, 0, 'interno', 'agendada', now(), me.id, left(p_nota, 200))
    returning * into r;
  exception when exclusion_violation then raise exception 'Esa hora ya está ocupada';
  end;
  if c.id is not null then
    perform public.avisar(me.id, c.id, 'reserva', '📅 Te agendamos una hora',
      public.fecha_txt(p_inicio) || ' con ' || public.nombre_de(bar) || '. ¡Te esperamos!', 'horas', r.id);
  end if;
  return to_jsonb(r) - 'comprobante';
end $$;

-- Calificar al cliente (una vez por visita, después de Atendida o No vino). Con 2 estrellas o menos entra a la lista negra.
create or replace function public.calificar_cliente(p_reserva uuid, p_estrellas int, p_motivo text default null, p_comentario text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reservas; c public.profiles; me public.profiles := public.yo(); tel text;
begin
  r := public.reserva_staff(p_reserva);
  if r.estado not in ('atendida', 'no_vino') then raise exception 'Califica después de marcar Atendida o No vino'; end if;
  if coalesce(p_estrellas, 0) not between 1 and 5 then raise exception 'Elige de 1 a 5 estrellas'; end if;
  if r.cliente_id is null and coalesce(r.cliente_tel, '') = '' then raise exception 'Esta hora no tiene un cliente para calificar'; end if;
  if exists (select 1 from public.calificaciones where reserva_id = r.id and autor = 'barberia') then raise exception 'Ya calificaste esta visita'; end if;
  select * into c from public.profiles where id = r.cliente_id;
  tel := nullif(public.tel_norm(coalesce(c.telefono, r.cliente_tel)), '');
  insert into public.calificaciones (reserva_id, barberia_id, autor, cliente_id, cliente_tel, cliente_nombre, estrellas, motivo, comentario, created_by)
  values (r.id, r.barberia_id, 'barberia', r.cliente_id, tel, coalesce(c.nombre, r.cliente_nombre), p_estrellas,
          left(nullif(trim(p_motivo), ''), 60), left(nullif(trim(p_comentario), ''), 300), me.id);
  if p_estrellas <= public.regla('estrellas_lista_negra') and public.en_lista_negra(r.barberia_id, r.cliente_id, tel) is null then
    insert into public.lista_negra (barberia_id, cliente_id, tel, nombre, motivo, agregado_por)
    values (r.barberia_id, r.cliente_id, tel, coalesce(c.nombre, r.cliente_nombre),
            coalesce(nullif(trim(p_motivo), ''), p_estrellas || ' estrella(s)') || coalesce(' · ' || nullif(trim(p_comentario), ''), ''), me.id);
  end if;
end $$;

create or replace function public.ver_lista_negra() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := public.yo_activo();
  if not public.es_staff(me) then raise exception 'Solo la barbería'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'cliente_id', l.cliente_id, 'nombre', coalesce(c.nombre, l.nombre),
      'tel', coalesce(c.telefono, l.tel), 'motivo', l.motivo, 'desde', l.created_at, 'por', public.nombre_de(a),
      'nota', public.nota_cliente(l.barberia_id, l.cliente_id, coalesce(c.telefono, l.tel))) order by l.created_at desc), '[]'::jsonb)
    from public.lista_negra l left join public.profiles c on c.id = l.cliente_id left join public.profiles a on a.id = l.agregado_por
    where l.barberia_id = me.barberia_id and l.activo);
end $$;

create or replace function public.quitar_lista_negra(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := public.yo_activo();
  if me.role <> 'owner' then raise exception 'Solo el dueño saca a alguien de la lista negra'; end if;
  update public.lista_negra set activo = false, quitado_por = me.id, quitado_at = now()
  where id = p_id and barberia_id = me.barberia_id and activo;
end $$;

-- Calificaciones recibidas (dueño): promedio y comentarios.
create or replace function public.mis_calificaciones() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := public.yo_activo();
  if me.role <> 'owner' then raise exception 'Solo el dueño'; end if;
  return jsonb_build_object('nota', public.nota_barberia(me.barberia_id),
    'ultimas', (select coalesce(jsonb_agg(jsonb_build_object('estrellas', q.estrellas, 'comentario', q.comentario, 'nombre', q.cliente_nombre,
        'created_at', q.created_at) order by q.created_at desc), '[]'::jsonb)
      from (select * from public.calificaciones where barberia_id = me.barberia_id and autor = 'cliente' order by created_at desc limit 50) q));
end $$;

-- Lo urgente para el Inicio de la barbería: abonos por revisar y devoluciones pendientes (dueño).
create or replace function public.mis_pendientes() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := public.yo_activo();
  if not public.es_staff(me) then raise exception 'Solo la barbería'; end if;
  return jsonb_build_object(
    'revision', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'inicio', r.inicio, 'fin', r.fin, 'barbero_id', r.barbero_id,
        'cliente', coalesce(c.nombre, r.cliente_nombre, 'Cliente'), 'cliente_id', r.cliente_id, 'cliente_tel', coalesce(c.telefono, r.cliente_tel),
        'invitado', r.cliente_id is null, 'cliente_premium', public.is_premium(c.id),
        'servicios', (select coalesce(jsonb_agg(x - 'precio'), '[]'::jsonb) from jsonb_array_elements(r.servicios) x),
        'abono', case when me.role = 'owner' then r.abono end, 'pagado_con', r.pagado_con, 'comprobante_at', r.comprobante_at,
        'tiene_comprobante', r.comprobante is not null, 'token', r.token,
        'lista_negra', public.en_lista_negra(r.barberia_id, r.cliente_id, coalesce(c.telefono, r.cliente_tel)),
        'nota_cliente', public.nota_cliente(r.barberia_id, r.cliente_id, coalesce(c.telefono, r.cliente_tel))) order by r.inicio), '[]'::jsonb)
      from public.reservas r left join public.profiles c on c.id = r.cliente_id
      where r.barberia_id = me.barberia_id and r.estado in ('en_revision', 'por_aprobar') and (me.role = 'owner' or r.barbero_id = me.id)),
    'devoluciones', case when me.role = 'owner' then (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'inicio', r.inicio,
        'cliente', coalesce(c.nombre, r.cliente_nombre, 'Cliente'), 'cliente_tel', coalesce(c.telefono, r.cliente_tel), 'abono', r.abono,
        'anulada_at', r.anulada_at, 'pagado_con', r.pagado_con, 'tiene_comprobante', r.comprobante is not null,
        'sin_verificar', r.sin_verificar, 'invitado', r.cliente_id is null, 'token', r.token) order by r.anulada_at), '[]'::jsonb)
      from public.reservas r left join public.profiles c on c.id = r.cliente_id
      where r.barberia_id = me.barberia_id and r.devolucion = 'pendiente') else '[]'::jsonb end);
end $$;

-- Recordar al barbero (y luego al dueño) los comprobantes que esperan revisión.
create or replace function public.recordar_revisiones() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; m int := public.regla('minutos_recordar_revision'); own uuid; quien text; ln jsonb;
begin
  for r in select * from public.reservas where estado = 'en_revision' loop
    select owner_id into own from public.barberias where id = r.barberia_id;
    quien := coalesce((select public.nombre_de(p) from public.profiles p where p.id = r.cliente_id), r.cliente_nombre || ' (sin cuenta)');
    -- La hora ya pasó hace 24 h sin revisión: el abono queda a favor del cliente (no pierde su plata).
    if r.inicio < now() - interval '24 hours' then
      update public.reservas set estado = 'anulada', anulada_at = now(), motivo = 'La barbería no revisó el comprobante a tiempo',
        abono_destino = case when abono > 0 then 'saldo' end,
        saldo_hasta = case when abono > 0 and cliente_id is null then now() + make_interval(days => public.regla('dias_saldo')) end
      where id = r.id;
      if r.abono > 0 and r.cliente_id is not null then update public.profiles set saldo = saldo + r.abono where id = r.cliente_id; end if;
      perform public.avisar(null, r.cliente_id, 'reserva', 'Tu abono quedó a favor',
        'La barbería no alcanzó a revisar tu comprobante del ' || public.fecha_txt(r.inicio) || '. Tu abono quedó como saldo a favor.', 'horas', r.id);
      perform public.avisar(null, own, 'reserva', '⚠️ Comprobante sin revisar', quien || ' · ' || public.fecha_txt(r.inicio) ||
        ': pasaron 24 h sin revisión y su abono quedó como saldo a favor.', 'agenda?r=' || r.id, r.id);
      n := n + 1;
      continue;
    end if;
    if r.revision_paso = 0 and r.comprobante_at < now() - make_interval(mins => m) then
      perform public.avisar(null, r.barbero_id, 'reserva', '🧾 Tienes un abono por revisar',
        quien || ' · ' || public.fecha_txt(r.inicio) || '. Revisa que llegó la transferencia y aprueba la hora.', 'agenda?r=' || r.id, r.id);
      update public.reservas set revision_paso = 1 where id = r.id;
      n := n + 1;
    elsif r.revision_paso = 1 and r.comprobante_at < now() - make_interval(mins => m * 2) then
      if own <> r.barbero_id then
        perform public.avisar(null, own, 'reserva', '🧾 Abono sin revisar', quien || ' · ' || public.fecha_txt(r.inicio) ||
          ' sigue esperando revisión de ' || (select public.nombre_de(p) from public.profiles p where p.id = r.barbero_id) || '.', 'agenda?r=' || r.id, r.id);
      else
        perform public.avisar(null, r.barbero_id, 'reserva', '🧾 Abono sin revisar', quien || ' · ' || public.fecha_txt(r.inicio) ||
          ' sigue esperando que apruebes su hora.', 'agenda?r=' || r.id, r.id);
      end if;
      update public.reservas set revision_paso = 2 where id = r.id;
      n := n + 1;
    end if;
    if not r.revision_previa and r.inicio between now() and now() + interval '1 hour' then
      perform public.avisar(null, r.barbero_id, 'reserva', '⏰ Hora en 1 hora sin aprobar',
        quien || ' llega a las ' || to_char(r.inicio at time zone public.tz(), 'HH24:MI') || ' y su abono sigue en revisión.', 'agenda?r=' || r.id, r.id);
      update public.reservas set revision_previa = true where id = r.id;
      n := n + 1;
    end if;
  end loop;
  return n;
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
  -- v2.0: el barbero no ve ni escribe montos: el precio sale del servicio elegido (o lo completa el dueño).
  if me.role = 'barber' then
    if nullif(p ->> 'servicio_id', '') is not null then
      select p || jsonb_build_object('servicio', s.nombre, 'monto', s.precio) into p from public.servicios s
      where s.id = (p ->> 'servicio_id')::uuid and s.barberia_id = me.barberia_id;
    end if;
    if nullif(p ->> 'id', '') is not null then
      p := p || jsonb_build_object('monto', coalesce((select case when nullif(p ->> 'servicio_id', '') is null then k.monto end
             from public.caja k where k.id = (p ->> 'id')::uuid), (p ->> 'monto')::int, 0),
             'propina', (select k.propina from public.caja k where k.id = (p ->> 'id')::uuid));
    else
      p := p || jsonb_build_object('monto', case when nullif(p ->> 'servicio_id', '') is not null then coalesce((p ->> 'monto')::int, 0) else 0 end,
                                   'propina', 0);
    end if;
  end if;
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
  prem := public.tiene('barberia', 'caja_reportes', public.barberia_premium(me.barberia_id));
  if not prem and (p_desde <> hoy or p_hasta <> hoy) then raise exception 'Los reportes de caja son Premium ⭐'; end if;
  if me.role = 'barber' then quien := me.id;
  elsif p_barbero is null and not prem then quien := me.id;
  else quien := p_barbero; end if;
  -- v2.0: el barbero ve sus cortes, sin montos.
  return (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'barbero_id', k.barbero_id, 'barbero', public.nombre_de(p),
      'fecha', k.fecha, 'servicio', k.servicio, 'medio', k.medio, 'cliente_id', k.cliente_id, 'cliente', k.cliente_nombre, 'nota', k.nota,
      'reserva_id', k.reserva_id)
      || case when me.role = 'barber' then '{}'::jsonb else jsonb_build_object('monto', k.monto, 'abono', k.abono, 'propina', k.propina) end
      order by k.fecha desc), '[]'::jsonb)
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
  if not public.img_ok(p ->> 'logo', 30000) or not public.img_ok(p ->> 'portada', 420000) then raise exception 'Imagen muy pesada'; end if;
  if coalesce(p ->> 'link_pago', '') <> '' and p ->> 'link_pago' !~* '^https://' then raise exception 'El link de pago debe empezar con https://'; end if;
  -- v1.4: dos links de pago; el activo pasa a ser el abono y el link que ven los clientes.
  if p ? 'pagos' then
    if coalesce(p -> 'pagos' ->> 'activo', '1') not in ('1', '2') then raise exception 'Elige el link 1 o el 2'; end if;
    if coalesce(p -> 'pagos' -> 'p1' ->> 'link', '') <> '' and p -> 'pagos' -> 'p1' ->> 'link' !~* '^https://' then raise exception 'El link 1 debe empezar con https://'; end if;
    if coalesce(p -> 'pagos' -> 'p2' ->> 'link', '') <> '' and p -> 'pagos' -> 'p2' ->> 'link' !~* '^https://' then raise exception 'El link 2 debe empezar con https://'; end if;
    if (p -> 'pagos' ->> 'activo') = '2' and nullif(p -> 'pagos' -> 'p2' ->> 'monto', '') is null then raise exception 'Pon el monto del link 2 antes de activarlo'; end if;
    update public.barberias set
      pago1_monto = greatest(0, least(100000, coalesce(nullif(p -> 'pagos' -> 'p1' ->> 'monto', '')::int, pago1_monto, abono))),
      pago1_link = nullif(trim(p -> 'pagos' -> 'p1' ->> 'link'), ''),
      pago2_monto = greatest(0, least(100000, nullif(p -> 'pagos' -> 'p2' ->> 'monto', '')::int)),
      pago2_link = nullif(trim(p -> 'pagos' -> 'p2' ->> 'link'), ''),
      pago1_texto = left(nullif(trim(p -> 'pagos' -> 'p1' ->> 'texto'), ''), 120),
      pago2_texto = left(nullif(trim(p -> 'pagos' -> 'p2' ->> 'texto'), ''), 120),
      pago_activo = coalesce((p -> 'pagos' ->> 'activo')::smallint, 1)
    where id = me.barberia_id;
    update public.barberias set
      abono = case when pago_activo = 2 then coalesce(pago2_monto, 0) else coalesce(pago1_monto, 0) end,
      link_pago = case when pago_activo = 2 then pago2_link else pago1_link end
    where id = me.barberia_id;
    p := p - 'abono' - 'link_pago';
  end if;
  if (coalesce(p ->> 'color', '') <> '' or coalesce(p ->> 'portada', '') <> '') and not public.tiene('barberia', 'colores', prem) then
    raise exception 'Colores y portada son Premium ⭐';
  end if;
  -- v2.1: comisión y sellos según el plan (opción sí/no); cumpleaños también.
  if ((p ? 'comision' and (p ->> 'comision')::int is distinct from (select comision from public.barberias where id = me.barberia_id))
      or (p ? 'sellos_meta' and (p ->> 'sellos_meta')::int is distinct from (select sellos_meta from public.barberias where id = me.barberia_id)))
     and not public.tiene('barberia', 'comisiones', prem) then
    raise exception 'Comisiones y sellos son Premium ⭐';
  end if;
  if coalesce(trim(p ->> 'regalo_cumple'), '') <> '' and not public.tiene('barberia', 'cumpleanos', prem) then
    raise exception 'El regalo de cumpleaños es Premium ⭐';
  end if;
  if p ? 'abono_premium' and nullif(p ->> 'abono_premium', '') is not null and (p ->> 'abono_premium')::int not between 0 and 100000 then
    raise exception 'Abono Premium no válido';
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
    barberos_crean_clientes = case when p ? 'barberos_crean_clientes' then coalesce((p ->> 'barberos_crean_clientes')::boolean, true) else barberos_crean_clientes end,
    abono_premium = case when p ? 'abono_premium' then nullif(p ->> 'abono_premium', '')::int else abono_premium end,
    regalo_cumple = case when p ? 'regalo_cumple' then left(nullif(trim(p ->> 'regalo_cumple'), ''), 120) else regalo_cumple end,
    mensaje_volver = case when p ? 'mensaje_volver' then left(nullif(trim(p ->> 'mensaje_volver'), ''), 300) else mensaje_volver end
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
  prem := case when me.role in ('admin', 'socio') then true when public.es_staff(me) then public.tiene('barberia', 'colores', public.barberia_premium(me.barberia_id))
               else public.tiene('cliente', 'colores', public.is_premium(me.id)) end;
  if not public.img_ok(p ->> 'foto', 40000) then raise exception 'Foto muy pesada'; end if;
  -- v1.3: Free elige entre 4 colores conocidos; Premium, cualquier color (también uno personalizado).
  if coalesce(p ->> 'color', '') <> '' then
    if (p ->> 'color') !~* '^#[0-9a-f]{6}$' then raise exception 'Color no válido'; end if;
    if not prem and lower(p ->> 'color') not in ('#b07d2b', '#18181b', '#1d4ed8', '#15803d') then
      raise exception 'Todos los colores y el color personalizado son Premium ⭐';
    end if;
  end if;
  if p ? 'favorito' and nullif(p ->> 'favorito', '') is not null then
    if not public.tiene('cliente', 'favorito', public.is_premium(me.id)) then raise exception 'Barbero favorito es Premium ⭐'; end if;
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
  if (p ? 'nombre' or p ? 'foto' or p ? 'descripcion') and not public.tiene('barberia', 'editar_barberos', prem) and p_id <> me.id then
    raise exception 'Editar el perfil y horario de tus barberos es Premium ⭐';
  end if;
  if p ? 'horario' and p -> 'horario' <> 'null'::jsonb and not public.horario_valido(p -> 'horario') then raise exception 'Horario no válido'; end if;
  if p ? 'horario' and p -> 'horario' <> 'null'::jsonb and not public.tiene('barberia', 'horario_barbero', prem) then raise exception 'Horario por barbero es Premium ⭐'; end if;
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
  if coalesce(p ->> 'foto', '') <> '' and not public.tiene('barberia', 'fotos_servicios', prem) then raise exception 'Fotos de servicios son Premium ⭐'; end if;
  if not public.img_ok(p ->> 'foto', 320000) then raise exception 'Foto muy pesada'; end if; -- vitrina (núcleo fotos.js)
  if jsonb_typeof(p -> 'barberos') = 'array' and jsonb_array_length(p -> 'barberos') > 0 then
    if not public.tiene('barberia', 'servicios_barbero', prem) then raise exception 'Elegir qué barbero hace cada servicio es Premium ⭐'; end if;
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
  if coalesce((p ->> 'vip')::boolean, false) and not public.tiene('barberia', 'ofertas_vip', prem) then raise exception 'Ofertas VIP son Premium ⭐'; end if;
  if not public.img_ok(p ->> 'imagen', 320000) then raise exception 'Imagen muy pesada'; end if; -- vitrina (núcleo fotos.js)
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
               and (not o.vip or public.tiene('cliente', 'ofertas_vip', public.is_premium(id))) loop
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
declare me public.profiles; cuentas jsonb; invitados jsonb;
begin
  me := public.yo_activo();
  if not public.es_staff(me) then raise exception 'Solo la barbería'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'nombre', c.nombre, 'email', case when me.role = 'owner' then c.email end, 'telefono', c.telefono,
      'avatar', c.avatar, 'foto', c.foto, 'premium', public.is_premium(c.id), 'premium_until', c.premium_until,
      'saldo', case when me.role = 'owner' then c.saldo end, 'bloqueado', c.bloqueado, 'notas', c.notas, 'cumple', c.cumple, 'clave_temporal', c.clave_temporal,
      'created_at', c.created_at, 'last_seen', c.last_seen, 'invitado', false,
      'lista_negra', public.en_lista_negra(me.barberia_id, c.id, c.telefono), 'nota', public.nota_cliente(me.barberia_id, c.id, c.telefono),
      'visitas', (select count(*) from public.reservas r where r.cliente_id = c.id and r.estado = 'atendida'),
      'no_vino', (select count(*) from public.reservas r where r.cliente_id = c.id and r.estado = 'no_vino'),
      'ultima', (select max(r.inicio) from public.reservas r where r.cliente_id = c.id and r.estado = 'atendida'),
      'proxima', (select min(r.inicio) from public.reservas r where r.cliente_id = c.id and r.inicio > now()
                  and r.estado in ('agendada', 'confirmada', 'en_revision', 'por_aprobar', 'esperando_abono')),
      'creado_por', (select public.nombre_de(x) from public.profiles x where x.id = c.created_by),
      'ultimo_barbero', (select public.nombre_de(x) from public.caja k join public.profiles x on x.id = k.barbero_id
                         where k.cliente_id = c.id order by k.fecha desc limit 1),
      'ultimo_corte', (select max(k.fecha) from public.caja k where k.cliente_id = c.id),
      'habitual', (select public.nombre_de(x) from public.caja k join public.profiles x on x.id = k.barbero_id
                   where k.cliente_id = c.id group by x.id order by count(*) desc, max(k.fecha) desc limit 1),
      'habitual_veces', (select count(*) from public.caja k where k.cliente_id = c.id
                         group by k.barbero_id order by count(*) desc, max(k.fecha) desc limit 1))
      order by c.nombre), '[]'::jsonb) into cuentas
    from public.profiles c where c.barberia_id = me.barberia_id and c.role = 'client';
  -- v2.0: clientes sin cuenta (reservaron con su WhatsApp desde el link o QR).
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', null, 'invitado', true, 'nombre', g.nombre, 'telefono', g.tel, 'avatar', '👤', 'visitas', g.visitas, 'no_vino', g.no_vino,
      'ultima', g.ultima, 'proxima', g.proxima, 'created_at', g.primera,
      'lista_negra', public.en_lista_negra(me.barberia_id, null, g.tel), 'nota', public.nota_cliente(me.barberia_id, null, g.tel))
      order by g.nombre), '[]'::jsonb) into invitados
    from (select r.cliente_tel as tel, (array_agg(r.cliente_nombre order by r.created_at desc))[1] as nombre,
                 count(*) filter (where r.estado = 'atendida') as visitas, count(*) filter (where r.estado = 'no_vino') as no_vino,
                 max(r.inicio) filter (where r.estado = 'atendida') as ultima,
                 min(r.inicio) filter (where r.inicio > now() and r.estado in ('agendada', 'confirmada', 'en_revision', 'esperando_abono')) as proxima,
                 min(r.created_at) as primera
          from public.reservas r
          where r.barberia_id = me.barberia_id and r.cliente_id is null and coalesce(r.cliente_tel, '') <> ''
            and (r.estado <> 'anulada' or r.comprobante_at is not null)
          group by r.cliente_tel) g;
  return cuentas || invitados;
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
  if not public.tiene('barberia', 'sellos', public.barberia_premium(b.id)) then return null; end if;
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
      and ((pa.role in ('admin', 'socio') and pb.role in ('admin', 'socio'))
           or (pa.barberia_id = pb.barberia_id and pa.role not in ('admin', 'socio') and pb.role not in ('admin', 'socio')
               and not (pa.role = 'client' and pb.role = 'client'))))
$$;

-- Cuántos mensajes seguidos me quedan con "otro" (null = sin límite).
create or replace function public.chat_restantes(p_other uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case
    when me.role = 'admin' then null
    when public.rango(me.role) > public.rango(o.role) then null
    when me.role = 'client' and coalesce(public.limite('mensajes', public.is_premium(me.id)), 3) = 0 then null
    else greatest(0, (case when me.role = 'client' then coalesce(public.limite('mensajes', public.is_premium(me.id)), 3) else 3 end) - (select count(*) from public.messages m
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
  if left_ is not null and left_ <= 0 then raise exception 'Llegaste al máximo de mensajes seguidos. Espera que te respondan 🙂'; end if;
  if me.role not in ('admin', 'socio') and (select count(*) from public.messages where sender = me.id and created_at > now() - interval '1 day') >= 100 then
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
    'other', l.other, 'nombre', public.nombre_de(p), 'rol', p.role, 'avatar', p.avatar, 'foto', p.foto, 'last_seen', p.last_seen,
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

-- Última conexión de alguien con quien puedo hablar (para "🟢 en línea" / "visto hace…" en el chat).
create or replace function public.ultima_conexion(p_other uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select p.last_seen from public.profiles p where p.id = p_other and public.puede_hablar(auth.uid(), p_other)
$$;

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
    from public.profiles p where public.puede_hablar(me.id, p.id) and (me.role not in ('admin', 'socio') or p.role in ('owner', 'admin', 'socio')));
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
declare me public.profiles; t0 timestamptz; t1 timestamptz; solo uuid; res jsonb;
begin
  me := public.yo_activo();
  if not public.es_staff(me) then raise exception 'Solo la barbería'; end if;
  if not public.tiene('barberia', 'estadisticas', public.barberia_premium(me.barberia_id)) then raise exception 'Las estadísticas son Premium ⭐'; end if;
  solo := case when me.role = 'barber' then me.id end;
  t0 := (p_desde::timestamp) at time zone public.tz();
  t1 := ((p_hasta + 1)::timestamp) at time zone public.tz();
  res := jsonb_build_object(
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
  -- v2.0: el barbero ve sus cortes y "no vino", sin montos.
  if me.role = 'barber' then
    res := jsonb_build_object(
      'por_barbero', (select coalesce(jsonb_agg(x - 'ventas' - 'propinas' - 'abonos'), '[]'::jsonb) from jsonb_array_elements(res -> 'por_barbero') x),
      'servicios', (select coalesce(jsonb_agg(x - 'total'), '[]'::jsonb) from jsonb_array_elements(res -> 'servicios') x),
      'clientes', (select coalesce(jsonb_agg(x - 'total'), '[]'::jsonb) from jsonb_array_elements(res -> 'clientes') x),
      'horas', res -> 'horas', 'dias', res -> 'dias');
  end if;
  return res;
end $$;

-- ---------------------------------------------------------------------
-- Panel del super admin
-- ---------------------------------------------------------------------
create or replace function public.admin_resumen() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m0 timestamptz := date_trunc('month', now() at time zone public.tz()) at time zone public.tz();
begin
  if not public.es_gestor() then raise exception 'Solo CodeFix'; end if;
  return jsonb_build_object(
    'barberias', (select count(*) from public.barberias),
    'barberias_premium', (select count(*) from public.barberias b where public.is_premium(b.owner_id)),
    'barberos', (select count(*) from public.profiles where role in ('owner', 'barber')),
    'clientes', (select count(*) from public.profiles where role = 'client'),
    'clientes_premium', (select count(*) from public.profiles where role = 'client' and public.is_premium(id)),
    'ingresos_mes', (select coalesce(sum(precio), 0) from public.licenses where not revoked and redeemed_at >= m0),
    'ingresos_total', (select coalesce(sum(precio), 0) from public.licenses where not revoked and redeemed_at is not null),
    'pendientes', (select count(*) from public.pagos where estado = 'en_revision'),
    'pagos_por_revisar', (select count(*) from public.pagos where estado = 'en_revision'),
    'en_revision', (select count(*) from public.reservas where estado = 'en_revision'),
    'invitados_mes', (select count(*) from public.reservas where created_at >= m0 and cliente_id is null and creada_por is null),
    'reportes', (select count(*) from public.reports where not resolved),
    'por_vencer', (select count(*) from public.profiles where plan = 'premium' and premium_until between now() and now() + interval '7 days'),
    'reservas_mes', (select count(*) from public.reservas where inicio >= m0 and estado <> 'anulada'),
    'dispositivos', (select count(*) from public.push_subscriptions),
    'db_mb', round(pg_database_size(current_database()) / 1048576.0, 1),
    'db_version', public.db_version(),
    -- v2.1: tasa de renovación (barberías cuyo Premium terminó en los últimos 30 días y cuántas siguen Premium).
    'renovacion', (with v as (select distinct l.redeemed_by u from public.licenses l
                     where l.tipo = 'barberia' and not l.revoked and l.redeemed_by is not null and l.termino between now() - interval '30 days' and now())
                   select jsonb_build_object('vencieron', count(*), 'renovaron', count(*) filter (where public.is_premium(u))) from v),
    'registradas_mes', (select count(*) from public.barberias where registro_solo and created_at >= m0),
    'es_admin', public.is_admin());
end $$;

-- v2.0: uso del servidor por tabla (para el plan gratis de Supabase: 500 MB).
create or replace function public.admin_uso() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_gestor() then raise exception 'Solo CodeFix'; end if;
  return jsonb_build_object('db_bytes', pg_database_size(current_database()), 'limite', 500 * 1048576,
    'tablas', (select coalesce(jsonb_agg(jsonb_build_object('tabla', c.relname, 'bytes', pg_total_relation_size(c.oid), 'filas', c.reltuples::bigint)
        order by pg_total_relation_size(c.oid) desc), '[]'::jsonb)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'),
    'comprobantes', (select count(*) from public.reservas where comprobante is not null) + (select count(*) from public.pagos where comprobante is not null),
    'fotos_chat', (select count(*) from public.messages where imagen is not null));
end $$;

-- v2.0: botones de limpieza del admin. Nunca borra lo que está en revisión. Todo DELETE con WHERE.
create or replace function public.admin_limpiar(p_que text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int := 0;
begin
  if not public.es_gestor('eliminar') then raise exception 'Sin permiso'; end if;
  if p_que = 'comprobantes' then
    update public.reservas set comprobante = null where comprobante is not null and estado <> 'en_revision' and comprobante_at < now() - interval '7 days';
    get diagnostics n = row_count;
    update public.pagos set comprobante = null where comprobante is not null and estado <> 'en_revision';
  elsif p_que = 'fotos_chat' then
    update public.messages set imagen = null where imagen is not null and created_at < now() - interval '7 days';
    get diagnostics n = row_count;
  elsif p_que = 'avisos' then
    delete from public.avisos where created_at < now() - interval '2 days';
    get diagnostics n = row_count;
  elsif p_que = 'anuladas' then
    delete from public.reservas where estado = 'anulada' and coalesce(anulada_at, created_at) < now() - interval '7 days'
      and coalesce(devolucion, '') <> 'pendiente' and not (abono_destino = 'saldo' and saldo_hasta > now());
    get diagnostics n = row_count;
  elsif p_que = 'auto' then
    return public.limpiar();
  else
    raise exception 'Limpieza no válida';
  end if;
  perform public.auditar('Limpieza', p_que || ': ' || n);
  return jsonb_build_object('borrados', n);
end $$;

create or replace function public.admin_auditoria() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_gestor() then raise exception 'Solo CodeFix'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('accion', a.accion, 'detalle', a.detalle, 'created_at', a.created_at,
      'quien', coalesce(public.nombre_de(p), 'Sistema'), 'rol', p.role) order by a.created_at desc), '[]'::jsonb)
    from (select * from public.auditoria order by created_at desc limit 300) a left join public.profiles p on p.id = a.quien);
end $$;

create or replace function public.admin_calificaciones() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_gestor() then raise exception 'Solo CodeFix'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'autor', q.autor, 'estrellas', q.estrellas, 'motivo', q.motivo,
      'comentario', q.comentario, 'cliente', q.cliente_nombre, 'barberia', b.nombre, 'created_at', q.created_at) order by q.created_at desc), '[]'::jsonb)
    from (select * from public.calificaciones order by created_at desc limit 300) q join public.barberias b on b.id = q.barberia_id);
end $$;

create or replace function public.admin_borrar_calificacion(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_gestor('eliminar') then raise exception 'Sin permiso'; end if;
  delete from public.calificaciones where id = p_id;
  perform public.auditar('Calificación borrada', p_id::text);
end $$;

-- Métricas por barbería: este mes vs el anterior (para el ranking y las recomendaciones).
create or replace function public.admin_barberias() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m0 timestamptz := date_trunc('month', now() at time zone public.tz()) at time zone public.tz();
        p0 timestamptz := (date_trunc('month', now() at time zone public.tz()) - interval '1 month') at time zone public.tz();
begin
  if not public.es_gestor() then raise exception 'Solo CodeFix'; end if;
  return (select coalesce(jsonb_agg(x order by x.ventas desc), '[]'::jsonb) from (
    select b.id, b.codigo, b.nombre, b.logo, b.whatsapp, b.created_at, o.id as owner_id, o.email, o.nombre as dueno,
      o.suspended, public.is_premium(o.id) as premium, o.premium_until, o.trial_used, b.horario, b.abono,
      (b.link_pago is not null or b.datos_transferencia is not null) as cobra_abono, public.nota_barberia(b.id) as calificacion,
      (select count(*) from public.reservas r where r.barberia_id = b.id and r.created_at >= m0 and r.cliente_id is null and r.creada_por is null) as invitados,
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
      (select count(*) from public.reservas r where r.barberia_id = b.id and r.inicio >= m0
         and extract(isodow from r.inicio at time zone public.tz()) >= 6 and r.estado <> 'anulada') as fin_de_semana,
      (select coalesce(sum(k.monto + k.propina), 0) from public.caja k where k.barberia_id = b.id and k.fecha >= m0) as ventas,
      (select coalesce(sum(k.monto + k.propina), 0) from public.caja k where k.barberia_id = b.id and k.fecha >= p0 and k.fecha < m0) as ventas_ant,
      (select coalesce(sum(r.abono), 0) from public.reservas r where r.barberia_id = b.id and r.inicio >= m0 and r.pagado_con in ('link', 'transferencia')
         and r.estado <> 'anulada') as abonos,
      (select count(*) from public.ofertas f where f.barberia_id = b.id and f.activa) as ofertas,
      b.registro_solo, b.socio_id, (select public.nombre_de(sp) from public.profiles sp where sp.id = b.socio_id) as socio,
      (select rb.nombre from public.barberias rb where rb.id = b.referida_por) as referida
    from public.barberias b join public.profiles o on o.id = b.owner_id) x);
end $$;

create or replace function public.admin_barberia(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m0 timestamptz := date_trunc('month', now() at time zone public.tz()) at time zone public.tz();
begin
  if not public.es_gestor() then raise exception 'Solo CodeFix'; end if;
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
  if not public.es_gestor() then raise exception 'Solo CodeFix'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'email', p.email, 'rol', p.role,
      'barberia', b.nombre, 'barberia_id', b.id, 'premium', public.is_premium(p.id), 'plan', p.plan, 'premium_until', p.premium_until,
      'suspended', p.suspended, 'telefono', p.telefono, 'last_seen', p.last_seen, 'created_at', p.created_at, 'trial_used', p.trial_used)
      order by b.nombre nulls first, public.rango(p.role) desc, p.nombre), '[]'::jsonb)
    from public.profiles p left join public.barberias b on b.id = p.barberia_id
    where p.role not in ('admin', 'socio') and (p_rol is null or p.role = p_rol) and (p_barberia is null or p.barberia_id = p_barberia)
    limit 3000);
end $$;

create or replace function public.admin_keys() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_gestor() then raise exception 'Solo CodeFix'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'key', l.key, 'tipo', l.tipo, 'para', l.para_nombre,
      'meses', l.meses, 'precio', l.precio, 'nota', l.nota, 'origen', l.origen, 'created_at', l.created_at,
      'usada_por', coalesce(p.nombre, p.email), 'barberia', b.nombre, 'redeemed_at', l.redeemed_at,
      'inicio', l.inicio, 'termino', l.termino, 'revoked', l.revoked) order by l.created_at desc), '[]'::jsonb)
    from public.licenses l left join public.profiles p on p.id = l.redeemed_by left join public.barberias b on b.id = p.barberia_id);
end $$;

create or replace function public.admin_solicitudes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_gestor() then raise exception 'Solo CodeFix'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'note', r.note, 'status', r.status,
      'created_at', r.created_at, 'user_id', p.id, 'nombre', p.nombre, 'email', p.email, 'rol', p.role, 'barberia', b.nombre,
      'premium_until', p.premium_until) order by r.status = 'pendiente' desc, r.created_at desc), '[]'::jsonb)
    from (select * from public.requests order by created_at desc limit 200) r
    join public.profiles p on p.id = r.user_id left join public.barberias b on b.id = p.barberia_id);
end $$;

create or replace function public.admin_ingresos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_gestor() then raise exception 'Solo CodeFix'; end if;
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
  if not public.es_gestor('avisos') then raise exception 'Sin permiso'; end if;
  if coalesce(trim(p_titulo), '') = '' then raise exception 'Falta el título'; end if;
  insert into public.avisos (de, para, tipo, titulo, cuerpo, url, difusion)
  select auth.uid(), p.id, 'difusion', left(trim(p_titulo), 90), left(coalesce(p_cuerpo, ''), 300), 'avisos', d
  from public.profiles p
  where not p.suspended and p.role not in ('admin', 'socio')
    and (p_para = 'todos'
         or (p_para = 'barberias' and p.role = 'owner')
         or (p_para = 'equipos' and p.role in ('owner', 'barber'))
         or (p_para = 'clientes' and p.role = 'client')
         or (p_para = 'barberias_free' and p.role = 'owner' and not public.is_premium(p.id))
         or (p_para = 'barberias_premium' and p.role = 'owner' and public.is_premium(p.id))
         or (p_para like 'barberia:%' and p.barberia_id::text = substr(p_para, 10)));
  get diagnostics n = row_count;
  perform public.auditar('Aviso masivo', left(trim(p_titulo), 90) || ' · a ' || n || ' persona(s)');
  return n;
end $$;

create or replace function public.admin_difusiones() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_gestor('avisos') then raise exception 'Sin permiso'; end if;
  return (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select a.difusion as id, min(a.titulo) as titulo, min(a.cuerpo) as cuerpo, min(a.created_at) as created_at, count(*) as total,
      count(*) filter (where a.push = 'enviado' or a.entregado_at is not null) as recibidos, count(a.visto_at) as vistos,
      coalesce(jsonb_agg(jsonb_build_object('nombre', public.nombre_de(p), 'visto_at', a.visto_at) order by a.visto_at nulls last), '[]'::jsonb) as detalle
    from public.avisos a join public.profiles p on p.id = a.para
    where a.de = auth.uid() and a.difusion is not null and a.created_at > now() - interval '7 days'
    group by a.difusion order by min(a.created_at) desc limit 30) x);
end $$;

create or replace function public.admin_reportes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_gestor() then raise exception 'Solo CodeFix'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'excerpt', r.excerpt, 'created_at', r.created_at,
      'de', public.nombre_de(a), 'contra', public.nombre_de(b), 'contra_id', b.id) order by r.created_at desc), '[]'::jsonb)
    from public.reports r join public.profiles a on a.id = r.reporter join public.profiles b on b.id = r.reported where not r.resolved);
end $$;

create or replace function public.admin_resolver_reporte(p_id uuid, p_suspender boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reports;
begin
  if not public.es_gestor('cuentas') then raise exception 'Sin permiso'; end if;
  update public.reports set resolved = true where id = p_id returning * into r;
  if p_suspender then update public.profiles set suspended = true where id = r.reported and role not in ('admin', 'socio'); end if;
  perform public.auditar(case when p_suspender then 'Suspender' else 'Reporte ignorado' end,
    'Reporte contra ' || coalesce((select public.nombre_de(x) from public.profiles x where x.id = r.reported), '?') || ': ' || coalesce(r.reason, ''));
end $$;

-- ---------------------------------------------------------------------
-- v2.1: Resumen del mes, clientes que no vuelven, cumpleaños, referidos y socios
-- ---------------------------------------------------------------------
-- Números de un mes de una barbería (uso interno).
create or replace function public.metricas_mes(p_barberia uuid, p_mes date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  m0 timestamptz := (date_trunc('month', p_mes)::date::timestamp) at time zone public.tz();
  m1 timestamptz := ((date_trunc('month', p_mes) + interval '1 month')::date::timestamp) at time zone public.tz();
  a0 timestamptz := ((date_trunc('month', p_mes) - interval '1 month')::date::timestamp) at time zone public.tz();
  res jsonb;
begin
  select jsonb_build_object(
    'mes', to_char(p_mes, 'YYYY-MM'),
    'ventas', (select coalesce(sum(k.monto + k.propina), 0) from public.caja k where k.barberia_id = p_barberia and k.fecha >= m0 and k.fecha < m1),
    'ventas_ant', (select coalesce(sum(k.monto + k.propina), 0) from public.caja k where k.barberia_id = p_barberia and k.fecha >= a0 and k.fecha < m0),
    'cortes', (select count(*) from public.caja k where k.barberia_id = p_barberia and k.fecha >= m0 and k.fecha < m1),
    'atendidas', (select count(*) from public.reservas r where r.barberia_id = p_barberia and r.inicio >= m0 and r.inicio < m1 and r.estado = 'atendida'),
    'no_vino', (select count(*) from public.reservas r where r.barberia_id = p_barberia and r.inicio >= m0 and r.inicio < m1 and r.estado = 'no_vino'),
    'perdido_no_vino', (select coalesce(sum(r.total - case when r.pagado_con in ('link', 'transferencia', 'saldo') then r.abono else 0 end), 0)
       from public.reservas r where r.barberia_id = p_barberia and r.inicio >= m0 and r.inicio < m1 and r.estado = 'no_vino'),
    'abonos', (select coalesce(sum(r.abono), 0) from public.reservas r where r.barberia_id = p_barberia and r.inicio >= m0 and r.inicio < m1
       and r.pagado_con in ('link', 'transferencia') and r.estado in ('agendada', 'confirmada', 'atendida', 'no_vino')),
    'clientes', (select count(distinct coalesce(r.cliente_id::text, r.cliente_tel)) from public.reservas r
       where r.barberia_id = p_barberia and r.inicio >= m0 and r.inicio < m1 and r.estado = 'atendida'),
    'nuevos', (select count(*) from (select coalesce(r.cliente_id::text, r.cliente_tel) c, min(r.inicio) primera from public.reservas r
       where r.barberia_id = p_barberia and r.estado = 'atendida' and coalesce(r.cliente_id::text, r.cliente_tel) is not null group by 1) x
       where x.primera >= m0 and x.primera < m1),
    'mejor_dia', (select extract(isodow from r.inicio at time zone public.tz())::int from public.reservas r
       where r.barberia_id = p_barberia and r.inicio >= m0 and r.inicio < m1 and r.estado = 'atendida' group by 1 order by count(*) desc limit 1),
    'mejor_barbero', (select public.nombre_de(p) from public.reservas r join public.profiles p on p.id = r.barbero_id
       where r.barberia_id = p_barberia and r.inicio >= m0 and r.inicio < m1 and r.estado = 'atendida' group by p.id order by count(*) desc limit 1),
    'servicio_top', (select s ->> 'nombre' from public.reservas r, jsonb_array_elements(r.servicios) s
       where r.barberia_id = p_barberia and r.inicio >= m0 and r.inicio < m1 and r.estado = 'atendida' group by 1 order by count(*) desc limit 1)) into res;
  return res;
end $$;

-- Resumen del mes para el dueño (Premium: todo; Free: cantidades y la plata bloqueada).
create or replace function public.resumen_mes(p_mes date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles; x jsonb; libre boolean;
begin
  me := public.yo_activo();
  if me.role <> 'owner' then raise exception 'Solo el dueño'; end if;
  x := public.metricas_mes(me.barberia_id, coalesce(p_mes, (now() at time zone public.tz())::date));
  libre := public.tiene('barberia', 'resumen_mes', public.barberia_premium(me.barberia_id));
  if not libre then x := x - 'ventas' - 'ventas_ant' - 'perdido_no_vino' - 'abonos' - 'mejor_barbero' - 'servicio_top'; end if;
  return x || jsonb_build_object('bloqueado', not libre, 'sin_volver', (public.no_vuelven_de(me.barberia_id) ->> 'total')::int);
end $$;

-- Cada mes (día 1, 10:00): el resumen del mes pasado le llega al dueño. Free: el aviso invita a Premium.
create or replace function public.enviar_resumenes() returns int
language plpgsql security definer set search_path = '' as $$
declare b record; x jsonb; m date := ((now() at time zone public.tz())::date - interval '1 month')::date; n int := 0; libre boolean; mes text;
begin
  mes := (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from m)::int];
  for b in select bb.* from public.barberias bb join public.profiles o on o.id = bb.owner_id
           where not o.suspended and coalesce(bb.resumen_enviado, '') <> to_char(m, 'YYYY-MM') and bb.created_at < now() - interval '7 days' loop
    update public.barberias set resumen_enviado = to_char(m, 'YYYY-MM') where id = b.id;
    x := public.metricas_mes(b.id, m);
    if (x ->> 'cortes')::int + (x ->> 'atendidas')::int = 0 then continue; end if;
    libre := public.tiene('barberia', 'resumen_mes', public.barberia_premium(b.id));
    perform public.avisar(null, b.owner_id, 'aviso', '📊 Tu resumen de ' || mes,
      case when libre then 'Ganaste ' || public.pesos((x ->> 'ventas')::int) || ' en ' || (x ->> 'cortes') || ' cortes' ||
        coalesce(' · tu mejor día fue el ' || (array['lunes','martes','miércoles','jueves','viernes','sábado','domingo'])[(x ->> 'mejor_dia')::int], '') ||
        ' · ' || (x ->> 'nuevos') || ' clientes nuevos' ||
        case when (x ->> 'no_vino')::int > 0 then ' · ' || (x ->> 'no_vino') || ' no vinieron (' || public.pesos((x ->> 'perdido_no_vino')::int) || ')' else '' end || '.'
      else 'Atendiste ' || (x ->> 'atendidas') || ' horas y ' || (x ->> 'nuevos') || ' clientes nuevos. 🔒 Mira cuánto ganaste, tu mejor día y lo que perdiste por los que no vinieron con Premium.' end,
      'resumen');
    n := n + 1;
  end loop;
  return n;
end $$;

-- Clientes que no vuelven: su última visita fue hace más de N días (Reglas) y no tienen hora agendada.
create or replace function public.no_vuelven_de(p_barberia uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with v as (
    select coalesce(r.cliente_id::text, 't:' || r.cliente_tel) k, (array_agg(r.cliente_id))[1] cliente_id,
           (array_agg(r.cliente_tel order by r.inicio desc))[1] tel, (array_agg(r.cliente_nombre order by r.inicio desc))[1] nombre_inv,
           max(r.inicio) ultima, count(*) visitas
    from public.reservas r
    where r.barberia_id = p_barberia and r.estado = 'atendida' and (r.cliente_id is not null or coalesce(r.cliente_tel, '') <> '')
    group by 1
  ), l as (
    select v.*, coalesce(c.nombre, v.nombre_inv, 'Cliente') nombre, coalesce(c.telefono, v.tel) telefono
    from v left join public.profiles c on c.id = v.cliente_id
    where v.ultima < now() - make_interval(days => public.regla('dias_sin_volver')) and v.ultima > now() - interval '365 days'
      and not exists (select 1 from public.reservas f where f.barberia_id = p_barberia and f.inicio > now()
        and f.estado in ('esperando_abono', 'en_revision', 'por_aprobar', 'agendada', 'confirmada')
        and ((v.cliente_id is not null and f.cliente_id = v.cliente_id) or (v.cliente_id is null and f.cliente_tel = v.tel)))
  )
  select jsonb_build_object('total', (select count(*) from l), 'dias', public.regla('dias_sin_volver'),
    'lista', (select coalesce(jsonb_agg(jsonb_build_object('cliente_id', cliente_id, 'nombre', nombre, 'telefono', telefono, 'ultima', ultima,
      'visitas', visitas, 'dias', floor(extract(epoch from now() - ultima) / 86400)::int) order by visitas desc, ultima desc), '[]'::jsonb) from (select * from l order by visitas desc limit 200) z))
$$;

create or replace function public.no_vuelven() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles; x jsonb;
begin
  me := public.yo_activo();
  if not public.es_staff(me) then raise exception 'Solo la barbería'; end if;
  x := public.no_vuelven_de(me.barberia_id);
  if not public.tiene('barberia', 'recuperar', public.barberia_premium(me.barberia_id)) then
    return jsonb_build_object('total', x -> 'total', 'dias', x -> 'dias', 'bloqueado', true, 'lista', '[]'::jsonb);
  end if;
  return x || jsonb_build_object('bloqueado', false);
end $$;

-- Cumpleaños (cada día, 10:00): regalo de la barbería al cliente y aviso al dueño.
create or replace function public.cumpleanos() returns int
language plpgsql security definer set search_path = '' as $$
declare c record; n int := 0; hoy date := (now() at time zone public.tz())::date;
begin
  for c in select p.*, b.regalo_cumple, b.nombre as bnombre, b.owner_id from public.profiles p join public.barberias b on b.id = p.barberia_id
           where p.role = 'client' and not p.suspended and p.cumple is not null
             and extract(month from p.cumple) = extract(month from hoy) and extract(day from p.cumple) = extract(day from hoy)
             and p.cumple_avisado is distinct from extract(year from hoy)::int and coalesce(trim(b.regalo_cumple), '') <> '' loop
    if not public.tiene('barberia', 'cumpleanos', public.barberia_premium(c.barberia_id)) then continue; end if;
    update public.profiles set cumple_avisado = extract(year from hoy)::int where id = c.id;
    perform public.avisar(c.owner_id, c.id, 'oferta', '🎂 ¡Feliz cumpleaños, ' || split_part(coalesce(nullif(c.nombre, ''), 'amigo'), ' ', 1) || '!',
      c.bnombre || ' te regala: ' || c.regalo_cumple || '. Válido por 7 días. ¡Agenda tu hora!', 'agendar');
    perform public.avisar(null, c.owner_id, 'aviso', '🎂 Hoy está de cumpleaños ' || coalesce(nullif(c.nombre, ''), 'un cliente'),
      'Le enviamos tu regalo: ' || c.regalo_cumple || '.', 'clientes');
    n := n + 1;
  end loop;
  return n;
end $$;

-- Referidos: barberías que se registraron con mi link.
create or replace function public.mis_referidos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := public.yo_activo();
  if me.role <> 'owner' then raise exception 'Solo el dueño'; end if;
  return jsonb_build_object('dias', public.regla('dias_referido'),
    'lista', (select coalesce(jsonb_agg(jsonb_build_object('nombre', b.nombre, 'created_at', b.created_at, 'pagado', b.referido_pagado) order by b.created_at desc), '[]'::jsonb)
      from public.barberias b where b.referida_por = me.barberia_id));
end $$;

-- Para la página de registro: quién invita (barbería o socio). Sin datos privados.
create or replace function public.ref_publico(p_ref text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('tipo', 'barberia', 'nombre', b.nombre, 'logo', b.logo) from public.barberias b where b.codigo = lower(trim(p_ref))),
    (select jsonb_build_object('tipo', 'socio', 'nombre', coalesce(nullif(p.nombre, ''), 'CodeFix')) from public.profiles p
     where p.ref_codigo = lower(trim(p_ref)) and p.role = 'socio' and not p.suspended))
$$;

-- Socios (solo el admin los ve y cambia sus permisos; se crean con "+ Socio" en el panel).
create or replace function public.admin_socios() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'email', p.email, 'telefono', p.telefono,
      'permisos', coalesce(p.permisos, '{}'::jsonb), 'ref_codigo', p.ref_codigo, 'suspended', p.suspended, 'last_seen', p.last_seen, 'created_at', p.created_at,
      'barberias', (select count(*) from public.barberias b where b.socio_id = p.id),
      'premium', (select count(*) from public.barberias b where b.socio_id = p.id and public.is_premium(b.owner_id))) order by p.nombre), '[]'::jsonb)
    from public.profiles p where p.role = 'socio');
end $$;

create or replace function public.admin_guardar_socio(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare k text; perm jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if not exists (select 1 from public.profiles where id = p_id and role = 'socio') then raise exception 'Socio no encontrado'; end if;
  if jsonb_typeof(p -> 'permisos') = 'object' then
    foreach k in array array['pagos', 'premium', 'cuentas', 'ajustes', 'avisos', 'crear', 'eliminar'] loop
      perm := perm || jsonb_build_object(k, coalesce((p -> 'permisos' ->> k)::boolean, false));
    end loop;
  end if;
  update public.profiles set
    permisos = case when jsonb_typeof(p -> 'permisos') = 'object' then perm else permisos end,
    suspended = case when p ? 'suspended' then coalesce((p ->> 'suspended')::boolean, false) else suspended end
  where id = p_id;
  perform public.auditar('Socio', (select public.nombre_de(x) from public.profiles x where x.id = p_id) || ' · ' || p::text);
end $$;

-- ---------------------------------------------------------------------
-- v2.2: Eliminar cuentas. Admin y socios (permiso "eliminar"): barberos, clientes y barberías completas.
-- El dueño: sus barberos y sus clientes. Todo queda en el registro de cambios.
--   Barbero: no puede tener horas por venir; su historial (horas y caja) pasa al dueño con una nota.
--   Cliente: sus horas por venir se anulan; el historial queda con su nombre, sin cuenta.
--   Barbería (dueño): se borra todo (equipo, clientes, horas, caja). Hay que escribir el nombre de la barbería.
-- ---------------------------------------------------------------------
create or replace function public.eliminar_cuenta(p_user uuid, p_confirmar text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; t public.profiles; b public.barberias; n int; nom text;
begin
  me := public.yo_activo();
  select * into t from public.profiles where id = p_user;
  if t.id is null then raise exception 'Cuenta no encontrada'; end if;
  if t.id = me.id then raise exception 'No puedes eliminar tu propia cuenta desde aquí'; end if;
  if t.role = 'admin' then raise exception 'La cuenta del administrador no se elimina'; end if;
  if t.role = 'socio' and not public.is_admin() then raise exception 'Solo el administrador elimina socios'; end if;
  if not (public.es_gestor('eliminar') or (me.role = 'owner' and t.barberia_id = me.barberia_id and t.role in ('barber', 'client'))) then
    raise exception 'Sin permiso para eliminar esta cuenta';
  end if;
  nom := public.nombre_de(t);
  select * into b from public.barberias where id = t.barberia_id;
  if t.role = 'barber' then
    if exists (select 1 from public.reservas where barbero_id = t.id and inicio > now()
               and estado in ('esperando_abono', 'en_revision', 'por_aprobar', 'agendada', 'confirmada')) then
      raise exception '% tiene horas por venir. Muévelas a otro barbero o anúlalas antes de eliminarlo.', nom;
    end if;
    update public.reservas set barbero_id = b.owner_id, nota = left('Era de ' || nom || ' (eliminado)' || coalesce(' · ' || nota, ''), 200)
    where barbero_id = t.id;
    update public.caja set barbero_id = b.owner_id, nota = left('Era de ' || nom || ' (eliminado)' || coalesce(' · ' || nota, ''), 200)
    where barbero_id = t.id;
    update public.servicios set barberos = nullif(array_remove(barberos, t.id), '{}') where barberia_id = b.id and t.id = any(barberos);
  elsif t.role = 'client' then
    update public.reservas set cliente_nombre = coalesce(cliente_nombre, t.nombre) where cliente_id = t.id;
    update public.caja set cliente_nombre = coalesce(cliente_nombre, t.nombre) where cliente_id = t.id;
    update public.reservas set estado = 'anulada', motivo = 'Cuenta eliminada', anulada_at = now(), anulada_por = me.id, expira_at = null
    where cliente_id = t.id and estado in ('esperando_abono', 'en_revision', 'por_aprobar', 'agendada', 'confirmada') and inicio > now();
  elsif t.role = 'owner' then
    if lower(trim(coalesce(p_confirmar, ''))) <> lower(trim(b.nombre)) then
      raise exception 'Para eliminar la barbería escribe su nombre exacto: %', b.nombre;
    end if;
    select count(*) into n from public.profiles where barberia_id = b.id and role <> 'owner';
    perform public.auditar('Eliminar barbería', b.nombre || ' (' || b.codigo || ') · dueño ' || nom || ' · ' || t.email || ' · ' || n || ' cuenta(s) de equipo y clientes');
    delete from auth.users where id in (select id from public.profiles where barberia_id = b.id and role <> 'owner');
    delete from auth.users where id = t.id;
    return jsonb_build_object('ok', true, 'eliminada', b.nombre);
  end if;
  perform public.auditar('Eliminar cuenta', case t.role when 'barber' then 'Barbero ' when 'client' then 'Cliente ' when 'socio' then 'Socio ' else '' end ||
    nom || ' · ' || t.email || coalesce(' · ' || b.nombre, ''));
  delete from auth.users where id = t.id;
  return jsonb_build_object('ok', true, 'eliminada', nom);
end $$;

-- Premium que vence este mes (barberías y clientes), para cobrar por WhatsApp.
create or replace function public.admin_por_vencer() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare fin timestamptz := greatest(((date_trunc('month', now() at time zone public.tz()) + interval '1 month')::date::timestamp) at time zone public.tz(), now() + interval '7 days');
begin
  if not public.es_gestor() then raise exception 'Solo CodeFix'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rol', p.role, 'barberia', b.nombre,
      'telefono', coalesce(case when p.role = 'owner' then b.whatsapp end, p.telefono), 'premium_until', p.premium_until,
      'monto', public.plan_valor(case when p.role = 'owner' then 'barberia' else 'cliente' end, 'precio', true),
      'pago_en_revision', exists (select 1 from public.pagos g where g.user_id = p.id and g.estado = 'en_revision')) order by p.premium_until), '[]'::jsonb)
    from public.profiles p left join public.barberias b on b.id = p.barberia_id
    where p.role in ('owner', 'client') and p.plan = 'premium' and not p.suspended and p.premium_until between now() and fin);
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
             and (public.tiene('barberia', 'recordatorios', public.barberia_premium(x.barberia_id))
                  or public.tiene('cliente', 'recordatorios', public.is_premium(x.cliente_id)))
           returning x.* loop
    perform public.avisar(null, r.cliente_id, 'reserva', '⏰ Mañana tienes hora',
      public.fecha_txt(r.inicio) || '. Si no puedes ir, anula con tiempo para no perder tu abono.', 'horas', r.id);
    n := n + 1;
  end loop;
  for r in update public.reservas x set recordado2 = true, recordado24 = true
           where x.estado in ('agendada', 'confirmada') and not x.recordado2 and x.cliente_id is not null
             and x.inicio between now() and now() + interval '2 hours'
             and x.created_at < x.inicio - interval '2 hours'
             and (public.tiene('barberia', 'recordatorios', public.barberia_premium(x.barberia_id))
                  or public.tiene('cliente', 'recordatorios', public.is_premium(x.cliente_id)))
           returning x.* loop
    perform public.avisar(null, r.cliente_id, 'reserva', '💈 Tu hora es en 2 horas', public.fecha_txt(r.inicio) || '. ¡Te esperamos!', 'horas', r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

drop function if exists public.limpiar();
-- Limpieza diaria (días en Reglas). Las horas atendidas se guardan (sellos, estadísticas e historial).
-- Ojo: todo DELETE lleva WHERE. Un comprobante "en revisión" nunca se borra.
create or replace function public.limpiar() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a int; b int; c int; d int; e int;
begin
  update public.reservas set comprobante = null
  where comprobante is not null and estado <> 'en_revision' and comprobante_at < now() - make_interval(days => public.regla('dias_comprobantes'));
  get diagnostics a = row_count;
  update public.messages set imagen = null where imagen is not null and created_at < now() - make_interval(days => public.regla('dias_comprobantes'));
  update public.pagos set comprobante = null
  where comprobante is not null and estado <> 'en_revision' and created_at < now() - make_interval(days => public.regla('dias_comprobantes'));
  delete from public.avisos where created_at < now() - interval '7 days';
  get diagnostics b = row_count;
  delete from public.lista_espera where fecha < current_date - 1;
  delete from public.reservas where estado = 'anulada' and coalesce(anulada_at, created_at) < now() - make_interval(days => public.regla('dias_anuladas'))
    and coalesce(devolucion, '') <> 'pendiente' and not (abono_destino = 'saldo' and saldo_hasta > now());
  get diagnostics c = row_count;
  delete from public.user_invites where created_at < now() - interval '2 days';
  delete from public.auditoria where created_at < now() - interval '365 days';
  get diagnostics d = row_count;
  delete from public.actualizaciones where created_at < now() - interval '2 years';
  get diagnostics e = row_count;
  return jsonb_build_object('comprobantes', a, 'avisos', b, 'horas_anuladas', c, 'registro', d + e);
end $$;

-- Una sola tarea por minuto que hace todo lo programado.
create or replace function public.tick() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.liberar_vencidas();
  perform public.recordatorios();
  perform public.recordar_revisiones();
  if extract(minute from now())::int = 0 and extract(hour from now() at time zone public.tz())::int = 10 then
    perform public.avisar_vencimientos();
    perform public.limpiar();
    perform public.cumpleanos();
    -- v2.1: resumen del mes pasado (los primeros días del mes, una vez por barbería).
    if extract(day from now() at time zone public.tz())::int <= 3 then perform public.enviar_resumenes(); end if;
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
    where cliente_id = me.id and estado in ('esperando_abono', 'en_revision', 'por_aprobar', 'agendada', 'confirmada') and inicio > now();
  delete from auth.users where id = me.id;
end $$;

-- ---------------------------------------------------------------------
-- Permisos: nadie sin sesión ejecuta nada (salvo 3 funciones públicas);
-- con sesión, cada función revisa quién llama; las internas, solo el servidor.
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.barberia_publica(text), public.ajustes_publicos(), public.config_publica() to anon;
-- v2.0: vista libre y link personal de la reserva (sin cuenta).
grant execute on function public.vista_publica(text), public.ocupacion_publica(text, date, date, text),
  public.reservar_invitado(text, uuid, timestamptz, uuid[], text, text), public.reserva_ver(text),
  public.reserva_comprobante(text, text, text), public.reserva_cancelar(text), public.reserva_reagendar(text, timestamptz),
  public.reserva_calificar(text, int, text) to anon;
-- v2.1: página de registro de barberías (quién invita).
grant execute on function public.ref_publico(text) to anon;

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
    'public.reserva_staff(uuid)', 'public.nuevo_codigo()', 'public.nueva_key()',
    'public.auditar(text, text)', 'public.dar_premium(uuid, int, int, text, text)', 'public.cancelar_reserva(public.reservas, uuid)',
    'public.reagendar_reserva(public.reservas, timestamptz)', 'public.subir_comprobante(uuid, text, text)', 'public.reserva_por_token(text)',
    'public.calificar_visita(public.reservas, int, text)', 'public.recordar_revisiones()', 'public.armar_reserva(uuid, uuid, timestamptz, uuid[], boolean)',
    'public.nota_cliente(uuid, uuid, text)', 'public.en_lista_negra(uuid, uuid, text)', 'public.handle_new_user()',
    'public.avisar_gestores(uuid, text, text, text, text)', 'public.metricas_mes(uuid, date)', 'public.no_vuelven_de(uuid)',
    'public.enviar_resumenes()', 'public.cumpleanos()', 'public.nuevo_ref()']
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
  if not public.es_gestor() then raise exception 'Solo CodeFix'; end if;
  return jsonb_build_object(
    'db_version', public.db_version(),
    'liberada', (select value from public.app_settings where key = 'version_liberada'),
    'historial', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
      select version, notas, avisados, created_at from public.actualizaciones order by created_at desc limit 10) x));
end $$;
grant execute on function public.admin_actualizacion_estado() to authenticated;
revoke execute on function public.admin_actualizacion_estado() from public, anon;

-- Liberar una versión (botón del admin o del Centro de Mando): queda para todos y les llega el aviso por push.
-- Ya no se libera sola al correr este archivo: la base se actualiza sola y tú liberas cuando la pruebes.
create or replace function public.admin_liberar(p_version text default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  lib text := (select value from public.app_settings where key = 'version_liberada');
  v text := coalesce(nullif(trim(p_version), ''), public.db_version());
  n int := 0;
begin
  if not public.is_admin() then raise exception 'Solo el administrador libera versiones'; end if;
  if v !~ '^[0-9]+(\.[0-9]+){0,2}$' then raise exception 'Versión no válida'; end if;
  if lib is distinct from v then
    insert into public.app_settings (key, value) values ('version_liberada', v)
    on conflict (key) do update set value = excluded.value;
    -- Si ya hay gente usando la app, se les avisa por push (en una instalación nueva, no).
    if lib is not null or exists (select 1 from public.profiles where role <> 'admin') then
      insert into public.avisos (de, para, tipo, titulo, cuerpo, url)
      select null, p.id, 'aviso', '💈 Nueva versión ' || v || ' de la app', public.notas_version() || ' Se actualiza sola.', 'actualizar'
      from public.profiles p where not p.suspended;
      get diagnostics n = row_count;
    end if;
    insert into public.actualizaciones (version, notas, avisados) values (v, public.notas_version(), n);
  end if;
  return n;
end $$;
revoke execute on function public.admin_liberar(text) from public, anon;
grant execute on function public.admin_liberar(text) to authenticated;
-- =====================================================================
-- v2.9 · Limpieza y respaldo
--   · Avisos y mensajes se guardan 30 días (antes se avisa). Cada persona borra un aviso (✕) o un chat completo.
--   · Cada lunes: servicios ocultos y ofertas vencidas, para borrarlos si ya no se ofrecen.
--   · El dueño descarga el respaldo de su barbería en Excel. Funciones cfx_* para el Centro de Mando.
-- =====================================================================
alter table public.profiles add column if not exists aviso_limpieza_at timestamptz;

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
    where a.para = auth.uid() and a.tipo <> 'chat' and not a.oculto and a.created_at > now() - interval '30 days'
    order by a.created_at desc limit 80) x;
  return r;
end $$;

create or replace function public.ocultar_aviso(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.avisos set oculto = true, visto_at = coalesce(visto_at, now()), entregado_at = coalesce(entregado_at, now())
  where id = p_id and para = auth.uid()
$$;

-- Borrar un chat completo (para ambos).
create or replace function public.chat_borrar(p_other uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare n int; me public.profiles := public.yo_activo();
begin
  delete from public.messages where (sender = me.id and recipient = p_other) or (sender = p_other and recipient = me.id);
  get diagnostics n = row_count;
  return n;
end $$;

-- Cada lunes: al dueño, sus servicios ocultos y ofertas vencidas o apagadas.
create or replace function public.recordar_catalogo() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; k int := 0;
begin
  for r in select b.owner_id,
             (select count(*) from public.servicios s where s.barberia_id = b.id and not s.visible and s.created_at < now() - interval '30 days') as sv,
             (select count(*) from public.ofertas o where o.barberia_id = b.id and (not o.activa or o.hasta < (now() at time zone public.tz())::date - 7)) as ofe
           from public.barberias b where b.owner_id is not null
  loop
    continue when r.sv + r.ofe = 0;
    perform public.avisar(null, r.owner_id, 'aviso', '🧹 Ordena tu catálogo',
      concat_ws(' y ', case when r.sv = 1 then '1 servicio oculto' when r.sv > 1 then r.sv || ' servicios ocultos' end,
                       case when r.ofe = 1 then '1 oferta vencida' when r.ofe > 1 then r.ofe || ' ofertas vencidas' end)
        || '. Si ya no los ofreces, bórralos en Más → Servicios y Ofertas.', 'mas');
    k := k + 1;
  end loop;
  return k;
end $$;

create or replace function public.limpiar() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a int; b int; c int; d int; e int; r record;
begin
  update public.reservas set comprobante = null
  where comprobante is not null and estado <> 'en_revision' and comprobante_at < now() - make_interval(days => public.regla('dias_comprobantes'));
  get diagnostics a = row_count;
  update public.messages set imagen = null where imagen is not null and created_at < now() - make_interval(days => public.regla('dias_comprobantes'));
  update public.pagos set comprobante = null
  where comprobante is not null and estado <> 'en_revision' and created_at < now() - make_interval(days => public.regla('dias_comprobantes'));
  -- v2.9: avisos y mensajes se guardan 30 días; antes se avisa (máx. 1 vez por semana, al menos 2 días antes).
  for r in select p.id,
             (select count(*) from public.messages x where (x.sender = p.id or x.recipient = p.id) and x.created_at < now() - interval '21 days') as ms,
             (select count(*) from public.avisos x where x.para = p.id and x.tipo <> 'chat' and not x.oculto and x.created_at < now() - interval '21 days') as av
           from public.profiles p
           where not p.suspended and (p.aviso_limpieza_at is null or p.aviso_limpieza_at < now() - interval '7 days')
             and (exists (select 1 from public.messages x where (x.sender = p.id or x.recipient = p.id) and x.created_at < now() - interval '28 days')
               or exists (select 1 from public.avisos x where x.para = p.id and x.tipo <> 'chat' and not x.oculto and x.created_at < now() - interval '28 days'))
  loop
    perform public.avisar(null, r.id, 'aviso', '🧹 Limpieza automática',
      concat_ws(' y ', case when r.ms = 1 then '1 mensaje' when r.ms > 1 then r.ms || ' mensajes' end, case when r.av = 1 then '1 aviso' when r.av > 1 then r.av || ' avisos' end)
        || ' con más de 30 días se borran solos en los próximos días. Tus horas, clientes y caja no se tocan.', null);
    update public.profiles set aviso_limpieza_at = now() where id = r.id;
  end loop;
  delete from public.avisos where created_at < now() - interval '30 days';
  get diagnostics b = row_count;
  delete from public.messages where created_at < now() - interval '30 days';
  if extract(isodow from now() at time zone public.tz()) = 1 then perform public.recordar_catalogo(); end if;
  delete from public.lista_espera where fecha < current_date - 1;
  delete from public.reservas where estado = 'anulada' and coalesce(anulada_at, created_at) < now() - make_interval(days => public.regla('dias_anuladas'))
    and coalesce(devolucion, '') <> 'pendiente' and not (abono_destino = 'saldo' and saldo_hasta > now());
  get diagnostics c = row_count;
  delete from public.user_invites where created_at < now() - interval '2 days';
  delete from public.auditoria where created_at < now() - interval '365 days';
  get diagnostics d = row_count;
  delete from public.actualizaciones where created_at < now() - interval '2 years';
  get diagnostics e = row_count;
  return jsonb_build_object('comprobantes', a, 'avisos', b, 'horas_anuladas', c, 'registro', d + e);
end $$;

-- Respaldo de la barbería (Excel): clientes, horas, servicios, caja, ofertas y calificaciones. Solo el dueño.
create or replace function public.mi_respaldo() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles := public.yo_activo(); b uuid;
begin
  if me.role <> 'owner' then raise exception 'Solo el dueño de la barbería'; end if;
  b := me.barberia_id;
  return jsonb_build_object(
    'Clientes', (select coalesce(jsonb_agg(x order by x.nombre), '[]') from (select public.nombre_de(p) as nombre, p.email as correo, p.telefono,
        public.is_premium(p.id) as premium, p.created_at as creado from public.profiles p where p.barberia_id = b and p.role = 'client') x),
    'Horas', (select coalesce(jsonb_agg(x order by x.inicio), '[]') from (select r.inicio, public.nombre_de(br) as barbero, coalesce(public.nombre_de(c), r.cliente_nombre) as cliente,
        (select string_agg(coalesce(e ->> 'nombre', '?'), ', ') from jsonb_array_elements(r.servicios) e) as servicios, r.total, r.abono, r.estado, r.nota
        from public.reservas r left join public.profiles br on br.id = r.barbero_id left join public.profiles c on c.id = r.cliente_id where r.barberia_id = b) x),
    'Servicios', (select coalesce(jsonb_agg(x order by x.orden), '[]') from (select nombre, precio, duracion, categoria, descripcion, visible, orden from public.servicios where barberia_id = b) x),
    'Caja', (select coalesce(jsonb_agg(x order by x.fecha), '[]') from (select k.fecha, public.nombre_de(br) as barbero, k.servicio, k.monto, k.abono, k.propina, k.medio,
        coalesce(public.nombre_de(c), k.cliente_nombre) as cliente, k.nota from public.caja k left join public.profiles br on br.id = k.barbero_id
        left join public.profiles c on c.id = k.cliente_id where k.barberia_id = b) x),
    'Ofertas', (select coalesce(jsonb_agg(x order by x.creada), '[]') from (select titulo, detalle, precio, vip, activa, hasta, created_at as creada from public.ofertas where barberia_id = b) x),
    'Calificaciones', (select coalesce(jsonb_agg(x order by x.fecha), '[]') from (select created_at as fecha, autor, cliente_nombre as cliente, estrellas, motivo, comentario
        from public.calificaciones where barberia_id = b) x));
end $$;

-- ---------- Centro de Mando: respaldo y limpieza (común a las 6 apps) ----------
create or replace function public.cfx_es_admin() returns void language plpgsql stable security definer set search_path = '' as $$
begin if not public.is_admin() then raise exception 'Solo el administrador'; end if; end $$;

create or replace function public.cfx_respaldo() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return jsonb_build_object(
    'Barberías', (select coalesce(jsonb_agg(x order by x.creada), '[]') from (select b.nombre, b.codigo, o.email as dueno, b.whatsapp, b.direccion,
        public.is_premium(o.id) as premium, (select count(*) from public.profiles p where p.barberia_id = b.id and p.role = 'client') as clientes,
        (select count(*) from public.profiles p where p.barberia_id = b.id and p.role in ('owner', 'barber')) as barberos, b.created_at as creada
      from public.barberias b left join public.profiles o on o.id = b.owner_id) x),
    'Cuentas', (select coalesce(jsonb_agg(x order by x.creada), '[]') from (select p.email as correo, public.nombre_de(p) as nombre, p.role as rol, b.nombre as barberia,
        p.suspended as suspendida, p.created_at as creada from public.profiles p left join public.barberias b on b.id = p.barberia_id) x),
    'Pagos', (select coalesce(jsonb_agg(to_jsonb(g) - 'comprobante' order by g.created_at), '[]') from public.pagos g),
    'Keys', (select coalesce(jsonb_agg(to_jsonb(l) - 'key' - 'code' order by l.created_at), '[]') from public.licenses l),
    'Ajustes', (select coalesce(jsonb_agg(jsonb_build_object('clave', key, 'valor', value) order by key), '[]') from public.app_settings),
    'Registro', (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at), '[]') from public.auditoria a));
end $$;

create or replace function public.cfx_limpieza() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return jsonb_build_array(
    jsonb_build_object('clave', 'comprobantes', 'titulo', 'Comprobantes revisados', 'detalle', 'Fotos de abonos y pagos ya revisados (más de 7 días).',
      'filas', (select count(*) from public.reservas where comprobante is not null and estado <> 'en_revision' and comprobante_at < now() - interval '7 days')
             + (select count(*) from public.pagos where comprobante is not null and estado <> 'en_revision')),
    jsonb_build_object('clave', 'fotos_chat', 'titulo', 'Fotos del chat', 'detalle', 'Más de 7 días.', 'filas', (select count(*) from public.messages where imagen is not null and created_at < now() - interval '7 days')),
    jsonb_build_object('clave', 'avisos', 'titulo', 'Avisos', 'detalle', 'Más de 2 días (se borran solos a los 30).', 'filas', (select count(*) from public.avisos where created_at < now() - interval '2 days')),
    jsonb_build_object('clave', 'anuladas', 'titulo', 'Horas anuladas', 'detalle', 'Más de 7 días, sin devolución pendiente ni saldo vigente.',
      'filas', (select count(*) from public.reservas where estado = 'anulada' and coalesce(anulada_at, created_at) < now() - interval '7 days'
        and coalesce(devolucion, '') <> 'pendiente' and not (abono_destino = 'saldo' and saldo_hasta > now()))));
end $$;

create or replace function public.cfx_limpiar(p_clave text) returns int
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return coalesce((public.admin_limpiar(p_clave) ->> 'borrados')::int, 0);
end $$;

revoke all on function public.recordar_catalogo() from public, anon, authenticated;
revoke all on function public.ocultar_aviso(uuid), public.chat_borrar(uuid), public.mi_respaldo(), public.cfx_es_admin(), public.cfx_respaldo(), public.cfx_limpieza(), public.cfx_limpiar(text) from public, anon;
grant execute on function public.ocultar_aviso(uuid), public.chat_borrar(uuid), public.mi_respaldo(), public.cfx_respaldo(), public.cfx_limpieza(), public.cfx_limpiar(text) to authenticated;



-- ---------- Ganchos para el núcleo (pagos): dueño = negocio (su Premium es el de la barbería), cliente = cliente ----------
create or replace function public.cfx_yo() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'email', p.email, 'nombre', public.nombre_de(p), 'premium_hasta', p.premium_until, 'creado', p.created_at,
    'rol', case p.role when 'owner' then 'negocio' when 'client' then 'cliente' when 'barber' then 'otro' else 'admin' end)
  from public.profiles p where p.id = auth.uid()
$$;
create or replace function public.cfx_dar_premium(p_cuenta uuid, p_rol text, p_dias int) returns timestamptz
language sql security definer set search_path = '' as $$
  update public.profiles set plan = 'premium', premium_until = greatest(coalesce(case when plan = 'premium' then premium_until end, now()), now()) + make_interval(days => p_dias)
  where id = p_cuenta returning premium_until
$$;
create or replace function public.cfx_avisar(p_cuenta uuid, p_titulo text, p_cuerpo text) returns void
language sql security definer set search_path = '' as $$ select public.avisar(null, p_cuenta, 'plan', p_titulo, p_cuerpo, 'plan') $$;
create or replace function public.cfx_avisar_admin(p_titulo text, p_cuerpo text) returns void
language sql security definer set search_path = '' as $$ select public.avisar_gestores(null, null, p_titulo, p_cuerpo, 'pagos') $$;

-- Ganchos de administración para el núcleo (planes, textos, a quién avisar y verificación).
create or replace function public.cfx_planes_app() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('grupo', case when grupo = 'barberia' then 'negocio' else 'cliente' end, 'clave', clave, 'free', free, 'premium', premium) order by grupo, clave), '[]')
  from public.planes where clave not in ('precio')
$$;
create or replace function public.cfx_plan_guardar_app(p_grupo text, p_clave text, p_free jsonb, p_premium jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare f int := case jsonb_typeof(p_free) when 'boolean' then (p_free::text = 'true')::int else (p_free #>> '{}')::numeric::int end;
        p int := case jsonb_typeof(p_premium) when 'boolean' then (p_premium::text = 'true')::int else (p_premium #>> '{}')::numeric::int end;
begin
  update public.planes set free = f, premium = p where grupo = case when p_grupo = 'negocio' then 'barberia' else 'cliente' end and clave = p_clave;
  if not found then raise exception 'Plan no válido'; end if;
end $$;
create or replace function public.cfx_textos_app() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('clave', clave, 'valor', valor) order by clave), '[]') from public.textos
$$;
create or replace function public.cfx_texto_guardar_app(p_clave text, p_valor text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.textos set valor = p_valor where clave = p_clave;
  if not found then raise exception 'Texto no encontrado'; end if;
end $$;
create or replace function public.cfx_destinatarios(p_destino text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.profiles where not suspended and role in ('owner', 'barber', 'client')
    and (p_destino = 'todos' or (p_destino = 'negocios' and role = 'owner') or (p_destino = 'clientes' and role = 'client')
      or (p_destino = 'premium' and public.is_premium(id)) or (p_destino = 'gratis' and not public.is_premium(id)))
$$;
create or replace function public.cfx_marcar_verificado(p_cuenta uuid, p_si boolean) returns void
language sql security definer set search_path = '' as $$ select null::void $$;

-- Guía para partir (núcleo · ayuda): lo que le falta configurar a la barbería. Se marca solo cuando lo hace.
create or replace function public.cfx_guia_app() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_array(
    jsonb_build_object('k', 'perfil', 't', 'Nombre, logo y dirección', 'd', 'Así te reconocen tus clientes al reservar.', 'ir', 'equipo/#negocio',
      'ok', b.nombre <> 'Mi barbería' and b.logo is not null and coalesce(b.direccion, '') <> ''),
    jsonb_build_object('k', 'whatsapp', 't', 'Tu WhatsApp', 'd', 'Para que tus clientes te escriban.', 'ir', 'equipo/#negocio', 'ok', coalesce(b.whatsapp, '') <> ''),
    jsonb_build_object('k', 'servicios', 't', 'Servicios y precios', 'd', 'Corte, barba, perfilado… con su precio y duración.', 'ir', 'equipo/#servicios',
      'ok', exists (select 1 from public.servicios s where s.barberia_id = b.id)),
    jsonb_build_object('k', 'abono', 't', 'Cómo te pagan el abono', 'd', 'Agrega tu link de pago o tus datos de transferencia. Sin esto no puedes cobrar el abono previo.', 'ir', 'equipo/#links',
      'ok', b.abono = 0 or coalesce(b.link_pago, '') <> '' or coalesce(b.pago1_link, '') <> '' or coalesce(b.pago2_link, '') <> '' or coalesce(b.datos_transferencia, '') <> ''))
  from public.barberias b where b.owner_id = auth.uid()), '[]'::jsonb)
$$;

-- >>> CFX núcleo (no editar aquí: se copia de saas/nucleo/sql con sincronizar.py)
-- ---------------------------------------------------------------------
-- CodeFix · Pagos (igual en las 6 apps; lo reparte nucleo/sincronizar.py). Se administra desde el Centro de Mando → Pagos.
--   Precios iguales en las 6: negocio (inicio, mensual, anual) y cliente (mensual, anual). Link de pago SIN monto (la persona
--   escribe el monto; se le suma el cargo por pago online, visible como una línea aparte), tarjeta (otro link, con su propio cargo)
--   o transferencia (precio exacto, sin cargo), y foto del comprobante. Tú apruebas y se activa el Premium por días enteros.
--   Liberar: por N días nadie queda bloqueado y las cuentas creadas en ese tiempo no pagan el primer pago (quedan en gratis).
--   El comprobante se borra al aprobar o rechazar (ya no sirve). Negocios nuevos: bloqueados hasta su primer pago (si está activado).
--   Cada app define antes: cfx_yo(), cfx_dar_premium(uuid, text, int), cfx_avisar(uuid, text, text) y cfx_avisar_admin(text, text).
-- ---------------------------------------------------------------------
create table if not exists public.cfx_config (clave text primary key, valor jsonb not null);
alter table public.cfx_config enable row level security;
insert into public.cfx_config (clave, valor) values ('pagos', jsonb_build_object(
  'negocio', jsonb_build_object('inicio', 4900, 'inicio_dias', 30, 'mensual', 4900, 'anual', 49900, 'exigir_inicio', true),
  'cliente', jsonb_build_object('mensual', 3000, 'anual', 29900),
  'link', '', 'comision_pct', 0, 'whatsapp', '', 'tarjeta', jsonb_build_object('link', '', 'comision_pct', 0),
  'transferencia', jsonb_build_object('banco', '', 'tipo', '', 'numero', '', 'rut', '', 'titular', '', 'correo', ''),
  'inicio_desde', now()))
on conflict (clave) do nothing;

create table if not exists public.cfx_pagos (
  id          uuid primary key default gen_random_uuid(),
  cuenta      uuid not null,
  email       text not null default '',
  nombre      text not null default '',
  rol         text not null check (rol in ('negocio', 'cliente', 'otro')),
  periodo     text not null check (periodo in ('inicio', 'mensual', 'anual', 'otro')),
  monto       int not null check (monto between 1 and 100000000),
  medio       text not null check (medio in ('link', 'transferencia')),
  nota        text not null default '' check (length(nota) <= 300),
  comprobante text check (comprobante is null or (comprobante ~ '^data:image/(jpeg|png|webp);base64,' and length(comprobante) <= 400000)),
  estado      text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  dias        int,
  motivo      text not null default '',
  creado      timestamptz not null default now(),
  resuelto    timestamptz
);
alter table public.cfx_pagos add column if not exists cupon text;
alter table public.cfx_pagos add column if not exists meses int check (meses is null or meses between 1 and 24);
alter table public.cfx_pagos drop constraint if exists cfx_pagos_medio_check;
alter table public.cfx_pagos add constraint cfx_pagos_medio_check check (medio in ('link', 'transferencia', 'tarjeta'));
alter table public.cfx_pagos drop constraint if exists cfx_pagos_periodo_check;
alter table public.cfx_pagos add constraint cfx_pagos_periodo_check check (periodo in ('inicio', 'mensual', 'meses', 'anual', 'otro'));
create index if not exists cfx_pagos_cuenta_idx on public.cfx_pagos (cuenta, creado desc);
create index if not exists cfx_pagos_estado_idx on public.cfx_pagos (estado, creado);
alter table public.cfx_pagos enable row level security;
create table if not exists public.cfx_exentos (cuenta uuid primary key, nota text not null default '', creado timestamptz not null default now());
alter table public.cfx_exentos enable row level security;
revoke all on public.cfx_config, public.cfx_pagos, public.cfx_exentos from anon, authenticated;

-- ¿Cómo estoy? Precios, mi rol, si debo el primer pago y mi último pago.
create or replace function public.cfx_pago_estado() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c jsonb := (select valor from public.cfx_config where clave = 'pagos'); y jsonb := public.cfx_yo(); pagado boolean; debe boolean; bloq boolean;
        lib jsonb := (select valor from public.cfx_config where clave = 'liberar'); ld timestamptz := (lib ->> 'desde')::timestamptz; lh timestamptz := (lib ->> 'hasta')::timestamptz;
begin
  if y is null or (y ->> 'id') is null then raise exception 'Inicia sesión'; end if;
  pagado := exists (select 1 from public.cfx_pagos where cuenta = (y ->> 'id')::uuid and estado = 'aprobado')
    or exists (select 1 from public.cfx_exentos where cuenta = (y ->> 'id')::uuid);
  -- debe_inicio: cuenta nueva (desde que activaste la regla) sin primer pago. bloqueado: además es un negocio.
  -- Solo si ya hay una forma de pago configurada (si no, nadie podría pagar).
  debe := coalesce((c #>> '{negocio,exigir_inicio}')::boolean, false) and not pagado
     and (coalesce(c ->> 'link', '') <> '' or coalesce(c #>> '{transferencia,numero}', '') <> '' or coalesce(c #>> '{tarjeta,link}', '') <> '')
     and (y ->> 'creado')::timestamptz > coalesce((c ->> 'inicio_desde')::timestamptz, now())
     -- Liberado: mientras dure nadie queda bloqueado; las cuentas creadas en ese tiempo quedan en gratis sin primer pago.
     and not (lh is not null and (now() < lh or (y ->> 'creado')::timestamptz between coalesce(ld, '-infinity') and lh));
  bloq := debe and y ->> 'rol' = 'negocio';
  return jsonb_build_object('config', c - 'inicio_desde', 'yo', y, 'pagado', pagado, 'bloqueado', bloq, 'debe_inicio', debe,
    'liberado_hasta', case when lh > now() then lh end,
    'ultimo', (select to_jsonb(x) from (select id, periodo, monto, medio, estado, dias, motivo, creado, resuelto from public.cfx_pagos
               where cuenta = (y ->> 'id')::uuid order by creado desc limit 1) x));
end $$;

drop function if exists public.cfx_pago_pedir(text, int, text, text, text);
drop function if exists public.cfx_pago_pedir(text, int, text, text, text, text);
create or replace function public.cfx_pago_pedir(p_periodo text, p_monto int, p_medio text, p_comprobante text, p_nota text default '', p_cupon text default null, p_meses int default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare y jsonb := public.cfx_yo(); i uuid; cup text := nullif(upper(trim(coalesce(p_cupon, ''))), '');
begin
  if y is null or (y ->> 'id') is null then raise exception 'Inicia sesión'; end if;
  if y ->> 'rol' not in ('negocio', 'cliente') and p_periodo <> 'otro' then raise exception 'Pide al dueño de la cuenta que haga el pago'; end if;
  if p_periodo not in ('inicio', 'mensual', 'meses', 'anual', 'otro') or p_medio not in ('link', 'transferencia', 'tarjeta') then raise exception 'Datos no válidos'; end if;
  if p_periodo = 'meses' and coalesce(p_meses, 0) not between 2 and 11 then raise exception 'Elige de 2 a 11 meses'; end if;
  if coalesce(p_monto, 0) < 1 then raise exception 'Escribe el monto que pagaste'; end if;
  if coalesce(length(p_comprobante), 0) < 200 then raise exception 'Sube la foto del comprobante'; end if;
  if cup is not null then perform public.cfx_cupon_ver(cup); end if;
  if exists (select 1 from public.cfx_pagos where cuenta = (y ->> 'id')::uuid and estado = 'pendiente') then raise exception 'Ya tienes un pago en revisión. Te avisamos apenas se apruebe.'; end if;
  if (select count(*) from public.cfx_pagos where cuenta = (y ->> 'id')::uuid and creado > now() - interval '1 day') >= 5 then raise exception 'Demasiados intentos hoy. Escribe a soporte.'; end if;
  insert into public.cfx_pagos (cuenta, email, nombre, rol, periodo, monto, medio, nota, comprobante, cupon, meses)
  values ((y ->> 'id')::uuid, coalesce(y ->> 'email', ''), left(coalesce(y ->> 'nombre', ''), 80), case when y ->> 'rol' in ('negocio', 'cliente') then y ->> 'rol' else 'otro' end,
          p_periodo, p_monto, p_medio, left(coalesce(p_nota, ''), 300), p_comprobante, cup, case when p_periodo = 'meses' then p_meses end)
  returning id into i;
  -- Aviso al tiro: al Centro de Mando si la app está vinculada (si no, al administrador de esta app).
  perform public.cfx_al_cm('💳 Pago por revisar', coalesce(nullif(y ->> 'nombre', ''), y ->> 'email') || ' · $' || p_monto || ' (' || case p_periodo when 'meses' then p_meses || ' meses' else p_periodo end || ', ' || p_medio || ')' || coalesce(' · cupón ' || cup, ''), 'pago');
  return i;
end $$;

-- Precios públicos (para la portada, sin iniciar sesión).
create or replace function public.cfx_precios() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('negocio', valor -> 'negocio', 'cliente', valor -> 'cliente', 'comision_pct', valor -> 'comision_pct',
    'liberado_hasta', (select case when (l.valor ->> 'hasta')::timestamptz > now() then l.valor -> 'hasta' end from public.cfx_config l where l.clave = 'liberar'))
  from public.cfx_config where clave = 'pagos'
$$;
revoke all on function public.cfx_precios() from public;
grant execute on function public.cfx_precios() to anon, authenticated;

-- ---------- Administrador (lo llama el Centro de Mando) ----------
create or replace function public.cfx_pagos_config() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select valor from public.cfx_config where clave = 'pagos');
end $$;

create or replace function public.cfx_pagos_config_guardar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb := (select valor from public.cfx_config where clave = 'pagos');
begin
  perform public.cfx_es_admin();
  if jsonb_typeof(p) <> 'object' then raise exception 'Datos no válidos'; end if;
  if coalesce(p ->> 'link', '') <> '' and (p ->> 'link') !~ '^https://[^ ]+$' then raise exception 'El link de pago debe empezar con https://'; end if;
  if coalesce((p ->> 'comision_pct')::numeric, 0) not between 0 and 20 or coalesce((p #>> '{tarjeta,comision_pct}')::numeric, 0) not between 0 and 20 then raise exception 'El cargo por pago online va de 0 a 20 %%'; end if;
  if coalesce(p #>> '{tarjeta,link}', '') <> '' and (p #>> '{tarjeta,link}') !~ '^https://[^ ]+$' then raise exception 'El link de tarjeta debe empezar con https://'; end if;
  -- Al activar "bloquear hasta el primer pago", solo aplica a los negocios que se registren desde ahora.
  -- También cuando se configura la primera forma de pago (antes nadie podía pagar, así que nadie quedó obligado).
  if coalesce((p #>> '{negocio,exigir_inicio}')::boolean, false) and (not coalesce((v #>> '{negocio,exigir_inicio}')::boolean, false)
     or (coalesce(v ->> 'link', '') = '' and coalesce(v #>> '{transferencia,numero}', '') = '' and coalesce(v #>> '{tarjeta,link}', '') = ''
         and (coalesce(p ->> 'link', '') <> '' or coalesce(p #>> '{transferencia,numero}', '') <> '' or coalesce(p #>> '{tarjeta,link}', '') <> ''))) then
    p := p || jsonb_build_object('inicio_desde', now());
  end if;
  v := v || (p - 'inicio_desde') || case when p ? 'inicio_desde' then jsonb_build_object('inicio_desde', p -> 'inicio_desde') else '{}'::jsonb end;
  update public.cfx_config set valor = v where clave = 'pagos';
  return v;
end $$;

create or replace function public.cfx_pagos_lista(p_estado text default 'pendiente') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select coalesce(jsonb_agg(x order by x.creado desc), '[]') from (
    select id, cuenta, email, nombre, rol, periodo, meses, monto, medio, nota, estado, dias, motivo, creado, resuelto, comprobante is not null as con_comprobante,
      public.cfx_dias_sugeridos(g) as sugeridos,
      (select count(*) from public.cfx_pagos z where z.cuenta = g.cuenta and z.estado = 'aprobado') as aprobados
    from public.cfx_pagos g where p_estado = 'todos' or estado = p_estado order by creado desc limit 200) x);
end $$;

create or replace function public.cfx_pago_comprobante(p_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select comprobante from public.cfx_pagos where id = p_id);
end $$;

-- Días que corresponden a un pago (siempre días enteros): mensual 30, anual 365, N meses = N × 30, primer pago lo configurado,
-- y "otro monto" en proporción al precio mensual (sin contar el cargo por pago online).
create or replace function public.cfx_dias_sugeridos(g public.cfx_pagos) returns int
language plpgsql stable security definer set search_path = '' as $$
declare c jsonb := (select valor from public.cfx_config where clave = 'pagos'); m numeric; pct numeric; neto numeric;
begin
  if g.periodo = 'inicio' then return coalesce((c #>> '{negocio,inicio_dias}')::int, 30); end if;
  if g.periodo = 'mensual' then return 30; end if;
  if g.periodo = 'anual' then return 365; end if;
  if g.periodo = 'meses' then return 30 * coalesce(g.meses, 1); end if;
  m := nullif((c #>> array[case when g.rol = 'cliente' then 'cliente' else 'negocio' end, 'mensual'])::numeric, 0);
  pct := case g.medio when 'link' then coalesce((c ->> 'comision_pct')::numeric, 0) when 'tarjeta' then coalesce((c #>> '{tarjeta,comision_pct}')::numeric, 0) else 0 end;
  neto := g.monto / (1 + pct / 100);
  return case when m is null then 0 else least(3660, floor(neto * 30 / m))::int end;
end $$;
revoke all on function public.cfx_dias_sugeridos(public.cfx_pagos) from public, anon, authenticated;

create or replace function public.cfx_pago_resolver(p_id uuid, p_aprobar boolean, p_dias int default null, p_motivo text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.cfx_pagos; c jsonb := (select valor from public.cfx_config where clave = 'pagos'); d int; hasta timestamptz;
begin
  perform public.cfx_es_admin();
  select * into g from public.cfx_pagos where id = p_id and estado = 'pendiente' for update;
  if g.id is null then raise exception 'Pago no encontrado o ya resuelto'; end if;
  d := coalesce(p_dias, public.cfx_dias_sugeridos(g));
  if p_aprobar then
    if d < 0 or d > 3660 then raise exception 'Días no válidos'; end if;
    if d > 0 then hasta := public.cfx_dar_premium(g.cuenta, g.rol, d); end if;
    update public.cfx_pagos set estado = 'aprobado', dias = d, motivo = left(coalesce(p_motivo, ''), 200), resuelto = now(), comprobante = null where id = p_id;
    perform public.cfx_avisar(g.cuenta, '✅ Pago aprobado', case when hasta is not null then 'Premium activo hasta el ' || to_char(hasta at time zone 'America/Santiago', 'DD/MM/YYYY') || '. ¡Gracias!' else 'Gracias, tu pago quedó registrado.' end);
  else
    update public.cfx_pagos set estado = 'rechazado', motivo = left(coalesce(nullif(p_motivo, ''), 'No pudimos validar el comprobante'), 200), resuelto = now(), comprobante = null where id = p_id;
    perform public.cfx_avisar(g.cuenta, '⚠️ Pago rechazado', left(coalesce(nullif(p_motivo, ''), 'No pudimos validar el comprobante'), 200) || '. Puedes subirlo de nuevo.');
  end if;
  return jsonb_build_object('estado', case when p_aprobar then 'aprobado' else 'rechazado' end, 'dias', d, 'hasta', hasta);
end $$;

-- Liberar el registro por N días (0 = terminar ahora). Sin p_dias solo devuelve cómo está.
create or replace function public.cfx_liberar(p_dias int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb := (select valor from public.cfx_config where clave = 'liberar');
begin
  perform public.cfx_es_admin();
  if p_dias is not null then
    if p_dias < 0 or p_dias > 90 then raise exception 'De 0 a 90 días'; end if;
    v := case when p_dias = 0 then coalesce(v, '{}'::jsonb) || jsonb_build_object('hasta', least(coalesce((v ->> 'hasta')::timestamptz, now()), now()))
         else jsonb_build_object('desde', case when (v ->> 'hasta')::timestamptz > now() then v -> 'desde' else to_jsonb(now()) end, 'hasta', now() + make_interval(days => p_dias)) end;
    insert into public.cfx_config (clave, valor) values ('liberar', v) on conflict (clave) do update set valor = excluded.valor;
  end if;
  return jsonb_build_object('desde', v -> 'desde', 'hasta', v -> 'hasta', 'activo', coalesce((v ->> 'hasta')::timestamptz > now(), false));
end $$;
revoke all on function public.cfx_liberar(int) from public, anon;
grant execute on function public.cfx_liberar(int) to authenticated;

-- Cuentas que no pagan el inicio (por ejemplo, las que creas tú de regalo).
create or replace function public.cfx_exento(p_cuenta uuid, p_si boolean, p_nota text default '') returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  if p_si then insert into public.cfx_exentos (cuenta, nota) values (p_cuenta, left(coalesce(p_nota, ''), 200)) on conflict (cuenta) do update set nota = excluded.nota;
  else delete from public.cfx_exentos where cuenta = p_cuenta; end if;
end $$;

create or replace function public.cfx_exento_email(p_email text, p_si boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  perform public.cfx_es_admin();
  select id into u from auth.users where lower(email) = lower(trim(coalesce(p_email, '')));
  if u is null then raise exception 'No hay una cuenta con ese correo en esta app'; end if;
  perform public.cfx_exento(u, p_si, 'Desde el Centro de Mando');
  return lower(trim(p_email));
end $$;

revoke all on function public.cfx_exento_email(text, boolean) from public, anon;
grant execute on function public.cfx_exento_email(text, boolean) to authenticated;
revoke all on function public.cfx_pago_estado(), public.cfx_pago_pedir(text, int, text, text, text, text, int), public.cfx_pagos_config(), public.cfx_pagos_config_guardar(jsonb),
  public.cfx_pagos_lista(text), public.cfx_pago_comprobante(uuid), public.cfx_pago_resolver(uuid, boolean, int, text), public.cfx_exento(uuid, boolean, text) from public, anon;
grant execute on function public.cfx_pago_estado(), public.cfx_pago_pedir(text, int, text, text, text, text, int), public.cfx_pagos_config(), public.cfx_pagos_config_guardar(jsonb),
  public.cfx_pagos_lista(text), public.cfx_pago_comprobante(uuid), public.cfx_pago_resolver(uuid, boolean, int, text), public.cfx_exento(uuid, boolean, text) to authenticated;
revoke all on function public.cfx_yo(), public.cfx_dar_premium(uuid, text, int), public.cfx_avisar(uuid, text, text), public.cfx_avisar_admin(text, text) from public, anon, authenticated;
-- ---------------------------------------------------------------------
-- CodeFix · Administración común (igual en las 6 apps; se maneja desde el Centro de Mando → Control).
--   Planes (interruptores sí/no y límites), textos, aviso a todos, keys de Premium, cupones de descuento,
--   verificación de identidad y registro de lo que hace el administrador.
--   Cada app define antes: cfx_planes_app(), cfx_plan_guardar_app(text, text, jsonb, jsonb), cfx_textos_app(),
--   cfx_texto_guardar_app(text, text), cfx_destinatarios(text) y cfx_marcar_verificado(uuid, boolean).
-- ---------------------------------------------------------------------
create table if not exists public.cfx_registro (
  id bigserial primary key, quien text not null default '', accion text not null, detalle text not null default '', creado timestamptz not null default now());
create table if not exists public.cfx_keys (
  id uuid primary key default gen_random_uuid(), hash text not null unique, ultimos text not null, rol text not null check (rol in ('negocio', 'cliente')),
  dias int not null check (dias between 1 and 3660), nota text not null default '', creado timestamptz not null default now(),
  usada_por uuid, usada_email text, usada_at timestamptz, revocada boolean not null default false);
create table if not exists public.cfx_cupones (
  codigo text primary key check (codigo ~ '^[A-Z0-9-]{3,20}$'), pct int not null check (pct between 1 and 100), usos_max int, usos int not null default 0,
  vence date, activo boolean not null default true, creado timestamptz not null default now());
create table if not exists public.cfx_verificaciones (
  cuenta uuid primary key, email text not null default '', nombre text not null default '', rut text not null, documento text not null default '',
  frente text, reverso text, selfie text, estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  motivo text not null default '', creado timestamptz not null default now(), resuelto timestamptz);
alter table public.cfx_registro enable row level security;
alter table public.cfx_keys enable row level security;
alter table public.cfx_cupones enable row level security;
alter table public.cfx_verificaciones enable row level security;
revoke all on public.cfx_registro, public.cfx_keys, public.cfx_cupones, public.cfx_verificaciones from anon, authenticated;

create or replace function public.cfx_anotar(p_accion text, p_detalle text) returns void
language sql security definer set search_path = '' as $$
  insert into public.cfx_registro (quien, accion, detalle) values (coalesce((select email from auth.users where id = auth.uid()), 'sistema'), left(p_accion, 60), left(coalesce(p_detalle, ''), 400))
$$;
create or replace function public.cfx_registro_lista(p_limite int default 200) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select coalesce(jsonb_agg(x order by x.id desc), '[]') from (select * from public.cfx_registro order by id desc limit greatest(1, least(coalesce(p_limite, 200), 2000))) x);
end $$;

-- ---------- Planes: [{grupo, clave, free, premium}] (números o sí/no) ----------
-- Borrar el registro de cambios (el común y el propio de la app, si tiene): lo de más de N días, o todo con 0. Solo el administrador.
create or replace function public.cfx_registro_borrar(p_dias int default 30) returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; k int; col text; desde timestamptz := case when coalesce(p_dias, 0) <= 0 then 'infinity'::timestamptz else now() - make_interval(days => p_dias) end;
begin
  perform public.cfx_es_admin();
  delete from public.cfx_registro where creado < desde; get diagnostics n = row_count;
  if to_regclass('public.auditoria') is not null then
    select c.column_name into col from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'auditoria'
      and c.column_name in ('created_at', 'at', 'creado', 'fecha') and c.data_type like 'timestamp%' order by c.ordinal_position limit 1;
    if col is not null then execute format('delete from public.auditoria where %I < $1', col) using desde; get diagnostics k = row_count; n := n + k; end if;
  end if;
  insert into public.cfx_registro (quien, accion, detalle) values (coalesce((select email from auth.users where id = auth.uid()), 'sistema'), 'registro borrado',
    case when coalesce(p_dias, 0) <= 0 then 'todo' else 'más de ' || p_dias || ' días' end || ' (' || n || ' filas)');
  return n;
end $$;
revoke all on function public.cfx_registro_borrar(int) from public, anon;
grant execute on function public.cfx_registro_borrar(int) to authenticated;

create or replace function public.cfx_planes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return public.cfx_planes_app();
end $$;
create or replace function public.cfx_plan_guardar(p_grupo text, p_clave text, p_free jsonb, p_premium jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  if jsonb_typeof(p_free) not in ('number', 'boolean') or jsonb_typeof(p_premium) not in ('number', 'boolean') then raise exception 'Valor no válido'; end if;
  perform public.cfx_plan_guardar_app(p_grupo, p_clave, p_free, p_premium);
  perform public.cfx_anotar('plan', p_grupo || '.' || p_clave || ': gratis ' || p_free::text || ' · premium ' || p_premium::text);
end $$;

-- ---------- Textos: [{clave, valor}] ----------
create or replace function public.cfx_textos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return public.cfx_textos_app();
end $$;
create or replace function public.cfx_texto_guardar(p_clave text, p_valor text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  perform public.cfx_texto_guardar_app(p_clave, left(coalesce(p_valor, ''), 2000));
  perform public.cfx_anotar('texto', p_clave);
end $$;

-- ---------- Aviso a todos: destino todos | negocios | clientes | premium | gratis ----------
create or replace function public.cfx_aviso_masivo(p_destino text, p_titulo text, p_cuerpo text) returns int
language plpgsql security definer set search_path = '' as $$
declare u uuid; n int := 0;
begin
  perform public.cfx_es_admin();
  if trim(coalesce(p_titulo, '')) = '' then raise exception 'Escribe el título'; end if;
  if p_destino not in ('todos', 'negocios', 'clientes', 'premium', 'gratis') then raise exception 'Destino no válido'; end if;
  for u in select * from public.cfx_destinatarios(p_destino) loop
    perform public.cfx_avisar(u, left(p_titulo, 80), left(coalesce(p_cuerpo, ''), 240));
    n := n + 1;
  end loop;
  perform public.cfx_anotar('aviso', p_destino || ' (' || n || '): ' || p_titulo);
  return n;
end $$;

-- ---------- Keys de Premium (de un solo uso). Se guardan cifradas: el código completo solo se ve al crearlas. ----------
create or replace function public.cfx_keys_crear(p_n int, p_rol text, p_dias int, p_nota text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c text; out jsonb := '[]'::jsonb;
begin
  perform public.cfx_es_admin();
  if p_rol not in ('negocio', 'cliente') or coalesce(p_dias, 0) not between 1 and 3660 or coalesce(p_n, 0) not between 1 and 50 then raise exception 'Datos no válidos'; end if;
  for i in 1..p_n loop
    c := upper(replace(gen_random_uuid()::text, '-', ''));
    c := 'CFX-' || substr(c, 1, 4) || '-' || substr(c, 5, 4) || '-' || substr(c, 9, 4);
    insert into public.cfx_keys (hash, ultimos, rol, dias, nota) values (encode(sha256(convert_to(c, 'UTF8')), 'hex'), right(c, 4), p_rol, p_dias, left(coalesce(p_nota, ''), 120));
    out := out || to_jsonb(c);
  end loop;
  perform public.cfx_anotar('keys', p_n || ' keys ' || p_rol || ' de ' || p_dias || ' días');
  return out;
end $$;
create or replace function public.cfx_keys_lista() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select coalesce(jsonb_agg(to_jsonb(k) - 'hash' order by k.creado desc), '[]') from (select * from public.cfx_keys order by creado desc limit 300) k);
end $$;
create or replace function public.cfx_key_revocar(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  update public.cfx_keys set revocada = true where id = p_id and usada_por is null;
  perform public.cfx_anotar('key revocada', p_id::text);
end $$;
create or replace function public.cfx_key_canjear(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare y jsonb := public.cfx_yo(); k public.cfx_keys; h timestamptz; c text := upper(trim(coalesce(p_codigo, '')));
begin
  if y is null or (y ->> 'id') is null then raise exception 'Inicia sesión'; end if;
  if (select count(*) from public.cfx_registro where accion = 'key fallida' and detalle = (y ->> 'id') and creado > now() - interval '1 hour') >= 10 then
    raise exception 'Demasiados intentos. Prueba en una hora.';
  end if;
  select * into k from public.cfx_keys where hash = encode(sha256(convert_to(c, 'UTF8')), 'hex') for update;
  if k.id is null or k.revocada or k.usada_por is not null then
    insert into public.cfx_registro (quien, accion, detalle) values (coalesce(y ->> 'email', ''), 'key fallida', y ->> 'id');
    raise exception 'Key no válida o ya usada';
  end if;
  if k.rol <> coalesce(y ->> 'rol', '') then raise exception 'Esta key es para cuentas de %', case when k.rol = 'negocio' then 'negocio' else 'cliente' end; end if;
  h := public.cfx_dar_premium((y ->> 'id')::uuid, k.rol, k.dias);
  update public.cfx_keys set usada_por = (y ->> 'id')::uuid, usada_email = y ->> 'email', usada_at = now() where id = k.id;
  insert into public.cfx_exentos (cuenta, nota) values ((y ->> 'id')::uuid, 'Key ' || k.ultimos) on conflict (cuenta) do nothing;
  perform public.cfx_avisar_admin('🔑 Key canjeada', coalesce(y ->> 'email', '') || ' · ' || k.dias || ' días');
  return jsonb_build_object('hasta', h, 'dias', k.dias);
end $$;

-- ---------- Cupones de descuento (se aplican al pagar Premium) ----------
create or replace function public.cfx_cupon_ver(p_codigo text) returns int
language plpgsql stable security definer set search_path = '' as $$
declare c public.cfx_cupones;
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  select * into c from public.cfx_cupones where codigo = upper(trim(coalesce(p_codigo, '')));
  if c.codigo is null or not c.activo or (c.vence is not null and c.vence < current_date) or (c.usos_max is not null and c.usos >= c.usos_max) then
    raise exception 'Cupón no válido o vencido';
  end if;
  return c.pct;
end $$;
create or replace function public.cfx_cupones_lista() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select coalesce(jsonb_agg(to_jsonb(c) order by c.creado desc), '[]') from public.cfx_cupones c);
end $$;
create or replace function public.cfx_cupon_guardar(p_codigo text, p_pct int, p_usos_max int default null, p_vence date default null, p_activo boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  insert into public.cfx_cupones (codigo, pct, usos_max, vence, activo) values (upper(trim(p_codigo)), p_pct, p_usos_max, p_vence, coalesce(p_activo, true))
  on conflict (codigo) do update set pct = excluded.pct, usos_max = excluded.usos_max, vence = excluded.vence, activo = excluded.activo;
  perform public.cfx_anotar('cupón', upper(trim(p_codigo)) || ' ' || p_pct || '%');
end $$;
create or replace function public.cfx_cupon_borrar(p_codigo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  delete from public.cfx_cupones where codigo = upper(trim(p_codigo));
end $$;

-- ---------- Verificación de identidad (RUT, N° de documento, fotos de la cédula y selfie). Las fotos se borran al revisar. ----------
create or replace function public.cfx_rut_ok(r text) returns boolean
language plpgsql immutable as $$
declare s text := upper(regexp_replace(coalesce(r, ''), '[^0-9kK]', '', 'g')); cuerpo text; dv text; suma int := 0; m int := 2; res text;
begin
  if length(s) < 2 then return false; end if;
  cuerpo := left(s, length(s) - 1); dv := right(s, 1);
  if cuerpo !~ '^[0-9]+$' then return false; end if;
  for i in reverse length(cuerpo)..1 loop
    suma := suma + substr(cuerpo, i, 1)::int * m; m := case when m = 7 then 2 else m + 1 end;
  end loop;
  res := case 11 - suma % 11 when 11 then '0' when 10 then 'K' else (11 - suma % 11)::text end;
  return res = dv;
end $$;
create or replace function public.cfx_verif_estado() returns jsonb
language sql stable security definer set search_path = '' as $$
  select (select jsonb_build_object('estado', estado, 'motivo', motivo, 'creado', creado, 'resuelto', resuelto) from public.cfx_verificaciones where cuenta = auth.uid())
$$;
create or replace function public.cfx_verif_enviar(p_rut text, p_documento text, p_frente text, p_reverso text, p_selfie text) returns void
language plpgsql security definer set search_path = '' as $$
declare y jsonb := public.cfx_yo(); r text := upper(regexp_replace(coalesce(p_rut, ''), '[^0-9kK]', '', 'g'));
begin
  if y is null or (y ->> 'id') is null then raise exception 'Inicia sesión'; end if;
  if not public.cfx_rut_ok(r) then raise exception 'RUT no válido'; end if;
  if exists (select 1 from public.cfx_verificaciones where rut = r and cuenta <> (y ->> 'id')::uuid and estado <> 'rechazada') then raise exception 'Ese RUT ya está en otra cuenta'; end if;
  if exists (select 1 from public.cfx_verificaciones where cuenta = (y ->> 'id')::uuid and estado = 'aprobada') then raise exception 'Tu identidad ya está verificada'; end if;
  if coalesce(length(p_frente), 0) < 200 or coalesce(length(p_reverso), 0) < 200 or coalesce(length(p_selfie), 0) < 200 then raise exception 'Faltan fotos'; end if;
  if length(p_frente) > 500000 or length(p_reverso) > 500000 or length(p_selfie) > 500000 then raise exception 'Fotos muy pesadas'; end if;
  insert into public.cfx_verificaciones (cuenta, email, nombre, rut, documento, frente, reverso, selfie, estado, motivo, creado, resuelto)
  values ((y ->> 'id')::uuid, coalesce(y ->> 'email', ''), left(coalesce(y ->> 'nombre', ''), 80), r, left(coalesce(p_documento, ''), 20), p_frente, p_reverso, p_selfie, 'pendiente', '', now(), null)
  on conflict (cuenta) do update set rut = excluded.rut, documento = excluded.documento, frente = excluded.frente, reverso = excluded.reverso, selfie = excluded.selfie,
    estado = 'pendiente', motivo = '', creado = now(), resuelto = null;
  perform public.cfx_avisar_admin('🪪 Verificación por revisar', coalesce(nullif(y ->> 'nombre', ''), y ->> 'email'));
end $$;
create or replace function public.cfx_verif_lista(p_estado text default 'pendiente') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select coalesce(jsonb_agg(x order by x.creado desc), '[]') from (select cuenta, email, nombre, rut, documento, estado, motivo, creado, resuelto
    from public.cfx_verificaciones where p_estado = 'todos' or estado = p_estado order by creado desc limit 200) x);
end $$;
create or replace function public.cfx_verif_fotos(p_cuenta uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select jsonb_build_object('frente', frente, 'reverso', reverso, 'selfie', selfie) from public.cfx_verificaciones where cuenta = p_cuenta);
end $$;
create or replace function public.cfx_verif_resolver(p_cuenta uuid, p_aprobar boolean, p_motivo text default '') returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  update public.cfx_verificaciones set estado = case when p_aprobar then 'aprobada' else 'rechazada' end, motivo = left(coalesce(p_motivo, ''), 200),
    resuelto = now(), frente = null, reverso = null, selfie = null where cuenta = p_cuenta and estado = 'pendiente';
  if not found then raise exception 'No hay una verificación pendiente'; end if;
  perform public.cfx_marcar_verificado(p_cuenta, p_aprobar);
  perform public.cfx_avisar(p_cuenta, case when p_aprobar then '🪪 Identidad verificada' else '🪪 Verificación rechazada' end,
    case when p_aprobar then 'Ya apareces como persona verificada.' else coalesce(nullif(p_motivo, ''), 'Revisa las fotos') || '. Puedes enviarla de nuevo.' end);
  perform public.cfx_anotar(case when p_aprobar then 'verificación aprobada' else 'verificación rechazada' end, p_cuenta::text);
end $$;

create or replace function public.cfx_cupon_usado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'aprobado' and old.estado = 'pendiente' and new.cupon is not null then update public.cfx_cupones set usos = usos + 1 where codigo = new.cupon; end if;
  return new;
end $$;
drop trigger if exists cfx_cupon_usado on public.cfx_pagos;
create trigger cfx_cupon_usado after update of estado on public.cfx_pagos for each row execute function public.cfx_cupon_usado();

-- ---------- Verificación humana (Cloudflare Turnstile): la site key es pública; la secret key va en Supabase → Authentication → CAPTCHA ----------
insert into public.cfx_config (clave, valor) values ('humano', '{"site_key": ""}') on conflict (clave) do nothing;
create or replace function public.cfx_humano() returns jsonb
language sql stable security definer set search_path = '' as $$ select valor from public.cfx_config where clave = 'humano' $$;
create or replace function public.cfx_humano_guardar(p_site_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  if coalesce(p_site_key, '') <> '' and p_site_key !~ '^[0-9A-Za-z_-]{10,60}$' then raise exception 'Site key no válida'; end if;
  update public.cfx_config set valor = jsonb_build_object('site_key', coalesce(p_site_key, '')) where clave = 'humano';
  perform public.cfx_anotar('humano', case when coalesce(p_site_key, '') = '' then 'apagado' else 'site key ' || right(p_site_key, 4) end);
end $$;
revoke all on function public.cfx_humano(), public.cfx_humano_guardar(text) from public;
grant execute on function public.cfx_humano() to anon, authenticated;
grant execute on function public.cfx_humano_guardar(text) to authenticated;

revoke all on function public.cfx_anotar(text, text), public.cfx_cupon_usado() from public, anon, authenticated;
revoke all on function public.cfx_registro_lista(int), public.cfx_planes(), public.cfx_plan_guardar(text, text, jsonb, jsonb), public.cfx_textos(), public.cfx_texto_guardar(text, text),
  public.cfx_aviso_masivo(text, text, text), public.cfx_keys_crear(int, text, int, text), public.cfx_keys_lista(), public.cfx_key_revocar(uuid), public.cfx_key_canjear(text),
  public.cfx_cupon_ver(text), public.cfx_cupones_lista(), public.cfx_cupon_guardar(text, int, int, date, boolean), public.cfx_cupon_borrar(text),
  public.cfx_verif_estado(), public.cfx_verif_enviar(text, text, text, text, text), public.cfx_verif_lista(text), public.cfx_verif_fotos(uuid), public.cfx_verif_resolver(uuid, boolean, text) from public, anon;
grant execute on function public.cfx_registro_lista(int), public.cfx_planes(), public.cfx_plan_guardar(text, text, jsonb, jsonb), public.cfx_textos(), public.cfx_texto_guardar(text, text),
  public.cfx_aviso_masivo(text, text, text), public.cfx_keys_crear(int, text, int, text), public.cfx_keys_lista(), public.cfx_key_revocar(uuid), public.cfx_key_canjear(text),
  public.cfx_cupon_ver(text), public.cfx_cupones_lista(), public.cfx_cupon_guardar(text, int, int, date, boolean), public.cfx_cupon_borrar(text),
  public.cfx_verif_estado(), public.cfx_verif_enviar(text, text, text, text, text), public.cfx_verif_lista(text), public.cfx_verif_fotos(uuid), public.cfx_verif_resolver(uuid, boolean, text) to authenticated;
revoke all on function public.cfx_planes_app(), public.cfx_plan_guardar_app(text, text, jsonb, jsonb), public.cfx_textos_app(), public.cfx_texto_guardar_app(text, text),
  public.cfx_destinatarios(text), public.cfx_marcar_verificado(uuid, boolean) from public, anon, authenticated;

-- ---------- Series para el Resumen del Centro de Mando: por mes, cuentas nuevas y pagos/ingresos aprobados (últimos N meses) ----------
create or replace function public.cfx_series(p_meses int default 6) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n int := greatest(1, least(coalesce(p_meses, 6), 24));
begin
  perform public.cfx_es_admin();
  return (select jsonb_agg(jsonb_build_object('mes', to_char(m, 'YYYY-MM'),
      'cuentas', (select count(*) from auth.users u where u.created_at >= m and u.created_at < m + interval '1 month'),
      'pagos', (select count(*) from public.cfx_pagos p where p.estado = 'aprobado' and p.creado >= m and p.creado < m + interval '1 month'),
      'ingresos', (select coalesce(sum(p.monto), 0) from public.cfx_pagos p where p.estado = 'aprobado' and p.creado >= m and p.creado < m + interval '1 month')) order by m)
    from generate_series(date_trunc('month', now()) - make_interval(months => n - 1), date_trunc('month', now()), interval '1 month') m);
end $$;
-- ---------------------------------------------------------------------
-- CodeFix · Ayuda (igual en las 6 apps; lo reparte nucleo/sincronizar.py).
--   1) Puente al Centro de Mando: los avisos importantes (pagos por revisar, mensajes de soporte) le llegan al tiro
--      al Centro de Mando. El Centro de Mando vincula cada app solo (cfx_cm_vincular) al abrir Pagos o Mensajes.
--   2) Chat de soporte: cada persona escribe desde su app y tú respondes desde el Centro de Mando → Mensajes.
--   3) Guía para partir: lo que le falta configurar a cada negocio (cfx_guia_app() de cada app). No se marca
--      como listo hasta que de verdad lo hace, y se le recuerda cada vez que entra.
--   Cada app define antes: cfx_guia_app() → [{ k, t, d, ok, ir }].
-- ---------------------------------------------------------------------

-- ---------- 1) Puente al Centro de Mando ----------
create or replace function public.cfx_cm_vincular(p_url text, p_key text, p_secreto text, p_app text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  if coalesce(p_url, '') !~ '^https://[a-z0-9.-]+$' or length(coalesce(p_key, '')) < 20 or length(coalesce(p_secreto, '')) < 24 or coalesce(p_app, '') !~ '^[a-z]{2,20}$' then
    raise exception 'Datos de vínculo no válidos';
  end if;
  insert into public.cfx_config (clave, valor) values ('cm', jsonb_build_object('url', p_url, 'key', p_key, 'secreto', p_secreto, 'app', p_app, 'desde', now()))
  on conflict (clave) do update set valor = excluded.valor;
  return jsonb_build_object('vinculado', true, 'app', p_app);
end $$;

create or replace function public.cfx_cm_estado() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb := (select valor from public.cfx_config where clave = 'cm');
begin
  perform public.cfx_es_admin();
  return jsonb_build_object('vinculado', coalesce(v ->> 'secreto', '') <> '', 'app', v ->> 'app', 'url', v ->> 'url', 'desde', v -> 'desde');
end $$;

-- Avisa al Centro de Mando (si la app está vinculada); si no, al administrador de esta app. Nunca hace fallar lo que la llama.
create or replace function public.cfx_al_cm(p_titulo text, p_cuerpo text, p_tipo text default 'aviso') returns void
language plpgsql security definer set search_path = '' as $$
declare v jsonb := (select valor from public.cfx_config where clave = 'cm');
begin
  if coalesce(v ->> 'secreto', '') = '' then
    perform public.cfx_avisar_admin(p_titulo, p_cuerpo);
    return;
  end if;
  begin
    perform net.http_post(
      url := (v ->> 'url') || '/rest/v1/rpc/cfx_aviso_externo',
      body := jsonb_build_object('p_app', v ->> 'app', 'p_secreto', v ->> 'secreto', 'p_titulo', left(p_titulo, 90), 'p_cuerpo', left(coalesce(p_cuerpo, ''), 240), 'p_tipo', p_tipo),
      headers := jsonb_build_object('apikey', v ->> 'key', 'Authorization', 'Bearer ' || (v ->> 'key'), 'Content-Type', 'application/json'));
  exception when others then
    begin perform public.cfx_avisar_admin(p_titulo, p_cuerpo); exception when others then null; end;
  end;
end $$;

-- ---------- 2) Chat de soporte ----------
create table if not exists public.cfx_chat (
  id      bigserial primary key,
  cuenta  uuid not null,
  email   text not null default '',
  nombre  text not null default '',
  rol     text not null default '',
  de      text not null check (de in ('persona', 'soporte')),
  texto   text not null check (length(texto) between 1 and 1000),
  leido   boolean not null default false,
  creado  timestamptz not null default now()
);
create index if not exists cfx_chat_cuenta_idx on public.cfx_chat (cuenta, id);
create index if not exists cfx_chat_sin_leer_idx on public.cfx_chat (de, leido) where not leido;
alter table public.cfx_chat enable row level security;
revoke all on public.cfx_chat from anon, authenticated;

create or replace function public.cfx_chat_mio() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare y jsonb := public.cfx_yo(); u uuid := (y ->> 'id')::uuid;
begin
  if u is null then raise exception 'Inicia sesión'; end if;
  update public.cfx_chat set leido = true where cuenta = u and de = 'soporte' and not leido;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'de', de, 'texto', texto, 'creado', creado) order by id), '[]')
          from (select * from public.cfx_chat where cuenta = u order by id desc limit 100) x);
end $$;

create or replace function public.cfx_chat_sin_leer() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.cfx_chat where cuenta = auth.uid() and de = 'soporte' and not leido
$$;

create or replace function public.cfx_chat_enviar(p_texto text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare y jsonb := public.cfx_yo(); u uuid := (y ->> 'id')::uuid; t text := trim(coalesce(p_texto, '')); i bigint;
begin
  if u is null then raise exception 'Inicia sesión'; end if;
  if t = '' then raise exception 'Escribe tu mensaje'; end if;
  if length(t) > 1000 then raise exception 'Máximo 1000 letras'; end if;
  if (select count(*) from public.cfx_chat where cuenta = u and de = 'persona' and creado > now() - interval '1 hour') >= 20 then
    raise exception 'Muchos mensajes seguidos. Espera un poco y te respondemos.';
  end if;
  insert into public.cfx_chat (cuenta, email, nombre, rol, de, texto)
  values (u, coalesce(y ->> 'email', ''), left(coalesce(y ->> 'nombre', ''), 80), coalesce(y ->> 'rol', ''), 'persona', t) returning id into i;
  delete from public.cfx_chat where cuenta = u and creado < now() - interval '365 days';
  perform public.cfx_al_cm('💬 ' || coalesce(nullif(y ->> 'nombre', ''), y ->> 'email', 'Mensaje'), left(t, 200), 'chat');
  return i;
end $$;

-- Administrador: bandeja (una fila por persona), conversación y respuesta.
create or replace function public.cfx_chat_bandeja() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select coalesce(jsonb_agg(x order by x.ultimo desc), '[]') from (
    select c.cuenta, max(c.email) as email, max(c.nombre) as nombre, max(c.rol) as rol, max(c.creado) as ultimo,
      (array_agg(c.texto order by c.id desc))[1] as texto, (array_agg(c.de order by c.id desc))[1] as de,
      count(*) filter (where c.de = 'persona' and not c.leido) as sin_leer
    from public.cfx_chat c group by c.cuenta order by max(c.creado) desc limit 200) x);
end $$;

create or replace function public.cfx_chat_hilo(p_cuenta uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  update public.cfx_chat set leido = true where cuenta = p_cuenta and de = 'persona' and not leido;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'de', de, 'texto', texto, 'creado', creado) order by id), '[]')
          from (select * from public.cfx_chat where cuenta = p_cuenta order by id desc limit 200) x);
end $$;

create or replace function public.cfx_chat_responder(p_cuenta uuid, p_texto text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare t text := trim(coalesce(p_texto, '')); i bigint; o public.cfx_chat;
begin
  perform public.cfx_es_admin();
  if t = '' or length(t) > 1000 then raise exception 'Escribe la respuesta (máx. 1000 letras)'; end if;
  select * into o from public.cfx_chat where cuenta = p_cuenta order by id desc limit 1;
  if o.id is null then raise exception 'Conversación no encontrada'; end if;
  insert into public.cfx_chat (cuenta, email, nombre, rol, de, texto, leido) values (p_cuenta, o.email, o.nombre, o.rol, 'soporte', t, false) returning id into i;
  update public.cfx_chat set leido = true where cuenta = p_cuenta and de = 'persona' and not leido;
  perform public.cfx_avisar(p_cuenta, '💬 Soporte te respondió', left(t, 200));
  return i;
end $$;

-- El administrador escribe primero a una cuenta (consejos o recomendaciones): queda en su chat de soporte (🛟) y en CM → Mensajes.
create or replace function public.cfx_chat_iniciar(p_cuenta uuid, p_texto text, p_email text default '', p_nombre text default '', p_rol text default 'negocio') returns bigint
language plpgsql security definer set search_path = '' as $$
declare t text := trim(coalesce(p_texto, '')); i bigint; o public.cfx_chat;
begin
  perform public.cfx_es_admin();
  if t = '' or length(t) > 1000 then raise exception 'Escribe el mensaje (máx. 1000 letras)'; end if;
  select * into o from public.cfx_chat where cuenta = p_cuenta order by id desc limit 1;
  insert into public.cfx_chat (cuenta, email, nombre, rol, de, texto, leido)
  values (p_cuenta, coalesce(o.email, left(coalesce(p_email, ''), 200)), coalesce(o.nombre, left(coalesce(p_nombre, ''), 120)), coalesce(o.rol, left(coalesce(p_rol, 'negocio'), 20)), 'soporte', t, false)
  returning id into i;
  perform public.cfx_avisar(p_cuenta, '💬 Soporte te escribió', left(t, 200));
  return i;
end $$;
revoke all on function public.cfx_chat_iniciar(uuid, text, text, text, text) from public, anon;
grant execute on function public.cfx_chat_iniciar(uuid, text, text, text, text) to authenticated;

-- ---------- 3) Guía para partir ----------
-- Pendientes de configuración del negocio (los arma cada app) + verificar identidad. Solo para negocios.
create or replace function public.cfx_guia() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare y jsonb := public.cfx_yo(); l jsonb;
begin
  if y is null or (y ->> 'id') is null then raise exception 'Inicia sesión'; end if;
  if y ->> 'rol' <> 'negocio' then return jsonb_build_object('items', '[]'::jsonb, 'sin_leer', public.cfx_chat_sin_leer()); end if;
  l := coalesce(public.cfx_guia_app(), '[]'::jsonb);
  -- Sin guía propia (Centro de Mando): nada que mostrar.
  if jsonb_array_length(l) > 0 and not exists (select 1 from jsonb_array_elements(l) e where e ->> 'k' = 'verificar') then l := l || jsonb_build_array(jsonb_build_object('k', 'verificar', 't', 'Verifica tu identidad',
    'd', 'Tus clientes confían más en un negocio verificado. Toma 2 minutos.',
    'ok', exists (select 1 from public.cfx_verificaciones v where v.cuenta = (y ->> 'id')::uuid and v.estado = 'aprobada'), 'ir', 'verificar')); end if;
  return jsonb_build_object('items', l, 'sin_leer', public.cfx_chat_sin_leer());
end $$;

revoke all on function public.cfx_al_cm(text, text, text) from public, anon, authenticated;
revoke all on function public.cfx_cm_vincular(text, text, text, text), public.cfx_cm_estado(), public.cfx_chat_mio(), public.cfx_chat_sin_leer(), public.cfx_chat_enviar(text),
  public.cfx_chat_bandeja(), public.cfx_chat_hilo(uuid), public.cfx_chat_responder(uuid, text), public.cfx_guia() from public, anon;
grant execute on function public.cfx_cm_vincular(text, text, text, text), public.cfx_cm_estado(), public.cfx_chat_mio(), public.cfx_chat_sin_leer(), public.cfx_chat_enviar(text),
  public.cfx_chat_bandeja(), public.cfx_chat_hilo(uuid), public.cfx_chat_responder(uuid, text), public.cfx_guia() to authenticated;
revoke all on function public.cfx_guia_app() from public, anon, authenticated;
-- ---------------------------------------------------------------------
-- CodeFix · Inventario (igual en las 6 apps; lo usa el Centro de Mando → Apps → Respaldo y limpieza).
--   Muestra las tablas que esta versión ya NO usa (restos de versiones antiguas) con cuántas filas tienen.
--   Nada se borra solo: las vacías se borran con un toque; las que tienen datos piden descargar el respaldo y escribir "sí".
--   cfx_tablas() = las tablas que crea este archivo (la revisa pruebas/inventario.py --verificar).
-- ---------------------------------------------------------------------
create or replace function public.cfx_tablas() returns text[] language sql immutable as $$ select array['public.actualizaciones', 'public.app_secrets', 'public.app_settings', 'public.auditoria', 'public.avisos', 'public.barberias', 'public.blocks', 'public.bloqueos', 'public.caja', 'public.calificaciones', 'public.cfx_chat', 'public.cfx_config', 'public.cfx_cupones', 'public.cfx_exentos', 'public.cfx_keys', 'public.cfx_pagos', 'public.cfx_registro', 'public.cfx_verificaciones', 'public.licenses', 'public.lista_espera', 'public.lista_negra', 'public.messages', 'public.ofertas', 'public.pagos', 'public.planes', 'public.planes_info', 'public.profiles', 'public.push_subscriptions', 'public.reports', 'public.requests', 'public.reservas', 'public.servicios', 'public.textos', 'public.user_invites'] $$;
create or replace function public.cfx_inventario() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; n bigint; out jsonb := '[]'::jsonb;
begin
  perform public.cfx_es_admin();
  for r in select s.nspname || '.' || c.relname as t, pg_total_relation_size(c.oid) as b from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname in ('public', 'privado') and c.relkind in ('r', 'p') and not (s.nspname || '.' || c.relname = any (public.cfx_tablas()))
           and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') order by 1
  loop
    execute 'select count(*) from ' || r.t into n;
    out := out || jsonb_build_object('tabla', r.t, 'filas', n, 'bytes', r.b);
  end loop;
  return out;
end $$;
create or replace function public.cfx_inventario_datos(p_tabla text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j jsonb;
begin
  perform public.cfx_es_admin();
  if not exists (select 1 from jsonb_array_elements(public.cfx_inventario()) x where x ->> 'tabla' = p_tabla) then raise exception 'Esa tabla no está en la lista de sobrantes'; end if;
  execute 'select coalesce(jsonb_agg(to_jsonb(t)), ''[]'') from (select * from ' || p_tabla || ' limit 20000) t' into j;
  return j;
end $$;
create or replace function public.cfx_inventario_borrar(p_tabla text, p_confirmacion text default '') returns text
language plpgsql security definer set search_path = '' as $$
declare x jsonb;
begin
  perform public.cfx_es_admin();
  select e into x from jsonb_array_elements(public.cfx_inventario()) e where e ->> 'tabla' = p_tabla;
  if x is null then raise exception 'Esa tabla no está en la lista de sobrantes'; end if;
  if (x ->> 'filas')::bigint > 0 and lower(trim(coalesce(p_confirmacion, ''))) not in ('sí', 'si') then
    raise exception 'La tabla tiene % filas: descarga el respaldo y escribe "sí" para borrarla', x ->> 'filas';
  end if;
  execute 'drop table ' || p_tabla || ' cascade';
  return p_tabla || ' borrada';
end $$;
revoke all on function public.cfx_tablas(), public.cfx_inventario(), public.cfx_inventario_datos(text), public.cfx_inventario_borrar(text, text) from public, anon;
grant execute on function public.cfx_inventario(), public.cfx_inventario_datos(text), public.cfx_inventario_borrar(text, text) to authenticated;
-- <<< CFX núcleo

-- Instalación nueva (sin versión liberada aún): queda liberada la de este archivo.
insert into public.app_settings (key, value) values ('version_liberada', public.db_version()) on conflict (key) do nothing;

-- =====================================================================
-- Actualización automática (núcleo CodeFix): cada 10 minutos la base revisa GitHub (rama main).
--   · Si hay una base nueva (version.json), descarga y ejecuta este mismo instalar.sql (no borra datos).
--   · La app la liberas tú cuando la pruebes (Admin → Versión → Liberar, o desde el Centro de Mando).
--   Si algo falla no cambia nada y lo reintenta en la siguiente vuelta. Hay que correr este archivo UNA vez.
-- =====================================================================
create or replace function public.auto_actualizar() returns text
language plpgsql security definer set search_path = '' as $f$
declare
  base constant text := 'https://raw.githubusercontent.com/CodeFixService/Barberia/main/';
  marca text := '?t=' || extract(epoch from now())::bigint; j jsonb; v_bd text; v_app text; codigo text; lib text;
  re constant text := '^[0-9]+(\.[0-9]+)*$';
begin
  execute 'select content from extensions.http_get($1)' into codigo using base || 'version.json' || marca;
  j := codigo::jsonb; v_bd := j ->> 'version'; v_app := j ->> 'version';
  if v_bd ~ re and coalesce((public.db_version())::text, '0') ~ re and string_to_array(v_bd, '.')::int[] > string_to_array(coalesce((public.db_version())::text, '0'), '.')::int[] then
    execute 'select content from extensions.http_get($1)' into codigo using base || 'supabase/instalar.sql' || marca;
    if codigo is null or length(codigo) < 1000 then return 'instalar.sql no disponible'; end if;
    execute codigo;
    return 'base actualizada a ' || (public.db_version())::text;
  end if;
  return 'al día';
exception when others then
  return 'sin cambios: ' || sqlerrm;
end $f$;
revoke execute on function public.auto_actualizar() from public, anon, authenticated;
do $$
begin
  create extension if not exists http with schema extensions;
  perform cron.unschedule(jobid) from cron.job where jobname = 'cfx-auto';
  perform cron.schedule('cfx-auto', '*/10 * * * *', 'select public.auto_actualizar()');
exception when others then
  raise notice 'Actualización automática no activada (%). Activa pg_cron en Supabase y vuelve a correr este archivo.', sqlerrm;
end $$;

select 'Barbería instalada ✅ versión ' || public.db_version() ||
       ' · liberada y avisada a ' || coalesce((select avisados from public.actualizaciones where version = public.db_version()
                                               order by created_at desc limit 1), 0) || ' persona(s)' as resultado;
