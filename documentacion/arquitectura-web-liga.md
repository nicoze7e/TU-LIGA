# 🏀 Super Oficial de Mesa · arquitectura de la web de la liga (v1)

**Para qué:** definir cómo se arma la web de la liga con 3 perfiles (jugadores, coordinadores y planilleros), la captura en vivo con varios planilleros a la vez y el archivo oficial en Google Sheets.
**Estado (2026-11-16):** 📐 diseño v2 con las 6 respuestas del dueño. **Fases 1 y 2 construidas y probadas en una base local** (`base-de-datos/` y `docs/`). Falta crearla en Supabase de verdad.
**Próximo paso:** crear el proyecto de Supabase, correr `001` a `004`, pegar la URL y la clave pública en `docs/config.js` y publicarla.
**Qué hay:** decisión · perfiles y permisos · piezas · captura simultánea · visor en vivo · Sheets · tablas · fases · riesgos · preguntas abiertas.

_Complementa a `modelo-de-datos.md` (v3, qué se captura) y `README.md`. No lo reemplaza: ese modelo pasa a ser las tablas de abajo._

---

## ✅ Decisión del 2026-11-16: plan A + B juntos (híbrido)

- **Supabase** (base de datos, login, avisos en vivo) es la **fuente de verdad** mientras se juega.
- **Google Sheets**, en la cuenta de Google del proyecto, es el **archivo oficial** y el lugar de consulta de los coordinadores. Se llena solo desde la base.
- **Por qué cambió mi recomendación:** antes era «una persona anotando». Ahora hay **varios planilleros a la vez**, **marcador en vivo para cualquiera** y **perfiles con permisos distintos**. Eso es justo lo que una hoja con Apps Script hace mal (lentitud por evento, sin avisos en vivo, permisos finos difíciles).
- **Lo que se conserva del plan A:** los datos terminan en hojas que el coordinador puede abrir, y el costo inicial es bajo.

## 👥 Perfiles y permisos

| Pieza | 👤 Jugador | 🧑‍💼 Coordinador | 📝 Planillero | 🛠️ Dueño |
|---|:-:|:-:|:-:|:-:|
| Ver tabla, partidos, estadísticas, historial | ✅ | ✅ | ✅ | ✅ |
| Ver el partido **en vivo** | ✅ | ✅ | ✅ | ✅ |
| Ver datos completos de jugadores por equipo | ❌ | ✅ | ❌ | ✅ |
| Cargar equipos, jugadores, inscripciones, fixture y resultados oficiales | ❌ | ✅ | ❌ | ✅ |
| Capturar un partido en tiempo real | ❌ | ❌ | ✅ (solo los asignados) | ✅ |
| Corregir un partido ya cerrado | ❌ | ✅ (queda registro) | ❌ | ✅ |
| Crear usuarios y asignar roles | ❌ | ❌ | ❌ | ✅ |
| Crear ligas | ❌ | ❌ | ❌ | ✅ |

**Reglas de acceso:**
- Los **planilleros no se registran solos**: cuentas creadas a mano (por vos o por un coordinador).
- Cada perfil está **atado a una liga**, así una liga nunca ve a otra.
- ✅ **Los jugadores entran sin login** (respuesta 1): la web es pública y se puede compartir. Solo ven NOMBRE, CAMISETA POR PARTIDO, ALTURA y estadísticas.

## 🧩 Las piezas

```
Jugador / Coordinador / Planillero
        │  (una sola web instalable, con pantallas según el perfil)
        ▼
Web de la liga  ── lee y escribe ──►  Supabase (Postgres + Login + Avisos en vivo)
(hospedada)                              │
                                         ├─► Reglas de acceso (RLS): quién ve y escribe qué
                                         ├─► Avisos en vivo (Realtime): el marcador llega a todos
                                         └─► Funciones de servidor: cierre de partido, cuentas
                                         │
                                         ▼
                              Google Sheets (cuenta del proyecto)
                              archivo oficial y vista del coordinador
```

