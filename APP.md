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

## 🏭 G65 De fábrica (3.02 · bd 2.86) — prueba SaaS/pruebas/g65_barberia.js
- bar_fabrica_agregar(b): 31 servicios con categoría (Cortes, Barba, Combos, Niños, Color, Extras) · trigger barberias_fabrica · RPC servicios_fabrica() (dueño, botón #bFabSer en #servicios) · productos_fabrica() (módulo productos, #bPrFab, 15 con stock 0) · FREE servicios 40. prueba.sql borra los de fábrica al inicio (parte limpia).

## Planes y módulos (G39)
- Planes en tabla `planes` (grupo barberia/cliente; límites y opciones sí/no) → SQL `tiene()/limite()`, JS `K.tiene/K.barberiaTiene`.
- FREE: agenda, servicios, link de reservas, caja de cortes, 🧾 comprobante. PREMIUM: más barberos/clientes, estadísticas, colores, reportes de caja, comisiones…
- 🧩 Módulos (`cfx_modulos_app()` = recordatorios, sellos, campanas): `bar_tiene(clave, barberia)` = Premium **o** módulo comprado (`bar_modulo_clave`: recordatorios/recordar_wsp → recordatorios · sellos → sellos · recuperar/cumpleanos → campanas). `mi_cuenta().barberia.modulos` = {módulo: activo} solo con la venta prendida (si no, null y todo es como antes).
- Negocio = el dueño (`cfx_negocio_de_cuenta`: dueño → él, barbero → su dueño, cliente → null). Packs propios (Básico 1.490 · Completo 1.990), solo si seguían los de fábrica.
- G53 (2.97 · bd 2.82): módulos NUEVOS `bar_nuevos()` = espera, resenas (luego: antifalta, portafolio, giftcards, membresia, productos, agenda_redes; ya están en el catálogo del núcleo con demo). NO vienen en Premium; venta apagada = gratis (como el núcleo). `bar_sueltos(bid)` → `mi_cuenta().barberia.sueltos`; JS `K.NUEVOS` + `barberiaTiene`. `cfx_modulo_plan_app` = los 3 primeros incluidos en Premium (tienda: "✅ Incluido en tu Premium", sin packs que ya trae). Candado de un módulo nuevo → demo ▶️ directa (perfil.js upsell).
- G53b (3.00 · bd 2.84): los otros 6 nuevos. 💳 antifalta (`barberias.antifalta_abono/_faltas`, `bar_antifalta` en `reservar` y `reservar_invitado`; Más → Links de pago) · 🖼️ portafolio (`bar_portafolio`, máx. 24; sale en `vista_publica` → /b/ "Nuestros cortes") · 🎁 giftcards (`bar_giftcards` + usos; vender = dueño, entra a Caja; canjear = equipo) · 🔁 membresia (`bar_membresias` + usos; cortes/mes, cobrar suma meses y entra a Caja; cliente ve `mi_membresia` en Inicio) · 🛍️ productos (`bar_productos`; `producto_vender` baja stock y entra a Caja; el barbero no ve precios; botón en Caja) · 🤖 agenda_redes (solo pantalla: respuestas listas WhatsApp/Instagram). ⏳ `espera_resumen` → tarjeta en Inicio.
- G109 (3.36 · bd 3.14): 🔁⚡ membresía que se paga sola. Cliente: Inicio → Tu membresía → ⚡ Pagar sola cada mes (pide correo de MP) → suscripción preapproval con el MP del DUEÑO (negocio = owner_id; motor G106, ref `memb:<id>`). `membresia_mp_auto(id, correo, volver)` (solo el cliente de esa membresía, por cuenta o teléfono → la enlaza; activa, precio > 0, módulo y MP; 1.er cobro 1 día antes de vencer) · `membresia_mp_auto_revisar` (?mpm=<id> al volver; cliente o equipo) · `membresia_mp_auto_quitar` (cliente o dueño) · gancho `cfx_mp_neg_sub_app`: cobro → +1 mes + Caja (transferencia, nota '⚡ Pago automático Mercado Pago') + avisos; pausada o sin módulo → no suma, se apaga y aviso "revísalo". `membresia_guardar` apaga la suscripción si cambia el precio o se pausa. `mi_membresia` trae `mp` y `auto`; `membresia_lista` trae `auto` (dueño: "⚡ Se paga sola con tarjeta" + Editar → Quitar).
- ⏳ espera: `unirse_espera` exige `bar_tiene('espera')` (o Premium de cliente antiguo hasta que venza); el botón solo sale si la barbería lo tiene. ⭐ resenas: `barberias.google_resenas` (Más → Perfil de la barbería), tras 4-5 ★ en cliente/ y /r/ se pide reseña en Google (`Perfil.pedirGoogle`).
- 👤 Clientes sin Premium (G53): colores, favorito y ofertas VIP gratis; sin prioridad de viernes/sábado; límites del cliente = los Free (anti-abuso). Quien pagó Premium de cliente lo conserva hasta que venza.
- R1: trigger `profiles_vence` → todo Premium con fecha (30 días si viene sin fecha; admin no).

## Tablas propias (además de las cfx_* del núcleo)
planes, planes_info, profiles, barberias, bar_portafolio, bar_giftcards, bar_giftcard_usos, bar_membresias, bar_membresia_usos, bar_productos, user_invites, app_settings, textos, auditoria, app_secrets, push_subscriptions, avisos, licenses, requests, pagos, servicios, bloqueos, ofertas, reservas, calificaciones, lista_negra, lista_espera, caja, messages, blocks, reports, actualizaciones.

## Versiones
`shared/core.js` l.11 + `version.json` (version, bd, notas = SOLO categorías) + `db_version()` en instalar.sql. Ahora: 3.36 · bd 3.14 · enviar 1.4.
Auto-actualizar compara con `bd` de version.json (antes con `version` → se reinstalaba cada 10 min; arreglado en 2.79).

- G95 (3.22 · bd 3.01): la barbería parte FREE (sin dias_regalo) · probar_premium → núcleo cfx_pro_probar (barbería y cliente, 1 vez por correo) · mi_cuenta.prueba_pro → botón 🎁 en Mi plan (shared/perfil.js) · trial_used de antes → cfx_pruebas_usadas. Prueba: SaaS/pruebas/g95.js.

## 🧠 Del núcleo: falta aplicar aquí
- ✅ G37 (2.94): comprobante.js + impresora.js en OPCIONAL; Caja → tocar un corte → 🧾 Comprobante (logo con CFX_COMPROBANTE_DATOS; sin RUT sale igual, G31). Boleta SII: ✅ G92 (3.19 · bd 2.98) núcleo boleta.js/boleta.sql · gancho cfx_boleta_negocio_app = barbería del dueño · bar_caja_boleta(p_id, p_folio) + bar_caja_boleta_ver · Más → 🧾 Boleta SII (secBoleta) · Caja → corte → [data-bolsii].
- ✅ G39 + R1 (2.94 · bd 2.79): ver "Planes y módulos". Josué prende la venta en CM → Apps → 🧩.
- ✅ G42 🔐: links de pago del negocio con CFX_URL (cliente/, r/).
- ✅ G42e: utilidades Bootstrap ya enlazadas por el sincronizador.
- ✅ Núcleo 2.79 (2.95 · bd 2.80): ▶️ con SVG, 📣 Campañas genérico, 💬 avisos propios (CFX_DIALOGO), "Cuenta y ayuda" ya no sale bajo Clientes.
- G43: la tarjeta "🚀 Termina de armar tu negocio" ya sale en Inicio; afinar guiaPasos con campo exacto si Josué lo pide.
- G96 b (3.24 · bd 3.03): 📣 Promo destacada (módulo 'promos' en bar_nuevos; núcleo CFX_ANUNCIOS.promos; Más → 📣, ruta #promos) · gancho cfx_promo_negocios_app = quienes reservaron o tienen barberia_id. Prueba: SaaS/pruebas/g96b.js.
- G99 a (3.26 · bd 3.05 · enviar 1.3): ⚡ aviso instantáneo de Mercado Pago (núcleo): cfx_mp_aviso_url_app = app_settings url_enviar · enviar atiende ?cfx_mp=. Prueba: SaaS/pruebas/g99.js.
- G98 (3.25 · bd 3.04): ⚡ abono con el Mercado Pago de la barbería (núcleo mp_negocio.sql): reserva_mp_pagar/reserva_mp_revisar(token) · gancho cfx_mp_neg_pagado_app → agendada (pagado_con 'link', mp_pago) · liberar_vencidas pregunta a MP antes · /r/ y cliente.js botón ⚡ (mis_horas trae token) · dueño: Más → 💳 Links de pago (#cMpNeg, CFX_PAGOS.mpNegocio). Prueba: SaaS/pruebas/g98.js.
- G107 (3.34 · bd 3.12): 💳 abono con el Flow (Webpay) de la barbería: reserva_mp_pagar(token, volver, p_medio) · reserva_ver/mi panel .medios {mp, flow} · avisos dicen Webpay si mp_pago empieza con flow: · /r/ y cliente.js: botones [data-mp="mp"|"flow"] (CFX_PAGOS.botonesNegocio) · dueño: la tarjeta 💳 Tu Webpay con Flow aparece sola debajo de ⚡ (#cMpNeg). Prueba: SaaS/pruebas/g107.js.

- 🧩 G112 b · Packs 🌱 Básico · ⭐ Normal (clave `crecer`, destacado) · 💎 Completo, iguales en las 6; precios y módulos: SaaS/LANZAMIENTO.md (Módulos, paso 3). Solo cambian si siguen de fábrica.
- 🎬 G112 d · Estudio de contenido = 🧩 módulo 'estudio' (núcleo estudio.sql/estudio.js; ayuda.js lo carga al abrir: CFX_ESTUDIO.montar(zona, { rpc, probar, nombre })). Datos en cfx_estudio (solo el dueño por funciones). Entra en ⭐ Normal (si sigue de fábrica) y 💎 Completo. Dónde: equipo → Más → 🎬 Estudio de contenido (sección 'estudio').
- G113 (núcleo 3.21): ☰ Más en páginas que se deslizan de lado (pestañas + ⇅ ordenar/renombrar por persona), ≥ 900 px opciones en grilla pareja, 🗂️ CFX_CAJA y CFX_DIALOGO { lista } disponibles para elegir entre muchas opciones / mostrar listas.
- 🗂️ G117 (3.45): Más → 💳 Links → datos de transferencia por campos (núcleo CodeFixVitrina.transferencia sobre #tTransf; se guarda el mismo texto barberias.datos_transferencia).
- 📊 G118 (3.46): Más → Servicios → 📊 Cargar o actualizar muchos (núcleo CFX_RESPALDO.planilla; guardar_servicio por fila; conserva foto y barberos).
- 🖼️ G122 (3.47 · bd 3.18): Core.elegirImagen('vitrina'/'portada') sube a Storage (núcleo CFX_NUBE); img_ok (plpgsql) acepta la URL; Core.fondo/esFoto y b.js la muestran. Viejas (portada, servicios, ofertas, portafolio) pasan solas al entrar el equipo (cfx_fotos_viejas/cfx_foto_pasar).
- ⚠️ G128 b (3.51): Inicio del dueño → aviso CFX_COBRO.sinMedios si abono > 0 y sin link/🏦/⚡/💳 (equipo.js #sinMedio; la base bloquea reservar en ese caso). Checklist cuenta MP/Flow. Chat de la reserva = 💬 Escribir (el propio). Prueba: SaaS/pruebas/g128b.js.
- G140 (núcleo 3.36): Mi perfil → 🎨 Personalizar (ex Color y modo): temas listos, barra de abajo (tipo/tamaño/nombres), ↩️ de fábrica; se guarda en public.cfx_personal (nucleo/sql/personal.sql). Prueba: SaaS/pruebas/g140.js.
- 📱 G141 (núcleo 3.37): 🔗 Mis redes (CodeFixVitrina.redes + nucleo/sql/redes.sql, gancho cfx_redes_llave_app en instalar/schema) y 🎬 Estudio por link + 📸 pantallazo + 📊 gráficos + 💡 ideas sin base (nucleo/est-links.js). Pruebas: SaaS/pruebas/g141.js, g141b.js.
- 🎁📱 G142 (3.58 · bd 3.25 · núcleo 3.38): candado ⭐ de módulo con 🎁 Probar (CFX_MODULOS_TIENDA.prueba en perfil.js upsell) · redes por barbero: Cuenta y ayuda → 📱 Mis redes personales (equipo_redes en cuenta.js) y /b/ "Nuestro equipo" con íconos (CodeFixVitrina.redes.equipo). Pruebas: SaaS/pruebas/g142a.js, g142c.js.
- 🛡️ G144 (núcleo 3.40): sin fila "Panel de administración" ni limpieza/respaldo dentro de la app (todo en CM → Apps) · .cfx-num/.cfx-redondo (círculo perfecto) · 🎤/⬜ = íconos de línea · 💬 WhatsApp del registro → Mis redes (cfx_redes_con_wa; gancho cfx_whatsapp_app donde aplica; uno solo, el botón antiguo se oculta con redes.unWa) · .assetsignore: notas, SQL y pruebas NO se publican.
- G146 (3.61): #carroBarra (b/ y cliente/) con data-cfx-sobre-menu y bottom var(--cfx-carro-b, 76px): sigue al menú (núcleo ui.js) y ↑ va encima.
- G147 (3.62): 📱 "Síguenos" bajo el QR: perfil.js compartir({ redes: { rpc, persona } }) en 🔳 Mi link + equipo.js 🔗 Enlace y QR (núcleo redes.bajoQR).
- 🙂 G148 (3.63, núcleo 3.43): perfiles sin ícono → foto o la letra del nombre (el ícono guardado se conserva, no se muestra).
- 🔁 G162 (3.76 · bd 3.29, núcleo 3.56): módulo 'suscripciones' (bar_nuevos) = 🔁 Compras recurrentes del NÚCLEO (recurrente.js): Más (dueño) con clientes (mis_clientes) + servicios + productos; cliente: "Tus compras recurrentes" en el inicio (#recurrentes). Ganchos cfx_negocio_nombre_app / cfx_recurrente_cliente_app. Prueba g162b.js.

## 📱 G164 (3.82 · bd 3.31, núcleo 3.62)
- Máx. equipos por cuenta (tope del CM → Control → 📱 Equipos, por defecto 3): núcleo equipos.js en el <head> + sql/equipos.sql (bloque núcleo de instalar.sql). Sin código propio de la app. Mi perfil → Avanzado → 📱 Mis equipos. Prueba SaaS/pruebas/g164.js.
