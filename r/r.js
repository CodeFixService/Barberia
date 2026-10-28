/* Link personal de la reserva (sin cuenta): pagar el abono, subir el comprobante, ver el estado, cancelar, reagendar y calificar. */
(async function () {
  'use strict';
  const C = Core, K = Cuenta, A = Agenda;
  const $ = C.$, esc = C.esc;
  C.registrarSW();

  const params = new URLSearchParams(location.search);
  const token = params.get('t') || '';
  const app = $('app');
  const mostrar = (html) => { $('cargando').classList.add('hidden'); app.classList.remove('hidden'); app.innerHTML = html; };
  if (!K.listo) { $('cargando').textContent = 'Falta configurar el servidor.'; return; }
  try { await K.ajustes(); } catch (e) { /* usa lo guardado */ }

  let R = null, header = null, timer = null;

  async function cargar() {
    try { R = await K.rpc('reserva_ver', { p_token: token }); } catch (e) { mostrar('<div class="card err">' + esc(e.message) + '</div>'); return false; }
    if (!R) {
      mostrar('<div class="card centro" style="margin-top:14vh"><div style="font-size:48px">🤔</div><h2 style="justify-content:center">No encontramos esta reserva</h2>' +
        '<p class="muted">Revisa que el link esté completo.</p></div>');
      return false;
    }
    guardarToken();
    return true;
  }
  function guardarToken() {
    const lista = (C.leer('tokens', []) || []).filter((y) => y.token !== token);
    lista.unshift({ token, codigo: R.barberia.codigo, inicio: R.inicio, fin: R.fin,
      texto: (R.servicios || []).map((s) => s.nombre).join(' + ') + ' con ' + R.barbero.nombre });
    C.guardar('tokens', lista.slice(0, 20));
  }

  function encabezado() {
    if (header) header.remove();
    const b = R.barberia;
    if (b.color) C.aplicarColor(b.color);
    header = document.createElement('header');
    header.className = 'top';
    header.innerHTML = '<span class="logo' + (b.logo ? ' img' : '') + '" style="' + C.fondo(b.logo) + '">' + (b.logo ? '' : '💈') + '</span>' +
      '<div class="tit"><b>' + esc(b.nombre) + '</b><small>Tu reserva</small></div>' +
      '<a class="btn small gris" href="../b/?b=' + esc(b.codigo) + '">+ Reservar</a>';
    document.body.prepend(header);
    document.title = 'Tu reserva · ' + b.nombre;
  }

  const ICONO = { esperando_abono: '💳', en_revision: '🧾', agendada: '✅', atendida: '💈', no_vino: '🚫', anulada: '❌' };
  const TITULO = { esperando_abono: 'Paga el abono para asegurar tu hora', en_revision: 'Tu abono está en revisión', agendada: '¡Tu hora está agendada!',
    atendida: '¡Gracias por venir!', no_vino: 'No llegaste a tu hora', anulada: 'Hora anulada' };

  function pintar() {
    clearInterval(timer);
    const b = R.barberia;
    const f = C.fechaDe(R.inicio);
    const serv = (R.servicios || []).map((s) => s.nombre).join(' + ');
    const pasos = ['Reservaste', 'Abono pagado', 'Revisión del abono', 'Agendada'];
    const nivel = { esperando_abono: 2, en_revision: 3, agendada: 5, atendida: 5, no_vino: 5 }[R.estado] || 0;
    let html = '';
    if (params.get('nueva') && R.estado === 'esperando_abono') html += '<div class="banner marca"><div class="grow"><b>🎉 ¡Reservaste!</b><br><span class="chico">Guarda este link: aquí sigues tu hora.</span></div></div>';
    html += '<div class="card centro"><div style="font-size:50px">' + (ICONO[R.estado] || '📅') + '</div><h2 style="justify-content:center;margin-top:0">' + esc(TITULO[R.estado] || 'Tu reserva') + '</h2>' +
      '<div>' + A.estadoPill(R.estado) + '</div>';
    if (R.estado === 'esperando_abono') html += '<div class="reloj-grande" data-reloj="' + R.expira_at + '">--:--</div><p class="muted chico" style="margin-top:0">' + esc(K.texto('reserva_pago')) + '</p>';
    if (R.estado === 'en_revision') html += '<p class="muted">' + esc(K.texto('reserva_revision')) + '</p><p class="muted chico">Esta página se actualiza sola. Puedes cerrarla y volver con tu link.</p>';
    if (R.estado === 'anulada') {
      html += '<p class="muted" style="margin-bottom:0">' + esc(R.motivo || 'Anulada') + '</p>';
      if (R.abono_destino === 'saldo') html += '<p><b>💰 Tu abono de ' + C.plata(R.abono) + ' quedó como saldo a favor</b>' + (R.saldo_hasta ? '<br><span class="muted chico">Úsalo para reagendar antes del ' + C.cuando(R.saldo_hasta).split(' · ')[0] + '</span>' : '') + '</p>';
      if (R.abono_destino === 'devolucion') html += '<p><b>💸 La barbería te devolverá ' + C.plata(R.abono) + '</b><br><span class="muted chico">' + (R.devolucion === 'devuelta' ? '✅ Ya lo marcó como devuelto.' :
        R.sin_verificar ? 'Primero revisa que le haya llegado tu transferencia y después te la devuelve.' : 'Te lo transfiere a la brevedad.') + '</span></p>';
      if (R.devolucion === 'no_llego') html += '<p><b>La barbería no recibió tu transferencia</b><br><span class="muted chico">Por eso no hay devolución. Si fue un error, escríbele con tu comprobante.</span></p>';
      if (R.abono_destino === 'perdido' && R.devolucion !== 'no_llego') html += '<p class="muted chico">El abono no se devuelve (se anuló fuera de plazo).</p>';
    }
    if (R.estado === 'no_vino') html += '<p class="muted">El abono no se devuelve. Si fue un error, escríbele a la barbería.</p>';
    html += '</div>';
    if (nivel) html += '<div class="card"><div class="pasos-reserva">' + pasos.map((p, i) => '<div class="' + (i + 1 < nivel ? 'hecho' : i + 1 === nivel ? 'on' : '') + '"><i>' + (i + 1 < nivel ? '✓' : i + 1) + '</i>' + p + '</div>').join('') + '</div></div>';
    // Detalle
    html += '<div class="card"><div class="hora-card"><div class="fecha"><small>' + C.DIAS[C.dow(f) - 1] + '</small><b>' + (+f.slice(8)) + '</b><i>' + C.horaDe(R.inicio) + '</i></div>' +
      '<div class="grow"><b>' + C.fechaLarga(f) + ', ' + C.horaDe(R.inicio) + '</b><div class="muted">' + esc(serv) + ' con ' + esc(R.barbero.nombre) + '</div></div></div>' +
      '<div class="det-fila"><span>👤 A nombre de</span><b>' + esc(R.nombre || '') + '</b></div>' +
      '<div class="det-fila"><span>💵 Total</span><b>' + C.plata(R.total) + '</b></div>' +
      (R.abono ? '<div class="det-fila"><span>💳 Abono</span><b>' + C.plata(R.abono) + '</b></div><div class="det-fila"><span>Pagas en la barbería</span><b>' + C.plata(Math.max(0, R.total - R.abono)) + '</b></div>' : '') +
      (b.direccion ? '<div class="det-fila"><span>📍 Dirección</span><b>' + esc(b.direccion) + '</b></div>' : '') + '</div>';
    // Pagar y subir comprobante
    if (R.estado === 'esperando_abono') {
      html += '<div class="card"><h2>1. Paga ' + C.plata(R.abono) + '</h2>' + (b.abono_texto ? '<p class="muted chico" style="margin-top:-6px">' + esc(b.abono_texto) + '</p>' : '') +
        '<div class="btns" style="flex-direction:column">' +
        (b.link_pago ? '<a class="btn oro full" target="_blank" rel="noopener" href="' + esc(b.link_pago) + '" data-link>💳 Pagar con link de pago</a>' : '') +
        (b.datos_transferencia ? '<button class="gris full" data-tr>🏦 Transferencia: ver datos</button><div class="hidden" data-trd style="white-space:pre-line;padding:10px;background:var(--field);border-radius:12px">' +
          esc(b.datos_transferencia) + '<br><button class="small alt" data-copiar style="margin-top:8px">📋 Copiar datos</button></div>' : '') + '</div></div>' +
        '<div class="card"><h2>2. Sube la foto del comprobante</h2><p class="muted chico" style="margin-top:-6px">Al subirla, el reloj se detiene y tu hora queda guardada mientras el barbero verifica el pago.</p>' +
        '<div class="btns"><button class="alt" data-foto>📷 Subir comprobante</button></div><img class="comp-img hidden" data-prev alt="Comprobante" style="margin-top:10px">' +
        '<div class="btns"><button class="grande full ok" data-enviar disabled>✅ Enviar comprobante</button></div>' +
        '<p class="muted chico centro">Si cambiaste de idea, no hagas nada: la hora se libera sola.</p></div>';
    }
    // Acciones
    const acciones = [];
    if (R.estado === 'agendada') {
      acciones.push('<a class="btn gris" target="_blank" rel="noopener" data-g>📆 Google Calendar</a>', '<button class="gris" data-ics>📲 Al calendario</button>');
    }
    if (R.reagendable) acciones.push('<button class="alt" data-reag>🔁 Reagendar' + (R.estado === 'anulada' ? ' con mi saldo' : '') + '</button>');
    if (R.politica) acciones.push('<button class="danger" data-cancelar>Cancelar hora</button>');
    if (b.whatsapp) acciones.push('<a class="btn wsp" target="_blank" rel="noopener" href="' + C.wa(b.whatsapp, 'Hola 👋 Soy ' + (R.nombre || '') + ', tengo hora el ' + C.fechaLarga(f) + ' a las ' + C.horaDe(R.inicio) + '.') + '">💬 WhatsApp</a>');
    if (acciones.length) html += '<div class="card"><div class="btns" style="margin-top:0">' + acciones.join('') + '</div>' +
      (R.politica && R.politica !== 'libre' ? '<p class="muted chico">' + esc(K.texto('reserva_politica')) + '</p>' : '') + '</div>';
    // Calificar
    if (R.estado === 'atendida' && !R.calificada) {
      html += '<div class="card centro"><h2 style="justify-content:center">⭐ ¿Cómo te atendieron?</h2><div class="estrellas grande" data-est>' +
        [1, 2, 3, 4, 5].map((n) => '<button type="button" data-n="' + n + '">★</button>').join('') + '</div>' +
        '<textarea data-com maxlength="300" placeholder="Comentario (opcional, solo lo ve la barbería)" style="margin-top:10px"></textarea>' +
        '<div class="btns"><button class="full" data-calificar disabled>Enviar calificación</button></div></div>';
    } else if (R.calificada) html += '<p class="muted centro chico">⭐ ¡Gracias por tu calificación!</p>';
    // Guardar el link y crear cuenta
    html += '<div class="card"><h2>🔗 Guarda tu link</h2><p class="muted chico" style="margin-top:-6px">Con este link vuelves a tu reserva cuando quieras.</p>' +
      '<div class="btns" style="margin-top:0"><button class="gris" data-copiar-link>📋 Copiar link</button>' +
      '<a class="btn wsp" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent('💈 Mi hora en ' + b.nombre + ': ' + location.href.split('&')[0]) + '">💬 Enviármelo</a></div>' +
      (!R.con_cuenta ? '<p class="muted chico" style="margin-bottom:0">¿Quieres ver todas tus horas y recibir avisos? <a href="../b/?b=' + esc(b.codigo) + '#cuenta">Crea tu cuenta</a> con el mismo WhatsApp y esta hora pasa a ella.</p>' : '') + '</div>';
    mostrar(html);
    C.marca(true);
    activar();
  }

  function activar() {
    const b = R.barberia;
    const q = (s) => app.querySelector(s);
    // Reloj
    const reloj = q('[data-reloj]');
    if (reloj) {
      const tick = () => {
        const s = Math.max(0, Math.floor((new Date(reloj.dataset.reloj) - Date.now()) / 1000));
        reloj.textContent = C.pad(Math.floor(s / 60)) + ':' + C.pad(s % 60);
        if (!s) { clearInterval(timer); setTimeout(refrescar, 1500); }
      };
      tick();
      timer = setInterval(tick, 1000);
    }
    let medio = b.link_pago ? 'link' : 'transferencia', foto = null;
    if (q('[data-link]')) q('[data-link]').onclick = () => { medio = 'link'; };
    if (q('[data-tr]')) q('[data-tr]').onclick = () => { medio = 'transferencia'; q('[data-trd]').classList.toggle('hidden'); };
    if (q('[data-copiar]')) q('[data-copiar]').onclick = () => C.copiar(b.datos_transferencia + '\nMonto: ' + C.plata(R.abono));
    if (q('[data-foto]')) q('[data-foto]').onclick = async () => {
      const img = await C.elegirImagen('comprobante');
      if (!img) return;
      foto = img;
      q('[data-prev]').src = img; q('[data-prev]').classList.remove('hidden');
      q('[data-enviar]').disabled = false;
      q('[data-foto]').textContent = '📷 Cambiar foto';
    };
    if (q('[data-enviar]')) q('[data-enviar]').onclick = (ev) => C.accion(ev.target, async () => {
      R = await K.rpc('reserva_comprobante', { p_token: token, p_imagen: foto, p_medio: medio });
      pintar();
      scrollTo(0, 0);
    }, '🧾 Comprobante enviado. Tu hora quedó guardada').catch(() => refrescar());
    const titulo = '💈 ' + (R.servicios || []).map((s) => s.nombre).join(' + ') + ' · ' + b.nombre;
    if (q('[data-g]')) q('[data-g]').href = C.googleCal(titulo, R.inicio, R.fin, b.direccion);
    if (q('[data-ics]')) q('[data-ics]').onclick = () => C.ics(titulo, R.inicio, R.fin, b.direccion);
    if (q('[data-cancelar]')) q('[data-cancelar]').onclick = cancelar;
    if (q('[data-reag]')) q('[data-reag]').onclick = reagendar;
    if (q('[data-copiar-link]')) q('[data-copiar-link]').onclick = () => C.copiar(location.href.split('&')[0]);
    let estrellas = 0;
    app.querySelectorAll('[data-est] button').forEach((x) => x.onclick = () => {
      estrellas = +x.dataset.n;
      app.querySelectorAll('[data-est] button').forEach((y) => y.classList.toggle('on', +y.dataset.n <= estrellas));
      q('[data-calificar]').disabled = false;
    });
    if (q('[data-calificar]')) q('[data-calificar]').onclick = (ev) => C.accion(ev.target, async () => {
      R = await K.rpc('reserva_calificar', { p_token: token, p_estrellas: estrellas, p_comentario: q('[data-com]').value });
      pintar();
    }, '⭐ ¡Gracias!');
  }

  async function cancelar() {
    const msg = {
      libre: 'Tu hora del ' + C.cuando(R.inicio) + ' quedará libre.',
      devolucion: 'Estás dentro de los primeros ' + K.regla('minutos_devolucion') + ' minutos ✅ La barbería te devolverá el abono de ' + C.plata(R.abono) + '.',
      saldo: 'Faltan más de ' + K.regla('horas_cancelacion') + ' horas ✅ Tu abono de ' + C.plata(R.abono) + ' queda como saldo a favor para reagendar.',
      pierde: '⚠️ Faltan menos de ' + K.regla('horas_cancelacion') + ' horas. Si cancelas, pierdes el abono de ' + C.plata(R.abono) + '.'
    }[R.politica];
    if (!await C.confirmar(msg, { titulo: 'Cancelar hora', si: 'Cancelar hora', no: 'Mantener', peligro: true })) return;
    try {
      const r = await K.rpc('reserva_cancelar', { p_token: token });
      R = r.reserva;
      C.toast(r.abono_destino === 'saldo' ? '💰 Cancelada. Tu abono quedó a favor' : r.abono_destino === 'devolucion' ? '💸 Cancelada. Te devolverán el abono' : 'Hora cancelada');
      pintar();
    } catch (e) { C.toast('⚠️ ' + e.message, 4500); refrescar(); }
  }

  // Reagendar: misma duración y mismo barbero, en otra hora libre.
  async function reagendar() {
    const dur = Math.round((new Date(R.fin) - new Date(R.inicio)) / 60000);
    const diasMax = Math.min(60, R.dias_max || 14);
    let f = C.hoy() < C.fechaDe(R.inicio) && R.estado !== 'anulada' ? C.fechaDe(R.inicio) : C.hoy();
    let datos = { reservas: [], bloqueos: [] };
    const h = C.hoja('<h2>🔁 Reagendar</h2><p class="muted" style="margin-top:-6px">Con ' + esc(R.barbero.nombre) + ' · ' + dur + ' min. Elige el nuevo día y hora.</p>' +
      '<div class="dias" data-tira></div><div data-slots></div>');
    try { datos = await K.rpc('ocupacion_publica', { p_codigo: R.barberia.codigo, p_desde: C.hoy(), p_hasta: C.sumarDias(C.hoy(), diasMax), p_token: token }); }
    catch (e) { h.q('[data-slots]').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
    const pintarH = () => {
      const hor = { [R.barbero.id]: R.barbero.horario };
      A.tiraDias(h.q('[data-tira]'), { cuantos: diasMax + 1, sel: f, info: (x) => A.llenado([R.barbero.id], x, datos, hor), alElegir: (x) => { f = x; pintarH(); } });
      const s = A.horas({ f, barbero: R.barbero.id, dur, datos, horario: R.barbero.horario, paso: R.barbero.paso });
      h.q('[data-slots]').innerHTML = '<h3>' + C.fechaLarga(f) + '</h3>' + (s.length ? '<div class="slots">' + s.map((x) => '<button class="slot ' + x.estado + '" data-m="' + x.min + '"' +
        (x.estado !== 'libre' ? ' disabled' : '') + '>' + x.hhmm + '</button>').join('') + '</div>' : '<div class="empty"><span class="ico">😕</span>No hay horas este día.</div>');
      h.qa('.slot:not([disabled])').forEach((b) => b.onclick = async () => {
        const x = s.find((y) => y.min === +b.dataset.m);
        if (!await C.confirmar('Cambiar tu hora al ' + C.fechaLarga(f) + ' a las ' + x.hhmm + '.', { titulo: '🔁 Reagendar', si: 'Sí, cambiar' })) return;
        try {
          R = await K.rpc('reserva_reagendar', { p_token: token, p_inicio: x.t.toISOString() });
          h.cerrar(); C.toast('🔁 ¡Listo! Tu hora cambió'); guardarToken(); pintar();
        } catch (e) { C.toast('⚠️ ' + e.message, 4500); }
      });
    };
    pintarH();
  }

  async function refrescar() { if (await cargar()) pintar(); }

  if (!await cargar()) return;
  encabezado();
  pintar();
  // Mientras espera el abono o la revisión, se actualiza sola.
  setInterval(() => { if (!document.hidden && R && ['esperando_abono', 'en_revision'].includes(R.estado)) cargar().then((ok) => { if (ok) { const antes = app.querySelector('[data-prev]:not(.hidden)'); if (!antes) pintar(); } }); }, 20000);
})();
