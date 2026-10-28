/* Service worker: guarda la app en el celular y muestra las notificaciones push.
   La app NO cambia sola: sigue en su versión hasta que la persona toca "Actualizar"
   (el aviso aparece cuando el administrador libera la versión nueva). */
const FILES = [
  './', 'index.html', 'legal.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'shared/core.css', 'shared/core.js', 'shared/premium.js', 'shared/humano.js', 'shared/verificar.js', 'shared/pagos.js', 'shared/respaldo.js', 'shared/voz.js', 'shared/fotos.js', 'shared/auto.js', 'shared/barra.js', 'shared/tema.css', 'shared/iconos.js', 'shared/instalar.js', 'shared/config.js', 'shared/cuenta.js', 'shared/avisos.js', 'shared/chat.js',
  'shared/agenda.js', 'shared/perfil.js', 'shared/vendor/supabase.js', 'shared/vendor/qrcode.js',
  'cliente/', 'cliente/index.html', 'cliente/cliente.js',
  'equipo/', 'equipo/index.html', 'equipo/equipo.js',
  'admin/', 'admin/index.html', 'admin/admin.js',
  'b/', 'b/index.html', 'b/b.js', 'r/', 'r/index.html', 'r/r.js', 'registro/', 'registro/index.html', 'registro/registro.js'
];

const META = 'meta';
const pedirVersion = () => fetch('version.json', { cache: 'no-store' }).then((r) => r.json()).then((j) => String(j.version));

async function versionActual() {
  const r = await (await caches.open(META)).match('actual');
  return r ? r.text() : null;
}

async function instalarVersion(v) {
  const c = await caches.open('app-' + v);
  await c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })));
  await (await caches.open(META)).put('actual', new Response(v));
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k !== META && k !== 'app-' + v).map((k) => caches.delete(k)));
  return v;
}

self.addEventListener('install', (e) => {
  e.waitUntil(versionActual().then((v) => v || pedirVersion().then(instalarVersion)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('message', (e) => {
  if (!e.data || e.data.tipo !== 'actualizar') return;
  const port = e.ports && e.ports[0];
  e.waitUntil(pedirVersion().then(instalarVersion)
    .then((v) => port && port.postMessage({ ok: true, version: v }))
    .catch((err) => port && port.postMessage({ ok: false, error: String(err) })));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (/\/(version\.json|sw\.js)$/.test(url.pathname)) return;
  e.respondWith((async () => {
    const v = await versionActual();
    const c = v ? await caches.open('app-' + v) : null;
    const hit = c && await c.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(e.request);
      if (res.ok && c && FILES.some((f) => url.pathname.endsWith('/' + f) || url.pathname.endsWith(f))) c.put(e.request, res.clone());
      return res;
    } catch (err) { return Response.error(); }
  })());
});

// Push del servidor (llega aunque la app esté cerrada).
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || '💈 Nuevo aviso', {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag, renotify: true,
    data: { url: d.url || '' }, vibrate: [120, 60, 120]
  }));
});

// Al tocar la notificación: abre la app justo donde corresponde.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const ir = (e.notification.data && e.notification.data.url) || '';
  const destino = new URL('./' + (ir ? '?ir=' + encodeURIComponent(ir) : ''), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if ('focus' in c && c.url.startsWith(self.registration.scope)) {
        c.postMessage({ tipo: 'ir', url: ir });
        return c.focus();
      }
    }
    return self.clients.openWindow(destino);
  }));
});
