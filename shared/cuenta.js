/* Sesión: inicio de sesión, cuenta (rol, plan, barbería), llamadas al servidor, push y actualizaciones. */
(function (global) {
  'use strict';

  const cfg = global.BARB_CONFIG || {};
  const C = global.Core;
  const listo = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && global.supabase);
  const sb = listo ? global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'barb-auth', detectSessionInUrl: false }
  }) : null;

  let cuenta = C.leer('cuenta', null);

  function amigable(err) {
    const m = String((err && (err.message || err.error_description || err)) || 'Error');
    if (/Invalid login credentials/i.test(m)) return 'Correo o clave incorrectos';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos.';
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return 'Sin conexión. Revisa tu internet.';
    if (/JWT|token is expired|not authenticated/i.test(m)) return 'Tu sesión expiró. Vuelve a entrar.';
    if (/permission denied/i.test(m)) return 'Sin permiso para esto';
    return m.replace(/^\w*Error:\s*/, '');
  }

  async function rpc(nombre, args) {
    if (!sb) throw new Error('Falta configurar el servidor');
    const { data, error } = await sb.rpc(nombre, args || {});
    if (error) throw new Error(amigable(error));
    return data;
  }

  function guardarCuenta(a) {
    cuenta = a;
    C.guardar('cuenta', a);
    if (a) aplicarMarca(a);
  }

  // Colores y logo de la barbería (el color propio es Premium; el del cliente Premium manda en su app).
  function aplicarMarca(a) {
    const b = a && a.barberia;
    let color = null;
    if (b && b.premium && b.color) color = b.color;
    if (a && a.color && (colorPremium(a) || C.COLORES_LIBRES.includes(a.color))) color = a.color;
    C.aplicarColor(color || C.COLORES[0][1]);
    try { localStorage.setItem('barb:color', JSON.stringify(color || C.COLORES[0][1]).slice(1, -1)); } catch (e) { /* lleno */ }
    if (b) recordarBarberia({ codigo: b.codigo, nombre: b.nombre, logo: b.logo, whatsapp: b.whatsapp, color: b.premium ? b.color : null });
  }

  // Todos los colores y el personalizado: cliente Premium, equipo de barbería Premium o el admin.
  const colorPremium = (a) => !!(a && (a.is_premium || a.is_admin || (a.role !== 'client' && a.barberia && a.barberia.premium)));

  // La barbería queda recordada en el celular: su logo y su WhatsApp aparecen en el inicio de sesión.
  function recordarBarberia(info) { if (info && info.codigo) C.guardar('local', info); }
  const barberiaLocal = () => C.leer('local', null);

  async function refrescar() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    if (!data.session) { guardarCuenta(null); return null; }
    try {
      const a = await rpc('mi_cuenta');
      if (!a) { guardarCuenta(null); return null; }
      a.revisado = Date.now();
      guardarCuenta(a);
      return a;
    } catch (e) {
      // Sin internet: usamos la copia guardada (máx. 3 días).
      if (cuenta && cuenta.id === data.session.user.id && Date.now() - (cuenta.revisado || 0) < 3 * 864e5) return cuenta;
      throw e;
    }
  }

  const PAGINAS = { admin: 'admin/', owner: 'equipo/', barber: 'equipo/', client: 'cliente/' };
  const paginaDe = (rol) => PAGINAS[rol] || '';

  // Al abrir cada página: exige sesión y el rol correcto.
  async function exigir(roles) {
    let a = null;
    try { a = await refrescar(); } catch (e) { a = cuenta; }
    try { await ajustes(); } catch (e) { /* usa la copia guardada */ }
    if (!a) { location.replace(C.raiz()); return new Promise(() => {}); }
    if (roles && !roles.includes(a.role)) { location.replace(C.raiz() + paginaDe(a.role)); return new Promise(() => {}); }
    if (a.suspended) {
      document.body.innerHTML = '<main><div class="card centro" style="margin-top:20vh"><div style="font-size:48px">⛔</div><h2 style="justify-content:center">Cuenta suspendida</h2>' +
        '<p class="muted">Comunícate con ' + (a.role === 'client' ? 'tu barbería' : 'CodeFix') + '.</p><button id="salirS" class="gris">Cerrar sesión</button></div></main>';
      document.getElementById('salirS').onclick = async () => { await salir(); location.replace(C.raiz()); };
      return new Promise(() => {});
    }
    sincronizarPush();
    return a;
  }

  async function entrar(email, clave) {
    const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: clave });
    if (error) throw new Error(amigable(error));
    const a = await refrescar();
    sincronizarPush();
    return a;
  }

  async function salir() {
    try { const s = await suscripcionActual(); if (s) await rpc('quitar_push', { p_endpoint: s.endpoint }); } catch (e) { /* sin red */ }
    try { await sb.auth.signOut(); } catch (e) { /* sin red */ }
    guardarCuenta(null);
  }

  async function cambiarClave(nueva) {
    if (String(nueva || '').length < 6) throw new Error('La clave debe tener al menos 6 caracteres');
    const { error } = await sb.auth.updateUser({ password: nueva });
    if (error) throw new Error(amigable(error));
    await rpc('clave_cambiada');
  }

  /* ---------- Función del servidor (crear cuentas, restablecer claves) ---------- */
  async function funcion(body) {
    const { data, error } = await sb.functions.invoke('enviar', { body });
    if (error) {
      let st = 0;
      try { st = error.context && error.context.status; } catch (e) { /* nada */ }
      if (error.name === 'FunctionsFetchError') throw new Error('No se pudo conectar con la función "enviar". Revisa que esté creada en Supabase (guía, paso 4).');
      if (st === 404) throw new Error('Falta crear la función "enviar" en Supabase (guía, paso 4).');
      if (st === 401) throw new Error('En la función "enviar" apaga "Verify JWT" (guía, paso 4).');
      throw new Error('La función "enviar" falló' + (st ? ' (' + st + ')' : ''));
    }
    if (!data || data.ok === false) throw new Error((data && data.error) || 'No se pudo completar');
    return data;
  }
  const crearUsuario = (d) => funcion({ accion: 'crear_usuario', email: d.email, password: d.clave, nombre: d.nombre, tipo: d.tipo, telefono: d.telefono, barberia: d.barberia });
  const restablecerClave = (id, clave) => funcion({ accion: 'restablecer_clave', id, password: clave });
  const probarServidor = () => funcion({ accion: 'ping' });
  const despertarEnvios = () => { if (sb) sb.functions.invoke('enviar', { body: {} }).catch(() => {}); };

  // Clave genérica fácil de dictar (Corte + 4 números): al crear la cuenta o al restablecerla.
  function claveNueva() {
    const r = crypto.getRandomValues(new Uint32Array(2));
    return 'Corte' + String(1000 + (r[0] % 9000));
  }
  function mensajeAcceso(d) {
    const link = C.raiz() + (d.codigo ? '?b=' + d.codigo : '');
    return 'Hola ' + d.nombre + ' 👋\n' + (d.nuevo === false ? 'Te restablecimos la clave de ' : 'Te creamos tu cuenta en ') + (d.barberia || 'la app') + ' 💈\n\n' +
      '📲 Entra aquí e instálala: ' + link + '\n' + (d.email ? '👤 Correo: ' + d.email + '\n' : '') + '🔑 Clave: ' + d.clave + '\n\n' +
      'Al entrar, cámbiala en 👤 Mi perfil por una que recuerdes.';
  }

  /* ---------- Push ---------- */
  function b64aBytes(b64) {
    const p = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }
  const pushPosible = () => 'serviceWorker' in navigator && 'PushManager' in global && 'Notification' in global;
  const esIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
  const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  async function suscripcionActual() {
    if (!pushPosible() || Notification.permission !== 'granted') return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg && reg.pushManager ? reg.pushManager.getSubscription() : null;
  }
  async function activarPush() {
    if (!pushPosible()) {
      throw new Error(esIOS() ? 'En iPhone primero instala la app: Compartir → "Agregar a inicio", y ábrela desde ahí.' : 'Este navegador no permite notificaciones');
    }
    const pub = await rpc('config_publica');
    if (!pub || !pub.vapid_public) throw new Error('El administrador aún no activa las notificaciones');
    if (await Notification.requestPermission() !== 'granted') throw new Error('Permiso de notificaciones denegado. Actívalo en los ajustes del navegador.');
    const reg = await navigator.serviceWorker.ready;
    const key = b64aBytes(pub.vapid_public);
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      const cur = sub.options && sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
      if (!cur || cur.length !== key.length || cur.some((b, i) => b !== key[i])) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const s = sub.toJSON();
    await rpc('guardar_push', { p_endpoint: s.endpoint, p_p256dh: s.keys.p256dh, p_auth: s.keys.auth });
    return true;
  }
  // Si este celular ya tenía push, queda a nombre de la cuenta con sesión.
  async function sincronizarPush() {
    try {
      const sub = await suscripcionActual();
      if (!sub) return false;
      const s = sub.toJSON();
      await rpc('guardar_push', { p_endpoint: s.endpoint, p_p256dh: s.keys.p256dh, p_auth: s.keys.auth });
      return true;
    } catch (e) { return false; }
  }
  async function pushActivo() { try { return !!(await suscripcionActual()); } catch (e) { return false; } }

  /* ---------- Ajustes públicos del admin (precio, link de pago, WhatsApp) ---------- */
  async function ajustes() {
    try { const s = await rpc('ajustes_publicos'); C.guardar('ajustes', s); return s; }
    catch (e) { return C.leer('ajustes', {}); }
  }

  /* ---------- Planes Free / Premium (los edita el admin) ---------- */
  const PLANES_BASE = {
    barberia: { barberos: [3, 10], clientes: [40, 500], servicios: [8, 100], ofertas: [1, 50], precio: [0, 4900], prueba_dias: [0, 7] },
    cliente: { activas: [1, 3], dias: [14, 45], mensajes: [3, 0], precio: [0, 4900], prueba_dias: [0, 7] }
  };
  // Valor de un plan: plan('cliente', 'dias', true) → 45
  function plan(grupo, clave, premium) {
    const p = ((C.leer('ajustes', {}) || {}).planes || {})[grupo] || {};
    const v = p[clave];
    if (v && v[premium ? 'premium' : 'free'] !== undefined) return +v[premium ? 'premium' : 'free'];
    const b = (PLANES_BASE[grupo] || {})[clave];
    return b ? b[premium ? 1 : 0] : 0;
  }
  const limite = (que, premium) => plan(['activas', 'dias', 'mensajes'].includes(que) ? 'cliente' : 'barberia', que, premium);
  const grupoDe = (rol) => (rol === 'owner' ? 'barberia' : 'cliente');

  /* ---------- Actualizaciones con botón ---------- */
  const mayor = (a, b) => {
    const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    return false;
  };
  async function revisarActualizacion() {
    let nueva = '';
    try { nueva = String((await (await fetch(C.raiz() + 'version.json', { cache: 'no-store' })).json()).version); } catch (e) { return; }
    if (!nueva || !mayor(nueva, C.version)) return;
    const s = await ajustes();
    const lib = s.version_liberada || '';
    const admin = !!(cuenta && cuenta.is_admin);
    if (!admin && (!lib || mayor(nueva, lib))) return;
    if (document.getElementById('bUpd')) return;
    const d = document.createElement('div');
    d.className = 'banner oscuro'; d.id = 'bUpd';
    d.innerHTML = '<div class="grow"><b>🔄 Hay una versión nueva</b><br><span class="chico">Tienes la v' + C.version + ' · Nueva: v' + nueva +
      (admin && (!lib || mayor(nueva, lib)) ? ' (solo tú la ves: falta actualizar la base de datos, ve a Ajustes → Versión)' : '') + '</span></div><button class="small">Actualizar</button>';
    d.querySelector('button').onclick = (ev) => actualizarAhora(ev.target);
    (document.querySelector('main') || document.body).prepend(d);
    // Llegó desde el push "Nueva versión": se actualiza sola.
    if (location.hash === '#actualizar') actualizarAhora(d.querySelector('button'));
  }
  async function actualizarAhora(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Actualizando…'; }
    C.toast('🔄 Actualizando la app…', 8000);
    const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
    const sw = reg && (reg.active || reg.waiting || reg.installing);
    if (sw) await new Promise((ok) => { const ch = new MessageChannel(); ch.port1.onmessage = ok; sw.postMessage({ tipo: 'actualizar' }, [ch.port2]); setTimeout(ok, 30000); });
    if (location.hash === '#actualizar') history.replaceState(null, '', location.pathname);
    location.reload();
  }

  // Ir a lo que indica un aviso ("horas", "agenda?r=…", "chat?con=…", "plan"…), en la página del rol.
  function irA(url) {
    if (!url) return;
    if (url === 'actualizar') {
      const b = document.querySelector('#bUpd button');
      if (b) actualizarAhora(b); else C.toast('✅ Ya tienes la última versión');
      return;
    }
    if (/^https?:/.test(url)) { open(url, '_blank'); return; }
    const pag = paginaDe(cuenta && cuenta.role);
    const destino = C.raiz() + pag + '#' + url;
    if (location.pathname.endsWith('/' + pag) || location.pathname.endsWith('/' + pag + 'index.html')) location.hash = url;
    else location.href = destino;
  }

  // La notificación tocada con la app abierta: ir directo a lo que corresponde.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.tipo === 'ir') irA(e.data.url); });
  }

  global.Cuenta = {
    listo, sb, rpc, refrescar, exigir, entrar, salir, cambiarClave, crearUsuario, restablecerClave, probarServidor, despertarEnvios,
    claveNueva, mensajeAcceso, activarPush, sincronizarPush, pushActivo, pushPosible, esIOS, instalada, ajustes, revisarActualizacion,
    recordarBarberia, barberiaLocal, paginaDe, irA, aplicarMarca, amigable, colorPremium, plan, limite, grupoDe,
    get cuenta() { return cuenta; },
    premium: () => !!(cuenta && cuenta.is_premium),
    barberiaPremium: () => !!(cuenta && cuenta.barberia && cuenta.barberia.premium)
  };
})(window);