| Pieza | Qué usa | Nota |
|---|---|---|
| **Web** | HTML + JS instalable, con el cliente de Supabase | Una sola base de código, pantallas según el rol |
| **Datos y login** | Supabase | Proyecto propio del Super Oficial |
| **Hosting** | Gratis al principio (GitHub Pages) | ⚠️ Si cobrás el servicio, Vercel Hobby no alcanza (solo uso no comercial): hay que usar Vercel Pro u otra opción |
| **Archivo oficial** | Google Sheets de la cuenta del proyecto | Sincronización desde la base, en un solo sentido |

## ⚡ Captura: un planillero por partido, varios partidos a la vez (respuesta 3)

**Lo que dijiste:** en cada partido hay **un solo planillero** que lleva todo. Que haya dos «a la vez» significa **dos partidos en dos canchas**, y la web tiene que mostrar los dos en vivo.

**Cómo lo resuelve el diseño:**
1. Cada partido tiene **un planillero asignado** (`partido_planillero`). Solo esa persona puede anotar en ese partido.
2. Cada evento es una **fila nueva con un identificador único creado en el celular** (nunca se edita). Un reintento por mala señal **no duplica** (probado).
3. La cola sin internet protege cada celular si se cae la señal, y los eventos se suben en orden.
4. **Dos partidos simultáneos** = dos planilleros escribiendo en dos partidos distintos. No se pisan, y la cartelera muestra ambos (la pantalla «En vivo» lista todos los partidos en juego).
5. Una corrección durante el partido es una **anulación** más un evento nuevo (queda registro).
6. Al terminar, el **planillero cierra el partido** (`cerrar_partido`): se guarda el marcador final y **todo se refleja solo en la web**.
7. Si más adelante hace falta un **segundo planillero en el mismo partido** (por ejemplo, para estadísticas finas), el diseño lo soporta sin cambios: los eventos son filas independientes. Hoy no está activado.

## ⏱️ El reloj oficial y el planillero que se olvida (respuesta 4)

**Punto de partida:** el reloj oficial lo lleva el **cronometrista**. El planillero lo **sigue** desde la app para ubicar cada jugada en el tiempo y calcular los minutos de cada jugador.

**Principio:** el reloj **nunca bloquea la captura**. Los puntos, faltas y rebotes son lo importante y no dependen del reloj. El reloj solo mejora la precisión de los minutos y del orden dentro del cuarto.

**La solución, en 4 capas (de la más simple a la más fina):**

| Capa | Qué hace | Quién la usa |
|---|---|---|
| 1 · **Sincronizar con un toque** | Un botón siempre visible: el planillero toca el número que marca el reloj oficial (por ejemplo 4:20). Se guarda un evento `RELOJ` que «ancla» el tiempo. | El planillero, cuando se acuerda |
| 2 · **Recordatorio suave** | Si pasaron más de 2 minutos reales sin sincronizar, o hay puntos con el reloj de la app parado, aparece un aviso **que no bloquea**: «¿Qué marca el reloj?». También se pide al final de cada cuarto. | La app, sola |
| 3 · **Reconstrucción automática** | Cada evento guarda la hora real del servidor. Entre dos anclas `RELOJ`, los eventos sin reloj se **ubican por interpolación** y quedan marcados como «estimados». | El sistema, solo |
| 4 · **Corrección del coordinador** | Si algo quedó muy corrido, el coordinador ajusta los tiempos de un partido cerrado (queda registro). | El coordinador |

**Límite honesto:** hoy las vistas de minutos usan el reloj que traiga cada evento; si no trae, lo toman como inicio del cuarto. La **interpolación (capa 3) queda para la fase 4**, cuando se haga la captura real. Sin ninguna marca de reloj, los minutos se muestran como «–» y no entran en los rankings de minutos.

## 📺 El visor en vivo

- Aparece en la web **solo cuando hay un partido en vivo**. Si hay **dos canchas jugando a la vez**, se muestran **los dos**.
- Muestra: marcador, cuarto, faltas del equipo, tiempos muertos, goleadores del partido y los últimos eventos.
- Funciona con las mismas suscripciones en vivo: cada evento nuevo llega al visor en menos de un segundo.
- **El reloj:** no se manda segundo a segundo. Se envían eventos «arranca» y «para» con su hora, y cada celular calcula el reloj por su cuenta. Es más liviano y se ve más fluido.
- Si el partido termina, el visor pasa a mostrarse como resumen del partido.

