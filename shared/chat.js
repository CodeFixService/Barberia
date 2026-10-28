/* Mensajes con ✓ Enviado · ✓✓ Recibido · ✓✓ azul Visto, y la regla de mensajes seguidos (3; para clientes, según su plan). */
(function (global) {
  'use strict';
  const C = global.Core, K = global.Cuenta;
  const esc = C.esc;
  let raiz = null, abierto = null, timer = null, reservaAdjunta = null;

  const ROL = { admin: 'Soporte CodeFix', socio: 'Socio CodeFix', owner: 'Dueño', barber: 'Barbero', client: 'Cliente' };

  function montar(el) { raiz = el; lista(); }

  async function lista() {
    abierto = null; clearInterval(timer);
    if (!raiz) return;
    raiz.innerHTML = '<div class="card"><h2><span class="grow">💬 Mensajes</span><button class="small alt" data-nuevo>✏️ Nuevo</button></h2><div data-l><p class="muted">Cargando…</p></div></div>';
    raiz.querySelector('[data-nuevo]').onclick = nuevo;
    let l = [];
    let err = null;
    try { l = await K.rpc('chat_lista'); } catch (e) { err = e; }
    // Si mientras cargaba se abrió una conversación (ej. "Escribir" desde una ficha), no la pisamos.
    const cont = raiz.querySelector('[data-l]');
    if (abierto || !cont) return;
    if (err) { cont.innerHTML = '<p class="err">' + esc(err.message) + '</p>'; return; }
    if (!l.length) {
      cont.innerHTML = '<div class="empty"><span class="ico">💬</span>Aún no tienes conversaciones.<br>Toca <b>✏️ Nuevo</b> para escribir.</div>';
      return;
    }
    cont.innerHTML = '<ul class="list">' + l.map((c) =>
      '<li class="tap" data-id="' + c.other + '">' + C.avatar(c, c.premium ? 'premium' : '') +
      '<div class="grow"><b>' + esc(c.nombre) + (c.premium ? ' <span class="pill oro">⭐ Premium</span>' : '') + (C.conexion(c.last_seen).on ? ' <span title="En línea">🟢</span>' : '') + '</b>' +
      '<div class="sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
      (c.mio ? '<span class="ticks' + (c.leido ? ' visto' : '') + '">' + (c.entregado || c.leido ? '✓✓' : '✓') + '</span> ' : '') + esc(c.ultimo) + '</div></div>' +
      '<div style="text-align:right"><div class="sub chico">' + C.hace(c.ultimo_at) + '</div>' +
      (c.no_leidos ? '<span class="pill bad">' + c.no_leidos + '</span>' : '') + '</div></li>').join('') + '</ul>';
    cont.querySelectorAll('li').forEach((li) => li.onclick = () => {
      const c = l.find((x) => x.other === li.dataset.id);
      abrir(c.other, c);
    });
  }

  async function nuevo() {
    const h = C.hoja('<h2>✏️ Nuevo mensaje</h2><div data-l><p class="muted">Cargando…</p></div>');
    let l = [];
    try { l = await K.rpc('mis_contactos'); } catch (e) { h.q('[data-l]').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
    h.q('[data-l]').innerHTML = l.length ? '<input data-f placeholder="🔎 Buscar…" style="margin-bottom:8px"><ul class="list">' + l.map((c) =>
      '<li class="tap" data-id="' + c.id + '" data-n="' + esc(c.nombre.toLowerCase()) + '">' + C.avatar(c) + '<div class="grow"><b>' + esc(c.nombre) + '</b><div class="sub">' +
      (ROL[c.rol] || '') + '</div></div></li>').join('') + '</ul>' : '<p class="muted">No hay contactos.</p>';
    const f = h.q('[data-f]');
    if (f) f.oninput = () => h.qa('li').forEach((li) => li.classList.toggle('hidden', !li.dataset.n.includes(f.value.toLowerCase())));
    h.qa('li').forEach((li) => li.onclick = () => { h.cerrar(); abrir(li.dataset.id, l.find((x) => x.id === li.dataset.id)); });
  }

  // Abre la conversación con alguien (opcional: adjunta una hora).
  async function abrir(id, info, reserva) {
    if (!raiz) return;
    abierto = id;
    reservaAdjunta = reserva || null;
    info = info || {};
    raiz.innerHTML =
      '<div class="card" style="padding:12px"><div class="flex" style="border-bottom:1px solid var(--line);padding-bottom:10px">' +
      '<button class="icono" data-volver aria-label="Volver">←</button><span data-av></span>' +
      '<div class="grow"><b data-nombre>' + esc(info.nombre || 'Conversación') + '</b><div class="sub chico" data-rol>' + (ROL[info.rol] || '') + '</div></div>' +
      '<button class="icono" data-menu aria-label="Opciones">⋯</button></div>' +
      '<div class="chat-wrap"><div class="chat-msgs" data-msgs></div>' +
      '<div data-adj></div><div data-limite></div>' +
      '<div class="chat-input"><textarea data-txt rows="1" maxlength="1000" placeholder="Escribe un mensaje…"></textarea><button data-env aria-label="Enviar">➤</button></div></div></div>';
    raiz.querySelector('[data-av]').innerHTML = C.avatar(info, 'sm');
    raiz.querySelector('[data-volver]').onclick = () => { history.replaceState(null, '', location.pathname + '#chat'); lista(); };
    raiz.querySelector('[data-menu]').onclick = () => menu(id, info);
    const txt = raiz.querySelector('[data-txt]');
    const env = raiz.querySelector('[data-env]');
    txt.oninput = () => { txt.style.height = 'auto'; txt.style.height = Math.min(120, txt.scrollHeight) + 'px'; };
    txt.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in global)) { e.preventDefault(); env.click(); } };
    env.onclick = async () => {
      const v = txt.value.trim();
      if (!v) return;
      env.disabled = true;
      try {
        const r = await K.rpc('enviar_mensaje', { p_to: id, p_body: v, p_reserva: reservaAdjunta });
        txt.value = ''; txt.style.height = '';
        reservaAdjunta = null;
        raiz.querySelector('[data-adj]').innerHTML = '';
        K.despertarEnvios();
        await cargar(true);
        limite(r.restantes);
      } catch (e) { C.toast('⚠️ ' + e.message, 4000); }
      env.disabled = false;
      txt.focus();
    };
    if (reservaAdjunta) raiz.querySelector('[data-adj]').innerHTML = '<div class="chat-limite" style="margin-top:6px">📅 Este mensaje irá con tu hora adjunta</div>';
    await cargar(true);
    try { limite(await K.rpc('chat_restantes', { p_other: id })); } catch (e) { /* nada */ }
    const conectado = async () => {
      try {
        const t = await K.rpc('ultima_conexion', { p_other: id });
        const el = raiz && raiz.querySelector('[data-rol]');
        if (el && abierto === id) el.textContent = (ROL[info.rol] ? ROL[info.rol] + ' · ' : '') + C.conexion(t).txt;
      } catch (e) { /* nada */ }
    };
    conectado();
    let vueltas = 0;
    clearInterval(timer);
    timer = setInterval(() => { if (abierto === id && !document.hidden) { cargar(false); if (++vueltas % 5 === 0) conectado(); } }, 6000);
    global.Avisos && global.Avisos.actualizar();
  }

  function limite(n) {
    const el = raiz && raiz.querySelector('[data-limite]');
    if (!el) return;
    const txt = raiz.querySelector('[data-txt]'), env = raiz.querySelector('[data-env]');
    if (n === null || n === undefined) { el.innerHTML = ''; txt.disabled = false; env.disabled = false; return; }
    if (n <= 0) {
      el.innerHTML = '<div class="chat-limite">⏳ Llegaste al máximo de mensajes seguidos. Espera que te respondan 🙂' +
        (K.cuenta && K.cuenta.role === 'client' ? '<br><a href="#plan">⭐ Con Premium escribes sin límite</a>' : '') + '</div>';
      txt.disabled = true; env.disabled = true;
    } else {
      el.innerHTML = '<p class="muted chico centro" style="margin:6px 0 0">Puedes enviar ' + n + ' mensaje' + (n === 1 ? '' : 's') + ' más antes de que te respondan</p>';
      txt.disabled = false; env.disabled = false;
    }
  }

  let firma = '';
  async function cargar(forzar) {
    let m = [];
    try { m = await K.rpc('chat_mensajes', { p_other: abierto }); } catch (e) { return; }
    const nueva = JSON.stringify(m.map((x) => [x.id, x.delivered_at, x.read_at]));
    if (!forzar && nueva === firma) return;
    const huboNuevoDelOtro = firma && m.length && !m[m.length - 1].mio && nueva !== firma;
    firma = nueva;
    const cont = raiz && raiz.querySelector('[data-msgs]');
    if (!cont) return;
    const abajo = cont.scrollHeight - cont.scrollTop - cont.clientHeight < 80;
    let dia = '';
    cont.innerHTML = m.length ? m.map((x) => {
      const f = C.fechaDe(x.created_at);
      const sep = f !== dia ? '<div class="chat-dia">' + C.relativoDia(f) + '</div>' : '';
      dia = f;
      const tick = x.mio ? '<span class="tick' + (x.read_at ? ' visto' : '') + '" title="' + (x.read_at ? 'Visto ' + C.horaDe(x.read_at) : x.delivered_at ? 'Recibido' : 'Enviado') + '">' +
        (x.read_at || x.delivered_at ? '✓✓' : '✓') + '</span>' : '';
      return sep + '<div class="burbuja' + (x.mio ? ' mio' : '') + '" data-id="' + x.id + '">' +
        (x.imagen ? '<img data-img="' + x.id + '" alt="Comprobante" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" style="min-height:80px;background:var(--field)">' : '') +
        esc(x.body) + '<span class="meta">' + C.horaDe(x.created_at) + tick + '</span></div>';
    }).join('') : '<div class="empty"><span class="ico">👋</span>Escribe el primer mensaje.</div>';
    cont.querySelectorAll('[data-img]').forEach(async (img) => {
      const cache = sessionStorage.getItem('img:' + img.dataset.img);
      const src = cache || await K.rpc('chat_imagen', { p_id: img.dataset.img }).catch(() => null);
      if (src) { img.src = src; try { sessionStorage.setItem('img:' + img.dataset.img, src); } catch (e) { /* lleno */ } }
      else img.replaceWith(Object.assign(document.createElement('i'), { textContent: '(imagen vencida)' }));
      img.onclick = () => { const h = C.hoja('<img src="' + img.src + '" alt="" style="width:100%;border-radius:12px">'); h.q('.panel').style.maxWidth = '720px'; };
    });
    cont.querySelectorAll('.burbuja:not(.mio)').forEach((b) => {
      let t;
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); reportar(b.dataset.id); });
      b.addEventListener('touchstart', () => { t = setTimeout(() => reportar(b.dataset.id), 700); }, { passive: true });
      b.addEventListener('touchend', () => clearTimeout(t));
    });
    if (forzar || abajo || huboNuevoDelOtro) cont.scrollTop = cont.scrollHeight;
    if (huboNuevoDelOtro) { try { limite(await K.rpc('chat_restantes', { p_other: abierto })); } catch (e) { /* nada */ } }
  }

  async function reportar(msgId) {
    const motivo = await C.pedir('🚩 Reportar mensaje', { texto: 'Cuéntanos qué pasó. Le llegará a CodeFix.', largo: true });
    if (!motivo) return;
    try { await K.rpc('reportar_mensaje', { p_message: msgId, p_motivo: motivo }); C.toast('Reporte enviado'); } catch (e) { C.toast('⚠️ ' + e.message); }
  }

  function menu(id, info) {
    const h = C.hoja('<h2>' + esc(info.nombre || 'Opciones') + '</h2><div class="btns" style="flex-direction:column">' +
      '<button class="gris" data-b>🚫 Bloquear conversación</button><button class="gris" data-d>✅ Desbloquear</button><button class="gris" data-x>🗑️ Borrar chat</button></div>' +
      '<p class="muted chico">Para reportar un mensaje, mantenlo presionado. Los mensajes se borran solos a los 30 días.</p>');
    h.q('[data-x]').onclick = async () => {
      if (!await C.confirmar('Se borra toda la conversación, para los dos.', { titulo: '🗑️ Borrar chat', si: 'Borrar' })) return;
      try { await K.rpc('chat_borrar', { p_other: id }); C.toast('🗑️ Chat borrado'); h.cerrar(); history.replaceState(null, '', location.pathname + '#chat'); lista(); } catch (e) { C.toast('⚠️ ' + e.message); }
    };
    h.q('[data-b]').onclick = async () => { await K.rpc('bloquear_contacto', { p_other: id, p_bloquear: true }); C.toast('Bloqueado'); h.cerrar(); };
    h.q('[data-d]').onclick = async () => { await K.rpc('bloquear_contacto', { p_other: id, p_bloquear: false }); C.toast('Desbloqueado'); h.cerrar(); };
  }

  global.Chat = { montar, lista, abrir, get abierto() { return abierto; } };
})(window);
