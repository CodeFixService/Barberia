# Barbería — Requisitos (borrador v0.1, para revisar antes de programar)

Pedido por Josué (administrador general · CodeFix). Este documento se va corrigiendo hasta que esté todo claro;
recién ahí se programa la app completa de una vez.

> Las marcas **❓** son decisiones que faltan. Cada una trae una **propuesta por defecto**: si te parece bien, queda así.

---

## 1. Idea en una frase
Una app web instalable (PWA), como FichaPro y Caja Rápida, donde **cada barbería tiene su calendario global de horas**.
Sus clientes (a los que la barbería les crea la cuenta) eligen servicios, los agregan al carrito, eligen una hora
libre y la reservan **abonando $4.000**. La barbería recibe un aviso al tiro y confirma la hora.

## 2. Base técnica (la misma de las otras apps)
- App web instalable (PWA), sin tiendas. Publicada desde este repositorio (GitHub Pages; más adelante Cloudflare Pages + repo privado).
- Servidor **Supabase** con todas las reglas en el servidor (cada uno ve solo lo suyo).
- Notificaciones **push** + **correo (Gmail)** + bandeja dentro de la app, con la función `enviar` que corre cada minuto.
- WhatsApp con botones que abren el mensaje ya escrito (`wa.me`). Sin API de pago de Meta.
- Se reutiliza de Aplicaciones: inicio de sesión, cuentas creadas por invitación, licencias Free/Premium, solicitudes
  "Ya pagué", chat con límite de 3 mensajes, avisos, logo, temas, versión con botón **Actualizar** y uso del servidor.
- ❓ **Proyecto Supabase nuevo y separado** de Aplicaciones. *Propuesta: sí.* El plan gratis permite 2 proyectos activos, así que con este se ocupan los dos.

## 3. Roles

| Rol | Quién | Qué hace |
|---|---|---|
| **Super admin** | Solo Josué (`juanjosuecastilloloyola@gmail.com`) | Crea barberías y les entrega su usuario. Activa, renueva y corta Premium (de barberías y de clientes). Pone links de pago y precios, aprueba los "Ya pagué" (le llegan por correo y push), ve todas las barberías, avisa a todos y libera versiones. |
| **Barbería** | El dueño | Su propio panel: calendario, clientes, servicios y precios, ofertas, mensajes, ajustes (logo, horario, abono, datos de pago). |
| **Cliente** | Creado por la barbería | Ve el calendario global de su barbería, reserva y anula **solo sus horas**, chatea con la barbería y edita su perfil. |

**Registro cerrado:** nadie se registra solo. El admin crea las barberías y la barbería crea a sus clientes. Cada cliente queda
**asociado a una sola barbería**. Al crear la cuenta se abre WhatsApp con el enlace, el correo y la contraseña para enviárselos.
Todos parten en **Free**.

❓ **Vitrina pública sin cuenta.** *Propuesta: sí.* Un link/QR de la barbería donde cualquiera ve logo, servicios, precios
y horas libres (sin nombres). Abajo hay un botón **"Quiero agendar"** que abre WhatsApp a la barbería:
*"Hola, quiero que me creen mi cuenta para agendar"*. Así la persona que no tiene cuenta igual llega, pero solo el barbero la crea.

## 4. Calendario global

- **Una sola agenda por barbería.** Todos sus clientes ven el mismo calendario.
- **Vistas:** Día · Semana · Mes. El Año es solo un resumen para la barbería, con colores según qué tan lleno está cada mes.
- **Qué ve cada cliente:**
  - 🟢 **Libre**: puede tomarla.
  - ⬛ **Ocupado**: sin nombre, sin servicio, sin nada. Nadie ve quién reservó.
  - 🟦 **Mía**: sus propias horas, que puede ver, anular o reprogramar.
  - 🟡 **A consultar**: días de fin de semana o especiales (ver 4.1).
  - ⚪ **Cerrado / bloqueado**.
