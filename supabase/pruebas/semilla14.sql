-- Datos de una barbería real en la versión 1.4 (para probar que actualizar a 2.0 no pierde nada).
-- Se carga sobre stub.sql + instalar.sql de la v1.4.
set client_min_messages = warning;
insert into auth.users (email) values ('juanjosuecastilloloyola@gmail.com');
do $$
declare adm uuid; own uuid; bar uuid; c1 uuid; c2 uuid; c3 uuid; bid uuid; s1 uuid; d date := (now() at time zone 'America/Santiago')::date;
  t timestamptz;
begin
  select id into adm from auth.users where email = 'juanjosuecastilloloyola@gmail.com';
  perform public.preparar_invitacion(adm, 'dueno@b.cl', 'Dueño', 'owner', '+56911111111', 'Barbería Real');
  insert into auth.users (email) values ('dueno@b.cl') returning id into own;
  perform public.preparar_invitacion(own, 'barbero@b.cl', 'Barbero', 'barber', '+56922222222', null);
  insert into auth.users (email) values ('barbero@b.cl') returning id into bar;
  perform public.preparar_invitacion(own, 'c1@b.cl', 'Cliente Uno', 'client', '+56933333333', null);
  insert into auth.users (email) values ('c1@b.cl') returning id into c1;
  perform public.preparar_invitacion(own, 'c2@b.cl', 'Cliente Dos', 'client', '+56944444444', null);
  insert into auth.users (email) values ('c2@b.cl') returning id into c2;
  perform public.preparar_invitacion(own, 'c3@b.cl', 'Cliente Tres', 'client', null, null);
  insert into auth.users (email) values ('c3@b.cl') returning id into c3;
  select barberia_id into bid from public.profiles where id = own;
  update public.barberias set datos_transferencia = 'Banco X', horario = '[{"e":"a","i":"09:00","f":"20:00"},{"e":"a","i":"09:00","f":"20:00"},{"e":"a","i":"09:00","f":"20:00"},{"e":"a","i":"09:00","f":"20:00"},{"e":"a","i":"09:00","f":"20:00"},{"e":"c","i":"10:00","f":"15:00"},{"e":"x","i":"10:00","f":"15:00"}]' where id = bid;
  update public.profiles set saldo = 4000 where id = c3;
  insert into public.servicios (barberia_id, nombre, precio, duracion) values (bid, 'Corte', 10000, 30) returning id into s1;
  t := ((d + 5)::timestamp + interval '10 hours') at time zone 'America/Santiago';
  -- Horas en todos los estados de la v1.4
  insert into public.reservas (barberia_id, barbero_id, cliente_id, inicio, fin, servicios, total, abono, pagado_con, estado, expira_at, comprobante, comprobante_at, consultar) values
    (bid, bar, c1, t, t + interval '30 minutes', jsonb_build_array(jsonb_build_object('id', s1, 'nombre', 'Corte', 'precio', 10000, 'duracion', 30)), 10000, 4000, null, 'esperando_abono', now() + interval '10 minutes', null, null, false),
    (bid, bar, c2, t + interval '1 hour', t + interval '90 minutes', '[]', 10000, 4000, 'transferencia', 'agendada', null, 'data:image/png;base64,AAAA', now(), false),
    (bid, bar, c3, t + interval '2 hours', t + interval '150 minutes', '[]', 10000, 4000, 'saldo', 'agendada', null, null, null, false),
    (bid, own, c1, t + interval '1 day', t + interval '1 day 30 minutes', '[]', 10000, 4000, 'link', 'por_aprobar', now() + interval '5 hours', 'data:image/png;base64,BBBB', now(), true),
    (bid, own, c2, t + interval '2 days', t + interval '2 days 30 minutes', '[]', 10000, 4000, 'transferencia', 'confirmada', null, 'data:image/png;base64,CCCC', now(), false),
    (bid, bar, c1, now() - interval '3 days', now() - interval '3 days' + interval '30 minutes', '[]', 10000, 4000, 'transferencia', 'atendida', null, null, null, false),
    (bid, bar, c2, now() - interval '2 days', now() - interval '2 days' + interval '30 minutes', '[]', 10000, 4000, 'transferencia', 'no_vino', null, null, null, false),
    (bid, bar, c3, now() - interval '1 days', now() - interval '1 days' + interval '30 minutes', '[]', 10000, 4000, 'transferencia', 'anulada', null, null, null, false);
  update public.reservas set confirmada_at = now() where estado = 'confirmada';
  insert into public.reservas (barberia_id, barbero_id, cliente_nombre, inicio, fin, total, abono, pagado_con, estado, confirmada_at, creada_por)
  values (bid, bar, 'Juan sin cuenta', t + interval '3 hours', t + interval '210 minutes', 8000, 0, 'interno', 'confirmada', now(), bar);
  insert into public.caja (barberia_id, barbero_id, fecha, servicio, monto, medio, cliente_id, cliente_nombre)
  values (bid, bar, now() - interval '3 days', 'Corte', 10000, 'efectivo', c1, 'Cliente Uno'), (bid, own, now(), 'Barba', 7000, 'transferencia', null, 'Pedro');
  insert into public.messages (sender, recipient, body) values (c1, bar, 'Hola'), (bar, c1, 'Hola!');
  insert into public.licenses (key, tipo, para_nombre, meses, precio, origen) values ('BARB-SIN-USAR-0001', 'cliente', 'X', 1, 4900, 'key');
  insert into public.licenses (key, tipo, para_nombre, meses, precio, origen, redeemed_by, redeemed_at, inicio, termino)
  values ('BARB-USADA-0001', 'barberia', 'Barbería Real', 1, 4900, 'key', own, now(), now(), now() + interval '1 month');
  update public.profiles set plan = 'premium', premium_until = now() + interval '1 month' where id = own;
  insert into public.requests (user_id, kind, note) values (c2, 'pago', 'Transferí ayer');
  insert into public.app_settings (key, value) values ('link_pago_cliente', 'https://mpago.la/cliente') on conflict do nothing;
end $$;
select 'semilla 1.4 cargada' as ok;
