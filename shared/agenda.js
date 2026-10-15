/* Calendario: horas libres según horario, colación, bloqueos y reservas; vistas Día, Semana, Mes y Año. */
(function (global) {
  'use strict';
  const C = global.Core;
  const esc = C.esc;
  const ACTIVAS = ['esperando_abono', 'en_revision', 'por_aprobar', 'agendada', 'confirmada', 'ocupado'];
  const PASO = 15;

  const diaHorario = (horario, f) => (horario && horario[C.dow(f) - 1]) || { e: 'x' };

  // Rangos ocupados (en minutos del día) de un barbero en una fecha.
  function ocupados(barbero, f, datos, conAtendidas) {
    const out = [];
    const ini = C.instante(f, '00:00').getTime(), fin = C.instante(C.sumarDias(f, 1), '00:00').getTime();
    const rango = (a, b) => {
      const s = Math.max(new Date(a).getTime(), ini), e = Math.min(new Date(b).getTime(), fin);
      if (e <= s) return null;
      return [Math.round((s - ini) / 60000), Math.round((e - ini) / 60000)];
    };
    (datos.reservas || []).forEach((r) => {
      if (r.barbero_id !== barbero) return;
      if (!ACTIVAS.includes(r.estado) && !(conAtendidas && (r.estado === 'atendida' || r.estado === 'no_vino'))) return;
      const x = rango(r.inicio, r.fin);
      if (x) out.push({ a: x[0], b: x[1], r });
    });
    (datos.bloqueos || []).forEach((k) => {
      if (k.barbero_id && k.barbero_id !== barbero) return;
      const x = rango(k.desde, k.hasta);
      if (x) out.push({ a: x[0], b: x[1], bloqueo: k });
    });
    return out;
  }

  // Minutos que bloquea una cita con un barbero: lo que a él le dura cada servicio + su descanso entre citas.
  function duracion(barbero, servicios) {
    const d = (barbero && barbero.duraciones) || {};
    const base = (servicios || []).reduce((t, s) => t + (+d[s.id] > 0 ? +d[s.id] : s.duracion), 0);
    return base ? base + (+(barbero && barbero.descanso) || 0) : 0;
  }

  // Horas para reservar de un barbero en un día, para una cita de "dur" minutos.
  // Parten desde que abre, cada "paso" minutos (lo elige cada barbero), y además justo cuando termina otra cita,
  // la colación o un bloqueo: así no quedan huecos raros (si alguien toma 10:00 por 1 h 30, la siguiente es 11:30).
  function horas(o) {
    const d = diaHorario(o.horario, o.f);
    if (d.e === 'x') return [];
    const ini = C.aMin(d.i), fin = C.aMin(d.f);
    const ci = d.ci ? C.aMin(d.ci) : null, cf = d.cf ? C.aMin(d.cf) : null;
    const occ = ocupados(o.barbero, o.f, o.datos);
    const ahora = Date.now() + (o.anticipacion === undefined ? 60 : o.anticipacion) * 60000;
    const paso = Math.max(5, +o.paso || PASO);
    const cand = new Set();
    for (let m = ini; m + o.dur <= fin; m += paso) cand.add(m);
    const sumar = (m) => { m = Math.ceil(m / 5) * 5; if (m >= ini && m + o.dur <= fin) cand.add(m); };
    occ.forEach((x) => sumar(x.b));
    if (cf !== null) sumar(cf);
    const out = [];
    for (const m of [...cand].sort((a, b) => a - b)) {
      if (ci !== null && m < cf && m + o.dur > ci) continue;
      const t = C.instante(o.f, C.aHHMM(m));
      let estado = 'libre';
      const choque = occ.find((x) => m < x.b && m + o.dur > x.a);
      if (choque) estado = choque.r && choque.r.mia && choque.a === m ? 'mia' : 'ocupado';
      else if (t.getTime() < ahora) estado = 'pasado';
      out.push({ min: m, hhmm: C.aHHMM(m), t, estado, reserva: choque && choque.r });
    }
    // Las horas propias se muestran una sola vez (en su inicio).
    return out.filter((s) => s.estado !== 'pasado');
  }

  // Qué tan lleno está un día (para los puntitos del mes): 0..1, o null si no se atiende.
  function llenado(barberos, f, datos, horarios) {
    let abiertos = 0, ocup = 0, mio = false, consultar = false, n = 0;
    barberos.forEach((b) => {
      const d = diaHorario(horarios[b], f);
      if (d.e === 'x') return;
      let mins = C.aMin(d.f) - C.aMin(d.i);
      if (d.ci && d.cf) mins -= C.aMin(d.cf) - C.aMin(d.ci);
      abiertos += Math.max(0, mins);
      ocupados(b, f, datos, true).forEach((x) => {
        ocup += x.b - x.a;
        if (x.r) { n++; if (x.r.mia) mio = true; }
      });
    });
    if (!abiertos) return { cerrado: true, n, mio };
    return { pct: Math.min(1, ocup / abiertos), n, mio, consultar };
  }
  const nivel = (p) => (p >= 0.85 ? 'lleno' : p >= 0.5 ? 'medio' : '');

  /* ---------- Vista de tiras de días (para elegir fecha) ---------- */
  function tiraDias(el, o) {
    const dias = [];
    for (let i = 0; i < o.cuantos; i++) dias.push(C.sumarDias(o.desde || C.hoy(), i));
    el.innerHTML = dias.map((f) => {
      const ll = o.info ? o.info(f) : {};
      const cl = ['dia'];
      if (f === o.sel) cl.push('on');
      if (ll.cerrado) cl.push('cerrado');
      if (ll.consultar) cl.push('consultar');
      return '<button class="' + cl.join(' ') + '" data-f="' + f + '"><small>' + C.DIAS[C.dow(f) - 1] + '</small><b>' + (+f.slice(8)) + '</b>' +
        '<i>' + (f === C.hoy() ? 'hoy' : C.MESES[+f.slice(5, 7) - 1].slice(0, 3)) + '</i>' +
        '<span class="punto ' + (ll.cerrado ? 'no' : nivel(ll.pct || 0)) + '"></span></button>';
    }).join('');
    el.querySelectorAll('.dia').forEach((b) => b.onclick = () => o.alElegir(b.dataset.f));
    const on = el.querySelector('.on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  /* ---------- Línea de tiempo: Día (columnas = barberos) o Semana (columnas = días) ---------- */
  function timeline(el, o) {
    // o.cols: [{ f, barbero, titulo, hoy }]
    const PX = o.px || 1.15;
    let min = 24 * 60, max = 0;
    o.cols.forEach((c) => {
      const d = diaHorario(o.horarios[c.barbero], c.f);
      if (d.e !== 'x') { min = Math.min(min, C.aMin(d.i)); max = Math.max(max, C.aMin(d.f)); }
      ocupados(c.barbero, c.f, o.datos, true).forEach((x) => { min = Math.min(min, x.a); max = Math.max(max, x.b); });
      (o.datos.reservas || []).filter((r) => r.estado === 'anulada' && r.barbero_id === c.barbero && C.fechaDe(r.inicio) === c.f)
        .forEach((r) => { min = Math.min(min, C.minutosDe(r.inicio)); });
    });
    if (min >= max) { min = 9 * 60; max = 20 * 60; }
    min = Math.floor(min / 60) * 60; max = Math.ceil(max / 60) * 60;
    const alto = (max - min) * PX;
    const TOP = 52;
    const y = (m) => (m - min) * PX + TOP;
    let html = '<div class="tl" style="grid-template-columns:44px repeat(' + o.cols.length + ',minmax(' + (o.ancho || 92) + 'px,1fr))">';
    html += '<div class="horas" style="height:' + (alto + TOP + 12) + 'px;position:relative"><div class="cab" style="position:sticky"></div>';
    for (let m = min; m <= max; m += 60) html += '<div class="h" style="top:' + y(m) + 'px">' + C.aHHMM(m) + '</div>';
    html += '</div>';
    o.cols.forEach((c, ci) => {
      const d = diaHorario(o.horarios[c.barbero], c.f);
      html += '<div class="col" data-ci="' + ci + '" style="height:' + (alto + TOP + 12) + 'px"><div class="cab' + (c.hoy ? ' hoy' : '') + '">' + c.titulo + '</div>';
      for (let m = min; m <= max; m += 60) html += '<div class="linea" style="top:' + y(m) + 'px"></div>';
      // Fuera de horario (rayado)
      if (d.e === 'x') html += '<div class="fuera" style="top:' + TOP + 'px;height:' + alto + 'px"></div>';
      else {
        if (C.aMin(d.i) > min) html += '<div class="fuera" style="top:' + TOP + 'px;height:' + (C.aMin(d.i) - min) * PX + 'px"></div>';
        if (C.aMin(d.f) < max) html += '<div class="fuera" style="top:' + y(C.aMin(d.f)) + 'px;height:' + (max - C.aMin(d.f)) * PX + 'px"></div>';
        if (d.ci && d.cf) html += '<div class="fuera" style="top:' + y(C.aMin(d.ci)) + 'px;height:' + (C.aMin(d.cf) - C.aMin(d.ci)) * PX + 'px" title="Colación"></div>';
        if (o.alLibre) {
          for (let m = C.aMin(d.i); m < C.aMin(d.f); m += 30) {
            html += '<div class="libre" data-ci="' + ci + '" data-m="' + m + '" style="top:' + y(m) + 'px;height:' + 30 * PX + 'px"></div>';
          }
        }
      }
      ocupados(c.barbero, c.f, o.datos, true).forEach((x) => {
        const h = Math.max(18, (x.b - x.a) * PX - 2);
        if (x.bloqueo) {
          html += '<div class="bloque bloqueo" data-bq="' + x.bloqueo.id + '" style="top:' + y(x.a) + 'px;height:' + h + 'px"><b>⛔ ' + esc(x.bloqueo.motivo || 'Bloqueado') + '</b></div>';
          return;
        }
        const r = x.r;
        const cls = r.detalle ? r.estado + (r.mia && !o.staff ? ' mia' : '') : 'ocupado';
        const txt = r.detalle
          ? '<b>' + C.horaDe(r.inicio) + ' ' + esc(o.staff ? r.cliente : 'Mi hora') + '</b>' + esc((r.servicios || []).map((s) => s.nombre).join(' + '))
          : '<b>Ocupado</b>';
        html += '<div class="bloque ' + cls + '" data-id="' + (r.id || '') + '" style="top:' + y(x.a) + 'px;height:' + h + 'px">' + txt + '</div>';
      });
      if (o.staff) {
        (o.datos.reservas || []).filter((r) => r.estado === 'anulada' && r.barbero_id === c.barbero && C.fechaDe(r.inicio) === c.f && o.verAnuladas)
          .forEach((r) => {
            const a = C.minutosDe(r.inicio), b = a + (new Date(r.fin) - new Date(r.inicio)) / 60000;
            html += '<div class="bloque anulada" data-id="' + r.id + '" style="top:' + y(a) + 'px;height:' + Math.max(18, (b - a) * PX - 2) + 'px;left:50%"><b>' + esc(r.cliente) + '</b></div>';
          });
      }
      if (c.f === C.hoy()) {
        const ahora = C.minutosDe(new Date());
        if (ahora >= min && ahora <= max) html += '<div class="ahora" style="top:' + y(ahora) + 'px"></div>';
      }
      html += '</div>';
    });
    html += '</div>';
    el.innerHTML = html;
    el.querySelectorAll('.bloque[data-id]').forEach((b) => { if (b.dataset.id && o.alBloque) b.onclick = (e) => { e.stopPropagation(); o.alBloque(b.dataset.id); }; });
    el.querySelectorAll('.bloque[data-bq]').forEach((b) => { if (o.alBloqueo) b.onclick = (e) => { e.stopPropagation(); o.alBloqueo(b.dataset.bq); }; });
    el.querySelectorAll('.libre').forEach((b) => b.onclick = () => { const c = o.cols[+b.dataset.ci]; o.alLibre(c, +b.dataset.m); });
    // Lleva la vista cerca de la hora actual o del inicio.
    const tl = el.querySelector('.tl');
    const ahora = C.minutosDe(new Date());
    if (tl && o.cols.some((c) => c.f === C.hoy()) && ahora > min) tl.scrollTop = Math.max(0, y(ahora) - 120);
  }

  /* ---------- Mes ---------- */
  function mes(el, o) {
    // o.mes 'YYYY-MM'; o.info(f) → { pct, cerrado, n, mio }; o.alDia(f)
    const f1 = o.mes + '-01';
    const offset = C.dow(f1) - 1;
    const [y, m] = o.mes.split('-').map(Number);
    const dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let html = '<div class="mes">' + C.DIAS.map((d) => '<div class="cab">' + d + '</div>').join('');
    for (let i = 0; i < offset; i++) html += '<div class="d vacio"></div>';
    const h = C.hoy();
    for (let d = 1; d <= dias; d++) {
      const f = o.mes + '-' + C.pad(d);
      const ll = o.info(f) || {};
      const cl = ['d'];
      if (f === h) cl.push('hoy');
      if (ll.cerrado) cl.push('cerrado');
      if (f < h) cl.push('pasado');
      if (ll.mio) cl.push('mio');
      html += '<button class="' + cl.join(' ') + '" data-f="' + f + '"><span>' + d + '</span>' +
        (ll.cerrado ? '<span class="n">—</span>' : '<span class="n">' + (ll.n ? ll.n + (o.staff ? ' h' : '') : (ll.consultar ? '🟡' : '')) + '</span>') +
        '<span class="bar"><i class="' + nivel(ll.pct || 0) + '" style="width:' + Math.round((ll.pct || 0) * 100) + '%"></i></span></button>';
    }
    html += '</div>';
    el.innerHTML = html;
    el.querySelectorAll('.d[data-f]').forEach((b) => b.onclick = () => o.alDia(b.dataset.f));
  }

  /* ---------- Año (resumen) ---------- */
  function anio(el, o) {
    let html = '<div class="anio">';
    for (let m = 1; m <= 12; m++) {
      const mm = o.anio + '-' + C.pad(m);
      const f1 = mm + '-01';
      const dias = new Date(Date.UTC(+o.anio, m, 0)).getUTCDate();
      let mini = '';
      for (let i = 0; i < C.dow(f1) - 1; i++) mini += '<i style="visibility:hidden"></i>';
      let tot = 0;
      for (let d = 1; d <= dias; d++) {
        const ll = o.info(mm + '-' + C.pad(d)) || {};
        tot += ll.n || 0;
        const p = ll.pct || 0;
        mini += '<i style="background:' + (ll.cerrado ? 'transparent' : p ? 'color-mix(in srgb, var(--brand) ' + Math.round(20 + p * 80) + '%, transparent)' : 'var(--field)') + '"></i>';
      }
      html += '<div class="m" data-m="' + mm + '"><b>' + C.MESES[m - 1][0].toUpperCase() + C.MESES[m - 1].slice(1) + '</b> <span class="muted chico">' + tot + ' horas</span><div class="mini">' + mini + '</div></div>';
    }
    el.innerHTML = html + '</div>';
    el.querySelectorAll('.m').forEach((b) => b.onclick = () => o.alMes(b.dataset.m));
  }

  // Texto de horario de un día: "10:00–20:00 (colación 14:00–15:00)".
  function horarioTxt(d) {
    if (!d || d.e === 'x') return 'Cerrado';
    return d.i + '–' + d.f + (d.ci ? ' · colación ' + d.ci + '–' + d.cf : '');
  }

  const ESTADOS = {
    esperando_abono: 'Esperando abono', en_revision: 'En revisión', por_aprobar: 'En revisión', agendada: 'Agendada', confirmada: 'Agendada',
    atendida: 'Atendida', no_vino: 'No vino', anulada: 'Anulada'
  };
  const estadoPill = (e) => '<span class="est ' + e + '">' + (ESTADOS[e] || e) + '</span>';

  global.Agenda = { horas, duracion, ocupados, llenado, nivel, tiraDias, timeline, mes, anio, horarioTxt, diaHorario, estadoPill, ESTADOS, ACTIVAS };
})(window);