- **Qué ve la barbería:** todo, con nombre, servicio, estado y abono. Toca una hora y la confirma, la marca atendida, etc.
- En la vista **Mes**, cada día muestra un puntito de color según su ocupación (libre / medio / lleno).
- Las horas se calculan con la **duración de los servicios del carrito**. Ej.: corte 30 min + barba 15 min = bloque de 45 min.
- Nadie puede tomar una hora ya tomada, aunque dos personas toquen al mismo tiempo. Lo impide el servidor.
- Zona horaria fija: **America/Santiago**.

### 4.1 Horario y días
- **Lunes a viernes: Abierto** (ej. 10:00–20:00, con colación configurable).
- **Sábado y domingo: "A consultar".** El cliente puede pedir la hora, pero queda **Por aprobar** y se abre el chat con
  *"¿Están trabajando el sábado 18 a las 12:00?"*. Si la barbería acepta, la hora queda agendada. Si no, se libera.
- La barbería puede cambiar **cada día** a Abierto / A consultar / Cerrado, y bloquear fechas (feriados, vacaciones,
  "hoy cierro a las 17:00").
- ❓ **Intervalo entre horas.** *Propuesta: cada 15 min.*
- ❓ **Anticipación mínima.** *Propuesta: 1 hora.*
- ❓ **Hasta cuántos días adelante se puede reservar.** *Propuesta: Free 14 días, Premium 45 días.*

## 5. Reservar (cliente)

1. **Catálogo** → elige servicios (corte, barba, cejas, tintura…) y los agrega al **🛒 carrito**. Ve el precio total y la duración.
2. **Elige la hora** en el calendario. Solo se pueden tocar los bloques libres donde cabe la duración del carrito.
3. **Elige cómo abona los $4.000:**
   - **💳 Link de pago** (el Mercado Pago de la barbería) **o 🏦 transferencia** (los datos bancarios de la barbería, con botón copiar).
     Luego toca **"Ya aboné"** y, si quiere, sube la foto del comprobante.
   - **💵 Efectivo**: no hay abono. La hora queda **Por aprobar** y se abre el chat con la barbería para coordinar.
     La barbería decide si la acepta.
4. La hora queda marcada en el calendario y **a la barbería le llega un aviso al tiro** (push + correo + campanita).
5. Cuando la barbería la revisa y toca **Confirmar**, al cliente le llega: *"✅ Tu hora está confirmada: sáb 18, 12:00. Te esperamos."*
6. Botones **"Agregar a mi calendario"** (Google / archivo .ics) y **"Enviar por WhatsApp"**.

- El abono **se descuenta del total** el día de la atención.
- El monto del abono lo configura cada barbería (por defecto **$4.000**).
- ❓ **Horas activas a la vez.** *Propuesta: Free 1, Premium 3.*

### 5.1 Estados de una hora

| Estado | Qué significa | Se ve como |
|---|---|---|
| **Esperando abono** | Eligió hora y "link/transferencia", pero aún no toca "Ya aboné". La hora queda **apartada 20 min** y, si no abona, se libera sola. | Ocupado |
| **Por aprobar** | Pago en efectivo o día "A consultar". Espera a la barbería. | Ocupado |
| **Agendada** | Dijo que abonó (o la barbería la aprobó). Ya avisó a la barbería. | Ocupado |
| **Confirmada** | La barbería la revisó (y vio el abono). Se avisa al cliente. | Ocupado |
| **Atendida** / **No vino** | La marca la barbería después. | (historial) |
| **Anulada** | La anuló el cliente o la barbería. Se libera la hora. | Libre |

❓ **Si la barbería no aprueba una hora "Por aprobar".** *Propuesta: se libera sola a las 12 horas, o 1 hora antes de la cita.*

### 5.2 Anular y reprogramar (políticas)
- El cliente solo puede anular **sus propias** horas.
- ❓ **Anular con 24 horas o más de anticipación.** *Propuesta: el abono queda como **saldo a favor** para la próxima reserva.*
- ❓ **Anular con menos de 24 horas, o no llegar.** *Propuesta: **se pierde el abono**.* Con 3 "No vino" la barbería puede bloquear al cliente.
- Reprogramar = cambiar a otra hora libre manteniendo el abono. *Propuesta: Free 1 vez por reserva; Premium sin límite (respetando las 24 h).*

