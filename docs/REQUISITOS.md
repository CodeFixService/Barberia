# Barbería — Requisitos (v0.3, lista para programar salvo lo marcado ❓)

Pedido por Josué (administrador general · CodeFix). Se programa la app completa de una vez cuando esto esté aprobado.

> **Regla de oro:** pocos campos obligatorios (solo lo necesario); todo lo demás, opcional.
> **❓** = confirmación pendiente (sección 16).

---

## 1. Idea en una frase
App web instalable (PWA). **Cada barbería administra todo lo suyo** (barberos, servicios, precios, horarios, abono, ofertas,
clientes). **Cada barbero tiene su agenda.** El cliente (con cuenta creada por la barbería) arma su carrito, elige barbero y
hora libre, abona y su barbero confirma. Cada barbero anota sus cortes en una **Caja**.

## 2. Base técnica
- PWA publicada desde `CodeFixService/Barberia`. **Supabase en cuenta nueva** (la crea Josué). Reglas en el servidor.
- Push + correo (Gmail) + campanita. WhatsApp con mensaje ya escrito (`wa.me`).
- Se reutiliza de Aplicaciones: sesión, cuentas por invitación, Free/Premium con aprobación, "Ya pagué", chat con límite de 3,
  avisos, logo, temas, botón **Actualizar**, uso del servidor, y la Caja (adaptada a cortes).

## 3. Roles

| Rol | Quién | Qué hace |
|---|---|---|
| **Super admin** | Solo Josué | Crea barberías, activa/corta Premium de barberías y clientes, links de pago de Premium, precios, ve todo. |
| **Dueño** (barbero principal) | La cuenta que crea Josué | Administra todo: barberos, **clientes (solo él los crea)**, servicios, precios, horarios, abono, datos de pago, ofertas, apariencia. Ve **todas las horas de todos con nombre y detalle**. |
| **Barbero** | Creado por el dueño | Su agenda, sus horas con detalle (las de los demás solo "Ocupado"), su Caja, sus chats. No crea clientes ni toca ajustes. |
| **Cliente** | Creado por el dueño | Reserva y anula solo lo suyo, chatea, perfil, ofertas. Todos parten en Free. |

- **Registro cerrado, sin página pública.** El dueño crea la cuenta del cliente y la envía por WhatsApp.
- Barberos (contando al dueño): **Free 3 · Premium 10**.

### 3.1 Agenda del dueño
- **Si la barbería tiene un solo barbero** (el dueño), los clientes reservan directo con él.
- **Si hay más barberos**, la agenda del dueño **no se ofrece** a los clientes: ellos reservan con los demás barberos.
  Para atenderse con el dueño, le escriben por el chat interno, acuerdan y **el dueño agenda la hora en su calendario,
  asociada a ese cliente**.
- *Mejora propuesta:* en vez de una regla fija, un interruptor del dueño **"Mi agenda abierta a clientes"**
  (activado si es el único barbero, desactivado si hay más). Así lo decide él.

## 4. Horarios (todo administrable)
- **Cada día de la semana (lunes a domingo)** puede ser **Abierto**, **A consultar** o **Cerrado**, con hora de inicio, término
  y colación. Viene listo así: lunes a viernes Abierto 10:00–20:00 y sábado/domingo A consultar. El dueño lo cambia como quiera
  (por ejemplo, lunes a lunes).
- Cada barbero hereda el horario de la barbería; el dueño puede ajustarlo por barbero (Premium).
- Bloquear fechas u horas (feriados, vacaciones, "hoy salgo a las 17:00").
- **"A consultar"**: el cliente pide la hora, queda **Por aprobar** y se abre el chat con su barbero.
- Horas cada **15 min** · anticipación mínima **1 hora** · hasta **14 días** adelante (cliente Free) o **45 días** (cliente Premium).
- Zona horaria America/Santiago.

## 5. Calendario
- Un calendario **por barbero**. Vistas **Día · Semana · Mes** (+ **Año** y vista **"Todos"** en columnas para el dueño Premium).
- **Cliente:** 🟢 Libre · ⬛ Ocupado (sin datos) · 🟦 Mía · 🟡 A consultar · ⚪ Cerrado.
- **Barbero:** sus horas con detalle; las de otros barberos solo como ⬛ Ocupado.
- **Dueño:** todas las horas de todos con nombre, servicio, estado y abono. Puede crear, mover, confirmar y anular cualquiera.
- Las horas se calculan según la duración del carrito. El servidor impide tomar dos veces la misma hora.

## 6. Reservar

