// Quinto recorrido (v1.4, sobre los datos de flujo 1–4): dos links de pago para el abono y planes editables por el admin.
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const fs = require('fs');
const BASE = 'http://localhost:8787/';
const OUT = __dirname + '/capturas/5';
fs.mkdirSync(OUT, { recursive: true });
const errores = [];
const paginas = [];
let n = 0;
const { Pool } = require('pg');
const db = new Pool({ host: process.env.PGHOST || '/var/tmp/pgb', port: +(process.env.PGPORT || 54329), user: process.env.PGUSER || 'postgres', database: 'barberia_ui' });
const q = async (sql, v) => (await db.query(sql, v)).rows;

async function pagina(browser, quien) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'es-CL', timezoneId: 'America/Santiago' });
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

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch());
  try {
    // Dueño: guarda dos links y activa el 2 ($8.000)
    const own = await pagina(browser, 'dueño');
    await entrar(own, 'dueno@bigote.cl', await clave('dueno@bigote.cl'));
    await cerrar(own);
    await own.click('nav.tabs [data-v="mas"]');
    await own.click('[data-s="ajustes"]');
    await own.waitForSelector('[data-pago="2"]');
    await own.fill('[data-pago="1"] [data-pm]', '4000');
    await own.fill('[data-pago="1"] [data-pl]', 'https://mpago.la/cuatro');
    await own.fill('[data-pago="2"] [data-pm]', '8000');
    await own.fill('[data-pago="2"] [data-pl]', 'https://mpago.la/ocho');
    await own.check('[data-pago="2"] input[type=radio]');
    await own.evaluate(() => document.querySelector('[data-pago="1"]').scrollIntoView({ block: 'center' }));
    await foto(own, 'dueno-dos-links');
    await own.click('#bGuardarAj');
    await esperar(1200);
    const b = (await q('select abono, link_pago, pago1_link from barberias limit 1'))[0];
    if (b.abono !== 8000 || b.link_pago !== 'https://mpago.la/ocho' || b.pago1_link !== 'https://mpago.la/cuatro') errores.push('Links mal guardados: ' + JSON.stringify(b));

    // Cliente: ve el abono de $8.000 con el link 2
    const ana = await pagina(browser, 'ana');
    await entrar(ana, 'ana@cliente.cl', await clave('ana@cliente.cl'));
    await cerrar(ana);
    await ana.click('nav.tabs [data-v="agendar"]');
    await ana.waitForSelector('.serv');
    const txt = await ana.textContent('#v-agendar');
    if (!/\$8\.000/.test(txt)) errores.push('El cliente debería ver el abono de $8.000');
    await ana.evaluate(() => document.querySelector('#cal').scrollIntoView({ block: 'center' }));
    await foto(ana, 'cliente-abono-8000');

    // Admin: edita los planes (clientes Free = 3, precio cliente $2.990, días cliente Free = 10)
    const adm = await pagina(browser, 'admin');
    await entrar(adm, 'juanjosuecastilloloyola@gmail.com', 'admin123');
    await adm.click('nav.tabs [data-v="ajustes"]');
    await adm.waitForSelector('[data-pg="barberia.clientes.free"]');
    await adm.fill('[data-pg="barberia.clientes.free"]', '3');
    await adm.fill('[data-pg="cliente.precio.premium"]', '2990');
    await adm.fill('[data-pg="cliente.dias.free"]', '10');
    await adm.evaluate(() => document.getElementById('planesZona').scrollIntoView());
    await foto(adm, 'admin-planes');
    await adm.click('#bGuardarPlanes');
    await esperar(1200);
    const pl = await q("select grupo, clave, free, premium from planes where (grupo, clave) in (('barberia','clientes'), ('cliente','precio'), ('cliente','dias')) order by 1, 2");
    if (pl[0].free !== 3 || pl[1].free !== 10 || pl[2].premium !== 2990) errores.push('Planes mal guardados: ' + JSON.stringify(pl));

    // Carla (Free) ve el precio nuevo del cliente y 10 días
    const car = await pagina(browser, 'carla');
    await entrar(car, 'carla@cliente.cl', await clave('carla@cliente.cl'));
    await cerrar(car);
    await car.click('nav.tabs [data-v="perfil"]');
    await car.waitForSelector('[data-plan] .precio');
    const pr = await car.textContent('[data-plan] .precio');
    if (!/2\.990/.test(pr)) errores.push('El cliente debería ver $2.990: ' + pr);
    await car.evaluate(() => document.querySelector('[data-plan]').scrollIntoView());
    await foto(car, 'cliente-precio-nuevo');
    await car.click('nav.tabs [data-v="agendar"]');
    await car.waitForSelector('#v-agendar .muted.chico');
    if (!/hasta 10 días/.test(await car.textContent('#v-agendar'))) errores.push('El cliente Free debería reservar hasta 10 días');

    // El dueño (Free) con 3 clientes ya no puede crear otro: sale "Premium"
    await q("update profiles set plan = 'free', premium_until = null where email = 'dueno@bigote.cl'");
    await own.reload();
    await own.waitForSelector('nav.tabs');
    await own.click('nav.tabs [data-v="mas"]');
    await own.click('[data-s="clientes"]');
    await own.waitForSelector('#bNuevoCli');
    await foto(own, 'dueno-limite-clientes');
    if (!/\/ 3 clientes/.test(await own.textContent('#secZona'))) errores.push('El dueño debería ver "x / 3 clientes"');
    await own.click('#bNuevoCli');
    await esperar(500);
    if (!(await own.$('.sheet .feat'))) errores.push('Al pasar el límite debería salir el aviso Premium');
    await foto(own, 'dueno-upsell');
  } catch (e) {
    errores.push('FALLÓ: ' + e.message.split('\n')[0] + '\n' + (e.stack || '').split('\n').filter((l) => l.includes('flujo5')).join('\n'));
    for (const [qq, pp] of paginas) await pp.screenshot({ path: OUT + '/FALLO-' + qq + '.png' }).catch(() => {});
  }
  await browser.close(); await db.end();
  console.log(errores.length ? 'ERRORES:\n' + errores.join('\n') : '✅ Quinto recorrido (v1.4) sin errores');
})();
