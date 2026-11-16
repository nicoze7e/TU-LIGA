# Guía del Drive de ida y vuelta (paso a paso)

_Concepto: **TU LIGA es la base de toda la información.** El Drive es el espejo **administrativo y privado**: plantel con datos de regularidad, fixture oficial y resultados._
_Tiempo: ~25 min. Hacelo con la **cuenta de Google del proyecto**._

## Cómo funciona

| Sentido | Qué pasa |
|---|---|
| **IDA** · TU LIGA → hoja | Cada 5 min (o al instante) la hoja se actualiza con: **Plantel** (con documento, nacimiento, edad, habilitación y partidos jugados), **Equipos**, **Fixture**, **Resultados**, **Tabla**, **Estadísticas** y **Jugadas** (todo lo capturado, jugada por jugada). |
| **VUELTA** · hoja → TU LIGA | Se completa **Cargar plantel**, **Cargar fixture** o **Cargar resultados** → menú **🏀 TU LIGA → 1 · Validar** (no guarda nada, marca cada fila ✅ o ❌ con el motivo) → **2 · Importar**. |

**Reglas que cuidan los datos:**
- Las pestañas de la IDA se reescriben solas: no se editan. Para cambiar algo desde Drive se usa **Cargar …**.
- **Un resultado cargado a mano nunca pisa un partido capturado en la planilla.** Ese resultado sale de las jugadas.
- Un partido ya jugado no se modifica desde Drive.
- Importar dos veces lo mismo **no duplica**: actualiza.
- Las horas son siempre de Argentina.
- La hoja contiene datos privados: **no la compartas** fuera de la administración de la liga.

## Paso 1 · Supabase: habilitar el Drive  _(5 min · lo hacés vos)_

1. **SQL Editor → Create a new snippet** → pegá `base-de-datos/008-drive-ida-y-vuelta.sql` → **Run**. _(Solo ese archivo. NO vuelvas a correr el "todo en uno".)_
2. Inventá una **clave de Drive** larga (30 caracteres o más) con tu gestor de contraseñas y **guardala ahí**. Es una clave propia de la hoja, distinta de todo lo demás.
3. **New snippet** y pegá esto, cambiando `PEGAR-LA-CLAVE-ACÁ` por tu clave:

```sql
insert into drive_claves (liga_id, hash)
select id, encode(extensions.digest('PEGAR-LA-CLAVE-ACÁ', 'sha256'), 'hex') from ligas where slug = 'mar-y-sierra'
on conflict (liga_id) do update set hash = excluded.hash, creada_at = now();
```

4. **Run**. En la base queda solo la huella, no la clave. Después **borrá ese snippet** de la lista (así la clave no queda escrita).

> Para cortar el acceso de Drive cuando quieras: `delete from drive_claves where liga_id = (select id from ligas where slug = 'mar-y-sierra');`

## Paso 2 · Crear la hoja  _(3 min)_

1. En **drive.google.com** (cuenta del proyecto) → **Nuevo → Hojas de cálculo en blanco**.
2. Nombre: `TU LIGA · mar-y-sierra`.
3. **Extensiones → Apps Script**. Borrá el código de ejemplo y pegá **todo** `drive/hoja-tu-liga.gs`. **Guardá** (💾).
4. Volvé a la hoja y **recargá la página**: aparece el menú **🏀 TU LIGA**.

## Paso 3 · Primera vez  _(8 min)_

En el menú **🏀 TU LIGA**:

1. **Primera vez: preparar la hoja** → Google pide permisos: **Revisar permisos → tu cuenta → Avanzado → Ir a (proyecto) → Permitir**. Es normal: el script es tuyo.
2. **Primera vez: guardar la clave de Drive** → pegá la clave del paso 1. Debe decir _"Clave guardada y verificada ✅"_.
3. **Actualizar desde TU LIGA ahora** → en unos segundos se llenan las pestañas.
4. **Activar la actualización automática (cada 5 min)**.

## Paso 4 · Probar la vuelta  _(5 min)_

1. En **Cargar fixture** escribí una fila: fecha `dd/mm/aaaa`, hora `21:30`, cancha, categoría `+20`, fase, grupo, fecha nº, **local** y **visitante** (nombres tal cual los equipos).
2. Menú → **1 · Validar lo que cargué**. La columna **Estado** dice ✅ _crea el partido_ (o ❌ y el motivo).
3. Si está bien → **2 · Importar a TU LIGA**. En segundos el partido aparece en la web y en la pestaña **Fixture**.

La misma mecánica sirve para **Cargar plantel** (equipos y jugadores con documento, nacimiento y habilitación) y **Cargar resultados**.

## Paso 5 · Que la web avise al instante  _(5 min, opcional)_

1. En el editor de Apps Script: **Implementar → Nueva implementación → ⚙️ → Aplicación web**.
2. **Ejecutar como:** _Yo_ · **Quién tiene acceso:** _Cualquier persona_ → **Implementar**.
3. Pasame la **URL de la aplicación web** y la **URL de la hoja**: van en `docs/config.js` (`driveSyncUrl` y `driveHojaUrl`).

> Por qué "cualquier persona": la web no tiene claves y solo le pide al script que **copie** (como mucho una vez por minuto). Ese enlace no da acceso a ningún dato.

## Si algo falla

- **"Clave de Drive incorrecta"** → la clave pegada no coincide con la huella de Supabase: repetí el paso 1.3 y 3.2 con la misma clave.
- **❌ _La categoría "…" no existe_** → creala en la web: Gestión → Mi liga.
- **❌ _El equipo … no existe_** → cargalo primero en **Cargar plantel**.
- Cualquier otro mensaje: copialo y lo resolvemos.
