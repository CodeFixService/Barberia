# Barbería — Requisitos (v0.2, casi listo para programar)

Pedido por Josué (administrador general · CodeFix). Este documento se corrige hasta que esté todo claro;
recién ahí se programa la app completa de una vez.

> **❓** = falta tu confirmación (al final, en la sección 15). Todo lo demás ya está decidido.

---

## 1. Idea en una frase
Una app web instalable (PWA), como FichaPro y Caja Rápida. **Cada barbería administra todo lo suyo**: barberos,
servicios, precios, horario, ofertas y clientes. **Cada barbero tiene su propio calendario.** Los clientes (con cuenta
creada por la barbería) eligen servicios, los agregan al carrito, eligen barbero y hora libre, y reservan **abonando
$4.000**. El barbero recibe un aviso al tiro y confirma la hora.

## 2. Base técnica
- App web instalable (PWA), publicada desde este repositorio (`CodeFixService/Barberia`).
- **Servidor Supabase en una cuenta nueva** (la crea Josué), separada de Aplicaciones. Todas las reglas se validan en el servidor.
- Notificaciones **push** + **correo (Gmail)** + bandeja (campanita) dentro de la app.
- WhatsApp con botones que abren el mensaje ya escrito (`wa.me`).
- Se reutiliza lo que ya funciona en Aplicaciones: inicio de sesión, cuentas por invitación, Free/Premium con
  aprobación del admin, "Ya pagué", chat con límite de 3, avisos, logo, temas, botón **Actualizar** y uso del servidor.

## 3. Roles y cuentas

| Rol | Quién | Qué hace |
|---|---|---|
| **Super admin** | Solo Josué (`juanjosuecastilloloyola@gmail.com`) | Crea las barberías y les entrega su usuario. Activa, renueva y corta Premium de barberías **y** de clientes cuando le pagan. Pone links de pago y precios. Ve todo. |
| **Barbería (dueño)** | El barbero principal, la cuenta que crea Josué | Administra **todo**: crea barberos, crea clientes, define servicios, precios, horario, abono, datos de pago, ofertas y apariencia. Ve el calendario de todos sus barberos. Él también puede atender (tiene su propia agenda). |
| **Barbero** | Creado por el dueño | Tiene **su propia cuenta y su propia agenda**. Ve y gestiona solo sus horas y conversa con los clientes que reservan con él. No toca precios ni ajustes. |
| **Cliente** | Creado por la barbería | Ve los calendarios, reserva y anula **solo sus horas**, chatea, edita su perfil y ve ofertas. |

- **Registro cerrado. No hay página pública.** Nadie se registra solo y sin cuenta no se ve nada.
  La cuenta de cliente **siempre** la crea la barbería y se envía por WhatsApp (enlace + correo + contraseña).
- Cada cliente queda asociado a **una barbería**. Puede reservar con cualquiera de sus barberos.
- Todos parten en **Free**.
- **Barbería de un solo barbero:** funciona igual. El dueño no crea barberos y atiende con su propia agenda.
- Límite de barberos (contando al dueño): **Free 3 · Premium 10**.

## 4. Calendario

- **Un calendario por barbero.** Arriba el cliente elige **barbero** (con foto y nombre) o "El que esté disponible".
  Nada se mezcla: cada hora pertenece a un solo barbero.
- **Vistas:** Día · Semana · Mes. El Año es un resumen solo para el dueño.
- **El dueño** tiene además la vista **"Todos"**, con una columna por barbero.
- **Qué ve cada cliente:**
  - 🟢 **Libre**: puede tomarla.
  - ⬛ **Ocupado**: sin nombre ni servicio. Nadie ve quién reservó.
  - 🟦 **Mía**: puede verla y anularla (ver reglas).
  - 🟡 **A consultar**: fines de semana.
  - ⚪ **Cerrado / bloqueado**.
