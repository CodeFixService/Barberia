// v2.0 de punta a punta en un navegador real:
// admin crea barbería → dueño configura → cliente SIN cuenta reserva desde el link, sube comprobante → dueño aprueba →
// cancela con saldo y reagenda → atendida, calificaciones y lista negra → crea su cuenta (se le juntan sus horas) →
// paga Premium con comprobante → admin aprueba → barbero sin montos → admin: servidor, filtros, planes, reglas y textos.
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const { Pool } = require('pg');
const fs = require('fs');
const BASE = 'http://localhost:8787/';
const OUT = __dirname + '/capturas/6';
const IMG = __dirname + '/comprobante.png';
fs.mkdirSync(OUT, { recursive: true });
const pool = new Pool({ host: '/var/tmp/pgb', port: 54329, user: 'postgres', database: 'barberia_ui' });
const q = async (sql, v) => (await pool.query(sql, v)).rows;
const errores = [];
let n = 0;
const ok = (c, msg) => { if (!c) throw new Error('FALLO: ' + msg); console.log('OK:', msg); };

async function nuevaPagina(browser, quien) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block', locale: 'es-CL', timezoneId: 'America/Santiago' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(quien + ' pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|400|Failed to load resource/.test(m.text())) errores.push(quien + ' console: ' + m.text()); });
  p.on('dialog', (d) => d.accept());
  return p;
}
const foto = async (p, nombre) => p.screenshot({ path: OUT + '/' + String(++n).padStart(2, '0') + '-' + nombre + '.png', fullPage: true });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function entrar(p, email, clave) {
  await p.goto(BASE + '?entrar=1');
  await p.waitForSelector('#cEntrar:not(.hidden)', { timeout: 15000 });
  await p.fill('#email', email);
  await p.fill('#clave', clave);
  await p.click('#bEntrar');
  await p.waitForSelector('nav.tabs', { timeout: 15000 });
  await esperar(900);
  await cerrarHojas(p); // recorrido inicial
}
async function cerrarHojas(p) { for (let i = 0; i < 4; i++) { const c = await p.$('.sheet .cerrar'); if (!c) break; await c.click(); await esperar(250); } }
const claveDeHoja = async (p) => /Clave: (\S+)/.exec(await p.inputValue('.sheet textarea'))[1];
async function subirFoto(p, boton) {
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click(boton)]);
  await fc.setFiles(IMG);
  await esperar(600);
}
async function texto(p) { return p.evaluate(() => document.body.innerText); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch());
  try {
    // 1) Admin crea la barbería (parte con días de regalo)
    const adm = await nuevaPagina(browser, 'admin');
    await entrar(adm, 'juanjosuecastilloloyola@gmail.com', 'admin123');
    await adm.click('nav.tabs [data-v="barberias"]');
    await adm.click('#bNuevaB');
    ok((await adm.textContent('.sheet')).includes('días de Premium de regalo'), 'al crear la barbería se ve que parte con días de regalo');
    await adm.fill('.sheet [data-b]', 'Barbería El Bigote');
    await adm.fill('.sheet [data-n]', 'Juan Dueño');
    await adm.fill('.sheet [data-e]', 'dueno@bigote.cl');
    await adm.fill('.sheet [data-t]', '+56922223333');
    await adm.click('.sheet [data-ok]');
    await adm.waitForSelector('.sheet textarea');
    const claveDueno = await claveDeHoja(adm);
    ok((await adm.inputValue('.sheet textarea')).includes('&entrar=1'), 'el acceso del dueño lleva directo a "Entrar"');
    await cerrarHojas(adm);

    // 2) Dueño: Inicio con lo que falta, servicios, links de pago, barbero
    const own = await nuevaPagina(browser, 'dueño');
    await entrar(own, 'dueno@bigote.cl', claveDueno);
    await own.waitForSelector('.checklist');
    await foto(own, 'dueno-inicio-falta-configurar');
    ok((await texto(own)).includes('Lo que te falta configurar'), 'Inicio muestra lo que falta configurar');
    await own.click('nav.tabs [data-v="mas"]');
    await own.click('[data-s="servicios"]');
    await own.click('#bNuevoSer');
    await own.fill('.sheet [data-n]', 'Corte');
    await own.fill('.sheet [data-p]', '10000');
    await own.click('.sheet [data-dur="30"]');
    await own.click('.sheet [data-g]');
    await esperar(800);
    await own.click('#bVolver');
    await own.click('[data-s="links"]');
    await own.waitForSelector('[data-pago="1"]');
    await own.fill('[data-pago="1"] [data-pm]', '4000');
    await own.fill('[data-pago="1"] [data-pl]', 'https://mpago.la/bigote');
    await own.fill('[data-pago="1"] [data-px]', 'Abono normal');
    await own.fill('#tTransf', 'Banco Estado · Cuenta RUT 12345678');
    await own.click('#bGuardarL');
    await esperar(900);
    await foto(own, 'dueno-links-de-pago');
    await own.click('#bVolver');
    await own.click('[data-s="equipo"]');
    await own.click('#bNuevoBar');
    await own.fill('.sheet [data-n]', 'Pedro Barbero');
    await own.fill('.sheet [data-t]', '+56933334444');
    await own.fill('.sheet [data-e]', 'pedro@bigote.cl');
    await own.click('.sheet [data-ok]');
    await own.waitForSelector('.sheet textarea');
    const clavePedro = await claveDeHoja(own);
    await cerrarHojas(own);
    // El dueño atiende (al crear el 1er barbero su agenda se cierra): la abrimos para tener 2 barberos reservables.
    await own.click('nav.tabs [data-v="hoy"]');
    await own.waitForSelector('#chkAgenda');
    if (!(await own.isChecked('#chkAgenda'))) { await own.click('#chkAgenda'); await esperar(700); }
    const link = await own.inputValue('#bCopiarLink >> xpath=../../input');
    ok(/\?b=[a-z0-9]{6}$/.test(link), 'el dueño ve su link para clientes: ' + link);

    // 3) Cliente SIN cuenta: vista libre → reserva → link personal → comprobante
    const inv = await nuevaPagina(browser, 'invitado');
    await inv.goto(link.replace(/^https?:\/\/[^/]+\//, BASE));
    await inv.waitForSelector('#reservar .serv', { timeout: 15000 });
    ok(inv.url().includes('/b/?b='), 'el link de la barbería abre la vista libre');
    await foto(inv, 'invitado-vista-libre');
    await inv.click('#reservar .serv');
    await inv.click('[data-b="*"]').catch(() => {});
    await esperar(400);
    // Primer día con horas
    let slot = await inv.$('#slots .slot:not([disabled])');
    for (let i = 1; !slot && i < 10; i++) { const dias = await inv.$$('#tira .dia'); await dias[i].click(); await esperar(300); slot = await inv.$('#slots .slot:not([disabled])'); }
    ok(!!slot, 'hay horas libres para reservar sin cuenta');
    await slot.click();
    await inv.waitForSelector('.sheet [data-n]');
    await inv.fill('.sheet [data-n]', 'Carlos Invitado');
    await inv.fill('.sheet [data-t]', '+56 9 8765 4321');
    await foto(inv, 'invitado-confirmar');
    await inv.click('.sheet [data-ok]');
    await inv.waitForURL(/\/r\/\?t=/, { timeout: 15000 });
    await inv.waitForSelector('[data-reloj]');
    const token = new URL(inv.url()).searchParams.get('t');
    ok((await texto(inv)).includes('Paga el abono'), 'el link personal pide pagar el abono con reloj');
    ok(!!(await inv.$('a[href="https://mpago.la/bigote"]')), 'muestra el link de pago de la barbería');
    await foto(inv, 'invitado-pagar');
    await subirFoto(inv, '[data-foto]');
    await inv.click('[data-enviar]');
    await inv.waitForSelector('text=Tu abono está en revisión', { timeout: 10000 });
    await foto(inv, 'invitado-en-revision');
    ok((await q('select estado from reservas where token = $1', [token]))[0].estado === 'en_revision', 'en la base queda "en revisión"');

    // 4) Dueño revisa el comprobante y aprueba desde Inicio
    await own.click('nav.tabs [data-v="agenda"]');
    await own.click('nav.tabs [data-v="hoy"]');
    await own.waitForSelector('[data-aprobar]', { timeout: 10000 });
    await foto(own, 'dueno-abono-por-revisar');
    await own.click('[data-comp]');
    await own.waitForSelector('.sheet img.comp-img');
    ok(!!(await own.$('.sheet a[download]')), 'el comprobante se puede descargar');
    await cerrarHojas(own);
    await own.click('[data-aprobar]');
    await esperar(1200);
    ok((await q('select estado from reservas where token = $1', [token]))[0].estado === 'agendada', 'aprobado: queda agendada');
    // v2.1: como reservó sin cuenta, se ofrece avisarle por WhatsApp con su link.
    await own.waitForSelector('.sheet [data-w]', { timeout: 10000 });
    ok((await own.getAttribute('.sheet [data-w]', 'href')).includes(encodeURIComponent('r/?t=' + token)), 'al aprobar se ofrece avisarle por WhatsApp con el link de su hora');
    await own.click('.sheet [data-no]');
    await inv.reload();
    await inv.waitForSelector('text=¡Tu hora está agendada!', { timeout: 10000 });
    await foto(inv, 'invitado-agendada');

    // 5) El invitado cancela (pasaron los 10 min de devolución y faltan +24 h) → saldo → reagenda con el saldo
    await q("update reservas set comprobante_at = now() - interval '1 hour', inicio = now() + interval '3 days', fin = now() + interval '3 days 30 minutes' where token = $1", [token]);
    await q("update reservas set inicio = date_trunc('hour', inicio) + interval '15 minutes' * 0, fin = date_trunc('hour', inicio) + interval '30 minutes' where token = $1", [token]);
    await inv.reload();
    await inv.waitForSelector('[data-cancelar]');
    await inv.click('[data-cancelar]');
    await inv.waitForSelector('.sheet [data-si]');
    ok((await inv.textContent('.sheet')).includes('saldo a favor'), 'al cancelar le explica que queda saldo a favor');
    await inv.click('.sheet [data-si]');
    await inv.waitForSelector('text=quedó como saldo a favor', { timeout: 10000 });
    await foto(inv, 'invitado-cancelada-con-saldo');
    await inv.click('[data-reag]');
    await inv.waitForSelector('.sheet [data-tira] .dia', { timeout: 10000 });
    // (de noche ya no quedan horas hoy: busca el primer día con horas libres)
    for (let i = 0; i < 10 && !(await inv.$('.sheet .slot:not([disabled])')); i++) { await inv.click('.sheet [data-tira] .dia >> nth=' + i); await esperar(300); }
    await inv.click('.sheet .slot:not([disabled])');
    await inv.waitForSelector('.sheet [data-si]');
    await inv.click('.sheet [data-si]');
    await inv.waitForSelector('text=¡Tu hora está agendada!', { timeout: 10000 });
    ok((await q('select reagendada from reservas where token = $1', [token]))[0].reagendada === 1, 'reagendó usando su saldo');

    // 6) Atendida → el dueño califica al cliente con 2 estrellas → lista negra
    const [rid] = await q("update reservas set inicio = now() - interval '1 hour', fin = now() - interval '30 minutes' where token = $1 returning id", [token]);
    await own.goto(BASE + 'equipo/#agenda?r=' + rid.id);
    await own.waitForSelector('.sheet [data-a="aten"]', { timeout: 15000 }).catch(async (e) => { await foto(own, 'DEBUG'); console.log(await texto(own)); throw e; });
    await foto(own, 'dueno-detalle-hora');
    await own.click('.sheet [data-a="aten"]');
    await own.click('.sheet [data-ok]');
    await own.waitForSelector('.sheet .estrellas', { timeout: 10000 });
    await own.click('.sheet [data-n="2"]');
    await own.click('.sheet [data-mot="Llegó tarde"]');
    await foto(own, 'dueno-califica-cliente');
    await own.click('.sheet [data-ok]');
    await esperar(1000);
    await own.click('nav.tabs [data-v="clientes"]');
    await own.waitForSelector('text=Lista negra (1)', { timeout: 10000 });
    await foto(own, 'dueno-clientes-lista-negra');
    ok((await texto(own)).includes('Carlos Invitado'), 'el cliente sin cuenta aparece en Clientes y en la lista negra');

    // 7) El invitado califica a la barbería
    await inv.reload();
    await inv.waitForSelector('[data-est] button');
    await inv.click('[data-est] [data-n="5"]');
    await inv.fill('[data-com]', 'Excelente corte');
    await inv.click('[data-calificar]');
    await inv.waitForSelector('text=¡Gracias por tu calificación!', { timeout: 10000 });
    ok((await q("select count(*)::int as n from calificaciones where autor = 'cliente'"))[0].n === 1, 'la barbería quedó con su calificación');

    // 8) El invitado crea su cuenta desde el link (sus horas pasan a la cuenta)
    await inv.goto(BASE + 'b/?b=' + link.split('?b=')[1] + '#cuenta');
    await inv.waitForSelector('.sheet [data-e]', { timeout: 15000 });
    ok((await inv.inputValue('.sheet [data-n]')) === 'Carlos Invitado', 'recuerda su nombre y WhatsApp');
    await inv.fill('.sheet [data-e]', 'carlos@correo.cl');
    await inv.fill('.sheet [data-c]', 'clave123');
    await inv.click('.sheet [data-ok]');
    await inv.waitForURL(/\/cliente\//, { timeout: 15000 });
    await inv.waitForSelector('nav.tabs');
    await esperar(900);
    await cerrarHojas(inv);
    await inv.click('nav.tabs [data-v="horas"]');
    await esperar(1000);
    await foto(inv, 'cliente-nuevo-mis-horas');
    ok((await q("select count(*)::int as n from reservas r join profiles p on p.id = r.cliente_id where p.email = 'carlos@correo.cl'"))[0].n >= 1, 'su reserva sin cuenta pasó a su cuenta');

    // 9) Cliente paga Premium con comprobante → admin lo aprueba en Pagos
    await inv.click('nav.tabs [data-v="perfil"]');
    await inv.waitForSelector('[data-plan] [data-foto]', { timeout: 10000 });
    await subirFoto(inv, '[data-plan] [data-foto]');
    await inv.click('[data-plan] [data-enviar]');
    await inv.waitForSelector('text=Tu comprobante está en revisión', { timeout: 10000 });
    await foto(inv, 'cliente-premium-en-revision');
    await adm.click('nav.tabs [data-v="pagos"]');
    await adm.waitForSelector('[data-ap]', { timeout: 10000 });
    await foto(adm, 'admin-pagos-por-revisar');
    await adm.click('[data-ver]');
    await adm.waitForSelector('.sheet img.comp-img');
    await cerrarHojas(adm);
    await adm.click('[data-ap]');
    await esperar(1200);
    ok((await q("select plan from profiles where email = 'carlos@correo.cl'"))[0].plan === 'premium', 'aprobado: el cliente es Premium');

    // 10) Barbero: aprueba abonos, sin montos
    const ped = await nuevaPagina(browser, 'barbero');
    await entrar(ped, 'pedro@bigote.cl', clavePedro);
    await ped.click('nav.tabs [data-v="mas"]');
    await ped.click('[data-s="caja"]');
    await esperar(900);
    await foto(ped, 'barbero-caja-sin-montos');
    const tPed = await texto(ped);
    ok(!/\$\s?\d/.test(tPed), 'el barbero no ve montos en su caja');
    ok(!(await ped.$('[data-s="links"]')), 'el barbero no tiene Links de pago');

    // 10b) Pedro ajusta sus tiempos: Corte 70 min + 20 de descanso, horas cada 30 → una reserva bloquea 1 h 30 y la siguiente parte justo al terminar
    await ped.click('#bVolver');
    await ped.click('[data-s="tiempos"]');
    await ped.waitForSelector('#tDesc');
    await ped.selectOption('#tDesc', '20');
    await ped.selectOption('#tPaso', '30');
    await ped.fill('[data-sv]', '70');
    await ped.dispatchEvent('[data-sv]', 'input');
    ok((await ped.textContent('#tPrev')).includes('1 h 30'), 'la vista previa muestra que un corte le bloquea 1 h 30');
    await foto(ped, 'barbero-mis-tiempos');
    await ped.click('#bGuardarT');
    await esperar(900);
    const tp = (await q("select descanso_min, paso_min from profiles where email = 'pedro@bigote.cl'"))[0];
    ok(tp.descanso_min === 20 && tp.paso_min === 30, 'se guardaron los tiempos de Pedro');
    const inv2 = await nuevaPagina(browser, 'invitado2');
    await inv2.goto(BASE + 'b/?b=' + link.split('?b=')[1]);
    await inv2.waitForSelector('#reservar .serv');
    ok((await texto(inv2)).indexOf('Entrar con mi cuenta') < (await texto(inv2)).indexOf('Elige tus servicios'), 'la cuenta (entrar / crear) va arriba y reservar sin cuenta abajo');
    await inv2.click('#reservar .serv');
    await inv2.click('.barb:has-text("Pedro")');
    await esperar(300);
    let diaIdx = 1;
    for (; diaIdx < 10; diaIdx++) { await inv2.click('#tira .dia >> nth=' + diaIdx); await esperar(300); if (await inv2.$('#slots .slot:not([disabled])')) break; }
    const libres1 = await inv2.$$eval('#slots .slot:not([disabled])', (x) => x.map((b) => b.textContent));
    await inv2.click('#slots .slot:not([disabled]) >> nth=0');
    await inv2.fill('.sheet [data-n]', 'Rosa Tiempos');
    await inv2.fill('.sheet [data-t]', '+56 9 1111 2222');
    await inv2.click('.sheet [data-ok]');
    await inv2.waitForURL(/\/r\/\?t=/, { timeout: 15000 });
    const t2 = new URL(inv2.url()).searchParams.get('t');
    const r2 = (await q("select extract(epoch from fin - inicio)::int / 60 as min, to_char(fin at time zone 'America/Santiago', 'HH24:MI') as fin from reservas where token = $1", [t2]))[0];
    ok(r2.min === 90, 'la reserva bloquea 90 min (70 de corte + 20 de descanso)');
    await inv2.goto(BASE + 'b/?b=' + link.split('?b=')[1] + '#reservar');
    await inv2.waitForSelector('#reservar .serv');
    await inv2.click('#reservar .serv');
    await inv2.click('.barb:has-text("Pedro")');
    await esperar(300);
    await inv2.click('#tira .dia >> nth=' + diaIdx);
    await esperar(300);
    const libres2 = await inv2.$$eval('#slots .slot:not([disabled])', (x) => x.map((b) => b.textContent));
    await foto(inv2, 'invitado-horas-con-tiempos');
    ok(libres2.includes(r2.fin) && libres2[0] === r2.fin, 'la siguiente hora libre parte justo cuando termina la anterior (' + r2.fin + '), sin huecos raros · antes: ' + libres1.slice(0, 3).join(', '));

    // 11) Admin: servidor, filtros, planes, reglas y textos
    await adm.click('nav.tabs [data-v="resumen"]');
    await adm.waitForSelector('text=Servidor');
    await foto(adm, 'admin-resumen-servidor');
    await adm.click('nav.tabs [data-v="barberias"]');
    await adm.click('[data-fl="premium"]');
    await esperar(800);
    ok((await texto(adm)).includes('Barbería El Bigote'), 'filtro Premium muestra la barbería (está en sus días de regalo)');
    await adm.click('nav.tabs [data-v="ajustes"]');
    await adm.click('[data-s="reglas"]');
    await adm.fill('[data-r="minutos_pago"]', '12');
    await adm.click('#bGuardar');
    await esperar(800);
    ok((await q("select value from app_settings where key = 'regla_minutos_pago'"))[0].value === '12', 'el admin cambió los minutos para pagar');
    await adm.click('#bVolver');
    await adm.click('[data-s="planes"]');
    await adm.waitForSelector('[data-info="barberia.premium"]');
    await adm.fill('[data-info="barberia.premium"] [data-i="beneficios"]', 'Más barberos\nEstadísticas');
    await adm.click('#bGuardar');
    await esperar(900);
    await foto(adm, 'admin-planes');
    await adm.click('#bVolver');
    await adm.click('[data-s="links"]');
    await adm.fill('[data-g="barberia"] [data-n="1"] [data-m]', '5900');
    await adm.fill('[data-g="barberia"] [data-n="1"] [data-u]', 'https://mpago.la/premium');
    await adm.click('#bGuardar');
    await esperar(900);
    ok((await q("select premium from planes where grupo = 'barberia' and clave = 'precio'"))[0].premium === 5900, 'el precio publicado sale del link activo');
    await adm.click('#bVolver');
    await adm.click('[data-s="registro"]');
    await esperar(600);
    await foto(adm, 'admin-registro');
    ok((await texto(adm)).includes('Pago aprobado'), 'el registro de cambios muestra el pago aprobado');

    if (errores.length) throw new Error('Errores en la página:\n' + errores.join('\n'));
    console.log('✅ FLUJO v2.0 COMPLETO');
  } catch (e) {
    console.error(e.message);
    if (errores.length) console.error(errores.join('\n'));
    process.exitCode = 1;
  } finally { await browser.close(); await pool.end(); }
})();
