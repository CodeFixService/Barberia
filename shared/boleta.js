/* CodeFix · Núcleo · 🧾 Boleta SII (G92). Datos del emisor + emitir la boleta de una venta. SQL: nucleo/sql/boleta.sql.
   Manual = la emites gratis en el SII y anotas el N°. Automática = OpenFactura (API key del negocio) la emite sola.
   Uso:  CFX_BOLETA.ajustes(zona, { rpc })            → formulario (solo el dueño guarda)
         CFX_BOLETA.estado(rpc)                       → { puede, dueno, conectado, modo, auto, … } (en memoria)
         CFX_BOLETA.emitir(rpc, 'mi_funcion', args)   → llama la función de la app; si es manual pide el N° (CFX_DIALOGO) y la vuelve a llamar con p_folio.
   rpc(nombre, args) = la de cada app (devuelve la respuesta o lanza error). */
(function () {
  if (window.CFX_BOLETA) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const D = () => window.CFX_DIALOGO || { avisar: async (t) => alert(t), pedir: async (t) => prompt(t), confirmar: async (t) => confirm(t) };
  const aviso = (t) => (window.CFX_AVISO ? window.CFX_AVISO(t) : D().avisar(t));
  let cache = null;
  async function estado(rpc, fresco) {
    if (!cache || fresco) cache = Promise.resolve(rpc('cfx_boleta_estado', {})).catch(() => ({ puede: false }));
    return cache;
  }
  const css = () => {
    if (document.getElementById('cfx-bol-css')) return;
    const s = document.createElement('style'); s.id = 'cfx-bol-css';
    s.textContent = '.cfx-bol{display:grid;gap:8px}.cfx-bol label{display:block;margin:6px 0 0;font-weight:600}.cfx-bol input[type=text],.cfx-bol input:not([type]){width:100%;box-sizing:border-box}' +
      '.cfx-bol-modos{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cfx-bol-modos button{display:block!important;width:100%!important;min-width:0!important;height:auto!important;text-align:center!important;flex-direction:column!important;min-height:64px;padding:8px!important;margin:0!important;border-radius:14px;border:1px solid var(--cfx-borde,#dce3ea);background:var(--cfx-tarjeta,#fff);color:inherit;font:inherit;line-height:1.25;white-space:normal}' +
      '.cfx-bol-modos button.on{border-color:var(--brand,var(--marca,#2563eb));box-shadow:0 0 0 2px var(--brand,var(--marca,#2563eb)) inset}.cfx-bol-modos small{display:block!important;margin-top:2px;color:var(--cfx-texto-2,#5b6472);font-weight:400}' +
      '.cfx-bol-nota{margin:0;font-size:13px;color:var(--cfx-texto-2,#5b6472)}.cfx-bol-si{display:flex;gap:8px;align-items:center;font-weight:400!important}.cfx-bol-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}.cfx-bol-btns button{flex:1 1 140px}';
    document.head.appendChild(s);
  };
  const CAMPOS = [['rut', 'RUT de la empresa', '76.123.456-7', 12], ['razon', 'Razón social', 'Mi Negocio SpA', 100], ['giro', 'Giro', 'Venta y reparación', 80], ['direccion', 'Dirección', 'Av. Siempre Viva 123', 70], ['comuna', 'Comuna', 'Santiago', 20]];
  async function ajustes(zona, op) {
    css(); op = op || {};
    const rpc = op.rpc; let e = await estado(rpc, true), modo = e.modo || 'manual';
    if (!e.puede) { zona.innerHTML = '<p class="cfx-bol-nota">La boleta SII la configura el dueño del negocio.</p>'; return; }
    const pintar = () => {
      const of = modo === 'openfactura', ro = e.dueno ? '' : ' disabled';
      zona.innerHTML = '<div class="cfx-bol">' +
        '<p class="cfx-bol-nota">' + (e.conectado ? '✅ Lista para dar boleta' + (e.modo === 'openfactura' ? ' automática' : '') + '.' : 'Completa los datos de tu empresa (como en el SII) para dar boleta a tus clientes.') + '</p>' +
        '<div class="cfx-bol-modos" role="group" aria-label="Cómo emites la boleta">' +
          '<button type="button" data-bm="manual" class="' + (of ? '' : 'on') + '" aria-pressed="' + !of + '"' + ro + '>✍️ Manual<small>Gratis en sii.cl y anotas el N°</small></button>' +
          '<button type="button" data-bm="openfactura" class="' + (of ? 'on' : '') + '" aria-pressed="' + of + '"' + ro + '>⚡ Automática<small>Con OpenFactura (Haulmer)</small></button></div>' +
        CAMPOS.map(([k, t, ph, mx]) => '<label for="cfxBol_' + k + '">' + t + '</label><input id="cfxBol_' + k + '" data-bk="' + k + '" maxlength="' + mx + '" placeholder="' + esc(ph) + '" value="' + esc(e[k] || '') + '"' + ro + '>').join('') +
        (of ? '<label for="cfxBol_key">API key de OpenFactura</label><input id="cfxBol_key" data-bk="apikey" autocomplete="off" placeholder="' + (e.fin ? '•••• ' + esc(e.fin) + ' (vacía = la misma)' : 'Pégala aquí') + '"' + ro + '>' +
          '<label class="cfx-bol-si"><input type="checkbox" data-bk="auto"' + (e.auto !== false ? ' checked' : '') + ro + '> Emitir sola al cobrar</label>' +
          '<p class="cfx-bol-nota">La API key está en OpenFactura → Configuración → API. Se guarda solo en la base (nadie más la ve).</p>' : '') +
        (e.dueno ? '<div class="cfx-bol-btns"><button type="button" data-bg>💾 Guardar</button>' + (e.conectado ? '<button type="button" class="ghost" data-bq>Quitar</button>' : '') + '</div>' : '<p class="cfx-bol-nota">Solo el dueño puede cambiar estos datos.</p>') + '</div>';
    };
    pintar();
    zona.onclick = async (ev) => {
      const m = ev.target.closest('[data-bm]');
      if (m) { const v = {}; zona.querySelectorAll('[data-bk]').forEach((i) => { v[i.dataset.bk] = i.type === 'checkbox' ? i.checked : i.value; }); Object.assign(e, v); modo = m.dataset.bm; pintar(); return; }
      const g = ev.target.closest('[data-bg]');
      if (g) {
        const p = { modo }; zona.querySelectorAll('[data-bk]').forEach((i) => { p[i.dataset.bk] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
        g.disabled = true;
        try { e = await rpc('cfx_boleta_guardar', { p }); cache = Promise.resolve(e); modo = e.modo; pintar(); aviso('🧾 Datos de boleta guardados'); if (op.alGuardar) op.alGuardar(e); }
        catch (err) { aviso('⚠️ ' + ((err && err.message) || err)); g.disabled = false; }
        return;
      }
      if (ev.target.closest('[data-bq]')) {
        if (!await D().confirmar('¿Quitar los datos de boleta? Las boletas ya emitidas no se borran.')) return;
        try { e = await rpc('cfx_boleta_guardar', { p: null }); cache = Promise.resolve(e); modo = 'manual'; pintar(); aviso('Datos de boleta quitados'); } catch (err) { aviso('⚠️ ' + err.message); }
      }
    };
  }
  // Emite con la función de la app (fn recibe args + p_folio). Manual → pide el N° y vuelve a llamar.
  async function emitir(rpc, fn, args, op) {
    op = op || {};
    let r = await rpc(fn, Object.assign({}, args, { p_folio: op.folio || null }));
    if (r && r.manual) {
      const f = await D().pedir('🧾 Emite la boleta gratis en sii.cl (Boleta electrónica)' + (op.monto ? ' por ' + op.monto : '') + ' y escribe aquí su N° (folio):', '');
      if (f == null || !String(f).replace(/\D/g, '')) return null;
      r = await rpc(fn, Object.assign({}, args, { p_folio: String(f) }));
    }
    return r;
  }
  window.CFX_BOLETA = { estado, ajustes, emitir, olvidar: () => { cache = null; } };
})();
