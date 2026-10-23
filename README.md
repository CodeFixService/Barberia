# Barbería · CodeFix 💈

App web instalable (PWA) de reservas para barberías y peluquerías: calendario por barbero, servicios con precios,
reserva con abono y comprobante, mensajes con vistos, caja de cortes y planes Free / Premium.
© CodeFix · Josué Castillo — ver [LICENSE](LICENSE).

- **Requisitos acordados:** [`docs/REQUISITOS.md`](docs/REQUISITOS.md)
- **Puesta en marcha (una vez):** [`docs/CONFIGURAR.md`](docs/CONFIGURAR.md)
- **Publicada en:** https://barberia.juanjosuecastilloloyola.workers.dev/ (Cloudflare, se publica sola desde `main`)

## Roles
| Rol | Página | Qué hace |
|---|---|---|
| **Super admin** (Josué) | `admin/` | Crea barberías (parten con días de regalo), aprueba los **pagos de Premium con comprobante**, da/quita Premium y días, suspende. Ve el uso del servidor por tabla con botones de limpieza, filtros de barberías, y edita **precios y links, planes, reglas, textos**, avisos masivos, calificaciones y el registro de cambios. |
| **Socio** (de Josué) | `admin/` | El mismo panel del admin según sus permisos (pagos, Premium, claves, ajustes, avisos). **No crea ni borra nada.** Tiene su link/QR de registro: las barberías que traiga quedan a su nombre. |
| **Dueño** | `equipo/` | Inicio con lo urgente (abonos por revisar, devoluciones, lo que falta configurar, su link y QR). Agenda, clientes (con y sin cuenta) y lista negra. En Más: perfil, horario, servicios, **links de pago**, ofertas, equipo, caja, estadísticas, calificaciones y plan. |
| **Barbero** | `equipo/` | Su agenda, **aprueba los abonos de sus clientes**, califica clientes y ve la cantidad de cortes. **No ve precios ni montos**, ni cambia links, perfil o plan. |
| **Cliente con cuenta** | `cliente/` | Reserva, abona con comprobante, reagenda, anula, califica, chatea, Premium con comprobante. Se crea la cuenta desde el link de su barbería (o se la crea la barbería). |
| **Cliente sin cuenta** | `b/` y `r/` | Con el **link o QR** de la barbería reserva con nombre y WhatsApp, paga el abono, sube el comprobante y sigue su hora en su **link personal**: cancelar, reagendar y calificar. |

## Reserva y abono (v2.0)
1. Elige servicios, barbero y hora. La hora queda **apartada 10 minutos** (Reglas).
   Cada barbero pone en **Más → Mis tiempos** cuánto le dura cada servicio, su **descanso entre citas** y cada cuánto parten sus horas:
   al reservar se bloquea al tiro servicio + descanso (ej. corte 70 + 20 = 1 h 30) y la siguiente hora libre parte justo al terminar, sin huecos.
2. Paga con el link de la barbería (o transferencia) y **sube la foto del comprobante**: el reloj se detiene y la hora queda **🟡 En revisión** (retenida). Al barbero le llega un push.
3. El barbero revisa que llegó la transferencia y **aprueba** → **✅ Agendada** (un solo paso). Si rechaza, con motivo, la hora se libera.
4. Si no sube el comprobante a tiempo, la hora se libera sola. Si nadie revisa, se le recuerda al barbero y al dueño; 24 h después de la hora, el abono queda a favor del cliente.
5. **Cancelar o reagendar** las veces que quiera: en los primeros N minutos se devuelve el abono (el dueño lo marca devuelto); con X horas o más queda saldo a favor; después se pierde. Todo editable en Reglas.
6. Después de la visita se califican mutuamente (una vez por visita). El promedio de la barbería lo ven todos; con pocas estrellas el cliente queda en la **lista negra** (puede reservar, pero sale la alerta).

## v2.1
- **QR para compartir en todos los perfiles**: admin y socios (registro de barberías), dueño (clientes + invitar barberías), barbero (su link directo), cliente (recomendar su barbería).
- **Registro abierto de barberías** (`registro/?ref=…`): crean su perfil solas con los días de regalo. **Referidos**: la que invita gana días cuando la invitada paga su primer mes.
- Arreglos: aviso por **WhatsApp** al cliente sin cuenta al aprobar/rechazar; la devolución de un abono **sin verificar** pide revisar si llegó ("No llegó"); la **duración real** con cada barbero; más opciones sí/no en los planes; máximo de horas apartadas en Reglas.
- Para vender Premium: **resumen del mes** (Free lo ve borroso y llega cada día 1), **clientes que no vuelven** con oferta por WhatsApp, **recordatorio por WhatsApp** en 1 toque,
  **3 meses con descuento**, **cumpleaños** automático, **prioridad** de viernes y sábados para clientes Premium y **abono rebajado/sin abono** para Premium.
- Admin: Premium que **vence este mes** con botón para cobrar, **tasa de renovación** y barberías que se registraron solas.

## Estructura
```
index.html            Inicio de sesión (con el logo de la barbería) y ruteo por rol
cliente/  equipo/  admin/
shared/               core (utilidades, fechas en hora de Chile), cuenta (sesión, push), avisos, chat, agenda, perfil
b/?b=<código>         Vista libre de la barbería: reservar sin cuenta o crear la cuenta (el link y QR de siempre llegan aquí)
r/?t=<token>          Link personal de la reserva: pagar, comprobante, estado, cancelar, reagendar, calificar
registro/?ref=<código> Registro abierto de barberías (código de una barbería o de un socio)
supabase/instalar.sql Todas las tablas, reglas y funciones del servidor
supabase/functions/enviar/index.ts   Push, crear cuentas, restablecer claves
supabase/pruebas/     Pruebas del servidor, de la actualización desde 1.4 y recorridos en navegador
sw.js                 Funciona sin internet; se actualiza con botón cuando el admin libera la versión
```

Al cambiar archivos de la app: sube la versión en `version.json`, en `shared/core.js` (`VERSION`) y en `db_version()` / `notas_version()`
de `supabase/instalar.sql`. Para publicarla, Josué corre la consulta de actualización en Supabase: la versión se libera sola y
a todos les llega un push para tocar "Actualizar".