## 🗂️ Las tablas (cómo se traduce el modelo v3)

| Tabla | Qué guarda | Viene de |
|---|---|---|
| `ligas` | Cada liga (la primera: «mar y sierra»), con su reglamento | carpeta de liga |
| `categorias` | +20, +30, +40, por temporada | carpeta de categoría |
| `equipos` | Nombre, colores principal y alternativo | hoja `Equipos` |
| `jugadores` | Datos mínimos de la persona | hoja `Jugadores` |
| `inscripciones` | Qué jugador está en qué equipo, número de camiseta y temporada | hoja `Plantilla` |
| `perfiles` | Usuario, rol y liga | _nuevo_ |
| `partidos` | Fecha, hora, cancha, fase, equipos y estado (programado, en vivo, cerrado) | hoja `Datos` |
| `partido_mesa` | Planilleros y árbitros de ese partido, con su rol | _nuevo_ |
| `eventos` | **El corazón:** un evento por fila, con tipo, quién, referencia a otro evento y si fue anulado | hoja `Eventos` |
| `sanciones` | Suspensiones y descalificaciones | _nuevo_ |
| _vistas_ | `tabla_posiciones`, `est_partido`, `est_jugador`, `est_equipo` | `BASE`, `VISTA`, `EstPartido` |

Las **estadísticas y la tabla de posiciones no se cargan a mano**: son vistas que se calculan desde `eventos`.

## 📊 El archivo oficial en Google Sheets

- **Un solo sentido:** base de datos → Sheets. La base manda; las hojas son el archivo y la consulta del coordinador.
- **Cuándo se actualiza:** al cerrar cada partido y una vez por día.
- **Cómo:** un Apps Script de la cuenta del proyecto lee las vistas desde Supabase.
- **Qué lleva cada liga y categoría:** equipos y plantilla, partidos, tabla de posiciones, estadísticas individuales, y una hoja por partido cerrado.
- 🔐 La clave que usa ese script se guarda en las **propiedades del script**, nunca escrita en el código ni en este repositorio.

## 🚧 Fases

| # | Fase | Resultado | Depende de |
|---|---|---|---|
| 0 | Cerrar las preguntas abiertas y el reglamento | Decisiones escritas | tus respuestas |
| 1 | ✅ **Esquema + reglas de acceso + vistas + datos de prueba** (`base-de-datos/`). Probada en una base local: 30 de 30 pruebas de seguridad. ⏳ Falta crearla en Supabase | Base lista y probada con perfiles de mentira | 0 |
| 2 | ✅ **Web de la liga, parte de lectura** (`docs/`): en vivo, tabla, partidos, jugadores, equipos y comparar. Funciona en modo demostración. ⏳ Falta conectarla a Supabase | Cualquiera consulta la liga | 1 |
| 3 | **Panel del coordinador**: equipos, jugadores, inscripciones, fixture, resultados | Se carga la liga sin tocar hojas | 1 y 2 |
| 4 | **Captura del planillero**: la maqueta v5.9 escribe `eventos`, con cola sin internet y 2 planilleros a la vez | Se anota un partido de punta a punta | 1 |
| 5 | **Visor en vivo** | El partido se ve desde la cartelera | 2 y 4 |
| 6 | **Sincronización a Google Sheets** | Archivo oficial al día solo | 1 |
| 7 | **Control de fallas y piloto** con papel en paralelo | Se compara con la planilla de papel real | 4 y 5 |
| 8 | Flyers de cierre y pulido | Producto presentable | 7 |

**Las fases 1 y 2 ya están construidas** (lo que pediste: la web base). Siguen la 3 (panel del coordinador) y la 4 (captura del planillero).

## ⚠️ Riesgos y cómo los cubro

| Riesgo | Cómo se cubre |
|---|---|
| **El proyecto gratuito de Supabase se pausa tras 1 semana sin uso** | Con una liga que juega seguido no suele pasar; igual, un aviso de uso semanal o pasar al plan Pro (unos USD 25/mes) cuando cobres |
| **Sin señal en la cancha** | Cola en el celular y reintento automático |
| **Datos de menores y personales** | Mostrar lo mínimo en la cartelera pública y guardar el detalle solo para coordinadores (público: solo nombre, camiseta por partido y altura) |
| **Una clave filtrada** | Solo la clave pública va en la web; las secretas, en variables del servidor y en un gestor de contraseñas |
| **Un planillero comete un error** | Todo es anulable y queda registro de quién hizo qué |
| **Mucho para construir** | Fases cortas, cada una usable por sí sola |
| **Costo si se vuelve un servicio pago** | Hosting y plan de Supabase a evaluar antes de cobrar |