- **Qué ven barbero y dueño:** todo (nombre, servicio, estado, abono, comprobante).
- En la vista Mes, cada día muestra un puntito según su ocupación (libre / medio / lleno).
- Las horas se calculan con la **duración de los servicios del carrito**: corte 30 min + barba 15 min = 45 min.
- Nadie puede tomar una hora ya tomada, aunque dos personas toquen al mismo tiempo. Lo impide el servidor.
- Zona horaria **America/Santiago**.

### 4.1 Horario
- **Lunes a viernes: Abierto**, con horario y colación que define cada barbería. Cada barbero puede tener el suyo.
- **Sábado y domingo: "A consultar".** El cliente pide la hora, queda **Por aprobar** y se abre el chat
  (*"¿Están trabajando el sábado 18 a las 12:00?"*). Si el barbero acepta, se agenda. Si no, se libera.
- Cada día se puede cambiar a Abierto / A consultar / Cerrado, y se pueden bloquear fechas (feriados, vacaciones, "hoy salgo a las 17:00").
- Horas cada **15 min**.
- Anticipación mínima de **1 hora**.
- Reservar hasta **14 días adelante (Free)** o **45 días (Premium del cliente)**.

## 5. Reservar (cliente)

1. **✂️ Servicios** → agrega uno o más al **🛒 carrito**. Ve el total y la duración.
2. Elige **barbero** y **hora libre**. Solo se pueden tocar los bloques donde cabe el carrito.
3. **Abono de $4.000** (cada barbería puede cambiar el monto):
   - **💳 Link de pago** o **🏦 transferencia** (datos de la barbería, con botón copiar). Luego toca **"Ya aboné"**
     y, si quiere, sube la foto del comprobante. **La hora queda apartada 15 min.** Si no toca "Ya aboné" en ese
     tiempo, se libera sola.
   - **💵 Efectivo**: sin abono. La hora queda **Por aprobar** y se abre el chat con el barbero. Él decide si lo atiende.
4. Al barbero (y al dueño) le llega un aviso **al tiro**: push + correo + campanita.
5. El barbero toca **Confirmar**. Al cliente le llega: *"✅ Tu hora está confirmada: jue 16, 18:30 con Pedro. Te esperamos."*
6. Botones **"Agregar a mi calendario"** y **"Enviar por WhatsApp"**.

- El abono **se descuenta del total** el día de la atención.
- El abono va **directo a la barbería**. No pasa por Josué.

### 5.1 Estados de una hora

| Estado | Qué significa |
|---|---|
| **Esperando abono** | Hora apartada por 15 min. Si no abona, se libera sola. |
| **Por aprobar** | Efectivo o fin de semana. Espera al barbero (ver ❓ 3). |
| **Agendada** | El cliente dijo "Ya aboné", o el barbero la aprobó. El barbero ya fue avisado. |
| **Confirmada** | El barbero la revisó y vio el abono. Se avisa al cliente. |
| **Atendida** / **No vino** | La marca el barbero después. |
| **Anulada** | Se libera la hora. |

### 5.2 Anular (decidido)
- El cliente solo puede anular **sus propias** horas.
- **Con 24 horas o más de anticipación:** el abono queda como **saldo a favor**, que se usa solo en su próxima reserva.
- **Con menos de 24 horas, o si no llega:** **pierde el abono**. Así se compromete a llegar.
- El barbero siempre puede mover o anular una hora. Si anula él, el abono queda a favor del cliente.
- Con 3 "No vino", la barbería puede bloquear al cliente para reservar.

## 6. Mensajes
- Chat cliente ↔ barbería: **máximo 3 mensajes seguidos** hasta que respondan, 100 al día, ✓ Enviado / ✓✓ Visto,
  bloquear y reportar.
- El cliente le escribe a **la barbería**. Lo ven el dueño y el barbero de esa hora.
- Cada reserva tiene **"Escribir sobre esta hora"**, que manda el mensaje con la hora adjunta.
- La barbería no tiene límite. La barbería chatea con Josué (soporte).

