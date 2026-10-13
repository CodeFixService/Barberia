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
| **Super admin** (Josué) | `admin/` | Crea barberías, activa Premium (key mensual o directo), aprueba "Ya pagué", ve ventas y actividad de cada barbería con recomendaciones automáticas, avisos masivos con contador de vistos. |
| **Dueño** | `equipo/` | Todo lo de su barbería: agenda de todos, clientes, barberos, servicios y precios, ofertas, horario lunes a domingo, abono, caja, estadísticas, logo y colores. Puede abrir o cerrar la agenda de cualquier barbero y decidir si sus barberos crean clientes. |
| **Barbero** | `equipo/` | Su agenda con su interruptor "abierta / llena" (lo de otros lo ve "Ocupado"), confirma horas, crea clientes (si el dueño lo permite), su caja y sus chats. |
| **Cliente** | `cliente/` | Carrito de servicios → barbero → hora → abono con comprobante. Mis horas, anular, mensajes, ofertas, perfil. |

Registro cerrado: el admin crea las barberías; cada dueño crea a sus barberos y clientes, y los barberos también crean clientes si el dueño lo permite (el acceso se envía por WhatsApp). Los clientes son de toda la barbería: reservan con cualquier barbero con agenda abierta, y su ficha muestra quién lo creó, su último corte y su barbero habitual.

## Reservas
- Calendario por barbero: **Día · Semana · Mes** (y **Año** / **Todos en columnas** para el dueño Premium). Los clientes ven lo ocupado sin nombres.
- Horas cada 15 min, mínimo 1 h de anticipación, hasta 14 días (Free) o 45 (Premium) adelante. Días **a consultar** (fin de semana por defecto) quedan *por aprobar*.
- **Abono fijo** (por defecto $4.000) por link de pago o transferencia: 15 min para tocar **"Ya aboné"** con la foto del comprobante, que llega al chat del barbero. Si no, la hora se libera sola.
- Estados: Esperando abono → Agendada → **Confirmada** (aviso al cliente) → Atendida (pasa sola a la caja) / No vino / Anulada.
- Anular con 24 h (o 1 h si reservó para el mismo día) → abono a favor; si no, se pierde. Si anula la barbería, siempre queda a favor.
- El servidor impide tomar dos veces la misma hora (restricción de exclusión en PostgreSQL).

## Avisos y mensajes
- Solo **push** + 🔔 campanita (sin correo). Cada aviso tiene ✓ Enviado · ✓✓ Recibido · ✓✓ Visto, en ambas direcciones.
  Botón **🗑️ Limpiar** en la campanita (solo la vacía para uno; quien envió conserva su ✓✓) y los avisos se borran solos a los 7 días.
- **Conexión:** 🟢 En línea / Visto hace… / ⚪ Nunca entró, en clientes, equipo y arriba de cada chat.
- **Colores:** cada perfil elige el color de su app. Free: 4 colores; Premium: los 12 y uno personalizado.
- Chat con ✓ / ✓✓ / ✓✓ azul. **Máximo 3 mensajes seguidos** hacia arriba (cliente → barbero, barbero → barbero, barbería → Josué) hasta que contesten; el que responde, sin límite. El cliente Premium escribe sin límite.
- Clave olvidada: botón en el inicio de sesión → WhatsApp de su barbería → el dueño pone una clave genérica → el cliente la cambia en su perfil.

## Free vs Premium ($4.900/mes, barbería y cliente, se paga a Josué)
| Barbería | Free | Premium |
|---|---|---|
| Barberos (con el dueño) / clientes | 3 / 40 | 10 / 500 |
| Servicios | 8 | Ilimitados con foto |
| Calendario | Día, Semana, Mes | + Año y "Todos" |
| Colores, portada, fotos del equipo | — | ✅ |
| Ofertas | 1 | Ilimitadas + VIP |
| Recordatorios automáticos, sellos, lista de espera | — | ✅ |
| Caja | Anotar y ver el día | Reportes, todo el equipo, comisiones |
| Estadísticas, horario y servicios por barbero | — | ✅ |

| Cliente | Free | Premium |
|---|---|---|
| Reservar adelante / horas activas | 14 días / 1 | 45 días / 3 |
| Mensajes | 3 seguidos | Sin límite ⭐ |
| Ofertas VIP, recordatorios, lista de espera, barbero favorito | — | ✅ |
| Íconos, colores, foto | Básicos | Todos + marco dorado |

Lo Premium se ve **plateado con 🔒** para quien no lo tiene. Activación: **key mensual** (BARB-XXXX-XXXX-XXXX) o **directa** desde el admin; ambas quedan en el historial con fecha de inicio y término. Prueba gratis de 7 días, una vez por cuenta.

## Estructura
```
index.html            Inicio de sesión (con el logo de la barbería) y ruteo por rol
cliente/  equipo/  admin/
shared/               core (utilidades, fechas en hora de Chile), cuenta (sesión, push), avisos, chat, agenda, perfil
supabase/instalar.sql Todas las tablas, reglas y funciones del servidor
supabase/functions/enviar/index.ts   Push, crear cuentas, restablecer claves
supabase/pruebas/     Prueba de punta a punta del servidor en PostgreSQL local
sw.js                 Funciona sin internet; se actualiza con botón cuando el admin libera la versión
```

Al cambiar archivos de la app: sube la versión en `version.json`, en `shared/core.js` (`VERSION`) y en `db_version()` / `notas_version()`
de `supabase/instalar.sql`. Para publicarla, Josué corre la consulta de actualización en Supabase: la versión se libera sola y
a todos les llega un push para tocar "Actualizar".
