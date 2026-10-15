/* Vista libre de la barbería (link o QR): ver servicios, reservar SIN cuenta (nombre + WhatsApp) o crear la cuenta. */
(async function () {
  'use strict';
  const C = Core, K = Cuenta, A = Agenda;
  const $ = C.$, esc = C.esc;
  C.registrarSW();

  const params = new URLSearchParams(location.search);
  const local = K.barberiaLocal();
  const codigo = (params.get('b') || params.get('s') || (local && local.codigo) || '').trim().toLowerCase();
  const app = $('app');
  const mostrarApp = (html) => { $('cargando').classList.add('hidden'); app.classList.remove('hidden'); app.innerHTML = html; };

  if (!K.listo) { $('cargando').textContent = 'Falta configurar el servidor.'; return; }
  if (!codigo) {
    mostrarApp('<div class="card centro" style="margin-top:14vh"><div style="font-size:48px">💈</div><h2 style="justify-content:center">Abre el link de tu barbería</h2>' +
      '<p class="muted">Pídele a tu barbería su link o escanea su código QR para reservar.</p><a class="btn gris" href="../">Ya tengo cuenta</a></div>');
    return;
  }

  let V, yo = null;
  try {
    [V] = await Promise.all([K.rpc('vista_publica', { p_codigo: codigo }), K.ajustes()]);
  } catch (e) { mostrarApp('<div class="card err">' + esc(e.message) + '</div>'); return; }
  if (!V) {
    mostrarApp('<div class="card centro" style="margin-top:14vh"><div style="font-size:48px">🤔</div><h2 style="justify-content:center">No encontramos esta barbería</h2>' +
      '<p class="muted">Revisa que el link esté completo.</p></div>');
    return;
  }
  // ¿Ya tiene sesión en este celular?
  try { yo = await K.refrescar(); } catch (e) { yo = null; }
  K.recordarBarberia({ codigo: V.codigo, nombre: V.nombre, logo: V.logo, whatsapp: V.whatsapp, color: V.color });
  if (V.color) C.aplicarColor(V.color);
  document.title = V.nombre + ' · Reserva tu hora';

  const carro = new Set();
  let barberoSel = null, fechaSel = C.hoy();
  let datos = { reservas: [], bloqueos: [] };
  const servicio = (id) => V.servicios.find((s) => s.id === id);
  const barbero = (id) => V.barberos.find((b) => b.id === id);
  const reservables = () => V.barberos.filter((b) => b.reservable);
  const carroItems = () => [...carro].map(servicio).filter(Boolean);
  const carroDur = () => carroItems().reduce((t, s) => t + s.duracion, 0);
  const carroTotal = () => carroItems().reduce((t, s) => t + s.precio, 0);
  const horarios = () => Object.fromEntries(V.barberos.map((b) => [b.id, b.horario]));
  const misTokens = () => (C.leer('tokens', []) || []).filter((x) => x.codigo === V.codigo);
  const nota = (n) => n && n.total ? '<span class="nota">' + n.promedio + '</span> <span class="muted chico">(' + n.total + ')</span>' : '';

  // Encabezado
  const h = document.createElement('header');
  h.className = 'top';
  h.innerHTML = '<span class="logo' + (V.logo ? ' img' : '') + '" style="' + C.fondo(V.logo) + '">' + (V.logo ? '' : '💈') + '</span>' +
    '<div class="tit"><b>' + esc(V.nombre) + '</b><small>' + (nota(V.calificacion) || esc(K.texto('app_lema', 'Reserva tu hora'))) + '</small></div>' +
    (yo ? '<a class="btn small" href="../' + K.paginaDe(yo.role) + '">Mi app</a>' : '<a class="btn small gris" href="../?b=' + esc(V.codigo) + '&entrar=1">Entrar</a>');
  document.body.prepend(h);

  async function cargarDatos() {
    const desde = C.hoy(), hasta = C.sumarDias(desde, Math.min(60, V.dias_max + 1));
    datos = await K.rpc('ocupacion_publica', { p_codigo: V.codigo, p_desde: desde, p_hasta: hasta, p_token: null });
  }

  function pintar() {
    let html = '';
    if (V.portada) html += '<div class="portada" style="' + C.fondo(V.portada) + '"></div>';
    html += '<div class="card hero"><div class="logo-grande' + (V.logo ? ' img' : '') + '" style="' + C.fondo(V.logo) + '">' + (V.logo ? '' : '💈') + '</div>' +
      '<h1>' + esc(V.nombre) + '</h1>' + (V.calificacion && V.calificacion.total ? '<div>' + nota(V.calificacion) + '</div>' : '') +
      '<p class="muted" style="margin:6px 0 0">' + esc(V.bienvenida || K.texto('vista_bienvenida', 'Elige tu corte, tu barbero y tu hora.')) + '</p>' +
      '<div class="btns" style="justify-content:center"><button class="grande" id="bIrReservar">📅 Reservar hora</button>' +
      (yo && yo.role === 'client' ? '<a class="btn gris" href="../cliente/">Abrir mi app</a>' :
        (V.registro ? '<button class="alt" id="bCuenta">👤 Crear mi cuenta</button>' : '')) + '</div>' +
      (!yo ? '<p class="muted chico" style="margin-bottom:0">No necesitas cuenta para reservar. Con cuenta ves tu historial, te llegan avisos y reservas más rápido.</p>' : '') + '</div>';
    if (V.suspendida) html += '<div class="card err">Esta barbería no está recibiendo reservas por ahora.</div>';
    const mios = misTokens().filter((x) => new Date(x.fin || x.inicio) > Date.now() - 86400e3);
    if (mios.length) {
      html += '<div class="sec-tit">🗓️ Tus reservas en este celular</div><div class="card"><ul class="list">' + mios.map((x) =>
        '<li class="tap" data-t="' + esc(x.token) + '"><div class="grow"><b>' + C.cuando(x.inicio) + '</b><div class="sub">' + esc(x.texto || '') + '</div></div><span>›</span></li>').join('') + '</ul></div>';
    }
    html += '<div id="reservar"></div>';
    // Ofertas
    if (V.ofertas.length) {
      html += '<div class="sec-tit">🏷️ Ofertas</div>' + V.ofertas.map((o) => '<div class="card oferta"><h2>' + esc(o.titulo) + (o.precio ? ' <span class="pill ok">' + esc(o.precio) + '</span>' : '') + '</h2>' +
        (o.detalle ? '<p style="margin:0;white-space:pre-line">' + esc(o.detalle) + '</p>' : '') + (o.imagen && /^data:image\//.test(o.imagen) ? '<img src="' + o.imagen + '" alt="">' : '') + '</div>').join('');
    }
    // Equipo y datos
    html += '<div class="sec-tit">💈 Nuestro equipo</div><div class="card"><ul class="list">' + V.barberos.map((x) =>
      '<li>' + C.avatar(x) + '<div class="grow"><b>' + esc(x.nombre) + '</b>' + (x.descripcion ? '<div class="sub">' + esc(x.descripcion) + '</div>' : '') +
      (!x.reservable ? '<div class="sub">🔴 Agenda llena por ahora</div>' : '') + '</div></li>').join('') + '</ul></div>';
    html += '<div class="sec-tit">📍 La barbería</div><div class="card">' + (V.direccion ? '<p style="margin-top:0">📍 ' + esc(V.direccion) + '</p>' : '') +
      '<table class="tabla">' + (V.horario || []).map((d, i) => '<tr><td>' + C.DIAS_LARGO[i] + '</td><td>' + esc(A.horarioTxt(d)) + '</td></tr>').join('') + '</table>' +
      '<div class="btns">' + (V.whatsapp ? '<a class="btn wsp" target="_blank" rel="noopener" href="' + C.wa(V.whatsapp, 'Hola 👋') + '">💬 WhatsApp</a>' : '') +
      (V.direccion ? '<a class="btn gris" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(V.direccion) + '">🗺️ Cómo llegar</a>' : '') + '</div></div>';
    html += '<p class="muted chico centro">' + esc(K.texto('terminos', '')) + ' <a href="../legal.html">Términos</a></p>';
    mostrarApp(html);
    C.marca(true);
    $('bIrReservar').onclick = () => $('reservar').scrollIntoView({ behavior: 'smooth' });
    if ($('bCuenta')) $('bCuenta').onclick = crearCuenta;
    app.querySelectorAll('[data-t]').forEach((li) => li.onclick = () => { location.href = '../r/?t=' + li.dataset.t; });
    pintarReservar();
    if (location.hash === '#cuenta' && V.registro && !yo) crearCuenta();
  }

  /* ---------- Reservar sin cuenta ---------- */
  function pintarReservar() {
    const el = $('reservar');
    if (!el) return;
    if (V.suspendida) { el.innerHTML = ''; return; }
    if (!V.recibe) { el.innerHTML = '<div class="card empty"><span class="ico">💳</span>La barbería aún no configura el pago del abono. Escríbele por WhatsApp para reservar.</div>'; return; }
    if (!barberoSel || !barbero(barberoSel) || (barberoSel !== '*' && !barbero(barberoSel).reservable)) {
      barberoSel = reservables().length > 1 ? '*' : (reservables()[0] || {}).id || null;
    }
    const cats = [...new Set(V.servicios.map((s) => s.categoria || ''))];
    let html = '<div class="paso"><span class="n">1</span><b>Elige tus servicios</b></div>';
    if (!V.servicios.length) html += '<div class="card empty"><span class="ico">✂️</span>La barbería aún no publica sus servicios.</div>';
    cats.forEach((cat) => {
      if (cat) html += '<div class="sec-tit">' + esc(cat) + '</div>';
      html += V.servicios.filter((s) => (s.categoria || '') === cat).map((s) =>
        '<div class="serv' + (carro.has(s.id) ? ' en-carro' : '') + '" data-s="' + s.id + '"><span class="foto" style="' + C.fondo(s.foto) + '">' + (s.foto ? '' : '✂️') + '</span>' +
        '<div class="grow"><b>' + esc(s.nombre) + '</b><span class="sub muted">' + s.duracion + ' min' + (s.descripcion ? ' · ' + esc(s.descripcion) : '') + '</span></div>' +
        '<div style="text-align:right"><div class="precio-s">' + C.plata(s.precio) + '</div><button class="small ' + (carro.has(s.id) ? 'ok' : 'alt') + '">' + (carro.has(s.id) ? '✓' : '+ Agregar') + '</button></div></div>').join('');
    });
    html += '<div class="paso"><span class="n">2</span><b>Elige tu barbero</b></div><div class="barberos">';
    if (reservables().length > 1) html += '<button class="barb' + (barberoSel === '*' ? ' on' : '') + '" data-b="*"><span class="av">🎲</span>El que esté libre<small>más horas</small></button>';
    html += V.barberos.map((x) => '<button class="barb' + (barberoSel === x.id ? ' on' : '') + (x.reservable ? '' : ' cerrada') + '" data-b="' + x.id + '">' + C.avatar(x) +
      esc(x.nombre.split(' ')[0]) + '<small>' + (x.reservable ? 'disponible' : '🔴 agenda llena') + '</small></button>').join('') + '</div>';
    html += '<div class="paso"><span class="n">3</span><b>Elige día y hora</b></div><div class="dias" id="tira"></div><div class="card" id="slots"></div>' +
      '<p class="muted chico">Abono para reservar: <b>' + C.plata(V.abono) + '</b> (se descuenta del total). ' + esc(K.texto('reserva_pago')) + '</p>';
    el.innerHTML = html;
    el.querySelectorAll('.serv').forEach((x) => x.onclick = () => { const id = x.dataset.s; if (carro.has(id)) carro.delete(id); else carro.add(id); pintarReservar(); });
    el.querySelectorAll('[data-b]').forEach((x) => x.onclick = () => {
      const id = x.dataset.b;
      if (id !== '*' && !barbero(id).reservable) return C.toast(barbero(id).nombre + ' tiene la agenda llena. Elige otro barbero 🙏');
      barberoSel = id; pintarReservar();
    });
    pintarSlots();
    barraCarro();
  }

  function barraCarro() {
    const bb = $('carroBarra');
    if (!carro.size) { bb.classList.add('hidden'); return; }
    bb.classList.remove('hidden');
    bb.innerHTML = '<div class="grow"><b>🛒 ' + carro.size + ' servicio' + (carro.size > 1 ? 's' : '') + ' · ' + C.plata(carroTotal()) + '</b><small>' + carroDur() + ' min · elige una hora 👇</small></div>' +
      '<button class="small gris" id="bVaciar" style="background:transparent;color:inherit;border-color:rgba(255,255,255,.3)">Vaciar</button>';
    $('bVaciar').onclick = () => { carro.clear(); pintarReservar(); };
  }

  function horasDe(f) {
    const dur = carroDur() || Math.min(...V.servicios.map((s) => s.duracion), 30);
    const ids = barberoSel === '*' ? reservables().map((x) => x.id) : [barberoSel];
    const porMin = new Map();
    ids.forEach((id) => {
      const x = barbero(id);
      if (!x) return;
      const servOk = [...carro].every((sid) => { const s = servicio(sid); return !s.barberos || !s.barberos.length || s.barberos.includes(id); });
      if (!servOk) return;
      A.horas({ f, barbero: id, dur, datos, horario: x.horario }).forEach((s) => {
        const prev = porMin.get(s.min);
        const rank = { libre: 3, ocupado: 1, mia: 1 };
        if (!prev || rank[s.estado] > rank[prev.estado]) porMin.set(s.min, Object.assign({ barbero: id }, s));
      });
    });
    return [...porMin.values()].sort((a, b) => a.min - b.min);
  }

  function pintarSlots() {
    if (!$('tira')) return;
    if (!barberoSel) { $('slots').innerHTML = '<div class="empty"><span class="ico">💈</span>Todos los barberos tienen la agenda llena por ahora. Escríbele a la barbería.</div>'; $('tira').innerHTML = ''; return; }
    const ids = barberoSel === '*' ? reservables().map((x) => x.id) : [barberoSel];
    A.tiraDias($('tira'), { cuantos: Math.min(60, V.dias_max + 1), sel: fechaSel, info: (f) => A.llenado(ids, f, datos, horarios()), alElegir: (f) => { fechaSel = f; pintarSlots(); } });
    const s = horasDe(fechaSel);
    const dh = A.diaHorario(barberoSel === '*' ? (reservables()[0] || {}).horario : barbero(barberoSel).horario, fechaSel);
    let html = '<h2>' + C.fechaLarga(fechaSel) + '</h2>';
    if (!s.length) html += '<div class="empty"><span class="ico">' + (dh.e === 'x' ? '🚪' : '😕') + '</span>' + (dh.e === 'x' ? 'Ese día no se atiende.' : 'No quedan horas este día.') + '</div>';
    else html += '<div class="slots">' + s.map((x) => '<button class="slot ' + x.estado + '" data-m="' + x.min + '"' + (x.estado !== 'libre' ? ' disabled' : '') + '>' + x.hhmm + '</button>').join('') + '</div>';
    $('slots').innerHTML = html;
    $('slots').querySelectorAll('.slot:not([disabled])').forEach((b) => b.onclick = () => confirmar(s.find((y) => y.min === +b.dataset.m), fechaSel));
  }

  function confirmar(slot, f) {
    if (!carro.size) {
      C.toast('👆 Primero agrega un servicio');
      const p = $('reservar').querySelector('.serv'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const x = barbero(slot.barbero || barberoSel);
    const yoInv = C.leer('invitado', {}) || {};
    const items = carroItems();
    const h = C.hoja('<h2>📅 Confirma tu hora</h2><div class="hora-card" style="margin-bottom:12px"><div class="fecha"><small>' + C.DIAS[C.dow(f) - 1] + '</small><b>' + (+f.slice(8)) + '</b><i>' + slot.hhmm + '</i></div>' +
      '<div class="grow"><b>' + C.fechaLarga(f) + ', ' + slot.hhmm + '</b><div class="muted">con ' + esc(x.nombre) + ' · ' + carroDur() + ' min</div></div></div>' +
      '<div class="resumen-carro">' + items.map((s) => '<div><span>' + esc(s.nombre) + '</span><span>' + C.plata(s.precio) + '</span></div>').join('') +
      '<div style="border-top:1px solid var(--line);padding-top:6px"><b>Total</b><b>' + C.plata(carroTotal()) + '</b></div>' +
      (V.abono ? '<div><span>Abono ahora</span><b>' + C.plata(V.abono) + '</b></div><div class="muted"><span>Pagas en la barbería</span><span>' + C.plata(Math.max(0, carroTotal() - V.abono)) + '</span></div>' : '') + '</div>' +
      '<label>Tu nombre</label><input data-n maxlength="60" autocomplete="name" placeholder="Ej: Juan Pérez" value="' + esc(yoInv.nombre || '') + '">' +
      '<label>Tu WhatsApp</label><input data-t inputmode="tel" autocomplete="tel" placeholder="+56 9 1234 5678" value="' + esc(yoInv.telefono || '') + '">' +
      '<p class="muted chico">' + esc(V.abono ? K.texto('reserva_pago') : 'Tu barbero revisará la reserva y te confirmará.') + '</p>' +
      '<p class="muted chico">' + esc(K.texto('reserva_politica')) + '</p>' +
      '<p class="err" data-err></p><div class="btns"><button class="grande full" data-ok>' + (V.abono ? '✅ Reservar y pagar el abono' : '✅ Reservar') + '</button></div>');
    h.q('[data-ok]').onclick = (ev) => C.accion(ev.target, async () => {
      const nombre = h.q('[data-n]').value.trim(), telefono = h.q('[data-t]').value.trim();
      if (nombre.length < 2) throw new Error('Escribe tu nombre');
      if (telefono.replace(/\D/g, '').length < 8) throw new Error('Escribe tu WhatsApp');
      C.guardar('invitado', { nombre, telefono });
      const r = await K.rpc('reservar_invitado', { p_codigo: V.codigo, p_barbero: x.id, p_inicio: slot.t.toISOString(), p_servicios: [...carro], p_nombre: nombre, p_telefono: telefono });
      const lista = (C.leer('tokens', []) || []).filter((y) => y.token !== r.token);
      lista.unshift({ token: r.token, codigo: V.codigo, inicio: slot.t.toISOString(), fin: new Date(slot.t.getTime() + carroDur() * 60000).toISOString(),
        texto: items.map((s) => s.nombre).join(' + ') + ' con ' + x.nombre });
      C.guardar('tokens', lista.slice(0, 20));
      location.href = '../r/?t=' + r.token + '&nueva=1';
    }).catch(async (e) => { h.q('[data-err]').textContent = e.message; try { await cargarDatos(); pintarSlots(); } catch (err) { /* nada */ } });
  }

  /* ---------- Crear cuenta desde el link ---------- */
  function crearCuenta() {
    const yoInv = C.leer('invitado', {}) || {};
    const h = C.hoja('<h2>👤 Tu cuenta en ' + esc(V.nombre) + '</h2><p class="muted" style="margin-top:-4px">Con tu cuenta ves tu historial, te llegan avisos al celular y reservas más rápido. ' +
      'Si ya reservaste sin cuenta con tu WhatsApp, esas horas pasan a tu cuenta.</p>' +
      '<label>Nombre</label><input data-n maxlength="80" autocomplete="name" value="' + esc(yoInv.nombre || '') + '">' +
      '<label>WhatsApp</label><input data-t inputmode="tel" autocomplete="tel" placeholder="+56 9 1234 5678" value="' + esc(yoInv.telefono || '') + '">' +
      '<label>Correo</label><input data-e type="email" inputmode="email" autocomplete="username" placeholder="tu@correo.cl">' +
      '<label>Clave <span class="opc">(mínimo 6)</span></label><input data-c type="password" autocomplete="new-password">' +
      '<p class="muted chico">' + esc(K.texto('terminos', '')) + '</p><p class="err" data-err></p>' +
      '<div class="btns"><button class="full grande" data-ok>Crear mi cuenta</button></div>' +
      '<p class="muted chico centro">¿Ya tienes cuenta? <a href="../?b=' + esc(V.codigo) + '&entrar=1">Entra aquí</a></p>');
    h.q('[data-ok]').onclick = (ev) => C.accion(ev.target, async () => {
      const d = { nombre: h.q('[data-n]').value.trim(), telefono: h.q('[data-t]').value.trim(), email: h.q('[data-e]').value.trim(), clave: h.q('[data-c]').value, codigo: V.codigo };
      if (d.nombre.length < 2) throw new Error('Escribe tu nombre');
      if (d.telefono.replace(/\D/g, '').length < 8) throw new Error('Escribe tu WhatsApp');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) throw new Error('Escribe un correo válido');
      const r = await K.registrarse(d);
      C.guardar('ultimoEmail', d.email.toLowerCase());
      if (r.confirmar) {
        h.q('.panel').innerHTML = '<div class="centro"><div style="font-size:52px">📧</div><h2 style="justify-content:center">Revisa tu correo</h2><p class="muted">Te enviamos un link para confirmar tu cuenta. ' +
          'Después entra con tu correo y clave.</p><a class="btn full" href="../?b=' + esc(V.codigo) + '&entrar=1">Ir a entrar</a></div>';
        return;
      }
      location.href = '../cliente/';
    }).catch((e) => { h.q('[data-err]').textContent = e.message; });
  }

  try { await cargarDatos(); } catch (e) { C.toast('⚠️ ' + e.message, 5000); }
  pintar();
  setInterval(() => { if (!document.hidden) cargarDatos().then(pintarSlots).catch(() => {}); }, 60000);
})();