## 7. Panel de la barbería (dueño)
- **Inicio:** horas de hoy, pendientes por confirmar o aprobar, abonos por revisar y mensajes nuevos.
- **📅 Calendario:** por barbero o "Todos". Puede crear una hora interna (cliente que llamó), mover, bloquear,
  confirmar, marcar atendida o "No vino" y ver el comprobante.
- **💈 Barberos:** crear (nombre, foto, correo, contraseña, horario propio), activar o desactivar y enviar el acceso por WhatsApp.
- **👥 Clientes:** crear (nombre, WhatsApp, correo opcional), enviar el acceso por WhatsApp, ver historial, notas,
  saldo a favor, bloquear y ver si es Premium.
- **✂️ Servicios y precios:** él los crea, edita, ordena y oculta (nombre, precio, duración, categoría y foto en Premium).
- **🏷️ Ofertas:** promos para sus clientes (normales o ⭐ solo clientes Premium).
- **💬 Mensajes**.
- **⚙️ Ajustes:** nombre, logo, dirección, WhatsApp, horario por día, monto del abono, link de pago, datos de
  transferencia, mensaje de bienvenida. En Premium también colores, portada y galería.
- **💎 Mi plan:** Comprar Premium, Ya pagué, Probar 7 días y vencimiento.

**El barbero (no dueño)** ve una versión simple: su calendario, sus horas, mensajes y su perfil.

## 8. App del cliente
- **Inicio:** su próxima hora con cuenta regresiva, botón grande **Agendar**, ofertas y saldo a favor.
- **📅 Calendarios** de los barberos y **Mis horas** (próximas e historial).
- **✂️ Servicios** con precios y 🛒 carrito, y **⭐ Repetir mi último corte** con un toque.
- **💬 Mensajes** con su barbería.
- **👤 Mi perfil:** nombre, foto o ícono/emoji, color de la app, WhatsApp, cumpleaños, contraseña y notificaciones.
- **💎 Hazte Premium**.
- **Didáctico:** la primera vez se muestra un recorrido de 3 pasos ("Elige tu corte → Elige tu hora → Abona y listo").
  Cada pantalla tiene textos cortos de ayuda.

## 9. Planes — todos parten en Free · Premium se paga a Josué

**Precio Premium: el mismo para barbería y cliente** (❓ 1: monto exacto). Se cambia en los Ajustes del admin.
La idea: **Free bueno, Premium mucho mejor.**

### Barbería

| | Free | ⭐ Premium |
|---|---|---|
| Barberos (con el dueño) | 3 | 10 |
| Clientes | 40 | 500 |
| Servicios | 8 | Ilimitados, con foto |
| Calendario Día / Semana / Mes | ✅ | ✅ + Año y vista "Todos" en columnas |
| Abono con link / transferencia / efectivo | ✅ | ✅ |
| Logo | ✅ | ✅ |
| Colores, portada, galería de trabajos, fotos de barberos | — | ✅ |
| Ofertas para clientes | 1 activa | Ilimitadas + ⭐ VIP |
| Recordatorio automático al cliente 24 h y 2 h antes (push/correo) | — | ✅ |
| Tarjeta de sellos (ej. 10 cortes = 1 gratis) | — | ✅ |
| Lista de espera (avisa cuando se libera una hora) | — | ✅ |
| Estadísticas: ingresos, abonos, horas más pedidas, "No vino", mejores clientes, por barbero | — | ✅ |
| Bloquear clientes por "No vino" | ✅ | ✅ |
| Marca "CodeFix" | Visible | Discreta |

### Cliente

| | Free | ⭐ Premium |
|---|---|---|
| Ver calendarios y reservar | ✅ 14 días adelante | ✅ 45 días adelante |
| Horas activas a la vez | 1 | 3 |
| Mensajes | 3 seguidos | **Mensaje directo prioritario**: sin límite de 3, llega arriba con ⭐ |
| Ofertas ⭐ exclusivas | Bloqueadas ("Hazte Premium") | ✅ |
| Recordatorios push/correo | — | ✅ |
| Lista de espera en días llenos | — | ✅ |
| Barbero favorito (se elige solo al agendar) | — | ✅ |
| Íconos, colores y marco ⭐ en su perfil | Básicos | Todos |
| Repetir mi último corte | ✅ | ✅ |

