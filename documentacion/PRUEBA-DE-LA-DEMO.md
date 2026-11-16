# Prueba completa del prototipo de TU LIGA

**Para qué:** comprobar, antes de crear Supabase, que cada perfil hace lo que tenías en mente.
**Cómo abrirlo:** doble clic en `index.html` (Chrome). Si no abre solo la liga, elegí **Liga Mar y Sierra**.
**Importante:** es una demo. Todo vive en la pestaña; **al recargar se pierde** (así podés probar sin miedo). Necesita internet solo para la tipografía.

---

## 🌐 1 · Sin usuario (jugador o público)

1. Mirá **En vivo**: hay un partido jugándose solo (demo).
2. Entrá a **Fixture**: es un **calendario** (días con partido marcados; tocá un día para ver sus partidos). También hay modo **Lista** y filtro por equipo.
3. Tocá un equipo en **Tabla** y un jugador en **Jugadores**: solo ves nombre, camiseta, altura y estadísticas.
4. ¿Falta algo que un jugador querría ver?

## 🏀 2 · Planillero (🔑 → cuenta **Planillero 1** a **5**, contraseña `demo`)

1. Aparece la pestaña **Planilla** a la izquierda.
2. Elegí un partido **Libre** → **Empezar planilla**.
   - Ves "Viene del fixture": fecha, cancha, categoría, fase y equipos ya están.
3. Completá: camiseta de hoy, árbitros, mesa, **quién vino** (marcá al menos 5 por equipo y revisá los números).
4. **Elegir los 5 titulares** → **Comenzar partido** → anotá algunas jugadas.
5. Tocá **← Volver a TU LIGA**: el partido sigue tuyo ("Continuar planilla").
6. Sin cerrar sesión, abrí otra pestaña del navegador… (en la versión real, otro planillero vería el partido como "En juego" y no podría abrirlo).
7. Salí de la planilla, andá a **En vivo** y **Fixture**: tu partido aparece **EN VIVO** con tu marcador.
7b. Bajá hasta *Jugadores* o el *Historial*: arriba queda **fijo el reloj** con el cuarto y el marcador. Tocalo para volver arriba.
8. Volvé, terminá y **Guardar partido**: pasa a **Final**, la **Tabla** se recalcula y volvés al fixture.

## 🛠️ 3 · Coordinador (🔑 → cuenta **Coordinador**, contraseña `demo`)

1. Pestaña **Gestión** con 2 accesos grandes.
2. **Fixture** → **+ Nuevo partido** (fase, grupo, fecha, hora, cancha, equipos) → Guardar.
3. **Fixture** → **⚡ Armar solo** → mirá los cruces que propone (todos contra todos) y editá uno a mano.
4. **Equipos y jugadores** → **+ Equipo** → elegí colores → Guardar.
5. En el equipo nuevo: **📋 Pegar lista** (por ejemplo `9 Joaquín Castro 185` en cada línea) y abrí un jugador: hay datos 🔒 privados.
6. Volvé a la tabla y al fixture públicos: el equipo y los colores ya están.
7. **Fixture** (pestaña pública): en un partido cerrado aparece **✏️ Corregir partido** → anulá una jugada o agregá una olvidada: el marcador y la tabla se recalculan.
8. **Mi cuenta → ☁️ Ver lo que se guardó en Drive**: lista de lo que se escribiría en la carpeta de la liga.

## 👥 4 · Cuentas de la liga y sesión única

1. Las cuentas son **de la liga**, no de las personas: 1 coordinador y 5 planilleros.
2. Abrí la web en **dos pestañas**. Entrá en las dos con la misma cuenta: la segunda pide confirmar ("está abierta en otro dispositivo") y, al confirmar, **la primera se cierra sola**.
3. Como coordinador: **Gestión → 👥 Cuentas de la liga**. Ves quién está en uso y podés **cambiar la clave** de cada cuenta.
4. Al terminar, usá **Salir**: la cuenta queda libre para otra persona.

## 🖼️ 5 · Logos y control del coordinador

1. Como coordinador: **Equipos y jugadores → un equipo → Subir logo** (PNG, JPG o SVG). Guardá: el logo aparece en el fixture, la tabla, la ficha del equipo y los partidos.
2. Con el equipo ya con logo, abrí una planilla y cerrá el partido: los **flyers** (resultado, equipo y tabla) llevan los logos con el aro del color del equipo.
3. **Gestión → ⚙️ Mi liga**: cambiá el nombre, subí el logo de la liga (sale en los flyers) y agregá una categoría (aparece el selector en la cabecera).
4. **Cuentas de la liga**: si una cuenta figura "En uso ahora", tocá **🔓 Liberar cuenta**: la sesión que la usaba se cierra sola.
5. **Fixture del coordinador**: en un partido con planillero, **🔓 Liberar a Planillero N** lo deja libre y otra cuenta lo **retoma desde las jugadas guardadas**.
6. En la planilla, la barra fija del reloj tiene el botón **⏸ Pausar / ▶ Iniciar**.

## 📱 6 · En el celular

1. Abrí la web desde el celular (cuando esté publicada) y agregala a la pantalla de inicio.
2. Revisá: menú inferior centrado y fijo, botones fáciles de tocar, el teclado numérico en camiseta y altura, y que nada se salga del ancho.
3. En la planilla, ¿el reloj fijo te alcanza o querés también el botón de pausa ahí?

## ✍️ Qué anotar mientras probás

- Lo que te confundió o te hizo dudar.
- Lo que falta (un botón, un dato, una pantalla).
- Lo que sobra.
- Lo que te gustó y no hay que tocar.

## Límites de esta demo (honestos)

- Las estadísticas por jugador y los promedios de un partido nuevo se calculan en la versión real desde las jugadas.
- "Un partido, un planillero" se prueba bien recién con Supabase (dos dispositivos reales).
- Drive se simula: la lista muestra qué filas se escribirían, no escribe nada.
- Los usuarios son de prueba. En la versión real los crea el coordinador y no hay registro público.
