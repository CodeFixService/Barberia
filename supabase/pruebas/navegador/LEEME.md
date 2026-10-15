# Pruebas en el navegador (desarrollo)

Simulan Supabase sobre un PostgreSQL local y recorren la app completa con Playwright.

```bash
cd supabase/pruebas/navegador && npm install
./preparar.sh            # base local limpia (stub.sql + instalar.sql + claves simuladas; admin: admin123)
node server.js &         # sirve la app en http://localhost:8787 y simula /auth (entrar y crear cuenta), /rest/v1/rpc y /functions/v1/enviar
node flujo6.js           # v2.0 completo: reserva sin cuenta, comprobante, aprobar, saldo, reagendar, calificaciones, lista negra, cuenta desde el link, Premium con comprobante, barbero sin montos, admin
# Recorridos encadenados (sobre la misma base, en orden): node flujo.js && node flujo2.js && node flujo3.js && node flujo4.js && node flujo5.js
```

Las capturas quedan en `./capturas`. Para repetir `flujo6.js` o la cadena, vuelve a correr `./preparar.sh` (con el servidor detenido).
