/* Mi perfil, Mi plan (Premium con pago y comprobante), avisos de "es Premium" y recorrido inicial. */
(function (global) {
  'use strict';
  const C = global.Core, K = global.Cuenta;
  const esc = C.esc;

  // Beneficios Premium con los números que el admin dejó en los planes.
  function beneficios(rol) {
    // Si el admin escribió los beneficios del plan, se usan esos.
    const propios = (K.planInfo(rol === 'owner' ? 'barberia' : 'cliente', 'premium').beneficios || []).filter(Boolean);
    if (propios.length) return propios;
    const L = (q, prem) => K.limite(q, prem);
    const ilim = (n, tope) => (n >= tope ? 'ilimitados' : 'hasta ' + n);
    if (rol === 'owner') {
      return ['Hasta ' + L('barberos', true) + ' barberos (Free: ' + L('barberos', false) + ') y ' + L('clientes', true) + ' clientes (Free: ' + L('clientes', false) + ')',
        'Servicios ' + ilim(L('servicios', true), 100) + ', con foto (Free: ' + L('servicios', false) + ')', 'Calendario "Todos" en columnas y vista Año',
        'Colores, portada y fotos de tu equipo', 'Ofertas ' + (L('ofertas', true) >= 50 ? 'ilimitadas' : 'hasta ' + L('ofertas', true)) + ' y ofertas VIP',
        'Recordatorios automáticos a tus clientes', 'Tarjeta de sellos (ej. 10 cortes = 1 gratis)', 'Caja con reportes, comisiones y la de todos tus barberos',
        'Estadísticas por barbero, servicios y horas más pedidas', 'Horario y servicios propios por barbero', 'Lista de espera para tus clientes',
        'Resumen del mes: cuánto ganaste, tu mejor día y lo que perdiste por los que no vinieron', 'Clientes que no vuelven, con WhatsApp y oferta en 1 toque',
        'Recordatorio por WhatsApp en 1 toque (menos "no vino")', 'Regalo de cumpleaños automático a tus clientes', 'Marca CodeFix discreta'];
    }
    const m = L('mensajes', true), mf = L('mensajes', false);
    return ['Reserva hasta ' + L('dias', true) + ' días adelante (Free: ' + L('dias', false) + ')', 'Hasta ' + L('activas', true) + ' horas activas a la vez (Free: ' + L('activas', false) + ')',
      m === 0 ? 'Mensajes sin límite y prioritarios ⭐' : 'Hasta ' + m + ' mensajes seguidos (Free: ' + (mf || 'sin límite') + ')',
      'Ofertas VIP exclusivas', 'Recordatorios 24 h y 2 h antes de tu hora', 'Lista de espera: te avisamos si se libera una hora',
      'Barbero favorito, se elige solo al agendar', 'Todos los colores, uno a tu gusto, tu foto y marco dorado',
      'Prioridad: reserva viernes y sábados antes que nadie', 'Abono rebajado o sin abono en las barberías que lo ofrecen'];
  }

  const fechaCorta = (t) => { const f = C.fechaDe(t).split('-'); return f[2] + '/' + f[1] + '/' + f[0]; };
  const diasQuedan = (t) => Math.max(0, Math.ceil((new Date(t) - Date.now()) / 864e5));

  /* ---------- Aviso "esto es Premium" (al tocar algo plateado) ---------- */
  function upsell(que) {
    const a = K.cuenta || {};
    const esDueno = a.role === 'owner', esCliente = a.role === 'client';
    const h = C.hoja('<h2>⭐ ' + esc(que || 'Función Premium') + '</h2>' +
      (esCliente || esDueno
        ? '<p>Esto es parte de <b>Premium</b>. Por <b>' + C.plata(precio()) + ' al mes</b> desbloqueas:</p><ul class="feat">' +
          beneficios(esDueno ? 'owner' : 'client').map((b) => '<li>' + esc(b) + '</li>').join('') + '</ul>' +
          '<div class="btns"><button class="oro full" data-ir>⭐ Ver Premium</button></div>'
        : '<p>Esta función está disponible cuando tu barbería es <b>Premium</b>. Pídele al dueño que la active.</p>'));
    const b = h.q('[data-ir]');
    if (b) b.onclick = () => { h.cerrar(); K.irA('plan'); };
  }
  // Precio mensual: el mismo de las 6 apps (núcleo: cfx_precios); si aún no carga, el de la barbería.
  let PRECIOS = null;
  K.rpc('cfx_precios').then((x) => { PRECIOS = x; }).catch(() => {});
  const precio = () => { const g = (K.cuenta || {}).role === 'owner' ? 'negocio' : 'cliente'; return (PRECIOS && PRECIOS[g] && PRECIOS[g].mensual) || K.linkPremium(K.grupoDe((K.cuenta || {}).role)).monto; };
  // Marca un elemento como Premium bloqueado (plateado con candado).
  function bloquear(el, que) {
    if (!el) return;
    el.classList.add('plata');
    el.addEventListener('click', (e) => { e.preventDefault(); e.stopImmediatePropagation(); upsell(que); }, true);
  }

  /* ---------- Compartir: link + QR (descargar, copiar, WhatsApp) ---------- */
  // o = { titulo, texto, link, mensaje, archivo, el (si va dentro de una sección en vez de una hoja) }
  function compartir(o) {
    const msg = (o.mensaje || '') + (o.mensaje ? ': ' : '') + o.link;
    const html = '<div class="card centro">' + (o.texto ? '<p style="margin-top:0">' + o.texto + '</p>' : '') +
      '<img class="qr-img" src="' + C.qr(o.link, 440) + '" alt="QR" style="width:220px;max-width:70%;display:block;margin:10px auto;border-radius:12px">' +
      '<input readonly value="' + esc(o.link) + '" style="text-align:center">' +
      '<div class="btns" style="justify-content:center"><button data-copiar>📋 Copiar</button>' +
      '<a class="btn gris" download="' + esc(o.archivo || 'qr') + '.png" href="' + C.qr(o.link, 900) + '">⬇️ Descargar QR</a>' +
      '<a class="btn wsp" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(msg) + '">💬 WhatsApp</a>' +
      (navigator.share ? '<button class="gris" data-share>📤 Compartir</button>' : '') + '</div></div>';
    const z = o.el || C.hoja('<h2>' + esc(o.titulo || '🔳 Compartir') + '</h2><div data-z></div>').q('[data-z]');
    z.innerHTML = html + (o.extra || '');
    z.querySelector('[data-copiar]').onclick = () => C.copiar(o.link);
    if (z.querySelector('[data-share]')) z.querySelector('[data-share]').onclick = () => navigator.share({ title: o.titulo || '', text: o.mensaje || '', url: o.link }).catch(() => {});
    return z;
  }

  /* ---------- Mi plan: pagar con el link y subir el comprobante (lo aprueba CodeFix) ---------- */
  async function plan(el) {
    const a = await K.refrescar() || K.cuenta;
    const s = await K.ajustes();
    const grupo = K.grupoDe(a.role);
    const info = K.planInfo(grupo, 'premium');
    const prueba = grupo === 'cliente' ? K.plan('cliente', 'prueba_dias', true) : 0;
    const esDueno = a.role === 'owner';
    const prem = a.is_premium;
    // Precios y pago: los mismos de las 6 apps (núcleo: cfx_pago_estado y pagos.js; se editan en el Centro de Mando → Pagos).
    let cx = null;
    try { cx = await K.rpc('cfx_pago_estado'); } catch (e) { /* sin red */ }
    const pr = (cx && cx.config && cx.config[esDueno ? 'negocio' : 'cliente']) || {}, u = cx && cx.ultimo;
    const nombre = info.nombre || 'Premium';
    let html = '<div class="card ' + (prem ? 'oro-marco' : 'upsell') + '"><h2>' + (prem ? '⭐ Eres ' + esc(nombre) : '💎 Hazte ' + esc(nombre)) + '</h2>';
    if (prem && a.premium_until) {
      const q = diasQuedan(a.premium_until);
      html += '<p style="margin:0">Tu ' + esc(nombre) + ' dura hasta el <b>' + fechaCorta(a.premium_until) + '</b><br><span class="' + (q <= K.regla('dias_aviso') ? 'pill warn' : 'muted') + '">' +
        (q === 0 ? 'Vence hoy' : 'Quedan ' + q + ' día' + (q === 1 ? '' : 's')) + '</span></p>';
    } else if (!prem && pr.mensual) {
      html += '<div class="precio">' + C.plata(pr.mensual) + ' <small>/ mes</small>' + (pr.anual ? ' · ' + C.plata(pr.anual) + ' <small>/ año</small>' : '') + '</div>' +
        '<p class="muted" style="margin:2px 0 0">' + esc(info.descripcion || K.texto(esDueno ? 'premium_barberia_texto' : 'premium_cliente_texto')) + '</p>';
    }
    html += '<ul class="feat">' + beneficios(esDueno ? 'owner' : 'client').map((b) => '<li>' + esc(b) + '</li>').join('') + '</ul>';
    if (u && u.estado === 'pendiente') {
      html += '<div class="banner alerta" style="margin-top:12px"><div class="grow"><b>🧾 Tu comprobante está en revisión</b><br><span class="chico">Lo enviaste ' + C.hace(u.creado) +
        '. Te llega un aviso 🔔 apenas CodeFix lo apruebe.</span></div></div>';
    } else {
      if (u && u.estado === 'rechazado' && Date.now() - new Date(u.resuelto) < 14 * 864e5) {
        html += '<div class="banner alerta" style="margin-top:12px"><div class="grow"><b>❌ Tu último pago fue rechazado</b><br><span class="chico">' + esc(u.motivo || '') + '</span></div></div>';
      }
      if (a.role === 'owner' || a.role === 'client') html += '<div class="btns" style="flex-direction:column"><button class="oro full" data-pagar>💳 ' + (prem ? 'Renovar' : 'Pagar') + '</button></div>' +
        '<p class="muted chico">Paga con link o transferencia y sube la foto del comprobante. ' + (prem ? 'Se suma desde tu fecha de término.' : 'Se activa apenas lo revisemos.') + '</p>';
    }
    html += '<div class="btns" style="flex-direction:column">' +
      (!a.trial_used && !prem && prueba > 0 ? '<button class="ok full" data-prueba>🎁 Probar ' + prueba + ' días gratis</button>' : '') +
      (s.whatsapp_admin ? '<a class="btn wsp full" target="_blank" rel="noopener" href="' + C.wa(s.whatsapp_admin, 'Hola, quiero ' + nombre + ' para ' + (esDueno ? 'mi barbería ' + ((a.barberia || {}).nombre || '') : 'mi cuenta (' + a.email + ')')) + '">💬 Escribir a CodeFix</a>' : '') +
      '</div></div>';
    el.innerHTML = html;
    const q = (x) => el.querySelector(x);
    if (q('[data-pagar]')) q('[data-pagar]').onclick = () => CFX_PAGOS.abrir({ rpc: K.rpc, alPagar: () => plan(el) });
    if (q('[data-prueba]')) q('[data-prueba]').onclick = (ev) => C.accion(ev.target, async () => {
      await K.rpc('probar_premium');
      C.toast('🎁 ¡' + prueba + ' días de Premium activados!');
      setTimeout(() => location.reload(), 900);
    });
  }

  /* ---------- Mi perfil: el común del núcleo (ayuda.js → CFX_PERFIL); aquí solo cómo guarda Barbería ---------- */
  const ROL = { admin: 'Administrador', socio: 'Socio CodeFix', owner: 'Dueño', barber: 'Barbero', client: 'Cliente' };
  const premCli = () => K.cuenta.role !== 'client' || K.clienteTiene('colores');
  let fotoNueva;
  const guardarP = async (p) => { await K.rpc('guardar_perfil', { p }); await K.refrescar(); };
  global.CFX_PERFIL_APP = {
    nombre: () => K.cuenta.nombre, correo: () => K.cuenta.email,
    sub: () => { const a = K.cuenta; return ROL[a.role] + (a.barberia ? ' · ' + a.barberia.nombre : '') + (a.is_premium ? ' · ⭐ Premium' : ''); },
    foto: () => K.cuenta.foto || '',
    guardarFoto: async (f) => { fotoNueva = f ? await C.imagen(f, 360, 0.82, 38000) : ''; },
    iconos: C.EMOJIS, icono: () => K.cuenta.avatar,
    campos: () => { const a = K.cuenta, cli = a.role === 'client'; return [{ k: 'telefono', t: 'WhatsApp', tipo: 'tel', ph: '+56 9 1234 5678', v: a.telefono || '' }]
      .concat(cli ? [{ k: 'cumple', t: 'Cumpleaños (opcional, para saludos y promos)', tipo: 'date', v: a.cumple || '' }] : [])
      .concat(!cli && a.role !== 'admin' ? [{ k: 'descripcion', t: 'Sobre mí (lo ven los clientes)', max: 200, ph: 'Ej: Especialista en degradados', v: a.descripcion || '' }] : []); },
    guardar: async (d) => { const p = Object.assign({}, d, { avatar: d.icono }); delete p.icono; if (fotoNueva !== undefined) p.foto = fotoNueva; fotoNueva = undefined; await guardarP(p); },
    colores: C.COLORES, libre: true, color: () => K.cuenta.color || C.COLORES[0][1],
    guardarColor: async (c) => { C.aplicarColor(c); await guardarP({ color: c }); }, probarColor: C.aplicarColor,
    modo: () => { let t = ''; try { t = localStorage.getItem('barb:tema') || ''; } catch (e) { /* sin acceso */ } return t === 'light' ? 'claro' : t === 'dark' ? 'oscuro' : 'auto'; },
    guardarModo: (m) => { const t = m === 'claro' ? 'light' : m === 'oscuro' ? 'dark' : 'auto'; C.guardar('tema', t); try { localStorage.setItem('barb:tema', t); } catch (e) { /* nada */ } C.aplicarTema(t); },
    pushActiva: () => K.pushActivo(),
    activarPush: () => { if (K.esIOS() && !K.instalada()) throw new Error('En iPhone: instala la app (Compartir → Agregar a inicio)'); return K.activarPush(); },
    clave: async (n) => { await K.cambiarClave(n); await K.refrescar(); },
    // Íconos, foto y colores: los primeros son gratis; el resto, Premium para clientes.
    bloqueo: (que, v) => {
      if (que === 'foto' && !premCli()) return 'Tu foto de perfil';
      if (que === 'icono' && !premCli() && C.EMOJIS.indexOf(v) >= C.EMOJIS_LIBRES) return 'Todos los íconos';
      if ((que === 'color' && !C.COLORES_LIBRES.includes(v)) || que === 'libre') return K.colorPremium(K.cuenta) ? '' : que === 'libre' ? 'Color personalizado' : 'Todos los colores';
      return '';
    },
    mejorar: upsell,
    arriba: () => (K.cuenta.clave_temporal ? '<div class="banner alerta"><div class="grow"><b>🔑 Estás usando una clave temporal</b><br>Cámbiala en Avanzado por una que recuerdes.</div></div>' : ''),
    eliminarTexto: 'Se borrarán tu cuenta y tus horas futuras. No se puede deshacer.',
    puedeEliminar: () => K.cuenta.role === 'client',  // solo el cliente borra su cuenta desde la app
    eliminar: async () => {
      if (!await C.confirmar('Se borrarán tu cuenta y tus horas futuras. No se puede deshacer.', { titulo: 'Eliminar mi cuenta', si: 'Eliminar', peligro: true })) return;
      await K.rpc('eliminar_mi_cuenta'); await K.salir(); location.replace(C.raiz());
    }
  };

  // Página Perfil = menú Más común del núcleo (CFX_MENU): perfil arriba, opciones en lista que se abren en una hoja desde abajo.
  async function perfil(el, opts) {
    opts = opts || {};
    const a = K.cuenta;
    const esCliente = a.role === 'client';
    // Lo propio de Barbería queda escondido en la página y se muestra dentro de su hoja (favorito y plan siguen funcionando igual).
    el.innerHTML = '<div data-menu></div>' + (opts.extraPerfil ? '<div class="card cfx-oc" data-fav>' + opts.extraPerfil + '</div>' : '') +
      ((a.role === 'owner' || esCliente) ? '<div class="cfx-oc" data-plan></div>' : '');
    const q = (x) => el.querySelector(x);
    if (q('[data-plan]')) plan(q('[data-plan]'));
    const wsp = esCliente && a.barberia && a.barberia.whatsapp;
    const items = [
      q('[data-fav]') && { k: 'favorito', ico: '❤️', t: 'Barbero favorito', d: 'Se elige solo al agendar', grupo: 'Configuración', nodo: q('[data-fav]') },
      q('[data-plan]') && { k: 'premium', ico: '⭐', t: a.is_premium ? 'Mi plan Premium' : 'Hazte Premium', dato: a.is_premium ? 'Premium' : 'Free', grupo: 'Tu plan', nodo: q('[data-plan]') },
      wsp && { k: 'wsp', ico: '💬', t: 'WhatsApp de la barbería', grupo: 'Cuenta y ayuda', accion: () => window.open(C.wa(a.barberia.whatsapp, 'Hola, tengo una consulta sobre la app'), '_blank', 'noopener') },
      { k: 'tour', ico: '🧭', t: 'Ver el recorrido', grupo: 'Cuenta y ayuda', accion: () => opts.tour && opts.tour(true) },
      { k: 'terminos', ico: '📄', t: 'Términos y privacidad', grupo: 'Cuenta y ayuda', ir: C.raiz() + 'legal.html' }
    ];
    if (global.CFX_MENU) global.CFX_MENU.montar(q('[data-menu]'), items, { perfil: { alGuardar: async () => { if (opts.alGuardar) await opts.alGuardar(); } } });
  }

  /* ---------- Recorrido inicial ---------- */
  function tour(pasos, forzar) {
    const a = K.cuenta;
    if (!forzar && (!a || a.tour_visto)) return;
    let i = 0;
    const h = C.hoja('<div class="tour" data-c></div>', { alCerrar: () => { if (!forzar) K.rpc('guardar_perfil', { p: { tour_visto: true } }).catch(() => {}); } });
    const pintar = () => {
      const p = pasos[i];
      h.q('[data-c]').innerHTML = '<div class="paso-ico">' + p[0] + '</div><h2 style="justify-content:center">' + esc(p[1]) + '</h2><p class="muted">' + esc(p[2]) + '</p>' +
        '<div class="puntos">' + pasos.map((_, j) => '<i class="' + (j === i ? 'on' : '') + '"></i>').join('') + '</div>' +
        '<div class="btns" style="justify-content:center">' + (i > 0 ? '<button class="gris" data-a>Atrás</button>' : '') +
        '<button data-s>' + (i === pasos.length - 1 ? '¡Listo! 💈' : 'Siguiente') + '</button></div>';
      if (h.q('[data-a]')) h.q('[data-a]').onclick = () => { i--; pintar(); };
      h.q('[data-s]').onclick = () => { if (i === pasos.length - 1) h.cerrar(); else { i++; pintar(); } };
    };
    pintar();
  }

  global.Perfil = { perfil, plan, upsell, bloquear, tour, beneficios, fechaCorta, diasQuedan, compartir };
})(window);
