// Servidor de prueba: sirve la app y simula Supabase (auth, rpc y la función "enviar") sobre un PostgreSQL local.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const PORT = 8787;
const pool = new Pool({ host: process.env.PGHOST || '/var/tmp/pgb', port: +(process.env.PGPORT || 54329), user: process.env.PGUSER || 'postgres', database: process.env.DB || 'barberia_ui' });

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (sub, email) => b64u({ alg: 'HS256', typ: 'JWT' }) + '.' + b64u({ sub, email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 36000 }) + '.firma';
const sub = (req) => {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try { const p = JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString()); return p.sub ? p : null; } catch (e) { return null; }
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
const sigs = {};

async function firma(fn) {
  if (sigs[fn]) return sigs[fn];
  const r = await pool.query(`select p.proargnames as n, array(select format_type(t, null) from unnest(p.proargtypes) t) as t, format_type(p.prorettype, null) as ret
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = $1`, [fn]);
  if (!r.rows.length) throw Object.assign(new Error('Could not find the function public.' + fn), { code: 'PGRST202', status: 404 });
  sigs[fn] = r.rows[0];
  return sigs[fn];
}

async function rpc(fn, body, user) {
  const f = await firma(fn);
  const args = [], vals = [];
  (f.n || []).forEach((name, i) => {
    if (!(name in body)) return;
    let v = body[name];
    const t = f.t[i];
    if (t === 'jsonb' || t === 'json') v = v === null ? null : JSON.stringify(v);
    vals.push(v);
    args.push(name + ' => $' + vals.length + '::' + t);
  });
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [user ? user.sub : '']);
    await c.query('set local role ' + (user ? 'authenticated' : 'anon'));
    const r = await c.query('select public.' + fn + '(' + args.join(', ') + ') as r', vals);
    await c.query('commit');
    return f.ret === 'void' ? null : r.rows[0].r;
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
}

async function su(sql, vals) { return (await pool.query(sql, vals)).rows; }

async function funcion(body, user) {
  if (body.accion === 'ping') return { ok: true, version: '1.0', servicio: true };
  if (body.accion === 'crear_usuario') {
    if (!user) return { ok: false, error: 'Inicia sesión de nuevo' };
    const email = String(body.email || '').trim().toLowerCase();
    const [prep] = await su('select public.preparar_invitacion($1, $2, $3, $4, $5, $6) as r', [user.sub, email, body.nombre || '', body.tipo || '', body.telefono || '', body.barberia || '']);
    if (!prep.r.ok) return prep.r;
    const [u] = await su('insert into auth.users (email) values ($1) returning id', [email]);
    await su('insert into mock_pass (email, pass) values ($1, $2) on conflict (email) do update set pass = excluded.pass', [email, body.password]);
    const [info] = await su('select public.cuenta_creada($1) as r', [u.id]);
    return { ok: true, id: u.id, codigo: info.r.codigo, barberia: info.r.barberia };
  }
  if (body.accion === 'restablecer_clave') {
    const [p] = await su('select public.puede_restablecer($1, $2) as r', [user && user.sub, body.id]);
    if (!p.r) return { ok: false, error: 'No puedes cambiar la clave de esta cuenta' };
    await su('update mock_pass set pass = $2 where email = (select email from auth.users where id = $1)', [body.id, body.password]);
    await su('select public.marcar_clave_temporal($1)', [body.id]);
    return { ok: true };
  }
  const r = await su('select public.tomar_push() as r');
  return { enviados: r[0].r.length };
}

const leer = (req) => new Promise((ok) => { let d = ''; req.on('data', (c) => d += c); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { ok({}); } }); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (st, obj, extra) => { res.writeHead(st, Object.assign({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }, extra || {})); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
  if (req.method === 'OPTIONS') return send(204);
  try {
    if (url.pathname.startsWith('/sb/')) {
      const p = url.pathname.slice(3);
      const body = await leer(req);
      const user = sub(req);
      if (p === '/auth/v1/token') {
        const r = await su('select u.id, u.email from auth.users u join mock_pass m on m.email = u.email where u.email = $1 and m.pass = $2', [String(body.email).toLowerCase(), body.password]);
        if (!r.length) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
        const u = r[0];
        return send(200, { access_token: jwt(u.id, u.email), token_type: 'bearer', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, refresh_token: 'r-' + u.id,
          user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } });
      }
      if (p === '/auth/v1/signup') {
        // Como Supabase con "Confirm email" apagado: crea la cuenta (el trigger decide si se permite) y entrega la sesión.
        const email = String(body.email || '').toLowerCase();
        let u;
        try { [u] = await su('insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id, email', [email, JSON.stringify(body.data || {})]); }
        catch (e) { return send(500, { code: 500, error_code: 'unexpected_failure', msg: 'Database error saving new user' }); }
        await su('insert into mock_pass (email, pass) values ($1, $2) on conflict (email) do update set pass = excluded.pass', [email, body.password]);
        return send(200, { access_token: jwt(u.id, u.email), token_type: 'bearer', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, refresh_token: 'r-' + u.id,
          user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: body.data || {}, created_at: new Date().toISOString() } });
      }
      if (p === '/auth/v1/user') {
        if (!user) return send(401, { msg: 'not authenticated' });
        if (req.method === 'PUT' && body.password) await su('update mock_pass set pass = $2 where email = $1', [user.email, body.password]);
        return send(200, { id: user.sub, email: user.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} });
      }
      if (p === '/auth/v1/logout') return send(204);
      if (p.startsWith('/rest/v1/rpc/')) {
        try { return send(200, await rpc(p.slice(13), body, user)); }
        catch (e) { return send(e.status || 400, { code: e.code, message: e.message, details: null, hint: null }); }
      }
      if (p === '/functions/v1/enviar') return send(200, await funcion(body, user));
      return send(404, { message: 'no simulado: ' + p });
    }
    let f = path.join(ROOT, decodeURIComponent(url.pathname));
    if (f.endsWith('/')) f += 'index.html';
    if (url.pathname === '/shared/config.js') {
      const t = fs.readFileSync(f, 'utf8').replace(/SUPABASE_URL: '[^']+'/, "SUPABASE_URL: 'http://localhost:" + PORT + "/sb'");
      res.writeHead(200, { 'Content-Type': 'application/javascript' }); return res.end(t);
    }
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  } catch (e) { console.error(e); send(500, { message: String(e.message || e) }); }
}).listen(PORT, () => console.log('listo en http://localhost:' + PORT));
