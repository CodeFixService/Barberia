# Configurar la app (una sola vez, ~15 minutos)

Proyecto Supabase: `https://gxlabxuttnxvzkucckef.supabase.co` (ya está en `shared/config.js`).

## 0. Publicar la app (Cloudflare)
La app está publicada en Cloudflare, conectada al repositorio `CodeFixService/Barberia`:
**https://barberia.juanjosuecastilloloyola.workers.dev/**

> Cada cambio que llega a `main` se publica solo en 1–2 minutos (Cloudflare → el proyecto → *Deployments* muestra cada publicación).
> La dirección antigua de GitHub Pages redirige sola a esta.

## 1. Crear la base de datos
Supabase → **SQL Editor** → **+ New query** → pega esto → **Run**:

```sql
create extension if not exists http with schema extensions;
do $$ begin
  execute (select content from extensions.http_get('https://raw.githubusercontent.com/CodeFixService/Barberia/main/supabase/instalar.sql'));
end $$;
```

(Es el archivo [`supabase/instalar-corto.sql`](../supabase/instalar-corto.sql): descarga e instala [`supabase/instalar.sql`](../supabase/instalar.sql) desde `main`.
Si todavía no uniste la rama, pega el contenido completo de `instalar.sql`).

Si aparece un aviso de operación destructiva, toca **Run this query** (es normal).
Al final debe decir **"Barbería instalada ✅ versión 2.0"**. Se puede volver a correr cuando haya una versión nueva: no borra datos.

> **Para actualizar a una versión nueva** basta con correr este mismo paso 1 otra vez (también puedes copiar la consulta en
> la app: **Administración → Ajustes → Versión → Copiar consulta**). Al terminar, la versión se **libera sola** y a todos les
> llega un **push "💈 Nueva versión"**: al tocarlo, la app se actualiza. Si la corres sin versión nueva, no pasa nada.

Esto también deja programadas las tareas automáticas (cada minuto):
- liberar las horas apartadas sin comprobante (10 min, editable en Ajustes → Reglas); las que están **en revisión** no se liberan solas,
- recordarle al barbero (y luego al dueño) los abonos sin revisar; si pasan 24 h desde la hora sin revisión, el abono queda a favor del cliente,
- recordatorios 24 h y 2 h antes (según el plan),
- aviso antes de que venza un Premium (con botón para pagar) y limpieza diaria (comprobantes, avisos y horas anuladas antiguas),
- envío de notificaciones push.

## 2. Tu cuenta de administrador
1. **Authentication → Users → Add user → Create new user**
   - Email: `juanjosuecastilloloyola@gmail.com`
   - Una clave nueva solo tuya
   - Marca **Auto Confirm User** → **Create user**
2. **Authentication → Sign In / Providers → Email**:
   - **Allow new users to sign up**: **activado** (desde la v2.0). Los clientes se crean la cuenta desde el link o QR de su barbería.
     Nadie más puede registrarse: la base de datos rechaza cualquier cuenta que no venga del link de una barbería o que no hayas creado tú (barberías) o la barbería (equipo y clientes).
   - **Confirm email**: recomendado **desactivado**, así el cliente entra al tiro. Si lo dejas activado, tendrá que confirmar su correo antes de entrar.
   - **Save**.

## 3. El enviador de notificaciones (Edge Function)
1. **Edge Functions → Deploy a new function → Via Editor**.
2. Borra el ejemplo y pega esta línea (es [`corto.ts`](../supabase/functions/enviar/corto.ts)):
   ```ts
   import 'https://raw.githubusercontent.com/CodeFixService/Barberia/main/supabase/functions/enviar/index.ts';
   ```
   (o el contenido completo de [`index.ts`](../supabase/functions/enviar/index.ts)).
3. Nombre: **`enviar`** → **Deploy function**.
4. En la función: **Details / Settings** → apaga **Verify JWT** → **Save**.

Esta función envía los push, crea las cuentas y restablece las claves.

## 4. Primer ingreso
1. Abre **https://barberia.juanjosuecastilloloyola.workers.dev/** en el celular → **Instalar**
   (iPhone: Compartir → **Agregar a inicio**, y ábrela desde el ícono).
2. Entra con tu correo y clave: llegas a **Administración**.
3. **⚙️ Ajustes**:
   - **Generar claves push** (una sola vez) → **Enviarme un aviso de prueba**.
   - **Probar servidor**: debe decir "Función enviar v1.0 funcionando".
   - **Precios y links**: para el Premium de barberías y el de clientes tienes 2 espacios (precio, texto y link de Mercado Pago). Marca cuál está **activo**: el precio que ve la gente es el del espacio activo.
   - **Planes**: nombre, descripción, beneficios, duración, límites y opciones sí/no de Free y Premium.
   - **Reglas**: minutos para pagar, devolución, horas para cancelar, días de regalo, lista negra… → **Guardar**.
   - **Textos**: lo que lee la gente al reservar y pagar.
4. **💈 Barberías → + Barbería**: nombre, dueño, correo y WhatsApp → **Enviar por WhatsApp** (le llega el enlace y su clave). Parte con los días de Premium de regalo de Reglas.
5. **💰 Pagos**: aquí llegan los comprobantes de Premium (barberías y clientes). Ábrelos, apruébalos o recházalos con motivo.

## 5. Lo que hace cada barbería al entrar
Su **Inicio** le muestra lo que le falta configurar:
1. **Más → Servicios y precios**: sus cortes con precio y duración.
2. **Más → Links de pago**: dos links del abono (monto, link y texto; uno activo) y datos de transferencia. **Sin esto no recibe reservas sin cuenta.**
3. **Más → Horario** y **Más → Perfil de la barbería** (logo, dirección, WhatsApp).
4. **Más → Mi equipo**: sus barberos (no ven precios ni links de pago).
5. **Más → Mis tiempos** (cada barbero, y el dueño para sí): cuánto le dura cada servicio, su descanso entre citas y cada cuánto parten sus horas.
6. **Inicio → Tu link para clientes** (o Más → Enlace y QR): con ese link o QR los clientes **reservan sin cuenta** (nombre + WhatsApp), pagan el abono,
   suben el comprobante y siguen su hora en su link personal; o se crean su cuenta.

## Revisar que todo esté activo
SQL Editor:
```sql
select jobname, schedule from cron.job;           -- barberia-tick y barberia-push
select public.db_version();                        -- 2.0
```
Si `cron.job` no existe: **Database → Extensions** → activa **pg_cron** y **pg_net**, y vuelve a correr el paso 1.

## Límites del plan gratis de Supabase
- 500 MB de datos (el admin muestra el uso en 🖥️ Servidor) y 50.000 usuarios.
- Se pausa si pasan 7 días sin uso; se reactiva con un clic en el panel. Con barberías activas no debería pasar.
- Cuando el uso pase de ~70%, conviene Supabase Pro.

## Nunca compartas
La **service_role** ni la **secret key** de Supabase. La clave **anon public** sí es pública (va en la app).

## Probar el servidor en un PostgreSQL local (para desarrollo)
```bash
supabase/pruebas/correr.sh "-h localhost -U postgres"
```
Corre `stub.sql` (simula Supabase), `instalar.sql` y `prueba.sql` (reservas con y sin cuenta, abono en revisión, cancelación con devolución/saldo, reagendar,
calificaciones y lista negra, pagos de Premium, chat, caja y permisos). `supabase/pruebas/actualizar.sh` prueba que actualizar desde la 1.4 no pierde nada.
