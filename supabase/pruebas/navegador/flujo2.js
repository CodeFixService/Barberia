// Segundo recorrido (sobre los datos del primero): anular con saldo, reservar con saldo, fin de semana,
// "Ya pagué" → admin aprueba, key de cliente, clave olvidada, hora interna, atendida → caja, modo oscuro.
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const fs = require('fs');
const BASE = 'http://localhost:8787/';
const OUT = __dirname + '/capturas/2';
fs.mkdirSync(OUT, { recursive: true }); // capturas para revisar a ojo
const errores = [];
const paginas = [];
let n = 0;
const { Pool } = require('pg');
const db = new Pool({ host: process.env.PGHOST || '/var/tmp/pgb', port: +(process.env.PGPORT || 54329), user: process.env.PGUSER || 'postgres', database: 'barberia_ui' });
const q = async (sql, v) => (await db.query(sql, v)).rows;

async function pagina(browser, quien, oscuro) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'es-CL', timezoneId: 'America/Santiago', colorScheme: oscuro ? 'dark' : 'light' });
  const p = await ctx.newPage();
  paginas.push([quien, p]);
  p.on('pageerror', (e) => errores.push(quien + ' pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errores.push(quien + ' console: ' + m.text()); });
  return p;
}
const foto = (p, nom) => p.screenshot({ path: OUT + '/' + String(++n).padStart(2, '0') + '-' + nom + '.png' });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function entrar(p, email, clave) {
  await p.goto(BASE);
  await p.waitForSelector('#cEntrar:not(.hidden)', { timeout: 15000 });
  await p.fill('#email', email); await p.fill('#clave', clave); await p.click('#bEntrar');
  await p.waitForSelector('nav.tabs', { timeout: 15000 });
  await esperar(900);
}
async function cerrar(p) { for (let i = 0; i < 4; i++) { const c = await p.$('.sheet .cerrar'); if (!c) break; await c.click(); await esperar(250); } }
const clave = async (email) => (await q('select pass from mock_pass where email = $1', [email]))[0].pass;
function diaChile(offset) { return new Date(Date.now() + offset * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); }
function dowChile(f) { const [y, m, d] = f.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
function sabado() { let i = 1; while (dowChile(diaChile(i)) !== 6) i++; return diaChile(i); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch());
  try {
    // Ana anula su hora (con +24 h) → saldo a favor
    const ana = await pagina(browser, 'ana');
    await entrar(ana, 'ana@cliente.cl', await clave('ana@cliente.cl'));
    await cerrar(ana);
    await ana.click('nav.tabs [data-v="horas"]');
    await ana.waitForSelector('#v-horas [data-anular]');
    await ana.click('#v-horas [data-anular]');
    await ana.waitForSelector('.sheet [data-si]');
    await foto(ana, 'anular-confirmar');
    await ana.click('.sheet [data-si]');
    await esperar(1200);
    const saldo = (await q("select saldo from profiles where email = 'ana@cliente.cl'"))[0].saldo;
    if (saldo !== 4000) errores.push('saldo esperado 4000, hay ' + saldo);
    await foto(ana, 'anulada-saldo');

    // Reservar el sábado (a consultar) usando el saldo
    await ana.click('nav.tabs [data-v="agendar"]');
    await ana.waitForSelector('.serv');
    await ana.click('.serv >> nth=1');
    await ana.click('.barb:has-text("Pedro")');
    const sab = sabado();
    await ana.click('.dia[data-f="' + sab + '"]');
    await esperar(400);
    await foto(ana, 'sabado-consultar');
    await ana.click('.slot.consultar >> nth=0');
    await ana.waitForSelector('.sheet [data-ok]');
    await foto(ana, 'sabado-confirmar');
    await ana.click('.sheet [data-ok]');
    await ana.waitForSelector('.sheet [data-ver]');
    await foto(ana, 'sabado-solicitud');
    await cerrar(ana);
    const r = await q("select estado, pagado_con from reservas where cliente_id = (select id from profiles where email = 'ana@cliente.cl') order by created_at desc limit 1");
    if (r[0].estado !== 'por_aprobar' || r[0].pagado_con !== 'saldo') errores.push('sábado: ' + JSON.stringify(r[0]));

    // Ana toca "Ya pagué" (Premium)
    await ana.click('nav.tabs [data-v="perfil"]');
    await ana.waitForSelector('[data-pague]');
    await ana.click('[data-pague]');
    await ana.waitForSelector('.sheet [data-v]');
    await ana.fill('.sheet [data-v]', 'Transferencia de Ana');
    await ana.click('.sheet [data-si]');
    await esperar(900);

    // Admin aprueba el pago
    const adm = await pagina(browser, 'admin');
    await entrar(adm, 'juanjosuecastilloloyola@gmail.com', 'admin123');
    await adm.waitForSelector('[data-ap]');
    await foto(adm, 'admin-ya-pague');
    await adm.click('[data-ap]');
    await esperar(1200);
    const prem = (await q("select public.is_premium(id) as p from profiles where email = 'ana@cliente.cl'"))[0].p;
    if (!prem) errores.push('Ana debería ser Premium');
    // Admin genera key para un cliente y la canjea otro (Beto lo crea el dueño)
    await adm.click('nav.tabs [data-v="keys"]');
    await adm.click('[data-g="cliente"]');
    await adm.fill('.sheet [data-v]', 'Beto');
    await adm.click('.sheet [data-si]');
    await adm.waitForSelector('.sheet code.key');
    const key = await adm.textContent('.sheet code.key');
    await foto(adm, 'admin-key-creada');
    await cerrar(adm);

    // Dueño: crea a Beto, le restablece la clave, abre su agenda, crea hora interna y marca atendida
    const own = await pagina(browser, 'dueño');
    await entrar(own, 'dueno@bigote.cl', await clave('dueno@bigote.cl'));
    await cerrar(own);
    await own.click('nav.tabs [data-v="mas"]');
    await own.click('[data-s="clientes"]');
    await own.click('#bNuevoCli');
    await own.fill('.sheet [data-n]', 'Beto');
    await own.fill('.sheet [data-e]', 'beto@cliente.cl');
    await own.click('.sheet [data-ok]');
    await own.waitForSelector('.sheet textarea');
    await cerrar(own);
    await esperar(600);
    await own.click('#lCli li:has-text("Beto")');
    await own.waitForSelector('.sheet [data-clave]');
    await own.click('.sheet [data-clave]');
    await own.click('.sheet [data-si]');
    await own.waitForSelector('.sheet textarea');
    await foto(own, 'restablecer-clave');
    await cerrar(own);
    // Hora interna para Beto ahora mismo (para poder marcarla atendida)
    await own.click('nav.tabs [data-v="agenda"]');
    await esperar(700);
    await own.click('#cNueva');
    await own.waitForSelector('.sheet [data-buscar]');
    await own.fill('.sheet [data-buscar]', 'Beto');
    await own.dispatchEvent('.sheet [data-buscar]', 'input');
    await own.click('.sheet [data-s] >> nth=0');
    const ahora = new Date(Date.now() - 20 * 60000);
    const hh = ahora.toLocaleTimeString('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' });
    const [H, M] = hh.split(':').map(Number);
    await own.fill('.sheet [data-h]', String(H).padStart(2, '0') + ':' + String(Math.floor(M / 15) * 15).padStart(2, '0'));
    await own.fill('.sheet [data-f]', ahora.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }));
    await own.click('.sheet [data-ok]');
    await esperar(1200);
    await foto(own, 'agenda-hora-interna');
    const rb = (await q("select id from reservas where cliente_id = (select id from profiles where email = 'beto@cliente.cl') order by created_at desc limit 1"))[0];
    await own.goto(BASE + 'equipo/#agenda?r=' + rb.id);
    await own.waitForSelector('.sheet [data-a="aten"]', { timeout: 10000 });
    await foto(own, 'detalle-hora');
    await own.click('.sheet [data-a="aten"]');
    await own.waitForSelector('.sheet [data-prop]');
    await own.fill('.sheet [data-prop]', '2000');
    await own.click('.sheet [data-ok]');
    await esperar(1200);
    await own.click('nav.tabs [data-v="caja"]');
    await esperar(1000);
    await foto(own, 'caja-con-corte');
    await own.click('#bAnotar');
    await own.click('.sheet [data-s] >> nth=1');
    await own.click('.sheet [data-ok]');
    await esperar(1000);
    await foto(own, 'caja-dos-cortes');
    // Pedro aprueba el sábado de Ana
    const ped = await pagina(browser, 'pedro', true);
    await entrar(ped, 'pedro@bigote.cl', await clave('pedro@bigote.cl'));
    await cerrar(ped);
    await ped.waitForSelector('[data-conf]');
    await foto(ped, 'barbero-oscuro-aprobar');
    await ped.click('[data-conf]');
    await esperar(1000);
    // Estadísticas (dueño Premium desde el 1er recorrido)
    await own.click('nav.tabs [data-v="mas"]');
    await own.click('[data-s="estadisticas"]');
    await esperar(1200);
    await foto(own, 'estadisticas');

    // Beto entra con la clave temporal y canjea la key
    const beto = await pagina(browser, 'beto');
    await entrar(beto, 'beto@cliente.cl', await clave('beto@cliente.cl'));
    await cerrar(beto);
    await foto(beto, 'clave-temporal');
    await beto.click('nav.tabs [data-v="perfil"]');
    await beto.waitForSelector('[data-key]');
    await beto.click('[data-key]');
    await beto.fill('.sheet [data-v]', key);
    await beto.click('.sheet [data-si]');
    await esperar(2500);
    const pb = (await q("select public.is_premium(id) as p from profiles where email = 'beto@cliente.cl'"))[0].p;
    if (!pb) errores.push('Beto debería ser Premium con la key');
    await beto.click('nav.tabs [data-v="perfil"]');
    await esperar(800);
    await foto(beto, 'beto-premium');
    await beto.fill('[data-c1]', 'nueva123'); await beto.fill('[data-c2]', 'nueva123');
    await beto.click('[data-clave]');
    await esperar(1000);
    const ct = (await q("select clave_temporal from profiles where email = 'beto@cliente.cl'"))[0].clave_temporal;
    if (ct) errores.push('clave_temporal debería quedar en false');
    // Clave olvidada en el inicio de sesión (sin sesión, con ?b=)
    const anon = await pagina(browser, 'anon');
    const cod = (await q('select codigo from barberias limit 1'))[0].codigo;
    await anon.goto(BASE + '?b=' + cod);
    await anon.waitForSelector('#cEntrar:not(.hidden)');
    await esperar(400);
    await foto(anon, 'login-con-barberia');
    const href = await anon.evaluate(() => { let u = ''; window.open = (x) => { u = x; }; document.getElementById('bOlvido').click(); return u; });
    if (!/wa\.me\/56922223333/.test(href)) errores.push('olvido apunta a: ' + href);
  } catch (e) {
    errores.push('FALLÓ: ' + e.message.split('\n')[0] + '\n' + (e.stack || '').split('\n').filter((l) => l.includes('flujo2')).join('\n'));
    for (const [qq, pp] of paginas) await pp.screenshot({ path: OUT + '/FALLO-' + qq + '.png' }).catch(() => {});
  }
  await browser.close(); await db.end();
  console.log(errores.length ? 'ERRORES:\n' + errores.join('\n') : '✅ Segundo recorrido sin errores');
})();