## 6. Mensajes (cliente ↔ barbería)
- Chat dentro de la app, igual al de Aplicaciones: **máximo 3 mensajes seguidos** hasta que la barbería responda,
  100 al día, ✓ Enviado / ✓✓ Visto, bloquear y reportar.
- La barbería no tiene límite con sus clientes. El cliente solo chatea con su barbería.
- Cada reserva tiene un botón **"Escribir sobre esta hora"**, que manda un mensaje con la hora adjunta.
- La barbería chatea con el admin (soporte), que tampoco tiene límite.

## 7. Panel de la barbería
- **Inicio:** horas de hoy, pendientes por confirmar o aprobar, abonos por revisar y mensajes nuevos.
- **📅 Calendario:** Día / Semana / Mes / Año. Puede crear una hora interna (cliente que llamó o llegó sin reserva),
  mover horas, bloquear, confirmar, marcar atendida o "No vino" y ver el comprobante.
- **👥 Clientes:** crear (nombre, WhatsApp, correo opcional), enviar el acceso por WhatsApp, ver historial, notas
  ("corte 2 al costado"), saldo a favor, bloquear y ver si es Premium.
- **✂️ Servicios y precios:** nombre, precio, duración, foto, categoría y visible/oculto.
- **🏷️ Ofertas:** promos que ven sus clientes (normales o ⭐ solo Premium).
- **💬 Mensajes**.
- **⚙️ Ajustes:** nombre, logo, colores, dirección, WhatsApp, horario por día, abono, link de pago, datos de transferencia,
  políticas, mensaje de bienvenida, y el link/QR de la vitrina.
- **💎 Mi plan:** Comprar Premium / Ya pagué / vencimiento.

## 8. App del cliente
- **Inicio:** su próxima hora con cuenta regresiva, botón **Agendar** y ofertas.
- **📅 Calendario global** (con sus horas destacadas) y **Mis horas** (próximas e historial).
- **✂️ Servicios** con precios y 🛒 carrito, y **⭐ Repetir mi último corte** con un toque.
- **💬 Mensajes** con su barbería.
- **👤 Mi perfil:** nombre, foto o **ícono/emoji** de avatar, color de la app, WhatsApp, cumpleaños, contraseña y notificaciones.
- **💎 Hazte Premium**.

## 9. Planes (todos parten en Free · se paga a Josué)

Premium mensual: ❓ **precio** (dijiste "4.009"). *Propuesta: **$4.990 / mes**, igual para barbería y cliente.* Lo cambias cuando quieras en Ajustes del admin.

### Barbería

| | Free | Premium |
|---|---|---|
| Calendario Día / Semana | ✅ | ✅ |
| Calendario Mes / Año | Solo Mes | ✅ |
| Clientes | 30 | 300 |
| Servicios | 8 | Ilimitados |
| Abono con link / transferencia / efectivo | ✅ | ✅ |
| Logo | ✅ | ✅ + colores y portada |
| Ofertas para clientes | 2 activas | Ilimitadas + ⭐ VIP |
| Recordatorio automático al cliente (push/correo 24 h y 2 h antes) | — | ✅ |
| Tarjeta de sellos (ej. 10 cortes = 1 gratis) | — | ✅ |
| Estadísticas: ingresos, abonos, horas más pedidas, "No vino", mejores clientes | — | ✅ |
| Lista de espera (avisa cuando se libera una hora) | — | ✅ |
| Marca "CodeFix" | Visible | Discreta |

### Cliente

| | Free | Premium |
|---|---|---|
| Ver calendario y reservar | ✅ (14 días adelante) | ✅ (45 días adelante) |
| Horas activas a la vez | 1 | 3 |
| Mensajes a la barbería | 3 seguidos | **Mensaje directo prioritario** (sin límite de 3, llega marcado ⭐) |
| Reprogramar | 1 vez | Sin límite |
| Ofertas ⭐ exclusivas | Bloqueadas ("Hazte Premium") | ✅ |
| Recordatorios push/correo | — | ✅ |
| Lista de espera en días llenos | — | ✅ |
| Íconos, colores y marco ⭐ en su perfil | Básicos | Todos |
| Repetir mi último corte | ✅ | ✅ |

