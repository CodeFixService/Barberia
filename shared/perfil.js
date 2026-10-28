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

  /* ---------- Mi perfil ---------- */
  async function perfil(el, opts) {
    opts = opts || {};
    const a = K.cuenta;
    const esCliente = a.role === 'client';
    const prem = esCliente ? K.clienteTiene('colores') : true;
    const ROL = { admin: 'Administrador', socio: 'Socio CodeFix', owner: 'Dueño', barber: 'Barbero', client: 'Cliente' };
    let tema = 'auto';
    try { tema = localStorage.getItem('barb:tema') || 'auto'; } catch (e) { /* sin acceso */ }
    if (!['auto', 'light', 'dark'].includes(tema)) tema = 'auto';
    const premColor = K.colorPremium(a);
    el.innerHTML =
      (a.clave_temporal ? '<div class="banner alerta"><div class="grow"><b>🔑 Estás usando una clave temporal</b><br>Cámbiala abajo por una que recuerdes.</div></div>' : '') +
      '<div class="card ' + (a.is_premium ? 'oro-marco' : '') + '"><div class="flex"><span data-av>' + C.avatar(a, 'lg' + (a.is_premium ? ' premium' : '')) + '</span>' +
      '<div class="grow"><b style="font-size:19px">' + esc(a.nombre) + '</b><div class="muted">' + ROL[a.role] + (a.barberia ? ' · ' + esc(a.barberia.nombre) : '') + '</div>' +
      '<div class="flex wrap" style="gap:6px;margin-top:4px">' + (a.is_premium ? '<span class="pill oro">⭐ Premium</span>' : (a.role === 'owner' || esCliente) ? '<span class="pill">Free</span>' : '') +
      (esCliente && a.saldo ? '<span class="pill ok">Saldo a favor ' + C.plata(a.saldo) + '</span>' : '') + '</div></div></div>' +
      '<label>Nombre</label><input data-k="nombre" maxlength="80" value="' + esc(a.nombre) + '">' +
      '<label>WhatsApp</label><input data-k="telefono" inputmode="tel" placeholder="+56 9 1234 5678" value="' + esc(a.telefono || '') + '">' +
      (esCliente ? '<label>Cumpleaños <span class="opc">(opcional, para saludos y promos)</span></label><input data-k="cumple" type="date" value="' + esc(a.cumple || '') + '">' : '') +
      (!esCliente && a.role !== 'admin' ? '<label>Sobre mí <span class="opc">(lo ven los clientes)</span></label><input data-k="descripcion" maxlength="200" placeholder="Ej: Especialista en degradados" value="' + esc(a.descripcion || '') + '">' : '') +
      '<label>Tu ícono</label><div class="emojis" data-emojis></div>' +
      '<div class="btns"><button class="gris small" data-foto>📷 ' + (a.foto ? 'Cambiar foto' : 'Poner mi foto') + '</button>' + (a.foto ? '<button class="gris small" data-sinfoto>Quitar foto</button>' : '') + '</div>' +
      '<label>Color de mi app <span class="opc">(' + (premColor ? 'todos los colores o uno a tu gusto' : '4 colores · ⭐ Premium: todos y uno a tu gusto') + ')</span></label>' +
      '<div class="swatches" data-colores></div><div class="flex" style="margin-top:10px" data-propio-wrap><input type="color" data-propio value="' + esc(/^#[0-9a-f]{6}$/i.test(a.color || '') ? a.color : '#b07d2b') + '" style="width:64px;flex:none">' +
      '<span class="muted chico">🎨 Color personalizado: fabrica el tono que quieras</span></div>' +
      (opts.extraPerfil || '') +
      '<div class="btns"><button data-guardar class="full">Guardar</button></div></div>' +
      '<div class="card"><h2>⚙️ Preferencias</h2>' +
      '<label>Apariencia</label><div class="seg" data-tema><button data-t="auto">Automática</button><button data-t="light">☀️ Clara</button><button data-t="dark">🌙 Oscura</button></div>' +
      '<label>Notificaciones en este celular</label><div class="flex"><span class="grow muted" data-push>Revisando…</span><button class="small alt" data-activar>Activar</button></div></div>' +
      '<div class="card"><h2>🔑 Cambiar mi clave</h2><input data-c1 type="password" autocomplete="new-password" placeholder="Nueva clave (mín. 6)">' +
      '<input data-c2 type="password" autocomplete="new-password" placeholder="Repite la clave" style="margin-top:8px"><div class="btns"><button class="alt" data-clave>Cambiar clave</button></div></div>' +
      ((a.role === 'owner' || esCliente) ? '<div data-plan></div>' : '') +
      '<div class="card"><h2>❓ Ayuda</h2><div class="btns" style="margin-top:0">' +
      (esCliente && a.barberia && a.barberia.whatsapp ? '<a class="btn wsp" target="_blank" rel="noopener" href="' + C.wa(a.barberia.whatsapp, 'Hola, tengo una consulta sobre la app') + '">💬 WhatsApp de la barbería</a>' : '') +
      '<button class="gris" data-tour>🧭 Ver el recorrido</button><a class="btn gris" href="' + C.raiz() + 'legal.html">📄 Términos y privacidad</a></div></div>' +
      '<div class="card"><div class="btns" style="margin-top:0"><button class="gris" data-salir>🚪 Cerrar sesión</button>' +
      (esCliente ? '<button class="danger" data-borrar>Eliminar mi cuenta</button>' : '') + '</div></div>';
    const q = (x) => el.querySelector(x);
    let datos = { avatar: a.avatar, color: a.color };

    // Íconos: los primeros son gratis; el resto, Premium para clientes.
    q('[data-emojis]').innerHTML = C.EMOJIS.map((e, i) => {
      const lock = esCliente && !prem && i >= C.EMOJIS_LIBRES;
      return '<button type="button" class="' + (e === a.avatar ? 'on ' : '') + (lock ? 'plata' : '') + '" data-e="' + e + '">' + e + '</button>';
    }).join('');
    q('[data-emojis]').querySelectorAll('button').forEach((b) => b.onclick = () => {
      if (b.classList.contains('plata')) return upsell('Todos los íconos');
      datos.avatar = b.dataset.e;
      q('[data-emojis]').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      q('[data-av]').innerHTML = C.avatar({ avatar: datos.avatar, foto: datos.foto === undefined ? a.foto : datos.foto }, 'lg');
    });
    q('[data-foto]').onclick = async () => {
      if (esCliente && !prem) return upsell('Tu foto de perfil');
      const img = await C.elegirImagen(220, 0.75);
      if (!img) return;
      datos.foto = img;
      q('[data-av]').innerHTML = C.avatar({ foto: img }, 'lg');
    };
    if (q('[data-sinfoto]')) q('[data-sinfoto]').onclick = () => { datos.foto = ''; q('[data-av]').innerHTML = C.avatar({ avatar: datos.avatar }, 'lg'); };
    const colores = q('[data-colores]');
    if (colores) {
      colores.innerHTML = C.COLORES.map(([n, c]) => {
        const lock = !premColor && !C.COLORES_LIBRES.includes(c);
        return '<button type="button" title="' + n + '" class="' + (c === a.color ? 'on ' : '') + (lock ? 'plata' : '') + '" style="background:' + c + '" data-c="' + c + '"></button>';
      }).join('');
      colores.querySelectorAll('button').forEach((b) => b.onclick = () => {
        if (b.classList.contains('plata')) return upsell('Todos los colores');
        datos.color = b.dataset.c;
        colores.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        C.aplicarColor(b.dataset.c);
      });
      const propio = q('[data-propio]');
      if (!premColor) { propio.disabled = true; bloquear(q('[data-propio-wrap]'), 'Color personalizado'); }
      else propio.oninput = () => {
        datos.color = propio.value;
        colores.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        C.aplicarColor(propio.value);
      };
    }
    q('[data-guardar]').onclick = (ev) => C.accion(ev.target, async () => {
      const p = { avatar: datos.avatar, color: datos.color || '' };
      if (datos.foto !== undefined) p.foto = datos.foto;
      el.querySelectorAll('[data-k]').forEach((i) => { p[i.dataset.k] = i.value; });
      await K.rpc('guardar_perfil', { p });
      await K.refrescar();
      if (opts.alGuardar) opts.alGuardar();
    }, '✅ Perfil guardado');

    // Preferencias
    q('[data-tema]').querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', b.dataset.t === tema);
      b.onclick = () => {
        C.guardar('tema', b.dataset.t);
        try { localStorage.setItem('barb:tema', b.dataset.t); } catch (e) { /* nada */ }
        C.aplicarTema(b.dataset.t);
        q('[data-tema]').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      };
    });
    const pushTxt = async () => {
      const on = await K.pushActivo();
      q('[data-push]').textContent = on ? '✅ Activas en este celular' : (K.esIOS() && !K.instalada() ? 'En iPhone: instala la app (Compartir → Agregar a inicio)' : 'Desactivadas');
      q('[data-activar]').textContent = on ? 'Reactivar' : 'Activar';
    };
    pushTxt();
    q('[data-activar]').onclick = (ev) => C.accion(ev.target, async () => { await K.activarPush(); await pushTxt(); }, '🔔 Notificaciones activadas');

    q('[data-clave]').onclick = (ev) => {
      const c1 = q('[data-c1]').value, c2 = q('[data-c2]').value;
      if (c1 !== c2) return C.toast('Las claves no coinciden');
      C.accion(ev.target, async () => { await K.cambiarClave(c1); await K.refrescar(); q('[data-c1]').value = q('[data-c2]').value = ''; perfil(el, opts); }, '🔑 Clave cambiada');
    };
    if (q('[data-plan]')) plan(q('[data-plan]'));
    q('[data-tour]').onclick = () => opts.tour && opts.tour(true);
    q('[data-salir]').onclick = async () => { if (await C.confirmar('¿Cerrar sesión en este celular?', { si: 'Cerrar sesión' })) { await K.salir(); location.replace(C.raiz()); } };
    if (q('[data-borrar]')) q('[data-borrar]').onclick = async () => {
      if (!await C.confirmar('Se borrarán tu cuenta y tus horas futuras. No se puede deshacer.', { titulo: 'Eliminar mi cuenta', si: 'Eliminar', peligro: true })) return;
      try { await K.rpc('eliminar_mi_cuenta'); await K.salir(); location.replace(C.raiz()); } catch (e) { C.toast('⚠️ ' + e.message); }
    };
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
