# APP.md · 💈 Barbería

Leer esto antes que el código (G42j). Repo Barberia · id `barberia` · Supabase gxlabxuttnxvzkucckef.
Reservas con abono para barberías: agenda, caja, clientes, link/QR para reservar. Free / Premium / 🧩 módulos (G53: Premium trae solo los 3 primeros; los nuevos se compran aparte, Premium -20 %). Clientes NO pagan.

## Quién usa qué
- **Dueño** (`owner`) y **barbero** (`barber`): `/equipo/` (Inicio · Agenda · Clientes · Mensajes · Más).
- **Cliente** (`client`, con cuenta): `/cliente/`.
- **Público** (sin cuenta): `/b/?b=<codigo>` reservar con nombre + WhatsApp · `/r/?t=<token>` su reserva (abono, comprobante, cancelar, calificar).
- **Admin**: el panel vive en CM → Apps → 💈 Barbería (`admin/` redirige; socios siguen en `admin/`).

## Pantallas
| URL | Qué es |
|---|---|
| `/` | Entrar (correo/clave, QR en PC) → manda a equipo/ o cliente/ según rol |
| `/registro/` | Crear barbería (registro.js) |
| `/equipo/` `#hoy` `#agenda` `#clientes` `#chat` `#mas` | Panel (equipo.js). `#agenda?r=<id>` abre una hora |
| `/equipo/#negocio` `#horario` `#tiempos` `#servicios` `#links` `#ofertas` `#equipo` `#enlace` | Más → Tu barbería |
| `/equipo/#caja` `#estadisticas` `#resumen` `#volver` `#calificaciones` | Más → Ventas y clientes (caja: tocar un corte → 🧾 Comprobante) |
| `/equipo/#portafolio` `#redes` `#productos` `#giftcards` `#membresias` | G53b 🧩 módulos (sin el módulo abren la demo ▶️). Barbero: los ve si la barbería los tiene (vender, canjear, marcar corte, subir fotos) |
| `/equipo/#plan` `#modulos` `#invitar` `#respaldo` `#perfil` | Más → Tu plan / Configuración. 🧩 Módulos sale con la venta prendida (Free y Premium: incluidos ✅ + nuevos -20 %) |
| `/cliente/` | Inicio del cliente: horas, sellos, cumpleaños. Perfil → 📣 Recomienda tu barbería (link /b/ + QR). Sin Premium de cliente (G53) |
| `/b/?b=` · `/r/?t=` · `/legal.html` | Vista pública · reserva por link · términos |

## Archivos clave
- `shared/core.js` (VERSION l.11), `shared/cuenta.js` (sesión, planes `tiene/limite`, `barberiaTiene` + `MODULO_DE`), `shared/perfil.js` (Mi plan, `upsell(que, mod)`, `bloquear(el, que, mod)`, compartir), `shared/config.js` (⚠️ correo: solo Edit).
- Propios: agenda.js, avisos.js, chat.js (tabla messages), dictado.js (🎤), perfil.js, cuenta.js, core.js/core.css.
- Del núcleo (NO editar aquí: SaaS/nucleo): auto, ayuda, barra, carga, comprobante, datos, fotos, humano, iconos, impresora, instalar, modulos, pagos, premium, qr, respaldo, seguro, tema.css, ui, verificar, vitrina, voz.
- `supabase/instalar.sql` (~7.300 l; db_version() l.21; notas_version l.25 = solo categorías) · `supabase/functions/enviar` (push y QR, 1.1).
- Pruebas: `supabase/pruebas/correr.sh` (SQL completa), SaaS/pruebas `g53b_barberia.js`, `g53_barberia.js`, `g39_barberia.js`, `bar_ui.js`, `bar_pagos.js`, `node celular.js barberia`, central.js.