### Cómo se cobra (igual que en las otras apps)
- Admin → Ajustes → Venta: **link de Mercado Pago** y precio para Premium barbería y Premium cliente.
- La persona toca **Comprar** → paga → **Ya pagué**. **A Josué le llega un correo y un push.** Lo aprueba con un toque y se activa al instante.
- Vence solo a los 30 días, con aviso 3 días antes. ❓ **Prueba gratis de 7 días.** *Propuesta: sí, una vez por cuenta.*
- El abono de $4.000 **no pasa por Josué**: va directo a la barbería, con su link o su transferencia.

## 10. Panel del super admin
- **Barberías:** crear (nombre, correo, contraseña, WhatsApp), enviar acceso por WhatsApp, Premium on/off,
  vencimiento, suspender, 👁️ ver su panel.
- **Clientes** de todas las barberías (con filtro por barbería), con su Premium.
- **Solicitudes de pago** y prueba.
- **Ingresos** del mes.
- **Ajustes:** links de pago, precios, WhatsApp de contacto, Gmail, claves push, liberar versión.
- **Avisos** a todas las barberías o a todos.
- **🖥️ Uso del servidor** (🟢 / 🟡 / 🔴).

## 11. Avisos automáticos

| Cuándo | A quién | Cómo |
|---|---|---|
| Nueva reserva / "Ya aboné" / pide efectivo / pide fin de semana | Barbería | Push + correo + campanita |
| Barbería confirma, aprueba, rechaza, mueve o anula | Cliente | Push + campanita (+ correo si tiene) |
| Recordatorio 24 h y 2 h antes (Premium) | Cliente | Push + correo |
| Se liberó una hora (lista de espera, Premium) | Cliente | Push |
| Mensaje nuevo | El otro | Push |
| "Ya pagué" Premium | Josué | Correo + push |
| Plan por vencer (3 días) | Barbería / cliente | Push + correo |

## 12. Seguridad y límites
- Todo validado en el servidor: el cliente no puede ver datos de otros clientes ni tocar horas ajenas.
- Límites contra abuso: máximo 5 reservas o anulaciones por día por cliente, y el chat con 3 seguidos.
- El comprobante se guarda comprimido (~100 KB) y se borra a los 30 días.
- El calendario guarda solo lo necesario. El historial de más de 1 año se resume.

## 13. Cómo se construye
Como pediste, **todo de una vez** cuando este documento esté aprobado. Internamente en este orden, para probar cada parte:
1. Servidor: tablas, reglas y funciones (`supabase/instalar.sql`) + función `enviar`.
2. Inicio de sesión, roles, admin, creación de barberías y clientes.
3. Servicios, carrito, motor de horas y calendario (Día / Semana / Mes / Año).
4. Reserva con abono, estados, confirmar y avisos.
5. Chat, perfil, ofertas, Premium y cobros.
6. Pruebas completas con 1 barbería y 3 clientes de prueba, y la guía `docs/CONFIGURAR.md` paso a paso.

## 14. Preguntas abiertas (resumen)
1. ¿Proyecto Supabase nuevo y separado? (propuesta: sí)
2. ¿Vitrina pública sin cuenta con "Quiero agendar" por WhatsApp? (propuesta: sí)
3. ¿Un solo barbero/agenda por barbería, o varios barberos (sillas) desde ya? (propuesta: uno en v1; varios como Premium después)
4. Precio Premium: ¿$4.990/mes? ¿El mismo para barbería y cliente?
5. Anulación y "No vino": ¿saldo a favor con 24 h, y se pierde con menos? (propuesta: sí)
6. Horas "Por aprobar" sin respuesta: ¿se liberan a las 12 h? (propuesta: sí)
7. Intervalo de 15 min, 1 h de anticipación y 14/45 días adelante, ¿ok?
8. ¿Prueba Premium de 7 días? (propuesta: sí)
9. ¿El cliente Premium paga solo a Josué, o la barbería gana algo por cada cliente Premium suyo? (propuesta: todo a Josué en v1)
