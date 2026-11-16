#!/bin/zsh
# Regenera web-liga/demo-datos.js (los datos de demostración) a partir de la base: arma un Postgres temporal, corre 001 a 005,
# exporta lo que devuelven las vistas públicas y lo borra. Úsalo cada vez que cambien las vistas o los datos de prueba.
# Uso:  zsh base-de-datos/pruebas-locales/exportar-demo.sh      Requiere:  brew install postgresql@16
PG=/opt/homebrew/opt/postgresql@16/bin
AQUI="${0:A:h}"; BD="${AQUI:h}"; WEB="${BD:h}/web-liga"
TMP=$(mktemp -d); PORT=55433
export PGOPTIONS='-c client_min_messages=warning'
$PG/initdb -D "$TMP/data" -U postgres --auth=trust -E UTF8 >/dev/null 2>&1 || { echo "❌ No pude crear la base temporal"; exit 1; }
$PG/pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP" -l "$TMP/pg.log" start >/dev/null 2>&1; sleep 2
$PG/createdb -h "$TMP" -p $PORT -U postgres so_demo
for f in "$AQUI/stub-supabase.sql" "$BD/001-esquema.sql" "$BD/002-seguridad.sql" "$BD/003-vistas.sql" "$BD/005-logos.sql" "$BD/004-datos-de-prueba.sql"; do
  $PG/psql -h "$TMP" -p $PORT -U postgres -d so_demo -q -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -v "wal_level\|HINT" && { echo "❌ Falló $(basename $f)"; exit 1; }
done
PGBIN="$PG" PGHOST_="$TMP" PGPORT_=$PORT WEB_="$WEB" python3 - <<'PY'
import subprocess, json, os
PSQL = os.environ["PGBIN"] + "/psql"
def j(sql):
    r = subprocess.run([PSQL, "-h", os.environ["PGHOST_"], "-p", os.environ["PGPORT_"], "-U", "postgres", "-d", "so_demo", "-q", "-t", "-A", "-c",
                        f"select coalesce(json_agg(t),'[]'::json) from ({sql}) t"], capture_output=True, text=True)
    return json.loads(r.stdout)
D = {}
for v in ["vista_ligas", "vista_categorias", "vista_equipos", "vista_jugadores", "vista_tabla", "vista_stats_jugador", "vista_stats_equipo", "vista_stats_jugador_partido", "vista_partido_jugadores"]:
    D[v] = j(f"select * from {v}")
D["vista_partidos"] = j("select * from vista_partidos order by fecha_hora")
D["eventos"] = j("select id, seq, partido_id, tipo, equipo, jugador_id, jugador2_id, cuarto, reloj_seg, detalle, ref, anula from eventos order by seq")
s = "/* Datos de demostración (inventados). Salen de ejecutar 001 a 005 en una base de prueba: zsh base-de-datos/pruebas-locales/exportar-demo.sh */\nwindow.DEMO_DATOS = " + json.dumps(D, ensure_ascii=False, separators=(",", ":")) + ";\n"
open(os.environ["WEB_"] + "/demo-datos.js", "w", encoding="utf-8").write(s)
print("✅ demo-datos.js:", {k: len(v) for k, v in D.items() if k in ("vista_ligas", "vista_partidos", "eventos")}, len(s) // 1024, "KB")
PY
$PG/pg_ctl -D "$TMP/data" stop -m fast >/dev/null 2>&1; rm -rf "$TMP"