1. **✂️ Servicios** → agregar al **🛒 carrito** (total y duración).
2. Elegir **barbero** y **hora libre**.
3. **Abono fijo**, el mismo para cualquier servicio. Lo define el dueño (por defecto **$4.000**; ej. puede dejarlo en $3.000).
   Va **directo a la barbería**. Formas de pago:
   - **💳 Link de pago** (el que configura el dueño) o **🏦 transferencia** (datos del dueño, botón copiar).
   - **💵 Efectivo** (❓ 1): sin abono; la hora queda **Por aprobar** y se abre el chat.
4. **Apartado de 15 min:** el cliente tiene 15 min para tocar **"Ya aboné"**. Si no, la hora se libera sola.
5. **"Ya aboné" pide la foto del comprobante (obligatoria)** y la envía **automáticamente al chat** con el barbero de esa hora
   (el dueño también la ve). Así es un solo paso para el cliente.
6. La hora queda **Agendada** y **no se libera más**: el barbero tiene todo el tiempo para revisar su cuenta y tocar **Confirmar**.
7. Al confirmar, al cliente le llega: *"✅ Tu hora está confirmada: jue 16, 18:30 con Pedro."*
8. "Agregar a mi calendario" y "Enviar por WhatsApp".

- El abono se descuenta del total el día de la atención.

### 6.1 Estados

| Estado | Qué significa |
|---|---|
| **Esperando abono** | Apartada 15 min. Si no toca "Ya aboné", se libera sola. |
| **Por aprobar** | Efectivo o día "A consultar". Si el barbero no responde, se libera sola a las **12 h** o **1 h antes de la cita** (lo que ocurra antes). |
| **Agendada** | Abono enviado con comprobante. Espera la revisión del barbero (no vence). |
| **Confirmada** | El barbero vio el abono. Se avisa al cliente. |
| **Atendida** / **No vino** | La marca el barbero. **Atendida pasa sola a la Caja.** |
| **Anulada** | Se libera la hora. |

### 6.2 Anular (para que el barbero alcance a cubrir la hora)
- **Hora para otro día:** anula **24 h antes o más** → el abono queda como **saldo a favor** para su próxima reserva.
- **Hora reservada para el mismo día:** anula **1 h antes o más** → saldo a favor.
- **Fuera de plazo o no llega → pierde el abono.**
- Si anula el barbero, el abono siempre queda a favor del cliente.
- Con 3 "No vino", el dueño puede bloquear al cliente para reservar.

## 7. Caja de cortes (cada barbero)
- **Anotar un corte en 2 toques.** Obligatorio solo: **servicio** (o monto libre) y **medio de pago** (efectivo / transferencia).
  Opcional: cliente, propina, nota.
- Las horas marcadas **Atendida** se anotan solas, con el abono ya descontado (sin escribir dos veces).
- Cada barbero ve su caja del día y de la semana.

| | Free | ⭐ Premium |
|---|---|---|
| Anotar cortes y ver el día | ✅ | ✅ |
| Reportes semana / mes, más vendidos, por medio de pago | — | ✅ |
| Dueño ve la caja de **todos** los barberos y el total del local | — | ✅ |
| Comisión por barbero (ej. 50 %) calculada sola | — | ✅ |

## 8. Mensajes

| Conversación | Regla |
|---|---|
| Cliente → barbero / dueño | Máximo **3 seguidos** hasta que respondan (cliente Premium: sin límite, llega con ⭐). |
| Barbero ↔ barbero (mismo local) | Máximo **3 seguidos**. |
| Barbero/dueño → cliente | Sin límite. |
| Barbería ↔ Josué (soporte) | Se mantiene, como en las otras apps. |

- El cliente puede escribir a cualquier barbero de su barbería y al dueño.
- Cada reserva tiene **"Escribir sobre esta hora"**.
- 100 mensajes al día, ✓ Enviado / ✓✓ Visto, bloquear y reportar.

## 9. Privilegios del dueño sobre sus barberos

| | Free | ⭐ Premium |
|---|---|---|
| Crear, desactivar y enviar acceso a barberos | ✅ (hasta 3) | ✅ (hasta 10) |
| Ver todas las horas con detalle; crear, mover, anular cualquiera | ✅ | ✅ |
| Editar el perfil de cada barbero (foto, nombre, descripción) | — | ✅ |
| Horario propio por barbero | — | ✅ |
| Qué servicios hace cada barbero | — | ✅ |
| Estadísticas por barbero (cortes, ventas, "No vino", mejores clientes) | — | ✅ |
| Caja de todos y comisiones | — | ✅ |

