/* Encabezado con logo, 🔔 campanita de avisos (con ✓ / ✓✓ / Visto) y contadores que se actualizan solos. */
(function (global) {
  'use strict';
  const C = global.Core, K = global.Cuenta;
  const esc = C.esc;
  let ultimo = { avisos: 0, mensajes: 0, pendientes: 0 };
  const oyentes = [];

  const ICONOS = { reserva: '📅', chat: '💬', plan: '⭐', oferta: '🏷️', difusion: '📣', aviso: '🔔' };

  // Arma el encabezado: logo + nombre de la barbería + campanita.
  function montar(opts) {
    const a = K.cuenta || {};
    const b = a.barberia || {};
    const h = document.createElement('header');
    h.className = 'top';
    const logo = b.logo;
    h.innerHTML =
      '<span class="logo' + (logo ? ' img' : '') + '" style="' + C.fondo(logo) + '">' + (logo ? '' : '💈') + '</span>' +
      '<div class="tit"><b>' + esc(opts.titulo || b.nombre || 'Barbería') + '</b><small>' + (opts.sub || '') + '</small></div>' +
      (opts.extra || '') +
      '<button class="icono" id="bCampana" aria-label="Avisos">🔔<span class="num" id="nAvisos"></span></button>';
    document.body.prepend(h);
    h.querySelector('#bCampana').onclick = abrir;
    actualizar();
    setInterval(() => { if (!document.hidden) actualizar(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) actualizar(); });
    return h;
  }

  async function actualizar() {
    try {
      const r = await K.rpc('resumen');
      if (!r) return;
      const antes = ultimo;
      ultimo = r;
      ponerNum('nAvisos', r.avisos);
      document.querySelectorAll('[data-num="mensajes"]').forEach((el) => setNum(el, r.mensajes));
      document.querySelectorAll('[data-num="pendientes"]').forEach((el) => setNum(el, r.pendientes));
      document.querySelectorAll('[data-num="avisos"]').forEach((el) => setNum(el, r.avisos));
      if (r.avisos > antes.avisos && antes !== null && antes.avisos !== undefined && document.visibilityState === 'visible' && antes.cargado) {
        C.toast('🔔 Tienes un aviso nuevo');
      }
      ultimo.cargado = true;
      oyentes.forEach((f) => { try { f(r, antes); } catch (e) { /* nada */ } });
    } catch (e) { /* sin red */ }
  }
  function setNum(el, n) { el.textContent = n > 99 ? '99+' : (n || ''); el.dataset.n = n || 0; }
  function ponerNum(id, n) { const el = document.getElementById(id); if (el) setNum(el, n); }
  const alCambiar = (f) => oyentes.push(f);

  async function abrir() {
    const h = C.hoja('<h2>🔔 Avisos</h2><div class="seg" style="margin-bottom:10px"><button class="on" data-t="r">Recibidos</button>' +
      '<button data-t="e">Enviados</button></div><div data-lista><p class="muted">Cargando…</p></div>' +
      '<div class="btns"><button class="gris small" data-todo>✓ Marcar todo como visto</button><button class="gris small" data-limpiar>🗑️ Limpiar</button></div>' +
      '<p class="muted chico" data-nota>Los avisos se borran solos a los 7 días.</p>');
    const lista = h.q('[data-lista]');
    const recibidos = async () => {
      h.q('[data-todo]').classList.remove('hidden');
      h.q('[data-limpiar]').classList.remove('hidden');
      let av = [];
      try { av = await K.rpc('mis_avisos'); } catch (e) { lista.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
      if (!av.length) { lista.innerHTML = '<div class="empty"><span class="ico">🔕</span>No tienes avisos todavía.</div>'; return; }
      lista.innerHTML = '<ul class="list">' + av.map((x) =>
        '<li class="aviso tap' + (x.visto_at ? '' : ' nuevo') + '" data-id="' + x.id + '" data-url="' + esc(x.url || '') + '">' +
        '<span class="ico">' + (ICONOS[x.tipo] || '🔔') + '</span><div class="grow"><b>' + esc(x.titulo) + '</b>' +
        '<div class="sub">' + esc(x.cuerpo) + '</div><div class="sub chico">' + esc(x.de) + ' · ' + C.hace(x.created_at) +
        (x.visto_at ? ' · <span class="ticks visto">✓✓</span> visto' : '') + '</div></div></li>').join('') + '</ul>';
      lista.querySelectorAll('li').forEach((li) => li.onclick = async () => {
        try { await K.rpc('marcar_vistos', { p_ids: [li.dataset.id] }); } catch (e) { /* nada */ }
        actualizar();
        if (li.dataset.url) { h.cerrar(); K.irA(li.dataset.url); } else { li.classList.remove('nuevo'); }
      });
    };
    const enviados = async () => {
      h.q('[data-todo]').classList.add('hidden');
      h.q('[data-limpiar]').classList.add('hidden');
      let av = [];
      try { av = await K.rpc('avisos_enviados'); } catch (e) { lista.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
      if (!av.length) { lista.innerHTML = '<div class="empty"><span class="ico">📤</span>Aquí verás si leyeron los avisos que enviaste (confirmaciones, cambios de hora…).</div>'; return; }
      lista.innerHTML = '<p class="muted chico">✓ enviado · ✓✓ recibido · <span class="ticks visto">✓✓</span> visto</p><ul class="list">' + av.map((x) =>
        '<li><div class="grow"><b>' + esc(x.titulo) + '</b><div class="sub">Para ' + esc(x.para) + ' · ' + C.hace(x.created_at) + '</div></div>' +
        estado(x) + '</li>').join('') + '</ul>';
    };
    h.qa('[data-t]').forEach((b) => b.onclick = () => {
      h.qa('[data-t]').forEach((x) => x.classList.toggle('on', x === b));
      (b.dataset.t === 'r' ? recibidos : enviados)();
    });
    h.q('[data-todo]').onclick = async () => { await K.rpc('marcar_vistos', { p_ids: null }); actualizar(); recibidos(); };
    h.q('[data-limpiar]').onclick = async (ev) => {
      if (!await C.confirmar('Se vacía tu campanita. Quien te envió los avisos igual ve que los recibiste.', { titulo: '🗑️ Limpiar avisos', si: 'Limpiar' })) return;
      try { await K.rpc('limpiar_avisos'); C.toast('🗑️ Campanita limpia'); actualizar(); recibidos(); } catch (e) { C.toast('⚠️ ' + e.message); }
    };
    recibidos();
  }

  // ✓ / ✓✓ / ✓✓ azul con la hora.
  function estado(x) {
    if (x.visto_at) return '<span class="chico" style="text-align:right"><span class="ticks visto">✓✓</span><br>' + C.horaDe(x.visto_at) + '</span>';
    if (x.recibido) return '<span class="ticks" title="Recibido">✓✓</span>';
    return '<span class="ticks" title="Enviado">✓</span>';
  }

  // Invita a activar las notificaciones si este celular aún no las tiene.
  async function invitarPush(dentroDe) {
    if (!K.pushPosible() && !K.esIOS()) return;
    if (await K.pushActivo()) return;
    if (C.leer('pushNo', 0) > Date.now()) return;
    const d = document.createElement('div');
    d.className = 'banner marca';
    d.innerHTML = '<div class="grow"><b>🔔 Activa las notificaciones</b><br><span class="chico">' +
      (K.esIOS() && !K.instalada() ? 'En iPhone: Compartir → "Agregar a inicio" y abre la app desde ahí.' : 'Para saber al tiro cuando confirmen tu hora o te escriban.') +
      '</span></div><button class="small">Activar</button><button class="small gris" aria-label="Ahora no" style="background:transparent;color:inherit;border:0">✕</button>';
    const [bOn, bNo] = d.querySelectorAll('button');
    bOn.onclick = () => C.accion(bOn, async () => { await K.activarPush(); d.remove(); }, '🔔 Notificaciones activadas');
    bNo.onclick = () => { C.guardar('pushNo', Date.now() + 3 * 864e5); d.remove(); };
    (dentroDe || document.querySelector('main')).prepend(d);
  }

  global.Avisos = { montar, actualizar, abrir, alCambiar, estado, invitarPush, get ultimo() { return ultimo; } };
})(window);