## ✅ Decisiones del 2026-11-16 (tus respuestas)

| # | Tema | Decisión |
|---|---|---|
| 1 | Jugadores | **Sin login.** Entran a la web, consultan y comparten. Ven solo **nombre, camiseta por partido, altura y estadísticas** |
| 2 | Ligas | **Varias.** Todo está atado a una liga. La cuenta de Google se organiza por ligas |
| 3 | Mesa | **Un planillero por partido.** Dos «a la vez» = dos partidos en dos canchas; la web muestra ambos en vivo |
| 4 | Reloj | Lo lleva el **cronometrista oficial**; el planillero lo sigue desde la app. Si se olvida: sincronización con un toque, recordatorio suave, reconstrucción automática y corrección del coordinador (ver arriba) |
| 5 | Datos del jugador | Los coordinadores guardan la **documentación reglamentaria** (documento, fecha de nacimiento, foto) más la **altura**. Nunca se publica. Públicos: nombre, camiseta por partido, altura y estadísticas |
| 6 | Correcciones | **Solo el coordinador** corrige un partido cerrado. El **planillero cierra** el partido y se carga solo en la web |

**Para qué se muestran las estadísticas:** que la liga sea más atractiva y competitiva: cada jugador sigue su rendimiento y se compara con sus rivales, **individualmente y por equipos** (la pantalla «Comparar» ya lo hace).

✅ **Menores (2026-11-16): no hay menores en la liga.** Igual, el documento, la fecha de nacimiento y la foto siguen siendo solo para coordinadores.

⚠️ **Sigue sin confirmar:** los **pendientes de reglamento** de abajo.

_Pendientes de reglamento que siguen abiertos desde antes: puntos de tabla, desempate, tiempo muerto del suplementario, límite de faltas, partidos perdidos por falta de jugadores._

## 🔐 La cuenta de Google del proyecto

**Cómo se organiza (respuesta 2):** por ligas. Dentro de la cuenta: una carpeta por liga y, dentro de cada una, una carpeta por categoría con sus hojas.

```
Cuenta del Super Oficial
└── mar-y-sierra            (una carpeta por liga)
    ├── +20 · 2026          (una carpeta por categoría)
    │     ├── Equipos y plantilla
    │     ├── Partidos y tabla
    │     ├── Estadísticas
    │     └── partidos/  (una hoja por partido cerrado)
    └── +30 · 2026 …
```

**¿Hace falta que me compartas la cuenta para que yo cree las hojas? No, y no lo recomiendo:**
- **Nunca compartas la contraseña.** No es necesario y es riesgoso.
- Mis conectores de Drive y Sheets están en **tu cuenta personal**, no en la del proyecto.
- Las hojas las va a crear **un Apps Script dentro de la cuenta del proyecto** (el mismo que sincroniza desde Supabase). Así los archivos nacen siendo **de esa cuenta** y, cuando entre una liga nueva, se arma sola su carpeta.
- Si más adelante querés que yo mire o ajuste un archivo, lo más seguro es **compartir una carpeta puntual** con tu cuenta personal como editor, no la cuenta entera.

**Seguridad de la cuenta:**
- **Contraseña** en un gestor de contraseñas, nunca en este cerebro, ni en Notas ni en Drive.
- **Verificación en 2 pasos** activada y mail de recuperación a tu cuenta.
- La clave que use el Apps Script para leer Supabase va en las **propiedades del script**, nunca escrita en el código.

---

## Decisiones del 2026-11-16 (tarde): nombre, menú y roles en una sola web

