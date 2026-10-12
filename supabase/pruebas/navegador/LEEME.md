# Pruebas en el navegador (desarrollo)

Simulan Supabase sobre un PostgreSQL local y recorren la app completa con Playwright:
admin crea barbería → dueño configura → cliente reserva y abona → barbero confirma → chat, caja, Premium, keys, clave olvidada.

```bash
cd supabase/pruebas/navegador && npm install
# 1) Base de datos local limpia con stub.sql + instalar.sql y la tabla mock_pass (ver server.js)
# 2) node server.js            (sirve la app en http://localhost:8787 y simula /auth, /rest/v1/rpc y /functions/v1/enviar)
# 3) node flujo.js && node flujo2.js   (las capturas quedan en ./capturas)
```
