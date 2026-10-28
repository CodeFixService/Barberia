-- Después de actualizar 1.4 → 2.0 (dos veces): nada se perdió y las horas quedaron en los estados nuevos.
set client_min_messages = notice;
\pset tuples_only on
\o /dev/null
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(c, false) then raise exception 'FALLO: %', msg; end if;
  raise notice 'OK: %', msg;
end $$;
select pg_temp.ok((select count(*) from public.profiles) = 6, 'se conservan las 6 cuentas');
select pg_temp.ok((select count(*) from public.reservas) = 9, 'se conservan las 9 horas');
select pg_temp.ok((select count(*) from public.caja) = 2 and (select count(*) from public.messages) = 2, 'se conservan la caja y los mensajes');
select pg_temp.ok((select saldo from public.profiles where email = 'c3@b.cl') = 4000, 'se conserva el saldo a favor');
select pg_temp.ok((select count(*) from public.reservas where token is null) = 0 and (select count(distinct token) from public.reservas) = 9, 'todas las horas tienen su link');
select pg_temp.ok((select count(*) from public.reservas where estado = 'esperando_abono') = 1, 'la que esperaba abono sigue esperando');
select pg_temp.ok((select count(*) from public.reservas where estado = 'en_revision') = 2, 'por aprobar y agendada sin confirmar → en revisión');
select pg_temp.ok((select count(*) from public.reservas where estado = 'agendada') = 3, 'confirmadas y con saldo → agendada');
select pg_temp.ok((select count(*) from public.reservas where estado in ('confirmada', 'por_aprobar')) = 0, 'ya no quedan estados antiguos');
select pg_temp.ok((select count(*) from public.reservas where estado in ('atendida', 'no_vino', 'anulada')) = 3, 'el historial queda igual');
select pg_temp.ok((select cliente_tel from public.reservas r join public.profiles p on p.id = r.cliente_id where p.email = 'c1@b.cl' limit 1) = '933333333', 'el WhatsApp del cliente queda en sus horas');
select pg_temp.ok((select horario -> 5 ->> 'e' from public.barberias limit 1) = 'a' and (select horario -> 6 ->> 'e' from public.barberias limit 1) = 'x', 'día "a consultar" → abierto; cerrado sigue cerrado');
select pg_temp.ok((select revoked from public.licenses where key = 'BARB-SIN-USAR-0001') and not (select revoked from public.licenses where key = 'BARB-USADA-0001'),
  'key sin usar desactivada; la usada sigue vigente');
select pg_temp.ok((select premium_until > now() + interval '20 days' from public.profiles where email = 'dueno@b.cl'), 'el Premium vigente se conserva');
select pg_temp.ok((select count(*) from public.pagos where comprobante is null and nota like '%antiguo%') = 1, 'el "Ya pagué" pendiente pasó a Pagos');
select pg_temp.ok((public.ajustes_publicos() -> 'links_premium' -> 'cliente' -> 's1' ->> 'url') = 'https://mpago.la/cliente', 'el link de Premium cliente pasó a Precios y links');
select pg_temp.ok(public.db_version() = '2.10', 'base en versión 2.10');
-- Las funciones nuevas funcionan con los datos antiguos
select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'dueno@b.cl'), false);
set role authenticated;
select pg_temp.ok(jsonb_array_length(public.ocupacion(current_date - 7, current_date + 10) -> 'reservas') >= 8, 'el dueño ve su agenda');
select pg_temp.ok(jsonb_array_length(public.mis_clientes()) = 3, 'el dueño ve sus 3 clientes');
select pg_temp.ok((public.resumen() ->> 'pendientes')::int = 2, 'Inicio: 2 abonos por revisar');
reset role;
select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'c1@b.cl'), false);
set role authenticated;
select pg_temp.ok(jsonb_array_length(public.mis_horas()) = 3, 'el cliente ve sus horas');
reset role;
\o
select '✅ ACTUALIZACIÓN 1.4 → 2.10 SIN PÉRDIDAS' as resultado;