- **Nombre:** la web se llama **TU LIGA**. **Super Oficial** es solo la herramienta del planillero (el "joystick" que captura estadísticas) y vive dentro de TU LIGA.
- **Menú inferior:** fijo y centrado al hacer scroll; flexible (sirve con 5 o 6 pestañas).
- **Colores de equipo:** se mantienen y los elige cada equipo (coordinador) en Gestión → Equipos; se reflejan en toda la app.
- **Una sola web, funciones según el usuario:**
  - Sin usuario (jugadores y público): 5 pestañas públicas.
  - Planillero: pestaña extra 🏀 *Planilla* a la izquierda (mis partidos → quinteto → joystick Super Oficial en pantalla completa).
  - Coordinador: pestaña extra 🛠️ *Gestión* (partidos y asignar planillero/cronometrista, equipos y colores, jugadores con datos privados, ajustes de la liga, corregir partidos cerrados anulando jugadas).
  - Entrada: botón 🔑 del encabezado → correo y contraseña. Los usuarios los crea el dueño o coordinador (registro público apagado).
- **Maquetas:** `docs/vista-previa-roles.html` (usa `maqueta.html` y `maqueta.css`). Son estáticas: no guardan nada.

---

## Decisiones del 2026-11-16 (noche): perfiles afinados

**Cambio respecto a la maqueta anterior:** se descarta el joystick nuevo; **Super Oficial v5.9 (`maqueta-captura.html`) se conserva entero** y se fusiona con la web.

### 🏀 Planillero
1. Pestaña **Planilla** = *Elegir partido*, conectada al **fixture** (Hoy / Esta semana / Todos). Estados: Libre · Lo llevás vos · En juego por otro planillero (solo mirar).
2. **Antes del partido** (Super Oficial): fecha, hora, cancha, categoría, fase y equipos **vienen del fixture** (pasos 0 a 3 originales desaparecen). Sigue pidiendo: camiseta de hoy (principal/alternativa), árbitros, oficiales de mesa (incluye cronometrista) y quién vino con su número.
3. Titulares → captura → historial → cierre: **igual que v5.9**. Al cerrar, el fixture pasa a Final y se ve en la web.
4. El **login por clave de liga** de Super Oficial se reemplaza por el usuario de la web. Un partido = un planillero (se "reclama" al empezar).

### 🛠️ Coordinador
- **Se elimina** la asignación de planillero y cronometrista por partido.
- **Principales:** 📅 *Fixture* (crear, editar, "Armar solo" todos contra todos) y 🛡️ *Equipos y jugadores* (plantel por equipo, camiseta habitual, altura, posición, colores, datos 🔒 privados, "Pegar lista").
- **Secundaria:** *Corregir partido*: aparece como botón en la pestaña Partidos/Fixture cuando consulta partidos cerrados (no en Gestión).
- Todo lo que carga se refleja en la base y, desde ahí, en el **Drive de la liga** (`SUPER OFICIAL / <liga> / <categoría> / BASE`, usando la estructura de `setup-estructura.gs`).

### 🌐 Sin usuario
- La pestaña **Partidos** es el **fixture público** (agrupado por fecha, filtro de categoría y equipo). Es el calendario del que se alimentan jugadores y planilleros.

### Cambios que pide la base de datos (pendiente de aplicar)
- `partidos`: agregar `nro_fecha` (jornada); `cronometrista` y `oficiales` ya existen (los completa el planillero).
- `jugadores`: agregar `posicion` y `habilitado`.
- Función para **reclamar** un partido (un planillero por partido) y sincronizar con `partido_planillero`.
- Sync a Drive: adaptar `setup-estructura.gs` (hojas Equipos, Jugadores, Partidos) para que se llenen desde Supabase. El `crear-estructura-drive.gs` simple queda reemplazado (`.bak`).

---

## Decisiones del 2026-11-16 (cierre): prototipo completo

- **Estética:** toda la web adopta la de Super Oficial (fondo `#0F141A`, acento `#FF8A4C`, Barlow Condensed para títulos y números).
- **Armar solo:** queda tal cual (todos contra todos). Hay **fases y grupos**: cada partido lleva `fase` y `grupo`. Con el armado manual se aprende cómo optimizarlo después.
- **Prototipo funcional** (`docs/index.html`): login simulado de planillero y coordinador, Planilla conectada al fixture, Super Oficial v5.9 fusionado (`captura.html`), Gestión (fixture, equipos, jugadores), Corregir desde el fixture y simulación del registro en Drive. Guía de prueba: `docs/PRUEBA-PROTOTIPO.md`.
- **Módulos:** `roles.js` (perfiles) + ganchos en `app.js`. Al pasar a Supabase solo se reemplazan las lecturas/escrituras de `roles.js` y `captura.html` (mismo contrato de mensajes).
- Las maquetas estáticas anteriores (`maqueta.html`, `maqueta.css`, `vista-previa-roles.html`) quedan **superadas** por el prototipo.


