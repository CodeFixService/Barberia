#!/bin/bash
# Base local limpia para las pruebas en el navegador: stub + instalar.sql + claves simuladas (admin: admin123).
set -e
cd "$(dirname "$0")"
PSQL="psql ${1:--h /var/tmp/pgb -p 54329 -U postgres} -v ON_ERROR_STOP=1 -q"
$PSQL -d postgres -c "drop database if exists barberia_ui" -c "create database barberia_ui" >/dev/null
$PSQL -d barberia_ui -f ../stub.sql -f ../../instalar.sql >/dev/null 2>&1
$PSQL -d barberia_ui -c "create table if not exists mock_pass (email text primary key, pass text not null)" \
  -c "insert into auth.users (email) values ('juanjosuecastilloloyola@gmail.com')" \
  -c "insert into mock_pass values ('juanjosuecastilloloyola@gmail.com', 'admin123')" >/dev/null
echo "Base barberia_ui lista"
