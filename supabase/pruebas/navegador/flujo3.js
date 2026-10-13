// Tercer recorrido (v1.1, sobre los datos de flujo.js y flujo2.js): cada barbero con su "agenda llena",
// barberos que crean clientes (de toda la barbería) y ficha con último barbero / habitual / creado por.
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const fs = require('fs');
const BASE = 'http://localhost:8787/';
const OUT = __dirname + '/capturas/3';
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
const agenda = async (email) => (await q('select agenda_abierta from profiles where email = $1', [email]))[0].agenda_abierta;
function diaChile(offset) { return new Date(Date.now() + offset * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); }
function dowChile(f) { const [y, m, d] = f.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
function proximoHabil() { let i = 3; while ([0, 6].includes(dowChile(diaChile(i)))) i++; return diaChile(i); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch());
  try {
    // Pedro (barbero) crea un cliente y cierra su agenda
    const ped = await pagina(browser, 'pedro');
    await entrar(ped, 'pedro@bigote.cl', await clave('pedro@bigote.cl'));
    await cerrar(ped);
    await ped.click('nav.tabs [data-v="mas"]');
    await ped.click('[data-s="clientes"]');
    await ped.waitForSelector('#bNuevoCli');
    await ped.click('#bNuevoCli');
    await ped.fill('.sheet [data-n]', 'Carla Nueva');
    await ped.fill('.sheet [data-t]', '+56955556666');
    await ped.fill('.sheet [data-e]', 'carla@cliente.cl');
    await ped.click('.sheet [data-ok]');
    await ped.waitForSelector('.sheet textarea');
    await foto(ped, 'barbero-crea-cliente');
    await cerrar(ped);
    await ped.click('nav.tabs [data-v="hoy"]');
    await ped.waitForSelector('#chkAgenda');
    await ped.uncheck('#chkAgenda');
    await esperar(900);
    await foto(ped, 'barbero-agenda-llena');
    if (await agenda('pedro@bigote.cl')) errores.push('Pedro debería tener la agenda cerrada');

    // Carla (creada por Pedro) ve a todos; Pedro aparece "agenda llena" y reserva con el dueño
    const own = await pagina(browser, 'dueño');
    await entrar(own, 'dueno@bigote.cl', await clave('dueno@bigote.cl'));
    await cerrar(own);
    await own.waitForSelector('#chkAgenda');
    await own.check('#chkAgenda');
    await esperar(800);
    const car = await pagina(browser, 'carla');
    await entrar(car, 'carla@cliente.cl', await clave('carla@cliente.cl'));
    await cerrar(car);
    await car.click('nav.tabs [data-v="agendar"]');
    await car.waitForSelector('.barb');
    await foto(car, 'cliente-ve-agenda-llena');
    const llena = await car.textContent('.barb:has-text("Pedro") small');
    if (!/llena/.test(llena)) errores.push('Pedro debería verse "agenda llena": ' + llena);
    await car.click('.serv >> nth=0');
    await car.click('.barb:has-text("Juan")');
    await car.click('.dia[data-f="' + proximoHabil() + '"]');
    await esperar(400);
    await car.click('.slot.libre >> nth=1');
    await car.waitForSelector('.sheet [data-ok]');
    await car.click('.sheet [data-ok]');
    await car.waitForSelector('.sheet [data-foto]');
    const [fc] = await Promise.all([car.waitForEvent('filechooser'), car.click('.sheet [data-foto]')]);
    await fc.setFiles(require('path').resolve(__dirname, '..', '..', '..', 'icons', 'icon-192.png'));
    await car.click('.sheet [data-listo]');
    await car.waitForSelector('.sheet [data-ver]');
    await foto(car, 'cliente-reservo-con-otro');
    const res = await q("select p.nombre from reservas r join profiles p on p.id = r.barbero_id where r.cliente_id = (select id from profiles where email = 'carla@cliente.cl')");
    if (!res.length || !/Juan/.test(res[0].nombre)) errores.push('Carla debió reservar con Juan: ' + JSON.stringify(res));

    // El dueño reabre la agenda de Pedro desde "Mi equipo" y ve la ficha de Beto (último barbero, habitual, creado por)
    await own.click('nav.tabs [data-v="mas"]');
    await own.click('[data-s="equipo"]');
    await own.waitForSelector('[data-b]');
    await foto(own, 'equipo-estado-agendas');
    await own.click('li:has-text("Pedro")');
    await own.waitForSelector('.sheet [data-agenda]');
    await own.check('.sheet [data-agenda]');
    await own.click('.sheet [data-g]');
    await esperar(1000);
    if (!(await agenda('pedro@bigote.cl'))) errores.push('El dueño debió reabrir la agenda de Pedro');
    await own.click('#bVolver');
    await own.click('[data-s="clientes"]');
    await own.waitForSelector('#lCli li');
    await foto(own, 'clientes-lista');
    await own.click('#lCli li:has-text("Carla")');
    await own.waitForSelector('.sheet');
    const ficha = await own.textContent('.sheet');
    if (!/Creado por\s*Pedro/.test(ficha)) errores.push('La ficha de Carla debería decir creado por Pedro');
    await foto(own, 'ficha-creado-por');
    await cerrar(own);
    await own.click('#lCli li:has-text("Beto")');
    await own.waitForSelector('.sheet');
    const fb = await own.textContent('.sheet');
    if (!/Último corte/.test(fb) || !/Barbero habitual/.test(fb)) errores.push('La ficha de Beto debería mostrar último corte y habitual');
    await foto(own, 'ficha-ultimo-barbero');
    await cerrar(own);
    // El dueño desactiva que los barberos creen clientes → Pedro ya no ve el botón
    await own.click('#bVolver');
    await own.click('[data-s="ajustes"]');
    await own.waitForSelector('#chkCrean');
    await own.uncheck('#chkCrean');
    await own.click('#bGuardarAj');
    await esperar(1000);
    await ped.reload();
    await ped.waitForSelector('nav.tabs');
    await esperar(800);
    await ped.click('nav.tabs [data-v="mas"]');
    await ped.click('[data-s="clientes"]');
    await esperar(800);
    if (await ped.$('#bNuevoCli')) errores.push('Pedro no debería ver "+ Nuevo cliente"');
    await foto(ped, 'barbero-sin-permiso');
  } catch (e) {
    errores.push('FALLÓ: ' + e.message.split('\n')[0] + '\n' + (e.stack || '').split('\n').filter((l) => l.includes('flujo3')).join('\n'));
    for (const [qq, pp] of paginas) await pp.screenshot({ path: OUT + '/FALLO-' + qq + '.png' }).catch(() => {});
  }
  await browser.close(); await db.end();
  console.log(errores.length ? 'ERRORES:\n' + errores.join('\n') : '✅ Tercer recorrido (v1.1) sin errores');
})();