---

## Decisiones del 2026-11-16 (cuentas y celular)

- **Cuentas de la liga, no de personas:** 1 coordinador (único que modifica la liga; lo comparten varias personas) y **5 planilleros** (`Planillero 1` a `5`, exclusivos de la app y propiedad de la liga). Quien tiene los datos de la cuenta la usa. Así el inicio de sesión no guarda datos personales.
- **Una sola sesión por cuenta:** al entrar desde otro dispositivo se pide confirmar y la sesión anterior se cierra. Garantiza que solo una persona modifique a la vez. En el prototipo se simula con `localStorage` (latido cada 15 s); en Supabase: tabla `sesiones_activas(cuenta, sid, latido)` con la misma regla (60 s de margen).
- **Auth real:** cada cuenta es un usuario de Supabase con correo técnico (por ejemplo `planillero1@<liga>.tuliga`, sin buzón real) y registro público apagado. El coordinador cambia las claves desde Gestión → Cuentas (función segura en el servidor; nunca desde la web con la clave secreta).
- **Planilla:** el partido queda a nombre de la **cuenta** (`Planillero 3`), no de una persona. Reloj y marcador **fijos arriba** al bajar a jugadores o historial.
- **Celular primero:** captura desde celular. Ajustes de ancho (360 px y 390 px probados), campos de 16 px (sin zoom de iOS), teclado numérico, áreas táctiles de 44 px o más, zonas seguras, `100dvh`, tema de color para selectores y fechas, íconos desde `logo.svg` (incluye maskable y 180), aviso demo descartable y estados de carga con esqueleto.
- **Pendiente de la base (para el paso de Supabase):** `nro_fecha` y `grupo` en `partidos`, `posicion` y `habilitado` en `jugadores`, función para reclamar un partido y tabla de sesiones.


---

## Decisiones del 2026-11-16 (control del coordinador, logos y Supabase)

- **Control del coordinador:** además del fixture y los equipos, ahora administra **Mi liga** (nombre, logo, categorías), las **cuentas** (ver quién está en uso, **liberar** una cuenta, **cambiar la clave**) y puede **liberar un partido** de su planillero. Sigue siendo la única cuenta que modifica la liga.
- **Logos:** solo el coordinador sube el logo de cada equipo y de la liga, igual que elige el color. Se ven en la web (fixture, tabla, ficha, partidos) y en los flyers PNG de Super Oficial (resultado, equipo y tabla), con aro del color del equipo. En la base: `equipos.logo_url`, `ligas.logo_url` y bucket público `logos` con carpeta por liga (`logos/<id-liga>/…`) cuya escritura solo permite el coordinador de esa liga.
- **Retomar un partido:** la planilla se reconstruye desde las jugadas guardadas (necesario cuando se pierde un celular o el coordinador libera el partido). Si alguna jugada no cumple las reglas, se retoma hasta la última válida y se avisa.
- **Reloj fijo con pausa:** la barra fija permite pausar e iniciar el reloj sin volver arriba.
- **Base de datos v2** (67 pruebas de seguridad pasan): `reclamar_partido`, `liberar_partido`, `tomar_sesion`/`latido_sesion`/`cerrar_sesion` (una sesión por cuenta, 60 s de margen), `liberar_cuenta`, `cuentas_de_liga`, tabla `sesiones_activas`, vistas `vista_plantel_planilla` y `vista_planilla_claims` (solo cuentas de la liga), columnas `nro_fecha`, `grupo`, `posicion`, `habilitado`, `logo_url`.
- **Cuentas en Supabase:** 6 usuarios por liga con correo técnico `coordinador.<slug>@example.com` y `planilleroN.<slug>@example.com` (sin buzón real, registro público apagado). Cambiar la clave de otra cuenta se hace en la Edge Function `cambiar-clave` (la clave secreta nunca está en la web).
- **Siguiente:** conectar la web a Supabase (`roles.js` y `captura.html` leen y escriben por la misma interfaz) y probarla contra el proyecto real.

