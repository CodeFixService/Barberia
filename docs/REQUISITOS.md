# Barbería — Requisitos (v1.0 · aprobada e implementada en la app v1.0)

Pedido por Josué (administrador general · CodeFix). Se programa la app completa de una vez cuando esto esté aprobado.

> **Regla de oro:** pocos campos obligatorios (solo lo necesario); todo lo demás, opcional.
> Todas las decisiones están cerradas (sección 16).

---

## 1. Idea en una frase
App web instalable (PWA). **Cada barbería administra todo lo suyo** (barberos, servicios, precios, horarios, abono, ofertas,
clientes). **Cada barbero tiene su agenda.** El cliente (con cuenta creada por la barbería) arma su carrito, elige barbero y
hora libre, abona y su barbero confirma. Cada barbero anota sus cortes en una **Caja**.

## 2. Base técnica
- PWA publicada desde `CodeFixService/Barberia`. **Supabase en cuenta nueva** (la crea Josué). Reglas en el servidor.
- **Todo por notificaciones push + campanita dentro de la app. Nada por correo** (sin Gmail). WhatsApp solo para enviar
  accesos y keys con el mensaje ya escrito (`wa.me`).
- **Contraseña olvidada (sin correo):** cada cliente queda **asociado a su barbería**. En el inicio de sesión hay un botón
  **"🔑 ¿Olvidaste tu contraseña?"** que abre el **WhatsApp de esa barbería** (el número lo pone Josué al crearla y el dueño
  puede cambiarlo) con el mensaje: *"Hola, olvidé mi clave de la app. ¿Me la pueden restablecer? Mi correo es …"*.
  - El dueño, en su panel (ficha del cliente → **Restablecer clave**), le pone una **clave genérica** al tiro, sin pedirle
    nada, y se la envía por WhatsApp con un toque.
  - El cliente entra con esa clave y la cambia a la que quiera en **👤 Mi perfil** (la app se lo recuerda con un aviso).
  - Los barberos se la piden al dueño, y los dueños a Josué, igual.
  - Para que el botón sepa a qué barbería escribir sin sesión iniciada: el enlace de acceso que envía la barbería lleva su
    código y el celular recuerda la barbería (muestra su logo). Si no hay ninguna guardada, el botón escribe a Josué.

## 3. Roles

| Rol | Quién | Qué hace |
|---|---|---|
| **Super admin** | Solo Josué | Crea barberías, activa/corta Premium de barberías y clientes, links de pago de Premium, precios, ve todo. |
| **Dueño** (barbero principal) | La cuenta que crea Josué | Administra todo: barberos, **clientes**, servicios, precios, horarios, abono, datos de pago, ofertas, apariencia. Ve **todas las horas de todos con nombre y detalle**. |
| **Barbero** | Creado por el dueño | Su agenda (con su propio interruptor "agenda abierta / llena"), sus horas con detalle (las de los demás solo "Ocupado"), su Caja, sus chats. **Crea clientes** si el dueño lo permite (v1.1). No toca ajustes. |
| **Cliente** | Creado por el dueño o un barbero | Es de **toda la barbería**: reserva con cualquier barbero que tenga la agenda abierta. Reserva y anula solo lo suyo, chatea, perfil, ofertas. Todos parten en Free. |

- **Registro cerrado, sin página pública.** El dueño (o un barbero, si el dueño lo permite) crea la cuenta del cliente y la envía por WhatsApp.
  En la ficha queda **quién lo creó**, su **último corte (con qué barbero y cuándo)** y su **barbero habitual**.
- Barberos (contando al dueño): **Free 3 · Premium 10**.

### 3.1 Agenda abierta / llena (v1.1)
- **Cada barbero, incluido el dueño, tiene su interruptor "Mi agenda abierta a clientes"** en su inicio.
  Si lo desmarca, los clientes lo ven con **"🔴 agenda llena"**: pueden reservar con otro barbero o escribirle por el chat
  para coordinar, y él les agenda la hora a mano.
- **El dueño puede abrir o cerrar la agenda de cualquier barbero** desde Más → Mi equipo.
- La agenda del dueño viene abierta si es el único barbero y se cierra sola al crear el primer barbero (la puede volver a abrir).
- Un barbero **inactivo** no aparece para reservar.
- El dueño decide en **Ajustes → Equipo** si sus barberos pueden crear clientes (activado por defecto).

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
   - **No hay opción efectivo para agendar.** Sin abono no hay hora; si alguien quiere pagar en efectivo, va al local
     a probar suerte (el barbero puede anotarlo a mano en su calendario si lo atiende).
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
| **Por aprobar** | Día "A consultar" (con abono ya enviado; si lo rechaza, queda saldo a favor). Si el barbero no responde, se libera sola a las **12 h** o **1 h antes de la cita** (lo que ocurra antes). |
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

