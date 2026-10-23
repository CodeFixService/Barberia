// v2.1 de punta a punta en un navegador real (base limpia: ./preparar.sh):
// admin: QR de registro y socio → socio entra (sin crear ni borrar) → barbería se registra sola con el link del socio →
// invita a otra barbería (referido) → cliente sin cuenta ve la duración real, cancela antes de la aprobación → "no llegó" →
// recordatorio por WhatsApp a los de mañana → resumen del mes → cliente con cuenta: compartir y abono Premium.
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const { Pool } = require('pg');
const fs = require('fs');
const BASE = 'http://localhost:8787/';
const OUT = __dirname + '/capturas/7';
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
const raizLocal = (u) => u.replace(/^https?:\/\/[^/]+\//, BASE);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch());
  try {
    // 1) Admin: link y QR para nuevas barberías, y un socio nuevo
    const adm = await nuevaPagina(browser, 'admin');
    await entrar(adm, 'juanjosuecastilloloyola@gmail.com', 'admin123');
    await adm.waitForSelector('#cQrReg', { timeout: 15000 });
    await adm.click('#cQrReg');
    await adm.waitForSelector('.sheet img[alt="QR"]');
    ok((await adm.inputValue('.sheet input[readonly]')).endsWith('/registro/'), 'el admin tiene link y QR de registro de barberías');
    await foto(adm, 'admin-qr-registro');
    await cerrarHojas(adm);
    await adm.click('nav.tabs [data-v="ajustes"]');
    await adm.click('[data-s="socios"]');
    await adm.click('#bNuevoSocio');
    await adm.fill('.sheet [data-n]', 'Sofía Socia');
    await adm.fill('.sheet [data-e]', 'socia@codefix.cl');
    await adm.fill('.sheet [data-t]', '+56955556666');
    await adm.click('.sheet [data-ok]');
    await adm.waitForSelector('.sheet textarea');
    const claveSocia = await claveDeHoja(adm);
    await cerrarHojas(adm);
    await adm.waitForSelector('[data-socio]');
    ok((await texto(adm)).includes('Sofía Socia'), 'el admin crea un socio y lo ve en Socios');
    await foto(adm, 'admin-socios');

    // 2) La socia entra al mismo panel, sin "+ Barbería", con su propio link de registro
    const soc = await nuevaPagina(browser, 'socia');
    await entrar(soc, 'socia@codefix.cl', claveSocia);
    ok(soc.url().includes('/admin/'), 'la socia entra al panel de CodeFix');
    await soc.waitForSelector('#cQrReg', { timeout: 15000 });
    await soc.click('#cQrReg');
    await soc.waitForSelector('.sheet input[readonly]');
    const linkSocia = await soc.inputValue('.sheet input[readonly]');
    ok(/registro\/\?ref=s-/.test(linkSocia), 'la socia tiene su link de registro: ' + linkSocia);
    await cerrarHojas(soc);
    await soc.click('nav.tabs [data-v="barberias"]');
    await soc.waitForSelector('#bNuevaB');
    ok((await soc.textContent('#bNuevaB')).includes('+ Barbería'), 'la socia también crea barberías (v2.2)');
    await soc.click('nav.tabs [data-v="ajustes"]');
    ok(!(await soc.$('[data-s="socios"]')) && !(await soc.$('[data-s="version"]')), 'la socia no ve Socios ni Versión');
    await foto(soc, 'socia-ajustes');

    // 3) Una barbería se registra sola con el link de la socia
    const own = await nuevaPagina(browser, 'dueño');
    await own.goto(raizLocal(linkSocia));
    await own.waitForSelector('#bCrear', { timeout: 15000 });
    ok((await texto(own)).includes('Te invitó'), 'la página de registro muestra quién invita');
    await own.fill('#rB', 'Barbería La Navaja');
    await own.fill('#rN', 'Nico Dueño');
    await own.fill('#rT', '+56977778888');
    await own.fill('#rE', 'nico@navaja.cl');
    await own.fill('#rC', 'navaja123');
    await own.check('#rOk');
    await foto(own, 'registro-barberia');
    await own.click('#bCrear');
    await own.waitForURL(/\/equipo\//, { timeout: 15000 });
    await own.waitForSelector('nav.tabs');
    await esperar(1200);
    await cerrarHojas(own);
    const [nav] = await q("select b.*, s.email as socia from barberias b left join profiles s on s.id = b.socio_id where b.nombre = 'Barbería La Navaja'");
    ok(nav && nav.registro_solo && nav.socia === 'socia@codefix.cl', 'la barbería quedó registrada sola y a nombre de la socia');
    await own.waitForSelector('#cInvitar', { timeout: 10000 });
    await foto(own, 'dueno-inicio-nuevo');

    // 4) Invita a otra barbería (referido)
    await own.click('#cInvitar');
    await own.waitForSelector('#secZona input[readonly]');
    const linkRef = await own.inputValue('#secZona input[readonly]');
    ok(linkRef.endsWith('/registro/?ref=' + nav.codigo), 'el dueño tiene su link para invitar barberías');
    await foto(own, 'dueno-invita');
    const otra = await nuevaPagina(browser, 'otra');
    await otra.goto(raizLocal(linkRef));
    await otra.waitForSelector('#bCrear');
    ok((await texto(otra)).includes('Barbería La Navaja'), 'la invitada ve que la invitó La Navaja');
    await otra.fill('#rB', 'Barbería El Peine');
    await otra.fill('#rN', 'Pía');
    await otra.fill('#rT', '+56977779999');
    await otra.fill('#rE', 'pia@peine.cl');
    await otra.fill('#rC', 'peine123');
    await otra.check('#rOk');
    await otra.click('#bCrear');
    await otra.waitForURL(/\/equipo\//, { timeout: 15000 });
    ok((await q("select referida_por from barberias where nombre = 'Barbería El Peine'"))[0].referida_por === nav.id, 'la invitada queda como referida de La Navaja');
    await otra.close();

    // 5) Configurar: servicio, tiempos del dueño (descanso 20) y transferencia
    await own.click('nav.tabs [data-v="mas"]');
    await own.click('[data-s="servicios"]');
    await own.click('#bNuevoSer');
    await own.fill('.sheet [data-n]', 'Corte');
    await own.fill('.sheet [data-p]', '10000');
    await own.click('.sheet [data-dur="30"]');
    await own.click('.sheet [data-g]');
    await esperar(800);
    await own.click('#bVolver');
    await own.click('[data-s="tiempos"]');
    await own.waitForSelector('#tDesc');
    await own.selectOption('#tDesc', '20');
    await own.fill('[data-sv]', '40');
    await own.click('#bGuardarT');
    await esperar(800);
    await own.click('#bVolver');
    await own.click('[data-s="links"]');
    await own.waitForSelector('[data-pago="1"]');
    await own.fill('[data-pago="1"] [data-pm]', '4000');
    await own.fill('#tTransf', 'Banco Estado · Cuenta RUT 12345678');
    await own.fill('#tAbP', '0');
    await own.click('#bGuardarL');
    await esperar(900);
    ok((await q("select abono_premium from barberias where id = $1", [nav.id]))[0].abono_premium === 0, 'el dueño deja a los Premium sin abono');

    // 6) Cliente sin cuenta: ve lo que dura de verdad con el barbero, reserva, sube comprobante y cancela al tiro
    const inv = await nuevaPagina(browser, 'invitado');
    await inv.goto(BASE + 'b/?b=' + nav.codigo);
    await inv.waitForSelector('#reservar .serv', { timeout: 15000 });
    ok((await inv.textContent('#reservar .serv')).includes('40 min'), 'el servicio muestra lo que dura con este barbero (40, no 30)');
    await inv.click('#reservar .serv');
    await esperar(400);
    ok((await texto(inv)).includes('Tu cita dura ≈ 1 h con'), 'muestra la duración real con su descanso (40 + 20 = 1 h)');
    await foto(inv, 'invitado-duracion-real');
    let slot = await inv.$('#slots .slot:not([disabled])');
    for (let i = 1; !slot && i < 10; i++) { await inv.click('#tira .dia >> nth=' + i); await esperar(300); slot = await inv.$('#slots .slot:not([disabled])'); }
    await slot.click();
    await inv.waitForSelector('.sheet [data-n]');
    await inv.fill('.sheet [data-n]', 'Gabi Invitada');
    await inv.fill('.sheet [data-t]', '+56 9 1111 3333');
    await inv.click('.sheet [data-ok]');
    await inv.waitForURL(/\/r\/\?t=/, { timeout: 15000 });
    const token = new URL(inv.url()).searchParams.get('t');
    await subirFoto(inv, '[data-foto]');
    await inv.click('[data-enviar]');
    await inv.waitForSelector('text=Tu abono está en revisión', { timeout: 10000 });
    await inv.click('[data-cancelar]');
    await inv.click('.sheet [data-si]');
    await inv.waitForSelector('text=Primero revisa que le haya llegado tu transferencia', { timeout: 10000 });
    ok(true, 'el cliente ve que la devolución depende de que llegue su transferencia');
    await foto(inv, 'invitado-devolucion-por-verificar');

    // 7) El dueño: "devuélvelo solo si llegó" → No llegó
    await own.click('nav.tabs [data-v="hoy"]');
    await own.waitForSelector('[data-nollego]', { timeout: 10000 });
    ok((await texto(own)).includes('devuélvelo solo si la transferencia llegó'), 'Inicio avisa que el abono no estaba aprobado');
    await foto(own, 'dueno-devolucion-sin-verificar');
    await own.click('[data-nollego]');
    await own.click('.sheet [data-si]');
    await own.waitForSelector('.sheet [data-w]', { timeout: 10000 });
    ok((await own.getAttribute('.sheet [data-w]', 'href')).startsWith('https://wa.me/56911113333'), 'se ofrece avisarle por WhatsApp que no llegó');
    await own.click('.sheet [data-no]');
    ok((await q('select devolucion from reservas where token = $1', [token]))[0].devolucion === 'no_llego', 'queda sin devolución');

    // 8) Recordar por WhatsApp a los de mañana (Premium: la barbería está en sus días de regalo)
    await q(`insert into reservas (barberia_id, barbero_id, cliente_nombre, cliente_tel, inicio, fin, estado, servicios, total, abono, pagado_con, creada_por, confirmada_at)
      select b.id, b.owner_id, 'Mario Mañana', '922221111', ((now() at time zone 'America/Santiago')::date + 1 + time '12:00') at time zone 'America/Santiago',
             ((now() at time zone 'America/Santiago')::date + 1 + time '13:00') at time zone 'America/Santiago', 'agendada', '[{"nombre":"Corte"}]', 10000, 0, 'interno', null, now()
      from barberias b where b.id = $1`, [nav.id]);
    await own.click('nav.tabs [data-v="agenda"]');
    await own.click('nav.tabs [data-v="hoy"]');
    await own.waitForSelector('[data-recordar]', { timeout: 10000 });
    const href = await own.getAttribute('[data-recordar]', 'href');
    ok(href.startsWith('https://wa.me/56922221111') && href.includes(encodeURIComponent('r/?t=')), 'recordatorio por WhatsApp con el link de su hora');
    await foto(own, 'dueno-recordar-manana');

    // 9) Resumen del mes
    await own.waitForSelector('[data-ir-res]', { timeout: 10000 });
    await own.click('[data-ir-res]');
    await own.waitForSelector('#resZona .stats', { timeout: 10000 });
    ok((await texto(own)).includes('Ganaste') && !(await own.$('#resZona .borroso')), 'Premium: el resumen del mes muestra las ganancias');
    await foto(own, 'dueno-resumen-mes');
    // En Free, la plata se ve borrosa
    await q("update profiles set plan = 'free', premium_until = null where email = 'nico@navaja.cl'");
    await own.goto(BASE + 'equipo/#resumen');
    await own.waitForSelector('#resZona .borroso', { timeout: 15000 });
    ok(true, 'Free: la plata del resumen se ve borrosa (para que quiera Premium)');
    await foto(own, 'dueno-resumen-free-borroso');

    // 10) Admin: se registraron solas, socia y referida
    await adm.click('nav.tabs [data-v="barberias"]');
    await adm.click('[data-fl="solas"]');
    await esperar(800);
    const t10 = await texto(adm);
    ok(t10.includes('Barbería La Navaja') && t10.includes('Barbería El Peine') && t10.includes('por Barbería La Navaja') && t10.includes('socio Sofía Socia'),
      'el admin ve las barberías registradas solas, quién las trajo y su socio');
    await foto(adm, 'admin-registradas-solas');

    // 11) v2.2: la socia elimina una barbería (escribiendo su nombre) y queda en el registro; el admin lo ve
    await soc.click('nav.tabs [data-v="barberias"]');
    await soc.waitForSelector('.barb-card');
    await soc.click('.barb-card:has-text("Barbería El Peine")');
    await soc.waitForSelector('.sheet [data-eliminar]', { timeout: 10000 });
    await soc.click('.sheet [data-eliminar]');
    await soc.waitForSelector('.sheet [data-v]');
    await soc.fill('.sheet [data-v]', 'Barbería El Peine');
    await soc.click('.sheet [data-si]');
    await esperar(1500);
    ok(!(await q("select 1 from barberias where nombre = 'Barbería El Peine'")).length && !(await q("select 1 from auth.users where email = 'pia@peine.cl'")).length,
      'la socia elimina una barbería completa (escribiendo su nombre)');
    await adm.click('nav.tabs [data-v="ajustes"]');
    await adm.click('[data-s="registro"]');
    await adm.click('[data-f="socios"]');
    await adm.waitForSelector('text=Eliminar barbería', { timeout: 10000 });
    ok((await texto(adm)).includes('Sofía Socia · CodeFix'), 'el admin ve en el registro lo que eliminó la socia y quién fue');
    await foto(adm, 'admin-registro-socios');
    // El dueño elimina un cliente con cuenta desde su ficha
    await q("insert into auth.users (email, raw_user_meta_data) values ('cli@navaja.cl', $1)", [JSON.stringify({ rol: 'cliente', barberia: nav.codigo, nombre: 'Cliente Borrable', telefono: '+56933332222' })]);
    await own.goto(BASE + 'equipo/#clientes');
    await own.waitForSelector('#lCli li', { timeout: 15000 });
    await own.click('#lCli li:has-text("Cliente Borrable")');
    await own.click('.sheet [data-eliminar]');
    await own.click('.sheet [data-si]');
    await esperar(1200);
    ok(!(await q("select 1 from profiles where email = 'cli@navaja.cl'")).length, 'el dueño elimina un cliente desde su ficha');

    ok(!errores.length, 'sin errores en el navegador' + (errores.length ? ':\n' + errores.join('\n') : ''));
    console.log('✅ FLUJO v2.1 COMPLETO');
  } catch (e) {
    console.error(e.message);
    if (errores.length) console.error(errores.join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
    await pool.end();
  }
})();