## Planes y módulos (G39)
- Planes en tabla `planes` (grupo barberia/cliente; límites y opciones sí/no) → SQL `tiene()/limite()`, JS `K.tiene/K.barberiaTiene`.
- FREE: agenda, servicios, link de reservas, caja de cortes, 🧾 comprobante. PREMIUM: más barberos/clientes, estadísticas, colores, reportes de caja, comisiones…
- 🧩 Módulos (`cfx_modulos_app()` = recordatorios, sellos, campanas): `bar_tiene(clave, barberia)` = Premium **o** módulo comprado (`bar_modulo_clave`: recordatorios/recordar_wsp → recordatorios · sellos → sellos · recuperar/cumpleanos → campanas). `mi_cuenta().barberia.modulos` = {módulo: activo} solo con la venta prendida (si no, null y todo es como antes).
- Negocio = el dueño (`cfx_negocio_de_cuenta`: dueño → él, barbero → su dueño, cliente → null). Packs propios (Básico 1.490 · Completo 1.990), solo si seguían los de fábrica.
- G53 (2.97 · bd 2.82): módulos NUEVOS `bar_nuevos()` = espera, resenas (luego: antifalta, portafolio, giftcards, membresia, productos, agenda_redes; ya están en el catálogo del núcleo con demo). NO vienen en Premium; venta apagada = gratis (como el núcleo). `bar_sueltos(bid)` → `mi_cuenta().barberia.sueltos`; JS `K.NUEVOS` + `barberiaTiene`. `cfx_modulo_plan_app` = los 3 primeros incluidos en Premium (tienda: "✅ Incluido en tu Premium", sin packs que ya trae). Candado de un módulo nuevo → demo ▶️ directa (perfil.js upsell).
- G53b (3.00 · bd 2.84): los otros 6 nuevos. 💳 antifalta (`barberias.antifalta_abono/_faltas`, `bar_antifalta` en `reservar` y `reservar_invitado`; Más → Links de pago) · 🖼️ portafolio (`bar_portafolio`, máx. 24; sale en `vista_publica` → /b/ "Nuestros cortes") · 🎁 giftcards (`bar_giftcards` + usos; vender = dueño, entra a Caja; canjear = equipo) · 🔁 membresia (`bar_membresias` + usos; cortes/mes, cobrar suma meses y entra a Caja; cliente ve `mi_membresia` en Inicio) · 🛍️ productos (`bar_productos`; `producto_vender` baja stock y entra a Caja; el barbero no ve precios; botón en Caja) · 🤖 agenda_redes (solo pantalla: respuestas listas WhatsApp/Instagram). ⏳ `espera_resumen` → tarjeta en Inicio.
- ⏳ espera: `unirse_espera` exige `bar_tiene('espera')` (o Premium de cliente antiguo hasta que venza); el botón solo sale si la barbería lo tiene. ⭐ resenas: `barberias.google_resenas` (Más → Perfil de la barbería), tras 4-5 ★ en cliente/ y /r/ se pide reseña en Google (`Perfil.pedirGoogle`).
- 👤 Clientes sin Premium (G53): colores, favorito y ofertas VIP gratis; sin prioridad de viernes/sábado; límites del cliente = los Free (anti-abuso). Quien pagó Premium de cliente lo conserva hasta que venza.
- R1: trigger `profiles_vence` → todo Premium con fecha (30 días si viene sin fecha; admin no).

## Tablas propias (además de las cfx_* del núcleo)
planes, planes_info, profiles, barberias, bar_portafolio, bar_giftcards, bar_giftcard_usos, bar_membresias, bar_membresia_usos, bar_productos, user_invites, app_settings, textos, auditoria, app_secrets, push_subscriptions, avisos, licenses, requests, pagos, servicios, bloqueos, ofertas, reservas, calificaciones, lista_negra, lista_espera, caja, messages, blocks, reports, actualizaciones.

## Versiones
`shared/core.js` l.11 + `version.json` (version, bd, notas = SOLO categorías) + `db_version()` en instalar.sql. Ahora: 3.00 · bd 2.84 · enviar 1.2.
Auto-actualizar compara con `bd` de version.json (antes con `version` → se reinstalaba cada 10 min; arreglado en 2.79).

## 🧠 Del núcleo: falta aplicar aquí
- ✅ G37 (2.94): comprobante.js + impresora.js en OPCIONAL; Caja → tocar un corte → 🧾 Comprobante (logo con CFX_COMPROBANTE_DATOS; sin RUT sale igual, G31). Boleta SII: no (solo Despega).
- ✅ G39 + R1 (2.94 · bd 2.79): ver "Planes y módulos". Josué prende la venta en CM → Apps → 🧩.
- ✅ G42 🔐: links de pago del negocio con CFX_URL (cliente/, r/).
- ✅ G42e: utilidades Bootstrap ya enlazadas por el sincronizador.
- ✅ Núcleo 2.79 (2.95 · bd 2.80): ▶️ con SVG, 📣 Campañas genérico, 💬 avisos propios (CFX_DIALOGO), "Cuenta y ayuda" ya no sale bajo Clientes.
- G43: la tarjeta "🚀 Termina de armar tu negocio" ya sale en Inicio; afinar guiaPasos con campo exacto si Josué lo pide.