**Regla de los 3 mensajes:** quien escribe "hacia arriba" puede mandar **máximo 3 seguidos**; cuando el otro contesta,
el contador vuelve a 0. Quien contesta "hacia abajo" escribe **todo lo que quiera**.

| Conversación | Regla |
|---|---|
| Cliente → barbero / dueño | Máximo **3 seguidos** hasta que el barbero conteste (cliente Premium: sin límite, llega con ⭐). |
| Barbero / dueño → cliente | **Sin límite.** |
| Barbero ↔ barbero (mismo local) | Máximo **3 seguidos** cada uno. |
| Barbería (dueño o barbero) → Josué | Máximo **3 seguidos** hasta que Josué conteste. |
| Josué → barberías | **Sin límite.** |

Al llegar al límite, la caja de texto se bloquea con: *"Ya enviaste 3 mensajes. Espera que te respondan 🙂"*.

- El cliente puede escribir a cualquier barbero de su barbería y al dueño.
- Cada reserva tiene **"Escribir sobre esta hora"**.
- **Vistos en todos los chats:** ✓ Enviado · ✓✓ Recibido · ✓✓ **azul = Visto** (con la hora en que lo vio).
  "Escribiendo…" no (para ahorrar servidor).
- En la lista de chats: puntito y contador de no leídos.
- 100 mensajes al día, bloquear y reportar.

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
**Premium: $4.900 al mes, mismo precio para barbería y cliente; ambos le pagan a Josué.** Editable en Ajustes del admin. Prueba de **7 días**, una vez por cuenta.
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

### Cómo ven el Premium los que no lo tienen
- Todo lo Premium **aparece en la app, pero en plateado** con un candado 🔒 y "⭐ Hazte Premium". Al tocarlo se explica
  qué trae y cuánto cuesta. Así el usuario Free ve lo que se pierde.
- La app del cliente Free es buena y completa para reservar; la Premium se nota "más pro" (marco dorado, insignia ⭐, más
  colores, prioridad en el chat).

### Cobro y activación (dos formas, siempre mensual)
- Admin → Ajustes → link de Mercado Pago y precio ($4.900).
- La persona toca **Comprar** → paga → **Ya pagué** → a Josué le llega un push.
- Josué activa de **una de dos formas**:
  1. **Key:** genera una key mensual, se la envía por WhatsApp y la persona la pega en **Mi plan → Activar key**.
  2. **Directo:** botón "Activar Premium 1 mes" en la ficha de esa cuenta.
- Las dos quedan **registradas en el historial de keys**: código, a quién, quién la activó, fecha de inicio,
  **fecha de término** y monto. Keys aleatorias, de un solo uso, con bloqueo tras 10 intentos fallidos.
- Cada usuario ve en **Mi plan**: "Premium hasta el 12/11/2026" y los días que le quedan. Aviso 3 días antes; se corta solo.
- Renovar suma un mes desde la fecha de término (no se pierden días).
- Prueba de 7 días, una vez por cuenta.

## 12. Panel del super admin (todo lo que pasa, muy pro)
- **Resumen:** barberías activas, Premium vs Free, ingresos del mes (Premium cobrados), planes por vencer,
  solicitudes "Ya pagué" pendientes, uso del servidor.
- **📊 Por barbería:** reservas del mes, horas atendidas, "No vino", **ventas de la Caja**, abonos recibidos, clientes
  activos, clientes Premium, barberos, servicios más vendidos, horas y días más pedidos, última actividad.
  Comparación mes a mes con flechas ↑↓.
- **💡 Recomendaciones automáticas** para enviar a cada barbería: "muchos No vino → activa recordatorios (Premium)",
  "agenda llena los sábados → abre el sábado", "pocos clientes nuevos → usa ofertas", "lleva 10 días sin entrar".
  Con un toque se le manda por el chat de soporte.
- **Ranking** de barberías por ventas y reservas.
- **Barberías:** crear, enviar acceso, Premium (key o directo), suspender, 👁️ ver su panel tal como lo ve el dueño.
- **Clientes y barberos** de todas las barberías, con filtro y Premium.
- **🔑 Keys:** generar, historial completo, revocar, renovar.
- **Ajustes:** links de pago, precio, WhatsApp, push, liberar versión.
- **Avisos** a barberías y/o clientes, con contador de **cuántos lo vieron** y lista de quién sí / quién no.

