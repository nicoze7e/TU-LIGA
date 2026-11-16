#!/bin/zsh
# Prueba TODA la base de datos en tu Mac, sin tocar Supabase: arma un Postgres temporal que imita a Supabase,
# corre 001 a 004 y las 30 pruebas de seguridad, y lo borra al terminar.
# Uso:  zsh base-de-datos/pruebas-locales/probar.sh
# Requiere:  brew install postgresql@16
PG=/opt/homebrew/opt/postgresql@16/bin
AQUI="${0:A:h}"; BD="${AQUI:h}"
TMP=$(mktemp -d); PORT=55432
# El «todo en uno» para pegar de una vez en Supabase se arma siempre desde los archivos sueltos (así nunca queda desactualizado).
cat "$BD/001-esquema.sql" "$BD/002-seguridad.sql" "$BD/003-vistas.sql" "$BD/005-logos.sql" "$BD/008-drive-ida-y-vuelta.sql" > "$BD/supabase-todo-en-uno.sql"
export PGOPTIONS='-c client_min_messages=warning'
$PG/initdb -D "$TMP/data" -U postgres --auth=trust -E UTF8 >/dev/null 2>&1 || { echo "❌ No pude crear la base temporal (¿está instalado postgresql@16?)"; exit 1; }
$PG/pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP" -l "$TMP/pg.log" start >/dev/null 2>&1; sleep 2
q() { $PG/psql -h "$TMP" -p $PORT -U postgres -d so_test -q -P pager=off "$@"; }
$PG/createdb -h "$TMP" -p $PORT -U postgres so_test
for f in "$AQUI/stub-supabase.sql" "$BD/001-esquema.sql" "$BD/002-seguridad.sql" "$BD/003-vistas.sql" "$BD/005-logos.sql" "$BD/008-drive-ida-y-vuelta.sql" "$BD/004-datos-de-prueba.sql"; do
  q -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -v "wal_level\|HINT" && { echo "❌ Falló $(basename $f)"; $PG/pg_ctl -D "$TMP/data" stop -m fast >/dev/null 2>&1; rm -rf "$TMP"; exit 1; }
  echo "✅ $(basename $f)"
done
q -f "$AQUI/test-seguridad.sql" | grep -v "✅" | tail -30
# 006: crea 6 usuarios de mentira y comprueba que quedan los 6 perfiles con su rol y nombre
q -c "insert into auth.users (id, email) select gen_random_uuid(), n || '.mar-y-sierra@example.com' from unnest(array['coordinador','planillero1','planillero2','planillero3','planillero4','planillero5']) n" >/dev/null
q -f "$BD/006-cuentas-de-liga.sql" >/dev/null 2>&1 && q -t -A -c "select case when count(*) = 6 and count(*) filter (where rol='coordinador') = 1 then '✅ 006: 6 cuentas de la liga (1 coordinador y 5 planilleros)' else '❌ 006: no quedaron las 6 cuentas' end from perfiles where nombre in ('Coordinador','Planillero 1','Planillero 2','Planillero 3','Planillero 4','Planillero 5')"
$PG/pg_ctl -D "$TMP/data" stop -m fast >/dev/null 2>&1; rm -rf "$TMP"
