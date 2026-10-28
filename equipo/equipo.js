/* Panel de la barbería: el dueño administra todo; cada barbero ve su agenda, su caja y sus chats. */
(async function () {
  'use strict';
  const C = Core, K = Cuenta, A = Agenda, P = Perfil;
  const $ = C.$, esc = C.esc;
  C.registrarSW();

  let yo = await K.exigir(['owner', 'barber']);
  const dueno = () => yo.role === 'owner';
  const premium = () => !!(yo.barberia && yo.barberia.premium);
  const bar = () => yo.barberia || {};
  let B = { barberos: [], servicios: [], ofertas: [] };
  let clientes = null;
  let datos = { reservas: [], bloqueos: [] }, rango = '';

  Avisos.montar({ sub: dueno() ? (premium() ? '⭐ Premium · Dueño' : 'Free · Dueño') : 'Barbero' });
  Avisos.alCambiar((r, antes) => { if (antes.cargado && (r.pendientes !== antes.pendientes || r.avisos > antes.avisos)) { rango = ''; refrescarVista(); } });
  C.marca(premium());
  // Núcleo (pagos.js): barbería nueva que debe su primer pago → pantalla de activación.
  if (dueno()) { const ir = () => CFX_PAGOS.revisar({ rpc: K.rpc, salir: () => K.salir() }); if (window.CFX_PAGOS) ir(); else addEventListener('load', ir); }

  const barbero = (id) => B.barberos.find((b) => b.id === id);
  const horarios = () => Object.fromEntries(B.barberos.map((b) => [b.id, b.horario]));
  const servicio = (id) => B.servicios.find((s) => s.id === id);
  const ACTIVA = ['esperando_abono', 'en_revision', 'por_aprobar', 'agendada', 'confirmada'];
  const REVISION = ['en_revision', 'por_aprobar'];
  const tiene = (k) => K.barberiaTiene(k);
  const estrellas = (n) => n && n.total ? '<span class="nota">' + n.promedio + '</span>' : '';
  const alertaNegra = (ln) => ln ? '<div class="alerta-negra">⚠️ <span>Lista negra' + (ln.motivo ? ': ' + esc(ln.motivo) : '') + '</span></div>' : '';

  async function cargarBarberia() { B = await K.rpc('ver_barberia'); }
  async function cargarDatos(desde, hasta, forzar) {
    const k = desde + hasta;
    if (!forzar && k === rango) return datos;
    datos = await K.rpc('ocupacion', { p_desde: desde, p_hasta: hasta });
    rango = k;
    return datos;
  }
  async function cargarClientes(forzar) { if (!clientes || forzar) clientes = await K.rpc('mis_clientes'); return clientes; }

  /* ---------- Navegación ---------- */
  let vistaActual = 'hoy';
  const VISTAS = { hoy, agenda, clientes: pintarClientes, chat: () => Chat.montar($('v-chat')), mas };
  function mostrar(v) {
    vistaActual = v;
    document.querySelectorAll('.view').forEach((x) => x.classList.toggle('on', x.id === 'v-' + v));
    document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    scrollTo(0, 0);
    VISTAS[v]();
  }
  const refrescarVista = () => { if (vistaActual === 'hoy') hoy(); else if (vistaActual === 'agenda') pintarAgenda(true); else if (vistaActual === 'clientes') pintarClientes(); };
  document.querySelectorAll('nav.tabs button').forEach((b) => b.onclick = () => { history.replaceState(null, '', '#' + b.dataset.v); mostrar(b.dataset.v); });
  function ruta() {
    const h = decodeURIComponent(location.hash.slice(1));
    const [v, qs] = h.split('?');
    const q = new URLSearchParams(qs || '');
    if (v === 'agenda' && q.get('r')) { mostrar('agenda'); abrirReserva(q.get('r'), true); return; }
    if (v === 'chat' && q.get('con')) { mostrar('chat'); Chat.abrir(q.get('con')); return; }
    if (v === 'avisos') { Avisos.abrir(); return; }
    if (['plan', 'perfil', 'equipo', 'servicios', 'ajustes', 'estadisticas', 'ofertas', 'caja', 'links', 'horario', 'negocio', 'calificaciones', 'enlace', 'tiempos', 'resumen', 'volver', 'invitar', 'milink', 'respaldo'].includes(v)) {
      mostrar('mas'); abrirSeccion(v === 'ajustes' ? 'negocio' : v); return;
    }
    mostrar(VISTAS[v] ? v : 'hoy');
  }
  addEventListener('hashchange', ruta);

  /* ---------- Inicio: lo urgente, lo que falta configurar, link y plan ---------- */
  async function hoy() {
    const el = $('v-hoy');
    const f = C.hoy();
    let d, P2 = { revision: [], devoluciones: [] };
    try {
      [d, P2] = await Promise.all([cargarDatos(C.sumarDias(f, -1), C.sumarDias(f, 30), true), K.rpc('mis_pendientes')]);
    } catch (e) { el.innerHTML = '<div class="card err">' + esc(e.message) + '</div>'; return; }
    const mias = (r) => dueno() || r.barbero_id === yo.id;
    const deHoy = d.reservas.filter((r) => r.detalle && mias(r) && C.fechaDe(r.inicio) === f && r.estado !== 'anulada').sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
    const esperando = d.reservas.filter((r) => r.detalle && mias(r) && r.estado === 'esperando_abono');
    let caja = [];
    try { caja = await K.rpc('ver_caja', { p_desde: f, p_hasta: f, p_barbero: dueno() && tiene('caja_reportes') ? null : yo.id }); } catch (e) { /* nada */ }
    const b = bar();
    let html = '';
    if (yo.clave_temporal) html += '<div class="banner alerta"><div class="grow"><b>🔑 Cambia tu clave temporal</b> en Más → Mi cuenta.</div></div>';
    html += '<div class="card"><div class="flex">' + C.avatar(yo, 'lg') + '<div class="grow"><h2 style="margin:0">Hola, ' + esc(yo.nombre.split(' ')[0]) + ' 💈</h2>' +
      '<div class="muted">' + C.fechaLarga(f) + (dueno() && b.calificacion && b.calificacion.total ? ' · ' + estrellas(b.calificacion) + ' <span class="chico">(' + b.calificacion.total + ')</span>' : '') + '</div></div></div>' +
      '<label class="check" style="margin-top:14px"><input type="checkbox" id="chkAgenda"' + (yo.agenda_abierta ? ' checked' : '') + '> <span><b>Mi agenda abierta a clientes</b><br><span class="muted chico">' +
        'Desmárcala cuando estés lleno: los clientes te verán con "agenda llena" y podrán reservar con otro barbero.</span></span></label></div>';
    html += '<div class="stats"><div class="card"><small>Horas hoy</small><b>' + deHoy.length + '</b></div>' +
      '<div class="card"><small>Abonos por revisar</small><b style="color:var(--consultar)">' + P2.revision.length + '</b></div>' +
      '<div class="card"><small>Atendidas hoy</small><b>' + deHoy.filter((r) => r.estado === 'atendida').length + '</b></div>' +
      (dueno() ? '<div class="card"><small>Caja de hoy</small><b>' + C.plata(caja.reduce((t, k) => t + (k.monto || 0) + (k.propina || 0), 0)) + '</b></div>'
        : '<div class="card"><small>Mis cortes hoy</small><b>' + caja.length + '</b></div>') + '</div>';
    // 1. Abonos por revisar (lo más urgente)
    if (P2.revision.length) {
      html += '<div class="sec-tit">🧾 Abonos por revisar (' + P2.revision.length + ')</div>' + P2.revision.map((r) =>
        '<div class="card urgente' + (r.lista_negra ? ' negra' : '') + '"><div class="flex"><div class="grow"><b>' + esc(r.cliente) + (r.invitado ? ' <span class="pill">sin cuenta</span>' : '') +
        (r.cliente_premium ? ' <span class="pill oro">⭐</span>' : '') + ' ' + estrellas(r.nota_cliente) + '</b>' +
        '<div class="sub muted">' + C.cuando(r.inicio) + ' · ' + esc(r.servicios.map((s) => s.nombre).join(' + ')) + (dueno() ? ' · ' + esc((barbero(r.barbero_id) || {}).nombre || '') : '') + '</div>' +
        '<div class="sub muted">Comprobante enviado ' + (r.comprobante_at ? C.hace(r.comprobante_at) : '') + (r.abono ? ' · abono ' + C.plata(r.abono) : '') + ' · ' + (r.pagado_con === 'link' ? 'link de pago' : 'transferencia') + '</div></div></div>' +
        alertaNegra(r.lista_negra) +
        '<div class="btns">' + (r.tiene_comprobante ? '<button class="small gris" data-comp="' + r.id + '">🧾 Ver comprobante</button>' : '') +
        '<button class="ok small" data-aprobar="' + r.id + '">✅ Aprobar</button><button class="small danger" data-rechazar="' + r.id + '">Rechazar</button>' +
        (r.cliente_tel ? '<a class="btn small wsp" target="_blank" rel="noopener" href="' + C.wa(r.cliente_tel, 'Hola ' + r.cliente.split(' ')[0] + ', te escribo de ' + b.nombre + ' por tu abono del ' + C.cuando(r.inicio)) + '">WhatsApp</a>' : '') +
        '</div></div>').join('') + '<p class="muted chico">Revisa que la transferencia llegó a tu cuenta y toca Aprobar: la hora queda agendada y el cliente lo ve al tiro.</p>';
    }
    // 2. Devoluciones pendientes (dueño)
    if (P2.devoluciones.length) {
      html += '<div class="sec-tit">💸 Devoluciones pendientes (' + P2.devoluciones.length + ')</div>' + P2.devoluciones.map((r) =>
        '<div class="card urgente"><div class="flex"><div class="grow"><b>' + esc(r.cliente) + ' · ' + C.plata(r.abono) + '</b><div class="sub muted">Anuló ' + (r.anulada_at ? C.hace(r.anulada_at) : '') +
        ' su hora del ' + C.cuando(r.inicio) + ' dentro del plazo de devolución.</div>' +
        (r.sin_verificar ? '<div class="sub" style="color:var(--consultar)">⚠️ Su abono aún no estaba aprobado: revisa tu cuenta y <b>devuélvelo solo si la transferencia llegó</b>.</div>' : '') + '</div></div>' +
        '<div class="btns">' + (r.tiene_comprobante ? '<button class="small gris" data-comp="' + r.id + '">🧾 Comprobante</button>' : '') +
        (r.sin_verificar ? '<button class="small gris" data-nollego="' + r.id + '">No llegó (no devolver)</button>' : '') +
        (r.cliente_tel ? '<a class="btn small wsp" target="_blank" rel="noopener" href="' + C.wa(r.cliente_tel, 'Hola ' + r.cliente.split(' ')[0] + ', te devolvemos tu abono de ' + C.plata(r.abono) + '. ¿A qué cuenta te lo transferimos?') + '">WhatsApp</a>' : '') +
        '<button class="ok small" data-devuelto="' + r.id + '">✓ Ya lo devolví</button></div></div>').join('');
    }
    // v2.1: recordar por WhatsApp a los de mañana (1 toque por cliente).
    const manana = C.sumarDias(f, 1);
    const deManana = d.reservas.filter((r) => r.detalle && mias(r) && C.fechaDe(r.inicio) === manana && ['agendada', 'confirmada'].includes(r.estado) && r.cliente_tel)
      .sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
    if (deManana.length) {
      html += '<div class="card' + (tiene('recordar_wsp') ? '' : ' plata" id="upRecordar') + '"><h2>📲 Recuérdales a los de mañana <span class="grow"></span><span class="pill">' + deManana.length + '</span></h2>' +
        '<p class="muted chico" style="margin-top:-6px">Un toque y le llega por WhatsApp con su hora y su link. Así bajan los "no vino".</p><ul class="list">' + deManana.map((r) =>
        '<li><div style="width:52px;font-weight:800">' + C.horaDe(r.inicio) + '</div><div class="grow"><b>' + esc(r.cliente) + '</b><div class="sub">' + esc(r.servicios.map((s) => s.nombre).join(' + ')) + '</div></div>' +
        '<a class="btn small wsp" target="_blank" rel="noopener" data-recordar href="' + (tiene('recordar_wsp') ? C.wa(r.cliente_tel, msgRecordar(r)) : '#') + '">📲 Recordar</a></li>').join('') + '</ul></div>';
    }
    if (esperando.length) html += '<p class="muted chico">⏳ ' + esperando.length + ' hora(s) apartada(s) esperando que el cliente pague y suba el comprobante (se liberan solas a los ' + K.regla('minutos_pago') + ' min).</p>';
    // 3. Lo que falta configurar (dueño)
    if (dueno()) {
      const falta = [
        [!!b.logo, '📷 Sube tu logo', 'negocio'],
        [B.servicios.length > 0, '✂️ Agrega tus servicios con precio', 'servicios'],
        [!!((b.pagos && (b.pagos.p1.link || (b.pagos.p2 && b.pagos.p2.link))) || b.datos_transferencia), '💳 Pon tu link de pago o datos de transferencia del abono', 'links'],
        [!!b.whatsapp, '💬 Pon el WhatsApp de la barbería', 'negocio'],
        [!!b.direccion, '📍 Pon tu dirección', 'negocio']
      ];
      const pend = falta.filter((x) => !x[0]).length;
      if (pend) html += '<div class="card"><h2>🧩 Lo que te falta configurar <span class="grow"></span><span class="pill warn">' + pend + '</span></h2>' +
        '<p class="muted chico" style="margin-top:-6px">' + esc(K.texto('bienvenida_barberia', '')) + '</p><ul class="list checklist">' + falta.map((x) =>
        '<li class="' + (x[0] ? 'hecho' : 'tap') + '"' + (x[0] ? '' : ' data-ir="' + x[2] + '"') + '><span class="ok">' + (x[0] ? '✓' : '○') + '</span><span class="t grow">' + x[1] + '</span>' + (x[0] ? '' : '<span>›</span>') + '</li>').join('') + '</ul></div>';
    }
    // 4. Hoy
    html += '<div class="sec-tit">📅 Hoy</div>';
    html += deHoy.length ? '<div class="card"><ul class="list">' + deHoy.map((r) =>
      '<li class="tap" data-ver="' + r.id + '"><div style="width:52px;font-weight:800;font-variant-numeric:tabular-nums">' + C.horaDe(r.inicio) + '</div>' +
      '<div class="grow"><b>' + esc(r.cliente) + (r.lista_negra ? ' ⚠️' : '') + '</b><div class="sub">' + esc(r.servicios.map((s) => s.nombre).join(' + ') || r.nota || '') +
      (dueno() && B.barberos.length > 1 ? ' · ' + esc((barbero(r.barbero_id) || {}).nombre || '') : '') + '</div></div>' + A.estadoPill(r.estado) + '</li>').join('') + '</ul></div>'
      : '<div class="card empty"><span class="ico">☕</span>No hay horas para hoy.</div>';
    html += '<div class="btns"><button class="alt" id="bHoraHoy">+ Agendar una hora</button></div>';
    // 5. Link, QR y plan (dueño)
    if (dueno()) {
      html += '<div class="card"><h2>🔗 Tu link para clientes</h2><p class="muted chico" style="margin-top:-6px">Con este link o el QR tus clientes reservan sin cuenta o se crean la cuenta.</p>' +
        '<input readonly value="' + esc(linkClientes()) + '"><div class="btns"><button class="small" id="bCopiarLink">📋 Copiar</button><button class="small gris" id="bQR">🔳 Ver QR</button>' +
        '<a class="btn small wsp" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent('💈 Reserva tu hora en ' + b.nombre + ': ' + linkClientes()) + '">💬 Compartir</a></div></div>';
      html += '<div id="cResumen"></div><div id="cVolver"></div>' +
        '<div class="card tap" id="cInvitar"><div class="flex"><span style="font-size:28px">🤝</span><div class="grow"><b>Invita a otra barbería' + (K.regla('dias_referido') ? ' y gana ' + K.regla('dias_referido') + ' días de Premium' : '') + '</b>' +
        '<div class="sub muted">Comparte tu QR de registro: cuando pague su primer mes, ganas.</div></div><span>›</span></div></div>';
      html += '<div class="card ' + (premium() ? 'oro-marco' : '') + ' tap" id="cPlan"><div class="flex"><span style="font-size:28px">' + (premium() ? '⭐' : '💎') + '</span><div class="grow"><b>' +
        (premium() ? 'Premium hasta el ' + P.fechaCorta(b.premium_until) : 'Plan Free') + '</b><div class="sub muted">' + (premium() ? 'Toca para renovar' : 'Toca para ver Premium') + '</div></div><span>›</span></div></div>';
    }
    if (!dueno()) html += '<div class="card tap" id="cMiLink"><div class="flex"><span style="font-size:28px">🔳</span><div class="grow"><b>Mi link y QR</b>' +
      '<div class="sub muted">Tus clientes te reservan directo a ti.</div></div><span>›</span></div></div><div id="cVolver"></div>';
    el.innerHTML = html;
    el.querySelectorAll('[data-aprobar]').forEach((x) => x.onclick = (ev) => C.accion(ev.target, async () => {
      const r = P2.revision.find((y) => y.id === x.dataset.aprobar);
      await K.rpc('confirmar_hora', { p_reserva: x.dataset.aprobar }); K.despertarEnvios(); Avisos.actualizar(); hoy();
      if (r && r.invitado) avisarInvitado(r, 'aprobada');
    }, '✅ Aprobada: la hora quedó agendada'));
    el.querySelectorAll('[data-rechazar]').forEach((x) => x.onclick = () => rechazar(x.dataset.rechazar, true, () => { Avisos.actualizar(); hoy(); }, P2.revision.find((y) => y.id === x.dataset.rechazar)));
    el.querySelectorAll('[data-devuelto]').forEach((x) => x.onclick = (ev) => C.accion(ev.target, async () => {
      await K.rpc('marcar_devuelto', { p_reserva: x.dataset.devuelto }); Avisos.actualizar(); hoy();
    }, '💸 Marcado como devuelto'));
    el.querySelectorAll('[data-nollego]').forEach((x) => x.onclick = async (ev) => {
      if (!await C.confirmar('Revisaste tu cuenta y la transferencia no llegó: no hay nada que devolver. Al cliente le llega el aviso.', { si: 'No llegó' })) return;
      C.accion(ev.target, async () => {
        const r = P2.devoluciones.find((y) => y.id === x.dataset.nollego);
        await K.rpc('descartar_devolucion', { p_reserva: x.dataset.nollego }); K.despertarEnvios(); Avisos.actualizar(); hoy();
        if (r && r.invitado) avisarInvitado(r, 'no_llego');
      }, 'Listo: sin devolución');
    });
    if ($('upRecordar')) $('upRecordar').addEventListener('click', (e) => { e.preventDefault(); P.upsell('Recordatorio por WhatsApp en 1 toque'); }, true);
    if ($('cInvitar')) $('cInvitar').onclick = () => { mostrar('mas'); abrirSeccion('invitar'); };
    if ($('cMiLink')) $('cMiLink').onclick = () => { mostrar('mas'); abrirSeccion('milink'); };
    tarjetasResumen();
    el.querySelectorAll('[data-comp]').forEach((x) => x.onclick = () => verComprobante(x.dataset.comp));
    el.querySelectorAll('[data-ver]').forEach((x) => x.onclick = () => abrirReserva(x.dataset.ver));
    el.querySelectorAll('[data-ir]').forEach((x) => x.onclick = () => { mostrar('mas'); abrirSeccion(x.dataset.ir); });
    if ($('chkAgenda')) $('chkAgenda').onchange = async (e) => {
      try { await K.rpc('set_agenda_abierta', { p_abierta: e.target.checked }); yo.agenda_abierta = e.target.checked; await cargarBarberia(); C.toast(e.target.checked ? '🟢 Agenda abierta' : '🔴 Agenda llena: no te pueden reservar'); }
      catch (err) { C.toast('⚠️ ' + err.message); e.target.checked = !e.target.checked; }
    };
    $('bHoraHoy').onclick = () => nuevaHora(yo.id, f, null);
    if ($('bCopiarLink')) $('bCopiarLink').onclick = () => C.copiar(linkClientes());
    if ($('bQR')) $('bQR').onclick = enlaceClientes;
    if ($('cPlan')) $('cPlan').onclick = () => { mostrar('mas'); abrirSeccion('plan'); };
    Avisos.invitarPush(el);
  }

  // Rechazar el comprobante (con motivo: la hora se libera) o anular una hora agendada (el abono queda a favor).
  async function rechazar(id, revision, despues, info) {
    const motivo = await C.pedir(revision ? '❌ Rechazar comprobante' : 'Anular hora', {
      texto: revision ? 'La hora se libera y el cliente ve el motivo. ¿Por qué lo rechazas?' : 'El cliente recibirá un aviso y su abono quedará a favor. Motivo (opcional):',
      placeholder: revision ? 'Ej: No llegó la transferencia' : 'Ej: Ese día no trabajo' });
    if (motivo === null) return;
    if (revision && !motivo) return C.toast('Escribe el motivo del rechazo');
    try {
      await K.rpc('rechazar_hora', { p_reserva: id, p_motivo: motivo }); K.despertarEnvios(); rango = ''; C.toast(revision ? 'Comprobante rechazado: la hora quedó libre' : 'Hora anulada'); despues && despues();
      if (info && info.invitado) avisarInvitado(Object.assign({}, info, { motivo }), revision ? 'rechazada' : 'anulada');
    } catch (e) { C.toast('⚠️ ' + e.message, 4000); }
  }

  const linkClientes = () => C.raiz() + '?b=' + bar().codigo;
  const linkHora = (token) => C.raiz() + 'r/?t=' + token;
  const primerNombre = (n) => String(n || '').split(' ')[0];

  // v2.1: el cliente sin cuenta no recibe avisos de la app: al aprobar o rechazar, se le avisa por WhatsApp con el mensaje listo.
  function avisarInvitado(r, tipo) {
    const tel = r.cliente_tel;
    if (!tel) return;
    const b = bar(), cuando = C.cuando(r.inicio);
    const msg = {
      aprobada: 'Hola ' + primerNombre(r.cliente) + ' 👋 Tu hora del ' + cuando + ' en ' + b.nombre + ' quedó agendada ✅. Aquí la ves, la cancelas o la reagendas: ' + linkHora(r.token),
      rechazada: 'Hola ' + primerNombre(r.cliente) + ', revisamos tu comprobante del ' + cuando + ' en ' + b.nombre + ' y no pudimos aprobarlo' + (r.motivo ? ': ' + r.motivo : '') +
        '. La hora quedó libre. Puedes volver a reservar aquí: ' + linkClientes(),
      anulada: 'Hola ' + primerNombre(r.cliente) + ', tuvimos que anular tu hora del ' + cuando + ' en ' + b.nombre + (r.motivo ? ' (' + r.motivo + ')' : '') +
        '. Tu abono quedó a favor: reagenda aquí: ' + linkHora(r.token),
      no_llego: 'Hola ' + primerNombre(r.cliente) + ', revisamos y no nos llegó tu transferencia del abono de la hora del ' + cuando + ' en ' + b.nombre + ', por eso no hay devolución. Si fue un error, mándanos el comprobante 🙏'
    }[tipo];
    const h = C.hoja('<h2>💬 Avísale por WhatsApp</h2><p class="muted" style="margin-top:-6px">' + esc(r.cliente) + ' reservó sin cuenta: no le llegan los avisos de la app.</p>' +
      '<textarea data-m style="min-height:130px">' + esc(msg) + '</textarea><div class="btns" style="flex-direction:column">' +
      '<a class="btn wsp full" target="_blank" rel="noopener" data-w>💬 Enviar por WhatsApp</a><button class="gris full" data-no>Ahora no</button></div>');
    const w = h.q('[data-w]');
    const act = () => { w.href = C.wa(tel, h.q('[data-m]').value); };
    act(); h.q('[data-m]').oninput = act;
    w.addEventListener('click', () => setTimeout(() => h.cerrar(), 300));
    h.q('[data-no]').onclick = () => h.cerrar();
  }

  // Mensaje de recordatorio por WhatsApp (con el link de su hora si reservó sin cuenta).
  function msgRecordar(r) {
    const b = bar(), f = C.fechaDe(r.inicio), x = barbero(r.barbero_id) || {};
    return 'Hola ' + primerNombre(r.cliente) + ' 👋 Te recordamos tu hora ' + (C.relativoDia(f) === 'Mañana' ? 'de mañana, ' : 'del ') + C.fechaLarga(f) + ' a las ' + C.horaDe(r.inicio) +
      (x.nombre ? ' con ' + x.nombre : '') + ' en ' + b.nombre + (b.direccion ? ' (' + b.direccion + ')' : '') + '. ' +
      (r.invitado && r.token ? 'Si no puedes venir, anúlala o reagéndala aquí: ' + linkHora(r.token) : 'Si no puedes venir, anúlala en la app con tiempo.') + ' ¡Te esperamos! 💈';
  }

  // v2.1: tarjetas del Inicio: resumen del mes (Free: con la plata borrosa) y clientes que no vuelven.
  async function tarjetasResumen() {
    if (dueno() && $('cResumen')) {
      K.rpc('resumen_mes', { p_mes: null }).then((x) => {
        const z = $('cResumen');
        if (!z) return;
        const borroso = (v) => x.bloqueado ? '<span class="borroso">$123.456</span>' : C.plata(v);
        z.innerHTML = '<div class="card tap' + (x.bloqueado ? ' oro-marco' : '') + '" data-ir-res><h2>📈 Tu mes hasta hoy <span class="grow"></span>' + (x.bloqueado ? '<span class="pill oro">🔒 Premium</span>' : '<span>›</span>') + '</h2>' +
          '<div class="stats" style="margin:0"><div class="card"><small>Ganaste</small><b>' + borroso(x.ventas) + '</b></div><div class="card"><small>Cortes</small><b>' + x.cortes + '</b></div>' +
          '<div class="card"><small>Clientes nuevos</small><b>' + x.nuevos + '</b></div><div class="card"><small>No vinieron</small><b style="color:var(--bad)">' + x.no_vino + '</b></div></div>' +
          (x.bloqueado ? '<p class="muted chico" style="margin-bottom:0">Con Premium ves cuánto ganaste, tu mejor día, lo que perdiste por los que no vinieron y te llega el resumen cada mes.</p>' : '') + '</div>';
        z.querySelector('[data-ir-res]').onclick = () => { if (x.bloqueado) P.upsell('Resumen del mes con tus ganancias'); else { mostrar('mas'); abrirSeccion('resumen'); } };
      }).catch(() => {});
    }
    if ($('cVolver')) {
      K.rpc('no_vuelven').then((x) => {
        const z = $('cVolver');
        if (!z || !x.total) return;
        z.innerHTML = '<div class="card tap"><div class="flex"><span style="font-size:28px">👋</span><div class="grow"><b>' + x.total + ' cliente' + (x.total === 1 ? '' : 's') + ' no vuelve' + (x.total === 1 ? '' : 'n') + ' hace +' + x.dias + ' días</b>' +
          '<div class="sub muted">' + (x.bloqueado ? '🔒 Premium: ve quiénes son y escríbeles con una oferta en 1 toque.' : 'Escríbeles con una oferta en 1 toque.') + '</div></div><span>›</span></div></div>';
        z.firstChild.onclick = () => { if (x.bloqueado) P.upsell('Clientes que no vuelven'); else { mostrar('mas'); abrirSeccion('volver'); } };
      }).catch(() => {});
    }
  }

  /* ---------- Agenda ---------- */
  let vista = 'dia', fechaSel = C.hoy(), quien = null, verAnuladas = false;
  function agenda() {
    if (!quien) quien = dueno() && tiene('vista_todos') && B.barberos.length > 1 ? '*' : yo.id;
    pintarAgenda();
  }
  async function pintarAgenda(forzar) {
    const el = $('v-agenda');
    const ids = B.barberos.map((b) => b.id);
    let html = '<div class="card" style="padding:12px"><div class="chips" id="chQuien">' +
      (B.barberos.length > 1 ? '<button class="chip' + (quien === '*' ? ' on' : '') + '" data-q="*">👥 Todos</button>' : '') +
      B.barberos.map((b) => '<button class="chip' + (quien === b.id ? ' on' : '') + '" data-q="' + b.id + '">' + esc(b.id === yo.id ? 'Yo' : b.nombre.split(' ')[0]) + (b.activo ? '' : ' (inactivo)') + '</button>').join('') + '</div>' +
      '<div class="seg" style="margin:8px 0"><button data-vi="dia">Día</button><button data-vi="semana">Semana</button><button data-vi="mes">Mes</button><button data-vi="anio">Año</button></div>' +
      '<div class="barra-cal"><button class="icono" id="cAnt">‹</button><button class="small gris" id="cHoy">Hoy</button><span class="fecha-tit" id="cTit"></span><button class="icono" id="cSig">›</button></div>' +
      '<div class="btns" style="margin-top:0"><button class="small" id="cNueva">+ Hora</button><button class="small gris" id="cBloq">⛔ Bloquear</button>' +
      '<label class="check" style="margin:0 0 0 auto;font-size:13.5px"><input type="checkbox" id="cAnul"' + (verAnuladas ? ' checked' : '') + '> anuladas</label></div></div><div id="calZona"></div>';
    el.innerHTML = html;
    if (!tiene('vista_todos') && dueno()) {
      const t = el.querySelector('[data-q="*"]'); if (t) P.bloquear(t, 'Vista "Todos" en columnas');
      P.bloquear(el.querySelector('[data-vi="anio"]'), 'Vista Año');
    } else if (!dueno()) {
      const t = el.querySelector('[data-q="*"]'); if (t) t.remove();
    }
    el.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => { quien = b.dataset.q; pintarAgenda(); });
    el.querySelectorAll('[data-vi]').forEach((b) => { b.classList.toggle('on', b.dataset.vi === vista); b.onclick = () => { vista = b.dataset.vi; pintarAgenda(); }; });
    const paso = { dia: 1, semana: 7, mes: 0, anio: 0 }[vista];
    const mover = (n) => {
      if (vista === 'mes') { const [y, m] = fechaSel.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); fechaSel = d.getUTCFullYear() + '-' + C.pad(d.getUTCMonth() + 1) + '-01'; }
      else if (vista === 'anio') fechaSel = (+fechaSel.slice(0, 4) + n) + '-01-01';
      else fechaSel = C.sumarDias(fechaSel, n * paso);
      pintarAgenda();
    };
    $('cAnt').onclick = () => mover(-1);
    $('cSig').onclick = () => mover(1);
    $('cHoy').onclick = () => { fechaSel = C.hoy(); pintarAgenda(); };
    $('cNueva').onclick = () => nuevaHora(quien === '*' ? yo.id : quien, fechaSel, null);
    $('cBloq').onclick = () => nuevoBloqueo(quien === '*' ? null : quien);
    $('cAnul').onchange = (e) => { verAnuladas = e.target.checked; pintarAgenda(); };
    if (!dueno() && quien !== yo.id) { $('cNueva').classList.add('hidden'); $('cBloq').classList.add('hidden'); }

    // Rango a cargar
    let desde, hasta;
    if (vista === 'dia') { desde = hasta = fechaSel; }
    else if (vista === 'semana') { desde = C.sumarDias(fechaSel, -(C.dow(fechaSel) - 1)); hasta = C.sumarDias(desde, 6); }
    else if (vista === 'mes') { desde = fechaSel.slice(0, 7) + '-01'; hasta = C.sumarDias(C.sumarDias(desde, 32).slice(0, 7) + '-01', -1); }
    else { desde = fechaSel.slice(0, 4) + '-01-01'; hasta = fechaSel.slice(0, 4) + '-12-31'; }
    const zona = $('calZona');
    zona.innerHTML = '<p class="muted centro">Cargando…</p>';
    try { await cargarDatos(desde, hasta, forzar || true); } catch (e) { zona.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
    if (!zona.isConnected || !$('cTit')) return; // otra vista reemplazó la agenda mientras cargaba
    const lista = quien === '*' ? ids : [quien];
    if (vista === 'dia') {
      $('cTit').textContent = C.relativoDia(fechaSel) === C.fechaLarga(fechaSel) ? C.fechaLarga(fechaSel) : C.relativoDia(fechaSel) + ' · ' + C.diaCorto(fechaSel);
      const cols = lista.map((id) => ({ f: fechaSel, barbero: id, titulo: esc(id === yo.id ? 'Yo' : (barbero(id) || {}).nombre || ''), hoy: fechaSel === C.hoy() }));
      zona.innerHTML = '<div id="tl"></div>';
      A.timeline($('tl'), { cols, datos, horarios: horarios(), staff: true, verAnuladas, ancho: lista.length > 1 ? 120 : 200,
        alBloque: abrirReserva, alBloqueo: borrarBloqueo,
        alLibre: (c, m) => { if (!dueno() && c.barbero !== yo.id) return; nuevaHora(c.barbero, c.f, C.aHHMM(m)); } });
    } else if (vista === 'semana') {
      $('cTit').textContent = C.diaCorto(desde) + ' – ' + C.diaCorto(hasta);
      const id = quien === '*' ? yo.id : quien;
      const cols = [];
      for (let i = 0; i < 7; i++) { const f = C.sumarDias(desde, i); cols.push({ f, barbero: id, titulo: C.diaCorto(f), hoy: f === C.hoy() }); }
      zona.innerHTML = (quien === '*' ? '<p class="muted chico">Semana de ' + esc(barbero(id).nombre) + '. Elige un barbero arriba para ver la suya.</p>' : '') + '<div id="tl"></div>';
      A.timeline($('tl'), { cols, datos, horarios: horarios(), staff: true, verAnuladas, ancho: 96, px: 0.9,
        alBloque: abrirReserva, alBloqueo: borrarBloqueo,
        alLibre: (c, m) => { if (!dueno() && c.barbero !== yo.id) return; nuevaHora(c.barbero, c.f, C.aHHMM(m)); } });
    } else if (vista === 'mes') {
      const [y, m] = desde.split('-').map(Number);
      $('cTit').textContent = C.MESES[m - 1][0].toUpperCase() + C.MESES[m - 1].slice(1) + ' ' + y;
      zona.innerHTML = '<div class="card" style="padding:10px"><div id="mesG"></div></div><p class="muted chico">El número es la cantidad de horas del día; la barrita, qué tan lleno está.</p>';
      A.mes($('mesG'), { mes: desde.slice(0, 7), staff: true, info: (f) => A.llenado(lista, f, datos, horarios()), alDia: (f) => { fechaSel = f; vista = 'dia'; pintarAgenda(); } });
    } else {
      $('cTit').textContent = 'Año ' + desde.slice(0, 4);
      zona.innerHTML = '<div id="anioG"></div>';
      A.anio($('anioG'), { anio: desde.slice(0, 4), info: (f) => A.llenado(lista, f, datos, horarios()), alMes: (mm) => { fechaSel = mm + '-01'; vista = 'mes'; pintarAgenda(); } });
    }
  }

  // Detalle de una hora con todas sus acciones.
  async function abrirReserva(id, fresco) {
    let r = fresco ? null : (datos.reservas || []).find((x) => x.id === id);
    if (!r || !r.detalle) {
      try {
        const t = new Date(); const d = await K.rpc('ocupacion', { p_desde: C.sumarDias(C.fechaDe(t), -60), p_hasta: C.sumarDias(C.fechaDe(t), 120) });
        r = d.reservas.find((x) => x.id === id);
      } catch (e) { /* nada */ }
    }
    if (!r || !r.detalle) return C.toast('No se encontró la hora');
    const b = barbero(r.barbero_id) || {};
    const puede = dueno() || r.barbero_id === yo.id;
    const activa = ACTIVA.includes(r.estado);
    const revision = REVISION.includes(r.estado);
    const plata = dueno();
    const cli = r.cliente_id ? { nombre: r.cliente, avatar: r.cliente_avatar } : { nombre: r.cliente, avatar: r.invitado ? '👤' : '🚶' };
    const h = C.hoja('<h2>' + C.avatar(cli, 'sm' + (r.cliente_premium ? ' premium' : '')) + ' ' + esc(r.cliente) + (r.cliente_premium ? ' <span class="pill oro">⭐ Premium</span>' : '') +
      (r.invitado ? ' <span class="pill">sin cuenta</span>' : '') + '</h2>' +
      '<div style="margin-bottom:10px">' + A.estadoPill(r.estado) + (r.nota_cliente ? ' ' + estrellas(r.nota_cliente) + ' <span class="muted chico">(' + r.nota_cliente.total + ')</span>' : '') + '</div>' +
      alertaNegra(r.lista_negra) +
      '<div class="det-fila"><span>📅 Cuándo</span><b>' + C.cuando(r.inicio) + '–' + C.horaDe(r.fin) + '</b></div>' +
      '<div class="det-fila"><span>💈 Barbero</span><b>' + esc(b.nombre || '') + '</b></div>' +
      '<div class="det-fila"><span>✂️ Servicios</span><b style="text-align:right">' + esc(r.servicios.map((s) => s.nombre).join(' + ') || '—') + '</b></div>' +
      (r.cliente_tel ? '<div class="det-fila"><span>📱 WhatsApp</span><b>' + esc(r.cliente_tel) + '</b></div>' : '') +
      (plata ? '<div class="det-fila"><span>💵 Total</span><b>' + C.plata(r.total) + '</b></div>' : '') +
      '<div class="det-fila"><span>💳 Abono</span><b>' + (r.pagado_con === 'interno' ? 'Agendada por la barbería' : r.estado === 'esperando_abono' ? 'Esperando que pague' :
        (plata ? C.plata(r.abono) + ' · ' : '') + ({ link: 'link de pago', transferencia: 'transferencia', saldo: 'saldo a favor' }[r.pagado_con] || '—') + (revision ? ' · en revisión' : '')) + '</b></div>' +
      (plata && r.pagado_con !== 'interno' && r.abono ? '<div class="det-fila"><span>Cobrar en el local</span><b>' + C.plata(Math.max(0, r.total - (r.estado === 'esperando_abono' ? 0 : r.abono))) + '</b></div>' : '') +
      (r.reagendada ? '<div class="det-fila"><span>🔁 Reagendada</span><b>' + r.reagendada + ' vez/veces</b></div>' : '') +
      (r.nota ? '<div class="det-fila"><span>📝 Nota</span><b>' + esc(r.nota) + '</b></div>' : '') +
      (r.motivo ? '<div class="det-fila"><span>Motivo</span><b>' + esc(r.motivo) + (r.abono_destino ? ' · abono ' + ({ saldo: 'a favor', perdido: 'perdido', devolucion: r.devolucion === 'devuelta' ? 'devuelto' : 'por devolver' }[r.abono_destino]) : '') + '</b></div>' : '') +
      '<div data-avisos class="muted chico" style="margin-top:8px"></div>' +
      '<div class="btns">' +
      (r.tiene_comprobante ? '<button class="gris" data-a="comp">🧾 Comprobante</button>' : '') +
      (puede && revision ? '<button class="ok" data-a="aprobar">✅ Aprobar</button><button class="danger" data-a="rechazar">Rechazar</button>' : '') +
      (dueno() && r.devolucion === 'pendiente' ? '<button class="ok" data-a="devuelto">💸 Ya lo devolví</button>' : '') +
      (puede && ['agendada', 'confirmada', 'en_revision', 'por_aprobar', 'atendida', 'no_vino'].includes(r.estado) && new Date(r.inicio) < Date.now() + 30 * 60000 ?
        '<button data-a="aten">✔️ Atendida</button><button class="gris" data-a="novino">🚫 No vino</button>' : '') +
      (puede && ['atendida', 'no_vino'].includes(r.estado) && !r.calificado && (r.cliente_id || r.cliente_tel) ? '<button class="alt" data-a="calificar">⭐ Calificar al cliente</button>' : '') +
      (puede && activa ? '<button class="gris" data-a="mover">🔁 Mover</button>' + (!revision ? '<button class="danger" data-a="anular">Anular</button>' : '') : '') +
      (puede && ['agendada', 'confirmada'].includes(r.estado) && r.cliente_tel && new Date(r.inicio) > Date.now() ?
        '<button class="gris' + (tiene('recordar_wsp') ? '' : ' plata') + '" data-a="recordar">📲 Recordar</button>' : '') +
      (r.cliente_id ? '<button class="gris" data-a="chat">💬 Escribir</button>' : '') +
      (r.cliente_tel ? '<a class="btn wsp" target="_blank" rel="noopener" href="' + C.wa(r.cliente_tel, 'Hola ' + r.cliente.split(' ')[0] + ', te escribo de ' + bar().nombre + ' por tu hora del ' + C.cuando(r.inicio)) + '">WhatsApp</a>' : '') +
      '</div>');
    K.rpc('avisos_de_reserva', { p_reserva: r.id }).then((av) => {
      if (!av.length) return;
      h.q('[data-avisos]').innerHTML = '<b>Avisos de esta hora</b><br>' + av.map((x) => esc(x.titulo) + ' → ' + esc(x.para) + ' · ' + C.hace(x.created_at) + ' ' +
        (x.visto_at ? '<span class="ticks visto">✓✓</span> visto ' + C.horaDe(x.visto_at) : x.recibido ? '<span class="ticks">✓✓</span> recibido' : '<span class="ticks">✓</span> enviado')).join('<br>');
    }).catch(() => {});
    const fin = async (msg) => { h.cerrar(); K.despertarEnvios(); if (msg) C.toast(msg); rango = ''; Avisos.actualizar(); refrescarVista(); };
    h.qa('[data-a]').forEach((btn) => btn.onclick = async () => {
      const a = btn.dataset.a;
      try {
        if (a === 'aprobar') { await C.accion(btn, () => K.rpc('confirmar_hora', { p_reserva: r.id })); fin('✅ Aprobada: la hora quedó agendada'); if (r.invitado) avisarInvitado(r, 'aprobada'); }
        if (a === 'rechazar') { h.cerrar(); rechazar(r.id, true, () => { Avisos.actualizar(); refrescarVista(); }, r); }
        if (a === 'anular') { h.cerrar(); rechazar(r.id, false, () => { Avisos.actualizar(); refrescarVista(); }, r); }
        if (a === 'recordar') { if (!tiene('recordar_wsp')) P.upsell('Recordatorio por WhatsApp en 1 toque'); else open(C.wa(r.cliente_tel, msgRecordar(r)), '_blank'); }
        if (a === 'devuelto') { await K.rpc('marcar_devuelto', { p_reserva: r.id }); fin('💸 Marcado como devuelto'); }
        if (a === 'comp') verComprobante(r.id);
        if (a === 'chat') { h.cerrar(); mostrar('chat'); Chat.abrir(r.cliente_id, { nombre: r.cliente, avatar: r.cliente_avatar, rol: 'client' }, r.id); }
        if (a === 'novino') {
          if (await C.confirmar('Marcar que ' + r.cliente + ' no vino. Su abono se pierde.', { si: 'No vino' })) {
            await K.rpc('marcar_hora', { p_reserva: r.id, p_estado: 'no_vino' }); fin('Marcado como "No vino"');
            if (!r.calificado && (r.cliente_id || r.cliente_tel)) calificarCliente(r, 'No vino');
          }
        }
        if (a === 'aten') atendida(r, fin);
        if (a === 'calificar') { h.cerrar(); calificarCliente(r); }
        if (a === 'mover') moverHora(r, fin);
      } catch (e) { C.toast('⚠️ ' + e.message, 4000); }
    });
  }

  function atendida(r, fin) {
    const plata = dueno();
    const resto = Math.max(0, r.total - (['link', 'transferencia', 'saldo'].includes(r.pagado_con) ? r.abono : 0));
    const h = C.hoja('<h2>✔️ Atendida</h2>' + (plata ? '<p>Queda anotada en la caja: <b>' + C.plata(r.total) + '</b>' + (resto !== r.total ? ' (abono ' + C.plata(r.abono) + ' ya recibido; cobras ' + C.plata(resto) + ')' : '') + '.</p>'
      : '<p>Queda anotada en tu caja.</p>') +
      '<label>¿Cómo pagó el resto?</label><div class="seg" data-medio><button class="on" data-m="efectivo">💵 Efectivo</button><button data-m="transferencia">🏦 Transferencia</button></div>' +
      (plata ? '<label>Propina <span class="opc">(opcional)</span></label><input type="number" inputmode="numeric" min="0" data-prop placeholder="0">' : '') +
      '<div class="btns"><button class="full" data-ok>Guardar</button></div>');
    let medio = 'efectivo';
    h.qa('[data-m]').forEach((b) => b.onclick = () => { medio = b.dataset.m; h.qa('[data-m]').forEach((x) => x.classList.toggle('on', x === b)); });
    h.q('[data-ok]').onclick = (ev) => C.accion(ev.target, async () => {
      await K.rpc('marcar_hora', { p_reserva: r.id, p_estado: 'atendida', p_medio: medio, p_propina: h.q('[data-prop]') ? (+h.q('[data-prop]').value || 0) : 0 });
      h.cerrar(); fin('✔️ Atendida y anotada en la caja');
      if (!r.calificado && (r.cliente_id || r.cliente_tel)) calificarCliente(r);
    });
  }

  // Calificar al cliente (una vez por visita). Con pocas estrellas queda en la lista negra de la barbería.
  const MOTIVOS = ['Excelente cliente', 'Puntual', 'Llegó tarde', 'No vino', 'Canceló a última hora', 'Mala actitud'];
  function calificarCliente(r, motivo) {
    let n = motivo === 'No vino' ? 1 : 0, mot = motivo || '';
    const lim = K.regla('estrellas_lista_negra');
    const h = C.hoja('<h2>⭐ Califica a ' + esc(r.cliente.split(' ')[0]) + '</h2><p class="muted" style="margin-top:-6px">Solo lo ve tu barbería. Con ' + lim + ' estrella' + (lim === 1 ? '' : 's') + ' o menos queda en la lista negra.</p>' +
      '<div class="centro"><div class="estrellas grande">' + [1, 2, 3, 4, 5].map((i) => '<button type="button" data-n="' + i + '" class="' + (i <= n ? 'on' : '') + '">★</button>').join('') + '</div></div>' +
      '<div class="chips" style="flex-wrap:wrap;margin-top:8px">' + MOTIVOS.map((m) => '<button type="button" class="chip' + (m === mot ? ' on' : '') + '" data-mot="' + esc(m) + '">' + esc(m) + '</button>').join('') + '</div>' +
      '<input data-c maxlength="300" placeholder="Comentario (opcional)" style="margin-top:10px">' +
      '<div class="btns"><button class="full" data-ok' + (n ? '' : ' disabled') + '>Guardar</button><button class="gris" data-luego>Ahora no</button></div>');
    h.qa('[data-n]').forEach((b) => b.onclick = () => { n = +b.dataset.n; h.qa('[data-n]').forEach((x) => x.classList.toggle('on', +x.dataset.n <= n)); h.q('[data-ok]').disabled = false; });
    h.qa('[data-mot]').forEach((b) => b.onclick = () => { mot = mot === b.dataset.mot ? '' : b.dataset.mot; h.qa('[data-mot]').forEach((x) => x.classList.toggle('on', x.dataset.mot === mot)); });
    h.q('[data-luego]').onclick = () => h.cerrar();
    h.q('[data-ok]').onclick = (ev) => C.accion(ev.target, async () => {
      await K.rpc('calificar_cliente', { p_reserva: r.id, p_estrellas: n, p_motivo: mot, p_comentario: h.q('[data-c]').value });
      h.cerrar(); rango = ''; clientes = null; refrescarVista();
    }, n <= lim ? '⚠️ Calificado: quedó en la lista negra' : '⭐ Calificado');
  }

  function moverHora(r, fin) {
    const dur = (new Date(r.fin) - new Date(r.inicio)) / 60000;
    const h = C.hoja('<h2>🔁 Mover hora</h2><p class="muted">' + esc(r.cliente) + ' · ' + dur + ' min</p>' +
      (dueno() ? '<label>Barbero</label><select data-b>' + B.barberos.map((b) => '<option value="' + b.id + '"' + (b.id === r.barbero_id ? ' selected' : '') + '>' + esc(b.nombre) + '</option>').join('') + '</select>' : '') +
      '<div class="row"><div><label>Día</label><input type="date" data-f value="' + C.fechaDe(r.inicio) + '"></div><div><label>Hora</label><input type="time" step="900" data-h value="' + C.horaDe(r.inicio) + '"></div></div>' +
      '<p class="muted chico">El cliente recibe un aviso con la hora nueva.</p><div class="btns"><button class="full" data-ok>Mover</button></div>');
    h.q('[data-ok]').onclick = (ev) => C.accion(ev.target, async () => {
      const t = C.instante(h.q('[data-f]').value, h.q('[data-h]').value);
      await K.rpc('mover_hora', { p_reserva: r.id, p_barbero: h.q('[data-b]') ? h.q('[data-b]').value : r.barbero_id, p_inicio: t.toISOString() });
      h.cerrar(); fin('🔁 Hora movida');
    });
  }

  async function verComprobante(id) {
    try {
      const img = await K.rpc('ver_comprobante', { p_reserva: id });
      if (!img) return C.toast('El comprobante ya no está (se borran a los ' + K.regla('dias_comprobantes') + ' días)');
      const h = C.hoja('<h2>🧾 Comprobante</h2><img src="' + img + '" alt="Comprobante" class="comp-img">' +
        '<div class="btns"><a class="btn gris" download="comprobante.jpg" href="' + img + '">⬇️ Descargar</a></div>');
      h.q('.panel').style.maxWidth = '720px';
    } catch (e) { C.toast('⚠️ ' + e.message); }
  }

  // Hora creada por la barbería (cliente que escribió, llamó o llegó).
  async function nuevaHora(barberoId, f, hhmm, pre) {
    if (!dueno() && barberoId !== yo.id) barberoId = yo.id;
    try { await cargarClientes(); } catch (e) { clientes = []; }
    const carro = new Set();
    const h = C.hoja('<h2>📅 Agendar una hora</h2>' +
      '<label>Cliente</label><input data-buscar placeholder="🔎 Busca un cliente o escribe un nombre" list="dlCli"><datalist id="dlCli">' +
      clientes.filter((c) => c.id).map((c) => '<option value="' + esc(c.nombre) + '">').join('') + '</datalist>' +
      '<p class="muted chico" data-cli-info>Si no tiene cuenta, escribe su nombre igual.</p>' +
      '<label>WhatsApp <span class="opc">(si no tiene cuenta)</span></label><input data-tel inputmode="tel" placeholder="+56 9…">' +
      (dueno() ? '<label>Barbero</label><select data-b>' + B.barberos.map((b) => '<option value="' + b.id + '"' + (b.id === barberoId ? ' selected' : '') + '>' + esc(b.nombre) + '</option>').join('') + '</select>' : '') +
      '<div class="row"><div><label>Día</label><input type="date" data-f value="' + f + '"></div><div><label>Hora</label><input type="time" step="900" data-h value="' + (hhmm || '') + '"></div></div>' +
      '<label>Servicios</label><div class="chips" style="flex-wrap:wrap" data-servs>' + B.servicios.map((s) => '<button type="button" class="chip" data-s="' + s.id + '">' + esc(s.nombre) + ' · ' + s.duracion + "'" + '</button>').join('') + '</div>' +
      '<label>Duración (min)</label><input type="number" min="5" max="480" step="5" data-min placeholder="Se calcula con los servicios">' +
      '<label>Nota <span class="opc">(opcional)</span></label><input data-nota maxlength="200" placeholder="Ej: acordado por chat">' +
      '<div class="btns"><button class="full" data-ok>Agendar</button></div>');
    const buscar = h.q('[data-buscar]');
    const cliDe = () => clientes.find((c) => c.id && c.nombre.toLowerCase() === buscar.value.trim().toLowerCase());
    if (pre) { buscar.value = pre.nombre || ''; if (pre.invitado) h.q('[data-tel]').value = pre.telefono || ''; }
    buscar.oninput = () => { const c = cliDe(); h.q('[data-cli-info]').textContent = c ? '✅ Cliente con cuenta: le llegará un aviso' : 'Si no tiene cuenta, escribe su nombre igual.'; };
    h.qa('[data-s]').forEach((b) => b.onclick = () => {
      if (carro.has(b.dataset.s)) carro.delete(b.dataset.s); else carro.add(b.dataset.s);
      b.classList.toggle('on', carro.has(b.dataset.s));
      const bb = barbero(h.q('[data-b]') ? h.q('[data-b]').value : yo.id) || {};
      h.q('[data-min]').value = A.duracion(bb, [...carro].map(servicio).filter(Boolean)) || '';
    });
    h.q('[data-ok]').onclick = (ev) => C.accion(ev.target, async () => {
      if (!h.q('[data-h]').value) throw new Error('Elige la hora');
      const c = cliDe();
      const r = await K.rpc('crear_hora', {
        p_barbero: h.q('[data-b]') ? h.q('[data-b]').value : yo.id, p_inicio: C.instante(h.q('[data-f]').value, h.q('[data-h]').value).toISOString(),
        p_servicios: [...carro], p_cliente: c ? c.id : null, p_nombre: c ? null : buscar.value.trim(), p_minutos: +h.q('[data-min]').value || null, p_nota: h.q('[data-nota]').value,
        p_telefono: c ? null : (h.q('[data-tel]').value.trim() || null)
      });
      h.cerrar(); K.despertarEnvios(); rango = ''; fechaSel = h.q('[data-f]').value;
      C.toast('📅 Hora agendada' + (c ? '. Le avisamos al cliente' : ''));
      refrescarVista();
      return r;
    });
  }

  function nuevoBloqueo(barberoId) {
    const f = fechaSel;
    const h = C.hoja('<h2>⛔ Bloquear horario</h2><p class="muted">Feriados, vacaciones, trámites, "hoy salgo antes"… Nadie podrá reservar en ese rango.</p>' +
      (dueno() ? '<label>Para</label><select data-b><option value="">Toda la barbería</option>' + B.barberos.map((b) => '<option value="' + b.id + '"' + (b.id === barberoId ? ' selected' : '') + '>' + esc(b.nombre) + '</option>').join('') + '</select>' : '') +
      '<div class="row"><div><label>Desde</label><input type="date" data-f1 value="' + f + '"></div><div><label>Hora</label><input type="time" step="900" data-h1 value="00:00"></div></div>' +
      '<div class="row"><div><label>Hasta</label><input type="date" data-f2 value="' + f + '"></div><div><label>Hora</label><input type="time" step="900" data-h2 value="23:59"></div></div>' +
      '<label>Motivo <span class="opc">(opcional, solo lo ve el equipo)</span></label><input data-m maxlength="80" placeholder="Ej: Vacaciones">' +
      '<div class="btns"><button class="full" data-ok>Bloquear</button></div>');
    h.q('[data-ok]').onclick = (ev) => C.accion(ev.target, async () => {
      await K.rpc('guardar_bloqueo', {
        p_desde: C.instante(h.q('[data-f1]').value, h.q('[data-h1]').value).toISOString(),
        p_hasta: C.instante(h.q('[data-f2]').value, h.q('[data-h2]').value).toISOString(),
        p_barbero: h.q('[data-b]') ? (h.q('[data-b]').value || null) : yo.id, p_motivo: h.q('[data-m]').value
      });
      h.cerrar(); rango = ''; refrescarVista();
    }, '⛔ Horario bloqueado');
  }
  async function borrarBloqueo(id) {
    if (!await C.confirmar('¿Quitar este bloqueo? Se podrá reservar de nuevo en ese horario.', { si: 'Quitar' })) return;
    try { await K.rpc('borrar_bloqueo', { p_id: id }); rango = ''; refrescarVista(); C.toast('Bloqueo quitado'); } catch (e) { C.toast('⚠️ ' + e.message); }
  }

  /* ---------- Caja (en Más). El barbero ve sus cortes, sin montos. ---------- */
  let cajaRango = 'hoy', cajaQuien = null;
  async function caja() {
    const el = seccion('💵 Caja');
    const plata = dueno();
    const reportes = tiene('caja_reportes');
    const verTodos = dueno() && reportes;
    if (cajaQuien === null) cajaQuien = verTodos ? '*' : yo.id;
    const f = C.hoy();
    const rangos = { hoy: [f, f], semana: [C.sumarDias(f, -(C.dow(f) - 1)), f], mes: [f.slice(0, 8) + '01', f], mesant: null };
    const [y, m] = f.split('-').map(Number);
    const ant = new Date(Date.UTC(y, m - 2, 1));
    rangos.mesant = [ant.getUTCFullYear() + '-' + C.pad(ant.getUTCMonth() + 1) + '-01', C.sumarDias(f.slice(0, 8) + '01', -1)];
    el.innerHTML = '<div class="card" style="padding:12px"><div class="seg"><button data-r="hoy">Hoy</button><button data-r="semana">Semana</button><button data-r="mes">Mes</button><button data-r="mesant">Mes pasado</button></div>' +
      (verTodos && B.barberos.length > 1 ? '<div class="chips" style="margin-top:8px"><button class="chip" data-c="*">👥 Todos</button>' + B.barberos.map((b) => '<button class="chip" data-c="' + b.id + '">' + esc(b.id === yo.id ? 'Yo' : b.nombre.split(' ')[0]) + '</button>').join('') + '</div>' : '') +
      '</div><div id="cajaZona"><p class="muted centro">Cargando…</p></div>' +
      '<div class="btns"><button class="grande full" id="bAnotar">+ Anotar corte</button></div>';
    el.querySelectorAll('[data-r]').forEach((b) => {
      b.classList.toggle('on', b.dataset.r === cajaRango);
      if (!reportes && b.dataset.r !== 'hoy') P.bloquear(b, 'Reportes de caja');
      else b.onclick = () => { cajaRango = b.dataset.r; caja(); };
    });
    el.querySelectorAll('[data-c]').forEach((b) => { b.classList.toggle('on', b.dataset.c === cajaQuien); b.onclick = () => { cajaQuien = b.dataset.c; caja(); }; });
    $('bAnotar').onclick = () => anotar();
    const [d1, d2] = rangos[cajaRango];
    let l = [];
    try { l = await K.rpc('ver_caja', { p_desde: d1, p_hasta: d2, p_barbero: cajaQuien === '*' ? null : cajaQuien }); }
    catch (e) { if ($('cajaZona')) $('cajaZona').innerHTML = '<div class="card err">' + esc(e.message) + '</div>'; return; }
    if (!$('cajaZona')) return; // se cambió de sección mientras cargaba
    const sum = (fn) => l.reduce((t, k) => t + fn(k), 0);
    let z;
    if (plata) {
      z = '<div class="stats"><div class="card"><small>Total</small><b>' + C.plata(sum((k) => k.monto + k.propina)) + '</b></div><div class="card"><small>Cortes</small><b>' + l.length + '</b></div>' +
        '<div class="card"><small>💵 Efectivo</small><b>' + C.plata(sum((k) => (k.medio === 'efectivo' ? k.monto - k.abono : 0))) + '</b></div><div class="card"><small>🏦 Transferencias</small><b>' + C.plata(sum((k) => (k.medio === 'transferencia' ? k.monto - k.abono : 0))) + '</b></div>' +
        '<div class="card"><small>💳 Abonos</small><b>' + C.plata(sum((k) => k.abono)) + '</b></div><div class="card"><small>🙌 Propinas</small><b>' + C.plata(sum((k) => k.propina)) + '</b></div></div>';
    } else {
      z = '<div class="stats"><div class="card"><small>Mis cortes</small><b>' + l.length + '</b></div><div class="card"><small>💵 En efectivo</small><b>' + l.filter((k) => k.medio === 'efectivo').length + '</b></div>' +
        '<div class="card"><small>🏦 Por transferencia</small><b>' + l.filter((k) => k.medio === 'transferencia').length + '</b></div></div>';
    }
    if (verTodos && cajaQuien === '*' && B.barberos.length > 1) {
      const com = bar().comision;
      z += '<div class="card"><h2>👥 Por barbero <span class="pill">comisión ' + com + '%</span></h2><div class="scroll-x"><table class="tabla"><tr><th>Barbero</th><th class="n">Cortes</th><th class="n">Ventas</th><th class="n">Su parte</th></tr>' +
        B.barberos.map((b) => {
          const mios = l.filter((k) => k.barbero_id === b.id);
          const v = mios.reduce((t, k) => t + k.monto, 0), p = mios.reduce((t, k) => t + k.propina, 0);
          const parte = b.id === bar().owner_id ? v + p : Math.round(v * com / 100) + p;
          return '<tr><td>' + esc(b.nombre) + '</td><td class="n">' + mios.length + '</td><td class="n">' + C.plata(v + p) + '</td><td class="n">' + C.plata(parte) + '</td></tr>';
        }).join('') + '</table></div><p class="muted chico">La parte del barbero = comisión de sus cortes + sus propinas. Cambia el % en Perfil de la barbería.</p></div>';
    } else if (dueno() && !reportes) {
      z += '<div class="card plata" id="upCaja"><h2>👥 Caja de todo el equipo y comisiones</h2><p class="muted">Mira lo que vende cada barbero y cuánto le corresponde.</p></div>';
    }
    z += '<div class="card"><h2>🧾 Movimientos</h2>' + (l.length ? '<ul class="list">' + l.map((k) =>
      '<li class="tap" data-k="' + k.id + '"><div class="grow"><b>' + esc(k.servicio) + '</b><div class="sub">' + C.cuando(k.fecha) + (k.cliente ? ' · ' + esc(k.cliente) : '') +
      (cajaQuien === '*' ? ' · ' + esc(k.barbero) : '') + ' · ' + (k.medio === 'efectivo' ? '💵' : '🏦') + (plata && k.abono ? ' · abono ' + C.plata(k.abono) : '') + (plata && k.propina ? ' · propina ' + C.plata(k.propina) : '') + '</div></div>' +
      (plata ? '<b>' + C.plata(k.monto + k.propina) + '</b>' : '<span>›</span>') + '</li>').join('') + '</ul>' : '<div class="empty"><span class="ico">💵</span>Sin movimientos. Las horas marcadas como Atendida llegan solas.</div>') + '</div>';
    $('cajaZona').innerHTML = z;
    if ($('upCaja')) $('upCaja').onclick = () => P.upsell('Caja de todo el equipo');
    $('cajaZona').querySelectorAll('[data-k]').forEach((li) => li.onclick = () => anotar(l.find((k) => k.id === li.dataset.k)));
  }

  async function anotar(k) {
    try { await cargarClientes(); } catch (e) { clientes = []; }
    const plata = dueno();
    let servId = '';
    const h = C.hoja('<h2>' + (k ? '✏️ Editar corte' : '+ Anotar corte') + '</h2>' +
      '<label>Servicio</label><div class="chips" style="flex-wrap:wrap">' + B.servicios.map((s) => '<button type="button" class="chip" data-s="' + s.id + '">' + esc(s.nombre) + '</button>').join('') + '</div>' +
      '<input data-serv maxlength="80" placeholder="O escribe el servicio" value="' + esc(k ? k.servicio : '') + '" style="margin-top:8px">' +
      (plata ? '<label>Monto</label><input data-monto type="number" inputmode="numeric" min="0" value="' + (k ? k.monto : '') + '" placeholder="$">'
        : '<p class="muted chico">El precio lo toma la app del servicio elegido (si escribes otro, el dueño lo completa).</p>') +
      '<label>Medio de pago</label><div class="seg" data-medio><button data-m="efectivo">💵 Efectivo</button><button data-m="transferencia">🏦 Transferencia</button></div>' +
      '<details style="margin-top:12px"' + (k && (k.cliente || k.propina || k.nota) ? ' open' : '') + '><summary class="muted">Opcional: cliente' + (plata ? ', propina' : '') + ', nota</summary>' +
      '<label>Cliente</label><input data-cli list="dlCli2" value="' + esc(k ? k.cliente || '' : '') + '"><datalist id="dlCli2">' + clientes.filter((c) => c.id).map((c) => '<option value="' + esc(c.nombre) + '">').join('') + '</datalist>' +
      (plata ? '<label>Propina</label><input data-prop type="number" inputmode="numeric" min="0" value="' + (k ? k.propina || '' : '') + '">' : '') +
      '<label>Nota</label><input data-nota maxlength="200" value="' + esc(k ? k.nota || '' : '') + '"></details>' +
      (dueno() && !k && B.barberos.length > 1 ? '<label>Barbero</label><select data-b>' + B.barberos.map((b) => '<option value="' + b.id + '"' + (b.id === yo.id ? ' selected' : '') + '>' + esc(b.nombre) + '</option>').join('') + '</select>' : '') +
      '<div class="btns"><button class="full" data-ok>Guardar</button>' + (k ? '<button class="danger" data-del>Borrar</button>' : '') + '</div>');
    let medio = k ? k.medio : 'efectivo';
    const pintarMedio = () => h.qa('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === medio));
    pintarMedio();
    h.qa('[data-m]').forEach((b) => b.onclick = () => { medio = b.dataset.m; pintarMedio(); });
    h.qa('[data-s]').forEach((b) => b.onclick = () => {
      const s = servicio(b.dataset.s); servId = s.id; h.q('[data-serv]').value = s.nombre;
      if (h.q('[data-monto]')) h.q('[data-monto]').value = s.precio;
      h.qa('[data-s]').forEach((x) => x.classList.toggle('on', x === b));
    });
    h.q('[data-serv]').oninput = () => { servId = ''; h.qa('[data-s]').forEach((x) => x.classList.remove('on')); };
    h.q('[data-ok]').onclick = (ev) => C.accion(ev.target, async () => {
      const cli = clientes.find((c) => c.id && c.nombre.toLowerCase() === h.q('[data-cli]').value.trim().toLowerCase());
      const p = { id: k ? k.id : '', servicio: h.q('[data-serv]').value, servicio_id: servId, medio,
        cliente_id: cli ? cli.id : '', cliente_nombre: h.q('[data-cli]').value, nota: h.q('[data-nota]').value, barbero_id: h.q('[data-b]') ? h.q('[data-b]').value : '' };
      if (plata) { p.monto = h.q('[data-monto]').value === '' ? -1 : +h.q('[data-monto]').value; p.propina = +h.q('[data-prop]').value || 0; }
      await K.rpc('anotar_corte', { p });
      h.cerrar(); caja();
    }, '💵 Anotado');
    if (h.q('[data-del]')) h.q('[data-del]').onclick = async () => {
      if (!await C.confirmar('¿Borrar este movimiento de la caja?', { si: 'Borrar', peligro: true })) return;
      await K.rpc('borrar_corte', { p_id: k.id }); h.cerrar(); caja();
    };
  }

  /* ---------- Más ---------- */
  function mas() {
    const el = $('v-mas');
    const items = dueno() ? [
      ['negocio', '🏪', 'Perfil de la barbería', 'Logo, datos, colores'],
      ['horario', '🕐', 'Horario', 'Lunes a domingo y bloqueos'],
      ['tiempos', '⏱️', 'Mis tiempos', 'Cuánto dura cada corte y tu descanso'],
      ['servicios', '✂️', 'Servicios y precios', 'Tu catálogo'],
      ['links', '💳', 'Links de pago', 'Abono: 2 links y transferencia'],
      ['ofertas', '🏷️', 'Ofertas', 'Promos para tus clientes'],
      ['equipo', '💈', 'Mi equipo', 'Barberos y permisos'],
      ['caja', '💵', 'Caja', 'Cortes, ventas y comisiones'],
      ['estadisticas', '📊', 'Estadísticas', 'Ventas, servicios, horas'],
      ['resumen', '📈', 'Resumen del mes', 'Cuánto ganaste y tu mejor día'],
      ['volver', '👋', 'Clientes que no vuelven', 'Recupéralos con una oferta'],
      ['calificaciones', '⭐', 'Calificaciones', bar().calificacion && bar().calificacion.total ? bar().calificacion.promedio + ' ★ (' + bar().calificacion.total + ')' : 'Lo que dicen tus clientes'],
      ['enlace', '🔗', 'Enlace y QR', 'Para que tus clientes reserven'],
      ['invitar', '🤝', 'Invita una barbería', K.regla('dias_referido') ? 'Gana ' + K.regla('dias_referido') + ' días de Premium' : 'Comparte la app'],
      ['plan', '💎', 'Mi plan', premium() ? '⭐ Premium' : 'Free · Hazte Premium'],
      ['respaldo', '💾', 'Respaldo', 'Descarga todo en Excel'],
      ['perfil', '👤', 'Mi cuenta', 'Foto, clave, notificaciones'],
      ['soporte', '🛟', 'Soporte CodeFix', 'Escríbenos']
    ] : [
      ['tiempos', '⏱️', 'Mis tiempos', 'Cuánto dura cada corte y tu descanso'],
      ['caja', '💵', 'Mi caja', 'Tus cortes'],
      ['estadisticas', '📊', 'Mis estadísticas', 'Tus cortes y clientes'],
      ['milink', '🔳', 'Mi link y QR', 'Tus clientes te reservan directo'],
      ['volver', '👋', 'Clientes que no vuelven', 'Escríbeles en 1 toque'],
      ['perfil', '👤', 'Mi cuenta', 'Foto, clave, notificaciones'],
      ['soporte', '🛟', 'Soporte CodeFix', 'Escríbenos']
    ];
    el.innerHTML = '<div class="menu-grid">' + items.map((i) => '<button data-s="' + i[0] + '"><span>' + i[1] + '</span>' + i[2] + '<small>' + esc(i[3]) + '</small></button>').join('') + '</div>';
    el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { history.replaceState(null, '', '#' + b.dataset.s); abrirSeccion(b.dataset.s); });
  }
  // Respaldo de la barbería en Excel (núcleo: respaldo.js).
  function secRespaldo() {
    const z = seccion('💾 Respaldo');
    z.innerHTML = '<div class="card"><p>Descarga en Excel tus clientes, horas, servicios, caja, ofertas y calificaciones. Guárdalo donde quieras.</p>' +
      '<p class="muted chico">Los avisos y mensajes se borran solos a los 30 días (te avisamos antes). Tus horas, clientes y caja no.</p>' +
      '<div class="btns"><button id="bRespaldo">⬇️ Descargar respaldo (Excel)</button></div></div>';
    $('bRespaldo').onclick = () => C.accion($('bRespaldo'), async () => CFX_RESPALDO.excel('respaldo-' + bar().nombre, await K.rpc('mi_respaldo')), '💾 Respaldo descargado');
  }
  function seccion(titulo) {
    const el = $('v-mas');
    el.innerHTML = '<div class="flex" style="margin-bottom:12px"><button class="icono" id="bVolver" aria-label="Volver">←</button><h2 style="margin:0;font-size:19px">' + titulo + '</h2></div><div id="secZona"></div>';
    $('bVolver').onclick = () => { history.replaceState(null, '', '#mas'); mas(); };
    scrollTo(0, 0);
    return $('secZona');
  }
  async function abrirSeccion(s) {
    if (s === 'soporte') {
      const adminId = await K.rpc('mis_contactos').then((l) => (l.find((c) => c.rol === 'admin') || {}).id).catch(() => null);
      mostrar('chat'); if (adminId) Chat.abrir(adminId, { nombre: 'CodeFix (soporte)', rol: 'admin', avatar: '🛟' }); return;
    }
    if (s === 'clientes') { mostrar('clientes'); return; }
    const soloDueno = ['negocio', 'horario', 'servicios', 'links', 'ofertas', 'equipo', 'calificaciones', 'enlace', 'plan', 'resumen', 'invitar', 'respaldo'];
    if (!dueno() && soloDueno.includes(s)) { mas(); return; }
    if (vistaActual !== 'mas') { vistaActual = 'mas'; document.querySelectorAll('.view').forEach((x) => x.classList.toggle('on', x.id === 'v-mas')); document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === 'mas')); }
    const F = { equipo: secEquipo, servicios: secServicios, ofertas: secOfertas, estadisticas: secEstadisticas, negocio: secNegocio, horario: secHorario, links: secLinks,
      respaldo: secRespaldo, caja, tiempos: secTiempos, calificaciones: secCalificaciones, enlace: enlaceClientes, resumen: secResumen, volver: secVolver, invitar: secInvitar,
      milink: () => P.compartir({ el: seccion('🔳 Mi link y QR'), link: K.linkBarberia(bar().codigo, yo.id), archivo: 'qr-' + primerNombre(yo.nombre),
        texto: 'Con este link o QR tus clientes reservan <b>directo contigo</b> en ' + esc(bar().nombre) + ' (sin cuenta o con su cuenta).',
        mensaje: '💈 Reserva tu hora conmigo en ' + bar().nombre }), plan: () => P.plan(seccion('💎 Mi plan')),
      perfil: () => P.perfil(seccion('👤 Mi cuenta'), { tour: (f) => P.tour(pasos(), f), alGuardar: () => { yo = K.cuenta; } }) };
    if (F[s]) F[s]();
  }

  /* ---------- Clientes (pestaña): con cuenta, sin cuenta y lista negra ---------- */
  let filtroCli = 'todos';
  async function pintarClientes() {
    const z = $('v-clientes');
    z.innerHTML = '<p class="muted centro">Cargando…</p>';
    let negra = [];
    try { [, negra] = await Promise.all([cargarClientes(true), K.rpc('ver_lista_negra')]); } catch (e) { z.innerHTML = '<div class="card err">' + esc(e.message) + '</div>'; return; }
    const conCuenta = clientes.filter((c) => !c.invitado);
    const lim = K.limite('clientes', premium());
    const puedeCrear = dueno() || bar().barberos_crean_clientes !== false;
    const lista = clientes.filter((c) => filtroCli === 'todos' || (filtroCli === 'cuenta' && !c.invitado) || (filtroCli === 'invitados' && c.invitado));
    z.innerHTML = '<div class="card"><div class="flex"><div class="grow"><b>' + conCuenta.length + ' / ' + lim + ' clientes con cuenta</b>' +
      '<div class="muted chico">' + clientes.filter((c) => c.invitado).length + ' sin cuenta (reservaron con su WhatsApp)' + (premium() ? '' : ' · Premium: hasta ' + K.limite('clientes', true) + ' con cuenta') + '</div></div>' +
      (puedeCrear ? '<button id="bNuevoCli">+ Nuevo</button>' : '') + '</div></div>' +
      (negra.length ? '<div class="card negra"><h2>🚫 Lista negra (' + negra.length + ')</h2><p class="muted chico" style="margin-top:-6px">Clientes con ' + K.regla('estrellas_lista_negra') +
        ' estrella(s) o menos. Pueden reservar, pero a ti te sale la alerta para que decidas si apruebas.</p><ul class="list">' + negra.map((n) =>
        '<li><div class="grow"><b>' + esc(n.nombre || n.tel || 'Cliente') + '</b> ' + estrellas(n.nota) + '<div class="sub">' + esc(n.motivo || '') + ' · desde ' + P.fechaCorta(n.desde) + (n.por ? ' · por ' + esc(n.por) : '') + '</div></div>' +
        (n.tel ? '<a class="btn small wsp" target="_blank" rel="noopener" href="' + C.wa(n.tel, 'Hola') + '">💬</a>' : '') +
        (dueno() ? '<button class="small gris" data-quitar="' + n.id + '">Sacar</button>' : '') + '</li>').join('') + '</ul></div>' : '') +
      '<div class="seg" style="margin-bottom:10px"><button data-f="todos">Todos</button><button data-f="cuenta">Con cuenta</button><button data-f="invitados">Sin cuenta</button></div>' +
      '<input id="fCli" placeholder="🔎 Buscar cliente…" style="margin-bottom:10px"><div class="card"><ul class="list" id="lCli">' + lista.map((c, i) =>
        '<li class="tap' + (c.lista_negra ? ' negra' : '') + '" data-i="' + clientes.indexOf(c) + '" data-n="' + esc((c.nombre + ' ' + (c.telefono || '') + ' ' + (c.email || '')).toLowerCase()) + '">' + C.avatar(c, c.premium ? 'premium' : '') +
        '<div class="grow"><b>' + esc(c.nombre || 'Sin nombre') + '</b>' + (c.premium ? ' <span class="pill oro">⭐</span>' : '') + (c.invitado ? ' <span class="pill">sin cuenta</span>' : '') +
        (c.lista_negra ? ' <span class="pill bad">lista negra</span>' : '') + (c.bloqueado ? ' <span class="pill bad">bloqueado</span>' : '') + ' ' + estrellas(c.nota) +
        '<div class="sub">' + c.visitas + ' visita' + (c.visitas === 1 ? '' : 's') + (c.no_vino ? ' · ' + c.no_vino + ' no vino' : '') + (c.saldo ? ' · saldo ' + C.plata(c.saldo) : '') +
        (c.ultimo_barbero ? ' · último con ' + esc(c.ultimo_barbero.split(' ')[0]) : '') + (c.invitado ? (c.telefono ? ' · ' + esc(c.telefono) : '') : ' · ' + C.conexion(c.last_seen).txt) +
        (c.proxima ? ' · próxima ' + C.cuando(c.proxima) : '') + '</div></div></li>').join('') + '</ul>' + (lista.length ? '' : '<div class="empty"><span class="ico">👥</span>Aún no hay clientes aquí.</div>') + '</div>';
    z.querySelectorAll('[data-f]').forEach((b) => { b.classList.toggle('on', b.dataset.f === filtroCli); b.onclick = () => { filtroCli = b.dataset.f; pintarClientes(); }; });
    $('fCli').oninput = () => z.querySelectorAll('#lCli li').forEach((li) => li.classList.toggle('hidden', !li.dataset.n.includes($('fCli').value.toLowerCase())));
    z.querySelectorAll('[data-i]').forEach((li) => li.onclick = () => fichaCliente(clientes[+li.dataset.i]));
    z.querySelectorAll('[data-quitar]').forEach((b) => b.onclick = async () => {
      if (!await C.confirmar('Sacar a este cliente de la lista negra. Si lo vuelves a calificar mal, vuelve a entrar.', { si: 'Sacar' })) return;
      try { await K.rpc('quitar_lista_negra', { p_id: b.dataset.quitar }); C.toast('Sacado de la lista negra'); pintarClientes(); } catch (e) { C.toast('⚠️ ' + e.message); }
    });
    if ($('bNuevoCli')) $('bNuevoCli').onclick = () => {
      if (conCuenta.length >= lim) return premium() ? C.toast('Llegaste al máximo de clientes con cuenta') : P.upsell('Hasta ' + K.limite('clientes', true) + ' clientes');
      nuevaCuenta('client', pintarClientes);
    };
  }

  function nuevaCuenta(tipo, despues) {
    const esBarbero = tipo === 'barber';
    const h = C.hoja('<h2>' + (esBarbero ? '💈 Nuevo barbero' : '👤 Nuevo cliente') + '</h2>' +
      '<label>Nombre</label><input data-n maxlength="80" placeholder="Ej: Juan Pérez">' +
      '<label>WhatsApp</label><input data-t inputmode="tel" placeholder="+56 9 1234 5678">' +
      '<label>Correo <span class="opc">(con este entra a la app)</span></label><input data-e type="email" inputmode="email" placeholder="correo@ejemplo.cl">' +
      '<p class="muted chico">Le crearemos una clave y te dejaremos el mensaje listo para enviárselo por WhatsApp.</p><p class="err" data-err></p>' +
      '<div class="btns"><button class="full" data-ok>Crear cuenta</button></div>');
    h.q('[data-ok]').onclick = (ev) => C.accion(ev.target, async () => {
      const d = { nombre: h.q('[data-n]').value.trim(), telefono: h.q('[data-t]').value.trim(), email: h.q('[data-e]').value.trim().toLowerCase(), clave: K.claveNueva(), tipo };
      if (!d.nombre || !d.email) throw new Error('Falta el nombre o el correo');
      const r = await K.crearUsuario(d);
      h.cerrar();
      enviarAcceso(Object.assign(d, { codigo: r.codigo || bar().codigo, barberia: bar().nombre }));
      clientes = null;
      await cargarBarberia();
      despues && despues();
    }).catch((e) => { h.q('[data-err]').textContent = e.message; });
  }

  function enviarAcceso(d) {
    const msg = K.mensajeAcceso(d);
    const h = C.hoja('<h2>✅ ' + (d.nuevo === false ? 'Clave restablecida' : 'Cuenta creada') + '</h2><p>Envíale sus datos a <b>' + esc(d.nombre) + '</b>:</p>' +
      '<textarea readonly style="min-height:170px">' + esc(msg) + '</textarea><div class="btns" style="flex-direction:column">' +
      '<a class="btn wsp full" target="_blank" rel="noopener" href="' + (d.telefono ? C.wa(d.telefono, msg) : 'https://wa.me/?text=' + encodeURIComponent(msg)) + '">💬 Enviar por WhatsApp</a>' +
      '<button class="gris full" data-c>📋 Copiar mensaje</button></div>');
    h.q('[data-c]').onclick = () => C.copiar(msg);
  }

  function fichaCliente(c) {
    const inv = c.invitado;
    const h = C.hoja('<h2>' + C.avatar(c, 'sm' + (c.premium ? ' premium' : '')) + ' ' + esc(c.nombre || 'Cliente') + (c.premium ? ' <span class="pill oro">⭐ Premium</span>' : '') +
      (inv ? ' <span class="pill">sin cuenta</span>' : '') + '</h2>' +
      (c.nota ? '<div style="margin-bottom:8px">' + estrellas(c.nota) + ' <span class="muted chico">promedio de ' + c.nota.total + ' calificación(es) de tu barbería</span></div>' : '') +
      alertaNegra(c.lista_negra) +
      (inv ? '<p class="muted chico" style="margin-top:0">Reservó sin cuenta desde tu link o QR. Si se crea la cuenta con este WhatsApp, su historial pasa a su cuenta.</p>' :
        '<div class="det-fila"><span>📶 Conexión</span><b>' + C.conexion(c.last_seen).txt + '</b></div>' +
        (!c.last_seen ? '<p class="muted chico" style="margin:4px 0">Aún no entra a la app: reenvíale su acceso con "Restablecer clave".</p>' : '')) +
      (c.telefono ? '<div class="det-fila"><span>📱 WhatsApp</span><b>' + esc(c.telefono) + '</b></div>' : '') +
      '<div class="det-fila"><span>Visitas</span><b>' + c.visitas + '</b></div><div class="det-fila"><span>No vino</span><b>' + c.no_vino + '</b></div>' +
      (c.ultimo_barbero ? '<div class="det-fila"><span>✂️ Último corte</span><b>con ' + esc(c.ultimo_barbero) + ' · ' + C.cuando(c.ultimo_corte) + '</b></div>' : '') +
      (c.habitual ? '<div class="det-fila"><span>💈 Barbero habitual</span><b>' + esc(c.habitual) + ' (' + c.habitual_veces + ' corte' + (c.habitual_veces === 1 ? '' : 's') + ')</b></div>' : '') +
      (c.creado_por ? '<div class="det-fila"><span>👤 Creado por</span><b>' + esc(c.creado_por) + ' · ' + P.fechaCorta(c.created_at) + '</b></div>' : '') +
      (c.proxima ? '<div class="det-fila"><span>Próxima hora</span><b>' + C.cuando(c.proxima) + '</b></div>' : '') +
      (c.email ? '<div class="det-fila"><span>Correo</span><b>' + esc(c.email) + '</b></div>' : '') +
      (c.cumple ? '<div class="det-fila"><span>🎂 Cumpleaños</span><b>' + esc(c.cumple.slice(8) + '/' + c.cumple.slice(5, 7)) + '</b></div>' : '') +
      (dueno() && !inv ? '<label>WhatsApp</label><input data-t inputmode="tel" value="' + esc(c.telefono || '') + '">' +
        '<label>Notas <span class="opc">(solo las ve el equipo)</span></label><textarea data-notas maxlength="400" placeholder="Ej: Corte 2 al costado, le gusta la barba corta">' + esc(c.notas || '') + '</textarea>' +
        '<label>Saldo a favor</label><input data-saldo type="number" min="0" value="' + (c.saldo || 0) + '">' +
        '<label class="check"><input type="checkbox" data-bloq' + (c.bloqueado ? ' checked' : '') + '> Bloquear para reservar desde su cuenta</label>' +
        '<div class="btns"><button data-g>Guardar</button></div>' : (c.notas ? '<p class="muted">📝 ' + esc(c.notas) + '</p>' : '')) +
      '<div class="btns">' + (!inv ? '<button class="gris" data-chat>💬 Escribir</button>' : '') + '<button class="gris" data-hora>📅 Agendar hora</button>' +
      (c.telefono ? '<a class="btn wsp" target="_blank" rel="noopener" href="' + C.wa(c.telefono, 'Hola ' + (c.nombre || '').split(' ')[0] + ' 👋') + '">WhatsApp</a>' : '') +
      (dueno() && !inv ? '<button class="gris" data-clave>🔑 Restablecer clave</button><button class="danger" data-eliminar>🗑️ Eliminar</button>' : '') + '</div>');
    if (h.q('[data-g]')) h.q('[data-g]').onclick = (ev) => C.accion(ev.target, async () => {
      await K.rpc('guardar_cliente', { p_id: c.id, p: { telefono: h.q('[data-t]').value, notas: h.q('[data-notas]').value, saldo: +h.q('[data-saldo]').value || 0, bloqueado: h.q('[data-bloq]').checked } });
      h.cerrar(); clientes = null; pintarClientes();
    }, '✅ Guardado');
    if (h.q('[data-chat]')) h.q('[data-chat]').onclick = () => { h.cerrar(); mostrar('chat'); Chat.abrir(c.id, { nombre: c.nombre, avatar: c.avatar, foto: c.foto, rol: 'client' }); };
    h.q('[data-hora]').onclick = () => { h.cerrar(); nuevaHora(yo.id, C.hoy(), null, c); };
    if (h.q('[data-clave]')) h.q('[data-clave]').onclick = () => restablecer(c, h);
    if (h.q('[data-eliminar]')) h.q('[data-eliminar]').onclick = () => eliminar(c, 'client', () => { h.cerrar(); pintarClientes(); });
  }

  async function restablecer(p, hoja) {
    if (!await C.confirmar('Se le pondrá una clave genérica nueva a ' + p.nombre + ' y te dejaremos el mensaje listo para enviársela. Al entrar, la podrá cambiar en su perfil.', { titulo: '🔑 Restablecer clave', si: 'Restablecer' })) return;
    try {
      const clave = K.claveNueva();
      await K.restablecerClave(p.id, clave);
      hoja && hoja.cerrar();
      enviarAcceso({ nombre: p.nombre, email: p.email, telefono: p.telefono, clave, codigo: bar().codigo, barberia: bar().nombre, nuevo: false });
    } catch (e) { C.toast('⚠️ ' + e.message, 4500); }
  }

  /* ----- Equipo ----- */
  async function secEquipo() {
    const z = seccion('💈 Mi equipo');
    await cargarBarberia();
    const lim = K.limite('barberos', premium());
    z.innerHTML = '<div class="card"><div class="flex"><div class="grow"><b>' + B.barberos.length + ' / ' + lim + ' barberos</b><div class="muted chico">Contándote a ti' + (premium() ? '' : ' · Premium: hasta ' + K.limite('barberos', true)) + '</div></div>' +
      '<button id="bNuevoBar">+ Nuevo barbero</button></div></div><div class="card"><ul class="list">' + B.barberos.map((b) =>
        '<li class="tap" data-b="' + b.id + '">' + C.avatar(b) + '<div class="grow"><b>' + esc(b.nombre) + (b.es_dueno ? ' <span class="pill">Dueño</span>' : '') + (b.activo ? '' : ' <span class="pill bad">inactivo</span>') + '</b>' +
        '<div class="sub">' + (!b.activo ? '⚪ Inactivo' : b.agenda_abierta ? '🟢 Agenda abierta' : '🔴 Agenda llena') + (b.id === yo.id ? '' : ' · ' + C.conexion(b.last_seen).txt) +
        (b.descripcion ? ' · ' + esc(b.descripcion) : '') + '</div></div><span>›</span></li>').join('') + '</ul></div>' +
      '<div class="card"><h2>🔐 Permisos del equipo</h2><p class="muted chico" style="margin-top:-6px">Tus barberos ven su agenda, aprueban los abonos de sus clientes y ven la cantidad de cortes. ' +
      'No ven precios ni montos, ni pueden cambiar links de pago, perfil o plan.</p>' +
      '<label class="check" style="margin-top:0"><input type="checkbox" id="chkCrean"' + (bar().barberos_crean_clientes !== false ? ' checked' : '') + '> ' +
      '<span><b>Mis barberos pueden crear clientes</b><br><span class="muted chico">Los clientes son de toda la barbería y en su ficha queda quién lo creó.</span></span></label></div>' +
      '<p class="muted chico">Cada barbero entra con su cuenta y ve solo el detalle de sus horas; las de los demás le aparecen como "Ocupado". Tú ves todo.</p>';
    $('chkCrean').onchange = async (e) => {
      try { yo = await K.rpc('guardar_barberia', { p: { barberos_crean_clientes: e.target.checked } }); C.toast('✅ Guardado'); }
      catch (err) { C.toast('⚠️ ' + err.message); e.target.checked = !e.target.checked; }
    };
    $('bNuevoBar').onclick = () => {
      if (B.barberos.length >= lim) return premium() ? C.toast('Llegaste al máximo de barberos') : P.upsell('Hasta ' + K.limite('barberos', true) + ' barberos');
      nuevaCuenta('barber', secEquipo);
    };
    z.querySelectorAll('[data-b]').forEach((li) => li.onclick = () => fichaBarbero(barbero(li.dataset.b)));
  }

  function fichaBarbero(b) {
    const esYo = b.id === yo.id;
    const propio = !!(b.horario && JSON.stringify(b.horario) !== JSON.stringify(bar().horario));
    const h = C.hoja('<h2>' + C.avatar(b, 'sm') + ' ' + esc(b.nombre) + '</h2>' +
      (esYo ? '' : '<div class="det-fila"><span>📶 Conexión</span><b>' + C.conexion(b.last_seen).txt + '</b></div>') +
      '<div id="ePerfil"><label>Nombre</label><input data-n maxlength="80" value="' + esc(b.nombre) + '">' +
      '<label>Descripción <span class="opc">(la ven los clientes)</span></label><input data-d maxlength="200" value="' + esc(b.descripcion || '') + '">' +
      '<div class="btns"><button class="gris small" data-foto>📷 Foto</button></div></div>' +
      '<label class="check"><input type="checkbox" data-agenda' + (b.agenda_abierta ? ' checked' : '') + '> Agenda abierta a clientes <span class="muted chico">(desmarca = agenda llena)</span></label>' +
      (!esYo ? '<label class="check"><input type="checkbox" data-act' + (b.activo ? ' checked' : '') + '> Activo (si lo desactivas, no aparece para reservar)</label>' : '') +
      '<div id="eHorario"><label class="check"><input type="checkbox" data-hp' + (propio ? ' checked' : '') + '> Horario propio (si no, usa el de la barbería)</label><div data-hz class="' + (propio ? '' : 'hidden') + '"></div></div>' +
      '<div class="btns"><button data-g>Guardar</button>' + (!esYo ? '<button class="gris" data-chat>💬 Escribir</button><button class="gris" data-clave>🔑 Restablecer clave</button>' +
        '<button class="danger" data-eliminar>🗑️ Eliminar</button>' : '') + '</div>');
    let foto;
    const hz = h.q('[data-hz]');
    const leerH = editorHorario(hz, b.horario || bar().horario);
    h.q('[data-hp]').onchange = (e) => hz.classList.toggle('hidden', !e.target.checked);
    h.q('[data-foto]').onclick = async () => { foto = await C.elegirImagen(220, 0.75); if (foto) C.toast('📷 Foto lista, toca Guardar'); };
    if (!tiene('editar_barberos') && !esYo) { P.bloquear(h.q('#ePerfil'), 'Editar el perfil de tus barberos'); }
    if (!tiene('horario_barbero')) P.bloquear(h.q('#eHorario'), 'Horario propio por barbero');
    h.q('[data-g]').onclick = (ev) => C.accion(ev.target, async () => {
      const p = {};
      if (h.q('[data-act]')) p.activo = h.q('[data-act]').checked;
      if (tiene('editar_barberos') || esYo) { p.nombre = h.q('[data-n]').value; p.descripcion = h.q('[data-d]').value; if (foto) p.foto = foto; }
      if (tiene('horario_barbero')) p.horario = h.q('[data-hp]').checked ? leerH() : null;
      await K.rpc('guardar_barbero', { p_id: b.id, p });
      if (h.q('[data-agenda]').checked !== !!b.agenda_abierta) {
        await K.rpc('set_agenda_abierta', { p_abierta: h.q('[data-agenda]').checked, p_barbero: b.id });
        if (esYo) yo.agenda_abierta = h.q('[data-agenda]').checked;
      }
      h.cerrar(); await cargarBarberia(); secEquipo();
    }, '✅ Guardado');
    if (h.q('[data-chat]')) h.q('[data-chat]').onclick = () => { h.cerrar(); mostrar('chat'); Chat.abrir(b.id, { nombre: b.nombre, avatar: b.avatar, foto: b.foto, rol: 'barber' }); };
    if (h.q('[data-clave]')) h.q('[data-clave]').onclick = () => restablecer({ id: b.id, nombre: b.nombre, telefono: b.telefono }, h);
    if (h.q('[data-eliminar]')) h.q('[data-eliminar]').onclick = () => eliminar(b, 'barber', async () => { h.cerrar(); await cargarBarberia(); secEquipo(); });
  }

  // v2.2: eliminar un barbero o un cliente con cuenta (queda en el registro de cambios de CodeFix).
  async function eliminar(p, rol, despues) {
    const txt = rol === 'barber' ? 'Se borra la cuenta de ' + p.nombre + '. Sus horas pasadas y su caja quedan a tu nombre. Si tiene horas por venir, muévelas o anúlalas primero. ' +
      'Si solo quieres que no aparezca para reservar, desmarca "Activo".' : 'Se borra la cuenta de ' + p.nombre + '. Sus horas por venir se anulan y su historial queda con su nombre, sin cuenta.';
    if (!await C.confirmar(txt + '\nNo se puede deshacer.', { titulo: '🗑️ Eliminar ' + (rol === 'barber' ? 'barbero' : 'cliente'), si: 'Eliminar', peligro: true })) return;
    try { await K.rpc('eliminar_cuenta', { p_user: p.id, p_confirmar: null }); C.toast('🗑️ ' + p.nombre + ' eliminado'); clientes = null; despues && despues(); }
    catch (e) { C.toast('⚠️ ' + e.message, 5000); }
  }

  // Editor de horario semanal (lunes a domingo): Abierto / Cerrado, horas y colación.
  function editorHorario(el, h) {
    h = JSON.parse(JSON.stringify(h || []));
    el.innerHTML = C.DIAS_LARGO.map((n, i) => {
      const d = h[i] || { e: 'x', i: '10:00', f: '20:00' };
      return '<div class="horario-dia" data-d="' + i + '"><div><b>' + n.slice(0, 3) + '</b><select data-e style="margin-top:4px">' +
        '<option value="a"' + (d.e !== 'x' ? ' selected' : '') + '>Abierto</option><option value="x"' + (d.e === 'x' ? ' selected' : '') + '>Cerrado</option></select></div>' +
        '<div class="hs' + (d.e === 'x' ? ' cerrado' : '') + '"><input type="time" step="900" data-i value="' + (d.i || '10:00') + '" aria-label="Abre"><input type="time" step="900" data-f value="' + (d.f || '20:00') + '" aria-label="Cierra">' +
        '<input type="time" step="900" data-ci value="' + (d.ci || '') + '" aria-label="Colación desde" placeholder="colación"><input type="time" step="900" data-cf value="' + (d.cf || '') + '" aria-label="Colación hasta"></div></div>';
    }).join('') + '<p class="muted chico">Por día: abre · cierra · colación desde · hasta (deja la colación vacía si no hay).</p>' +
      '<div class="btns"><button type="button" class="small gris" data-copiar>Copiar el lunes a lun–vie</button><button type="button" class="small gris" data-todos>Copiar el lunes a todos</button></div>';
    el.querySelectorAll('[data-e]').forEach((s) => s.onchange = () => s.closest('.horario-dia').querySelector('.hs').classList.toggle('cerrado', s.value === 'x'));
    const copiar = (hasta) => {
      const l = el.querySelector('[data-d="0"]');
      for (let i = 1; i < hasta; i++) {
        const d = el.querySelector('[data-d="' + i + '"]');
        ['[data-e]', '[data-i]', '[data-f]', '[data-ci]', '[data-cf]'].forEach((s) => { d.querySelector(s).value = l.querySelector(s).value; });
        d.querySelector('.hs').classList.toggle('cerrado', d.querySelector('[data-e]').value === 'x');
      }
    };
    el.querySelector('[data-copiar]').onclick = () => copiar(5);
    el.querySelector('[data-todos]').onclick = () => copiar(7);
    return () => [...el.querySelectorAll('.horario-dia')].map((d) => {
      const o = { e: d.querySelector('[data-e]').value, i: d.querySelector('[data-i]').value || '10:00', f: d.querySelector('[data-f]').value || '20:00' };
      const ci = d.querySelector('[data-ci]').value, cf = d.querySelector('[data-cf]').value;
      if (ci && cf) { o.ci = ci; o.cf = cf; }
      return o;
    });
  }

  /* ----- Servicios ----- */
  async function secServicios() {
    const z = seccion('✂️ Servicios y precios');
    await cargarBarberia();
    const lim = K.limite('servicios', premium());
    z.innerHTML = '<div class="card"><div class="flex"><div class="grow"><b>' + B.servicios.length + ' / ' + (lim >= 100 ? '∞' : lim) + ' servicios</b><div class="muted chico">Los clientes los ven con precio y duración</div></div>' +
      '<button id="bNuevoSer">+ Nuevo</button></div></div>' + (B.servicios.length ? B.servicios.map((s, i) =>
        '<div class="serv" style="' + (s.visible ? '' : 'opacity:.55') + '"><span class="foto" style="' + C.fondo(s.foto) + '">' + (s.foto ? '' : '✂️') + '</span>' +
        '<div class="grow"><b>' + esc(s.nombre) + (s.visible ? '' : ' <span class="pill">oculto</span>') + '</b><span class="sub muted">' + s.duracion + ' min' + (s.categoria ? ' · ' + esc(s.categoria) : '') +
        (s.barberos && s.barberos.length ? ' · solo ' + s.barberos.map((id) => (barbero(id) || {}).nombre || '').join(', ') : '') + '</span></div>' +
        '<div style="text-align:right"><div class="precio-s">' + C.plata(s.precio) + '</div><div class="orden"><button class="gris" data-up="' + i + '"' + (i ? '' : ' disabled') + '>↑</button> <button class="gris" data-ed="' + s.id + '">✏️</button></div></div></div>').join('')
      : '<div class="card empty"><span class="ico">✂️</span>Agrega tu primer servicio: corte, barba, cejas…</div>');
    $('bNuevoSer').onclick = () => {
      if (B.servicios.length >= lim) return premium() ? C.toast('Máximo alcanzado') : P.upsell('Servicios ilimitados');
      editarServicio(null);
    };
    z.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => editarServicio(servicio(b.dataset.ed)));
    z.querySelectorAll('[data-up]').forEach((b) => b.onclick = async () => {
      const i = +b.dataset.up, a = B.servicios[i - 1], c = B.servicios[i];
      try {
        await K.rpc('guardar_servicio', { p: Object.assign({}, c, { orden: i - 1, foto: undefined, barberos: c.barberos || [] }) });
        await K.rpc('guardar_servicio', { p: Object.assign({}, a, { orden: i, foto: undefined, barberos: a.barberos || [] }) });
      } catch (e) { C.toast('⚠️ ' + e.message); }
      B.servicios.forEach((s, j) => { if (j !== i && j !== i - 1) K.rpc('guardar_servicio', { p: Object.assign({}, s, { orden: j, foto: undefined, barberos: s.barberos || [] }) }).catch(() => {}); });
      secServicios();
    });
  }

  function editarServicio(s) {
    const durs = [15, 30, 45, 60, 90, 120];
    const h = C.hoja('<h2>' + (s ? '✏️ Editar servicio' : '✂️ Nuevo servicio') + '</h2>' +
      '<label>Nombre</label><input data-n maxlength="60" placeholder="Ej: Corte + barba" value="' + esc(s ? s.nombre : '') + '">' +
      '<label>Precio</label><input data-p type="number" inputmode="numeric" min="0" placeholder="$" value="' + (s ? s.precio : '') + '">' +
      '<label>Duración</label><div class="durs">' + durs.map((d) => '<button type="button" class="chip" data-dur="' + d + '">' + d + ' min</button>').join('') + '</div>' +
      '<input data-d type="number" min="5" max="480" step="5" value="' + (s ? s.duracion : 30) + '" style="margin-top:8px">' +
      '<details style="margin-top:12px"' + (s && (s.categoria || s.descripcion) ? ' open' : '') + '><summary class="muted">Opcional: categoría y descripción</summary>' +
      '<label>Categoría</label><input data-c maxlength="30" placeholder="Ej: Cortes, Barba, Color" value="' + esc(s ? s.categoria || '' : '') + '">' +
      '<label>Descripción</label><input data-desc maxlength="200" value="' + esc(s ? s.descripcion || '' : '') + '"></details>' +
      '<label class="check"><input type="checkbox" data-v' + (!s || s.visible ? ' checked' : '') + '> Visible para los clientes</label>' +
      '<div id="sPrem"><label>Foto ⭐</label><div class="btns" style="margin-top:0"><button type="button" class="gris small" data-foto>📷 ' + (s && s.foto ? 'Cambiar foto' : 'Poner foto') + '</button></div>' +
      (B.barberos.length > 1 ? '<div id="sBarb"><label>¿Quién lo hace? ⭐ <span class="opc">(nada marcado = todos)</span></label>' + B.barberos.map((b) => '<label class="check"><input type="checkbox" data-bb="' + b.id + '"' + (s && s.barberos && s.barberos.includes(b.id) ? ' checked' : '') + '> ' + esc(b.nombre) + '</label>').join('') + '</div>' : '') + '</div>' +
      '<div class="btns"><button class="full" data-g>Guardar</button>' + (s ? '<button class="danger" data-del>Borrar</button>' : '') + '</div>');
    let foto;
    h.qa('[data-dur]').forEach((b) => b.onclick = () => { h.q('[data-d]').value = b.dataset.dur; });
    if (!tiene('fotos_servicios')) P.bloquear(h.q('[data-foto]'), 'Fotos de servicios');
    if (!tiene('servicios_barbero') && h.q('#sBarb')) P.bloquear(h.q('#sBarb'), 'Qué barbero hace cada servicio');
    h.q('[data-foto]').onclick = async () => { foto = await C.elegirImagen('vitrina'); if (foto) C.toast('📷 Foto lista'); };
    h.q('[data-g]').onclick = (ev) => C.accion(ev.target, async () => {
      const p = { id: s ? s.id : '', nombre: h.q('[data-n]').value, precio: +h.q('[data-p]').value || 0, duracion: +h.q('[data-d]').value,
        categoria: h.q('[data-c]').value, descripcion: h.q('[data-desc]').value, visible: h.q('[data-v]').checked, orden: s ? s.orden : null,
        barberos: tiene('servicios_barbero') ? [...h.qa('[data-bb]:checked')].map((x) => x.dataset.bb) : [] };
      if (foto) p.foto = foto;
      await K.rpc('guardar_servicio', { p });
      h.cerrar(); secServicios();
    }, '✅ Servicio guardado');
    if (h.q('[data-del]')) h.q('[data-del]').onclick = async () => {
      if (!await C.confirmar('¿Borrar "' + s.nombre + '"? Las horas ya agendadas no cambian.', { si: 'Borrar', peligro: true })) return;
      await K.rpc('borrar_servicio', { p_id: s.id }); h.cerrar(); secServicios();
    };
  }

  /* ----- Ofertas ----- */
  async function secOfertas() {
    const z = seccion('🏷️ Ofertas');
    await cargarBarberia();
    const activas = B.ofertas.filter((o) => o.activa && (!o.hasta || o.hasta >= C.hoy())).length;
    z.innerHTML = '<div class="card"><div class="flex"><div class="grow"><b>' + activas + ' / ' + (K.limite('ofertas', premium()) >= 50 ? '∞' : K.limite('ofertas', premium())) + ' activas</b><div class="muted chico">Al publicar, les llega un aviso a tus clientes 🔔</div></div>' +
      '<button id="bNuevaOf">+ Nueva</button></div></div>' + (B.ofertas.length ? B.ofertas.map((o) =>
        '<div class="card ' + (o.vip ? 'oro-marco' : '') + '"><h2><span class="grow">' + (o.vip ? '⭐ ' : '') + esc(o.titulo) + '</span>' + (o.activa ? '<span class="pill ok">activa</span>' : '<span class="pill">pausada</span>') + '</h2>' +
        (o.detalle ? '<p style="margin:0;white-space:pre-line">' + esc(o.detalle) + '</p>' : '') + (o.precio ? '<p><b>' + esc(o.precio) + '</b></p>' : '') +
        (o.hasta ? '<p class="muted chico">Hasta el ' + esc(o.hasta) + '</p>' : '') + '<div class="btns"><button class="small gris" data-ed="' + o.id + '">✏️ Editar</button></div></div>').join('')
      : '<div class="card empty"><span class="ico">🏷️</span>Crea una oferta: "Corte + barba a $12.000 los martes".</div>');
    $('bNuevaOf').onclick = () => { if (activas >= K.limite('ofertas', premium())) return premium() ? C.toast('Llegaste al máximo de ofertas activas') : P.upsell('Más ofertas activas'); editarOferta(null); };
    z.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => editarOferta(B.ofertas.find((o) => o.id === b.dataset.ed)));
  }
  function editarOferta(o) {
    const h = C.hoja('<h2>' + (o ? '✏️ Editar oferta' : '🏷️ Nueva oferta') + '</h2>' +
      '<label>Título</label><input data-t maxlength="80" placeholder="Ej: Martes de barba" value="' + esc(o ? o.titulo : '') + '">' +
      '<label>Detalle <span class="opc">(opcional)</span></label><textarea data-d maxlength="400">' + esc(o ? o.detalle || '' : '') + '</textarea>' +
      '<div class="row"><div><label>Precio <span class="opc">(texto)</span></label><input data-p maxlength="30" placeholder="$12.000" value="' + esc(o ? o.precio || '' : '') + '"></div>' +
      '<div><label>Válida hasta</label><input type="date" data-h value="' + esc(o ? o.hasta || '' : '') + '"></div></div>' +
      '<div class="btns"><button type="button" class="gris small" data-img>🖼️ Imagen</button></div>' +
      '<label class="check" id="oVip"><input type="checkbox" data-vip' + (o && o.vip ? ' checked' : '') + '> ⭐ VIP: solo para clientes Premium</label>' +
      (o ? '<label class="check"><input type="checkbox" data-act' + (o.activa ? ' checked' : '') + '> Activa</label>' : '<label class="check"><input type="checkbox" data-av checked> Avisar a mis clientes ahora 🔔</label>') +
      '<div class="btns"><button class="full" data-g>' + (o ? 'Guardar' : 'Publicar') + '</button>' + (o ? '<button class="danger" data-del>Borrar</button>' : '') + '</div>');
    let img;
    if (!tiene('ofertas_vip')) P.bloquear(h.q('#oVip'), 'Ofertas VIP');
    h.q('[data-img]').onclick = async () => { img = await C.elegirImagen('vitrina'); if (img) C.toast('🖼️ Imagen lista'); };
    h.q('[data-g]').onclick = (ev) => C.accion(ev.target, async () => {
      const p = { id: o ? o.id : '', titulo: h.q('[data-t]').value, detalle: h.q('[data-d]').value, precio: h.q('[data-p]').value, hasta: h.q('[data-h]').value,
        vip: tiene('ofertas_vip') && h.q('[data-vip]').checked };
      if (img) p.imagen = img;
      if (h.q('[data-act]')) p.activa = h.q('[data-act]').checked;
      await K.rpc('guardar_oferta', { p, p_avisar: !!(h.q('[data-av]') && h.q('[data-av]').checked) });
      K.despertarEnvios();
      h.cerrar(); secOfertas();
    }, o ? '✅ Guardada' : '📣 Oferta publicada');
    if (h.q('[data-del]')) h.q('[data-del]').onclick = async () => { if (await C.confirmar('¿Borrar la oferta?', { si: 'Borrar', peligro: true })) { await K.rpc('borrar_oferta', { p_id: o.id }); h.cerrar(); secOfertas(); } };
  }

  /* ----- Estadísticas ----- */
  let estRango = 'mes';
  async function secEstadisticas() {
    const z = seccion(dueno() ? '📊 Estadísticas' : '📊 Mis estadísticas');
    if (!tiene('estadisticas')) {
      z.innerHTML = '<div class="card plata" id="upEst"><h2>📊 Estadísticas</h2><p class="muted">Ventas y cortes por barbero, servicios más pedidos, mejores clientes, horas y días con más movimiento.</p>' +
        '<div class="barras">' + ['10:00', '12:00', '18:00', '19:00'].map((h, i) => '<div class="b"><span>' + h + '</span><span class="t"><i style="width:' + [40, 65, 90, 75][i] + '%"></i></span><span>—</span></div>').join('') + '</div></div>';
      $('upEst').onclick = () => P.upsell('Estadísticas');
      return;
    }
    const f = C.hoy();
    const [y, m] = f.split('-').map(Number);
    const ant = new Date(Date.UTC(y, m - 2, 1));
    const R = { mes: [f.slice(0, 8) + '01', f], mesant: [ant.getUTCFullYear() + '-' + C.pad(ant.getUTCMonth() + 1) + '-01', C.sumarDias(f.slice(0, 8) + '01', -1)],
      d30: [C.sumarDias(f, -29), f], anio: [f.slice(0, 4) + '-01-01', f] };
    z.innerHTML = '<div class="seg" style="margin-bottom:12px"><button data-r="mes">Este mes</button><button data-r="mesant">Mes pasado</button><button data-r="d30">30 días</button><button data-r="anio">Año</button></div><div id="estZona"><p class="muted">Cargando…</p></div>';
    z.querySelectorAll('[data-r]').forEach((b) => { b.classList.toggle('on', b.dataset.r === estRango); b.onclick = () => { estRango = b.dataset.r; secEstadisticas(); }; });
    let e;
    try { e = await K.rpc('estadisticas', { p_desde: R[estRango][0], p_hasta: R[estRango][1] }); } catch (err) { if ($('estZona')) $('estZona').innerHTML = '<p class="err">' + esc(err.message) + '</p>'; return; }
    if (!$('estZona')) return;
    const tot = (k) => e.por_barbero.reduce((t, b) => t + (+b[k] || 0), 0);
    const barras = (obj, etq) => {
      const ent = Object.entries(obj || {}).sort((a, b) => +a[0] - +b[0]);
      const max = Math.max(1, ...ent.map((x) => x[1]));
      return ent.length ? '<div class="barras">' + ent.map(([k, v]) => '<div class="b"><span>' + etq(k) + '</span><span class="t"><i style="width:' + Math.round(v / max * 100) + '%"></i></span><span>' + v + '</span></div>').join('') + '</div>' : '<p class="muted">Sin datos aún.</p>';
    };
    const com = bar().comision;
    const pl = dueno();
    $('estZona').innerHTML = '<div class="stats">' + (pl ? '<div class="card"><small>Ventas</small><b>' + C.plata(tot('ventas')) + '</b></div>' : '') + '<div class="card"><small>Atendidas</small><b>' + tot('atendidas') + '</b></div>' +
      '<div class="card"><small>No vino</small><b style="color:var(--bad)">' + tot('no_vino') + '</b></div>' + (pl ? '<div class="card"><small>Abonos</small><b>' + C.plata(tot('abonos')) + '</b></div>' : '') + '</div>' +
      '<div class="card"><h2>💈 Por barbero</h2><div class="scroll-x"><table class="tabla"><tr><th>Barbero</th><th class="n">Cortes</th><th class="n">No vino</th>' + (pl ? '<th class="n">Ventas</th><th class="n">Su parte</th>' : '') + '</tr>' +
      e.por_barbero.map((b) => '<tr><td>' + esc(b.nombre) + '</td><td class="n">' + b.atendidas + '</td><td class="n">' + b.no_vino + '</td>' +
        (pl ? '<td class="n">' + C.plata(b.ventas) + '</td><td class="n">' + C.plata(b.id === bar().owner_id ? b.ventas : Math.round((b.ventas - b.propinas) * com / 100) + +b.propinas) + '</td>' : '') + '</tr>').join('') + '</table></div></div>' +
      '<div class="card"><h2>✂️ Servicios más pedidos</h2>' + (e.servicios.length ? '<div class="barras">' + e.servicios.map((s) => '<div class="b"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s.nombre) + '</span><span class="t"><i style="width:' + Math.round(s.veces / e.servicios[0].veces * 100) + '%"></i></span><span>' + s.veces + '</span></div>').join('') + '</div>' : '<p class="muted">Sin datos aún.</p>') + '</div>' +
      '<div class="card"><h2>🏆 Mejores clientes</h2>' + (e.clientes.length ? '<ul class="list">' + e.clientes.map((c, i) => '<li><b style="width:22px">' + (i + 1) + '</b><span class="grow">' + esc(c.nombre || 'Cliente') + '</span><span class="muted">' + c.visitas + ' visitas' + (pl ? ' · ' + C.plata(c.total) : '') + '</span></li>').join('') + '</ul>' : '<p class="muted">Sin datos aún.</p>') + '</div>' +
      '<div class="card"><h2>🕐 Horas más pedidas</h2>' + barras(e.horas, (k) => C.pad(k) + ':00') + '</div>' +
      '<div class="card"><h2>📆 Días más pedidos</h2>' + barras(e.dias, (k) => C.DIAS[k - 1]) + '</div>';
  }

  /* ----- Perfil de la barbería (dueño) ----- */
  async function secNegocio() {
    const z = seccion('🏪 Perfil de la barbería');
    yo = await K.refrescar() || yo;
    const b = bar();
    const colores = tiene('colores');
    z.innerHTML =
      '<div class="card"><h2>🏪 Datos</h2><label>Nombre</label><input data-k="nombre" maxlength="80" value="' + esc(b.nombre) + '">' +
      '<label>Dirección <span class="opc">(opcional)</span></label><input data-k="direccion" maxlength="160" value="' + esc(b.direccion || '') + '">' +
      '<label>WhatsApp de la barbería <span class="opc">(lo ven tus clientes y aquí llegan los "olvidé mi clave")</span></label><input data-k="whatsapp" inputmode="tel" value="' + esc(b.whatsapp || '') + '">' +
      '<label>Mensaje de bienvenida <span class="opc">(sale en tu link y en la app de tus clientes)</span></label><input data-k="bienvenida" maxlength="300" placeholder="Ej: ¡Bienvenido a la familia! 💈" value="' + esc(b.bienvenida || '') + '">' +
      '<label>Logo</label><div class="flex"><span class="av lg" id="aLogo" style="' + C.fondo(b.logo) + '">' + (b.logo ? '' : '💈') + '</span><button class="gris small" id="bLogo">📷 Cambiar logo</button>' +
      (b.logo ? '<button class="gris small" id="bSinLogo">Quitar</button>' : '') + '</div></div>' +
      '<div class="card" id="cPrem"><h2>🎨 Colores y portada</h2><label>Color de la app</label><div class="swatches" id="sw"></div>' +
      '<label>Portada <span class="opc">(foto grande en tu link y en el inicio de tus clientes)</span></label><div class="btns" style="margin-top:0"><button class="gris small" id="bPortada">🖼️ ' + (b.portada ? 'Cambiar' : 'Subir') + ' portada</button>' + (b.portada ? '<button class="gris small" id="bSinPortada">Quitar</button>' : '') + '</div></div>' +
      '<div class="card" id="cCom"><h2>💈 Comisión y sellos</h2><div class="row"><div><label>Comisión barberos (%)</label><input data-k="comision" type="number" min="0" max="100" value="' + b.comision + '"></div>' +
      '<div><label>Sellos para corte gratis</label><input data-k="sellos_meta" type="number" min="3" max="30" value="' + b.sellos_meta + '"></div></div></div>' +
      '<div class="card" id="cCumple"><h2>🎂 Regalo de cumpleaños</h2><p class="muted chico" style="margin-top:-6px">El día de su cumpleaños, a tus clientes con cuenta les llega este regalo (vale 7 días). Vacío = no se envía.</p>' +
      '<input data-k="regalo_cumple" maxlength="120" placeholder="Ej: 20% de descuento en tu corte" value="' + esc(b.regalo_cumple || '') + '"></div>' +
      '<div class="btns"><button class="grande full" id="bGuardarAj">Guardar</button></div>';
    let logo, portada, color = b.color || '';
    $('bLogo').onclick = async () => { const f = await C.elegirImagen(160, 0.8); if (!f) return; logo = f; $('aLogo').style.cssText = C.fondo(f); $('aLogo').textContent = ''; };
    if ($('bSinLogo')) $('bSinLogo').onclick = () => { logo = ''; $('aLogo').style.cssText = ''; $('aLogo').textContent = '💈'; };
    $('sw').innerHTML = C.COLORES.map(([n, c]) => '<button type="button" title="' + n + '" style="background:' + c + '" class="' + (c === color ? 'on' : '') + '" data-c="' + c + '"></button>').join('');
    $('sw').querySelectorAll('button').forEach((x) => x.onclick = () => { color = x.dataset.c; $('sw').querySelectorAll('button').forEach((y) => y.classList.toggle('on', y === x)); C.aplicarColor(color); });
    $('bPortada').onclick = async () => { const f = await C.elegirImagen('portada'); if (f) { portada = f; C.toast('🖼️ Portada lista, toca Guardar'); } };
    if ($('bSinPortada')) $('bSinPortada').onclick = () => { portada = ''; C.toast('Portada quitada, toca Guardar'); };
    if (!colores) P.bloquear($('cPrem'), 'Colores y portada');
    if (!tiene('comisiones')) P.bloquear($('cCom'), 'Comisiones y sellos');
    if (!tiene('cumpleanos')) P.bloquear($('cCumple'), 'Regalo de cumpleaños automático');
    $('bGuardarAj').onclick = (ev) => C.accion(ev.target, async () => {
      const p = {};
      z.querySelectorAll('[data-k]').forEach((i) => {
        if (!tiene('comisiones') && (i.dataset.k === 'comision' || i.dataset.k === 'sellos_meta')) return;
        if (!tiene('cumpleanos') && i.dataset.k === 'regalo_cumple') return;
        p[i.dataset.k] = i.type === 'number' ? (+i.value || 0) : i.value;
      });
      if (logo !== undefined) p.logo = logo;
      if (colores) { p.color = color; if (portada !== undefined) p.portada = portada; }
      yo = await K.rpc('guardar_barberia', { p });
      K.aplicarMarca(yo);
      await cargarBarberia();
    }, '✅ Guardado');
  }

  /* ----- Horario y bloqueos (dueño) ----- */
  async function secHorario() {
    const z = seccion('🕐 Horario');
    yo = await K.refrescar() || yo;
    z.innerHTML = '<div class="card"><h2>🕐 Horario de la semana</h2><p class="muted chico" style="margin-top:-6px">Desde qué hora abre y hasta cuándo cierra cada día. La agenda de tus clientes se arma sola con esto.</p><div id="edH"></div>' +
      '<div class="btns"><button class="full" id="bGuardarH">Guardar horario</button></div></div>' +
      '<div class="card"><h2>⛔ Días bloqueados</h2><div id="lBloq"><p class="muted">Cargando…</p></div><div class="btns"><button class="gris" id="bBloq">+ Bloquear fechas</button></div></div>';
    const leerH = editorHorario($('edH'), bar().horario);
    $('bGuardarH').onclick = (ev) => C.accion(ev.target, async () => { yo = await K.rpc('guardar_barberia', { p: { horario: leerH() } }); await cargarBarberia(); }, '✅ Horario guardado');
    $('bBloq').onclick = () => nuevoBloqueo(null);
    try {
      const d = await K.rpc('ocupacion', { p_desde: C.hoy(), p_hasta: C.sumarDias(C.hoy(), 365) });
      if (!$('lBloq')) return;
      $('lBloq').innerHTML = d.bloqueos.length ? '<ul class="list">' + d.bloqueos.map((k) => '<li><div class="grow"><b>' + esc(k.motivo || 'Bloqueado') + '</b><div class="sub">' + C.cuando(k.desde) + ' → ' + C.cuando(k.hasta) +
        ' · ' + esc(k.barbero_id ? (barbero(k.barbero_id) || {}).nombre || '' : 'toda la barbería') + '</div></div><button class="small danger" data-del="' + k.id + '">Quitar</button></li>').join('') + '</ul>' : '<p class="muted">No hay fechas bloqueadas.</p>';
      $('lBloq').querySelectorAll('[data-del]').forEach((x) => x.onclick = async () => { await borrarBloqueo(x.dataset.del); secHorario(); });
    } catch (e) { if ($('lBloq')) $('lBloq').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; }
  }

  /* ----- Mis tiempos (cada barbero los suyos): cuánto le dura cada servicio, su descanso y cada cuánto parten sus horas ----- */
  async function secTiempos() {
    const z = seccion('⏱️ Mis tiempos');
    yo = await K.refrescar() || yo;
    await cargarBarberia();
    const dur = yo.duraciones || {};
    const opc = (vals, sel, txt) => vals.map((v) => '<option value="' + v + '"' + (+sel === v ? ' selected' : '') + '>' + txt(v) + '</option>').join('');
    const hm = (m) => (m >= 60 ? Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) : '') : m + ' min');
    z.innerHTML = '<div class="card"><p class="muted chico" style="margin-top:0">Cuando un cliente reserva contigo, se bloquea al tiro lo que te dura el servicio <b>más tu descanso</b>. ' +
      'La siguiente hora libre parte justo cuando terminas: así no quedan huecos.</p>' +
      '<div class="row"><div><label>Descanso entre citas</label><select id="tDesc">' + opc([0, 5, 10, 15, 20, 25, 30, 45, 60], yo.descanso_min || 0, (v) => v ? v + ' min' : 'Sin descanso') + '</select></div>' +
      '<div><label>Mis horas parten cada</label><select id="tPaso">' + opc([10, 15, 20, 30, 45, 60, 75, 90, 120], yo.paso_min || 15, hm) + '</select></div></div></div>' +
      '<div class="card"><h2>✂️ Cuánto me dura cada servicio</h2><p class="muted chico" style="margin-top:-6px">Déjalo vacío para usar la duración de la barbería.</p>' +
      (B.servicios.length ? B.servicios.map((sv) => '<div class="det-fila" style="align-items:center"><span>' + esc(sv.nombre) + ' <span class="muted chico">(barbería: ' + sv.duracion + ' min)</span></span>' +
        '<input data-sv="' + sv.id + '" type="number" inputmode="numeric" min="5" max="480" step="5" placeholder="' + sv.duracion + '" value="' + (dur[sv.id] || '') + '" style="width:96px;padding:8px"></div>').join('')
        : '<p class="muted">La barbería aún no tiene servicios.</p>') + '</div>' +
      '<div class="card" id="tPrev"></div><div class="btns"><button class="grande full" id="bGuardarT">Guardar mis tiempos</button></div>';
    const leer = () => {
      const d = {};
      z.querySelectorAll('[data-sv]').forEach((i) => { if (i.value) d[i.dataset.sv] = +i.value; });
      return { descanso_min: +$('tDesc').value, paso_min: +$('tPaso').value, duraciones: d };
    };
    const vista = () => {
      const t = leer();
      const yoT = { duraciones: t.duraciones, descanso: t.descanso_min };
      const sv = B.servicios[0];
      if (!sv) { $('tPrev').innerHTML = ''; return; }
      const total = A.duracion(yoT, [sv]);
      let h = 10 * 60, horas = [];
      for (let i = 0; i < 4; i++) { horas.push(C.aHHMM(h)); h += total; }
      $('tPrev').innerHTML = '<b>👀 Así queda</b><p class="muted" style="margin:6px 0 0">Un <b>' + esc(sv.nombre) + '</b> te bloquea <b>' + hm(total) + '</b> (' + (t.duraciones[sv.id] || sv.duracion) + ' min + ' + t.descanso_min + ' de descanso). ' +
        'Si te reservan seguido: ' + horas.join(' · ') + '…</p>';
    };
    z.querySelectorAll('select, input').forEach((i) => { i.oninput = vista; i.onchange = vista; });
    vista();
    $('bGuardarT').onclick = (ev) => C.accion(ev.target, async () => {
      yo = await K.rpc('guardar_tiempos', { p: leer() });
      await cargarBarberia();
    }, '✅ Tiempos guardados');
  }

  /* ----- Links de pago del abono (solo el dueño los ve) ----- */
  async function secLinks() {
    const z = seccion('💳 Links de pago');
    yo = await K.refrescar() || yo;
    const b = bar();
    z.innerHTML = '<div class="card"><h2>💳 Abono para reservar</h2><p class="muted chico" style="margin-top:-6px">Monto fijo para cualquier servicio. Va directo a ti y se descuenta del total. ' +
      'Guarda dos links (ej. $4.000 y $8.000) y elige cuál está activo: el monto del abono es el del link activo. Solo tú los ves; tus barberos no.</p>' +
      [1, 2].map((n) => {
        const pg = ((b.pagos || {})['p' + n]) || {};
        const act = ((b.pagos || {}).activo || 1) === n;
        return '<div class="card" style="box-shadow:none;margin:10px 0 0;padding:12px' + (act ? ';border-color:var(--brand)' : '') + '" data-pago="' + n + '">' +
          '<label class="check" style="margin:0"><input type="radio" name="pagoActivo" value="' + n + '"' + (act ? ' checked' : '') + '> <b>Link ' + n + '<span data-act-txt>' + (act ? ' · activo' : '') + '</span></b></label>' +
          '<div class="row"><div><label>Monto</label><input data-pm type="number" inputmode="numeric" min="0" max="100000" placeholder="$" value="' + (pg.monto == null ? '' : pg.monto) + '"></div>' +
          '<div style="flex:2"><label>Link de pago <span class="opc">(Mercado Pago u otro)</span></label><input data-pl placeholder="https://…" value="' + esc(pg.link || '') + '"></div></div>' +
          '<label>Texto <span class="opc">(lo ve el cliente, ej. "Abono normal")</span></label><input data-px maxlength="120" value="' + esc(pg.texto || '') + '"></div>';
      }).join('') +
      '<p class="muted chico">Sin link, el cliente abona por transferencia con los datos de abajo. Sin link ni datos, no recibes reservas sin cuenta.</p>' +
      '<label>Datos de transferencia</label><textarea id="tTransf" maxlength="400" placeholder="Nombre, RUT, banco, tipo y número de cuenta, correo">' + esc(b.datos_transferencia || '') + '</textarea>' +
      '<label>⭐ Abono para clientes Premium <span class="opc">(opcional: menor que el normal, o 0 = sin abono)</span></label>' +
      '<input id="tAbP" type="number" inputmode="numeric" min="0" max="100000" placeholder="Igual que el normal" value="' + (b.abono_premium == null ? '' : b.abono_premium) + '">' +
      '<p class="muted chico">Un beneficio para que tus clientes se hagan Premium: reservan pagando menos abono (o nada).</p>' +
      '<div class="btns"><button class="grande full" id="bGuardarL">Guardar</button></div></div>';
    z.querySelectorAll('input[name="pagoActivo"]').forEach((r) => r.onchange = () => {
      z.querySelectorAll('[data-pago]').forEach((c) => {
        const on = c.dataset.pago === r.value;
        c.style.borderColor = on ? 'var(--brand)' : '';
        c.querySelector('[data-act-txt]').textContent = on ? ' · activo (al guardar)' : '';
      });
    });
    $('bGuardarL').onclick = (ev) => C.accion(ev.target, async () => {
      const caja = (n) => z.querySelector('[data-pago="' + n + '"]');
      const leer = (n) => ({ monto: caja(n).querySelector('[data-pm]').value, link: caja(n).querySelector('[data-pl]').value, texto: caja(n).querySelector('[data-px]').value });
      const activo = +((z.querySelector('input[name="pagoActivo"]:checked') || {}).value || 1);
      yo = await K.rpc('guardar_barberia', { p: { pagos: { activo, p1: leer(1), p2: leer(2) }, datos_transferencia: $('tTransf').value, abono_premium: $('tAbP').value } });
      secLinks();
    }, '✅ Links guardados');
  }

  /* ----- Calificaciones que dejaron los clientes (dueño) ----- */
  async function secCalificaciones() {
    const z = seccion('⭐ Calificaciones');
    z.innerHTML = '<p class="muted">Cargando…</p>';
    let d;
    try { d = await K.rpc('mis_calificaciones'); } catch (e) { z.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
    const n = d.nota || {};
    z.innerHTML = '<div class="card centro"><div style="font-size:44px;font-weight:800">' + (n.total ? n.promedio + ' <span style="color:var(--oro)">★</span>' : '—') + '</div>' +
      '<p class="muted" style="margin:0">' + (n.total ? 'Promedio de ' + n.total + ' calificación(es). Todos tus clientes ven este promedio.' : 'Aún no te califican. Los clientes califican después de ser atendidos.') + '</p></div>' +
      (d.ultimas.length ? '<div class="card"><h2>💬 Últimas</h2><ul class="list">' + d.ultimas.map((q) => '<li><div class="grow"><span class="estrellas">' + '★'.repeat(q.estrellas) + '<span style="color:var(--line)">' + '★'.repeat(5 - q.estrellas) + '</span></span>' +
        ' <b>' + esc(q.nombre || 'Cliente') + '</b>' + (q.comentario ? '<div class="sub">' + esc(q.comentario) + '</div>' : '') + '</div><span class="muted chico">' + C.hace(q.created_at) + '</span></li>').join('') + '</ul></div>' : '') +
      '<p class="muted chico">Tú también calificas a tus clientes después de atenderlos (o si no vinieron). Con ' + K.regla('estrellas_lista_negra') + ' estrella(s) o menos quedan en la lista negra de Clientes.</p>';
  }

  /* ----- v2.1: Resumen del mes (dueño) ----- */
  let resMes = 'actual';
  async function secResumen() {
    const z = seccion('📈 Resumen del mes');
    const f = C.hoy();
    const [y, m] = f.split('-').map(Number);
    const ant = new Date(Date.UTC(y, m - 2, 1));
    const mes = resMes === 'actual' ? f : ant.getUTCFullYear() + '-' + C.pad(ant.getUTCMonth() + 1) + '-01';
    z.innerHTML = '<div class="seg" style="margin-bottom:12px"><button data-r="actual">Este mes</button><button data-r="pasado">Mes pasado</button></div><div id="resZona"><p class="muted">Cargando…</p></div>';
    z.querySelectorAll('[data-r]').forEach((b) => { b.classList.toggle('on', b.dataset.r === resMes); b.onclick = () => { resMes = b.dataset.r; secResumen(); }; });
    let x;
    try { x = await K.rpc('resumen_mes', { p_mes: mes }); } catch (e) { if ($('resZona')) $('resZona').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
    if (!$('resZona')) return;
    const bl = x.bloqueado;
    const plata = (v) => bl ? '<span class="borroso">$123.456</span>' : C.plata(v);
    const txt = (v) => bl ? '<span class="borroso">Bloqueado</span>' : esc(v || '—');
    const dif = !bl && x.ventas_ant ? Math.round((x.ventas - x.ventas_ant) / x.ventas_ant * 100) : null;
    $('resZona').innerHTML = '<div class="card' + (bl ? ' plata" id="upRes' : '') + '"><div class="stats" style="margin:0">' +
      '<div class="card"><small>💵 Ganaste</small><b>' + plata(x.ventas) + '</b>' + (dif !== null ? '<small>' + (dif >= 0 ? '↑' : '↓') + Math.abs(dif) + '% vs mes anterior</small>' : '') + '</div>' +
      '<div class="card"><small>✂️ Cortes</small><b>' + x.cortes + '</b></div><div class="card"><small>👥 Clientes</small><b>' + x.clientes + '</b><small>' + x.nuevos + ' nuevos</small></div>' +
      '<div class="card"><small>🚫 No vinieron</small><b style="color:var(--bad)">' + x.no_vino + '</b><small>perdiste ' + plata(x.perdido_no_vino) + '</small></div>' +
      '<div class="card"><small>💳 Abonos</small><b>' + plata(x.abonos) + '</b></div><div class="card"><small>👋 No vuelven</small><b>' + (x.sin_volver || 0) + '</b></div></div>' +
      '<ul class="list" style="margin-top:10px"><li><span class="grow">📆 Mejor día</span><b>' + (x.mejor_dia ? C.DIAS_LARGO[x.mejor_dia - 1] : '—') + '</b></li>' +
      '<li><span class="grow">💈 Barbero con más cortes</span><b>' + txt(x.mejor_barbero) + '</b></li><li><span class="grow">✂️ Servicio estrella</span><b>' + txt(x.servicio_top) + '</b></li></ul>' +
      (bl ? '<p class="muted chico">🔒 Con Premium ves tus ganancias, lo que perdiste por los que no vinieron, tu mejor barbero y te llega este resumen solo cada mes.</p>' : '<p class="muted chico">El día 1 de cada mes te llega este resumen del mes anterior 🔔.</p>') + '</div>';
    if ($('upRes')) $('upRes').onclick = () => P.upsell('Resumen del mes con tus ganancias');
  }

  /* ----- v2.1: Clientes que no vuelven (oferta por WhatsApp en 1 toque) ----- */
  async function secVolver() {
    const z = seccion('👋 Clientes que no vuelven');
    z.innerHTML = '<p class="muted">Cargando…</p>';
    let x;
    try { x = await K.rpc('no_vuelven'); } catch (e) { z.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
    const b = bar();
    const base = b.mensaje_volver || '¡Te echamos de menos en ' + b.nombre + '! 💈 Esta semana tienes 10% de descuento en tu corte. Reserva aquí: ' + linkClientes();
    const msg = (c) => 'Hola ' + primerNombre(c.nombre) + ' 👋 ' + base;
    if (x.bloqueado) {
      z.innerHTML = '<div class="card plata" id="upVolver"><h2>👋 ' + x.total + ' cliente(s) no vuelven hace +' + x.dias + ' días</h2><p class="muted">Ve quiénes son, cuántas veces vinieron y escríbeles con una oferta por WhatsApp en 1 toque.</p>' +
        '<ul class="list">' + ['Juan P.', 'Diego R.', 'Matías S.'].map((n) => '<li><span class="grow borroso">' + n + '</span><span class="btn small wsp">💬 Oferta</span></li>').join('') + '</ul></div>';
      $('upVolver').onclick = () => P.upsell('Clientes que no vuelven');
      return;
    }
    z.innerHTML = '<div class="card"><p class="muted chico" style="margin-top:0">Su última visita fue hace más de ' + x.dias + ' días y no tienen hora agendada.</p>' +
      (dueno() ? '<label>Mensaje para invitarlos a volver</label><textarea id="tVolver" maxlength="300">' + esc(base) + '</textarea><div class="btns"><button class="small gris" id="bGVolver">Guardar mensaje</button></div>' : '') + '</div>' +
      (x.lista.length ? '<div class="card"><ul class="list">' + x.lista.map((c, i) => '<li><div class="grow"><b>' + esc(c.nombre) + '</b><div class="sub">' + c.visitas + ' visita' + (c.visitas === 1 ? '' : 's') +
        ' · última hace ' + c.dias + ' días' + (c.cliente_id ? '' : ' · sin cuenta') + '</div></div>' +
        (c.telefono ? '<a class="btn small wsp" target="_blank" rel="noopener" data-v="' + i + '" href="' + C.wa(c.telefono, msg(c)) + '">💬 Oferta</a>' : '<span class="muted chico">sin WhatsApp</span>') + '</li>').join('') + '</ul></div>'
        : '<div class="card empty"><span class="ico">🎉</span>¡Todos tus clientes están volviendo!</div>');
    if ($('tVolver')) $('tVolver').oninput = () => z.querySelectorAll('[data-v]').forEach((a) => {
      const c = x.lista[+a.dataset.v]; a.href = C.wa(c.telefono, 'Hola ' + primerNombre(c.nombre) + ' 👋 ' + $('tVolver').value);
    });
    if ($('bGVolver')) $('bGVolver').onclick = (ev) => C.accion(ev.target, async () => { yo = await K.rpc('guardar_barberia', { p: { mensaje_volver: $('tVolver').value } }); }, '✅ Mensaje guardado');
  }

  /* ----- v2.1: Invita a otra barbería (referidos) ----- */
  async function secInvitar() {
    const z = seccion('🤝 Invita una barbería');
    const dias = K.regla('dias_referido');
    const zz = P.compartir({ el: z, link: K.linkRegistro(bar().codigo), archivo: 'invita-' + bar().codigo,
      texto: '¿Conoces otra barbería? Compártele este link o QR: crea su app en minutos' + (K.regla('dias_regalo') ? ' con ' + K.regla('dias_regalo') + ' días de Premium de regalo' : '') + '.' +
        (dias ? '<br><b>Cuando pague su primer mes, tú ganas ' + dias + ' días de Premium gratis.</b>' : ''),
      mensaje: '💈 Te recomiendo esta app de reservas para tu barbería (yo la uso en ' + bar().nombre + '). Créala aquí', extra: '<div id="lRef"></div>' });
    try {
      const r = await K.rpc('mis_referidos');
      if (!zz.querySelector('#lRef')) return;
      zz.querySelector('#lRef').innerHTML = '<div class="card"><h2>📋 Tus invitadas</h2>' + (r.lista.length ? '<ul class="list">' + r.lista.map((x) => '<li><span class="grow"><b>' + esc(x.nombre) + '</b><div class="sub">se registró ' + P.fechaCorta(x.created_at) + '</div></span>' +
        (x.pagado ? '<span class="pill ok">🎁 ganaste</span>' : '<span class="pill">esperando su pago</span>') + '</li>').join('') + '</ul>' : '<p class="muted" style="margin:0">Aún no se registra nadie con tu link.</p>') + '</div>';
    } catch (e) { /* nada */ }
  }

  /* ----- Enlace y QR para clientes ----- */
  function enlaceClientes() {
    const link = linkClientes();
    const z = vistaActual === 'mas' ? seccion('🔗 Enlace y QR') : null;
    const html = '<div class="card centro"><p>Comparte este enlace o el QR con tus clientes: <b>reservan sin cuenta</b> (con nombre y WhatsApp) o se crean su cuenta.</p>' +
      '<img class="qr-img" src="' + C.qr(link, 440) + '" alt="QR"><input readonly value="' + esc(link) + '" style="text-align:center">' +
      '<div class="btns" style="justify-content:center"><button data-c>📋 Copiar</button><a class="btn gris" download="qr-' + esc(bar().codigo) + '.png" href="' + C.qr(link, 900) + '">⬇️ Descargar QR</a>' +
      '<a class="btn wsp" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent('💈 Reserva tu hora en ' + bar().nombre + ': ' + link) + '">💬 Compartir</a></div></div>';
    if (z) { z.innerHTML = html; z.querySelector('[data-c]').onclick = () => C.copiar(link); }
    else { const h = C.hoja('<h2>🔗 Enlace para clientes</h2>' + html); h.q('[data-c]').onclick = () => C.copiar(link); }
  }

  const pasos = () => dueno() ? [
    ['💈', '¡Bienvenido a tu panel!', 'En Inicio ves lo urgente: abonos por revisar, devoluciones y lo que te falta configurar.'],
    ['✂️', 'Arma tu barbería', 'En Más: servicios con precio, horario, links de pago del abono, logo y tu equipo.'],
    ['🔗', 'Comparte tu link', 'Con tu link o QR los clientes reservan sin cuenta (nombre y WhatsApp) o se crean la cuenta.'],
    ['🧾', 'Aprueba los abonos', 'Cuando alguien sube su comprobante, te llega un aviso: revisa que llegó la transferencia y toca Aprobar. La hora queda agendada.']
  ] : [
    ['💈', '¡Bienvenido!', 'Aquí ves tu agenda, apruebas los abonos de tus clientes y anotas tus cortes.'],
    ['⏱️', 'Tus tiempos', 'En Más → Mis tiempos pones cuánto te dura cada corte y tu descanso: al reservar contigo se bloquea ese tiempo al tiro.'],
    ['🧾', 'Aprueba los abonos', 'Cuando un cliente sube su comprobante te llega un aviso. Revisa que llegó la transferencia y toca Aprobar.'],
    ['⭐', 'Califica a tus clientes', 'Después de atenderlos (o si no vinieron) los calificas. Los de pocas estrellas quedan en la lista negra.']
  ];

  // Arranque
  try { await cargarBarberia(); } catch (e) { C.toast('⚠️ ' + e.message, 5000); }
  ruta();
  P.tour(pasos());
  K.revisarActualizacion();
  K.ajustes();
})();
