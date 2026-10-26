/* Núcleo compartido: utilidades, fechas en hora de Chile, hojas (modales), imágenes, colores y marca. */
(function (global) {
  'use strict';

  const cfg = global.BARB_CONFIG || {};
  // La app se mudó de GitHub Pages a Cloudflare: la dirección antigua redirige a la nueva (con la misma página y datos).
  if (location.hostname === 'codefixservice.github.io' && cfg.SITIO) {
    location.replace(cfg.SITIO + location.pathname.replace(/^\/Barberia\//i, '') + location.search + location.hash);
  }
  const ZONA = cfg.ZONA || 'America/Santiago';
  const VERSION = '2.4';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plata = (n) => '$' + Math.round(Number(n || 0)).toLocaleString('es-CL');
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------- Avisos flotantes ---------- */
  let toastTimer;
  function toast(msg, ms) {
    let el = $('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms || 2800);
  }
  const errorTxt = (e) => String((e && (e.message || e.error_description || e)) || 'Error').replace(/^\w*Error:\s*/, '');

  /* ---------- Fechas (siempre en hora de Chile, aunque el celular esté en otra zona) ---------- */
  const fmtPartes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  function partes(d) {
    const o = {};
    fmtPartes.formatToParts(d instanceof Date ? d : new Date(d)).forEach((p) => { o[p.type] = p.value; });
    return { y: +o.year, m: +o.month, d: +o.day, hh: +o.hour, mm: +o.minute };
  }
  // 'YYYY-MM-DD' de un instante, en hora de Chile.
  function fechaDe(d) { const p = partes(d); return p.y + '-' + pad(p.m) + '-' + pad(p.d); }
  function horaDe(d) { const p = partes(d); return pad(p.hh) + ':' + pad(p.mm); }
  function minutosDe(d) { const p = partes(d); return p.hh * 60 + p.mm; }
  const hoy = () => fechaDe(new Date());
  function sumarDias(f, n) {
    const [y, m, d] = f.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
  }
  // Día de la semana: 1 = lunes … 7 = domingo.
  function dow(f) { const [y, m, d] = f.split('-').map(Number); return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1; }
  // Instante (Date) de una fecha y hora de Chile.
  function instante(f, hhmm) {
    const [y, m, d] = f.split('-').map(Number);
    const [hh, mm] = (hhmm || '00:00').split(':').map(Number);
    const base = Date.UTC(y, m - 1, d, hh, mm);
    let t = base;
    for (let i = 0; i < 2; i++) {
      const p = partes(new Date(t));
      const visto = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm);
      t += base - visto;
    }
    return new Date(t);
  }
  const aMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + m; };
  const aHHMM = (min) => pad(Math.floor(min / 60)) + ':' + pad(min % 60);
  const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const DIAS_LARGO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function diaCorto(f) { const d = f.split('-'); return DIAS[dow(f) - 1] + ' ' + (+d[2]); }
  function fechaLarga(f) { const d = f.split('-'); return DIAS_LARGO[dow(f) - 1] + ' ' + (+d[2]) + ' de ' + MESES[+d[1] - 1]; }
  // "jue 16/10 · 18:30"
  function cuando(t) { const f = fechaDe(t); const d = f.split('-'); return DIAS[dow(f) - 1] + ' ' + (+d[2]) + '/' + d[1] + ' · ' + horaDe(t); }
  function hace(t) {
    const s = (Date.now() - new Date(t).getTime()) / 1000;
    if (s < 60) return 'recién';
    if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.floor(s / 3600) + ' h';
    if (s < 172800) return 'ayer';
    return cuando(t).split(' · ')[0];
  }
  // "🟢 En línea" (últimos 2 min) · "Visto hace 15 min" · "⚪ Nunca entró".
  function conexion(t) {
    if (!t) return { txt: '⚪ Nunca entró', on: false };
    const s = (Date.now() - new Date(t).getTime()) / 1000;
    if (s < 120) return { txt: '🟢 En línea', on: true };
    return { txt: 'Visto ' + (s < 172800 ? hace(t) : 'el ' + cuando(t).split(' · ')[0]), on: false };
  }
  function relativoDia(f) {
    const h = hoy();
    if (f === h) return 'Hoy';
    if (f === sumarDias(h, 1)) return 'Mañana';
    if (f === sumarDias(h, -1)) return 'Ayer';
    return fechaLarga(f);
  }

  /* ---------- Hojas (modales que suben desde abajo) ---------- */
  function hoja(html, opts) {
    opts = opts || {};
    const s = document.createElement('div');
    s.className = 'sheet';
    s.innerHTML = '<div class="panel" role="dialog" aria-modal="true"><button class="icono cerrar" type="button" aria-label="Cerrar">✕</button>' + html + '</div>';
    const cerrar = () => { s.remove(); document.removeEventListener('keydown', tecla); if (opts.alCerrar) opts.alCerrar(); };
    const tecla = (e) => { if (e.key === 'Escape') cerrar(); };
    s.addEventListener('click', (e) => { if (e.target === s) cerrar(); });
    s.querySelector('.cerrar').onclick = cerrar;
    document.addEventListener('keydown', tecla);
    document.body.appendChild(s);
    s.cerrar = cerrar;
    s.q = (sel) => s.querySelector(sel);
    s.qa = (sel) => s.querySelectorAll(sel);
    return s;
  }
  function confirmar(msg, opts) {
    opts = opts || {};
    return new Promise((ok) => {
      let r = false;
      const h = hoja('<h2>' + esc(opts.titulo || '¿Seguro?') + '</h2><p style="white-space:pre-line">' + esc(msg) + '</p>' +
        '<div class="btns fin"><button class="gris" data-no>' + esc(opts.no || 'Cancelar') + '</button>' +
        '<button class="' + (opts.peligro ? 'danger' : '') + '" data-si>' + esc(opts.si || 'Sí') + '</button></div>', { alCerrar: () => ok(r) });
      h.q('[data-no]').onclick = () => h.cerrar();
      h.q('[data-si]').onclick = () => { r = true; h.cerrar(); };
    });
  }
  function pedir(titulo, opts) {
    opts = opts || {};
    return new Promise((ok) => {
      let r = null;
      const h = hoja('<h2>' + esc(titulo) + '</h2>' + (opts.texto ? '<p class="muted">' + esc(opts.texto) + '</p>' : '') +
        (opts.largo ? '<textarea data-v maxlength="' + (opts.max || 300) + '"></textarea>' : '<input data-v maxlength="' + (opts.max || 120) + '">') +
        '<div class="btns fin"><button class="gris" data-no>Cancelar</button><button data-si>' + esc(opts.si || 'Listo') + '</button></div>',
        { alCerrar: () => ok(r) });
      const v = h.q('[data-v]');
      v.value = opts.valor || '';
      if (opts.placeholder) v.placeholder = opts.placeholder;
      setTimeout(() => v.focus(), 50);
      h.q('[data-no]').onclick = () => h.cerrar();
      h.q('[data-si]').onclick = () => { r = v.value.trim(); h.cerrar(); };
    });
  }

  // Botón ocupado mientras corre una acción; muestra el error si falla.
  async function accion(btn, fn, okMsg) {
    const txt = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳'; }
    try {
      const r = await fn();
      if (okMsg) toast(okMsg);
      return r;
    } catch (e) {
      toast('⚠️ ' + errorTxt(e), 4200);
      throw e;
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = txt; }
    }
  }

  /* ---------- WhatsApp ---------- */
  function numeroWsp(n) {
    let d = String(n || '').replace(/\D/g, '');
    if (d.length === 9 && d[0] === '9') d = '56' + d; // celular chileno sin código
    if (d.length === 8) d = '569' + d;
    return d;
  }
  const wa = (n, txt) => 'https://wa.me/' + numeroWsp(n) + (txt ? '?text=' + encodeURIComponent(txt) : '');

  /* ---------- Imágenes livianas ---------- */
  function imagen(file, maxLado, calidad) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, (maxLado || 800) / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', calidad || 0.7));
      };
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.src = URL.createObjectURL(file);
    });
  }
  // Abre la cámara/galería y devuelve la imagen comprimida.
  function elegirImagen(maxLado, calidad, camara) {
    return new Promise((ok) => {
      const i = document.createElement('input');
      i.type = 'file'; i.accept = 'image/*';
      if (camara) i.capture = 'environment';
      i.onchange = async () => { if (!i.files[0]) return ok(null); try { ok(await imagen(i.files[0], maxLado, calidad)); } catch (e) { toast(errorTxt(e)); ok(null); } };
      i.click();
    });
  }
  // Solo imágenes en base64 (las valida el servidor), así no se puede inyectar nada en el estilo.
  const fondo = (dataUrl) => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl || '') ? "background-image:url('" + dataUrl + "')" : '';
  function avatar(p, clase) {
    const f = p && p.foto;
    return '<span class="av ' + (clase || '') + '" style="' + fondo(f) + '">' + (f ? '' : esc((p && p.avatar) || '🙂')) + '</span>';
  }

  /* ---------- Colores ---------- */
  const COLORES = [
    ['Bronce', '#b07d2b'], ['Negro', '#18181b'], ['Grafito', '#3f3f46'], ['Rojo barbero', '#b91c1c'], ['Azul', '#1d4ed8'],
    ['Marino', '#1e3a8a'], ['Verde', '#15803d'], ['Esmeralda', '#047857'], ['Turquesa', '#0e7490'], ['Violeta', '#6d28d9'],
    ['Rosa', '#be185d'], ['Naranja', '#c2410c']
  ];
  const COLORES_LIBRES = ['#b07d2b', '#18181b', '#1d4ed8', '#15803d'];
  const EMOJIS = ['🙂', '😎', '🧔', '👨', '👩', '🧑', '👦', '👧', '🧑‍🦱', '🧑‍🦰', '🧑‍🦳', '🧑‍🦲', '💈', '✂️', '🪒', '🔥', '⚡', '⭐', '👑', '🦁', '🐺', '🦅', '🐯', '🐉', '⚽', '🏀', '🎮', '🎧', '🎸', '🚀', '🏍️', '🚗', '💎', '🍀', '🌊', '🌵'];
  const EMOJIS_LIBRES = 12;
  function tinta(hex) {
    const n = parseInt(hex.slice(1), 16);
    const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return l > 0.62 ? '#17150f' : '#ffffff';
  }
  function aplicarColor(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return;
    const r = document.documentElement.style;
    r.setProperty('--brand', hex);
    r.setProperty('--brand-ink', tinta(hex));
    let m = document.querySelector('meta[name=theme-color]');
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
    m.content = hex;
  }
  function aplicarTema(t) {
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  }
  try { aplicarTema(localStorage.getItem('barb:tema')); aplicarColor(localStorage.getItem('barb:color')); } catch (e) { /* sin acceso */ }

  /* ---------- Varios ---------- */
  function registrarSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register(raiz() + 'sw.js', { scope: raiz(), updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
  }
  function raiz() {
    const s = document.querySelector('script[src*="shared/core.js"]');
    return s ? s.src.replace(/shared\/core\.js.*$/, '') : './';
  }
  function marca(discreta) {
    const el = document.createElement('footer');
    el.className = 'marca' + (discreta ? ' discreta' : '');
    el.innerHTML = '💈 App de reservas por <b>' + esc(cfg.MARCA || 'CodeFix') + '</b> · ' + esc(cfg.AUTOR || '') +
      ' <span class="ver">v' + VERSION + '</span>';
    (document.querySelector('main') || document.body).appendChild(el);
  }
  function copiar(txt) {
    const fin = () => toast('📋 Copiado');
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(fin, () => prompt('Copia:', txt));
    else prompt('Copia:', txt);
  }
  function guardar(k, v) { try { localStorage.setItem('barb:' + k, JSON.stringify(v)); } catch (e) { /* lleno */ } }
  function leer(k, def) { try { const v = localStorage.getItem('barb:' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }
  // Archivo .ics para agregar la hora al calendario del celular.
  function ics(titulo, inicio, fin, lugar) {
    const z = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const txt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CodeFix//Barberia//ES', 'BEGIN:VEVENT',
      'UID:' + z(inicio) + '-' + Math.random().toString(36).slice(2) + '@barberia', 'DTSTAMP:' + z(new Date()),
      'DTSTART:' + z(inicio), 'DTEND:' + z(fin), 'SUMMARY:' + titulo.replace(/[,;]/g, ' '), lugar ? 'LOCATION:' + lugar.replace(/[,;]/g, ' ') : '',
      'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:' + titulo.replace(/[,;]/g, ' '), 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/calendar' }));
    a.download = 'mi-hora.ics';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function googleCal(titulo, inicio, fin, lugar) {
    const z = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(titulo) +
      '&dates=' + z(inicio) + '/' + z(fin) + (lugar ? '&location=' + encodeURIComponent(lugar) : '');
  }

  // Código QR como imagen (usa shared/vendor/qrcode.js).
  function qr(texto, px) {
    if (!global.qrcode) return '';
    const q = global.qrcode(0, 'M'); q.addData(texto); q.make();
    const n = q.getModuleCount(), m = 3, c = document.createElement('canvas'), k = Math.max(2, Math.floor((px || 320) / (n + 2 * m)));
    c.width = c.height = k * (n + 2 * m);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let j = 0; j < n; j++) if (q.isDark(r, j)) g.fillRect((j + m) * k, (r + m) * k, k, k);
    return c.toDataURL();
  }

  global.Core = {
    $, esc, plata, pad, toast, errorTxt, partes, fechaDe, horaDe, minutosDe, hoy, sumarDias, dow, instante, aMin, aHHMM,
    DIAS, DIAS_LARGO, MESES, diaCorto, fechaLarga, cuando, hace, conexion, relativoDia, hoja, confirmar, pedir, accion, wa, numeroWsp,
    imagen, elegirImagen, fondo, avatar, COLORES, COLORES_LIBRES, EMOJIS, EMOJIS_LIBRES, aplicarColor, aplicarTema, tinta,
    registrarSW, raiz, marca, copiar, guardar, leer, ics, googleCal, qr, version: VERSION, ZONA
  };
})(window);
