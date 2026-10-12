#!/bin/bash
# Corre la prueba completa en un PostgreSQL local: ./correr.sh "<opciones de psql>"
set -e
cd "$(dirname "$0")"
PSQL="psql $1 -v ON_ERROR_STOP=1 -q"
$PSQL -d postgres -c "drop database if exists barberia_prueba" -c "create database barberia_prueba" >/dev/null
$PSQL -d barberia_prueba -f stub.sql -f ../instalar.sql -f prueba.sql 2>&1 | grep -v '^$'