### Cobro (igual que en las otras apps)
- Admin → Ajustes → Venta: **link de Mercado Pago** y precio.
- La persona toca **Comprar** → paga → **Ya pagué**. **A Josué le llega un correo y un push.** Lo aprueba con un toque y se activa al instante.
- Dura 30 días. Avisa 3 días antes de vencer y se corta solo.
- **Prueba Premium de 7 días**, una sola vez por cuenta (barbería o cliente).
- La barbería **no gana** por sus clientes Premium. Solo recibe los abonos.

## 10. Panel del super admin
- **Barberías:** crear (nombre, correo, contraseña, WhatsApp), enviar acceso, Premium on/off, vencimiento,
  suspender, 👁️ ver su panel.
- **Clientes y barberos** de todas las barberías (con filtro), con su Premium.
- **Solicitudes** de pago y de prueba.
- **Ingresos** del mes.
- **Ajustes:** links de pago, precio, WhatsApp de contacto, Gmail, claves push, liberar versión.
- **Avisos** a barberías y/o clientes.
- **🖥️ Uso del servidor**.

## 11. Avisos automáticos

| Cuándo | A quién | Cómo |
|---|---|---|
| Nueva reserva / "Ya aboné" / pide efectivo / pide fin de semana | Barbero de la hora + dueño | Push + correo + campanita |
| Confirma, aprueba, rechaza, mueve o anula | Cliente | Push + campanita (+ correo) |
| Recordatorio 24 h y 2 h antes (barbería Premium o cliente Premium) | Cliente | Push + correo |
| Se liberó una hora (lista de espera) | Cliente Premium | Push |
| Mensaje nuevo | El otro | Push |
| "Ya pagué" Premium | Josué | Correo + push |
| Plan por vencer (3 días) | Barbería / cliente | Push + correo |

## 12. Seguridad y límites
- Todo validado en el servidor: un cliente nunca ve datos de otro ni toca horas ajenas.
  Un barbero no ve las horas privadas de otra barbería.
- Contra abuso: máximo 5 reservas o anulaciones al día por cliente, y el chat con 3 seguidos.
- El comprobante se guarda comprimido (~100 KB) y se borra a los 30 días.

## 13. Cómo se construye (todo de una vez, probado por partes)
1. Servidor: `supabase/instalar.sql` (tablas, reglas y funciones) + función `enviar` + tareas automáticas
   (liberar horas a los 15 min, recordatorios, vencimientos).
2. Inicio de sesión, roles, admin, barberías, barberos y clientes.
3. Servicios, carrito, motor de horas y calendarios.
4. Reserva con abono, estados, confirmar y avisos.
5. Chat, perfil, ofertas, Premium, prueba de 7 días y cobros.
6. Pruebas completas (1 barbería, 2 barberos, 3 clientes) y guía `docs/CONFIGURAR.md` paso a paso.

## 14. Lo que hace Josué antes de programar
- [ ] Crear la cuenta nueva de Supabase y el proyecto **Barberia**.
- [ ] Después del paso 1 de `docs/CONFIGURAR.md`, enviar la clave **anon public** (nunca la service_role).
- [ ] Tener a mano el link de Mercado Pago para Premium.

## 15. Últimas confirmaciones
1. **Precio Premium:** escribiste "4.009". ¿Es **$4.990** o **$4.000** al mes?
2. **¿Quién crea clientes?** *Propuesta: solo el dueño.* Los barberos solo atienden.
3. **"Por aprobar" sin respuesta** (efectivo o fin de semana): *Propuesta: se libera sola a las 12 h, o 1 h antes de la cita si eso ocurre antes.*
4. **Datos de pago del abono:** *Propuesta: una sola cuenta, la de la barbería.* Opcional: cada barbero con los suyos.
