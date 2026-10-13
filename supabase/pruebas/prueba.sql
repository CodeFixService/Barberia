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
grant execute on all functions in schema prueba to anon, authenticated;
set client_min_messages = notice;
\pset tuples_only on
\o /dev/null

-- 1. Cuentas
insert into auth.users (email) values ('juanjosuecastilloloyola@gmail.com');
select pg_temp.crear('juanjosuecastilloloyola@gmail.com', 'dueno@test.cl', 'Juan Dueño', 'owner', 'Barbería Test');
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
grant select on t to authenticated;

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

-- 3. Reservar (Ana) con abono y comprobante
select pg_temp.como('ana@test.cl');
select pg_temp.ok(jsonb_array_length(public.ver_barberia() -> 'servicios') = 2, 'el cliente ve 2 servicios');
select pg_temp.ok((select count(*) from jsonb_array_elements(public.ver_barberia() -> 'barberos') x where (x ->> 'reservable')::boolean) = 2,
  'reservables: 2 barberos (el dueño tiene la agenda cerrada)');
create temp table r1 as select public.reservar(prueba.id('pedro@test.cl'), (select h1 from t),
  array[prueba.serv('Corte')]) as r;
select pg_temp.ok((select r ->> 'estado' = 'esperando_abono' from r1), 'queda esperando abono (15 min)');
select pg_temp.debe_fallar($$select public.reservar(prueba.id('pedro@test.cl'), (select h2 from t), array[prueba.serv('Corte')])$$, 'hora(s) activa(s)');
select pg_temp.debe_fallar($$select public.reservar(prueba.id('dueno@test.cl'), (select h2 from t), array[prueba.serv('Corte')])$$, 'agenda abierta');
select pg_temp.debe_fallar($$select public.ya_abone((select (r ->> 'id')::uuid from r1), 'hola')$$, 'comprobante');
select public.ya_abone((select (r ->> 'id')::uuid from r1), 'data:image/jpeg;base64,AAAA');
select pg_temp.ok(prueba.si($q$(select estado = 'agendada' from public.reservas where id = (select (r ->> 'id')::uuid from r1))$q$), 'con comprobante queda agendada');
reset role;
select pg_temp.ok((select count(*) = 2 from public.avisos where reserva_id = (select (r ->> 'id')::uuid from r1)), 'avisos al barbero y al dueño');
select pg_temp.ok((select count(*) = 1 from public.messages where sistema and imagen is not null), 'el comprobante llega al chat del barbero');

-- 4. Beto no puede tomar la misma hora y no ve datos de Ana
select pg_temp.como('beto@test.cl');
select pg_temp.debe_fallar($$select public.reservar(prueba.id('pedro@test.cl'), (select h1 from t) + interval '15 minutes', array[prueba.serv('Corte')])$$, 'acaba de ocupar');
select pg_temp.ok((select x ->> 'estado' = 'ocupado' and x -> 'cliente' is null
  from jsonb_array_elements(public.ocupacion(current_date, current_date + 5) -> 'reservas') x limit 1), 'otro cliente solo ve "ocupado"');
select pg_temp.debe_fallar($$select public.reservar(prueba.id('pedro@test.cl'), (select fuera from t), array[prueba.serv('Corte')])$$, 'Fuera del horario');
select pg_temp.debe_fallar($$select public.ver_comprobante((select (r ->> 'id')::uuid from r1))$$, 'Sin permiso');
select pg_temp.debe_fallar($$select public.confirmar_hora((select (r ->> 'id')::uuid from r1))$$, 'Sin permiso');
-- fin de semana / "a consultar": buscar el próximo sábado
create temp table r2 as select public.reservar(prueba.id('b2@test.cl'),
  ((date_trunc('week', now() at time zone 'America/Santiago')::date + 12)::timestamp + interval '11 hours') at time zone 'America/Santiago',
  array[prueba.serv('Barba')]) as r;
select public.ya_abone((select (r ->> 'id')::uuid from r2), 'data:image/png;base64,AAAA', 'link');
select pg_temp.ok(prueba.si($q$(select estado = 'por_aprobar' and expira_at is not null from public.reservas where id = (select (r ->> 'id')::uuid from r2))$q$), 'sábado queda "por aprobar"');
reset role;

-- 5. Pedro confirma; otro barbero no puede
select pg_temp.como('b2@test.cl');
select pg_temp.debe_fallar($$select public.confirmar_hora((select (r ->> 'id')::uuid from r1))$$, 'Sin permiso');
select pg_temp.ok((select x -> 'cliente' is null from jsonb_array_elements(public.ocupacion(current_date, current_date + 5) -> 'reservas') x
  where x ->> 'barbero_id' = prueba.id('pedro@test.cl')::text), 'otro barbero ve la hora de Pedro sin datos');
reset role;
select pg_temp.como('pedro@test.cl');
select public.confirmar_hora((select (r ->> 'id')::uuid from r1));
select pg_temp.ok(public.ver_comprobante((select (r ->> 'id')::uuid from r1)) like 'data:image%', 'el barbero ve el comprobante');
reset role;
select pg_temp.como('dueno@test.cl');
select pg_temp.ok((select (x ->> 'cliente') = 'Beto' from jsonb_array_elements(public.ocupacion(current_date, current_date + 14) -> 'reservas') x
  where x ->> 'estado' = 'por_aprobar'), 'el dueño ve todas las horas con nombre');
