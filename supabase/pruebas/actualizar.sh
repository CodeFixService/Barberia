#!/bin/bash
# Prueba de actualización: base 1.4 con datos → instalar.sql actual (dos veces) → verificar que no se perdió nada.
# v2.1: también base 2.0 con los datos de su propia prueba → instalar.sql actual (dos veces) → verificar.
# Uso: ./actualizar.sh "<opciones de psql>"
set -e
cd "$(dirname "$0")"
PSQL="psql $1 -v ON_ERROR_STOP=1 -q"
V14=$(mktemp)
git show e8ad6f2:supabase/instalar.sql > "$V14"
$PSQL -d postgres -c "drop database if exists barberia_actualizar" -c "create database barberia_actualizar" >/dev/null
$PSQL -d barberia_actualizar -f stub.sql -f "$V14" -f semilla14.sql 2>&1 | grep -v NOTICE | grep -v '^$'
$PSQL -d barberia_actualizar -f ../instalar.sql 2>&1 | grep -v NOTICE | grep -v '^$' | grep -v -- '---' | grep -v 'row)'
$PSQL -d barberia_actualizar -f ../instalar.sql 2>&1 | grep -v NOTICE | grep -v '^$' | grep -v -- '---' | grep -v 'row)'
$PSQL -d barberia_actualizar -f verificar_actualizacion.sql 2>&1 | grep -v '^$' | grep -v -- '---' | grep -v 'row)' | sed 's/^psql:[^ ]* NOTICE:  //'
rm -f "$V14"

V20=$(mktemp); P20=$(mktemp)
git show bdab2cd:supabase/instalar.sql > "$V20"
git show bdab2cd:supabase/pruebas/prueba.sql > "$P20"
$PSQL -d postgres -c "drop database if exists barberia_actualizar20" -c "create database barberia_actualizar20" >/dev/null
$PSQL -d barberia_actualizar20 -f stub.sql -f "$V20" -f "$P20" > /dev/null 2>&1
$PSQL -d barberia_actualizar20 -f ../instalar.sql 2>&1 | grep -v NOTICE | grep -v '^$' | grep -v -- '---' | grep -v 'row)'
$PSQL -d barberia_actualizar20 -f ../instalar.sql 2>&1 | grep -v NOTICE | grep -v '^$' | grep -v -- '---' | grep -v 'row)'
$PSQL -d barberia_actualizar20 -f verificar_20.sql 2>&1 | grep -v '^$' | grep -v -- '---' | grep -v 'row)' | sed 's/^psql:[^ ]* NOTICE:  //'
rm -f "$V20" "$P20"