## 10. App del cliente
- **Inicio:** su próxima hora con cuenta regresiva, botón grande **Agendar**, ofertas y saldo a favor.
- **📅 Calendarios** por barbero y **Mis horas**.
- **✂️ Servicios** con 🛒 y **⭐ Repetir mi último corte**.
- **💬 Mensajes**.
- **👤 Mi perfil:** nombre, foto o ícono/emoji, color, WhatsApp, cumpleaños (opcional), contraseña.
- **💎 Hazte Premium**.
- **Recorrido inicial de 3 pasos:** "Elige tu corte → Elige tu hora → Abona y listo".

## 11. Planes — todos parten en Free · Premium se paga a Josué
**Mismo precio para barbería y cliente** (❓ 2), editable en los Ajustes del admin. Prueba de **7 días**, una vez por cuenta.
Free bueno, Premium mucho mejor. La barbería no gana por sus clientes Premium; solo recibe los abonos.

### Barbería

| | Free | ⭐ Premium |
|---|---|---|
| Barberos (con el dueño) | 3 | 10 |
| Clientes | 40 | 500 |
| Servicios | 8 | Ilimitados, con foto |
| Calendario Día / Semana / Mes | ✅ | ✅ + Año y vista "Todos" |
| Horarios por día, abono y datos de pago | ✅ | ✅ |
| Logo | ✅ | ✅ |
| Colores, portada, galería de trabajos | — | ✅ |
| Ofertas | 1 activa | Ilimitadas + ⭐ VIP |
| Recordatorio automático al cliente (24 h y 2 h antes) | — | ✅ |
| Tarjeta de sellos | — | ✅ |
| Lista de espera | — | ✅ |
| Caja | Anotar y ver el día | Reportes, todos los barberos, comisiones |
| Privilegios sobre barberos | Básicos | Completos (sección 9) |
| Marca "CodeFix" | Visible | Discreta |

### Cliente

| | Free | ⭐ Premium |
|---|---|---|
| Reservar | 14 días adelante | 45 días adelante |
| Horas activas a la vez | 1 | 3 |
| Mensajes | 3 seguidos | Directo prioritario ⭐ sin límite |
| Ofertas ⭐ exclusivas | Bloqueadas | ✅ |
| Recordatorios | — | ✅ |
| Lista de espera | — | ✅ |
| Barbero favorito | — | ✅ |
| Íconos y colores | Básicos | Todos + marco ⭐ |

### Cobro
Admin → Ajustes → link de Mercado Pago y precio. **Comprar → Ya pagué →** correo y push a Josué → aprueba con un toque →
dura 30 días, avisa 3 días antes, se corta solo.

## 12. Panel del super admin
Barberías (crear, enviar acceso, Premium, vencimiento, suspender, 👁️ ver), clientes y barberos con filtro, solicitudes,
ingresos, ajustes (links, precio, WhatsApp, Gmail, push, liberar versión), avisos y uso del servidor.

## 13. Avisos automáticos

| Cuándo | A quién |
|---|---|
| Nueva reserva, "Ya aboné", pide efectivo o "A consultar" | Barbero de la hora + dueño (push + correo + campanita) |
| Confirma, aprueba, rechaza, mueve o anula | Cliente (push + campanita) |
| Recordatorio 24 h y 2 h antes (Premium) | Cliente |
| Se liberó una hora (lista de espera) | Cliente Premium |
| Mensaje nuevo | El otro |
| "Ya pagué" Premium | Josué (correo + push) |
| Plan por vencer | Barbería / cliente |

## 14. Seguridad y límites
- Todo validado en el servidor: un cliente nunca ve datos de otro; un barbero solo ve el detalle de sus horas.
- Máximo 5 reservas o anulaciones al día por cliente.
- Comprobantes comprimidos (~100 KB), se borran a los 30 días.

## 15. Construcción
1. Servidor (`supabase/instalar.sql`, función `enviar`, tareas: liberar apartados, recordatorios, vencimientos).
2. Sesión, roles, admin, barberías, barberos y clientes.
3. Servicios, carrito, horarios, motor de horas y calendarios.
4. Reserva, abono con comprobante, estados, avisos.
5. Caja, chat, perfil, ofertas, Premium, prueba y cobros.
6. Pruebas (1 barbería, 2 barberos, 3 clientes) y guía `docs/CONFIGURAR.md`.

**Josué:** crear la cuenta y el proyecto Supabase **Barberia**; enviar la clave **anon public** cuando la guía lo pida.

## 16. Confirmaciones pendientes
1. **Efectivo:** escribiste "transferencia y débito no". ¿Se mantiene **efectivo** como opción (queda Por aprobar), o solo link/transferencia?
2. **Precio Premium:** "4.009" → ¿**$4.990** o **$4.000**? (No frena el código: se cambia desde Ajustes.)
3. **Agenda del dueño:** ¿regla fija (cerrada a clientes si hay más barberos) o el interruptor "Mi agenda abierta a clientes"?
