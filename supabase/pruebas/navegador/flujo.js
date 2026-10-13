// Prueba de punta a punta en un navegador real: admin → barbería → cliente → reserva → confirmación.
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const fs = require('fs');
const BASE = 'http://localhost:8787/';
const OUT = __dirname + '/capturas/1';
fs.mkdirSync(OUT, { recursive: true }); // capturas para revisar a ojo
const errores = [];
let n = 0;

async function nuevaPagina(browser, quien) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block', locale: 'es-CL', timezoneId: 'America/Santiago' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(quien + ' pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errores.push(quien + ' console: ' + m.text()); });
  p.on('dialog', (d) => d.accept());
  return p;
}
const foto = async (p, nombre) => p.screenshot({ path: OUT + '/' + String(++n).padStart(2, '0') + '-' + nombre + '.png', fullPage: false });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function entrar(p, email, clave) {
  await p.goto(BASE);
  await p.waitForSelector('#cEntrar:not(.hidden)', { timeout: 15000 });
  await p.fill('#email', email);
  await p.fill('#clave', clave);
  await p.click('#bEntrar');
  await p.waitForSelector('nav.tabs', { timeout: 15000 });
  await esperar(800);
}
async function cerrarHojas(p) { for (let i = 0; i < 4; i++) { const c = await p.$('.sheet .cerrar'); if (!c) break; await c.click(); await esperar(250); } }
async function claveDeHoja(p) {
  const t = await p.inputValue('.sheet textarea');
  return /Clave: (\S+)/.exec(t)[1];
}
// Próximo día de semana (lun–vie) que no sea hoy.
function diaChile(offset) { return new Date(Date.now() + offset * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); }
function dowChile(f) { const [y, m, d] = f.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
function proximoHabil() { let i = 2; while ([0, 6].includes(dowChile(diaChile(i)))) i++; return diaChile(i); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch());
  try {
    // 1) Admin crea la barbería
    const adm = await nuevaPagina(browser, 'admin');
    await entrar(adm, 'juanjosuecastilloloyola@gmail.com', 'admin123');
    await foto(adm, 'admin-resumen');
    await adm.click('nav.tabs [data-v="barberias"]');
    await adm.click('#bNuevaB');
    await adm.fill('.sheet [data-b]', 'Barbería El Bigote');
    await adm.fill('.sheet [data-n]', 'Juan Dueño');
    await adm.fill('.sheet [data-e]', 'dueno@bigote.cl');
    await adm.fill('.sheet [data-t]', '+56922223333');
    await adm.click('.sheet [data-ok]');
    await adm.waitForSelector('.sheet textarea');
    const claveDueno = await claveDeHoja(adm);
    await foto(adm, 'admin-barberia-creada');
    await cerrarHojas(adm);

    // 2) Dueño configura: servicios, ajustes, cliente y barbero
    const own = await nuevaPagina(browser, 'dueño');
    await entrar(own, 'dueno@bigote.cl', claveDueno);
    await foto(own, 'dueno-tour');
    await cerrarHojas(own);
    await foto(own, 'dueno-hoy');
    await own.click('nav.tabs [data-v="mas"]');
    await own.click('[data-s="servicios"]');
    for (const [nom, precio, dur] of [['Corte', 10000, 30], ['Barba', 7000, 15], ['Corte + barba', 15000, 45]]) {
      await own.click('#bNuevoSer');
      await own.fill('.sheet [data-n]', nom);
      await own.fill('.sheet [data-p]', String(precio));
      await own.fill('.sheet [data-d]', String(dur));
      await own.click('.sheet [data-g]');
      await own.waitForSelector('.sheet', { state: 'detached' });
      await esperar(400);
    }
    await foto(own, 'dueno-servicios');
    await own.click('#bVolver');
    await own.click('[data-s="ajustes"]');
    await own.waitForSelector('#bGuardarAj');
    await own.fill('[data-k="datos_transferencia"]', 'Juan Dueño · RUT 11.111.111-1 · BancoEstado · Cuenta RUT 11111111 · juan@bigote.cl');
    await own.fill('[data-k="direccion"]', 'Av. Siempre Viva 742, Santiago');
    await own.click('#bGuardarAj');
    await esperar(800);
    await foto(own, 'dueno-ajustes');
    await own.click('#bVolver');
    await own.click('[data-s="clientes"]');
    await own.click('#bNuevoCli');
    await own.fill('.sheet [data-n]', 'Ana Cliente');
    await own.fill('.sheet [data-t]', '+56933334444');
    await own.fill('.sheet [data-e]', 'ana@cliente.cl');
    await own.click('.sheet [data-ok]');
    await own.waitForSelector('.sheet textarea');
    const claveAna = await claveDeHoja(own);
    await cerrarHojas(own);
    await own.click('#bVolver');
    await own.click('[data-s="equipo"]');
    await own.click('#bNuevoBar');
    await own.fill('.sheet [data-n]', 'Pedro Barbero');
    await own.fill('.sheet [data-t]', '+56944445555');
    await own.fill('.sheet [data-e]', 'pedro@bigote.cl');
    await own.click('.sheet [data-ok]');
    await own.waitForSelector('.sheet textarea');
    const clavePedro = await claveDeHoja(own);
    await cerrarHojas(own);
    await esperar(600);
    await foto(own, 'dueno-equipo');

    // 3) Ana reserva con abono y comprobante
    const ana = await nuevaPagina(browser, 'ana');
    await entrar(ana, 'ana@cliente.cl', claveAna);
    await foto(ana, 'cliente-tour');
    await cerrarHojas(ana);
    await foto(ana, 'cliente-inicio');
    await ana.click('nav.tabs [data-v="agendar"]');
    await ana.waitForSelector('.serv');
    await ana.click('.serv >> nth=0');
    await esperar(300);
    // elegir a Pedro y un día hábil
    await ana.click('.barb:has-text("Pedro")');
    const dia = proximoHabil();
    await ana.click('.dia[data-f="' + dia + '"]');
    await esperar(400);
    await foto(ana, 'cliente-agendar');
    await ana.click('.slot.libre >> nth=2');
    await ana.waitForSelector('.sheet [data-ok]');
    await foto(ana, 'cliente-confirmar');
    await ana.click('.sheet [data-ok]');
    await ana.waitForSelector('.sheet [data-foto]');
    await foto(ana, 'cliente-abono');
    const [fc] = await Promise.all([ana.waitForEvent('filechooser'), ana.click('.sheet [data-foto]')]);
    await fc.setFiles(require('path').resolve(__dirname, '..', '..', '..', 'icons', 'icon-512.png'));
    await ana.waitForSelector('.sheet [data-listo]:not([disabled])');
    await ana.click('.sheet [data-listo]');
    await ana.waitForSelector('.sheet [data-ver]');
    await foto(ana, 'cliente-listo');
    await ana.click('.sheet [data-ver]');
    await esperar(800);
    await foto(ana, 'cliente-mis-horas');

    // 4) Pedro confirma
    const ped = await nuevaPagina(browser, 'pedro');
    await entrar(ped, 'pedro@bigote.cl', clavePedro);
    await cerrarHojas(ped);
    await ped.waitForSelector('[data-conf]');
    await foto(ped, 'barbero-hoy');
    await ped.click('[data-comp]');
    await ped.waitForSelector('.sheet img');
    await foto(ped, 'barbero-comprobante');
    await cerrarHojas(ped);
    await ped.click('[data-conf]');
    await esperar(1000);
    await ped.click('nav.tabs [data-v="agenda"]');
    await esperar(400);
    await ped.click('[data-vi="semana"]');
    await esperar(800);
    await foto(ped, 'barbero-agenda-semana');
    await ped.click('nav.tabs [data-v="chat"]');
    await ped.waitForSelector('.list li');
    await ped.click('.list li >> nth=0');
    await ped.waitForSelector('.burbuja');
    await ped.fill('[data-txt]', '¡Hola Ana! Te espero 💈');
    await ped.click('[data-env]');
    await esperar(800);
    await foto(ped, 'barbero-chat');

    // 5) Ana ve todo
    await ana.reload();
    await ana.waitForSelector('nav.tabs');
    await esperar(1200);
    await foto(ana, 'cliente-inicio-confirmada');
    await ana.click('#bCampana');
    await esperar(700);
    await foto(ana, 'cliente-campana');
    await cerrarHojas(ana);
    await ana.click('nav.tabs [data-v="chat"]');
    await ana.waitForSelector('.list li');
    await ana.click('.list li >> nth=0');
    await esperar(600);
    for (const t of ['hola 1', 'hola 2', 'hola 3']) { await ana.fill('[data-txt]', t); await ana.click('[data-env]'); await esperar(600); }
    await foto(ana, 'cliente-chat-limite');
    await ana.click('nav.tabs [data-v="agendar"]');
    await esperar(800);
    await ana.click('[data-vista="mes"]');
    await esperar(500);
    await foto(ana, 'cliente-mes');
    await ana.click('nav.tabs [data-v="perfil"]');
    await esperar(900);
    await foto(ana, 'cliente-perfil');
    await ana.evaluate(() => document.querySelector('[data-plan]').scrollIntoView());
    await esperar(300);
    await foto(ana, 'cliente-plan');

    // 6) Dueño: agenda "Todos" (plateada en Free), caja y estadísticas
    await own.click('nav.tabs [data-v="agenda"]');
    await esperar(900);
    await foto(own, 'dueno-agenda');
    await own.click('nav.tabs [data-v="caja"]');
    await esperar(900);
    await foto(own, 'dueno-caja');

    // 7) Admin: activa Premium al dueño y ve la barbería
    await adm.click('nav.tabs [data-v="resumen"]');
    await esperar(1000);
    await adm.click('nav.tabs [data-v="barberias"]');
    await adm.waitForSelector('.barb-card');
    await foto(adm, 'admin-barberias');
    await adm.click('.barb-card');
    await adm.waitForSelector('.sheet [data-act]');
    await adm.click('.sheet [data-act]');
    await esperar(1000);
    await adm.click('nav.tabs [data-v="keys"]');
    await esperar(800);
    await foto(adm, 'admin-keys');
    await own.reload();
    await own.waitForSelector('nav.tabs');
    await esperar(800);
    await own.click('nav.tabs [data-v="agenda"]');
    await esperar(1000);
    await foto(own, 'dueno-agenda-premium');
  } catch (e) {
    errores.push('FALLÓ EL FLUJO: ' + e.message.split('\n')[0]);
  }
  await browser.close();
  console.log(errores.length ? 'ERRORES:\n' + errores.join('\n') : '✅ Flujo completo sin errores');
})();
