/* 🎤 Dictado de la barbería (G20): "corte y barba para Juan mañana a las 5 con Pedro en efectivo" → campos listos.
   Usa el núcleo (voz.js: CFX_PEDIDO.fichas para comparar palabras sin tildes ni plurales; CodeFixVoz.escuchar para el micrófono).
   Dictado.leer(texto, { servicios, clientes, barberos, hoy }) → { servicios: [id], cliente: { id?, nombre }, barbero: id, fecha: 'AAAA-MM-DD', hora: 'HH:MM', medio, monto, propina }
   Dictado.montar(hoja, { datos, aplicar, ejemplo, nota }): pone la fila "🎤 + frase" arriba de la hoja; al dictar o escribir (Enter) llama aplicar(resultado). */
(function (global) {
  'use strict';
  const sinTilde = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const fichas = (t) => (global.CFX_PEDIDO ? global.CFX_PEDIDO.fichas(t) : sinTilde(t).split(/[^a-z0-9ñ]+/).filter(Boolean));
  const N = { una: 1, un: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
    veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50 };
  const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  const sumar = (f, n) => { const [y, m, d] = f.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return x.toISOString().slice(0, 10); };
  const dow = (f) => { const [y, m, d] = f.split('-').map(Number); return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1; };
  const pad = (n) => String(n).padStart(2, '0');
  const num = (w) => (/^\d+$/.test(w) ? +w : N[w]);

  // Montos: "8 mil", "ocho mil", "8.000", "$8000", "quince mil quinientos".
  function plata(t) {
    let m = t.match(/\$?\s*(\d{1,3}(?:\.\d{3})+|\d{3,6})\b(?!\s*:)/); if (m) return +m[1].replace(/\./g, '');
    m = t.match(/\b(\d{1,3}|[a-z]+)\s+mil(?:\s+(quinientos|\d{3}))?\b/); if (!m) return null;
    const a = num(m[1]); if (!a) return null;
    return a * 1000 + (m[2] ? (m[2] === 'quinientos' ? 500 : +m[2]) : 0);
  }

  function leer(texto, o) {
    o = o || {};
    let t = ' ' + sinTilde(texto).replace(/[,.;!?]+(?!\d)/g, ' ').replace(/\s+/g, ' ') + ' ';
    const r = { servicios: [], cliente: null, barbero: null, fecha: null, hora: null, medio: null, monto: null, propina: null };
    const hoy = o.hoy || new Date().toISOString().slice(0, 10);

    // Medio de pago y propina (antes del monto: "propina de 2 mil").
    if (/\befectivo\b/.test(t)) r.medio = 'efectivo';
    else if (/\btransfer\w*|\bdeposito\b|\btarjeta\b/.test(t)) r.medio = 'transferencia';
    t = t.replace(/\b(?:con |de |y )?propina (?:de )?([^ ]+(?: mil)?(?: quinientos)?)/, (x, p) => { r.propina = plata(' ' + p + ' '); return ' '; })
      .replace(/ ([^ ]+(?: mil)?) de propina\b/, (x, p) => { r.propina = plata(' ' + p + ' '); return ' '; });

    // Hora: "17:30", "a las 5", "a las cinco y media", "5 de la tarde", "10 de la manana" (esto antes de "mañana" = día).
    const hm = t.match(/\b(?:a las |las |a la )?(\d{1,2})[:h](\d{2})\b/) ||
      t.match(/\b(?:a las |las |a la )(\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?: (y media|y cuarto|y quince|y treinta|y cuarenta y cinco|menos cuarto))?(?: (de la manana|de la tarde|de la noche|am|pm))?\b/);
    if (hm) {
      let h = num(hm[1]), mi = 0;
      if (/^\d{2}$/.test(hm[2] || '')) mi = +hm[2];
      else if (/media|treinta/.test(hm[2] || '')) mi = 30; else if (/cuarto|quince/.test(hm[2] || '') && !/menos/.test(hm[2])) mi = 15;
      else if (/cuarenta/.test(hm[2] || '')) mi = 45; else if (/menos/.test(hm[2] || '')) { h -= 1; mi = 45; }
      const tarde = /tarde|noche|pm/.test(hm[3] || ''), manana = /manana|am/.test(hm[3] || '');
      if (h && h < 12 && (tarde || (!manana && h <= 8))) h += 12;  // la barbería abre de día: "a las 5" = 17:00
      if (h >= 0 && h <= 23 && mi < 60) r.hora = pad(h) + ':' + pad(mi);
      t = t.replace(hm[0], ' ');
    }
    // Día: hoy / mañana / pasado mañana / el lunes / el 15.
    if (/\bpasado manana\b/.test(t)) { r.fecha = sumar(hoy, 2); t = t.replace(/\bpasado manana\b/, ' '); }
    else if (/\bmanana\b/.test(t)) { r.fecha = sumar(hoy, 1); t = t.replace(/\bmanana\b/, ' '); }
    else if (/\bhoy\b/.test(t)) { r.fecha = hoy; t = t.replace(/\bhoy\b/, ' '); }
    else {
      const d = DIAS.findIndex((x) => new RegExp('\\b' + x + '\\b').test(t));
      if (d >= 0) { let n = (d + 1 - dow(hoy) + 7) % 7; if (!n) n = 7; r.fecha = sumar(hoy, n); t = t.replace(new RegExp('\\b(?:el |este |proximo )?' + DIAS[d] + '\\b'), ' '); }
      else {
        const m = t.match(/\bel (\d{1,2})\b/);
        if (m && +m[1] >= 1 && +m[1] <= 31) { let f = hoy.slice(0, 8) + pad(+m[1]); if (f < hoy) { const [y, mm] = hoy.split('-').map(Number); f = (mm === 12 ? y + 1 : y) + '-' + pad(mm === 12 ? 1 : mm + 1) + '-' + pad(+m[1]); } r.fecha = f; t = t.replace(m[0], ' '); }
      }
    }
    // Monto (Caja): lo que queda con forma de plata.
    r.monto = plata(t);

    const palabras = fichas(t);
    const tiene = (f) => f.length && f.every((w) => palabras.includes(w));
    // Barbero: "con Pedro" (solo el nombre de pila basta).
    const conB = t.match(/\bcon ([a-zñ]+)/g) || [];
    for (const c of conB) {
      const w = fichas(c.slice(4))[0], b = (o.barberos || []).find((x) => fichas(x.nombre)[0] === w);
      if (b) { r.barbero = b.id; t = t.replace(c, ' '); break; }
    }
    // Servicios: los que tienen todas sus palabras en la frase; si uno está dentro de otro ("corte" en "corte con barba"), queda el más largo.
    const cand = (o.servicios || []).map((s) => ({ s, f: fichas(s.nombre) })).filter((x) => tiene(x.f));
    r.servicios = cand.filter((x) => !cand.some((y) => y !== x && y.f.length > x.f.length && x.f.every((w) => y.f.includes(w)))).map((x) => x.s.id);
    // Cliente: "para Juan Pérez" / "a nombre de …" / "cliente …" hasta la próxima palabra de corte.
    const cm = t.match(/\b(?:para|a nombre de|cliente|de cliente) ((?:(?!con |en |por |a las |el |la |y )[a-zñ]+ ?){1,3})/);
    if (cm) {
      const dicho = cm[1].trim(), f = fichas(dicho);
      const c = (o.clientes || []).filter((x) => x.id).map((x) => ({ x, m: fichas(x.nombre).filter((w) => f.includes(w)).length })).filter((y) => y.m).sort((a, b) => b.m - a.m)[0];
      const servDicho = (o.servicios || []).some((s) => fichas(s.nombre).some((w) => f.includes(w)));
      if (c) r.cliente = { id: c.x.id, nombre: c.x.nombre };
      else if (!servDicho) r.cliente = { nombre: dicho.replace(/\b[a-zñ]/g, (l) => l.toUpperCase()) };
    }
    return r;
  }

  // Fila "🎤 + frase" al comienzo de una hoja (C.hoja). aplicar(r) llena los campos.
  function montar(h, o) {
    const caja = document.createElement('div');
    caja.className = 'dictado'; caja.dataset.sinVoz = '1';  // el micrófono es el botón 🎤 de al lado (sin el del núcleo dentro del campo)
    caja.innerHTML = '<div style="display:flex;gap:8px;align-items:center"><input data-dict placeholder="' + (o.ejemplo || 'Dicta o escribe') + '" enterkeyhint="done" style="flex:1;min-width:0;margin:0">' +
      '<button type="button" class="gris" data-mic aria-label="Dictar">🎤</button></div><p class="cfx-nota-btn" data-dict-est>' + (o.nota || 'Toca 🎤 y dilo de una vez: se llenan los campos y los revisas.') + '</p>';
    const tit = h.q('h2');
    if (tit) tit.after(caja); else h.q('.panel').appendChild(caja);
    const inp = caja.querySelector('[data-dict]'), est = caja.querySelector('[data-dict-est]');
    const usar = () => {
      if (!inp.value.trim()) return;
      const r = leer(inp.value, o.datos());
      const n = o.aplicar(r) || 0;
      est.textContent = n ? '✅ Listo: revisa los campos y guarda.' : 'No entendí. Prueba: ' + (o.ejemplo || '');
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); usar(); } });
    inp.addEventListener('change', usar);
    caja.querySelector('[data-mic]').onclick = () => {
      if (!global.CodeFixVoz || !global.CodeFixVoz.escuchar) { est.textContent = 'Este navegador no permite dictar: escríbelo y toca Enter.'; inp.focus(); return; }
      est.textContent = '🎤 Te escucho…';
      global.CodeFixVoz.escuchar({ parcial: (x) => { inp.value = x; } }).then((x) => { inp.value = x || inp.value; usar(); })
        .catch((e) => { est.textContent = e.message + ' También puedes escribirlo.'; });
    };
    return caja;
  }

  global.Dictado = { leer, montar, plata };
})(typeof window !== 'undefined' ? window : globalThis);