## 13. Notificaciones (solo push + campanita) con visto
- **Cada aviso tiene estado**, igual que el chat: **✓ Enviado · ✓✓ Visto** (con fecha y hora en que lo abrió).
- **Quien envía ve si el otro lo vio**, en las dos direcciones:
  - Cliente ↔ barbero/dueño (ej. el barbero ve que el cliente **vio** "✅ Tu hora está confirmada").
  - Barbería ↔ Josué (ej. Josué ve que la barbería **vio** "Tu Premium vence en 3 días" o una recomendación).
- Cada uno tiene su **🔔 campanita** con no vistos arriba; al tocar un aviso se marca **Visto** y lleva a donde corresponde
  (la hora, el chat, Mi plan…). Botón "Marcar todo como visto".
- En el detalle de una hora, el barbero ve el historial: *"Confirmada 14:02 · ✓✓ vista por el cliente 14:05"*.
- Push con el ícono/logo de la barbería. Si el celular no tiene push activado, el aviso igual queda en la campanita.
- Se pide activar notificaciones al entrar por primera vez (con explicación simple y botón de prueba).

### Cuándo se avisa

| Cuándo | A quién |
|---|---|
| Nueva reserva, "Ya aboné" o pide día "A consultar" | Barbero de la hora + dueño |
| Confirma, aprueba, rechaza, mueve o anula | Cliente |
| Recordatorio 24 h y 2 h antes (Premium) | Cliente |
| Se liberó una hora (lista de espera) | Cliente Premium |
| Mensaje nuevo | El otro |
| "Ya pagué" Premium | Josué |
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

**Servidor:** proyecto Supabase creado ✅ — `https://gxlabxuttnxvzkucckef.supabase.co`.
**Clave anon public:** recibida ✅ (va en `shared/config.js`; es pública por diseño).

## 16. Decisiones cerradas (v0.4)
- Abono solo con **link de pago o transferencia**. Sin efectivo para agendar.
- Premium **$4.900/mes**, igual para barbería y cliente, pagado a Josué. Activación con **key mensual** o **directa**, ambas registradas con fecha de término.
- Interruptor **"Mi agenda abierta a clientes"** para cada barbero (v1.1; el dueño puede cambiar el de cualquiera).
- Los barberos también crean clientes si el dueño lo permite (v1.1).
- Funciones Premium visibles **en plateado con 🔒** para los Free.
- Barberos creados por el dueño: versión tradicional (sus horas, su caja, sus chats).
- **Solo push + campanita** (sin correo), con **estado Visto** en avisos y chats, en ambas direcciones.
- Regla de 3 mensajes: cliente → barbero y barbería → Josué; el que responde escribe sin límite.
- Cliente Premium: **mensajes sin límite**.
- Contraseña olvidada: botón en el inicio de sesión → WhatsApp a su barbería → el dueño pone una clave genérica → el cliente la cambia en su perfil.

## v1.3
- Selector de color en todos los perfiles (admin incluido): Free 4 colores conocidos; Premium todos + color personalizado.
- Conexión visible (en línea / visto hace… / nunca entró) para el dueño y los barberos, y en el chat.
- Campanita: botón Limpiar (solo para uno mismo) y borrado automático de avisos a los 7 días.

## v1.4
- **Abono con dos links de pago:** la barbería guarda Link 1 y Link 2 (monto + link) y elige cuál está activo. El abono que ven los clientes es el del link activo, así el monto y el link nunca se descuadran. Las reservas ya hechas conservan su abono.
- **Planes editables por el admin** (Ajustes → Planes Free y Premium): precio mensual y días de prueba de cada plan, barberos, clientes, servicios y ofertas de la barbería; días adelante, horas activas y mensajes seguidos del cliente. Se aplica al tiro; si se baja un límite, nadie pierde lo que ya tiene.
- **Link de pago Premium por plan** (barbería y cliente), cada uno con su precio.


---

## v2.0 · Modelo BiciTaller adaptado a barbería (acordado con Josué)

**Vista libre:** cualquiera con el link o QR de la barbería ve servicios, barberos y horas, y reserva **sin cuenta** con nombre y WhatsApp.
Puede crearse la cuenta desde ese mismo link (solo así; el resto del registro sigue cerrado). Si ya reservó sin cuenta con ese WhatsApp, sus horas y calificaciones pasan a su cuenta.

