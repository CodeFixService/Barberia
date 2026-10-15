/* App del cliente: inicio, agendar (carrito → barbero → hora → abono), mis horas, mensajes y perfil. */
(async function () {
  'use strict';
  const C = Core, K = Cuenta, A = Agenda, P = Perfil;
  const $ = C.$, esc = C.esc;
  C.registrarSW();

  let yo = await K.exigir(['client']);
  const bar = () => yo.barberia || {};
  let B = { barberos: [], servicios: [], ofertas: [] };
  let horasMias = [];
  let datos = { reservas: [], bloqueos: [] };
  let datosRango = '';
  const carro = new Set();
  let barberoSel = null, fechaSel = C.hoy(), vista = 'dia', mesSel = C.hoy().slice(0, 7);
  const ACTIVA = ['esperando_abono', 'en_revision', 'por_aprobar', 'agendada', 'confirmada'];

  Avisos.montar({ sub: yo.is_premium ? '⭐ Cliente Premium' : 'Reserva tu hora' });
  Avisos.alCambiar((r, antes) => { if (antes.cargado && r.avisos > antes.avisos) { cargarHoras().then(() => { if (vistaActual === 'inicio') inicio(); if (vistaActual === 'horas') pintarHoras(); }); } });
  C.marca(bar().premium);

  const prem = () => !!yo.is_premium;
  const diasMax = () => K.limite('dias', prem());
  // Días que se muestran en el calendario (los de Premium, para que el Free los vea plateados).
  const ventana = () => Math.min(365, Math.max(K.limite('dias', true), K.limite('dias', false)) + 1);
  const servicio = (id) => B.servicios.find((s) => s.id === id);
  const barbero = (id) => B.barberos.find((b) => b.id === id);
  const reservables = () => B.barberos.filter((b) => b.reservable);
  const carroItems = () => [...carro].map(servicio).filter(Boolean);
  const carroDur = () => carroItems().reduce((t, s) => t + s.duracion, 0);
  const carroTotal = () => carroItems().reduce((t, s) => t + s.precio, 0);
  const horarios = () => Object.fromEntries(B.barberos.map((b) => [b.id, b.horario]));

  async function cargarBarberia() { B = await K.rpc('ver_barberia'); }
  async function cargarHoras() { try { horasMias = await K.rpc('mis_horas'); } catch (e) { /* sin red */ } }
  async function cargarDatos(forzar) {
    const desde = C.hoy(), hasta = C.sumarDias(desde, ventana());
    const clave = desde + hasta;
    if (!forzar && datosRango === clave) return;
    datos = await K.rpc('ocupacion', { p_desde: desde, p_hasta: hasta });
    datosRango = clave;
  }

  /* ---------- Navegación ---------- */
  let vistaActual = 'inicio';
  const VISTAS = { inicio, agendar, horas: pintarHoras, chat: () => Chat.montar($('v-chat')), perfil };
  function mostrar(v) {
    vistaActual = v;
    document.querySelectorAll('.view').forEach((x) => x.classList.toggle('on', x.id === 'v-' + v));
    document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    $('carroBarra').classList.toggle('hidden', v !== 'agendar' || !carro.size);
    scrollTo(0, 0);
    VISTAS[v]();
  }
  document.querySelectorAll('nav.tabs button').forEach((b) => b.onclick = () => { history.replaceState(null, '', '#' + b.dataset.v); mostrar(b.dataset.v); });
  function ruta() {
    const h = decodeURIComponent(location.hash.slice(1));
    const [v, qs] = h.split('?');
    const q = new URLSearchParams(qs || '');
    if (v === 'chat' && q.get('con')) { mostrar('chat'); Chat.abrir(q.get('con'), B.barberos.find((x) => x.id === q.get('con'))); return; }
    if (v === 'plan') { mostrar('perfil'); setTimeout(() => { const el = document.querySelector('[data-plan]'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 400); return; }
    if (v === 'avisos') { Avisos.abrir(); return; }
    if (v === 'ofertas') { mostrar('inicio'); setTimeout(() => { const el = $('ofertas'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 300); return; }
    mostrar(VISTAS[v] ? v : 'inicio');
  }
  addEventListener('hashchange', ruta);

  /* ---------- Inicio ---------- */
  async function inicio() {
    const el = $('v-inicio');
    const b = bar();
    const prox = horasMias.filter((h) => ACTIVA.includes(h.estado) && new Date(h.fin) > new Date()).sort((x, y) => new Date(x.inicio) - new Date(y.inicio));
    const ultima = horasMias.find((h) => h.estado === 'atendida');
    let html = '';
    if (b.premium && b.portada) html += '<div class="portada" style="' + C.fondo(b.portada) + '"></div>';
    if (yo.clave_temporal) html += '<div class="banner alerta"><div class="grow"><b>🔑 Cambia tu clave temporal</b><br>Ve a 👤 Perfil y pon una que recuerdes.</div><a class="btn small" href="#perfil">Cambiar</a></div>';
    html += '<div class="card ' + (prem() ? 'oro-marco' : '') + '"><div class="hola">' + C.avatar(yo, 'lg' + (prem() ? ' premium' : '')) +
      '<div class="grow"><h2>Hola, ' + esc(yo.nombre.split(' ')[0]) + ' 👋</h2><div class="muted">' + esc(b.bienvenida || '¿Listo para tu próximo corte?') + '</div>' +
      (B.calificacion && B.calificacion.total ? '<div class="chico">' + esc(b.nombre) + ' <span class="nota">' + B.calificacion.promedio + '</span> <span class="muted">(' + B.calificacion.total + ')</span></div>' : '') +
      (prem() ? '<span class="pill oro" style="margin-top:6px">⭐ Premium</span>' : '<a href="#plan" class="pill" style="margin-top:6px;text-decoration:none">💎 Hazte Premium</a>') + '</div></div>' +
      '<div class="btns"><button class="grande full" id="bAgendar">📅 Agendar hora</button>' +
      (ultima ? '<button class="alt full" id="bRepetir">⭐ Repetir mi último corte<br><small style="font-weight:500">' + esc(ultima.servicios.map((s) => s.nombre).join(' + ')) + ' con ' + esc(ultima.barbero) + '</small></button>' : '') + '</div></div>';

    if (prox.length) {
      html += '<div class="sec-tit">Tus próximas horas</div>' + prox.slice(0, 3).map((h) => tarjetaHora(h, true)).join('');
    }
    if (yo.saldo > 0) html += '<div class="card"><div class="flex"><span style="font-size:28px">💰</span><div class="grow"><b>Tienes ' + C.plata(yo.saldo) + ' a favor</b><div class="sub muted">Se usa solo como abono en tu próxima reserva.</div></div></div></div>';
    html += '<div id="sellos"></div>';
    // Ofertas
    const of = B.ofertas || [];
    html += '<div class="sec-tit" id="ofertas">🏷️ Ofertas</div>';
    html += of.length ? of.map((o) =>
      '<div class="card oferta ' + (o.vip ? 'vip ' : '') + (o.bloqueada ? 'plata' : '') + '" data-of="' + o.id + '"><h2>' + (o.vip ? '⭐ ' : '') + esc(o.titulo) +
      (o.precio ? ' <span class="pill ok">' + esc(o.precio) + '</span>' : '') + '</h2>' +
      (o.bloqueada ? '<p class="muted" style="margin:0">Oferta exclusiva para clientes Premium.</p>' :
        (o.detalle ? '<p style="margin:0;white-space:pre-line">' + esc(o.detalle) + '</p>' : '') + (o.imagen ? '<img src="' + o.imagen + '" alt="">' : '') +
        (o.hasta ? '<p class="muted chico">Válida hasta el ' + P.fechaCorta(o.hasta + 'T12:00:00') + '</p>' : '')) + '</div>').join('')
      : '<div class="card empty"><span class="ico">🏷️</span>Pronto habrá ofertas.</div>';
    // Equipo
    html += '<div class="sec-tit">💈 Nuestro equipo</div><div class="card"><ul class="list">' + B.barberos.map((x) =>
      '<li>' + C.avatar(x) + '<div class="grow"><b>' + esc(x.nombre) + '</b>' + (x.descripcion ? '<div class="sub">' + esc(x.descripcion) + '</div>' : '') +
      (!x.reservable ? '<div class="sub">🔴 Agenda llena · escríbele por mensaje</div>' : '') + '</div>' +
      (yo.favorito === x.id ? '<span class="pill oro">❤️ Favorito</span>' : '') +
      '<button class="icono" data-chat="' + x.id + '" aria-label="Escribir">💬</button></li>').join('') + '</ul></div>';
    // Datos de la barbería
    const sem = b.horario || [];
    html += '<div class="sec-tit">📍 La barbería</div><div class="card">' + (b.direccion ? '<p style="margin-top:0">📍 ' + esc(b.direccion) + '</p>' : '') +
      '<table class="tabla">' + sem.map((d, i) => '<tr><td>' + C.DIAS_LARGO[i] + '</td><td>' + esc(A.horarioTxt(d)) + '</td></tr>').join('') + '</table>' +
      '<div class="btns">' + (b.whatsapp ? '<a class="btn wsp" target="_blank" rel="noopener" href="' + C.wa(b.whatsapp, 'Hola 👋') + '">💬 WhatsApp</a>' : '') +
      (b.direccion ? '<a class="btn gris" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(b.direccion) + '">🗺️ Cómo llegar</a>' : '') + '</div></div>';
    el.innerHTML = html;
    $('bAgendar').onclick = () => { location.hash = 'agendar'; };
    if ($('bRepetir')) $('bRepetir').onclick = () => {
      carro.clear();
      ultima.servicios.forEach((s) => { if (servicio(s.id)) carro.add(s.id); });
      if (barbero(ultima.barbero_id) && barbero(ultima.barbero_id).reservable) barberoSel = ultima.barbero_id;
      location.hash = 'agendar';
    };
    el.querySelectorAll('[data-chat]').forEach((x) => x.onclick = () => { location.hash = 'chat?con=' + x.dataset.chat; });
    el.querySelectorAll('.oferta.plata').forEach((x) => x.onclick = () => P.upsell('Ofertas VIP'));
    activarTarjetas(el);
    // Sellos (si la barbería es Premium)
    K.rpc('mis_sellos').then((s) => {
      if (!s) return;
      $('sellos').innerHTML = '<div class="card"><h2>🎟️ Tu tarjeta de sellos <span class="grow"></span><span class="pill">' + s.actual + ' / ' + s.meta + '</span></h2>' +
        '<div class="sellos">' + Array.from({ length: s.meta }, (_, i) => '<i class="' + (i < s.actual ? 'on' : '') + '">' + (i < s.actual ? '💈' : (i === s.meta - 1 ? '🎁' : '')) + '</i>').join('') + '</div>' +
        '<p class="muted chico">Al completar ' + s.meta + ' cortes, ¡el siguiente es gratis! ' + (s.premios ? 'Ya ganaste ' + s.premios + ' 🎉' : '') + '</p></div>';
    }).catch(() => {});
    Avisos.invitarPush(el);
  }

  // Tarjeta de una hora con sus acciones.
  function tarjetaHora(h, compacta) {
    const f = C.fechaDe(h.inicio);
    const futura = new Date(h.fin) > new Date();
    const activa = ACTIVA.includes(h.estado) && futura;
    let extra = '';
    if (h.estado === 'esperando_abono') extra = '<div class="banner alerta" style="margin:10px 0 0"><div class="grow">⏳ Sube el comprobante en <b data-reloj="' + h.expira_at + '">--:--</b> o la hora se libera.</div><button class="small" data-abonar="' + h.id + '">Abonar</button></div>';
    if (h.estado === 'en_revision' || h.estado === 'por_aprobar') extra = '<p class="muted chico" style="margin:8px 0 0">🧾 ' + (h.visto_barbero ? '<span class="ticks visto">✓✓</span> ' + esc(h.barbero) + ' vio tu comprobante. ' : '') +
      'Tu barbero está verificando el abono: apenas lo apruebe, tu hora queda agendada. Tu hora ya está guardada.</p>';
    if (h.estado === 'agendada' || h.estado === 'confirmada') extra = '<p class="chico" style="margin:8px 0 0;color:var(--ok)">✅ Agendada' + (h.confirmada_at ? ' el ' + C.cuando(h.confirmada_at) : '') + '. ¡Te esperamos!</p>';
    if (h.estado === 'anulada') extra = '<p class="muted chico" style="margin:8px 0 0">' + esc(h.motivo || 'Anulada') + (h.abono_destino === 'saldo' ? ' · abono a favor' : h.abono_destino === 'perdido' ? ' · abono perdido' :
      h.abono_destino === 'devolucion' ? ' · ' + (h.devolucion === 'devuelta' ? 'abono devuelto ✅' : 'te devolverán el abono') : '') + '</p>';
    if (h.estado === 'atendida' && !h.calificada && futura === false) extra = '<div class="btns"><button class="small alt" data-calificar="' + h.id + '">⭐ Calificar a la barbería</button></div>';
    return '<div class="card' + (compacta ? ' proxima' : '') + '"><div class="hora-card"><div class="fecha"><small>' + C.DIAS[C.dow(f) - 1] + '</small><b>' + (+f.slice(8)) + '</b><i>' + C.horaDe(h.inicio) + '</i></div>' +
      '<div class="grow"><b>' + esc(h.servicios.map((s) => s.nombre).join(' + ')) + '</b><div class="sub muted">con ' + esc(h.barbero) + ' · ' + C.plata(h.total) +
      (h.pagado_con === 'saldo' ? ' · abono con saldo' : h.abono && ['agendada', 'confirmada', 'por_aprobar', 'atendida'].includes(h.estado) ? ' · abonado ' + C.plata(h.abono) : '') + '</div>' +
      '<div style="margin-top:4px">' + A.estadoPill(h.estado) + (activa && compacta ? ' <span class="cuenta-reg" data-falta="' + h.inicio + '"></span>' : '') + '</div></div></div>' + extra +
      (activa ? '<div class="btns"><button class="small gris" data-escribir="' + h.id + '">💬 Escribir</button><button class="small gris" data-cal="' + h.id + '">📆 A mi calendario</button>' +
        (h.reagendable ? '<button class="small alt" data-reagendar="' + h.id + '">🔁 Reagendar</button>' : '') +
        (h.politica ? '<button class="small danger" data-anular="' + h.id + '">Anular</button>' : '') + '</div>' : '') + '</div>';
  }
  function activarTarjetas(el) {
    el.querySelectorAll('[data-abonar]').forEach((x) => x.onclick = () => abonar(horasMias.find((h) => h.id === x.dataset.abonar)));
    el.querySelectorAll('[data-anular]').forEach((x) => x.onclick = () => anular(horasMias.find((h) => h.id === x.dataset.anular)));
    el.querySelectorAll('[data-cal]').forEach((x) => x.onclick = () => alCalendario(horasMias.find((h) => h.id === x.dataset.cal)));
    el.querySelectorAll('[data-reagendar]').forEach((x) => x.onclick = () => reagendar(horasMias.find((h) => h.id === x.dataset.reagendar)));
    el.querySelectorAll('[data-calificar]').forEach((x) => x.onclick = () => calificar(horasMias.find((h) => h.id === x.dataset.calificar)));
    el.querySelectorAll('[data-escribir]').forEach((x) => x.onclick = () => {
      const h = horasMias.find((y) => y.id === x.dataset.escribir);
      mostrar('chat');
      Chat.abrir(h.barbero_id, barbero(h.barbero_id) || { nombre: h.barbero }, h.id);
    });
    relojes();
  }
  let relojTimer;
  function relojes() {
    clearInterval(relojTimer);
    const tick = () => {
      let vencio = false;
      document.querySelectorAll('[data-reloj]').forEach((x) => {
        const s = Math.max(0, Math.floor((new Date(x.dataset.reloj) - Date.now()) / 1000));
        x.textContent = C.pad(Math.floor(s / 60)) + ':' + C.pad(s % 60);
        if (!s) vencio = true;
      });
      document.querySelectorAll('[data-falta]').forEach((x) => {
        const s = Math.floor((new Date(x.dataset.falta) - Date.now()) / 1000);
        if (s <= 0) { x.textContent = '· ¡es ahora!'; return; }
        const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
        x.textContent = '· faltan ' + (d ? d + ' d ' : '') + (d || h ? h + ' h ' : '') + (d ? '' : m + ' min');
      });
      if (vencio) { clearInterval(relojTimer); setTimeout(async () => { await cargarHoras(); VISTAS[vistaActual](); }, 1500); }
    };
    tick();
    relojTimer = setInterval(tick, 1000);
  }

  /* ---------- Agendar ---------- */
  async function agendar() {
    const el = $('v-agendar');
    el.innerHTML = '<p class="muted centro">Cargando calendario…</p>';
    try { await cargarDatos(true); } catch (e) { el.innerHTML = '<div class="card err">' + esc(e.message) + '</div>'; return; }
    if (!barberoSel || !barbero(barberoSel) || !barbero(barberoSel).reservable) {
      const fav = yo.favorito && barbero(yo.favorito) && barbero(yo.favorito).reservable ? yo.favorito : null;
      barberoSel = fav || (reservables().length > 1 ? '*' : (reservables()[0] || {}).id || null);
    }
    pintarAgendar();
  }

  function pintarAgendar() {
    const el = $('v-agendar');
    const b = bar();
    const cats = [...new Set(B.servicios.map((s) => s.categoria || ''))];
    let html = '<div class="paso"><span class="n">1</span><b>Elige tus servicios</b></div>';
    if (!B.servicios.length) html += '<div class="card empty"><span class="ico">✂️</span>La barbería aún no publica sus servicios.</div>';
    cats.forEach((cat) => {
      if (cat) html += '<div class="sec-tit">' + esc(cat) + '</div>';
      html += B.servicios.filter((s) => (s.categoria || '') === cat).map((s) =>
        '<div class="serv' + (carro.has(s.id) ? ' en-carro' : '') + '" data-s="' + s.id + '"><span class="foto" style="' + C.fondo(s.foto) + '">' + (s.foto ? '' : '✂️') + '</span>' +
        '<div class="grow"><b>' + esc(s.nombre) + '</b><span class="sub muted">' + s.duracion + ' min' + (s.descripcion ? ' · ' + esc(s.descripcion) : '') + '</span></div>' +
        '<div style="text-align:right"><div class="precio-s">' + C.plata(s.precio) + '</div><button class="small ' + (carro.has(s.id) ? 'ok' : 'alt') + '">' + (carro.has(s.id) ? '✓' : '+ Agregar') + '</button></div></div>').join('');
    });
    html += '<div class="paso"><span class="n">2</span><b>Elige tu barbero</b></div><div class="barberos">';
    if (reservables().length > 1) html += '<button class="barb' + (barberoSel === '*' ? ' on' : '') + '" data-b="*"><span class="av">🎲</span>El que esté libre<small>más horas</small></button>';
    html += B.barberos.map((x) => '<button class="barb' + (barberoSel === x.id ? ' on' : '') + (x.reservable ? '' : ' cerrada') + '" data-b="' + x.id + '">' + C.avatar(x, yo.favorito === x.id ? 'premium' : '') +
      esc(x.nombre.split(' ')[0]) + '<small>' + (x.reservable ? (yo.favorito === x.id ? '❤️ favorito' : 'disponible') : '🔴 agenda llena') + '</small></button>').join('');
    html += '</div>';
    html += '<div class="paso"><span class="n">3</span><b class="grow">Elige día y hora</b></div>' +
      '<div class="seg" style="margin-bottom:10px"><button data-vista="dia">Día</button><button data-vista="semana">Semana</button><button data-vista="mes">Mes</button></div>' +
      '<div id="cal"></div><div class="leyenda"><span class="l">Libre</span><span class="o">Ocupado</span><span class="m">Mía</span></div>' +
      '<p class="muted chico">Abono para reservar: <b>' + C.plata(b.abono) + '</b> (se descuenta del total). Reservas hasta ' + diasMax() + ' días adelante' + (prem() ? '' : ' · <a href="#plan">Premium: ' + K.limite('dias', true) + '</a>') + '.</p>';
    el.innerHTML = html;
    el.querySelectorAll('.serv').forEach((x) => x.onclick = () => {
      const id = x.dataset.s;
      if (carro.has(id)) carro.delete(id); else carro.add(id);
      pintarAgendar();
    });
    el.querySelectorAll('[data-b]').forEach((x) => x.onclick = () => {
      const id = x.dataset.b;
      if (id !== '*' && !barbero(id).reservable) {
        C.confirmar(barbero(id).nombre + ' tiene la agenda llena por ahora. Puedes reservar con otro barbero o escribirle para coordinar.', { si: '💬 Escribirle', no: 'Elegir otro', titulo: '🔴 Agenda llena' })
          .then((ok) => { if (ok) { location.hash = 'chat?con=' + id; } });
        return;
      }
      barberoSel = id; pintarAgendar();
    });
    el.querySelectorAll('[data-vista]').forEach((x) => { x.classList.toggle('on', x.dataset.vista === vista); x.onclick = () => { vista = x.dataset.vista; pintarAgendar(); }; });
    pintarCalendario();
    barraCarro();
  }

  function barraCarro() {
    const bb = $('carroBarra');
    if (!carro.size || vistaActual !== 'agendar') { bb.classList.add('hidden'); return; }
    bb.classList.remove('hidden');
    bb.innerHTML = '<div class="grow"><b>🛒 ' + carro.size + ' servicio' + (carro.size > 1 ? 's' : '') + ' · ' + C.plata(carroTotal()) + '</b><small>' + carroDur() + ' min · elige una hora abajo 👇</small></div>' +
      '<button class="small gris" id="bVaciar" style="background:transparent;color:inherit;border-color:rgba(255,255,255,.3)">Vaciar</button>';
    $('bVaciar').onclick = () => { carro.clear(); pintarAgendar(); };
  }

  // Horas de un día: combina los barberos si eligió "el que esté libre".
  // Minutos que bloquea el carrito con un barbero (sus tiempos + su descanso).
  const durCon = (x) => (carro.size ? A.duracion(x, carroItems()) : 0) || Math.min(...B.servicios.map((s) => s.duracion), 30) + (+x.descanso || 0);
  function horasDe(f) {
    const ids = barberoSel === '*' ? reservables().map((x) => x.id) : [barberoSel];
    const porMin = new Map();
    ids.forEach((id) => {
      const x = barbero(id);
      if (!x) return;
      if (![...carro].every((sid) => { const s = servicio(sid); return !s || !s.barberos || !s.barberos.length || s.barberos.includes(id); })) return;
      A.horas({ f, barbero: id, dur: durCon(x), datos, horario: x.horario, paso: x.paso }).forEach((s) => {
        const prev = porMin.get(s.min);
        const rank = { mia: 4, libre: 3, ocupado: 1 };
        if (!prev || rank[s.estado] > rank[prev.estado]) porMin.set(s.min, Object.assign({ barbero: id }, s));
      });
    });
    return [...porMin.values()].sort((a, b) => a.min - b.min);
  }
  function infoDia(f) {
    const ids = barberoSel === '*' ? reservables().map((x) => x.id) : [barberoSel];
    const ll = A.llenado(ids.filter(Boolean), f, datos, horarios());
    ll.mio = (datos.reservas || []).some((r) => r.mia && ACTIVA.includes(r.estado) && C.fechaDe(r.inicio) === f);
    return ll;
  }

  function pintarCalendario() {
    const cal = $('cal');
    if (!barberoSel) { cal.innerHTML = '<div class="card empty"><span class="ico">💈</span>Todos los barberos tienen la agenda llena por ahora. Escríbele a la barbería o vuelve más tarde.</div>'; return; }
    const lim = C.sumarDias(C.hoy(), diasMax());
    if (fechaSel < C.hoy()) fechaSel = C.hoy();
    if (vista === 'dia') {
      cal.innerHTML = '<div class="dias" id="tira"></div><div class="card" id="slots"></div>';
      A.tiraDias($('tira'), { cuantos: ventana(), sel: fechaSel, info: infoDia, alElegir: (f) => { fechaSel = f; pintarCalendario(); } });
      // Días más allá del límite: plateados (Premium).
      $('tira').querySelectorAll('.dia').forEach((d) => { if (d.dataset.f > lim) P.bloquear(d, 'Reservar hasta ' + K.limite('dias', true) + ' días adelante'); });
      const s = horasDe(fechaSel);
      const dh = A.diaHorario(barberoSel === '*' ? (reservables()[0] || {}).horario : barbero(barberoSel).horario, fechaSel);
      let h = '<h2>' + C.fechaLarga(fechaSel) + '</h2>';
      if (!s.length) h += '<div class="empty"><span class="ico">' + (dh.e === 'x' ? '🚪' : '😕') + '</span>' + (dh.e === 'x' ? 'Ese día no se atiende.' : 'No quedan horas este día.') + '</div>';
      else h += '<div class="slots">' + s.map((x) => '<button class="slot ' + x.estado + '" data-m="' + x.min + '"' + (x.estado === 'ocupado' ? ' disabled' : '') + '>' + x.hhmm + '</button>').join('') + '</div>';
      const libres = s.filter((x) => x.estado === 'libre').length;
      if (s.length && !libres) h += '<div class="btns"><button class="alt full" id="bEspera">🔔 Avísame si se libera una hora</button></div>';
      $('slots').innerHTML = h;
      $('slots').querySelectorAll('.slot:not([disabled])').forEach((b) => b.onclick = () => {
        const x = s.find((y) => y.min === +b.dataset.m);
        if (x.estado === 'mia') { location.hash = 'horas'; return; }
        confirmar(x, fechaSel);
      });
      if ($('bEspera')) {
        if (!K.clienteTiene('lista_espera')) P.bloquear($('bEspera'), 'Lista de espera');
        else $('bEspera').onclick = (ev) => C.accion(ev.target, () => K.rpc('unirse_espera', { p_fecha: fechaSel, p_barbero: barberoSel === '*' ? null : barberoSel }), '🔔 Te avisaremos si se libera una hora');
      }
    } else if (vista === 'semana') {
      const id = barberoSel === '*' ? (reservables()[0] || {}).id : barberoSel;
      const ini = fechaSel;
      cal.innerHTML = '<div class="flex" style="margin-bottom:8px"><button class="icono" id="sAnt">‹</button><b class="grow centro">' + C.diaCorto(ini) + ' – ' + C.diaCorto(C.sumarDias(ini, 6)) + '</b><button class="icono" id="sSig">›</button></div>' +
        (barberoSel === '*' ? '<p class="muted chico">Mostrando la agenda de ' + esc(barbero(id).nombre) + '. Elige un barbero para ver la suya.</p>' : '') + '<div id="tl"></div>' +
        '<p class="muted chico">Toca un espacio libre para reservar.</p>';
      $('sAnt').onclick = () => { fechaSel = C.sumarDias(fechaSel, -7) < C.hoy() ? C.hoy() : C.sumarDias(fechaSel, -7); pintarCalendario(); };
      $('sSig').onclick = () => { fechaSel = C.sumarDias(fechaSel, 7); pintarCalendario(); };
      const cols = [];
      for (let i = 0; i < 7; i++) { const f = C.sumarDias(ini, i); cols.push({ f, barbero: id, titulo: C.diaCorto(f), hoy: f === C.hoy() }); }
      A.timeline($('tl'), { cols, datos, horarios: horarios(), ancho: 74,
        alBloque: () => { location.hash = 'horas'; },
        alLibre: (c, m) => {
          const s = horasDe(c.f).find((x) => x.min >= m && x.min < m + 30 && x.estado === 'libre');
          if (!s) return C.toast('Esa hora no está disponible para tu cita');
          if (c.f > lim) return P.upsell('Reservar hasta ' + K.limite('dias', true) + ' días adelante');
          confirmar(s, c.f);
        } });
    } else {
      const [y, m] = mesSel.split('-').map(Number);
      cal.innerHTML = '<div class="flex" style="margin-bottom:8px"><button class="icono" id="mAnt">‹</button><b class="grow centro">' + C.MESES[m - 1][0].toUpperCase() + C.MESES[m - 1].slice(1) + ' ' + y + '</b><button class="icono" id="mSig">›</button></div><div id="mes"></div>' +
        '<p class="muted chico">La barrita muestra qué tan lleno está cada día. Toca un día para ver sus horas.</p>';
      const mover = (n) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); mesSel = d.getUTCFullYear() + '-' + C.pad(d.getUTCMonth() + 1); pintarCalendario(); };
      $('mAnt').onclick = () => mover(-1);
      $('mSig').onclick = () => mover(1);
      A.mes($('mes'), { mes: mesSel, info: (f) => (f < C.hoy() || f > C.sumarDias(C.hoy(), ventana()) ? { cerrado: f < C.hoy() } : infoDia(f)),
        alDia: (f) => { if (f < C.hoy()) return; if (f > lim) return P.upsell('Reservar hasta ' + K.limite('dias', true) + ' días adelante'); fechaSel = f; vista = 'dia'; pintarAgendar(); } });
    }
  }

  // Resumen antes de reservar.
  function confirmar(slot, f) {
    if (!carro.size) {
      C.toast('👆 Primero agrega un servicio al carrito');
      $('v-agendar').querySelector('.serv') && $('v-agendar').querySelector('.serv').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const b = bar();
    const x = barbero(slot.barbero || barberoSel);
    const items = carroItems();
    const usaSaldo = b.abono === 0 || yo.saldo >= b.abono;
    const h = C.hoja('<h2>📅 Confirma tu hora</h2><div class="hora-card" style="margin-bottom:12px"><div class="fecha"><small>' + C.DIAS[C.dow(f) - 1] + '</small><b>' + (+f.slice(8)) + '</b><i>' + slot.hhmm + '</i></div>' +
      '<div class="grow"><b>' + C.fechaLarga(f) + ', ' + slot.hhmm + '</b><div class="muted">con ' + esc(x.nombre) + ' · hasta las ' + C.horaDe(new Date(slot.t.getTime() + durCon(x) * 60000)) + '</div></div></div>' +
      '<div class="resumen-carro">' + items.map((s) => '<div><span>' + esc(s.nombre) + '</span><span>' + C.plata(s.precio) + '</span></div>').join('') +
      '<div style="border-top:1px solid var(--line);padding-top:6px"><b>Total</b><b>' + C.plata(carroTotal()) + '</b></div>' +
      '<div><span>Abono ahora ' + (usaSaldo ? '(con tu saldo a favor)' : '') + '</span><b>' + C.plata(b.abono) + '</b></div>' +
      '<div class="muted"><span>Pagas en la barbería</span><span>' + C.plata(Math.max(0, carroTotal() - b.abono)) + '</span></div></div>' +
      '<p class="muted chico">' + (usaSaldo ? 'Usaremos tu saldo a favor como abono.' : esc(K.texto('reserva_pago'))) + '</p>' +
      '<p class="muted chico">' + esc(K.texto('reserva_politica')) + '</p>' +
      '<div class="btns"><button class="grande full" data-ok>' + (usaSaldo ? '✅ Reservar' : '✅ Reservar y abonar') + '</button></div>');
    h.q('[data-ok]').onclick = (ev) => C.accion(ev.target, async () => {
      const r = await K.rpc('reservar', { p_barbero: x.id, p_inicio: slot.t.toISOString(), p_servicios: [...carro] });
      h.cerrar();
      carro.clear();
      await Promise.all([cargarHoras(), cargarDatos(true), K.refrescar().then((a) => { if (a) yo = a; })]);
      K.despertarEnvios();
      const mia = horasMias.find((y) => y.id === r.id) || Object.assign({ barbero: x.nombre, barbero_id: x.id }, r);
      if (r.estado === 'esperando_abono') abonar(mia); else listo(mia);
      if (vistaActual === 'agendar') pintarAgendar();
    }).catch(async () => { await cargarDatos(true); pintarCalendario(); });
  }

  // Abonar: link de pago o transferencia + foto del comprobante → "Ya aboné".
  function abonar(hr) {
    if (!hr) return;
    const b = bar();
    let comprobante = null, medio = b.link_pago ? 'link' : 'transferencia';
    const h = C.hoja('<h2>💳 Abona para asegurar tu hora</h2><div class="reloj" data-reloj="' + hr.expira_at + '">--:--</div>' +
      '<p class="muted centro chico" style="margin-top:0">tienes este tiempo para abonar ' + C.plata(hr.abono || b.abono) + '</p>' +
      '<div class="card" style="box-shadow:none"><b>1. Paga ' + C.plata(hr.abono || b.abono) + '</b>' + (b.abono_texto ? '<div class="muted chico">' + esc(b.abono_texto) + '</div>' : '') + '<div class="btns" style="flex-direction:column">' +
      (b.link_pago ? '<a class="btn oro full" target="_blank" rel="noopener" href="' + esc(b.link_pago) + '" data-link>💳 Pagar con link de pago</a>' : '') +
      (b.datos_transferencia ? '<button class="gris full" data-tr>🏦 Transferencia: ver datos</button><div class="hidden muted" data-trd style="white-space:pre-line;padding:10px;background:var(--field);border-radius:12px">' + esc(b.datos_transferencia) +
        '<br><button class="small alt" data-copiar style="margin-top:8px">📋 Copiar datos</button></div>' : '') +
      (!b.link_pago && !b.datos_transferencia ? '<p class="err">La barbería aún no configura cómo recibir abonos. Escríbele por el chat.</p>' : '') + '</div></div>' +
      '<div class="card" style="box-shadow:none"><b>2. Sube la foto del comprobante</b><p class="muted chico" style="margin:4px 0 0">Al subirla el reloj se detiene y tu hora queda guardada mientras tu barbero verifica el pago.</p>' +
      '<div class="btns"><button class="alt" data-foto>📷 Subir comprobante</button></div><img class="comprobante-prev hidden" data-prev alt="Comprobante"></div>' +
      '<div class="btns"><button class="grande full ok" data-listo disabled>✅ Ya aboné</button></div>' +
      '<p class="muted chico centro">Si cambiaste de idea, cierra esta ventana: la hora se libera sola.</p>');
    relojes();
    if (h.q('[data-link]')) h.q('[data-link]').onclick = () => { medio = 'link'; };
    if (h.q('[data-tr]')) h.q('[data-tr]').onclick = () => { medio = 'transferencia'; h.q('[data-trd]').classList.toggle('hidden'); };
    if (h.q('[data-copiar]')) h.q('[data-copiar]').onclick = () => C.copiar(b.datos_transferencia + '\nMonto: ' + C.plata(hr.abono || b.abono));
    h.q('[data-foto]').onclick = async () => {
      const img = await C.elegirImagen(1000, 0.6);
      if (!img) return;
      comprobante = img;
      const p = h.q('[data-prev]'); p.src = img; p.classList.remove('hidden');
      h.q('[data-listo]').disabled = false;
      h.q('[data-foto]').textContent = '📷 Cambiar foto';
    };
    h.q('[data-listo]').onclick = (ev) => C.accion(ev.target, async () => {
      await K.rpc('ya_abone', { p_reserva: hr.id, p_comprobante: comprobante, p_medio: medio });
      h.cerrar();
      K.despertarEnvios();
      await cargarHoras();
      listo(horasMias.find((x) => x.id === hr.id) || hr);
      VISTAS[vistaActual]();
    });
  }

  function listo(hr) {
    const b = bar();
    const f = C.fechaDe(hr.inicio);
    const titulo = '💈 ' + hr.servicios.map((s) => s.nombre).join(' + ') + ' · ' + (b.nombre || 'Barbería');
    const rev = hr.estado === 'en_revision' || hr.estado === 'por_aprobar';
    const h = C.hoja('<div class="centro"><div style="font-size:56px">' + (rev ? '🧾' : '✅') + '</div><h2 style="justify-content:center">' +
      (rev ? '¡Comprobante enviado!' : '¡Tu hora quedó agendada!') + '</h2>' +
      '<p><b>' + C.fechaLarga(f) + ', ' + C.horaDe(hr.inicio) + '</b><br>con ' + esc(hr.barbero) + '</p>' +
      '<p class="muted">' + (rev ? esc(K.texto('reserva_revision')) + ' Te llega un aviso 🔔.' : 'Tu barbero ya recibió el aviso. ¡Te esperamos!') + '</p></div>' +
      '<div class="btns" style="flex-direction:column"><a class="btn gris full" target="_blank" rel="noopener" data-g>📆 Agregar a Google Calendar</a>' +
      '<button class="gris full" data-ics>📲 Agregar al calendario del celular</button>' +
      (b.whatsapp ? '<a class="btn wsp full" target="_blank" rel="noopener" data-w>💬 Avisar por WhatsApp</a>' : '') +
      '<button class="full" data-ver>Ver mis horas</button></div>');
    h.q('[data-g]').href = C.googleCal(titulo, hr.inicio, hr.fin, b.direccion);
    h.q('[data-ics]').onclick = () => C.ics(titulo, hr.inicio, hr.fin, b.direccion);
    if (h.q('[data-w]')) h.q('[data-w]').href = C.wa(b.whatsapp, 'Hola 👋 Soy ' + yo.nombre + '. Reservé ' + hr.servicios.map((s) => s.nombre).join(' + ') +
      ' para el ' + C.fechaLarga(f) + ' a las ' + C.horaDe(hr.inicio) + ' con ' + hr.barbero + '. ' + (hr.pagado_con === 'saldo' ? 'Usé mi saldo a favor como abono.' : 'Ya envié el comprobante del abono por la app.'));
    h.q('[data-ver]').onclick = () => { h.cerrar(); location.hash = 'horas'; };
  }

  function alCalendario(hr) {
    const b = bar();
    const titulo = '💈 ' + hr.servicios.map((s) => s.nombre).join(' + ') + ' · ' + (b.nombre || 'Barbería');
    const h = C.hoja('<h2>📆 Agregar a mi calendario</h2><div class="btns" style="flex-direction:column"><a class="btn gris full" target="_blank" rel="noopener" data-g>Google Calendar</a><button class="gris full" data-ics>Calendario del celular (.ics)</button></div>');
    h.q('[data-g]').href = C.googleCal(titulo, hr.inicio, hr.fin, b.direccion);
    h.q('[data-ics]').onclick = () => C.ics(titulo, hr.inicio, hr.fin, b.direccion);
  }

  async function anular(hr) {
    const msg = {
      libre: 'Tu hora del ' + C.cuando(hr.inicio) + ' quedará libre.',
      devolucion: 'Estás dentro de los primeros ' + K.regla('minutos_devolucion') + ' minutos ✅ La barbería te devolverá el abono de ' + C.plata(hr.abono) + '.',
      saldo: 'Estás a tiempo ✅ Tu abono de ' + C.plata(hr.abono) + ' quedará como saldo a favor para tu próxima reserva.',
      pierde: '⚠️ Faltan menos de ' + K.regla('horas_cancelacion') + ' horas. Si anulas, pierdes el abono de ' + C.plata(hr.abono) + '.'
    }[hr.politica] || 'Anular tu hora del ' + C.cuando(hr.inicio) + '.';
    if (!await C.confirmar(msg, { titulo: 'Anular hora', si: 'Anular hora', no: 'Mantener', peligro: true })) return;
    try {
      const r = await K.rpc('anular_mia', { p_reserva: hr.id });
      K.despertarEnvios();
      C.toast(r.abono_destino === 'saldo' ? '💰 Hora anulada. Tu abono quedó a favor' : r.abono_destino === 'devolucion' ? '💸 Hora anulada. Te devolverán el abono' : 'Hora anulada');
      await Promise.all([cargarHoras(), K.refrescar().then((a) => { if (a) yo = a; })]);
      datosRango = '';
      VISTAS[vistaActual]();
    } catch (e) { C.toast('⚠️ ' + e.message, 4000); }
  }

  // Reagendar con el mismo barbero (con X horas de anticipación, según las reglas).
  async function reagendar(hr) {
    const dur = Math.round((new Date(hr.fin) - new Date(hr.inicio)) / 60000);
    const x = barbero(hr.barbero_id) || { horario: null };
    let f = C.fechaDe(hr.inicio);
    const h = C.hoja('<h2>🔁 Reagendar</h2><p class="muted" style="margin-top:-6px">Con ' + esc(hr.barbero) + ' · ' + dur + ' min. Elige el nuevo día y hora.</p><div class="dias" data-tira></div><div data-slots></div>');
    try { await cargarDatos(true); } catch (e) { h.q('[data-slots]').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
    const pintarH = () => {
      A.tiraDias(h.q('[data-tira]'), { cuantos: diasMax() + 1, sel: f, info: (d) => A.llenado([hr.barbero_id], d, datos, horarios()), alElegir: (d) => { f = d; pintarH(); } });
      const s = A.horas({ f, barbero: hr.barbero_id, dur, datos, horario: x.horario, paso: x.paso });
      h.q('[data-slots]').innerHTML = '<h3>' + C.fechaLarga(f) + '</h3>' + (s.length ? '<div class="slots">' + s.map((y) => '<button class="slot ' + y.estado + '" data-m="' + y.min + '"' +
        (y.estado !== 'libre' ? ' disabled' : '') + '>' + y.hhmm + '</button>').join('') + '</div>' : '<div class="empty"><span class="ico">😕</span>No hay horas este día.</div>');
      h.qa('.slot:not([disabled])').forEach((b) => b.onclick = async () => {
        const y = s.find((z) => z.min === +b.dataset.m);
        if (!await C.confirmar('Cambiar tu hora al ' + C.fechaLarga(f) + ' a las ' + y.hhmm + '.', { titulo: '🔁 Reagendar', si: 'Sí, cambiar' })) return;
        try {
          await K.rpc('reagendar_mia', { p_reserva: hr.id, p_inicio: y.t.toISOString() });
          h.cerrar(); K.despertarEnvios(); C.toast('🔁 ¡Listo! Tu hora cambió');
          await cargarHoras(); datosRango = ''; VISTAS[vistaActual]();
        } catch (e) { C.toast('⚠️ ' + e.message, 4500); }
      });
    };
    pintarH();
  }

  function calificar(hr) {
    let n = 0;
    const h = C.hoja('<h2>⭐ ¿Cómo te atendieron?</h2><p class="muted" style="margin-top:-6px">' + esc(hr.servicios.map((s) => s.nombre).join(' + ')) + ' con ' + esc(hr.barbero) + ' · ' + C.cuando(hr.inicio) + '</p>' +
      '<div class="centro"><div class="estrellas grande">' + [1, 2, 3, 4, 5].map((i) => '<button type="button" data-n="' + i + '">★</button>').join('') + '</div></div>' +
      '<textarea data-c maxlength="300" placeholder="Comentario (opcional, solo lo ve la barbería)"></textarea><div class="btns"><button class="full" data-ok disabled>Enviar</button></div>');
    h.qa('[data-n]').forEach((b) => b.onclick = () => { n = +b.dataset.n; h.qa('[data-n]').forEach((x) => x.classList.toggle('on', +x.dataset.n <= n)); h.q('[data-ok]').disabled = false; });
    h.q('[data-ok]').onclick = (ev) => C.accion(ev.target, async () => {
      await K.rpc('calificar_barberia', { p_reserva: hr.id, p_estrellas: n, p_comentario: h.q('[data-c]').value });
      h.cerrar(); await cargarHoras(); VISTAS[vistaActual]();
    }, '⭐ ¡Gracias por calificar!');
  }

  /* ---------- Mis horas ---------- */
  async function pintarHoras() {
    const el = $('v-horas');
    await cargarHoras();
    const ahora = new Date();
    const prox = horasMias.filter((h) => new Date(h.fin) > ahora && h.estado !== 'anulada').sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
    const hist = horasMias.filter((h) => !(new Date(h.fin) > ahora && h.estado !== 'anulada'));
    el.innerHTML = '<div class="card"><h2><span class="grow">🗓️ Mis horas</span><button class="small" id="bNueva">+ Agendar</button></h2>' +
      '<p class="muted chico" style="margin:0">Horas activas: ' + prox.filter((h) => ACTIVA.includes(h.estado)).length + ' de ' + K.limite('activas', prem()) + (prem() ? '' : ' · <a href="#plan">Premium: hasta ' + K.limite('activas', true) + '</a>') + '</p></div>' +
      (prox.length ? prox.map((h) => tarjetaHora(h, true)).join('') : '<div class="card empty"><span class="ico">📅</span>No tienes horas próximas.</div>') +
      (hist.length ? '<div class="sec-tit">Historial</div>' + hist.slice(0, 30).map((h) => tarjetaHora(h)).join('') : '');
    $('bNueva').onclick = () => { location.hash = 'agendar'; };
    activarTarjetas(el);
  }

  /* ---------- Perfil ---------- */
  function perfil() {
    const opciones = reservables().map((x) => '<option value="' + x.id + '"' + (yo.favorito === x.id ? ' selected' : '') + '>' + esc(x.nombre) + '</option>').join('');
    P.perfil($('v-perfil'), {
      extraPerfil: '<label>❤️ Barbero favorito <span class="opc">(se elige solo al agendar)</span></label><div id="favWrap"><select id="selFav"><option value="">Ninguno</option>' + opciones + '</select></div>',
      tour: (f) => P.tour(PASOS, f),
      alGuardar: async () => { yo = K.cuenta; }
    });
    setTimeout(() => {
      const sel = $('selFav');
      if (!sel) return;
      if (!K.clienteTiene('favorito')) { sel.disabled = true; P.bloquear($('favWrap'), 'Barbero favorito'); return; }
      sel.onchange = () => K.rpc('guardar_perfil', { p: { favorito: sel.value } }).then(() => { yo.favorito = sel.value || null; C.toast('❤️ Guardado'); }).catch((e) => C.toast('⚠️ ' + e.message));
    }, 50);
  }

  const PASOS = [
    ['✂️', 'Elige tu corte', 'Agrega uno o más servicios al carrito. Verás el precio y cuánto dura.'],
    ['📅', 'Elige tu hora', 'Escoge tu barbero y una hora libre. Lo ocupado sale tachado, sin nombres: nadie ve tus datos.'],
    ['💳', 'Abona y listo', 'Abona ' + C.plata(bar().abono) + ' con el link o por transferencia y sube el comprobante. Tu hora queda guardada mientras tu barbero lo revisa; al aprobarlo te llega un aviso 🔔.']
  ];

  // Arranque
  try { await Promise.all([cargarBarberia(), cargarHoras()]); } catch (e) { C.toast('⚠️ ' + e.message, 5000); }
  ruta();
  P.tour(PASOS);
  K.revisarActualizacion();
  K.ajustes();
  setInterval(() => { if (!document.hidden && vistaActual === 'agendar') cargarDatos(true).then(pintarCalendario).catch(() => {}); }, 60000);
})();
