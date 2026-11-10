-- LIMPIEZA FINAL · Barbería · PASO 1: SOLO CUENTA (no borra nada).
-- Muestra cuántas cuentas se borrarían (todas menos el administrador y los socios de CodeFix), cuántas quedan y cuántas filas de cada tabla son de esas cuentas.
-- Pegar en Supabase → SQL Editor → Run. Revisar el resultado antes del PASO 2.
with quedan as (
  select p.id from public.profiles p where p.role in ('admin', 'socio') or lower(p.email) = public.admin_email()
), van as (
  select u.id from auth.users u where u.id not in (select id from quedan)
), van_todo as (  -- las cuentas y las barberías de sus dueños (servicios, horas, caja… cuelgan de la barbería)
  select id from van union all select b.id from public.barberias b where b.owner_id in (select id from van)
), cols as (
  select c.table_name t, c.column_name col from information_schema.columns c
  join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
  where c.table_schema = 'public' and c.data_type = 'uuid'
), filas as (
  select t, col, (xpath('/row/n/text()', query_to_xml(format(
    'select count(*) as n from public.%I where %I in (select u.id from auth.users u where u.id not in (select p.id from public.profiles p where p.role in (''admin'', ''socio'') or lower(p.email) = public.admin_email()) union all select b.id from public.barberias b where b.owner_id not in (select p.id from public.profiles p where p.role in (''admin'', ''socio'') or lower(p.email) = public.admin_email()))', t, col), false, true, '')))[1]::text::bigint n
  from cols
)
select '👤 Cuentas que se BORRAN' que, (select count(*) from van)::text cuantos
union all select '💈 Barberías que se BORRAN', ((select count(*) from van_todo) - (select count(*) from van))::text
union all select '🛡️ Administradores y socios que QUEDAN', (select count(*) from quedan)::text || ' · ' || coalesce((select string_agg(email, ', ') from public.profiles where id in (select id from quedan)), '')
union all select '🖼️ Fotos/archivos en Storage (borrar desde Storage)', coalesce((select string_agg(bucket_id || ': ' || n, ' · ') from (select bucket_id, count(*) n from storage.objects group by 1 order by 1) b), '0')
union all select '📋 ' || t || '.' || col, n::text from filas where n > 0;