**Abono:** la hora queda apartada **10 minutos** (editable). Al subir el comprobante el reloj se detiene → **En revisión** (la hora queda retenida) y llega un push al barbero.
El barbero (de sus clientes) o el dueño (de todos) aprueba → **Agendada**. Se eliminó el paso extra de "Confirmar". Rechazar exige motivo y libera la hora.
Sin revisión: recordatorio al barbero a los 15 min, aviso al dueño a los 30 min y 1 h antes de la hora; 24 h después de la hora → abono a favor del cliente.
Los "días a consultar" ya no existen: cada día está abierto o cerrado según el horario.

**Cancelar y reagendar:** primeros N minutos → devolución (la ve y marca el dueño); con X horas o más → saldo a favor (sin cuenta: en su link, con vencimiento);
después → se pierde. Se puede reagendar todas las veces respetando esos plazos.

**Equipo:** el barbero aprueba abonos de sus clientes, ve cantidad de cortes, **no ve precios ni montos**, no cambia links, perfil ni plan.

**Calificaciones y lista negra:** una por visita, en ambos sentidos. El promedio de la barbería lo ven todos. La barbería califica al cliente con estrellas y motivo
(predefinidos o escrito); con **2 estrellas o menos** entra a la lista negra de esa barbería (la ven todos sus barberos). Puede reservar igual, pero sale la alerta; el dueño lo puede sacar.

**Premium:** sin keys. Se paga con el link del admin + **foto del comprobante**; Josué aprueba o rechaza con motivo en **Pagos**. 2 links por plan (precio, texto, link; uno activo).
Barberías nuevas parten con **30 días de regalo** (editable) y después pagan o quedan en Free sin perder nada. Aviso antes de vencer con botón para pagar.

**Planes:** nombre, descripción, beneficios, duración, límites y opciones sí/no, todo editable. **Reglas** (minutos, horas, días) y **textos** editables.
**Admin:** uso del servidor por tabla con limpieza, filtros de barberías, pagos, calificaciones y registro de cambios.

**Datos:** las horas atendidas se guardan (sellos y estadísticas); las anuladas se borran a los 30 días; los comprobantes a los 30 días (nunca si están en revisión).

**Tiempos por barbero (v2.0):** cada barbero, desde su perfil (Más → Mis tiempos), define cuánto le dura cada servicio (si no, usa la duración de la barbería),
su descanso entre citas y cada cuánto parten sus horas. Al reservar se bloquea al tiro servicio + descanso (ej. 70 + 20 = 1 h 30) y la siguiente hora libre
parte justo cuando termina la anterior (también después de la colación o de un bloqueo), así no quedan huecos. El admin no interviene en esto.

**Página de la barbería (link o QR):** arriba lo principal, la cuenta (Entrar / Crear mi cuenta; quien ya tiene sesión entra directo a su app);
debajo, reservar sin cuenta (solo agenda y valida con el comprobante).

---

## v2.1 · Crecer y vender Premium (acordado con Josué)
- **Socio**: hace lo mismo que el admin en el panel, menos crear y borrar. El admin elige sus permisos (pagos, Premium, claves y suspensiones, ajustes, avisos).
- **QR en todos los perfiles**. El de CodeFix (y el de cada socio) lleva a crear una barbería; el de cada barbería, a reservar en ella; el de "Invita una barbería", al registro con referido.
- **Registro abierto de barberías** con regla para cerrarlo y máximo 30 por hora. Referido: la que invita gana días de Premium cuando la invitada paga su primer mes.
- Arreglos: WhatsApp al cliente sin cuenta al aprobar o rechazar; devolución sin verificar ("devuélvelo solo si llegó" / "No llegó"); duración real por barbero;
  fotos de servicios, servicios por barbero, editar barberos y comisión/sellos como opciones sí/no; máximo de horas apartadas sin pagar (Reglas, 10).
- Premium barbería: resumen del mes (Free borroso), clientes que no vuelven, recordatorio por WhatsApp, regalo de cumpleaños. Pago por 3 meses con descuento (15 %).
- Premium cliente: prioridad en viernes y sábados (Free hasta 3 días antes) y abono rebajado o sin abono si la barbería lo ofrece.
- Admin: Premium por vencer este mes con cobro por WhatsApp y tasa de renovación.

## v2.2 · Eliminar cuentas y registro
- El admin elimina barberos, clientes y barberías (además de suspender). El dueño elimina sus barberos y clientes.
- El socio también crea barberías, edita y elimina (según sus permisos), pero **todo queda en el registro de cambios** con su nombre, y al admin le llega un aviso cuando elimina o corta algo.
