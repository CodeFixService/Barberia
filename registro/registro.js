/* Registro abierto de barberías (link o QR de CodeFix, de un socio o de otra barbería): crea la barbería con sus días de Premium de regalo. */
(async function () {
  'use strict';
  const C = Core, K = Cuenta;
  const $ = C.$, esc = C.esc;
  C.registrarSW();

  const params = new URLSearchParams(location.search);
  const ref = (params.get('ref') || '').trim().toLowerCase();
  const app = $('app');
  const mostrar = (html) => { $('cargando').classList.add('hidden'); app.classList.remove('hidden'); app.innerHTML = html; };
  if (!K.listo) { $('cargando').textContent = 'Falta configurar el servidor.'; return; }

  let yo = null, quien = null;
  try { yo = await K.refrescar(); } catch (e) { yo = null; }
  await K.ajustes();
  if (ref) { try { quien = await K.rpc('ref_publico', { p_ref: ref }); } catch (e) { quien = null; } }
  const regalo = K.regla('dias_regalo');
  const abierto = K.regla('registro_barberias') > 0;

  let html = '<div class="card hero"><div class="logo-grande" style="' + (quien && quien.logo ? C.fondo(quien.logo) : '') + '">' + (quien && quien.logo ? '' : '💈') + '</div>' +
    '<h1>Crea la app de tu barbería</h1>' +
    (quien ? '<p class="muted" style="margin:0 0 6px">🤝 Te invitó <b>' + esc(quien.nombre) + '</b></p>' : '') +
    '<p class="muted" style="margin:0">Tus clientes reservan solos con tu link o QR, pagan el abono y tú lo apruebas en un toque.</p>' +
    '<ul class="ventajas"><li>📅 Agenda por barbero, sin choques de horas</li><li>💳 Abono con comprobante: menos "no vino"</li><li>💵 Caja de cortes y equipo</li>' +
    (regalo ? '<li>⭐ <b>' + regalo + ' días de Premium de regalo</b>, después sigues gratis o pagas</li>' : '<li>🆓 Plan Free para siempre</li>') + '</ul></div>';
  if (yo) {
    html += '<div class="card centro"><p style="margin-top:0">Ya entraste como <b>' + esc(yo.nombre || yo.email) + '</b>.</p><a class="btn full" href="../' + K.paginaDe(yo.role) + '">📲 Abrir mi app</a></div>';
    mostrar(html); C.marca(true); return;
  }
  if (!abierto) {
    html += '<div class="card centro"><p style="margin-top:0">El registro de barberías está cerrado por ahora.</p>' +
      ((C.leer('ajustes', {}) || {}).whatsapp_admin ? '<a class="btn wsp full" target="_blank" rel="noopener" href="' + C.wa(C.leer('ajustes', {}).whatsapp_admin, 'Hola, quiero la app para mi barbería') + '">💬 Escribir a CodeFix</a>' : '') + '</div>';
    mostrar(html); C.marca(true); return;
  }
  html += '<div class="card"><h2>✍️ Tus datos</h2>' +
    '<label>Nombre de la barbería</label><input id="rB" maxlength="80" placeholder="Ej: Barbería El Bigote" autocomplete="organization">' +
    '<label>Tu nombre</label><input id="rN" maxlength="80" autocomplete="name">' +
    '<label>WhatsApp de la barbería</label><input id="rT" inputmode="tel" autocomplete="tel" placeholder="+56 9 1234 5678">' +
    '<label>Correo <span class="opc">(con este entras)</span></label><input id="rE" type="email" inputmode="email" autocomplete="username" placeholder="tu@correo.cl">' +
    '<label>Clave <span class="opc">(mínimo 6)</span></label><input id="rC" type="password" autocomplete="new-password">' +
    '<label class="check"><input type="checkbox" id="rOk"> <span>Acepto los <a href="../legal.html" target="_blank">términos y la privacidad</a></span></label>' +
    '<p class="err" id="rErr"></p><div class="btns"><button class="grande full" id="bCrear">💈 Crear mi barbería</button></div>' +
    '<p class="muted chico centro">¿Ya tienes cuenta? <a href="../?entrar=1">Entra aquí</a></p></div>';
  mostrar(html);
  C.marca(true);
  $('bCrear').onclick = (ev) => C.accion(ev.target, async () => {
    $('rErr').textContent = '';
    const d = { barberia: $('rB').value.trim(), nombre: $('rN').value.trim(), telefono: $('rT').value.trim(), email: $('rE').value.trim(), clave: $('rC').value, ref };
    if (d.barberia.length < 2) throw new Error('Escribe el nombre de la barbería');
    if (d.nombre.length < 2) throw new Error('Escribe tu nombre');
    if (d.telefono.replace(/\D/g, '').length < 8) throw new Error('Escribe el WhatsApp');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) throw new Error('Escribe un correo válido');
    if (!$('rOk').checked) throw new Error('Acepta los términos para seguir');
    const r = await K.registrarBarberia(d);
    C.guardar('ultimoEmail', d.email.toLowerCase());
    if (r.confirmar) {
      app.innerHTML = '<div class="card centro"><div style="font-size:52px">📧</div><h2 style="justify-content:center">Revisa tu correo</h2><p class="muted">Te enviamos un link para confirmar tu cuenta. ' +
        'Después entra con tu correo y clave.</p><a class="btn full" href="../?entrar=1">Ir a entrar</a></div>';
      return;
    }
    location.href = '../equipo/';
  }).catch((e) => { $('rErr').textContent = e.message; });
})();
