/* Panel del super admin (Josué): barberías, ventas, recomendaciones, Premium con keys, avisos y ajustes. */
(async function () {
  'use strict';
  const C = Core, K = Cuenta, A = Agenda, P = Perfil;
  const $ = C.$, esc = C.esc;
  C.registrarSW();

  const yo = await K.exigir(['admin']);
  Avisos.montar({ titulo: 'CodeFix · Barberías', sub: 'Administrador general' });
  C.marca();
  let barberias = [];
  let ajustes = await K.ajustes();
  const precio = () => +(ajustes.precio_premium || 4900);

  /* ---------- Navegación ---------- */
  let vistaActual = 'resumen';
  const VISTAS = { resumen, barberias: pintarBarberias, keys, chat: () => Chat.montar($('v-chat')), ajustes: pintarAjustes };
  function mostrar(v) {
    vistaActual = v;
    document.querySelectorAll('.view').forEach((x) => x.classList.toggle('on', x.id === 'v-' + v));
    document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    scrollTo(0, 0);
    VISTAS[v]();
  }
  document.querySelectorAll('nav.tabs button').forEach((b) => b.onclick = () => { history.replaceState(null, '', '#' + b.dataset.v); mostrar(b.dataset.v); });
  function ruta() {
    const h = decodeURIComponent(location.hash.slice(1));
    const [v, qs] = h.split('?');
    const q = new URLSearchParams(qs || '');
    if (v === 'chat' && q.get('con')) { mostrar('chat'); Chat.abrir(q.get('con')); return; }
    if (v === 'avisos') { Avisos.abrir(); return; }
    if (v === 'admin') { mostrar('resumen'); return; }
    mostrar(VISTAS[v] ? v : 'resumen');
  }
  addEventListener('hashchange', ruta);
  Avisos.alCambiar((r, antes) => { if (antes.cargado && r.pendientes !== antes.pendientes && vistaActual === 'resumen') resumen(); });

  const flecha = (a, b) => {
    if (!b && !a) return '';
    if (!b) return ' <span class="flecha up">↑</span>';
    const p = Math.round((a - b) / b * 100);
    return ' <span class="flecha ' + (p >= 0 ? 'up' : 'down') + '">' + (p >= 0 ? '↑' : '↓') + Math.abs(p) + '%</span>';
  };
  const diasDesde = (t) => t ? Math.floor((Date.now() - new Date(t)) / 864e5) : null;

  // Recomendaciones automáticas para cada barbería (se pueden enviar por el chat de soporte).
  function recomendaciones(b) {
    const r = [];
    const sinUso = diasDesde(b.ultima_actividad);
    if (sinUso === null || sinUso >= 7) r.push(['😴', 'Lleva ' + (sinUso === null ? 'mucho tiempo' : sinUso + ' días') + ' sin entrar a la app.', 'Hola 👋 ¿Cómo va todo con la app? Si necesitas ayuda para configurar tu agenda o crear a tus clientes, aquí estoy.']);
    if (b.servicios < 3) r.push(['✂️', 'Tiene solo ' + b.servicios + ' servicio(s) en su catálogo.', 'Tip 💡: agrega más servicios a tu catálogo (barba, cejas, combos). Los clientes reservan más cuando ven todas las opciones con precio.']);
    if (b.clientes > 0 && b.reservas === 0) r.push(['📵', 'Tiene clientes, pero nadie reservó por la app este mes.', 'Tip 💡: recuérdales a tus clientes que reserven por la app (comparte tu enlace/QR desde Más → Enlace). Así tu agenda se llena sola.']);
    if (b.clientes_nuevos === 0) r.push(['👥', 'Sin clientes nuevos este mes.', 'Tip 💡: comparte tu enlace o QR en tu local y redes, y crea las cuentas de tus clientes desde Más → Clientes.']);
    const tasaNV = b.atendidas + b.no_vino ? b.no_vino / (b.atendidas + b.no_vino) : 0;
    if (b.no_vino >= 2 && tasaNV > 0.12) r.push(['🚫', Math.round(tasaNV * 100) + '% de "No vino" este mes.', 'Tip 💡: muchos clientes no están llegando. ' + (b.premium ? 'Tus recordatorios automáticos ya están activos; considera bloquear a quienes faltan seguido.' : 'Con Premium tus clientes reciben recordatorios 24 h y 2 h antes, y baja mucho el "No vino".')]);
    if (b.fin_de_semana >= 3) r.push(['📅', 'Le piden harto el fin de semana (' + b.fin_de_semana + ' solicitudes).', 'Tip 💡: tus clientes están pidiendo horas el fin de semana. Si puedes, abre el sábado en Ajustes → Horario y asegura esas ventas.']);
    if (!b.ofertas) r.push(['🏷️', 'No tiene ofertas activas.', 'Tip 💡: publica una oferta (ej. "Martes de barba a $X"). A tus clientes les llega un aviso al tiro y suben las reservas en días flojos.']);
    if (b.ventas_ant && b.ventas < b.ventas_ant * 0.8) r.push(['📉', 'Ventas ' + Math.round((1 - b.ventas / b.ventas_ant) * 100) + '% bajo el mes pasado.', 'Hola 👋 Vi que este mes vas un poco más lento. ¿Te ayudo a armar una oferta para tus clientes?']);
    if (!b.premium && b.clientes >= 32) r.push(['💎', 'Cerca del límite Free (' + b.clientes + '/40 clientes).', 'Hola 👋 Estás cerca del máximo de 40 clientes del plan Free. Con Premium puedes tener hasta 500, más recordatorios automáticos y estadísticas. ¿Te lo activo?']);
    if (!b.premium && b.barberos >= 3) r.push(['💈', 'Tiene el máximo de barberos Free (3).', 'Hola 👋 Ya tienes 3 barberos, el máximo Free. Con Premium puedes sumar hasta 10 y ver la caja y estadísticas de cada uno.']);
    if (b.premium && b.premium_until && new Date(b.premium_until) - Date.now() < 5 * 864e5) r.push(['⏳', 'Su Premium vence el ' + P.fechaCorta(b.premium_until) + '.', 'Hola 👋 Tu Premium vence el ' + P.fechaCorta(b.premium_until) + '. Para renovar, paga en Mi plan y toca "Ya pagué". ¡Gracias por confiar en nosotros!']);
    if (!b.abono) r.push(['💳', 'No cobra abono ($0).', 'Tip 💡: cobrar un abono pequeño (ej. $3.000–$4.000) reduce mucho los "No vino". Se configura en Ajustes.']);
    return r;
  }

  /* ---------- Resumen ---------- */
  async function resumen() {
    const el = $('v-resumen');
    el.innerHTML = '<p class="muted centro">Cargando…</p>';
    let s, sol, rep;
    try {
      [s, sol, rep, barberias] = await Promise.all([K.rpc('admin_resumen'), K.rpc('admin_solicitudes'), K.rpc('admin_reportes'), K.rpc('admin_barberias')]);
    } catch (e) { el.innerHTML = '<div class="card err">' + esc(e.message) + '<br><span class="muted">¿Corriste supabase/instalar.sql? (guía, paso 1)</span></div>'; return; }
    const pend = sol.filter((x) => x.status === 'pendiente');
    let html = '';
    if (!(await K.pushActivo())) html += '<div class="banner marca"><div class="grow"><b>🔔 Activa las notificaciones</b><br><span class="chico">Para enterarte al tiro de los "Ya pagué".</span></div><button class="small" id="bPush">Activar</button></div>';
    html += '<div class="stats">' +
      '<div class="card"><small>Barberías</small><b>' + s.barberias + '</b><small>⭐ ' + s.barberias_premium + ' Premium</small></div>' +
      '<div class="card"><small>Clientes</small><b>' + s.clientes + '</b><small>⭐ ' + s.clientes_premium + ' Premium</small></div>' +
      '<div class="card"><small>Ingresos del mes</small><b>' + C.plata(s.ingresos_mes) + '</b><small>Total ' + C.plata(s.ingresos_total) + '</small></div>' +
      '<div class="card"><small>Reservas del mes</small><b>' + s.reservas_mes + '</b><small>' + s.barberos + ' barberos</small></div>' +
      '<div class="card"><small>Por vencer (7 días)</small><b>' + s.por_vencer + '</b></div>' +
      '<div class="card"><small>🖥️ Servidor</small><b>' + s.db_mb + ' MB</b><small>' + (s.db_mb > 450 ? '🔴' : s.db_mb > 350 ? '🟡' : '🟢') + ' de 500 MB gratis</small></div></div>';
    html += '<div class="card"><h2>💰 Solicitudes "Ya pagué" (' + pend.length + ')</h2>' + (pend.length ? pend.map((x) =>
      '<div class="card solic" style="box-shadow:none"><div class="flex"><div class="grow"><b>' + esc(x.nombre) + '</b> <span class="pill">' + (x.rol === 'owner' ? 'Barbería' : 'Cliente') + '</span>' +
      '<div class="sub muted">' + esc(x.barberia || '') + ' · ' + esc(x.email) + ' · ' + C.hace(x.created_at) + '</div>' + (x.note ? '<div class="sub">📝 ' + esc(x.note) + '</div>' : '') + '</div></div>' +
      '<div class="btns"><button class="ok small" data-ap="' + x.id + '">✅ Activar 1 mes (' + C.plata(precio()) + ')</button><button class="small danger" data-re="' + x.id + '">No encontré el pago</button></div></div>').join('')
      : '<p class="muted">No hay pagos por revisar. Te llega un push cuando alguien toque "Ya pagué".</p>') + '</div>';
    if (rep.length) html += '<div class="card"><h2>🚩 Reportes (' + rep.length + ')</h2><ul class="list">' + rep.map((r) => '<li><div class="grow"><b>' + esc(r.de) + ' reportó a ' + esc(r.contra) + '</b><div class="sub">' + esc(r.reason) + ' · "' + esc(r.excerpt || '') + '"</div></div>' +
      '<button class="small gris" data-rok="' + r.id + '">Ignorar</button><button class="small danger" data-rsus="' + r.id + '">Suspender</button></li>').join('') + '</ul></div>';
    // Ranking y recomendaciones
    const top = barberias.slice().sort((a, b) => b.ventas - a.ventas);
    html += '<div class="card"><h2>🏆 Ranking del mes</h2>' + (top.length ? '<div class="scroll-x"><table class="tabla"><tr><th>#</th><th>Barbería</th><th class="n">Ventas</th><th class="n">Reservas</th><th class="n">Clientes</th></tr>' +
      top.slice(0, 10).map((b, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(b.nombre) + (b.premium ? ' ⭐' : '') + '</td><td class="n">' + C.plata(b.ventas) + flecha(b.ventas, b.ventas_ant) + '</td><td class="n">' + b.reservas + flecha(b.reservas, b.reservas_ant) + '</td><td class="n">' + b.clientes + '</td></tr>').join('') +
      '</table></div>' : '<p class="muted">Aún no hay barberías. Créalas en la pestaña 💈.</p>') + '</div>';
    const recos = barberias.flatMap((b) => recomendaciones(b).slice(0, 2).map((r) => [b, r]));
    if (recos.length) html += '<div class="card"><h2>💡 Recomendaciones</h2>' + recos.slice(0, 12).map(([b, r], i) =>
      '<div class="reco"><span style="font-size:20px">' + r[0] + '</span><div class="grow"><b>' + esc(b.nombre) + '</b>: ' + esc(r[1]) + '</div><button class="small alt" data-reco="' + i + '">Enviar tip</button></div>').join('') + '</div>';
    el.innerHTML = html;
    if ($('bPush')) $('bPush').onclick = (ev) => C.accion(ev.target, async () => { await K.activarPush(); resumen(); }, '🔔 Activadas');
    el.querySelectorAll('[data-ap]').forEach((b) => b.onclick = (ev) => C.accion(ev.target, async () => { await K.rpc('admin_resolver', { p_id: b.dataset.ap, p_aprobar: true }); K.despertarEnvios(); resumen(); Avisos.actualizar(); }, '⭐ Premium activado por 1 mes'));
    el.querySelectorAll('[data-re]').forEach((b) => b.onclick = async () => { if (await C.confirmar('Le avisaremos que no encontraste el pago.', { si: 'Rechazar' })) { await K.rpc('admin_resolver', { p_id: b.dataset.re, p_aprobar: false }); K.despertarEnvios(); resumen(); } });
    el.querySelectorAll('[data-rok]').forEach((b) => b.onclick = async () => { await K.rpc('admin_resolver_reporte', { p_id: b.dataset.rok, p_suspender: false }); resumen(); });
    el.querySelectorAll('[data-rsus]').forEach((b) => b.onclick = async () => { if (await C.confirmar('¿Suspender la cuenta reportada?', { si: 'Suspender', peligro: true })) { await K.rpc('admin_resolver_reporte', { p_id: b.dataset.rsus, p_suspender: true }); resumen(); } });
    el.querySelectorAll('[data-reco]').forEach((b) => b.onclick = () => { const [bb, r] = recos[+b.dataset.reco]; enviarTip(bb, r[2]); });
  }

  async function enviarTip(b, texto) {
    const t = await C.pedir('💬 Mensaje para ' + b.nombre, { largo: true, valor: texto, si: 'Enviar', max: 1000 });
    if (!t) return;
    try { await K.rpc('enviar_mensaje', { p_to: b.owner_id, p_body: t }); K.despertarEnvios(); C.toast('💬 Enviado al chat de ' + b.nombre); } catch (e) { C.toast('⚠️ ' + e.message); }
  }

  /* ---------- Barberías ---------- */
  let modoLista = 'barberias';
  async function pintarBarberias() {
    const el = $('v-barberias');
    el.innerHTML = '<div class="card" style="padding:12px"><div class="seg"><button data-m="barberias">💈 Barberías</button><button data-m="clientes">👥 Clientes</button><button data-m="equipo">✂️ Barberos</button></div>' +
      '<div class="flex" style="margin-top:10px"><input id="fB" placeholder="🔎 Buscar…" class="grow"><button id="bNuevaB">+ Barbería</button></div></div><div id="lB"><p class="muted centro">Cargando…</p></div>';
    el.querySelectorAll('[data-m]').forEach((b) => { b.classList.toggle('on', b.dataset.m === modoLista); b.onclick = () => { modoLista = b.dataset.m; pintarBarberias(); }; });
    $('bNuevaB').onclick = nuevaBarberia;
    const z = $('lB');
    if (modoLista === 'barberias') {
      try { barberias = await K.rpc('admin_barberias'); } catch (e) { z.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
      z.innerHTML = barberias.length ? barberias.map((b) => {
        const rec = recomendaciones(b);
        return '<div class="card barb-card ' + (b.premium ? 'oro-marco' : '') + '" data-b="' + b.id + '" data-n="' + esc((b.nombre + ' ' + b.dueno + ' ' + b.email).toLowerCase()) + '">' +
          '<div class="flex"><span class="av" style="' + C.fondo(b.logo) + '">' + (b.logo ? '' : '💈') + '</span><div class="grow"><b>' + esc(b.nombre) + '</b> ' +
          (b.premium ? '<span class="pill oro">⭐ Premium</span>' : '<span class="pill">Free</span>') + (b.suspended ? ' <span class="pill bad">suspendida</span>' : '') +
          '<div class="sub muted">' + esc(b.dueno) + ' · ' + (b.ultima_actividad ? 'activa ' + C.hace(b.ultima_actividad) : 'nunca entró') + (b.premium && b.premium_until ? ' · vence ' + P.fechaCorta(b.premium_until) : '') + '</div></div>' +
          (rec.length ? '<span class="pill warn">💡 ' + rec.length + '</span>' : '') + '</div>' +
          '<div class="metricas"><div>Ventas mes<b>' + C.plata(b.ventas) + flecha(b.ventas, b.ventas_ant) + '</b></div><div>Reservas<b>' + b.reservas + flecha(b.reservas, b.reservas_ant) + '</b></div>' +
          '<div>Atendidas<b>' + b.atendidas + '</b></div><div>No vino<b>' + b.no_vino + '</b></div><div>Clientes<b>' + b.clientes + ' <small class="muted">⭐' + b.clientes_premium + '</small></b></div><div>Barberos<b>' + b.barberos + '</b></div></div></div>';
      }).join('') : '<div class="card empty"><span class="ico">💈</span>Crea tu primera barbería con <b>+ Nueva barbería</b>.</div>';
      z.querySelectorAll('[data-b]').forEach((c) => c.onclick = () => fichaBarberia(barberias.find((b) => b.id === c.dataset.b)));
    } else {
      let l = [];
      try { l = await K.rpc('admin_usuarios', { p_rol: modoLista === 'clientes' ? 'client' : null, p_barberia: null }); } catch (e) { z.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
      if (modoLista === 'equipo') l = l.filter((u) => u.rol !== 'client');
      z.innerHTML = '<div class="card"><ul class="list">' + l.map((u) => '<li class="tap" data-u="' + u.id + '" data-n="' + esc((u.nombre + ' ' + u.email + ' ' + (u.barberia || '')).toLowerCase()) + '">' +
        '<div class="grow"><b>' + esc(u.nombre) + '</b> ' + (u.premium ? '<span class="pill oro">⭐</span>' : '') + (u.suspended ? ' <span class="pill bad">suspendido</span>' : '') +
        '<div class="sub">' + esc(u.email) + ' · ' + esc(u.barberia || '') + ' · ' + ({ owner: 'Dueño', barber: 'Barbero', client: 'Cliente' }[u.rol]) +
        (u.premium_until && u.premium ? ' · hasta ' + P.fechaCorta(u.premium_until) : '') + '</div></div><span>›</span></li>').join('') + '</ul>' + (l.length ? '' : '<p class="muted">Nadie aún.</p>') + '</div>';
      z.querySelectorAll('[data-u]').forEach((li) => li.onclick = () => fichaUsuario(l.find((u) => u.id === li.dataset.u)));
    }
    $('fB').oninput = () => z.querySelectorAll('[data-n]').forEach((x) => x.classList.toggle('hidden', !x.dataset.n.includes($('fB').value.toLowerCase())));
  }

  function nuevaBarberia() {
    const h = C.hoja('<h2>💈 Nueva barbería</h2><label>Nombre de la barbería</label><input data-b maxlength="80" placeholder="Ej: Barbería El Bigote">' +
      '<label>Nombre del dueño</label><input data-n maxlength="80"><label>Correo del dueño <span class="opc">(con este entra)</span></label><input data-e type="email" inputmode="email">' +
      '<label>WhatsApp de la barbería</label><input data-t inputmode="tel" placeholder="+56 9…"><p class="muted chico">Parte en Free. Le dejamos el mensaje listo con su acceso.</p><p class="err" data-err></p>' +
      '<div class="btns"><button class="full" data-ok>Crear barbería</button></div>');
    h.q('[data-ok]').onclick = (ev) => C.accion(ev.target, async () => {
      const d = { barberia: h.q('[data-b]').value.trim(), nombre: h.q('[data-n]').value.trim(), email: h.q('[data-e]').value.trim().toLowerCase(), telefono: h.q('[data-t]').value.trim(), clave: K.claveNueva(), tipo: 'owner' };
      if (!d.barberia || !d.nombre || !d.email) throw new Error('Completa nombre de la barbería, dueño y correo');
      const r = await K.crearUsuario(d);
      h.cerrar();
      enviarAcceso(Object.assign(d, { codigo: r.codigo }));
      pintarBarberias();
    }).catch((e) => { h.q('[data-err]').textContent = e.message; });
  }

  function enviarAcceso(d) {
    const msg = K.mensajeAcceso(Object.assign({}, d, { barberia: d.barberia || 'tu barbería' })) +
      (d.nuevo === false ? '' : '\n\n💈 Primeros pasos: en Más → Servicios agrega tus cortes, en Ajustes tu horario y datos de pago, y en Clientes crea a tus clientes.');
    const h = C.hoja('<h2>✅ ' + (d.nuevo === false ? 'Clave restablecida' : 'Barbería creada') + '</h2><textarea readonly style="min-height:200px">' + esc(msg) + '</textarea>' +
      '<div class="btns" style="flex-direction:column"><a class="btn wsp full" target="_blank" rel="noopener" href="' + (d.telefono ? C.wa(d.telefono, msg) : 'https://wa.me/?text=' + encodeURIComponent(msg)) + '">💬 Enviar por WhatsApp</a>' +
      '<button class="gris full" data-c>📋 Copiar</button></div>');
    h.q('[data-c]').onclick = () => C.copiar(msg);
  }

  async function fichaBarberia(b) {
    const h = C.hoja('<h2><span class="av sm" style="' + C.fondo(b.logo) + '">' + (b.logo ? '' : '💈') + '</span> ' + esc(b.nombre) + '</h2>' +
      '<p class="muted" style="margin-top:-6px">' + esc(b.dueno) + ' · ' + esc(b.email) + (b.whatsapp ? ' · ' + esc(b.whatsapp) : '') + '<br>Código: <b>' + esc(b.codigo) + '</b> · creada ' + P.fechaCorta(b.created_at) + '</p>' +
      '<div class="card ' + (b.premium ? 'oro-marco' : '') + '" style="box-shadow:none"><b>' + (b.premium ? '⭐ Premium hasta ' + P.fechaCorta(b.premium_until) : 'Plan Free') + '</b>' +
      '<div class="btns"><button class="oro small" data-act>⭐ Activar 1 mes</button><button class="small gris" data-key>🔑 Generar key</button>' + (b.premium ? '<button class="small gris" data-quitar>Quitar Premium</button>' : '') + '</div></div>' +
      '<div data-recos></div><div data-det><p class="muted">Cargando detalle…</p></div>' +
      '<div class="btns"><button class="gris" data-chat>💬 Escribir</button>' + (b.whatsapp ? '<a class="btn wsp" target="_blank" rel="noopener" href="' + C.wa(b.whatsapp, 'Hola ' + b.dueno.split(' ')[0] + ' 👋') + '">WhatsApp</a>' : '') +
      '<button class="gris" data-agenda>📅 Ver agenda</button><button class="gris" data-clave>🔑 Restablecer clave</button>' +
      '<button class="' + (b.suspended ? 'ok' : 'danger') + '" data-sus>' + (b.suspended ? 'Reactivar' : 'Suspender') + '</button></div>');
    const rec = recomendaciones(b);
    h.q('[data-recos]').innerHTML = rec.length ? '<h3>💡 Recomendaciones</h3>' + rec.map((r, i) => '<div class="reco"><span style="font-size:20px">' + r[0] + '</span><div class="grow">' + esc(r[1]) + '</div><button class="small alt" data-r="' + i + '">Enviar</button></div>').join('') : '';
    h.qa('[data-r]').forEach((x) => x.onclick = () => enviarTip(b, rec[+x.dataset.r][2]));
    h.q('[data-act]').onclick = (ev) => C.accion(ev.target, async () => { await K.rpc('admin_activar', { p_user: b.owner_id, p_meses: 1, p_precio: null }); K.despertarEnvios(); h.cerrar(); pintarBarberias(); }, '⭐ Premium activado por 1 mes');
    h.q('[data-key]').onclick = () => { h.cerrar(); generarKey('barberia', b.nombre, b.whatsapp); };
    if (h.q('[data-quitar]')) h.q('[data-quitar]').onclick = async () => { if (await C.confirmar('¿Quitar el Premium de ' + b.nombre + '?', { si: 'Quitar', peligro: true })) { await K.rpc('admin_quitar_premium', { p_user: b.owner_id }); h.cerrar(); pintarBarberias(); } };
    h.q('[data-chat]').onclick = () => { h.cerrar(); mostrar('chat'); Chat.abrir(b.owner_id, { nombre: b.dueno + ' · ' + b.nombre, rol: 'owner' }); };
    h.q('[data-sus]').onclick = async () => {
      if (!await C.confirmar(b.suspended ? 'Reactivar la barbería y su equipo.' : 'Nadie de esta barbería (equipo y clientes) podrá usar la app hasta que la reactives.', { si: b.suspended ? 'Reactivar' : 'Suspender', peligro: !b.suspended })) return;
      await K.rpc('admin_suspender', { p_user: b.owner_id, p_suspender: !b.suspended }); h.cerrar(); pintarBarberias();
    };
    h.q('[data-clave]').onclick = async () => {
      if (!await C.confirmar('Se le pondrá una clave genérica nueva al dueño.', { si: 'Restablecer' })) return;
      try { const clave = K.claveNueva(); await K.restablecerClave(b.owner_id, clave); h.cerrar(); enviarAcceso({ nombre: b.dueno, email: b.email, telefono: b.whatsapp, clave, codigo: b.codigo, barberia: b.nombre, nuevo: false }); }
      catch (e) { C.toast('⚠️ ' + e.message, 4500); }
    };
    h.q('[data-agenda]').onclick = () => { h.cerrar(); verAgenda(b); };
    try {
      const d = await K.rpc('admin_barberia', { p_id: b.id });
      const barras = (obj, etq) => {
        const ent = Object.entries(obj || {}).sort((x, y) => +x[0] - +y[0]);
        const max = Math.max(1, ...ent.map((x) => x[1]));
        return ent.length ? '<div class="barras">' + ent.map(([k, v]) => '<div class="b"><span>' + etq(k) + '</span><span class="t"><i style="width:' + Math.round(v / max * 100) + '%"></i></span><span>' + v + '</span></div>').join('') + '</div>' : '<p class="muted">Sin datos.</p>';
      };
      const maxMes = Math.max(1, ...d.meses.map((m) => m.ventas));
      h.q('[data-det]').innerHTML =
        '<h3>📈 Ventas por mes</h3>' + (d.meses.length ? '<div class="barras">' + d.meses.map((m) => '<div class="b"><span>' + m.mes + '</span><span class="t"><i style="width:' + Math.round(m.ventas / maxMes * 100) + '%"></i></span><span>' + C.plata(m.ventas) + '</span></div>').join('') + '</div>' : '<p class="muted">Aún no anota ventas.</p>') +
        '<h3>💈 Equipo (este mes)</h3><table class="tabla">' + d.equipo.map((e) => '<tr><td>' + esc(e.nombre) + (e.rol === 'owner' ? ' (dueño)' : '') + '<div class="muted chico">' + (e.last_seen ? 'activo ' + C.hace(e.last_seen) : 'nunca entró') + '</div></td><td class="n">' + e.atendidas + ' cortes</td><td class="n">' + C.plata(e.ventas) + '</td></tr>').join('') + '</table>' +
        '<h3>✂️ Catálogo</h3>' + (d.catalogo.length ? '<table class="tabla">' + d.catalogo.map((s) => '<tr><td>' + esc(s.nombre) + '</td><td class="n">' + s.duracion + ' min</td><td class="n">' + C.plata(s.precio) + '</td></tr>').join('') + '</table>' : '<p class="muted">Sin servicios.</p>') +
        '<h3>🔥 Más pedidos (90 días)</h3>' + (d.servicios.length ? d.servicios.map((s) => esc(s.nombre) + ' (' + s.veces + ')').join(' · ') : '<span class="muted">Sin datos.</span>') +
        '<h3>🕐 Horas pico</h3>' + barras(d.horas, (k) => C.pad(k) + ':00') + '<h3>📆 Días pico</h3>' + barras(d.dias, (k) => C.DIAS[k - 1]) +
        '<h3>⚙️ Configuración</h3><p class="muted chico">Abono: ' + C.plata(b.abono) + '<br>' + (b.horario || []).map((x, i) => C.DIAS[i] + ': ' + esc(A.horarioTxt(x))).join('<br>') + '</p>';
    } catch (e) { h.q('[data-det]').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; }
  }

  // Agenda de una barbería (solo lectura).
  async function verAgenda(b) {
    let f = C.hoy();
    const h = C.hoja('<h2>📅 ' + esc(b.nombre) + '</h2><div class="barra-cal flex" style="margin-bottom:8px"><button class="icono" data-a>‹</button><b class="grow centro" data-t></b><button class="icono" data-s>›</button></div><div data-tl></div>');
    h.q('.panel').style.maxWidth = '1000px';
    const pintar = async () => {
      h.q('[data-t]').textContent = C.fechaLarga(f);
      try {
        const [d, eq] = await Promise.all([K.rpc('ocupacion', { p_desde: f, p_hasta: f, p_barberia: b.id }), K.rpc('admin_barberia', { p_id: b.id })]);
        const cols = eq.equipo.map((e) => ({ f, barbero: e.id, titulo: esc(e.nombre.split(' ')[0]), hoy: f === C.hoy() }));
        const hor = Object.fromEntries(eq.equipo.map((e) => [e.id, b.horario]));
        A.timeline(h.q('[data-tl]'), { cols, datos: d, horarios: hor, staff: true, ancho: 110 });
      } catch (e) { h.q('[data-tl]').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; }
    };
    h.q('[data-a]').onclick = () => { f = C.sumarDias(f, -1); pintar(); };
    h.q('[data-s]').onclick = () => { f = C.sumarDias(f, 1); pintar(); };
    pintar();
  }

  function fichaUsuario(u) {
    const plan = u.rol === 'owner' || u.rol === 'client';
    const h = C.hoja('<h2>' + esc(u.nombre) + (u.premium ? ' <span class="pill oro">⭐ Premium</span>' : '') + '</h2>' +
      '<p class="muted" style="margin-top:-6px">' + esc(u.email) + '<br>' + ({ owner: 'Dueño', barber: 'Barbero', client: 'Cliente' }[u.rol]) + ' · ' + esc(u.barberia || '') +
      (u.telefono ? ' · ' + esc(u.telefono) : '') + '<br>Creado ' + P.fechaCorta(u.created_at) + ' · ' + (u.last_seen ? 'activo ' + C.hace(u.last_seen) : 'nunca entró') +
      (u.premium && u.premium_until ? '<br>⭐ Premium hasta ' + P.fechaCorta(u.premium_until) : '') + (u.trial_used ? '<br>🎁 Ya usó su prueba' : '') + '</p>' +
      '<div class="btns">' + (plan ? '<button class="oro small" data-act>⭐ Activar 1 mes</button><button class="small gris" data-key>🔑 Generar key</button>' + (u.premium ? '<button class="small gris" data-q>Quitar Premium</button>' : '') : '') +
      '<button class="small gris" data-clave>🔑 Restablecer clave</button><button class="small ' + (u.suspended ? 'ok' : 'danger') + '" data-sus>' + (u.suspended ? 'Reactivar' : 'Suspender') + '</button></div>');
    if (h.q('[data-act]')) h.q('[data-act]').onclick = (ev) => C.accion(ev.target, async () => { await K.rpc('admin_activar', { p_user: u.id, p_meses: 1, p_precio: null }); K.despertarEnvios(); h.cerrar(); pintarBarberias(); }, '⭐ Activado');
    if (h.q('[data-key]')) h.q('[data-key]').onclick = () => { h.cerrar(); generarKey(u.rol === 'owner' ? 'barberia' : 'cliente', u.nombre, u.telefono); };
    if (h.q('[data-q]')) h.q('[data-q]').onclick = async () => { await K.rpc('admin_quitar_premium', { p_user: u.id }); h.cerrar(); pintarBarberias(); };
    h.q('[data-sus]').onclick = async () => { await K.rpc('admin_suspender', { p_user: u.id, p_suspender: !u.suspended }); h.cerrar(); pintarBarberias(); };
    h.q('[data-clave]').onclick = async () => {
      try { const clave = K.claveNueva(); await K.restablecerClave(u.id, clave); h.cerrar(); enviarAcceso({ nombre: u.nombre, email: u.email, telefono: u.telefono, clave, barberia: u.barberia, nuevo: false }); }
      catch (e) { C.toast('⚠️ ' + e.message, 4500); }
    };
  }

  /* ---------- Keys ---------- */
  async function keys() {
    const el = $('v-keys');
    el.innerHTML = '<div class="card"><h2>🔑 Generar key mensual</h2><p class="muted chico" style="margin-top:-4px">Una key = 1 mes de Premium (' + C.plata(precio()) + '). La persona la pega en Mi plan → "Tengo una key". Queda registrada con su fecha de término.</p>' +
      '<div class="btns" style="margin-top:6px"><button data-g="barberia">💈 Key para barbería</button><button class="alt" data-g="cliente">👤 Key para cliente</button></div></div>' +
      '<div class="card"><h2>📜 Historial</h2><div id="lKeys"><p class="muted">Cargando…</p></div></div>';
    el.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => generarKey(b.dataset.g, '', ''));
    let l = [];
    try { l = await K.rpc('admin_keys'); } catch (e) { $('lKeys').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
    $('lKeys').innerHTML = l.length ? '<div class="scroll-x"><table class="tabla"><tr><th>Key</th><th>Para</th><th>Vigencia</th><th class="n">Monto</th><th></th></tr>' + l.map((k) =>
      '<tr><td><code style="font-size:12px">' + esc(k.key) + '</code><div class="muted chico">' + (k.tipo === 'barberia' ? '💈 barbería' : '👤 cliente') + ' · ' + ({ key: 'key', directo: 'directo', solicitud: 'solicitud' }[k.origen]) + '</div></td>' +
      '<td>' + esc(k.usada_por || k.para || '—') + (k.barberia && k.tipo === 'cliente' ? '<div class="muted chico">' + esc(k.barberia) + '</div>' : '') + '</td>' +
      '<td>' + (k.revoked ? '<span class="pill bad">revocada</span>' : k.inicio ? P.fechaCorta(k.inicio) + ' → <b>' + P.fechaCorta(k.termino) + '</b>' + (new Date(k.termino) < Date.now() ? ' <span class="pill">vencida</span>' : ' <span class="pill ok">vigente</span>') : '<span class="pill warn">sin usar</span>') + '</td>' +
      '<td class="n">' + C.plata(k.precio) + '</td><td>' + (!k.revoked ? '<button class="small gris" data-cp="' + esc(k.key) + '">📋</button>' + (!k.inicio || new Date(k.termino) > Date.now() ? ' <button class="small danger" data-rv="' + k.id + '">✕</button>' : '') : '') + '</td></tr>').join('') +
      '</table></div>' : '<p class="muted">Aún no hay keys.</p>';
    $('lKeys').querySelectorAll('[data-cp]').forEach((b) => b.onclick = () => C.copiar(b.dataset.cp));
    $('lKeys').querySelectorAll('[data-rv]').forEach((b) => b.onclick = async () => {
      if (!await C.confirmar('Revocar la key. Si ya estaba en uso, el Premium de esa cuenta termina ahora.', { si: 'Revocar', peligro: true })) return;
      await K.rpc('admin_revocar_key', { p_id: b.dataset.rv }); keys();
    });
  }

  async function generarKey(tipo, para, telefono) {
    const nombre = await C.pedir(tipo === 'barberia' ? '💈 Key para barbería' : '👤 Key para cliente', { texto: '¿Para quién es? (queda en el historial)', valor: para, placeholder: 'Nombre' });
    if (nombre === null) return;
    try {
      const k = await K.rpc('admin_crear_key', { p_tipo: tipo, p_para: nombre, p_meses: 1, p_precio: null, p_nota: null });
      const msg = '⭐ ¡Tu Premium de 1 mes está listo!\n\nTu key: ' + k.key + '\n\nEntra a la app → ' + (tipo === 'barberia' ? 'Más → Mi plan' : 'Perfil → Mi plan') + ' → "Tengo una key" y pégala. ¡Gracias! 💈';
      const h = C.hoja('<h2>🔑 Key creada</h2><div class="key-nueva"><code class="key">' + esc(k.key) + '</code><div class="muted chico">1 mes · ' + C.plata(k.precio) + ' · ' + (tipo === 'barberia' ? 'barbería' : 'cliente') + '</div></div>' +
        '<div class="btns" style="flex-direction:column"><a class="btn wsp full" target="_blank" rel="noopener" href="' + (telefono ? C.wa(telefono, msg) : 'https://wa.me/?text=' + encodeURIComponent(msg)) + '">💬 Enviar por WhatsApp</a>' +
        '<button class="gris full" data-c>📋 Copiar key</button></div>');
      h.q('[data-c]').onclick = () => C.copiar(k.key);
      if (vistaActual === 'keys') keys();
    } catch (e) { C.toast('⚠️ ' + e.message); }
  }

  /* ---------- Ajustes ---------- */
  async function pintarAjustes() {
    const el = $('v-ajustes');
    ajustes = await K.ajustes();
    let sec = {};
    try { sec = await K.rpc('admin_secretos_estado'); } catch (e) { /* nada */ }
    el.innerHTML =
      '<div class="card"><h2>💎 Venta de Premium</h2><label>Precio mensual (barbería y cliente)</label><input data-k="precio_premium" type="number" inputmode="numeric" value="' + esc(ajustes.precio_premium || 4900) + '">' +
      '<label>Link de pago (Mercado Pago)</label><input data-k="link_pago" placeholder="https://mpago.la/…" value="' + esc(ajustes.link_pago || '') + '">' +
      '<label>Datos de transferencia <span class="opc">(opcional)</span></label><textarea data-k="datos_transferencia" maxlength="300">' + esc(ajustes.datos_transferencia || '') + '</textarea>' +
      '<label>Tu WhatsApp de contacto</label><input data-k="whatsapp_admin" inputmode="tel" value="' + esc(ajustes.whatsapp_admin || '') + '">' +
      '<div class="btns"><button id="bGuardarV">Guardar</button></div></div>' +
      '<div class="card"><h2>📣 Aviso a todos</h2><label>Para</label><select id="dPara"><option value="barberias">Todas las barberías (dueños)</option><option value="equipos">Dueños y barberos</option>' +
      '<option value="barberias_free">Barberías Free</option><option value="barberias_premium">Barberías Premium</option><option value="clientes">Todos los clientes</option><option value="todos">Todos</option>' +
      barberias.map((b) => '<option value="barberia:' + b.id + '">Solo ' + esc(b.nombre) + ' (equipo y clientes)</option>').join('') + '</select>' +
      '<label>Título</label><input id="dTit" maxlength="90"><label>Mensaje</label><textarea id="dCuerpo" maxlength="300"></textarea>' +
      '<div class="btns"><button id="bDifundir">📣 Enviar</button></div><div id="lDif"></div></div>' +
      '<div class="card"><h2>🔔 Notificaciones push</h2><p>' + (sec.vapid_public && sec.vapid_private ? '✅ Claves push configuradas' : '⚠️ Falta generar las claves push (una sola vez)') + '</p>' +
      '<div class="btns"><button class="gris" id="bVapid">' + (sec.vapid_public ? 'Regenerar claves' : 'Generar claves push') + '</button><button class="gris" id="bPing">🩺 Probar servidor</button>' +
      '<button class="gris" id="bPrueba">Enviarme un aviso de prueba</button></div></div>' +
      '<div class="card"><h2>🔄 Versión</h2><p>App: <b>v' + C.version + '</b> · Liberada para todos: <b>' + esc(ajustes.version_liberada || '—') + '</b></p>' +
      '<p class="muted chico">Cuando subo una versión nueva, primero la ves solo tú. Pruébala y libérala para que a todos les aparezca "Actualizar".</p>' +
      '<div class="btns"><button id="bLiberar">Liberar v' + C.version + ' para todos</button></div></div>' +
      '<div id="perfilAdmin"></div>';
    $('bGuardarV').onclick = (ev) => C.accion(ev.target, async () => {
      for (const i of el.querySelectorAll('[data-k]')) await K.rpc('admin_ajuste', { p_key: i.dataset.k, p_value: i.value });
      ajustes = await K.ajustes();
    }, '✅ Guardado');
    $('bDifundir').onclick = (ev) => C.accion(ev.target, async () => {
      const n = await K.rpc('admin_difundir', { p_titulo: $('dTit').value, p_cuerpo: $('dCuerpo').value, p_para: $('dPara').value });
      K.despertarEnvios();
      C.toast('📣 Enviado a ' + n + ' persona' + (n === 1 ? '' : 's'));
      $('dTit').value = $('dCuerpo').value = '';
      difusiones();
    });
    $('bVapid').onclick = (ev) => C.accion(ev.target, async () => {
      if (sec.vapid_public && !await C.confirmar('Si regeneras las claves, todos deberán volver a activar las notificaciones.', { si: 'Regenerar', peligro: true })) return;
      const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
      const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      await K.rpc('admin_secreto', { p_name: 'vapid_private', p_value: jwk.d });
      await K.rpc('admin_secreto', { p_name: 'vapid_public', p_value: b64u(raw) });
      await K.activarPush().catch(() => {});
      pintarAjustes();
    }, '🔔 Claves push listas');
    $('bPing').onclick = (ev) => C.accion(ev.target, async () => {
      const r = await K.probarServidor();
      C.toast(r.servicio ? '✅ Función "enviar" v' + r.version + ' funcionando' : '⚠️ La función responde, pero le falta la clave de servidor', 4500);
    });
    $('bPrueba').onclick = (ev) => C.accion(ev.target, async () => {
      await K.activarPush();
      await K.rpc('aviso_prueba');
      K.despertarEnvios();
    }, '🔔 Aviso de prueba enviado: debería llegarte en segundos');
    $('bLiberar').onclick = (ev) => C.accion(ev.target, async () => { await K.rpc('admin_ajuste', { p_key: 'version_liberada', p_value: C.version }); pintarAjustes(); }, '🔄 Versión liberada');
    difusiones();
    P.perfil($('perfilAdmin'), { tour: () => {} });
  }

  async function difusiones() {
    let l = [];
    try { l = await K.rpc('admin_difusiones'); } catch (e) { return; }
    const z = $('lDif');
    if (!z) return;
    z.innerHTML = l.length ? '<h3>Enviados</h3><ul class="list">' + l.map((d, i) => '<li class="tap" data-d="' + i + '"><div class="grow"><b>' + esc(d.titulo) + '</b><div class="sub">' + C.hace(d.created_at) + ' · ' + d.total + ' destinatarios</div></div>' +
      '<span class="chico" style="text-align:right"><span class="ticks">✓✓</span> ' + d.recibidos + '<br><span class="ticks visto">✓✓</span> ' + d.vistos + ' vistos</span></li>').join('') + '</ul>' : '';
    z.querySelectorAll('[data-d]').forEach((li) => li.onclick = () => {
      const d = l[+li.dataset.d];
      C.hoja('<h2>📣 ' + esc(d.titulo) + '</h2><p class="muted">' + esc(d.cuerpo) + '</p><ul class="list">' + d.detalle.map((x) => '<li><span class="grow">' + esc(x.nombre) + '</span>' +
        (x.visto_at ? '<span class="chico"><span class="ticks visto">✓✓</span> ' + C.cuando(x.visto_at) + '</span>' : '<span class="muted chico">no lo ha visto</span>') + '</li>').join('') + '</ul>');
    });
  }

  ruta();
  K.revisarActualizacion();
})();