- **2026-11-16 · Fixture como calendario** para todos los perfiles (sin usuario, planillero y coordinador): mes con días marcados (🔴 en vivo · 🟠 próximo · ⚪ final), partidos del día elegido debajo, modo Lista y filtro por equipo. En Gestión, el coordinador toca un día y crea ahí un partido ("+ Nuevo partido este día").


---

## 2026-11-16 · Conexión a Supabase (proyecto `Tu Liga Project`, São Paulo)

- **Hecho y probado:** la web pública lee la base real (ligas, calendario, tabla, jugadores, fichas, partido en vivo); los datos privados y los perfiles están bloqueados para el público. Login por cuenta (`<cuenta>.<slug>@example.com`), sesión única con latido de 15 s, retomar la sesión al recargar, y carga de los datos reales de la liga para coordinador y planillero.
- **Detalle técnico:** el cliente de Supabase usa sesión por pestaña (`sessionStorage`) y un candado propio, porque el de la librería se cuelga al abrir el archivo con doble clic. `?demo=1` fuerza el modo demostración.
- **Pendiente (próximo paso):** conectar los *guardar* del coordinador (fixture, equipos, jugadores, logos a Storage, Mi liga, corregir) y de la planilla (reclamar partido, plantel con `cargar_planilla`, jugadas como `eventos`, cerrar), además de la copia a Drive. Hoy esos botones avisan que llegan en el próximo paso.
- **Base:** 73 pruebas de seguridad pasan (`007` agrega `cargar_planilla` y la edición de la liga por el coordinador).

## 2026-11-16 · Guardar real y copia en Drive

- **Guardar real (modo Supabase):** el coordinador guarda partidos, equipos (con logo en Storage), jugadores (con datos privados), categorías, Mi liga, corregir (anula/agrega jugadas y recalcula) y libera cuentas y partidos. El planillero reclama el partido, deja armada la planilla (`cargar_planilla`), abre el partido, envía las jugadas en orden y de a tandas con reintento, anula las que se corrigen y cierra (`cerrar_partido`). Retomar un partido en vivo reconstruye la planilla desde las jugadas guardadas.
- **Base:** 80 pruebas de seguridad y de flujo pasan, incluido el flujo completo de la planilla.
- **Drive:** `drive/sincronizar-con-supabase.gs` copia cada liga a una hoja (Equipos, Jugadores, Fixture, Resultados, Tabla, Estadísticas, Jugadas) cada 5 min y a pedido de la web. Solo lee datos públicos; no lleva claves secretas ni datos privados. Guía: `drive/GUIA-DRIVE.md`.
- **Pendiente:** botón **Importar** (la web lee las hojas "Cargar fixture" y "Cargar equipos", muestra una vista previa y el coordinador confirma).

## 2026-11-16 · Drive de ida y vuelta (concepto definido por el usuario)

- **TU LIGA es la base de toda la información.** El Drive es el espejo **administrativo y privado**: plantel con datos de regularidad (documento, nacimiento, edad, habilitación, partidos jugados), fixture oficial y resultados (base de la tabla y las estadísticas).
- **IDA:** la hoja (`hoja-tu-liga.gs`, Apps Script dentro de la hoja) lee las vistas públicas y `drive_exportar` (datos privados) cada 5 min o a pedido de la web.
- **VUELTA:** pestañas "Cargar plantel / fixture / resultados" → menú *Validar* (sin guardar) → *Importar*, que llama a `drive_importar` en la base. Idempotente, fila por fila, nunca pisa un partido capturado ni modifica uno jugado.
- **Seguridad:** clave de Drive propia por liga (solo su huella en `drive_claves`), revocable, distinta de la clave secreta de Supabase; una clave mala demora 1 s la respuesta. Los datos privados salen únicamente por esa función.
- **Base:** `008-drive-ida-y-vuelta.sql`; 100 pruebas de seguridad y de flujo pasan.
