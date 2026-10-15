-- Prueba de punta a punta del servidor (PostgreSQL local con stub.sql + instalar.sql).
-- Uso: psql -v ON_ERROR_STOP=1 -f stub.sql -f ../instalar.sql -f prueba.sql
\set QUIET on
set client_min_messages = warning;

-- Ayudantes de la prueba
create or replace function pg_temp.como(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce((select id::text from auth.users where email = p_email), ''), false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.crear(p_caller text, p_email text, p_nombre text, p_rol text, p_barberia text default null)
returns uuid language plpgsql as $$
declare r jsonb; nid uuid;
begin
  r := public.preparar_invitacion((select id from auth.users where email = p_caller), p_email, p_nombre, p_rol, '+56911111111', p_barberia);
  if not (r ->> 'ok')::boolean then raise exception 'preparar_invitacion: %', r ->> 'error'; end if;
  insert into auth.users (email) values (p_email) returning id into nid;
  perform public.cuenta_creada(nid);
  return nid;
end $$;
create or replace function pg_temp.debe_fallar(p_sql text, p_texto text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not ilike '%' || p_texto || '%' then raise exception 'Falló con otro error: % (esperaba %)', sqlerrm, p_texto; end if;
    raise notice 'OK (rechazado): %', sqlerrm;
    return;
  end;
  raise exception 'Debió fallar: %', p_sql;
end $$;
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(c, false) then raise exception 'FALLO: %', msg; end if;
  raise notice 'OK: %', msg;
end $$;

-- Consultas de la prueba que leen tablas directo (como el servidor, saltando las reglas).
create schema if not exists prueba;
create or replace function prueba.id(p_email text) returns uuid language sql security definer stable as $$
  select id from public.profiles where email = p_email $$;
create or replace function prueba.serv(p_nombre text) returns uuid language sql security definer stable as $$
  select id from public.servicios where nombre = p_nombre $$;
create or replace function prueba.si(p_sql text) returns boolean language plpgsql security definer as $$
declare r boolean; begin execute 'select (' || p_sql || ')' into r; return r; end $$;
grant usage on schema prueba to anon, authenticated;
create or replace function prueba.cod() returns text language sql security definer stable as $$ select codigo from public.barberias limit 1 $$;
create or replace function prueba.tok(p text) returns setof public.reservas language sql security definer stable as $$ select * from public.reservas where token = p $$;
grant execute on all functions in schema prueba to anon, authenticated;
set client_min_messages = notice;
\pset tuples_only on
\o /dev/null

-- 1. Cuentas
insert into auth.users (email) values ('juanjosuecastilloloyola@gmail.com');
select pg_temp.crear('juanjosuecastilloloyola@gmail.com', 'dueno@test.cl', 'Juan Dueño', 'owner', 'Barbería Test');
select pg_temp.ok((select plan = 'premium' and premium_until > now() + interval '29 days' from public.profiles where email = 'dueno@test.cl')
  and exists (select 1 from public.licenses where origen = 'regalo'), 'la barbería parte con 30 días de Premium de regalo (queda en el historial)');
update public.profiles set plan = 'free', premium_until = null where email = 'dueno@test.cl';
select pg_temp.crear('dueno@test.cl', 'pedro@test.cl', 'Pedro', 'barber');
select pg_temp.crear('dueno@test.cl', 'ana@test.cl', 'Ana', 'client');
select pg_temp.crear('dueno@test.cl', 'beto@test.cl', 'Beto', 'client');
select pg_temp.ok((select agenda_abierta = false from public.profiles where email = 'dueno@test.cl'), 'al crear el 1er barbero la agenda del dueño se cierra');
-- v1.1: un barbero también crea clientes (de toda la barbería), salvo que el dueño lo desactive.
select pg_temp.crear('pedro@test.cl', 'x@test.cl', 'Xavi', 'client');
select pg_temp.ok((select barberia_id = (select barberia_id from public.profiles where email = 'dueno@test.cl') from public.profiles where email = 'x@test.cl'), 'el cliente creado por un barbero queda en la barbería');
select pg_temp.debe_fallar($$select pg_temp.crear('pedro@test.cl', 'y2@test.cl', 'Y', 'barber')$$, 'Solo puedes crear clientes');
update public.barberias set barberos_crean_clientes = false;
select pg_temp.debe_fallar($$select pg_temp.crear('pedro@test.cl', 'z@test.cl', 'Z', 'client')$$, 'no tiene activado');
update public.barberias set barberos_crean_clientes = true;
select pg_temp.debe_fallar($$select pg_temp.crear('dueno@test.cl', 'y@test.cl', 'Y', 'owner')$$, 'Solo puedes crear');
select pg_temp.crear('dueno@test.cl', 'b2@test.cl', 'Barbero 2', 'barber');
select pg_temp.debe_fallar($$select pg_temp.crear('dueno@test.cl', 'b3@test.cl', 'Barbero 3', 'barber')$$, 'máximo de 3 barberos');

-- 2. Configuración del dueño
select pg_temp.como('dueno@test.cl');
select public.guardar_barberia(jsonb_build_object('abono', 4000, 'datos_transferencia', 'Banco X', 'horario',
  '[{"e":"a","i":"08:00","f":"22:00"},{"e":"a","i":"08:00","f":"22:00"},{"e":"a","i":"08:00","f":"22:00"},{"e":"a","i":"08:00","f":"22:00"},{"e":"a","i":"08:00","f":"22:00"},{"e":"c","i":"08:00","f":"22:00"},{"e":"c","i":"08:00","f":"22:00"}]'::jsonb));
select public.guardar_servicio('{"nombre":"Corte","precio":10000,"duracion":30}');
select public.guardar_servicio('{"nombre":"Barba","precio":7000,"duracion":15}');
select pg_temp.debe_fallar($$select public.guardar_barberia('{"color":"#ff0000"}')$$, 'Premium');
select pg_temp.debe_fallar($$select public.guardar_barberia('{"horario":[1,2]}')$$, 'Horario no válido');
reset role;

-- Horas de prueba: pasado mañana a las 12:00 (hora Chile) y un día de semana / fin de semana.
create temp table t as
select (((now() at time zone 'America/Santiago')::date + 2)::timestamp + interval '12 hours') at time zone 'America/Santiago' as h1,
       (((now() at time zone 'America/Santiago')::date + 3)::timestamp + interval '12 hours') at time zone 'America/Santiago' as h2,
       (((now() at time zone 'America/Santiago')::date + 2)::timestamp + interval '23 hours') at time zone 'America/Santiago' as fuera;
grant select on t to authenticated, anon;

-- v1.1: cada barbero abre/cierra su agenda; el dueño puede cambiar la de otros; un barbero no la de otro.
select pg_temp.como('pedro@test.cl');
select public.set_agenda_abierta(false);
select pg_temp.debe_fallar($$select public.set_agenda_abierta(true, prueba.id('b2@test.cl'))$$, 'Solo el dueño');
reset role;
select pg_temp.como('ana@test.cl');
select pg_temp.debe_fallar($$select public.reservar(prueba.id('pedro@test.cl'), (select h1 from t), array[prueba.serv('Corte')])$$, 'agenda abierta');
reset role;
select pg_temp.como('dueno@test.cl');
select public.set_agenda_abierta(true, prueba.id('pedro@test.cl'));
reset role;
select pg_temp.ok((select agenda_abierta from public.profiles where email = 'pedro@test.cl'), 'el dueño abrió la agenda de Pedro');

-- 3. Reservar (Ana) con abono y comprobante → "en revisión" (el reloj se detiene)
select pg_temp.como('ana@test.cl');
select pg_temp.ok(jsonb_array_length(public.ver_barberia() -> 'servicios') = 2, 'el cliente ve 2 servicios');
select pg_temp.ok((select count(*) from jsonb_array_elements(public.ver_barberia() -> 'barberos') x where (x ->> 'reservable')::boolean) = 2,
  'reservables: 2 barberos (el dueño tiene la agenda cerrada)');
create temp table r1 as select public.reservar(prueba.id('pedro@test.cl'), (select h1 from t),
  array[prueba.serv('Corte')]) as r;
select pg_temp.ok((select r ->> 'estado' = 'esperando_abono' and (r ->> 'expira_at')::timestamptz between now() + interval '9 minutes' and now() + interval '11 minutes' from r1),
  'queda esperando abono 10 minutos (Reglas)');
select pg_temp.debe_fallar($$select public.reservar(prueba.id('pedro@test.cl'), (select h2 from t), array[prueba.serv('Corte')])$$, 'hora(s) activa(s)');
select pg_temp.debe_fallar($$select public.reservar(prueba.id('dueno@test.cl'), (select h2 from t), array[prueba.serv('Corte')])$$, 'agenda abierta');
select pg_temp.debe_fallar($$select public.ya_abone((select (r ->> 'id')::uuid from r1), 'hola')$$, 'comprobante');
select public.ya_abone((select (r ->> 'id')::uuid from r1), 'data:image/jpeg;base64,AAAA');
select pg_temp.ok(prueba.si($q$(select estado = 'en_revision' and expira_at is null from public.reservas where id = (select (r ->> 'id')::uuid from r1))$q$), 'con comprobante queda en revisión (el reloj se detiene)');
select pg_temp.ok((select (x ->> 'politica') = 'devolucion' from jsonb_array_elements(public.mis_horas()) x limit 1), 'en los primeros 10 min: si anula, se devuelve');
reset role;
select pg_temp.ok((select count(*) = 2 from public.avisos where reserva_id = (select (r ->> 'id')::uuid from r1)), 'avisos al barbero y al dueño');
select pg_temp.ok((select count(*) = 1 from public.messages where sistema and imagen is not null), 'el comprobante llega al chat del barbero');
update public.reservas set expira_at = now() - interval '1 hour' where id = (select (r ->> 'id')::uuid from r1);
select public.tick();
select pg_temp.ok(prueba.si($q$(select estado = 'en_revision' from public.reservas where id = (select (r ->> 'id')::uuid from r1))$q$), 'en revisión NO se libera sola');

-- 4. Beto no puede tomar la misma hora y no ve datos de Ana
select pg_temp.como('beto@test.cl');
select pg_temp.debe_fallar($$select public.reservar(prueba.id('pedro@test.cl'), (select h1 from t) + interval '15 minutes', array[prueba.serv('Corte')])$$, 'acaba de ocupar');
select pg_temp.ok((select x ->> 'estado' = 'ocupado' and x -> 'cliente' is null
  from jsonb_array_elements(public.ocupacion(current_date, current_date + 5) -> 'reservas') x limit 1), 'otro cliente solo ve "ocupado"');
select pg_temp.debe_fallar($$select public.reservar(prueba.id('pedro@test.cl'), (select fuera from t), array[prueba.serv('Corte')])$$, 'Fuera del horario');
select pg_temp.debe_fallar($$select public.ver_comprobante((select (r ->> 'id')::uuid from r1))$$, 'Sin permiso');
select pg_temp.debe_fallar($$select public.confirmar_hora((select (r ->> 'id')::uuid from r1))$$, 'Sin permiso');
reset role;

-- 5. Pedro aprueba (un solo paso: queda agendada); otro barbero no puede
select pg_temp.como('b2@test.cl');
select pg_temp.debe_fallar($$select public.confirmar_hora((select (r ->> 'id')::uuid from r1))$$, 'Sin permiso');
select pg_temp.ok((select x -> 'cliente' is null from jsonb_array_elements(public.ocupacion(current_date, current_date + 5) -> 'reservas') x
  where x ->> 'barbero_id' = prueba.id('pedro@test.cl')::text), 'otro barbero ve la hora de Pedro sin datos');
reset role;
select pg_temp.como('pedro@test.cl');
select pg_temp.ok((select (x ->> 'total') is null and (x ->> 'abono') is null and (x ->> 'cliente') = 'Ana'
  from jsonb_array_elements(public.ocupacion(current_date, current_date + 5) -> 'reservas') x where x ->> 'estado' = 'en_revision'), 'el barbero ve la hora sin montos');
select pg_temp.ok((select bool_and(jsonb_typeof(x -> 'precio') = 'null') from jsonb_array_elements(public.ver_barberia() -> 'servicios') x), 'el barbero no ve precios');
select pg_temp.ok(public.mi_cuenta() -> 'barberia' -> 'link_pago' is null or jsonb_typeof(public.mi_cuenta() -> 'barberia' -> 'link_pago') = 'null', 'el barbero no ve el link de pago');
select pg_temp.ok(public.ver_comprobante((select (r ->> 'id')::uuid from r1)) like 'data:image%', 'el barbero ve el comprobante');
select (public.resumen() ->> 'pendientes')::int as pend \gset
select pg_temp.ok(:pend = 1, 'contador: 1 abono por revisar');
select public.confirmar_hora((select (r ->> 'id')::uuid from r1));
select pg_temp.ok(prueba.si($q$(select estado = 'agendada' and confirmada_at is not null from public.reservas where id = (select (r ->> 'id')::uuid from r1))$q$), 'aprobada: queda agendada');
select pg_temp.debe_fallar($$select public.confirmar_hora((select (r ->> 'id')::uuid from r1))$$, 'no está pendiente');
reset role;

-- 6. Ana vio el aviso; reagenda con +24 h; anula con tiempo → saldo a favor
select pg_temp.como('ana@test.cl');
select pg_temp.ok(jsonb_array_length(public.mis_avisos()) >= 1, 'Ana tiene avisos en la campanita');
select public.marcar_vistos(null);
select pg_temp.ok((select (x ->> 'estado') = 'agendada' and (x ->> 'reagendable')::boolean from jsonb_array_elements(public.mis_horas()) x limit 1), 'Ana ve su hora agendada y puede reagendar');
select public.reagendar_mia((select (r ->> 'id')::uuid from r1), (select h1 from t) + interval '1 hour');
select pg_temp.ok(prueba.si($q$(select reagendada = 1 and estado = 'agendada' from public.reservas where id = (select (r ->> 'id')::uuid from r1))$q$), 'reagendó a otra hora');
reset role;
update public.reservas set comprobante_at = now() - interval '1 hour' where id = (select (r ->> 'id')::uuid from r1);
select pg_temp.como('ana@test.cl');
select pg_temp.ok((public.anular_mia((select (r ->> 'id')::uuid from r1)) ->> 'abono_destino') = 'saldo', 'anuló con +24 h: abono a favor');
reset role;
select pg_temp.ok((select saldo = 4000 from public.profiles where email = 'ana@test.cl'), 'saldo de Ana: 4000');
select pg_temp.como('pedro@test.cl');
select pg_temp.ok((select bool_or(x ->> 'visto_at' is not null) from jsonb_array_elements(public.avisos_de_reserva((select (r ->> 'id')::uuid from r1))) x),
  'el barbero ve que Ana vio la confirmación');
reset role;

-- 7. Reservar con saldo a favor (sin pagar de nuevo)
select pg_temp.como('ana@test.cl');
create temp table r3 as select public.reservar(prueba.id('pedro@test.cl'), (select h2 from t),
  array[prueba.serv('Corte'), prueba.serv('Barba')]) as r;
select pg_temp.ok((select r ->> 'estado' = 'agendada' and r ->> 'pagado_con' = 'saldo' and (r ->> 'total')::int = 17000 from r3), 'con saldo queda agendada al tiro');
reset role;
select pg_temp.ok((select saldo = 0 from public.profiles where email = 'ana@test.cl'), 'se usó el saldo');
select pg_temp.ok((select fin - inicio = interval '45 minutes' from public.reservas where id = (select (r ->> 'id')::uuid from r3)), 'duración = suma de servicios');

-- 8. Anular tarde → pierde el abono; dentro de los primeros minutos → devolución
update public.reservas set created_at = now() - interval '3 days', inicio = now() + interval '5 hours', fin = now() + interval '5 hours 45 minutes'
  where id = (select (r ->> 'id')::uuid from r3);
select pg_temp.como('ana@test.cl');
select pg_temp.ok((select public.anular_mia((select (r ->> 'id')::uuid from r3)) ->> 'abono_destino' = 'perdido'), 'anuló con menos de 24 h: pierde el abono');
reset role;
insert into public.reservas (barberia_id, barbero_id, cliente_id, inicio, fin, total, abono, pagado_con, estado, created_at, comprobante_at)
select barberia_id, prueba.id('pedro@test.cl'), id, now() + interval '3 hours', now() + interval '3 hours 30 minutes',
       10000, 4000, 'transferencia', 'agendada', now() - interval '3 minutes', now() - interval '3 minutes' from public.profiles where email = 'ana@test.cl'
returning id as r4 \gset
select pg_temp.como('ana@test.cl');
select pg_temp.ok((select public.anular_mia(:'r4') ->> 'abono_destino' = 'devolucion'), 'anuló en los primeros 10 min: devolución');
reset role;
select pg_temp.ok(prueba.si($q$(select devolucion = 'pendiente' from public.reservas where abono_destino = 'devolucion')$q$), 'devolución pendiente para el dueño');
select pg_temp.como('pedro@test.cl');
select pg_temp.debe_fallar(format('select public.marcar_devuelto(%L)', :'r4'), 'Solo el dueño');
reset role;
select pg_temp.como('dueno@test.cl');
select (public.resumen() ->> 'pendientes')::int as pend \gset
select pg_temp.ok(:pend >= 1, 'al dueño le cuenta la devolución pendiente');
select public.marcar_devuelto(:'r4');
reset role;
select pg_temp.ok(prueba.si($q$(select devolucion = 'devuelta' from public.reservas where abono_destino = 'devolucion')$q$), 'el dueño marcó devuelto');

-- 8b. v2.0: reserva SIN cuenta desde el link o QR (nombre + WhatsApp)
set role anon;
select pg_temp.ok((public.vista_publica(prueba.cod()) ->> 'nombre') = 'Barbería Test' and jsonb_array_length(public.vista_publica(prueba.cod()) -> 'servicios') = 2,
  'la vista libre muestra la barbería y sus servicios sin cuenta');
select pg_temp.ok((public.vista_publica(prueba.cod()) ->> 'recibe')::boolean, 'recibe reservas (tiene datos de transferencia)');
select pg_temp.debe_fallar($$select public.reservar_invitado(prueba.cod(), prueba.id('b2@test.cl'), (select h1 from t), array[prueba.serv('Corte')], 'Carlos', '123')$$, 'WhatsApp');
create temp table g1 as select public.reservar_invitado(prueba.cod(), prueba.id('b2@test.cl'), (select h1 from t), array[prueba.serv('Corte')], 'Carlos Invitado', '+56 9 8765 4321') as r;
grant select on g1 to authenticated;
select pg_temp.ok((select r ->> 'estado' = 'esperando_abono' and length(r ->> 'token') >= 30 from g1), 'el invitado queda esperando abono con su link personal');
select pg_temp.debe_fallar($$select public.reservar_invitado(prueba.cod(), prueba.id('b2@test.cl'), (select h2 from t), array[prueba.serv('Corte')], 'Carlos', '987654321')$$, 'esperando el abono');
select pg_temp.ok((select (x ->> 'estado') = 'ocupado' and x -> 'cliente' is null from jsonb_array_elements(public.ocupacion_publica(prueba.cod(), current_date, current_date + 5) -> 'reservas') x
  where x ->> 'barbero_id' = prueba.id('b2@test.cl')::text limit 1), 'la vista libre ve "ocupado" sin nombres');
select pg_temp.ok((public.reserva_ver((select r ->> 'token' from g1)) ->> 'estado') = 'esperando_abono', 'el link personal muestra el estado');
select pg_temp.ok(public.reserva_ver('x') is null, 'un link falso no muestra nada');
select pg_temp.debe_fallar($$select public.reserva_comprobante((select r ->> 'token' from g1), 'nada')$$, 'comprobante');
select pg_temp.ok((public.reserva_comprobante((select r ->> 'token' from g1), 'data:image/jpeg;base64,BBBB', 'link') ->> 'estado') = 'en_revision', 'el invitado sube el comprobante: en revisión');
select pg_temp.debe_fallar($$select * from public.reservas$$, 'permission denied');
select pg_temp.debe_fallar($$select public.reserva_por_token((select r ->> 'token' from g1))$$, 'permission denied');
reset role;
select pg_temp.ok((select count(*) = 2 from public.avisos a join public.reservas r on r.id = a.reserva_id where r.token = (select r ->> 'token' from g1)), 'al barbero y al dueño les llega el push del comprobante');
select pg_temp.como('b2@test.cl');
select pg_temp.debe_fallar($$select public.rechazar_hora((select id from prueba.tok((select r ->> 'token' from g1))))$$, 'motivo');
select public.confirmar_hora((select id from prueba.tok((select r ->> 'token' from g1))));
reset role;
set role anon;
select pg_temp.ok((public.reserva_ver((select r ->> 'token' from g1)) ->> 'estado') = 'agendada', 'el invitado ve su hora agendada');
select pg_temp.ok((public.reserva_ver((select r ->> 'token' from g1)) ->> 'reagendable')::boolean, 'el invitado puede reagendar (falta +24 h)');
select pg_temp.ok((public.reserva_reagendar((select r ->> 'token' from g1), (select h1 from t) + interval '2 hours') ->> 'reagendada')::int = 1, 'el invitado reagendó desde su link');
select pg_temp.ok((public.reserva_cancelar((select r ->> 'token' from g1)) ->> 'abono_destino') = 'saldo', 'el invitado cancela con +24 h: saldo a favor en su link');
select pg_temp.ok((public.reserva_ver((select r ->> 'token' from g1)) ->> 'reagendable')::boolean, 'con saldo vigente puede volver a reagendar');
select pg_temp.ok((public.reserva_reagendar((select r ->> 'token' from g1), (select h1 from t) + interval '3 hours') ->> 'estado') = 'agendada', 'reagendó usando su saldo');
reset role;
-- Atendido → se califican mutuamente; con 2 estrellas queda en la lista negra
update public.reservas set inicio = now() - interval '2 hours', fin = now() - interval '90 minutes' where token = (select r ->> 'token' from g1);
select pg_temp.como('b2@test.cl');
select public.marcar_hora((select id from prueba.tok((select r ->> 'token' from g1))), 'atendida');
select pg_temp.debe_fallar($$select public.calificar_cliente((select id from prueba.tok((select r ->> 'token' from g1))), 9)$$, '1 a 5');
select public.calificar_cliente((select id from prueba.tok((select r ->> 'token' from g1))), 2, 'Llegó tarde', 'Media hora tarde');
select pg_temp.debe_fallar($$select public.calificar_cliente((select id from prueba.tok((select r ->> 'token' from g1))), 5)$$, 'Ya calificaste');
select pg_temp.ok(jsonb_array_length(public.ver_lista_negra()) = 1, 'el cliente con 2 estrellas quedó en la lista negra (la ven todos los barberos)');
select pg_temp.ok((select (x -> 'lista_negra') is not null and x ->> 'invitado' = 'true' from jsonb_array_elements(public.mis_clientes()) x where x ->> 'telefono' = '987654321'), 'aparece como invitado en Clientes, marcado');
reset role;
set role anon;
select pg_temp.ok((public.reserva_calificar((select r ->> 'token' from g1), 4, 'Buen corte') ->> 'calificada')::boolean, 'el invitado califica a la barbería');
select pg_temp.ok((public.vista_publica(prueba.cod()) -> 'calificacion' ->> 'promedio')::numeric = 4, 'todos ven el promedio de la barbería');
-- Vuelve a reservar sin cuenta: la barbería ve la alerta de lista negra
create temp table g2 as select public.reservar_invitado(prueba.cod(), prueba.id('b2@test.cl'), (select h2 from t), array[prueba.serv('Barba')], 'Carlos', '987654321') as r;
grant select on g2 to authenticated;
select public.reserva_comprobante((select r ->> 'token' from g2), 'data:image/png;base64,CCCC');
reset role;
select pg_temp.ok((select bool_or(a.cuerpo like '%LISTA NEGRA%') from public.avisos a join public.reservas r on r.id = a.reserva_id where r.token = (select r ->> 'token' from g2)), 'el aviso al barbero dice LISTA NEGRA');
select pg_temp.como('dueno@test.cl');
select pg_temp.ok((select x -> 'lista_negra' is not null from jsonb_array_elements(public.ocupacion(current_date, current_date + 5) -> 'reservas') x
  where x ->> 'id' = (select id::text from prueba.tok((select r ->> 'token' from g2)))), 'en la agenda la hora sale con la alerta');
select public.quitar_lista_negra((select (x ->> 'id')::uuid from jsonb_array_elements(public.ver_lista_negra()) x limit 1));
select pg_temp.ok(jsonb_array_length(public.ver_lista_negra()) = 0, 'el dueño lo sacó de la lista negra');
reset role;
-- Recordatorios de revisión y 24 h después de la hora sin revisar → saldo a favor
update public.reservas set comprobante_at = now() - interval '20 minutes' where token = (select r ->> 'token' from g2);
select public.tick();
select pg_temp.ok(prueba.si($q$(select revision_paso = 1 from public.reservas where token = (select r ->> 'token' from g2))$q$), 'a los 15 min se le recuerda al barbero');
update public.reservas set comprobante_at = now() - interval '40 minutes' where token = (select r ->> 'token' from g2);
select public.tick();
select pg_temp.ok(prueba.si($q$(select revision_paso = 2 from public.reservas where token = (select r ->> 'token' from g2))$q$), 'a los 30 min se le avisa al dueño');
update public.reservas set inicio = now() - interval '25 hours', fin = now() - interval '24 hours 45 minutes' where token = (select r ->> 'token' from g2);
select public.tick();
select pg_temp.ok(prueba.si($q$(select estado = 'anulada' and abono_destino = 'saldo' and saldo_hasta > now() from public.reservas where token = (select r ->> 'token' from g2))$q$),
  '24 h después de la hora sin revisar: el abono queda a favor del cliente');
-- Se crea la cuenta desde el link con el mismo WhatsApp: sus horas pasan a su cuenta
insert into auth.users (email, raw_user_meta_data) values ('carlos@test.cl', jsonb_build_object('rol', 'cliente', 'barberia', prueba.cod(), 'nombre', 'Carlos', 'telefono', '+56987654321'));
select pg_temp.ok(prueba.si($q$(select role = 'client' and barberia_id is not null from public.profiles where email = 'carlos@test.cl')$q$), 'el cliente se creó su cuenta desde el link');
select pg_temp.ok(prueba.si($q$(select count(*) = 2 from public.reservas where cliente_id = prueba.id('carlos@test.cl'))$q$), 'sus reservas sin cuenta pasaron a su cuenta');
select pg_temp.ok(prueba.si($q$(select count(*) = 2 from public.calificaciones where cliente_id = prueba.id('carlos@test.cl'))$q$), 'y sus calificaciones también');
select pg_temp.debe_fallar($$insert into auth.users (email, raw_user_meta_data) values ('malo@test.cl', '{"rol":"cliente","barberia":"noexiste","nombre":"X","telefono":"912345678"}')$$, 'no está recibiendo');
select pg_temp.debe_fallar($$insert into auth.users (email) values ('nadie@test.cl')$$, 'registro está cerrado');

-- 9. Chat: 3 seguidos hasta que respondan; el barbero sin límite
select pg_temp.como('ana@test.cl');
select public.enviar_mensaje(prueba.id('pedro@test.cl'), 'hola 1');
select public.enviar_mensaje(prueba.id('pedro@test.cl'), 'hola 2');
select public.enviar_mensaje(prueba.id('pedro@test.cl'), 'hola 3');
select pg_temp.debe_fallar($$select public.enviar_mensaje(prueba.id('pedro@test.cl'), 'hola 4')$$, 'mensajes seguidos');
select pg_temp.debe_fallar($$select public.enviar_mensaje(prueba.id('beto@test.cl'), 'hola')$$, 'No puedes');
select pg_temp.debe_fallar($$select public.enviar_mensaje(prueba.id('juanjosuecastilloloyola@gmail.com'), 'hola')$$, 'No puedes');
reset role;
select pg_temp.como('pedro@test.cl');
select public.resumen();
select pg_temp.ok(prueba.si($q$(select count(*) = 3 from public.messages where delivered_at is not null and not sistema)$q$), 'al abrir la app quedan ✓✓ recibidos');
select pg_temp.ok((select count(*) = 4 from jsonb_array_elements(public.chat_mensajes(prueba.id('ana@test.cl'))) x), 'Pedro lee el chat (con el comprobante)');
select pg_temp.ok(prueba.si($q$(select count(*) = 4 from public.messages where read_at is not null)$q$), 'quedan ✓✓ vistos');
select public.enviar_mensaje(prueba.id('ana@test.cl'), 'r' || g) from generate_series(1, 5) g;
select pg_temp.ok(public.chat_restantes(prueba.id('ana@test.cl')) is null, 'barbero → cliente: sin límite');
select public.enviar_mensaje(prueba.id('b2@test.cl'), 'x' || g) from generate_series(1, 3) g;
select pg_temp.debe_fallar($$select public.enviar_mensaje(prueba.id('b2@test.cl'), 'x4')$$, 'mensajes seguidos');
reset role;
select pg_temp.como('ana@test.cl');
select pg_temp.ok(public.chat_restantes(prueba.id('pedro@test.cl')) = 3, 'cuando le contestan, vuelve a tener 3');
reset role;

-- 10. Premium: pago con comprobante (aprobado en el panel) y activación directa. Las keys ya no se usan.
select pg_temp.como('juanjosuecastilloloyola@gmail.com');
select pg_temp.ok(public.is_admin(), 'Josué es admin');
select pg_temp.debe_fallar($$select public.admin_crear_key('cliente', 'Ana')$$, 'ya no se usan');
reset role;
select pg_temp.como('ana@test.cl');
select pg_temp.debe_fallar($$select public.premium_pagar('nada')$$, 'comprobante');
select public.premium_pagar('data:image/jpeg;base64,PAGO', 'Transferencia de Ana');
select pg_temp.debe_fallar($$select public.premium_pagar('data:image/jpeg;base64,PAGO')$$, 'en revisión');
select pg_temp.ok((public.mi_pago() ->> 'estado') = 'en_revision' and (public.mi_pago() ->> 'monto')::int = 4900, 'Ana ve su pago en revisión ($4.900)');
select pg_temp.debe_fallar($$select public.admin_pagos('en_revision')$$, 'Solo el administrador');
reset role;
select pg_temp.como('juanjosuecastilloloyola@gmail.com');
select (public.resumen() ->> 'pendientes')::int as pend \gset
select pg_temp.ok(:pend = 1, 'al admin le cuenta 1 pago por revisar');
select pg_temp.ok((select (x ->> 'tiene_comprobante')::boolean from jsonb_array_elements(public.admin_pagos('en_revision')) x), 'el admin ve el pago con comprobante');
select pg_temp.ok(public.admin_pago_comprobante((select (x ->> 'id')::uuid from jsonb_array_elements(public.admin_pagos('en_revision')) x)) like 'data:image%', 'el admin abre el comprobante');
select public.admin_pago_resolver((select (x ->> 'id')::uuid from jsonb_array_elements(public.admin_pagos('en_revision')) x), true);
select pg_temp.ok((public.admin_resumen() ->> 'ingresos_mes')::int = 4900, 'el pago aprobado suma a los ingresos del mes');
reset role;
select pg_temp.como('ana@test.cl');
select pg_temp.ok(public.is_premium(auth.uid()), 'Ana es Premium al aprobarle el pago');
select public.enviar_mensaje(prueba.id('pedro@test.cl'), 'p' || g) from generate_series(1, 5) g;
select pg_temp.ok(true, 'cliente Premium escribe sin límite');
reset role;
select pg_temp.ok((select termino > now() + interval '29 days' and origen = 'pago' from public.licenses where redeemed_by = prueba.id('ana@test.cl')), 'queda en el historial con inicio y término');
select pg_temp.como('beto@test.cl');
select public.premium_pagar('data:image/jpeg;base64,MAL');
reset role;
select pg_temp.como('juanjosuecastilloloyola@gmail.com');
select pg_temp.debe_fallar($$select public.admin_pago_resolver((select (x ->> 'id')::uuid from jsonb_array_elements(public.admin_pagos('en_revision')) x), false)$$, 'motivo');
select public.admin_pago_resolver((select (x ->> 'id')::uuid from jsonb_array_elements(public.admin_pagos('en_revision')) x), false, 'No llegó la transferencia');
select pg_temp.ok(jsonb_array_length(public.admin_pagos('rechazado')) = 1, 'pago rechazado con motivo');
select public.admin_activar(prueba.id('dueno@test.cl'), 1, null);
select pg_temp.ok(prueba.si($q$(select count(*) = 1 from public.licenses where origen = 'directo')$q$), 'la activación directa queda registrada');
select public.admin_dias(prueba.id('beto@test.cl'), 5);
select pg_temp.ok(prueba.si($q$(select premium_until between now() + interval '4 days' and now() + interval '6 days' from public.profiles where email = 'beto@test.cl')$q$), 'el admin regala días');
select pg_temp.ok(jsonb_array_length(public.admin_auditoria()) >= 3, 'registro de cambios del admin');
reset role;
select pg_temp.como('dueno@test.cl');
select pg_temp.debe_fallar($$select public.probar_premium()$$, 'regalo');
reset role;
update public.profiles set plan = 'free', premium_until = null, trial_used = false where email = 'beto@test.cl';
select pg_temp.como('beto@test.cl');
select public.probar_premium();
select pg_temp.debe_fallar($$select public.probar_premium()$$, 'Ya');
reset role;

-- 11. Caja: hora atendida pasa sola a la caja
select pg_temp.como('pedro@test.cl');
create temp table r5 as select public.crear_hora(auth.uid(), now() - interval '1 hour', array[prueba.serv('Corte')],
  prueba.id('beto@test.cl')) as r;
select public.marcar_hora((select (r ->> 'id')::uuid from r5), 'atendida', 'transferencia', 1000);
select pg_temp.ok(jsonb_array_length(public.ver_caja((now() at time zone 'America/Santiago')::date - 1, (now() at time zone 'America/Santiago')::date)) = 1, 'la hora atendida quedó en la caja');
select public.anotar_corte('{"servicio":"Corte sin hora","monto":8000,"medio":"efectivo"}');
select pg_temp.ok(jsonb_array_length(public.ver_caja((now() at time zone 'America/Santiago')::date - 1, (now() at time zone 'America/Santiago')::date)) = 2, 'anotar un corte con 2 datos');
select pg_temp.ok((select bool_and(x -> 'monto' is null) from jsonb_array_elements(public.ver_caja((now() at time zone 'America/Santiago')::date - 1, (now() at time zone 'America/Santiago')::date)) x), 'el barbero ve sus cortes sin montos');
reset role;
select pg_temp.como('dueno@test.cl');
select pg_temp.ok(jsonb_array_length(public.ver_caja(current_date - 30, current_date + 1)) = 3, 'dueño Premium ve la caja de todos');
select pg_temp.ok((select sum((x ->> 'monto')::int) = 20000 and sum((x ->> 'propina')::int) = 0 from jsonb_array_elements(public.ver_caja(current_date - 30, current_date + 1)) x),
  'lo que anota el barbero no lleva montos escritos por él (el precio sale del servicio)');
select pg_temp.ok((public.estadisticas(current_date - 30, current_date + 1) -> 'por_barbero') is not null, 'estadísticas Premium');
select pg_temp.ok((select x ->> 'ultimo_barbero' = 'Pedro' and x ->> 'habitual' = 'Pedro' and x ->> 'creado_por' = 'Juan Dueño'
  from jsonb_array_elements(public.mis_clientes()) x where x ->> 'nombre' = 'Beto'), 'ficha: último barbero, habitual y creado por');
reset role;

-- 12. Liberar horas sin abono
update public.profiles set saldo = 0 where email = 'beto@test.cl';
select pg_temp.como('beto@test.cl');
create temp table r6 as select public.reservar(prueba.id('b2@test.cl'), (select h1 from t),
  array[prueba.serv('Corte')]) as r;
reset role;
update public.reservas set expira_at = now() - interval '1 minute' where id = (select (r ->> 'id')::uuid from r6);
select public.tick();
select pg_temp.ok((select estado = 'anulada' from public.reservas where id = (select (r ->> 'id')::uuid from r6)), 'a los 15 min sin abono se libera sola');

-- 13. Admin
select pg_temp.como('juanjosuecastilloloyola@gmail.com');
select pg_temp.ok((select (x ->> 'ventas')::int = 20000 from jsonb_array_elements(public.admin_barberias()) x), 'el admin ve las ventas de cada barbería');
select pg_temp.ok((public.admin_difundir('Hola', 'Prueba', 'barberias')) = 1, 'aviso a las barberías');
select pg_temp.ok((select (x ->> 'total')::int = 1 from jsonb_array_elements(public.admin_difusiones()) x), 'contador de vistos de la difusión');
reset role;

-- 14. Permisos
set role anon;
select pg_temp.debe_fallar($$select public.ver_barberia()$$, 'permission denied');
select pg_temp.ok(public.barberia_publica(prueba.cod()) ->> 'nombre' = 'Barbería Test', 'el inicio de sesión muestra la barbería');
reset role;
select pg_temp.como('ana@test.cl');
select pg_temp.debe_fallar($$select public.tomar_push()$$, 'permission denied');
select pg_temp.debe_fallar($$select public.admin_resumen()$$, 'Solo el administrador');
select pg_temp.debe_fallar($$select * from public.reservas$$, 'permission denied');
reset role;
select pg_temp.ok(jsonb_array_length(public.tomar_push()) > 0, 'el enviador toma los push pendientes');
select pg_temp.ok(public.puede_restablecer(prueba.id('dueno@test.cl'), prueba.id('ana@test.cl')), 'el dueño puede restablecer la clave de su cliente');
select pg_temp.ok(not public.puede_restablecer(prueba.id('pedro@test.cl'), prueba.id('ana@test.cl')), 'un barbero no');

-- 15. v1.3: colores, conexión y limpiar la campanita
update public.profiles set plan = 'free', premium_until = null where email = 'beto@test.cl';
select pg_temp.como('beto@test.cl');
select pg_temp.debe_fallar($$select public.guardar_perfil('{"color":"#123456"}')$$, 'Premium');
select public.guardar_perfil('{"color":"#1d4ed8"}');
select pg_temp.debe_fallar($$select public.guardar_perfil('{"color":"rojo"}')$$, 'no válido');
reset role;
select pg_temp.como('ana@test.cl');
select public.guardar_perfil('{"color":"#123456"}');
select public.resumen();
select pg_temp.ok(public.ultima_conexion(prueba.id('pedro@test.cl')) is not null, 'veo la última conexión de mi barbero');
select pg_temp.ok(public.ultima_conexion(prueba.id('beto@test.cl')) is null, 'no veo la conexión de otro cliente');
select pg_temp.ok(public.limpiar_avisos() > 0, 'limpiar la campanita');
select pg_temp.ok(jsonb_array_length(public.mis_avisos()) = 0, 'la campanita queda vacía');
reset role;
select pg_temp.ok(prueba.si($q$(select count(*) > 0 from public.avisos where para = prueba.id('ana@test.cl') and oculto and visto_at is not null)$q$), 'los avisos quedan ocultos y vistos (quien los envió conserva el ✓✓)');
select pg_temp.ok(prueba.si($q$(select last_seen > now() - interval '1 minute' from public.profiles where email = 'ana@test.cl')$q$), 'la conexión se actualiza mientras la app está abierta');

-- 16. Links de pago (con texto) y planes editables
select pg_temp.como('dueno@test.cl');
select public.guardar_barberia('{"pagos":{"activo":1,"p1":{"monto":4000,"link":"https://mpago.la/a","texto":"Abono normal"},"p2":{"monto":8000,"link":"https://mpago.la/b"}}}');
select pg_temp.ok(prueba.si($q$(select abono = 4000 and link_pago = 'https://mpago.la/a' and pago1_texto = 'Abono normal' from public.barberias limit 1)$q$), 'link 1 activo: abono 4000 con su texto');
select public.guardar_barberia('{"pagos":{"activo":2,"p1":{"monto":4000,"link":"https://mpago.la/a"},"p2":{"monto":8000,"link":"https://mpago.la/b"}}}');
select pg_temp.ok(prueba.si($q$(select abono = 8000 and link_pago = 'https://mpago.la/b' and pago1_link = 'https://mpago.la/a' from public.barberias limit 1)$q$), 'activar el link 2 cambia abono y link (el 1 queda guardado)');
select pg_temp.debe_fallar($$select public.guardar_barberia('{"pagos":{"activo":2,"p1":{"monto":4000},"p2":{"monto":"","link":""}}}')$$, 'monto del link 2');
select pg_temp.debe_fallar($$select public.guardar_barberia('{"pagos":{"activo":1,"p1":{"monto":4000,"link":"http://x"}}}')$$, 'https');
select pg_temp.ok((public.mi_cuenta() -> 'barberia' -> 'pagos' ->> 'activo') = '2', 'el dueño ve sus dos links');
reset role;
select pg_temp.como('ana@test.cl');
select pg_temp.ok(coalesce(jsonb_typeof(public.mi_cuenta() -> 'barberia' -> 'pagos'), 'null') = 'null' and (public.mi_cuenta() -> 'barberia' ->> 'abono')::int = 8000, 'el cliente ve solo el abono y link activos');
select pg_temp.debe_fallar($$select public.admin_guardar_planes('{}')$$, 'Solo el administrador');
reset role;
select pg_temp.como('juanjosuecastilloloyola@gmail.com');
select public.admin_guardar_planes('{"barberia":{"clientes":{"free":3,"premium":600},"estadisticas":{"free":1,"premium":1}},"cliente":{"mensajes":{"free":5,"premium":0}},
  "info":{"barberia":{"premium":{"nombre":"Pro","beneficios":["Uno","Dos",""],"duracion_dias":31}}}}');
select pg_temp.ok((public.ajustes_publicos() -> 'planes' -> 'barberia' -> 'clientes' ->> 'free')::int = 3, 'el admin cambia los límites');
select pg_temp.ok((public.ajustes_publicos() -> 'planes_info' -> 'barberia' -> 'premium' ->> 'nombre') = 'Pro'
  and jsonb_array_length(public.ajustes_publicos() -> 'planes_info' -> 'barberia' -> 'premium' -> 'beneficios') = 2, 'nombre y beneficios del plan');
select pg_temp.debe_fallar($$select public.admin_guardar_planes('{"cliente":{"dias":{"free":0,"premium":45}}}')$$, 'al menos 1');
select public.admin_guardar_links('{"barberia":{"activo":2,"s1":{"monto":4900,"url":"https://mpago.la/x"},"s2":{"monto":9900,"url":"https://mpago.la/y","texto":"Oferta"}},"cliente":{"activo":1,"s1":{"monto":2990,"url":""}}}');
select pg_temp.ok((public.ajustes_publicos() -> 'planes' -> 'barberia' -> 'precio' ->> 'premium')::int = 9900, 'el precio publicado es el del link activo');
select pg_temp.debe_fallar($$select public.admin_guardar_links('{"barberia":{"activo":2,"s1":{"monto":1},"s2":{"monto":null}}}')$$, 'precio del espacio 2');
select public.admin_guardar_reglas('{"minutos_pago":15,"estrellas_lista_negra":1}');
select pg_temp.ok(public.regla('minutos_pago') = 15 and (public.ajustes_publicos() -> 'reglas' ->> 'minutos_pago')::int = 15, 'el admin cambia las reglas');
select pg_temp.debe_fallar($$select public.admin_guardar_reglas('{"minutos_pago":1}')$$, 'entre');
select public.admin_guardar_textos('{"app_lema":"Hola mundo"}');
select pg_temp.ok((public.ajustes_publicos() -> 'textos' ->> 'app_lema') = 'Hola mundo', 'textos editables');
select pg_temp.ok(jsonb_array_length(public.admin_uso() -> 'tablas') > 10, 'uso del servidor por tabla');
select pg_temp.ok((public.admin_limpiar('avisos') ->> 'borrados') is not null, 'botón de limpieza');
select pg_temp.ok(jsonb_array_length(public.admin_calificaciones()) = 2, 'el admin ve las calificaciones');
reset role;
update public.profiles set plan = 'free', premium_until = null where email = 'dueno@test.cl';
select pg_temp.debe_fallar($$select pg_temp.crear('dueno@test.cl', 'nuevo@test.cl', 'Nuevo', 'client')$$, 'máximo de 3 clientes');
select pg_temp.como('dueno@test.cl');
select pg_temp.ok((public.estadisticas(current_date - 30, current_date + 1) -> 'por_barbero') is not null, 'estadísticas habilitadas en Free por el admin (opción sí/no)');
reset role;
select pg_temp.como('beto@test.cl');
select pg_temp.ok(public.chat_restantes(prueba.id('pedro@test.cl')) <= 5, 'mensajes del cliente Free según el plan');
reset role;

\o
\echo '✅ TODAS LAS PRUEBAS PASARON'
