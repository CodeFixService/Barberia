-- v2.1: después de actualizar una base 2.0 con datos (la de su propia prueba), nada se pierde y lo nuevo funciona.
\set QUIET on
\pset tuples_only on
\o /dev/null
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(c, false) then raise exception 'FALLO: %', msg; end if;
  raise notice 'OK: %', msg;
end $$;
select pg_temp.ok(public.db_version() = '2.10', 'base en versión 2.10');
select pg_temp.ok((select count(*) from public.barberias) >= 1 and (select count(*) from public.reservas) >= 5, 'barberías y horas se conservan');
select pg_temp.ok((select count(*) from public.calificaciones) >= 1 and (select count(*) from public.pagos) >= 1, 'calificaciones y pagos se conservan');
select pg_temp.ok(not exists (select 1 from public.barberias where registro_solo or referida_por is not null), 'las barberías antiguas no quedan como registradas solas');
select pg_temp.ok((select count(*) from public.planes where clave in ('fotos_servicios', 'comisiones', 'resumen_mes', 'recuperar', 'prioridad')) = 5, 'opciones nuevas de los planes');
select pg_temp.ok((select free = 0 and premium = 1 from public.planes where clave = 'editar_barberos'), 'editar barberos sigue siendo Premium');
select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'dueno@test.cl'), false);
set role authenticated;
select pg_temp.ok(public.resumen_mes() ? 'atendidas', 'el dueño ve su resumen del mes');
select pg_temp.ok(public.no_vuelven() ? 'total', 'el dueño ve los clientes que no vuelven');
select pg_temp.ok(jsonb_typeof(public.mis_pendientes() -> 'devoluciones') = 'array', 'Inicio de la barbería funciona');
reset role;
\o
select '✅ ACTUALIZACIÓN 2.0 → 2.10 SIN PÉRDIDAS' as resultado;
