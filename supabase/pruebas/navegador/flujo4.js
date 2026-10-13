// Cuarto recorrido (v1.3, sobre los datos de flujo 1–3): colores por plan, "en línea / visto hace…" y limpiar la campanita.
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const fs = require('fs');
const BASE = 'http://localhost:8787/';
const OUT = __dirname + '/capturas/4';
fs.mkdirSync(OUT, { recursive: true });
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

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch());
  try {
    // Carla (Free): 4 colores; el resto y el personalizado plateados. Tema oscuro queda marcado.
    await q("update profiles set plan = 'free', premium_until = null where email = 'carla@cliente.cl'");
    const car = await pagina(browser, 'carla');
    await entrar(car, 'carla@cliente.cl', await clave('carla@cliente.cl'));
    await cerrar(car);
    await car.click('nav.tabs [data-v="perfil"]');
    await car.waitForSelector('[data-colores] button');
    const bloqueados = await car.$$eval('[data-colores] button.plata', (x) => x.length);
    if (bloqueados !== 8) errores.push('Free debería tener 8 colores bloqueados, hay ' + bloqueados);
    if (!(await car.$('[data-propio-wrap].plata'))) errores.push('El color personalizado debería estar bloqueado en Free');
    await car.click('[data-colores] button[data-c="#15803d"]');
    await car.click('[data-tema] [data-t="dark"]');
    await car.click('[data-guardar]');
    await esperar(900);
    await car.evaluate(() => document.querySelector('[data-colores]').scrollIntoView({ block: 'center' }));
    await foto(car, 'cliente-free-colores');
    const col = (await q("select color from profiles where email = 'carla@cliente.cl'"))[0].color;
    if (col !== '#15803d') errores.push('Color de Carla no guardado: ' + col);
    await car.reload();
    await car.waitForSelector('nav.tabs');
    await car.click('nav.tabs [data-v="perfil"]');
    await car.waitForSelector('[data-tema] .on');
    const temaOn = await car.getAttribute('[data-tema] .on', 'data-t');
    if (temaOn !== 'dark') errores.push('El tema elegido no queda marcado: ' + temaOn);

    // Ana (Premium): todos los colores y uno personalizado
    const ana = await pagina(browser, 'ana');
    await entrar(ana, 'ana@cliente.cl', await clave('ana@cliente.cl'));
    await cerrar(ana);
    await ana.click('nav.tabs [data-v="perfil"]');
    await ana.waitForSelector('[data-propio]');
    if (await ana.$('[data-colores] button.plata')) errores.push('Premium no debería tener colores bloqueados');
    await ana.$eval('[data-propio]', (i) => { i.value = '#ff6600'; i.dispatchEvent(new Event('input')); });
    await ana.click('[data-guardar]');
    await esperar(900);
    const colA = (await q("select color from profiles where email = 'ana@cliente.cl'"))[0].color;
    if (colA !== '#ff6600') errores.push('Color personalizado de Ana no guardado: ' + colA);
    await ana.click('nav.tabs [data-v="inicio"]');
    await esperar(500);
    await foto(ana, 'cliente-premium-color-propio');

    // Campanita: limpiar
    await ana.click('#bCampana');
    await ana.waitForSelector('.sheet [data-limpiar]');
    await foto(ana, 'campanita-antes');
    await ana.click('.sheet [data-limpiar]');
    await ana.click('.sheet [data-si]');
    await esperar(900);
    await foto(ana, 'campanita-limpia');
    const visibles = (await q("select count(*)::int as n from avisos where para = (select id from profiles where email = 'ana@cliente.cl') and not oculto and tipo <> 'chat'"))[0].n;
    if (visibles) errores.push('Quedaron ' + visibles + ' avisos sin limpiar');
    await cerrar(ana);

    // Dueño: ve quién está en línea (Ana y Carla tienen la app abierta)
    await q("update profiles set last_seen = now() - interval '3 hours' where email = 'beto@cliente.cl'");
    const own = await pagina(browser, 'dueño');
    await entrar(own, 'dueno@bigote.cl', await clave('dueno@bigote.cl'));
    await cerrar(own);
    await own.click('nav.tabs [data-v="mas"]');
    await own.click('[data-s="clientes"]');
    await own.waitForSelector('#lCli li');
    await foto(own, 'clientes-conexion');
    const txt = await own.textContent('#lCli');
    if (!/En línea/.test(txt)) errores.push('Debería verse algún cliente "En línea"');
    if (!/Nunca entró|Visto/.test(txt)) errores.push('Debería verse "Visto…" o "Nunca entró"');
    await own.click('#lCli li:has-text("Ana")');
    await own.waitForSelector('.sheet');
    await foto(own, 'ficha-conexion');
    await own.click('.sheet [data-chat]');
    await own.waitForSelector('[data-rol]');
    await esperar(1200);
    const rol = await own.textContent('[data-rol]');
    if (!/En línea/.test(rol)) errores.push('El chat debería mostrar "En línea": ' + rol);
    await foto(own, 'chat-en-linea');
  } catch (e) {
    errores.push('FALLÓ: ' + e.message.split('\n')[0] + '\n' + (e.stack || '').split('\n').filter((l) => l.includes('flujo4')).join('\n'));
    for (const [qq, pp] of paginas) await pp.screenshot({ path: OUT + '/FALLO-' + qq + '.png' }).catch(() => {});
  }
  await browser.close(); await db.end();
  console.log(errores.length ? 'ERRORES:\n' + errores.join('\n') : '✅ Cuarto recorrido (v1.3) sin errores');
})();
