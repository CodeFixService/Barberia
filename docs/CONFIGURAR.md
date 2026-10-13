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
Al final debe decir **"Barbería instalada ✅ versión 1.3.1"**. Se puede volver a correr cuando haya una versión nueva: no borra datos.

> **Para actualizar a una versión nueva** basta con correr este mismo paso 1 otra vez (también puedes copiar la consulta en
> la app: **Administración → Ajustes → Versión → Copiar consulta**). Al terminar, la versión se **libera sola** y a todos les
> llega un **push "💈 Nueva versión"**: al tocarlo, la app se actualiza. Si la corres sin versión nueva, no pasa nada.

Esto también deja programadas las tareas automáticas (cada minuto):
- liberar las horas apartadas sin abono (15 min) y las "por aprobar" sin respuesta,
- recordatorios 24 h y 2 h antes (Premium),
- aviso 3 días antes de que venza un Premium y limpieza de comprobantes de más de 30 días,
- envío de notificaciones push.

## 2. Tu cuenta de administrador
1. **Authentication → Users → Add user → Create new user**
   - Email: `juanjosuecastilloloyola@gmail.com`
   - Una clave nueva solo tuya
   - Marca **Auto Confirm User** → **Create user**
2. (Recomendado) **Authentication → Sign In / Providers → Email** → apaga **Allow new users to sign up** → Save.
   El registro igual está cerrado por la base de datos; esto suma una capa más.

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
   - **Venta de Premium**: precio ($4.900), tu **link de Mercado Pago**, datos de transferencia (opcional) y tu WhatsApp → **Guardar**.
4. **💈 Barberías → + Barbería**: nombre, dueño, correo y WhatsApp → **Enviar por WhatsApp** (le llega el enlace y su clave).

## 5. Lo que hace cada barbería al entrar
1. **Más → Servicios y precios**: sus cortes con precio y duración.
2. **Más → Ajustes**: horario de lunes a domingo, abono (por defecto $4.000), link de pago y datos de transferencia, logo.
3. **Más → Mi equipo**: sus barberos (Free: 3 contándolo a él; Premium: 10).
4. **Más → Clientes**: crea a cada cliente y le envía su acceso por WhatsApp.
5. **Más → Enlace y QR**: para que sus clientes abran la app con su logo.

## Revisar que todo esté activo
SQL Editor:
```sql
select jobname, schedule from cron.job;           -- barberia-tick y barberia-push
select public.db_version();                        -- 1.3.1
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
Corre `stub.sql` (simula Supabase), `instalar.sql` y `prueba.sql` (reservas, abonos, anulaciones, chat, keys, caja y permisos).
