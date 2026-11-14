# APP.md

(Mapa completo pendiente: G42j.)

## 🧠 Del núcleo: falta aplicar aquí
- G48 (núcleo 2.77): revisar en el celular ✋ mover secciones desde el título y 🎨 Color y modo → Colores a tu gusto (fondo, texto, íconos y +); si la app pinta íconos o fondo con colores fijos, pasarlos a var(--cfx-icono)/var(--cfx-fondo).
- G37 (núcleo 2.76): 🧾 comprobante.js + 🖨️ impresora.js son del núcleo (OPCIONAL). Aplicar: sumar "barberia" a OPCIONAL en sincronizar.py + <script> + FILES de sw.js; definir window.CFX_COMPROBANTE_DATOS = async (c) => ({ logo, firma }) y abrir CFX_COMPROBANTE.abrir({...}) en atención cobrada / venta en local. 🧾 Boleta SII: hoy solo Despega (SQL boleta_*); si esta app la necesita, pasarla primero a nucleo/sql/boleta.sql.
- G42 (núcleo 2.75, ya activo solo): ⬆️ subir, 🪟 ventanas del núcleo (✕+Cerrar / ← Volver), 📌 títulos fijos y ✋ ordenar en CFX_AJUSTES/CFX_MENU. Falta aquí: ✋ marcar otras listas propias con data-cfx-orden si sirve; 🪟 revisar ventanas propias (dialog) que no usan la hoja del núcleo; 🔐 usar CFX_TAPAR en avisos de enlace/validación y CFX_URL en links que pone el negocio (boleta, pago).
- G43: revisar si la tarjeta "🚀 Termina de armar tu negocio" (núcleo) cae bien en equipo/ (si no, marcar el lugar con data-cfx-guia); afinar guiaPasos (campo exacto de cada paso); quitar avisos propios de instalar/notificaciones si se repiten con instalar.js.
