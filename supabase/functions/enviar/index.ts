// Edge Function "enviar" de Barbería · CodeFix
//  1) Envía por push los avisos pendientes (la llaman el cron cada minuto y la base de datos al crear un aviso).
//  2) Crea cuentas desde el panel ({accion: 'crear_usuario'}): Josué crea barberías; cada dueño, sus barberos y clientes.
//  3) Restablece claves ({accion: 'restablecer_clave'}): Josué a cualquiera; el dueño a su gente.
// Se despliega en Supabase → Edge Functions → nombre "enviar" (con "Verify JWT" apagado).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const VERSION = '1.0';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Sub = { endpoint: string; p256dh: string; auth: string };
type Pendiente = { id: string; titulo: string; cuerpo: string; url: string | null; tipo: string; subs: Sub[] };

function db() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function quienLlama(jwt: string) {
  if (!jwt) return null;
  const { data, error } = await db().auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user.id;
}

async function enviarPush() {
  const s = db();
  const { data: secretos } = await s.rpc('secretos');
  if (!secretos?.vapid_public || !secretos?.vapid_private) return { enviados: 0, error: 'Faltan las claves push (Admin → Ajustes)' };
  webpush.setVapidDetails('mailto:soporte@codefix.app', secretos.vapid_public, secretos.vapid_private);
  let enviados = 0, vueltas = 0;
  while (vueltas++ < 5) {
    const { data, error } = await s.rpc('tomar_push');
    if (error) throw error;
    const lista = (data || []) as Pendiente[];
    if (!lista.length) break;
    const ok: string[] = [], sin: string[] = [], fallo: string[] = [];
    await Promise.all(lista.map(async (n) => {
      if (!n.subs?.length) { sin.push(n.id); return; }
      const payload = JSON.stringify({ title: n.titulo, body: n.cuerpo, url: n.url, tag: n.tipo === 'chat' ? 'chat-' + n.url : n.id });
      const res = await Promise.allSettled(n.subs.map((t) =>
        webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, { TTL: 86400, urgency: 'high' })
      ));
      let alguno = false;
      for (let i = 0; i < res.length; i++) {
        const r = res[i];
        if (r.status === 'fulfilled') { alguno = true; continue; }
        const code = (r.reason as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) await s.rpc('quitar_endpoint', { p_endpoint: n.subs[i].endpoint }); // celular dado de baja
      }
      (alguno ? ok : fallo).push(n.id);
      if (alguno) enviados++;
    }));
    await s.rpc('terminar_push', { p_ok: ok, p_sin: sin, p_fallo: fallo });
  }
  return { enviados };
}

type Nuevo = { email?: string; password?: string; nombre?: string; tipo?: string; telefono?: string; barberia?: string };

async function crearUsuario(jwt: string, b: Nuevo) {
  const caller = await quienLlama(jwt);
  if (!caller) return { ok: false, error: 'Inicia sesión de nuevo' };
  const s = db();
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  if (password.length < 6) return { ok: false, error: 'La clave debe tener al menos 6 caracteres' };
  const { data: prep, error: e1 } = await s.rpc('preparar_invitacion', {
    p_caller: caller, p_email: email, p_nombre: String(b.nombre || ''), p_rol: String(b.tipo || ''),
    p_telefono: String(b.telefono || ''), p_barberia: String(b.barberia || ''),
  });
  if (e1) return { ok: false, error: e1.message };
  if (!prep?.ok) return prep;
  const { data: nu, error: e2 } = await s.auth.admin.createUser({ email, password, email_confirm: true });
  if (e2 || !nu?.user) {
    await s.rpc('cancelar_invitacion', { p_email: email });
    const m = (e2 && e2.message) || 'No se pudo crear la cuenta';
    return { ok: false, error: /already|registered|exists/i.test(m) ? 'Ese correo ya tiene cuenta' : m };
  }
  const { data: info } = await s.rpc('cuenta_creada', { p_id: nu.user.id });
  return { ok: true, id: nu.user.id, codigo: info?.codigo, barberia: info?.barberia };
}

async function restablecerClave(jwt: string, b: { id?: string; password?: string }) {
  const caller = await quienLlama(jwt);
  if (!caller) return { ok: false, error: 'Inicia sesión de nuevo' };
  const s = db();
  const id = String(b.id || '');
  const password = String(b.password || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: 'Cuenta no válida' };
  if (password.length < 6) return { ok: false, error: 'La clave debe tener al menos 6 caracteres' };
  const { data: puede } = await s.rpc('puede_restablecer', { p_caller: caller, p_target: id });
  if (!puede) return { ok: false, error: 'No puedes cambiar la clave de esta cuenta' };
  const { error } = await s.auth.admin.updateUserById(id, { password });
  if (error) return { ok: false, error: error.message };
  await s.rpc('marcar_clave_temporal', { p_id: id });
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (body?.accion === 'ping') return json({ ok: true, version: VERSION, servicio: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') });
    if (body?.accion === 'crear_usuario') return json(await crearUsuario(jwt, body));
    if (body?.accion === 'restablecer_clave') return json(await restablecerClave(jwt, body));
    return json(await enviarPush());
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});
