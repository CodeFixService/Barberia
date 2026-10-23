/* Panel del super admin (Josué): resumen y servidor, barberías, pagos con comprobante, mensajes y ajustes (precios, planes, reglas, textos…). */
(async function () {
  'use strict';
  const C = Core, K = Cuenta, A = Agenda, P = Perfil;
  const $ = C.$, esc = C.esc;
  C.registrarSW();

  const yo = await K.exigir(['admin', 'socio']);
  // v2.1: el socio ve y gestiona como el admin según sus permisos, pero no crea ni borra.
  const esAdmin = !!yo.is_admin;
  const permiso = (k) => esAdmin || !!(yo.permisos || {})[k];
  Avisos.montar({ titulo: 'CodeFix · Barberías', sub: esAdmin ? 'Administrador general' : 'Socio CodeFix' });
  if (!permiso('pagos')) { const t = document.querySelector('nav.tabs [data-v="pagos"]'); if (t) t.remove(); }
  C.marca();
  let barberias = [];
  let ajustes = await K.ajustes();
  const MB = (b) => (b / 1048576).toFixed(1) + ' MB';

  /* ---------- Navegación ---------- */
  let vistaActual = 'resumen';
  const VISTAS = { resumen, barberias: pintarBarberias, pagos, chat: () => Chat.montar($('v-chat')), ajustes: pintarAjustes };
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
    if (v === 'registro') { mostrar('ajustes'); abrirAjuste('registro'); return; }
    mostrar(VISTAS[v] ? v : 'resumen');
  }
  addEventListener('hashchange', ruta);
  Avisos.alCambiar((r, antes) => { if (antes.cargado && r.pendientes !== antes.pendientes) { if (vistaActual === 'pagos') pagos(); if (vistaActual === 'resumen') resumen(); } });

  const flecha = (a, b) => {
    if (!b && !a) return '';
    if (!b) return ' <span class="flecha up">↑</span>';
    const p = Math.round((a - b) / b * 100);
    return ' <span class="flecha ' + (p >= 0 ? 'up' : 'down') + '">' + (p >= 0 ? '↑' : '↓') + Math.abs(p) + '%</span>';
  };
  const diasDesde = (t) => t ? Math.floor((Date.now() - new Date(t)) / 864e5) : null;
  const nota = (n) => n && n.total ? '<span class="nota">' + n.promedio + '</span>' : '';

  // Recomendaciones automáticas para cada barbería (se pueden enviar por el chat de soporte).
  function recomendaciones(b) {
    const r = [];
    const sinUso = diasDesde(b.ultima_actividad);
    if (sinUso === null || sinUso >= 7) r.push(['😴', 'Lleva ' + (sinUso === null ? 'mucho tiempo' : sinUso + ' días') + ' sin entrar a la app.', 'Hola 👋 ¿Cómo va todo con la app? Si necesitas ayuda para configurar tu agenda o tu link de reservas, aquí estoy.']);
    if (!b.cobra_abono) r.push(['💳', 'No tiene link de pago ni datos de transferencia: no recibe reservas sin cuenta.', 'Tip 💡: en Más → Links de pago pon tu link de Mercado Pago o tus datos de transferencia. Así tus clientes reservan solos desde tu link o QR.']);
    if (b.servicios < 3) r.push(['✂️', 'Tiene solo ' + b.servicios + ' servicio(s) en su catálogo.', 'Tip 💡: agrega más servicios a tu catálogo (barba, cejas, combos). Los clientes reservan más cuando ven todas las opciones con precio.']);
    if (b.reservas === 0) r.push(['📵', 'Nadie reservó por la app este mes.', 'Tip 💡: comparte tu link o QR (Más → Enlace y QR) en tu local, Instagram y WhatsApp. Tus clientes reservan sin crear cuenta.']);
    const tasaNV = b.atendidas + b.no_vino ? b.no_vino / (b.atendidas + b.no_vino) : 0;
    if (b.no_vino >= 2 && tasaNV > 0.12) r.push(['🚫', Math.round(tasaNV * 100) + '% de "No vino" este mes.', 'Tip 💡: muchos clientes no están llegando. Califícalos después de cada visita: los de pocas estrellas quedan en tu lista negra.' + (b.premium ? '' : ' Con Premium además reciben recordatorios 24 h y 2 h antes.')]);
    if (b.fin_de_semana >= 3) r.push(['📅', 'Le piden harto el fin de semana (' + b.fin_de_semana + ' horas).', 'Tip 💡: tus clientes están pidiendo horas el fin de semana. Si puedes, amplía tu horario del sábado en Más → Horario.']);
    if (!b.ofertas) r.push(['🏷️', 'No tiene ofertas activas.', 'Tip 💡: publica una oferta (ej. "Martes de barba a $X"). A tus clientes les llega un aviso al tiro y suben las reservas en días flojos.']);
    if (b.ventas_ant && b.ventas < b.ventas_ant * 0.8) r.push(['📉', 'Ventas ' + Math.round((1 - b.ventas / b.ventas_ant) * 100) + '% bajo el mes pasado.', 'Hola 👋 Vi que este mes vas un poco más lento. ¿Te ayudo a armar una oferta para tus clientes?']);
    const cf = K.limite('clientes', false), cp = K.limite('clientes', true), bf = K.limite('barberos', false), bp = K.limite('barberos', true);
    if (!b.premium && b.clientes >= Math.ceil(cf * 0.8)) r.push(['💎', 'Cerca del límite Free (' + b.clientes + '/' + cf + ' clientes con cuenta).', 'Hola 👋 Estás cerca del máximo de ' + cf + ' clientes con cuenta del plan Free. Con Premium puedes tener hasta ' + cp + '. ¿Te cuento?']);
    if (!b.premium && b.barberos >= bf) r.push(['💈', 'Tiene el máximo de barberos Free (' + bf + ').', 'Hola 👋 Ya tienes ' + bf + ' barberos, el máximo Free. Con Premium puedes sumar hasta ' + bp + ' y ver la caja y estadísticas de cada uno.']);
    if (b.premium && b.premium_until && new Date(b.premium_until) - Date.now() < 5 * 864e5) r.push(['⏳', 'Su Premium vence el ' + P.fechaCorta(b.premium_until) + '.', 'Hola 👋 Tu Premium vence el ' + P.fechaCorta(b.premium_until) + '. Para renovar, paga en Más → Mi plan y sube tu comprobante. ¡Gracias por confiar en nosotros!']);
    return r;
  }

  /* ---------- Resumen ---------- */
  async function resumen() {
    const el = $('v-resumen');
    el.innerHTML = '<p class="muted centro">Cargando…</p>';
    let s, rep, uso, web = '';
    try {
      [s, rep, barberias, uso] = await Promise.all([K.rpc('admin_resumen'), K.rpc('admin_reportes'), K.rpc('admin_barberias'), K.rpc('admin_uso')]);
    } catch (e) { el.innerHTML = '<div class="card err">' + esc(e.message) + '<br><span class="muted">¿Corriste la consulta de actualización en Supabase? (Ajustes → Versión)</span></div>'; return; }
    try { web = String((await (await fetch(C.raiz() + 'version.json', { cache: 'no-store' })).json()).version); } catch (e) { /* sin red */ }
    let html = '';
    if (web && s.db_version && s.db_version !== web) html += '<div class="banner alerta"><div class="grow"><b>🗄️ La base de datos es la versión ' + esc(s.db_version) + ' y la app la ' + esc(web) + '</b><br>' +
      '<span class="chico">Copia la consulta en Ajustes → Versión y córrela en Supabase.</span></div><button class="small" id="bIrVer">Ver</button></div>';
    if (!(await K.pushActivo())) html += '<div class="banner marca"><div class="grow"><b>🔔 Activa las notificaciones</b><br><span class="chico">Para enterarte al tiro de los pagos por revisar.</span></div><button class="small" id="bPush">Activar</button></div>';
    if (s.pagos_por_revisar && permiso('pagos')) html += '<div class="card urgente tap" id="cPagos"><div class="flex"><span style="font-size:28px">💰</span><div class="grow"><b>' + s.pagos_por_revisar + ' pago(s) Premium por revisar</b>' +
      '<div class="sub muted">Revisa el comprobante y apruébalo o recházalo con motivo.</div></div><span>›</span></div></div>';
    const pct = Math.round(uso.db_bytes / uso.limite * 100);
    html += '<div class="stats">' +
      '<div class="card"><small>Barberías</small><b>' + s.barberias + '</b><small>⭐ ' + s.barberias_premium + ' Premium</small></div>' +
      '<div class="card"><small>Clientes con cuenta</small><b>' + s.clientes + '</b><small>⭐ ' + s.clientes_premium + ' Premium</small></div>' +
      '<div class="card"><small>Ingresos del mes</small><b>' + C.plata(s.ingresos_mes) + '</b><small>Total ' + C.plata(s.ingresos_total) + '</small></div>' +
      '<div class="card"><small>Reservas del mes</small><b>' + s.reservas_mes + '</b><small>' + s.invitados_mes + ' sin cuenta</small></div>' +
      '<div class="card"><small>Abonos en revisión</small><b>' + s.en_revision + '</b><small>en todas las barberías</small></div>' +
      '<div class="card"><small>Por vencer (7 días)</small><b>' + s.por_vencer + '</b></div>' +
      '<div class="card"><small>🔁 Renovación (30 días)</small><b>' + (s.renovacion && s.renovacion.vencieron ? Math.round(s.renovacion.renovaron / s.renovacion.vencieron * 100) + '%' : '—') + '</b>' +
        '<small>' + (s.renovacion ? s.renovacion.renovaron + ' de ' + s.renovacion.vencieron + ' renovaron' : '') + '</small></div>' +
      '<div class="card"><small>💈 Se registraron solas</small><b>' + (s.registradas_mes || 0) + '</b><small>este mes</small></div></div>';
    // v2.1: QR para que cualquier barbería cree su app (con el código del socio, si es socio).
    html += '<div class="card tap" id="cQrReg"><div class="flex"><span style="font-size:30px">🔳</span><div class="grow"><b>Link y QR para nuevas barberías</b>' +
      '<div class="sub muted">Cualquier barbería crea su app sola' + (K.regla('dias_regalo') ? ', con ' + K.regla('dias_regalo') + ' días de Premium de regalo' : '') +
      (esAdmin ? '' : '. Las que entren con tu link quedan a tu nombre') + (K.regla('registro_barberias') ? '' : ' · ⚠️ el registro está cerrado (Ajustes → Reglas)') + '.</div></div><span>›</span></div></div>';
    html += '<div id="cVencer"></div>';
    // Servidor
    html += '<div class="card"><h2>🖥️ Servidor <span class="grow"></span><span class="pill ' + (pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : 'ok') + '">' + (pct >= 90 ? '🔴' : pct >= 70 ? '🟡' : '🟢') + ' ' + pct + '%</span></h2>' +
      '<div class="sub muted">Base de datos: ' + MB(uso.db_bytes) + ' de ' + MB(uso.limite) + ' (plan gratis de Supabase) · versión ' + esc(s.db_version || '—') + '</div>' +
      '<div class="barras" style="margin:10px 0"><div class="b"><span>Usado</span><span class="t"><i style="width:' + Math.min(100, pct) + '%"></i></span><span>' + pct + '%</span></div></div>' +
      '<details><summary class="muted chico">Tamaño por tabla</summary><table class="tabla">' + uso.tablas.slice(0, 15).map((t) => '<tr><td>' + esc(t.tabla) + '</td><td class="n">' + (t.filas >= 0 ? t.filas : '') + ' filas</td><td class="n">' + MB(t.bytes) + '</td></tr>').join('') + '</table></details>' +
      '<p class="muted chico">Fotos guardadas: ' + uso.comprobantes + ' comprobante(s) y ' + uso.fotos_chat + ' foto(s) del chat. Se borran solas a los ' + K.regla('dias_comprobantes') + ' días; nunca se borra un comprobante en revisión.</p>' +
      (permiso('eliminar') ? '<div class="btns"><button class="small gris" data-limpiar="comprobantes">🧾 Comprobantes de +7 días</button><button class="small gris" data-limpiar="fotos_chat">🖼️ Fotos del chat de +7 días</button>' +
      '<button class="small gris" data-limpiar="avisos">🔔 Avisos de +2 días</button><button class="small gris" data-limpiar="anuladas">❌ Horas anuladas de +7 días</button></div>' : '') + '</div>';
    if (rep.length) html += '<div class="card"><h2>🚩 Reportes (' + rep.length + ')</h2><ul class="list">' + rep.map((r) => '<li><div class="grow"><b>' + esc(r.de) + ' reportó a ' + esc(r.contra) + '</b><div class="sub">' + esc(r.reason) + ' · "' + esc(r.excerpt || '') + '"</div></div>' +
      '<button class="small gris" data-rok="' + r.id + '">Ignorar</button><button class="small danger" data-rsus="' + r.id + '">Suspender</button></li>').join('') + '</ul></div>';
    const top = barberias.slice().sort((a, b) => b.ventas - a.ventas);
    html += '<div class="card"><h2>🏆 Ranking del mes</h2>' + (top.length ? '<div class="scroll-x"><table class="tabla"><tr><th>#</th><th>Barbería</th><th class="n">Ventas</th><th class="n">Reservas</th><th class="n">Nota</th></tr>' +
      top.slice(0, 10).map((b, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(b.nombre) + (b.premium ? ' ⭐' : '') + '</td><td class="n">' + C.plata(b.ventas) + flecha(b.ventas, b.ventas_ant) + '</td><td class="n">' + b.reservas + flecha(b.reservas, b.reservas_ant) + '</td><td class="n">' + nota(b.calificacion) + '</td></tr>').join('') +
      '</table></div>' : '<p class="muted">Aún no hay barberías. Créalas en la pestaña 💈.</p>') + '</div>';
    const recos = barberias.flatMap((b) => recomendaciones(b).slice(0, 2).map((r) => [b, r]));
    if (recos.length) html += '<div class="card"><h2>💡 Recomendaciones</h2>' + recos.slice(0, 12).map(([b, r], i) =>
      '<div class="reco"><span style="font-size:20px">' + r[0] + '</span><div class="grow"><b>' + esc(b.nombre) + '</b>: ' + esc(r[1]) + '</div><button class="small alt" data-reco="' + i + '">Enviar tip</button></div>').join('') + '</div>';
    el.innerHTML = html;
    if ($('bPush')) $('bPush').onclick = (ev) => C.accion(ev.target, async () => { await K.activarPush(); resumen(); }, '🔔 Activadas');
    if ($('bIrVer')) $('bIrVer').onclick = () => { mostrar('ajustes'); abrirAjuste('version'); };
    if ($('cPagos')) $('cPagos').onclick = () => mostrar('pagos');
    $('cQrReg').onclick = qrRegistro;
    porVencer();
    el.querySelectorAll('[data-limpiar]').forEach((b) => b.onclick = async (ev) => {
      if (!await C.confirmar('Se borrará: ' + b.textContent.trim() + '. Lo que está en revisión no se toca. No se puede deshacer.', { si: 'Limpiar', peligro: true })) return;
      C.accion(ev.target, async () => { const r = await K.rpc('admin_limpiar', { p_que: b.dataset.limpiar }); C.toast('🧹 Listo: ' + (r.borrados || 0) + ' elemento(s)'); resumen(); });
    });
    el.querySelectorAll('[data-rok]').forEach((b) => b.onclick = async () => { await K.rpc('admin_resolver_reporte', { p_id: b.dataset.rok, p_suspender: false }); resumen(); });
    if (!permiso('cuentas')) el.querySelectorAll('[data-rsus]').forEach((b) => b.remove());
    el.querySelectorAll('[data-rsus]').forEach((b) => b.onclick = async () => { if (await C.confirmar('¿Suspender la cuenta reportada?', { si: 'Suspender', peligro: true })) { await K.rpc('admin_resolver_reporte', { p_id: b.dataset.rsus, p_suspender: true }); resumen(); } });
    el.querySelectorAll('[data-reco]').forEach((b) => b.onclick = () => { const [bb, r] = recos[+b.dataset.reco]; enviarTip(bb, r[2]); });
  }

  function qrRegistro() {
    P.compartir({ titulo: '🔳 Nuevas barberías', link: K.linkRegistro(esAdmin ? '' : yo.ref_codigo), archivo: 'qr-registro-barberias',
      texto: 'Con este link o QR <b>cualquier barbería crea su app sola</b>: su perfil, su agenda y su link para clientes.' +
        (esAdmin ? '' : '<br>Las barberías que entren con tu link quedan a tu nombre.'),
      mensaje: '💈 Crea gratis la app de reservas de tu barbería' });
  }

  // v2.1: Premium que vence este mes, con el cobro listo por WhatsApp.
  async function porVencer() {
    let l = [];
    try { l = await K.rpc('admin_por_vencer'); } catch (e) { return; }
    const z = $('cVencer');
    if (!z || !l.length) return;
    const msg = (u) => 'Hola ' + (u.nombre || '').split(' ')[0] + ' 👋 Tu Premium' + (u.rol === 'owner' && u.barberia ? ' de ' + u.barberia : '') + ' vence el ' + P.fechaCorta(u.premium_until) +
      '. Para renovar (' + C.plata(u.monto) + '), paga en la app → Mi plan y sube tu comprobante' + (K.linkTrimestral(u.rol === 'owner' ? 'barberia' : 'cliente') ? ', o paga 3 meses con descuento' : '') + '. ¡Gracias! 💈';
    z.innerHTML = '<div class="card"><h2>⏳ Vencen este mes (' + l.length + ')</h2><p class="muted chico" style="margin-top:-6px">Cóbrales antes de que vuelvan a Free.</p><ul class="list">' + l.map((u) =>
      '<li><div class="grow"><b>' + esc(u.rol === 'owner' ? (u.barberia || u.nombre) : u.nombre) + '</b> <span class="pill">' + (u.rol === 'owner' ? '💈' : '👤') + '</span>' +
      '<div class="sub">vence ' + P.fechaCorta(u.premium_until) + ' · ' + C.plata(u.monto) + (u.pago_en_revision ? ' · 🧾 pago en revisión' : '') + '</div></div>' +
      (u.telefono && !u.pago_en_revision ? '<a class="btn small wsp" target="_blank" rel="noopener" href="' + C.wa(u.telefono, msg(u)) + '">💬 Cobrar</a>' : '') + '</li>').join('') + '</ul></div>';
  }

  async function enviarTip(b, texto) {
    const t = await C.pedir('💬 Mensaje para ' + b.nombre, { largo: true, valor: texto, si: 'Enviar', max: 1000 });
    if (!t) return;
    try { await K.rpc('enviar_mensaje', { p_to: b.owner_id, p_body: t }); K.despertarEnvios(); C.toast('💬 Enviado al chat de ' + b.nombre); } catch (e) { C.toast('⚠️ ' + e.message); }
  }

  /* ---------- Barberías (y clientes / barberos) ---------- */
  let modoLista = 'barberias', filtro = 'todas';
  const FILTROS = {
    todas: () => true, premium: (b) => b.premium, free: (b) => !b.premium,
    por_vencer: (b) => b.premium && b.premium_until && new Date(b.premium_until) - Date.now() < 7 * 864e5,
    inactivas: (b) => !b.ultima_actividad || diasDesde(b.ultima_actividad) >= 14, suspendidas: (b) => b.suspended,
    solas: (b) => b.registro_solo, mias: (b) => b.socio_id === yo.id
  };
  async function pintarBarberias() {
    const el = $('v-barberias');
    el.innerHTML = '<div class="card" style="padding:12px"><div class="seg"><button data-m="barberias">💈 Barberías</button><button data-m="clientes">👥 Clientes</button><button data-m="equipo">✂️ Barberos</button></div>' +
      '<div class="flex" style="margin-top:10px"><input id="fB" placeholder="🔎 Buscar…" class="grow">' + (permiso('crear') ? '<button id="bNuevaB">+ Barbería</button>' : '<button class="gris" id="bNuevaB">🔳 QR</button>') + '</div>' +
      (modoLista === 'barberias' ? '<div class="chips" style="margin-top:10px">' + [['todas', 'Todas'], ['premium', '⭐ Premium'], ['free', 'Free'], ['por_vencer', '⏳ Por vencer'], ['inactivas', '😴 Inactivas'], ['suspendidas', '⛔ Suspendidas'],
          ['solas', '✨ Se registraron solas']].concat(esAdmin ? [] : [['mias', '🤝 Mías']])
        .map(([k, t]) => '<button class="chip' + (filtro === k ? ' on' : '') + '" data-fl="' + k + '">' + t + '</button>').join('') + '</div>' : '') +
      '</div><div id="lB"><p class="muted centro">Cargando…</p></div>';
    el.querySelectorAll('[data-m]').forEach((b) => { b.classList.toggle('on', b.dataset.m === modoLista); b.onclick = () => { modoLista = b.dataset.m; pintarBarberias(); }; });
    el.querySelectorAll('[data-fl]').forEach((b) => b.onclick = () => { filtro = b.dataset.fl; pintarBarberias(); });
    $('bNuevaB').onclick = permiso('crear') ? nuevaBarberia : qrRegistro;
    const z = $('lB');
    if (modoLista === 'barberias') {
      try { barberias = await K.rpc('admin_barberias'); } catch (e) { z.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
      const lista = barberias.filter(FILTROS[filtro]);
      z.innerHTML = lista.length ? lista.map((b) => {
        const rec = recomendaciones(b);
        return '<div class="card barb-card ' + (b.premium ? 'oro-marco' : '') + '" data-b="' + b.id + '" data-n="' + esc((b.nombre + ' ' + b.dueno + ' ' + b.email).toLowerCase()) + '">' +
          '<div class="flex"><span class="av" style="' + C.fondo(b.logo) + '">' + (b.logo ? '' : '💈') + '</span><div class="grow"><b>' + esc(b.nombre) + '</b> ' +
          (b.premium ? '<span class="pill oro">⭐ Premium</span>' : '<span class="pill">Free</span>') + (b.suspended ? ' <span class="pill bad">suspendida</span>' : '') + ' ' + nota(b.calificacion) +
          '<div class="sub muted">' + esc(b.dueno) + ' · ' + (b.ultima_actividad ? 'última conexión ' + C.hace(b.ultima_actividad) : 'nunca entró') + (b.premium && b.premium_until ? ' · vence ' + P.fechaCorta(b.premium_until) : '') +
          (b.registro_solo ? ' · ✨ se registró sola' : '') + (b.referida ? ' · 🤝 por ' + esc(b.referida) : '') + (b.socio ? ' · socio ' + esc(b.socio) : '') + '</div></div>' +
          (rec.length ? '<span class="pill warn">💡 ' + rec.length + '</span>' : '') + '</div>' +
          '<div class="metricas"><div>Ventas mes<b>' + C.plata(b.ventas) + flecha(b.ventas, b.ventas_ant) + '</b></div><div>Reservas<b>' + b.reservas + flecha(b.reservas, b.reservas_ant) + '</b></div>' +
          '<div>Sin cuenta<b>' + b.invitados + '</b></div><div>No vino<b>' + b.no_vino + '</b></div><div>Clientes<b>' + b.clientes + ' <small class="muted">⭐' + b.clientes_premium + '</small></b></div><div>Barberos<b>' + b.barberos + '</b></div></div></div>';
      }).join('') : '<div class="card empty"><span class="ico">💈</span>' + (barberias.length ? 'Ninguna barbería con este filtro.' : 'Crea tu primera barbería con <b>+ Barbería</b>.') + '</div>';
      z.querySelectorAll('[data-b]').forEach((c) => c.onclick = () => fichaBarberia(barberias.find((b) => b.id === c.dataset.b)));
    } else {
      let l = [];
      try { l = await K.rpc('admin_usuarios', { p_rol: modoLista === 'clientes' ? 'client' : null, p_barberia: null }); } catch (e) { z.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
      if (modoLista === 'equipo') l = l.filter((u) => u.rol !== 'client');
      z.innerHTML = '<div class="card"><ul class="list">' + l.map((u) => '<li class="tap" data-u="' + u.id + '" data-n="' + esc((u.nombre + ' ' + u.email + ' ' + (u.barberia || '')).toLowerCase()) + '">' +
        '<div class="grow"><b>' + esc(u.nombre) + '</b> ' + (u.premium ? '<span class="pill oro">⭐</span>' : '') + (u.suspended ? ' <span class="pill bad">suspendido</span>' : '') +
        '<div class="sub">' + esc(u.email) + ' · ' + esc(u.barberia || '') + ' · ' + ({ owner: 'Dueño', barber: 'Barbero', client: 'Cliente' }[u.rol]) +
        (u.premium_until && u.premium ? ' · hasta ' + P.fechaCorta(u.premium_until) : '') + ' · ' + C.conexion(u.last_seen).txt + '</div></div><span>›</span></li>').join('') + '</ul>' + (l.length ? '' : '<p class="muted">Nadie aún.</p>') + '</div>';
      z.querySelectorAll('[data-u]').forEach((li) => li.onclick = () => fichaUsuario(l.find((u) => u.id === li.dataset.u)));
    }
    $('fB').oninput = () => z.querySelectorAll('[data-n]').forEach((x) => x.classList.toggle('hidden', !x.dataset.n.includes($('fB').value.toLowerCase())));
  }

  function nuevaBarberia() {
    const regalo = K.regla('dias_regalo');
    const h = C.hoja('<h2>💈 Nueva barbería</h2><label>Nombre de la barbería</label><input data-b maxlength="80" placeholder="Ej: Barbería El Bigote">' +
      '<label>Nombre del dueño</label><input data-n maxlength="80"><label>Correo del dueño <span class="opc">(con este entra)</span></label><input data-e type="email" inputmode="email">' +
      '<label>WhatsApp de la barbería</label><input data-t inputmode="tel" placeholder="+56 9…">' +
      '<p class="muted chico">' + (regalo ? 'Parte con <b>' + regalo + ' días de Premium de regalo</b> (lo cambias en Ajustes → Reglas); después sigue pagando o queda en Free.' : 'Parte en Free.') +
      ' Le dejamos el mensaje listo con su acceso.</p><p class="err" data-err></p>' +
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
      (d.nuevo === false || d.tipo === 'socio' ? '' : '\n\n💈 Primeros pasos: en Más agrega tus servicios, tu horario y tu link de pago del abono. Después comparte tu link o QR con tus clientes.');
    const h = C.hoja('<h2>✅ ' + (d.nuevo === false ? 'Clave restablecida' : d.tipo === 'socio' ? 'Socio creado' : 'Barbería creada') + '</h2><textarea readonly style="min-height:200px">' + esc(msg) + '</textarea>' +
      '<div class="btns" style="flex-direction:column"><a class="btn wsp full" target="_blank" rel="noopener" href="' + (d.telefono ? C.wa(d.telefono, msg) : 'https://wa.me/?text=' + encodeURIComponent(msg)) + '">💬 Enviar por WhatsApp</a>' +
      '<button class="gris full" data-c>📋 Copiar</button></div>');
    h.q('[data-c]').onclick = () => C.copiar(msg);
  }

  // Botones de plan comunes: activar 1 mes (pagado), regalar días, quitar Premium.
  function botonesPlan(u, alTerminar) {
    return {
      html: (permiso('premium') ? '<button class="oro small" data-act>⭐ Activar 1 mes (pagado)</button><button class="small gris" data-dias>🎁 Regalar días</button>' : '') +
        (u.premium && permiso('eliminar') ? '<button class="small gris" data-quitar>Quitar Premium</button>' : ''),
      activar(h) {
        if (h.q('[data-quitar]')) h.q('[data-quitar]').onclick = async () => { if (await C.confirmar('¿Quitar el Premium? Queda en Free sin perder datos.', { si: 'Quitar', peligro: true })) { await K.rpc('admin_quitar_premium', { p_user: u.id }); h.cerrar(); alTerminar(); } };
        if (!permiso('premium')) return;
        h.q('[data-act]').onclick = (ev) => C.accion(ev.target, async () => { await K.rpc('admin_activar', { p_user: u.id, p_meses: 1, p_precio: null }); K.despertarEnvios(); h.cerrar(); alTerminar(); }, '⭐ Premium activado por 1 mes');
        h.q('[data-dias]').onclick = async () => {
          const n = await C.pedir('🎁 Regalar días de Premium', { texto: 'Se suman desde su fecha de término (o desde hoy). No cuenta como ingreso.', placeholder: 'Ej: 7', valor: '7' });
          if (!n) return;
          try { await K.rpc('admin_dias', { p_user: u.id, p_dias: +n }); K.despertarEnvios(); h.cerrar(); alTerminar(); C.toast('🎁 ' + n + ' días regalados'); } catch (e) { C.toast('⚠️ ' + e.message); }
        };
      }
    };
  }

  async function fichaBarberia(b) {
    const bp = botonesPlan({ id: b.owner_id, premium: b.premium }, pintarBarberias);
    const h = C.hoja('<h2><span class="av sm" style="' + C.fondo(b.logo) + '">' + (b.logo ? '' : '💈') + '</span> ' + esc(b.nombre) + ' ' + nota(b.calificacion) + '</h2>' +
      '<p class="muted" style="margin-top:-6px">' + esc(b.dueno) + ' · ' + esc(b.email) + (b.whatsapp ? ' · ' + esc(b.whatsapp) : '') + '<br>Código: <b>' + esc(b.codigo) + '</b> · creada ' + P.fechaCorta(b.created_at) +
      ' · ' + (b.ultima_actividad ? 'última conexión ' + C.hace(b.ultima_actividad) : 'nunca entró') + '</p>' +
      '<div class="card ' + (b.premium ? 'oro-marco' : '') + '" style="box-shadow:none"><b>' + (b.premium ? '⭐ Premium hasta ' + P.fechaCorta(b.premium_until) : 'Plan Free') + '</b>' +
      '<div class="btns">' + bp.html + '</div></div>' +
      '<div data-recos></div><div data-det><p class="muted">Cargando detalle…</p></div>' +
      '<div class="btns"><button class="gris" data-chat>💬 Escribir</button>' + (b.whatsapp ? '<a class="btn wsp" target="_blank" rel="noopener" href="' + C.wa(b.whatsapp, 'Hola ' + b.dueno.split(' ')[0] + ' 👋') + '">WhatsApp</a>' : '') +
      '<button class="gris" data-agenda>📅 Ver agenda</button><a class="btn gris" target="_blank" rel="noopener" href="' + C.raiz() + 'b/?b=' + esc(b.codigo) + '">🔗 Su link</a>' +
      (permiso('cuentas') ? '<button class="gris" data-clave>🔑 Restablecer clave</button><button class="' + (b.suspended ? 'ok' : 'danger') + '" data-sus>' + (b.suspended ? 'Reactivar' : 'Suspender') + '</button>' : '') +
      (permiso('eliminar') ? '<button class="danger" data-eliminar>🗑️ Eliminar barbería</button>' : '') + '</div>');
    if (h.q('[data-eliminar]')) h.q('[data-eliminar]').onclick = () => eliminarCuenta({ id: b.owner_id, nombre: b.dueno, rol: 'owner', barberia: b.nombre }, () => { h.cerrar(); pintarBarberias(); });
    bp.activar(h);
    const rec = recomendaciones(b);
    h.q('[data-recos]').innerHTML = rec.length ? '<h3>💡 Recomendaciones</h3>' + rec.map((r, i) => '<div class="reco"><span style="font-size:20px">' + r[0] + '</span><div class="grow">' + esc(r[1]) + '</div><button class="small alt" data-r="' + i + '">Enviar</button></div>').join('') : '';
    h.qa('[data-r]').forEach((x) => x.onclick = () => enviarTip(b, rec[+x.dataset.r][2]));
    h.q('[data-chat]').onclick = () => { h.cerrar(); mostrar('chat'); Chat.abrir(b.owner_id, { nombre: b.dueno + ' · ' + b.nombre, rol: 'owner' }); };
    if (h.q('[data-sus]')) h.q('[data-sus]').onclick = async () => {
      if (!await C.confirmar(b.suspended ? 'Reactivar la barbería y su equipo.' : 'Nadie de esta barbería (equipo y clientes) podrá usar la app ni su link hasta que la reactives.', { si: b.suspended ? 'Reactivar' : 'Suspender', peligro: !b.suspended })) return;
      await K.rpc('admin_suspender', { p_user: b.owner_id, p_suspender: !b.suspended }); h.cerrar(); pintarBarberias();
    };
    if (h.q('[data-clave]')) h.q('[data-clave]').onclick = async () => {
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
        '<h3>⚙️ Configuración</h3><p class="muted chico">Abono: ' + C.plata(b.abono) + (b.cobra_abono ? '' : ' · ⚠️ sin link ni transferencia') + '<br>' + (b.horario || []).map((x, i) => C.DIAS[i] + ': ' + esc(A.horarioTxt(x))).join('<br>') + '</p>';
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

  // v2.2: eliminar una cuenta (barbero, cliente) o una barbería completa. Queda en el registro de cambios.
  async function eliminarCuenta(u, despues) {
    let confirmar = null;
    if (u.rol === 'owner') {
      confirmar = await C.pedir('🗑️ Eliminar la barbería ' + u.barberia, { texto: 'Se borra TODO: el dueño, sus barberos, sus clientes con cuenta, horas, caja y pagos. No se puede deshacer. ' +
        'Si solo quieres cortarla, usa Suspender. Para confirmar escribe el nombre exacto de la barbería:', placeholder: u.barberia, si: 'Eliminar todo' });
      if (!confirmar) return;
    } else {
      const txt = u.rol === 'barber' ? 'Se borra la cuenta de ' + u.nombre + '. Sus horas pasadas y su caja quedan a nombre del dueño. Si tiene horas por venir, muévelas o anúlalas primero.'
        : 'Se borra la cuenta de ' + u.nombre + '. Sus horas por venir se anulan y su historial queda con su nombre, sin cuenta.';
      if (!await C.confirmar(txt + '\nNo se puede deshacer. Si solo quieres cortarle el acceso, usa Suspender.', { titulo: '🗑️ Eliminar cuenta', si: 'Eliminar', peligro: true })) return;
    }
    try { await K.rpc('eliminar_cuenta', { p_user: u.id, p_confirmar: confirmar }); C.toast('🗑️ Eliminado. Quedó en el registro de cambios'); despues && despues(); }
    catch (e) { C.toast('⚠️ ' + e.message, 5000); }
  }

  function fichaUsuario(u) {
    const plan = u.rol === 'owner' || u.rol === 'client';
    const bp = botonesPlan(u, pintarBarberias);
    const h = C.hoja('<h2>' + esc(u.nombre) + (u.premium ? ' <span class="pill oro">⭐ Premium</span>' : '') + '</h2>' +
      '<p class="muted" style="margin-top:-6px">' + esc(u.email) + '<br>' + ({ owner: 'Dueño', barber: 'Barbero', client: 'Cliente' }[u.rol]) + ' · ' + esc(u.barberia || '') +
      (u.telefono ? ' · ' + esc(u.telefono) : '') + '<br>Creado ' + P.fechaCorta(u.created_at) + ' · ' + C.conexion(u.last_seen).txt +
      (u.premium && u.premium_until ? '<br>⭐ Premium hasta ' + P.fechaCorta(u.premium_until) : '') + (u.trial_used && u.rol === 'client' ? '<br>🎁 Ya usó su prueba' : '') + '</p>' +
      '<div class="btns">' + (plan ? bp.html : '') +
      (permiso('cuentas') ? '<button class="small gris" data-clave>🔑 Restablecer clave</button><button class="small ' + (u.suspended ? 'ok' : 'danger') + '" data-sus>' + (u.suspended ? 'Reactivar' : 'Suspender') + '</button>' : '') +
      (permiso('eliminar') ? '<button class="small danger" data-eliminar>🗑️ Eliminar cuenta</button>' : '') + '</div>');
    if (plan) bp.activar(h);
    if (h.q('[data-eliminar]')) h.q('[data-eliminar]').onclick = () => eliminarCuenta({ id: u.id, nombre: u.nombre, rol: u.rol, barberia: u.barberia }, () => { h.cerrar(); pintarBarberias(); });
    if (!permiso('cuentas')) return;
    h.q('[data-sus]').onclick = async () => { await K.rpc('admin_suspender', { p_user: u.id, p_suspender: !u.suspended }); h.cerrar(); pintarBarberias(); };
    h.q('[data-clave]').onclick = async () => {
      try { const clave = K.claveNueva(); await K.restablecerClave(u.id, clave); h.cerrar(); enviarAcceso({ nombre: u.nombre, email: u.email, telefono: u.telefono, clave, barberia: u.barberia, nuevo: false }); }
      catch (e) { C.toast('⚠️ ' + e.message, 4500); }
    };
  }

  /* ---------- Pagos de Premium (barberías y clientes → Josué) ---------- */
  let estadoPagos = 'en_revision';
  async function pagos() {
    const el = $('v-pagos');
    if (!permiso('pagos')) { el.innerHTML = '<div class="card empty"><span class="ico">🔒</span>No tienes permiso para ver los pagos.</div>'; return; }
    el.innerHTML = '<div class="card" style="padding:12px"><div class="seg"><button data-e="en_revision">🧾 Por revisar</button><button data-e="aprobado">✅ Aprobados</button><button data-e="rechazado">❌ Rechazados</button></div></div><div id="lPagos"><p class="muted centro">Cargando…</p></div>';
    el.querySelectorAll('[data-e]').forEach((b) => { b.classList.toggle('on', b.dataset.e === estadoPagos); b.onclick = () => { estadoPagos = b.dataset.e; pagos(); }; });
    let l = [];
    try { l = await K.rpc('admin_pagos', { p_estado: estadoPagos }); } catch (e) { if ($('lPagos')) $('lPagos').innerHTML = '<div class="card err">' + esc(e.message) + '</div>'; return; }
    if (!$('lPagos')) return;
    const total = l.reduce((t, g) => t + g.monto, 0);
    $('lPagos').innerHTML = (estadoPagos === 'aprobado' && l.length ? '<p class="muted chico">' + l.length + ' pago(s) aprobado(s) · ' + C.plata(total) + '</p>' : '') +
      (l.length ? l.map((g) => '<div class="card ' + (g.estado === 'en_revision' ? 'urgente' : '') + '"><div class="flex"><div class="grow"><b>' + esc(g.nombre || g.email) + '</b> <span class="pill">' + (g.tipo === 'barberia' ? '💈 Barbería' : '👤 Cliente') + '</span>' +
        '<div class="sub muted">' + esc(g.barberia || '') + ' · ' + esc(g.email) + ' · ' + C.cuando(g.created_at) + '</div>' +
        '<div class="sub">' + C.plata(g.monto) + ' · ' + g.dias + ' días' + (g.premium ? ' · Premium hasta ' + P.fechaCorta(g.premium_until) : '') + '</div>' +
        (g.nota ? '<div class="sub">📝 ' + esc(g.nota) + '</div>' : '') + (g.motivo ? '<div class="sub" style="color:var(--bad)">Motivo: ' + esc(g.motivo) + '</div>' : '') + '</div></div>' +
        '<div class="btns">' + (g.tiene_comprobante ? '<button class="small gris" data-ver="' + g.id + '">🧾 Ver comprobante</button>' : '<span class="muted chico">' + (g.nota && /antiguo/.test(g.nota) ? 'Aviso antiguo sin comprobante' : 'Comprobante borrado') + '</span>') +
        (g.estado === 'en_revision' ? '<button class="ok small" data-ap="' + g.id + '">✅ Aprobar</button><button class="small danger" data-re="' + g.id + '">Rechazar</button>' : '') +
        (g.telefono ? '<a class="btn small wsp" target="_blank" rel="noopener" href="' + C.wa(g.telefono, 'Hola ' + (g.nombre || '').split(' ')[0] + ' 👋') + '">WhatsApp</a>' : '') + '</div></div>').join('')
        : '<div class="card empty"><span class="ico">💰</span>' + (estadoPagos === 'en_revision' ? 'No hay pagos por revisar. Te llega un push cuando alguien sube su comprobante.' : 'Nada por aquí.') + '</div>');
    $('lPagos').querySelectorAll('[data-ver]').forEach((b) => b.onclick = async () => {
      try {
        const img = await K.rpc('admin_pago_comprobante', { p_id: b.dataset.ver });
        if (!img) return C.toast('El comprobante ya no está');
        const h = C.hoja('<h2>🧾 Comprobante</h2><img src="' + img + '" alt="Comprobante" class="comp-img"><div class="btns"><a class="btn gris" download="comprobante.jpg" href="' + img + '">⬇️ Descargar</a></div>');
        h.q('.panel').style.maxWidth = '720px';
      } catch (e) { C.toast('⚠️ ' + e.message); }
    });
    $('lPagos').querySelectorAll('[data-ap]').forEach((b) => b.onclick = (ev) => C.accion(ev.target, async () => {
      await K.rpc('admin_pago_resolver', { p_id: b.dataset.ap, p_aprobar: true, p_motivo: null }); K.despertarEnvios(); Avisos.actualizar(); pagos();
    }, '⭐ Aprobado: Premium activado'));
    $('lPagos').querySelectorAll('[data-re]').forEach((b) => b.onclick = async () => {
      const m = await C.pedir('❌ Rechazar pago', { texto: 'La persona verá este motivo y podrá volver a subir su comprobante.', placeholder: 'Ej: No llegó la transferencia' });
      if (m === null) return;
      if (!m) return C.toast('Escribe el motivo');
      try { await K.rpc('admin_pago_resolver', { p_id: b.dataset.re, p_aprobar: false, p_motivo: m }); K.despertarEnvios(); Avisos.actualizar(); pagos(); } catch (e) { C.toast('⚠️ ' + e.message); }
    });
  }

  /* ---------- Ajustes ---------- */
  const SECCIONES = [
    ['socios', '🤝', 'Socios', 'Quién te ayuda y qué puede hacer'],
    ['qr', '🔳', 'QR para barberías', 'Registro abierto con regalo'],
    ['links', '💳', 'Precios y links', 'Premium barbería y cliente'],
    ['planes', '⚙️', 'Planes', 'Free y Premium, límites y beneficios'],
    ['reglas', '⚖️', 'Reglas', 'Minutos, horas y días'],
    ['textos', '✏️', 'Textos', 'Lo que lee la gente'],
    ['avisos', '📣', 'Avisos masivos', 'A barberías o clientes'],
    ['push', '🔔', 'Notificaciones', 'Claves push y servidor'],
    ['calificaciones', '⭐', 'Calificaciones', 'Revisar y borrar'],
    ['registro', '📜', 'Registro de cambios', 'Lo que se hizo en el panel'],
    ['version', '🔄', 'Versión', 'Actualizar la base de datos'],
    ['cuenta', '👤', 'Mi cuenta', 'Clave y preferencias']
  ];
  function pintarAjustes() {
    const el = $('v-ajustes');
    // v2.1: el socio ve solo lo que sus permisos le dejan (nunca socios, notificaciones ni versión).
    const PERM = { socios: 'admin', links: 'ajustes', planes: 'ajustes', reglas: 'ajustes', textos: 'ajustes', avisos: 'avisos', push: 'admin', version: 'admin' };
    const ve = (s) => !PERM[s[0]] || (PERM[s[0]] === 'admin' ? esAdmin : permiso(PERM[s[0]]));
    el.innerHTML = '<div class="menu-grid">' + SECCIONES.filter(ve).map((s) => '<button data-s="' + s[0] + '"><span>' + s[1] + '</span>' + s[2] + '<small>' + s[3] + '</small></button>').join('') + '</div>';
    el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => abrirAjuste(b.dataset.s));
  }
  function seccion(titulo) {
    const el = $('v-ajustes');
    el.innerHTML = '<div class="flex" style="margin-bottom:12px"><button class="icono" id="bVolver" aria-label="Volver">←</button><h2 style="margin:0;font-size:19px">' + titulo + '</h2></div><div id="secZona"></div>';
    $('bVolver').onclick = pintarAjustes;
    scrollTo(0, 0);
    return $('secZona');
  }
  async function abrirAjuste(s) {
    ajustes = await K.ajustes();
    ({ socios: secSocios, qr: () => { pintarAjustes(); qrRegistro(); }, links: secLinks, planes: secPlanes, reglas: secReglas, textos: secTextos, avisos: secAvisos, push: secPush, calificaciones: secCalif, registro: secRegistro, version: secVersion,
      cuenta: () => P.perfil(seccion('👤 Mi cuenta'), { tour: () => {} }) })[s]();
  }

  // Precios y links: 2 espacios por plan, uno activo. El precio publicado es el del espacio activo.
  function secLinks() {
    const z = seccion('💳 Precios y links');
    const L = ajustes.links_premium || {};
    const bloque = (g, titulo) => {
      const x = L[g] || { activo: 1 };
      return '<div class="card" data-g="' + g + '"><h2>' + titulo + '</h2><p class="muted chico" style="margin-top:-6px">El precio que ve la gente es el del espacio activo. Para cambiar el precio, edita el monto y su link, o activa el otro espacio.</p>' +
        [1, 2].map((n) => {
          const s = x['s' + n] || {};
          const act = (x.activo || 1) === n;
          return '<div class="card" style="box-shadow:none;margin:10px 0 0;padding:12px' + (act ? ';border-color:var(--brand)' : '') + '" data-n="' + n + '">' +
            '<label class="check" style="margin:0"><input type="radio" name="act_' + g + '" value="' + n + '"' + (act ? ' checked' : '') + '> <b>Espacio ' + n + (act ? ' · activo' : '') + '</b></label>' +
            '<div class="row"><div><label>Precio</label><input data-m type="number" inputmode="numeric" min="0" placeholder="$" value="' + (s.monto == null ? '' : s.monto) + '"></div>' +
            '<div style="flex:2"><label>Link de pago</label><input data-u placeholder="https://mpago.la/…" value="' + esc(s.url || '') + '"></div></div>' +
            '<label>Texto <span class="opc">(ej. "Precio de lanzamiento")</span></label><input data-t maxlength="300" value="' + esc(s.texto || '') + '"></div>';
        }).join('') +
        '<div class="card" style="box-shadow:none;margin:10px 0 0;padding:12px" data-tri><b>📦 3 meses por adelantado</b><div class="muted chico">Precio: 3 × el activo con ' + K.regla('descuento_3meses') +
        '% de descuento (Reglas). Pon un link con ese monto o deja vacío para que paguen por transferencia.</div>' +
        '<label>Link de pago (3 meses)</label><input data-tu placeholder="https://mpago.la/…" value="' + esc((x.trimestral || {}).url || '') + '">' +
        '<label>Texto <span class="opc">(opcional)</span></label><input data-tt maxlength="300" value="' + esc((x.trimestral || {}).texto || '') + '"></div></div>';
    };
    z.innerHTML = bloque('barberia', '💈 Premium para barberías') + bloque('cliente', '👤 Premium para clientes') +
      '<div class="card"><h2>🏦 Otros datos</h2><label>Datos de transferencia <span class="opc">(opcional, para quien no use el link)</span></label><textarea id="aTransf" maxlength="300">' + esc(ajustes.datos_transferencia || '') + '</textarea>' +
      '<label>Tu WhatsApp de contacto</label><input id="aWsp" inputmode="tel" value="' + esc(ajustes.whatsapp_admin || '') + '"></div>' +
      '<div class="btns"><button class="grande full" id="bGuardar">Guardar</button></div>';
    $('bGuardar').onclick = (ev) => C.accion(ev.target, async () => {
      const p = {};
      z.querySelectorAll('[data-g]').forEach((c) => {
        const g = c.dataset.g;
        p[g] = { activo: +((c.querySelector('input[name="act_' + g + '"]:checked') || {}).value || 1) };
        c.querySelectorAll('[data-n]').forEach((s) => { p[g]['s' + s.dataset.n] = { monto: s.querySelector('[data-m]').value, url: s.querySelector('[data-u]').value, texto: s.querySelector('[data-t]').value }; });
        p[g].trimestral = { url: c.querySelector('[data-tu]').value, texto: c.querySelector('[data-tt]').value };
      });
      await K.rpc('admin_guardar_links', { p });
      await K.rpc('admin_ajuste', { p_key: 'datos_transferencia', p_value: $('aTransf').value });
      await K.rpc('admin_ajuste', { p_key: 'whatsapp_admin', p_value: $('aWsp').value });
      ajustes = await K.ajustes();
      secLinks();
    }, '✅ Precios y links guardados');
  }

  // Planes: nombre, descripción, beneficios, duración, límites numéricos y opciones sí/no.
  const FILAS_PLAN = [
    ['barberia', 'barberos', '💈 Barberos (contando al dueño)'],
    ['barberia', 'clientes', '👥 Clientes con cuenta'],
    ['barberia', 'servicios', '✂️ Servicios (100 o más = ilimitados)'],
    ['barberia', 'ofertas', '🏷️ Ofertas activas (50 o más = ilimitadas)'],
    ['barberia', 'estadisticas', '📊 Estadísticas', 'si'],
    ['barberia', 'recordatorios', '⏰ Recordatorios automáticos a sus clientes', 'si'],
    ['barberia', 'caja_reportes', '💵 Reportes de caja y caja de todo el equipo', 'si'],
    ['barberia', 'colores', '🎨 Colores y portada', 'si'],
    ['barberia', 'ofertas_vip', '⭐ Ofertas VIP', 'si'],
    ['barberia', 'sellos', '🎟️ Tarjeta de sellos', 'si'],
    ['barberia', 'horario_barbero', '🕐 Horario propio por barbero', 'si'],
    ['barberia', 'vista_todos', '📅 Agenda "Todos" y vista Año', 'si'],
    ['barberia', 'fotos_servicios', '📷 Fotos de los servicios', 'si'],
    ['barberia', 'servicios_barbero', '✂️ Qué barbero hace cada servicio', 'si'],
    ['barberia', 'editar_barberos', '✏️ Editar el perfil de sus barberos', 'si'],
    ['barberia', 'comisiones', '💈 Comisión por barbero y sellos', 'si'],
    ['barberia', 'resumen_mes', '📈 Resumen del mes con ganancias (Free lo ve borroso)', 'si'],
    ['barberia', 'recuperar', '👋 Clientes que no vuelven (Free ve solo cuántos)', 'si'],
    ['barberia', 'recordar_wsp', '📲 Recordatorio por WhatsApp en 1 toque', 'si'],
    ['barberia', 'cumpleanos', '🎂 Regalo de cumpleaños automático', 'si'],
    ['cliente', 'prueba_dias', '🎁 Días de prueba gratis (0 = sin prueba)', 'prem'],
    ['cliente', 'dias', '📅 Días hacia adelante para reservar'],
    ['cliente', 'activas', '🗓️ Horas activas a la vez'],
    ['cliente', 'mensajes', '💬 Mensajes seguidos sin respuesta (0 = sin límite)'],
    ['cliente', 'lista_espera', '🔔 Lista de espera', 'si'],
    ['cliente', 'favorito', '❤️ Barbero favorito', 'si'],
    ['cliente', 'recordatorios', '⏰ Recordatorios de su hora', 'si'],
    ['cliente', 'ofertas_vip', '⭐ Ofertas VIP', 'si'],
    ['cliente', 'colores', '🎨 Todos los colores y foto', 'si'],
    ['cliente', 'prioridad', '🔥 Prioridad: viernes y sábados lejanos (Reglas)', 'si']
  ];
  function secPlanes() {
    const z = seccion('⚙️ Planes Free y Premium');
    const celda = (g, c, t, tipo) => {
      if (tipo === 'prem' && t === 'free') return '—';
      const v = K.plan(g, c, t === 'premium');
      return tipo === 'si' ? '<input type="checkbox" data-pg="' + g + '.' + c + '.' + t + '"' + (v > 0 ? ' checked' : '') + '>'
        : '<input data-pg="' + g + '.' + c + '.' + t + '" type="number" min="0" inputmode="numeric" value="' + v + '" style="width:90px;padding:8px">';
    };
    const info = (g, n) => {
      const i = K.planInfo(g, n);
      return '<div class="card" style="box-shadow:none;margin:8px 0;padding:12px" data-info="' + g + '.' + n + '"><b>' + (n === 'free' ? 'Free' : '⭐ Premium') + '</b>' +
        '<div class="row"><div><label>Nombre</label><input data-i="nombre" maxlength="40" value="' + esc(i.nombre || '') + '"></div>' +
        (n === 'premium' ? '<div><label>Duración (días)</label><input data-i="duracion_dias" type="number" min="1" max="3650" value="' + (i.duracion_dias || 30) + '"></div>' : '') + '</div>' +
        '<label>Descripción</label><input data-i="descripcion" maxlength="300" value="' + esc(i.descripcion || '') + '">' +
        (n === 'premium' ? '<label>Beneficios <span class="opc">(uno por línea; vacío = se arman solos con los límites)</span></label><textarea data-i="beneficios" rows="4">' + esc((i.beneficios || []).join('\n')) + '</textarea>' : '') + '</div>';
    };
    const tabla = (g, tit) => '<div class="card"><h2>' + tit + '</h2>' + info(g, 'free') + info(g, 'premium') +
      '<div class="scroll-x"><table class="tabla"><tr><th></th><th class="n">Free</th><th class="n">⭐ Premium</th></tr>' +
      FILAS_PLAN.filter((f) => f[0] === g).map(([gg, c, t, tipo]) => '<tr><td>' + t + '</td><td class="n">' + celda(gg, c, 'free', tipo) + '</td><td class="n">' + celda(gg, c, 'premium', tipo) + '</td></tr>').join('') +
      '</table></div></div>';
    z.innerHTML = '<p class="muted chico">Cambia lo que quieras: se aplica al tiro para todos. Si bajas un límite, nadie pierde lo que ya tiene; solo no puede agregar más. El precio se cambia en Precios y links.</p>' +
      tabla('barberia', '💈 Barberías') + tabla('cliente', '👤 Clientes') + '<div class="btns"><button class="grande full" id="bGuardar">Guardar planes</button></div>';
    $('bGuardar').onclick = (ev) => C.accion(ev.target, async () => {
      const p = { barberia: {}, cliente: {}, info: { barberia: {}, cliente: {} } };
      z.querySelectorAll('[data-pg]').forEach((i) => {
        const [g, c, t] = i.dataset.pg.split('.');
        p[g][c] = p[g][c] || {};
        p[g][c][t] = i.type === 'checkbox' ? (i.checked ? 1 : 0) : (i.value === '' ? 0 : +i.value);
      });
      z.querySelectorAll('[data-info]').forEach((c) => {
        const [g, n] = c.dataset.info.split('.');
        const o = {};
        c.querySelectorAll('[data-i]').forEach((i) => { o[i.dataset.i] = i.dataset.i === 'beneficios' ? i.value.split('\n').map((x) => x.trim()).filter(Boolean) : i.value; });
        p.info[g][n] = o;
      });
      await K.rpc('admin_guardar_planes', { p });
      ajustes = await K.ajustes();
      secPlanes();
    }, '✅ Planes guardados');
  }

  const REGLAS = [
    ['minutos_pago', '⏱️ Minutos para pagar y subir el comprobante', 'Si no lo sube en este tiempo, la hora se libera sola. Al subirlo, el reloj se detiene.'],
    ['minutos_devolucion', '💸 Minutos para cancelar con devolución del abono', 'Si cancela dentro de estos minutos desde que pagó, la barbería le devuelve el abono.'],
    ['horas_cancelacion', '🕐 Horas de anticipación para cancelar o reagendar con saldo a favor', 'Con menos de estas horas, pierde el abono.'],
    ['dias_saldo', '💰 Días que dura el saldo a favor (clientes sin cuenta)', ''],
    ['dias_regalo', '🎁 Días de Premium de regalo al crear una barbería', '0 = parte en Free.'],
    ['dias_aviso', '⏳ Días antes del vencimiento para avisar (con botón para pagar)', ''],
    ['dias_comprobantes', '🧾 Días que se guardan los comprobantes', 'Después se borran solos (nunca los que están en revisión).'],
    ['dias_anuladas', '❌ Días que se guardan las horas anuladas', 'Las atendidas se guardan siempre (sellos y estadísticas).'],
    ['estrellas_lista_negra', '🚫 Estrellas para entrar a la lista negra (o menos)', '0 = nadie entra.'],
    ['minutos_recordar_revision', '🔔 Minutos para recordarle al barbero un abono sin revisar', 'Al doble de este tiempo se le avisa también al dueño.'],
    ['activas_invitado', '👤 Horas activas a la vez para un cliente sin cuenta', ''],
    ['apartadas_max', '🛑 Máximo de horas apartadas sin pagar por barbería (sin cuenta)', 'Evita que alguien aparte muchas horas con WhatsApp distintos.'],
    ['dias_prioridad', '🔥 Días de anticipación para viernes y sábados sin Premium', 'Más allá de estos días, viernes y sábados son solo para clientes Premium. 0 = sin prioridad.'],
    ['dias_sin_volver', '👋 Días sin venir para "clientes que no vuelven"', ''],
    ['descuento_3meses', '📦 Descuento (%) por pagar 3 meses por adelantado', '0 = no se ofrece.'],
    ['dias_referido', '🤝 Días de Premium que gana una barbería por cada barbería que trae', 'Se dan cuando la invitada paga su primer mes. 0 = sin premio.'],
    ['registro_barberias', '💈 Registro abierto de barberías (1 = abierto, 0 = cerrado)', 'Con el link o QR de registro cualquiera crea su barbería.']
  ];
  function secReglas() {
    const z = seccion('⚖️ Reglas');
    z.innerHTML = '<div class="card">' + REGLAS.map(([k, t, d]) => '<label>' + t + '</label><input data-r="' + k + '" type="number" inputmode="numeric" value="' + K.regla(k) + '">' + (d ? '<div class="muted chico">' + d + '</div>' : '')).join('') +
      '<div class="btns"><button class="full" id="bGuardar">Guardar reglas</button></div></div>';
    $('bGuardar').onclick = (ev) => C.accion(ev.target, async () => {
      const p = {};
      z.querySelectorAll('[data-r]').forEach((i) => { p[i.dataset.r] = i.value; });
      await K.rpc('admin_guardar_reglas', { p });
      ajustes = await K.ajustes();
    }, '✅ Reglas guardadas');
  }

  const TEXTOS = {
    app_lema: 'Frase corta bajo el nombre (vista libre)', vista_bienvenida: 'Bienvenida en la vista libre (si la barbería no tiene la suya)',
    reserva_pago: 'Instrucciones del abono (usa {minutos})', reserva_revision: 'Mensaje mientras el abono está en revisión',
    reserva_politica: 'Política de cancelación (usa {devolucion} y {horas})', pago_instrucciones: 'Cómo pagar Premium',
    premium_barberia_texto: 'Descripción de Premium para barberías', premium_cliente_texto: 'Descripción de Premium para clientes',
    bienvenida_barberia: 'Bienvenida para una barbería nueva (lo que le falta configurar)', terminos: 'Aviso de privacidad al reservar'
  };
  function secTextos() {
    const z = seccion('✏️ Textos');
    const t = ajustes.textos || {};
    z.innerHTML = '<div class="card">' + Object.keys(TEXTOS).map((k) => '<label>' + esc(TEXTOS[k]) + '</label><textarea data-x="' + k + '" rows="2" maxlength="1000">' + esc(t[k] || '') + '</textarea>').join('') +
      '<div class="btns"><button class="full" id="bGuardar">Guardar textos</button></div></div>';
    $('bGuardar').onclick = (ev) => C.accion(ev.target, async () => {
      const p = {};
      z.querySelectorAll('[data-x]').forEach((i) => { p[i.dataset.x] = i.value; });
      await K.rpc('admin_guardar_textos', { p });
      ajustes = await K.ajustes();
    }, '✅ Textos guardados');
  }

  async function secAvisos() {
    const z = seccion('📣 Avisos masivos');
    if (!barberias.length) { try { barberias = await K.rpc('admin_barberias'); } catch (e) { /* nada */ } }
    z.innerHTML = '<div class="card"><p class="muted chico" style="margin-top:0">Llega a la campanita de la app y como notificación al celular (a quienes tienen cuenta).</p><label>Para</label><select id="dPara"><option value="barberias">Todas las barberías (dueños)</option><option value="equipos">Dueños y barberos</option>' +
      '<option value="barberias_free">Barberías Free</option><option value="barberias_premium">Barberías Premium</option><option value="clientes">Todos los clientes con cuenta</option><option value="todos">Todos</option>' +
      barberias.map((b) => '<option value="barberia:' + b.id + '">Solo ' + esc(b.nombre) + ' (equipo y clientes)</option>').join('') + '</select>' +
      '<label>Título</label><input id="dTit" maxlength="90"><label>Mensaje</label><textarea id="dCuerpo" maxlength="300"></textarea>' +
      '<div class="btns"><button id="bDifundir">📣 Enviar</button></div></div><div class="card"><div id="lDif"><p class="muted">Cargando…</p></div></div>';
    $('bDifundir').onclick = (ev) => C.accion(ev.target, async () => {
      const n = await K.rpc('admin_difundir', { p_titulo: $('dTit').value, p_cuerpo: $('dCuerpo').value, p_para: $('dPara').value });
      K.despertarEnvios();
      C.toast('📣 Enviado a ' + n + ' persona' + (n === 1 ? '' : 's'));
      $('dTit').value = $('dCuerpo').value = '';
      difusiones();
    });
    difusiones();
  }
  async function difusiones() {
    let l = [];
    try { l = await K.rpc('admin_difusiones'); } catch (e) { return; }
    const z = $('lDif');
    if (!z) return;
    z.innerHTML = l.length ? '<h3 style="margin-top:0">Enviados (7 días)</h3><ul class="list">' + l.map((d, i) => '<li class="tap" data-d="' + i + '"><div class="grow"><b>' + esc(d.titulo) + '</b><div class="sub">' + C.hace(d.created_at) + ' · ' + d.total + ' destinatarios</div></div>' +
      '<span class="chico" style="text-align:right"><span class="ticks">✓✓</span> ' + d.recibidos + '<br><span class="ticks visto">✓✓</span> ' + d.vistos + ' vistos</span></li>').join('') + '</ul>' : '<p class="muted" style="margin:0">Aún no envías avisos.</p>';
    z.querySelectorAll('[data-d]').forEach((li) => li.onclick = () => {
      const d = l[+li.dataset.d];
      C.hoja('<h2>📣 ' + esc(d.titulo) + '</h2><p class="muted">' + esc(d.cuerpo) + '</p><ul class="list">' + d.detalle.map((x) => '<li><span class="grow">' + esc(x.nombre) + '</span>' +
        (x.visto_at ? '<span class="chico"><span class="ticks visto">✓✓</span> ' + C.cuando(x.visto_at) + '</span>' : '<span class="muted chico">no lo ha visto</span>') + '</li>').join('') + '</ul>');
    });
  }

  async function secPush() {
    const z = seccion('🔔 Notificaciones');
    let sec = {};
    try { sec = await K.rpc('admin_secretos_estado'); } catch (e) { /* nada */ }
    z.innerHTML = '<div class="card"><p>' + (sec.vapid_public && sec.vapid_private ? '✅ Claves push configuradas' : '⚠️ Falta generar las claves push (una sola vez)') + '</p>' +
      '<div class="btns"><button class="gris" id="bVapid">' + (sec.vapid_public ? 'Regenerar claves' : 'Generar claves push') + '</button><button class="gris" id="bPing">🩺 Probar servidor</button>' +
      '<button class="gris" id="bPrueba">Enviarme un aviso de prueba</button></div><p class="muted chico">El correo queda para una etapa siguiente: hoy todo es push + campanita.</p></div>';
    $('bVapid').onclick = (ev) => C.accion(ev.target, async () => {
      if (sec.vapid_public && !await C.confirmar('Si regeneras las claves, todos deberán volver a activar las notificaciones.', { si: 'Regenerar', peligro: true })) return;
      const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
      const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      await K.rpc('admin_secreto', { p_name: 'vapid_private', p_value: jwk.d });
      await K.rpc('admin_secreto', { p_name: 'vapid_public', p_value: b64u(raw) });
      await K.activarPush().catch(() => {});
      secPush();
    }, '🔔 Claves push listas');
    $('bPing').onclick = (ev) => C.accion(ev.target, async () => {
      const r = await K.probarServidor();
      C.toast(r.servicio ? '✅ Función "enviar" v' + r.version + ' funcionando' : '⚠️ La función responde, pero le falta la clave de servidor', 4500);
    });
    $('bPrueba').onclick = (ev) => C.accion(ev.target, async () => { await K.activarPush(); await K.rpc('aviso_prueba'); K.despertarEnvios(); }, '🔔 Aviso de prueba enviado: debería llegarte en segundos');
  }

  async function secCalif() {
    const z = seccion('⭐ Calificaciones');
    let l = [];
    try { l = await K.rpc('admin_calificaciones'); } catch (e) { z.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
    z.innerHTML = '<p class="muted chico">Borra las injustas u ofensivas. Las de clientes a barberías forman el promedio público; las de barberías a clientes, la lista negra.</p>' +
      (l.length ? '<div class="card"><ul class="list">' + l.map((q) => '<li><div class="grow"><span class="estrellas">' + '★'.repeat(q.estrellas) + '</span> <b>' + (q.autor === 'cliente' ? esc(q.cliente || 'Cliente') + ' → ' + esc(q.barberia) : esc(q.barberia) + ' → ' + esc(q.cliente || 'Cliente')) + '</b>' +
        '<div class="sub">' + esc([q.motivo, q.comentario].filter(Boolean).join(' · ')) + ' · ' + C.hace(q.created_at) + '</div></div>' + (permiso('eliminar') ? '<button class="small danger" data-del="' + q.id + '">Borrar</button>' : '') + '</li>').join('') + '</ul></div>'
        : '<div class="card empty"><span class="ico">⭐</span>Aún no hay calificaciones.</div>');
    z.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (!await C.confirmar('¿Borrar esta calificación? Cambia el promedio.', { si: 'Borrar', peligro: true })) return;
      try { await K.rpc('admin_borrar_calificacion', { p_id: b.dataset.del }); secCalif(); } catch (e) { C.toast('⚠️ ' + e.message); }
    });
  }

  async function secRegistro() {
    const z = seccion('📜 Registro de cambios');
    let l = [];
    try { l = await K.rpc('admin_auditoria'); } catch (e) { z.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
    let filtroReg = 'todo';
    const pintar = () => {
      const f = l.filter((a) => filtroReg === 'todo' || (filtroReg === 'socios' && a.rol === 'socio') || (filtroReg === 'borrados' && /Eliminar|Limpieza|borrada|Quitar|Suspender/.test(a.accion)));
      z.innerHTML = '<p class="muted chico">Todo lo que hacen tú, tus socios y los dueños al eliminar cuentas queda aquí, con quién y cuándo.</p>' +
        '<div class="chips" style="margin-bottom:10px"><button class="chip" data-f="todo">Todo</button><button class="chip" data-f="socios">🤝 Socios</button><button class="chip" data-f="borrados">🗑️ Borrados y cortes</button></div>' +
        '<div class="card"><ul class="list">' + (f.map((a) => '<li><div class="grow"><b>' + esc(a.accion) + '</b> <span class="sub">' + esc(a.detalle) + '</span>' +
        '<div class="sub">por ' + esc(a.quien) + (a.rol === 'socio' ? ' <span class="pill">socio</span>' : '') + '</div></div><span class="sub">' + C.cuando(a.created_at) + '</span></li>').join('') ||
        '<li class="muted">Nada por aquí.</li>') + '</ul></div>';
      z.querySelectorAll('[data-f]').forEach((b) => { b.classList.toggle('on', b.dataset.f === filtroReg); b.onclick = () => { filtroReg = b.dataset.f; pintar(); }; });
    };
    pintar();
  }

  // v2.2: Socios. Gestionan como el admin según sus permisos (también crean y eliminan); todo queda en el registro de cambios.
  const PERMISOS = [['pagos', '💰 Aprobar y rechazar pagos Premium'], ['premium', '⭐ Activar Premium y regalar días'], ['cuentas', '🔑 Restablecer claves y suspender'],
    ['ajustes', '⚙️ Precios, planes, reglas y textos'], ['avisos', '📣 Avisos masivos'], ['crear', '➕ Crear barberías'],
    ['eliminar', '🗑️ Eliminar cuentas y barberías, borrar calificaciones, limpiar y quitar Premium']];
  async function secSocios() {
    const z = seccion('🤝 Socios');
    z.innerHTML = '<p class="muted">Cargando…</p>';
    let l = [];
    try { l = await K.rpc('admin_socios'); } catch (e) { z.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
    z.innerHTML = '<div class="card"><div class="flex"><div class="grow"><b>' + l.length + ' socio' + (l.length === 1 ? '' : 's') + '</b><div class="muted chico">Entran al mismo panel y hacen lo que les marques. Todo lo que hacen queda en el Registro de cambios, y si eliminan o cortan algo te llega un aviso. Solo tú creas y eliminas socios.</div></div>' +
      '<button id="bNuevoSocio">+ Socio</button></div></div>' + l.map((x) => '<div class="card' + (x.suspended ? '' : '') + '" data-socio="' + x.id + '"><h2><span class="grow">' + esc(x.nombre) + '</span>' +
      (x.suspended ? '<span class="pill bad">suspendido</span>' : '<span class="pill ok">activo</span>') + '</h2><div class="sub muted">' + esc(x.email) + ' · ' + C.conexion(x.last_seen).txt +
      ' · trajo ' + x.barberias + ' barbería(s), ' + x.premium + ' Premium</div>' +
      PERMISOS.map(([k, t]) => '<label class="check"><input type="checkbox" data-p="' + k + '"' + (x.permisos[k] ? ' checked' : '') + '> ' + t + '</label>').join('') +
      '<div class="btns"><button class="small" data-g>Guardar permisos</button><button class="small gris" data-qr>🔳 Su link</button>' +
      '<button class="small ' + (x.suspended ? 'ok' : 'danger') + '" data-sus>' + (x.suspended ? 'Reactivar' : 'Suspender') + '</button></div></div>').join('');
    $('bNuevoSocio').onclick = nuevoSocio;
    z.querySelectorAll('[data-socio]').forEach((c) => {
      const x = l.find((y) => y.id === c.dataset.socio);
      c.querySelector('[data-g]').onclick = (ev) => C.accion(ev.target, async () => {
        const permisos = {};
        c.querySelectorAll('[data-p]').forEach((i) => { permisos[i.dataset.p] = i.checked; });
        await K.rpc('admin_guardar_socio', { p_id: x.id, p: { permisos } });
      }, '✅ Permisos guardados');
      c.querySelector('[data-sus]').onclick = (ev) => C.accion(ev.target, async () => { await K.rpc('admin_guardar_socio', { p_id: x.id, p: { suspended: !x.suspended } }); secSocios(); });
      c.querySelector('[data-qr]').onclick = () => P.compartir({ titulo: '🔳 Link de ' + x.nombre, link: K.linkRegistro(x.ref_codigo), archivo: 'qr-' + x.ref_codigo,
        texto: 'Las barberías que se registren con este link quedan a nombre de <b>' + esc(x.nombre) + '</b>.', mensaje: '💈 Crea gratis la app de reservas de tu barbería' });
    });
  }
  function nuevoSocio() {
    const h = C.hoja('<h2>🤝 Nuevo socio</h2><label>Nombre</label><input data-n maxlength="80"><label>Correo <span class="opc">(con este entra)</span></label><input data-e type="email" inputmode="email">' +
      '<label>WhatsApp</label><input data-t inputmode="tel" placeholder="+56 9…"><p class="muted chico">Parte con todos los permisos. Se los cambias después; todo lo que haga queda en el Registro de cambios.</p><p class="err" data-err></p>' +
      '<div class="btns"><button class="full" data-ok>Crear socio</button></div>');
    h.q('[data-ok]').onclick = (ev) => C.accion(ev.target, async () => {
      const d = { nombre: h.q('[data-n]').value.trim(), email: h.q('[data-e]').value.trim().toLowerCase(), telefono: h.q('[data-t]').value.trim(), clave: K.claveNueva(), tipo: 'socio' };
      if (!d.nombre || !d.email) throw new Error('Falta el nombre o el correo');
      await K.crearUsuario(d);
      h.cerrar();
      enviarAcceso(Object.assign(d, { barberia: 'el panel de CodeFix' }));
      secSocios();
    }).catch((e) => { h.q('[data-err]').textContent = e.message; });
  }

  // Versión: actualizar = pegar 1 consulta en Supabase; al terminar se libera sola y les llega un aviso a todos.
  const SQL_ACTUALIZAR = "create extension if not exists http with schema extensions;\ndo $$ begin\n  execute (select content from extensions.http_get('https://raw.githubusercontent.com/CodeFixService/Barberia/main/supabase/instalar.sql'));\nend $$;";
  async function secVersion() {
    const z = seccion('🔄 Versión y actualizaciones');
    let e = null, web = '';
    try { e = await K.rpc('admin_actualizacion_estado'); } catch (err) { /* base antigua */ }
    try { web = String((await (await fetch(C.raiz() + 'version.json', { cache: 'no-store' })).json()).version); } catch (err) { /* sin red */ }
    const db = e ? e.db_version : '—';
    const lib = (e && e.liberada) || ajustes.version_liberada || '—';
    const pendienteBD = web && db !== web;
    z.innerHTML = '<div class="card">' +
      '<div class="det-fila"><span>📲 App en este celular</span><b>v' + C.version + '</b></div>' +
      '<div class="det-fila"><span>🌐 Publicada en la web</span><b>' + (web ? 'v' + esc(web) : '—') + '</b></div>' +
      '<div class="det-fila"><span>🗄️ Base de datos</span><b>v' + esc(db) + (pendienteBD ? ' <span class="pill warn">falta actualizar</span>' : ' <span class="pill ok">al día</span>') + '</b></div>' +
      '<div class="det-fila"><span>📣 Liberada para todos</span><b>v' + esc(lib) + '</b></div>' +
      (pendienteBD ? '<div class="banner alerta" style="margin-top:12px"><div class="grow"><b>🆕 Hay una versión nueva (v' + esc(web) + ')</b><br>' +
        'Copia la consulta, pégala en Supabase → SQL Editor → Run. Al terminar se libera sola y le llega un aviso a todos para actualizar.</div></div>' : '') +
      '<div class="btns"><button id="bCopiarSQL"' + (pendienteBD ? '' : ' class="gris"') + '>📋 Copiar consulta de actualización</button>' +
      '<a class="btn gris" target="_blank" rel="noopener" href="https://supabase.com/dashboard/project/gxlabxuttnxvzkucckef/sql/new">🗄️ Abrir SQL Editor</a></div>' +
      '<p class="muted chico">Es la misma consulta siempre. Si la corres sin versión nueva, no pasa nada.</p>' +
      (e && e.historial.length ? '<h3>Historial</h3><ul class="list">' + e.historial.map((x) => '<li><div class="grow"><b>v' + esc(x.version) + '</b> · ' + C.cuando(x.created_at) +
        '<div class="sub">' + esc(x.notas || '') + '</div></div><span class="pill">' + x.avisados + ' avisados</span></li>').join('') + '</ul>' : '') +
      '<details style="margin-top:10px"><summary class="muted chico">Liberar a mano (casos especiales)</summary>' +
      '<div class="btns"><button class="small gris" id="bLiberar">Liberar v' + C.version + ' para todos</button></div></details></div>';
    $('bCopiarSQL').onclick = () => C.copiar(SQL_ACTUALIZAR);
    $('bLiberar').onclick = (ev) => C.accion(ev.target, async () => { await K.rpc('admin_ajuste', { p_key: 'version_liberada', p_value: C.version }); secVersion(); }, '🔄 Versión liberada');
  }

  ruta();
  K.revisarActualizacion();
})();