select public.rechazar_hora((select (r ->> 'id')::uuid from r2), 'No trabajo ese sábado');
reset role;
select pg_temp.ok((select saldo = 4000 from public.profiles where email = 'beto@test.cl'), 'si rechazan, el abono queda a favor');

-- 6. Ana vio el aviso → el barbero lo ve como Visto; Ana anula con tiempo → saldo a favor
select pg_temp.como('ana@test.cl');
select pg_temp.ok(jsonb_array_length(public.mis_avisos()) >= 1, 'Ana tiene avisos en la campanita');
select public.marcar_vistos(null);
select pg_temp.ok((select (x ->> 'estado') = 'confirmada' from jsonb_array_elements(public.mis_horas()) x limit 1), 'Ana ve su hora confirmada');
select public.anular_mia((select (r ->> 'id')::uuid from r1));
reset role;
select pg_temp.ok((select saldo = 4000 from public.profiles where email = 'ana@test.cl'), 'anuló con +24 h: abono a favor');
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

-- 8. Anular tarde → pierde el abono
update public.reservas set created_at = now() - interval '3 days', inicio = now() + interval '5 hours', fin = now() + interval '5 hours 45 minutes'
  where id = (select (r ->> 'id')::uuid from r3);
select pg_temp.como('ana@test.cl');
select pg_temp.ok((select public.anular_mia((select (r ->> 'id')::uuid from r3)) ->> 'abono_destino' = 'perdido'), 'anuló con menos de 24 h: pierde el abono');
reset role;
-- reservó para el mismo día: puede anular hasta 1 h antes
insert into public.reservas (barberia_id, barbero_id, cliente_id, inicio, fin, total, abono, pagado_con, estado, created_at)
select barberia_id, prueba.id('pedro@test.cl'), id, now() + interval '3 hours', now() + interval '3 hours 30 minutes',
       10000, 4000, 'transferencia', 'agendada', now() - interval '1 hour' from public.profiles where email = 'ana@test.cl'
returning id as r4 \gset
select pg_temp.como('ana@test.cl');
select pg_temp.ok((select public.anular_mia(:'r4') ->> 'abono_destino' = 'saldo'), 'hora del mismo día anulada con +1 h: abono a favor');
reset role;

-- 9. Chat: 3 seguidos hasta que respondan; el barbero sin límite
select pg_temp.como('ana@test.cl');
select public.enviar_mensaje(prueba.id('pedro@test.cl'), 'hola 1');
select public.enviar_mensaje(prueba.id('pedro@test.cl'), 'hola 2');
select public.enviar_mensaje(prueba.id('pedro@test.cl'), 'hola 3');
select pg_temp.debe_fallar($$select public.enviar_mensaje(prueba.id('pedro@test.cl'), 'hola 4')$$, '3 mensajes');
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
select pg_temp.debe_fallar($$select public.enviar_mensaje(prueba.id('b2@test.cl'), 'x4')$$, '3 mensajes');
reset role;
select pg_temp.como('ana@test.cl');
select pg_temp.ok(public.chat_restantes(prueba.id('pedro@test.cl')) = 3, 'cuando le contestan, vuelve a tener 3');
reset role;

-- 10. Premium: key y activación directa
select pg_temp.como('juanjosuecastilloloyola@gmail.com');
select pg_temp.ok(public.is_admin(), 'Josué es admin');
create temp table k as select public.admin_crear_key('cliente', 'Ana') as k;
select pg_temp.ok((select (k ->> 'precio')::int = 4900 from k), 'la key vale $4.900');
create temp table kb as select public.admin_crear_key('barberia', 'Barbería Test') as k;
reset role;
grant select on k, kb to authenticated;
select pg_temp.como('ana@test.cl');
select pg_temp.debe_fallar($$select public.canjear_key((select k ->> 'key' from kb))$$, 'otro tipo');
select public.canjear_key((select k ->> 'key' from k));
select pg_temp.ok(public.is_premium(auth.uid()), 'Ana es Premium con su key');
select public.enviar_mensaje(prueba.id('pedro@test.cl'), 'p' || g) from generate_series(1, 5) g;
select pg_temp.ok(true, 'cliente Premium escribe sin límite');
select pg_temp.debe_fallar($$select public.canjear_key((select k ->> 'key' from k))$$, 'ya usada');
reset role;
select pg_temp.ok((select termino > now() + interval '27 days' and inicio is not null from public.licenses where key = (select k ->> 'key' from k)), 'la key guarda inicio y término');
select pg_temp.como('juanjosuecastilloloyola@gmail.com');
select public.admin_activar(prueba.id('dueno@test.cl'), 1, null);
select pg_temp.ok(prueba.si($q$(select count(*) = 1 from public.licenses where origen = 'directo')$q$), 'la activación directa queda registrada');
select pg_temp.ok(jsonb_array_length(public.admin_keys()) = 3, 'historial de keys');
reset role;
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
reset role;
select pg_temp.como('dueno@test.cl');
select pg_temp.ok(jsonb_array_length(public.ver_caja(current_date - 30, current_date + 1)) = 2, 'dueño Premium ve la caja de todos');
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
select pg_temp.ok((select (x ->> 'ventas')::int = 19000 from jsonb_array_elements(public.admin_barberias()) x), 'el admin ve las ventas de cada barbería');
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

\o
\echo '✅ TODAS LAS PRUEBAS PASARON'
