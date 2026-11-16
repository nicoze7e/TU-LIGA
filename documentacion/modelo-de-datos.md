# Super Oficial de Mesa · modelo de datos v3

**Para qué:** que el capturador y la base de la liga hablen el mismo idioma, para que los totales salgan solos y se pueda auditar cualquier número.
**Estado:** v3 (2026-11-02, al día con la maqueta v5.9; ver sección «v3» abajo). Antes, v2.2 (2026-10-31): suma tiempos muertos por mitad con luces y medición del acierto de las sugerencias. Antes, v2.1: suma acceso por clave, reloj, rebote, robo, pérdida, asistencia, tiros errados, suplementario, emparejamiento editable, valoración propia y flyers de cierre. v1 (2026-10-30), definido con mis respuestas. Los puntos pendientes están marcados con ⏳.
**Próximo paso:** crear la cuenta de Google del Super Oficial y correr el script de `setup-estructura.gs`.
**Qué hay:** decisiones · principio · tablas · tipos de evento · reglas de control · privacidad · pantallas de la app · pendientes.

Hoja madre: `README.md` (esta misma carpeta).

---

## 🆕 v3 (2026-11-02): lo que cambia respecto de v2.2

**Fuente:** maqueta v5.9 y `setup-estructura.gs` v0.4.

- **CAMBIO:** `jug` sale y `j2` entra. Con `j2` vacío es «sale sin reemplazo»; con `jug` vacío es «suma un jugador» (un equipo puede jugar con menos de 5).
- **ROB y PER:** el robo registra ROB + PER atómicos, con `ref`. La pérdida sola lleva `jug` (o vacío si no se identificó).
- **REB:** `ref` apunta al tiro errado; ofensivo o defensivo se deduce de ahí. Hoja `Jugadores`: columnas nuevas `RO` y `RD`.
- **Faltas:** penalización de equipo en la 4.ª falta del cuarto. Descalificación por 5 faltas, 2 técnicas, 1 antideportiva + 1 técnica, 2 antideportivas o 1 descalificante. El descalificado no vuelve a entrar.
- **Camisetas:** `Equipos` suma `color_principal` y `color_alternativo`; la app sugiere el color de cada equipo en el partido.
- **Cierre:** nueva hoja `EstPartido` con una fila por jugador (id_partido, id_jugador, jugador, equipo, min, pts, tc, t3, tl, ro, rd, reb, ast, rob, per, faltas, descalificado, val). Los que no jugaron figuran. `cerrarPartido_` es idempotente, guarda el PDF A4 en la carpeta «Informes» y escribe el enlace en `Partidos › enlace`.
- ⏳ Sigue pendiente con la liga: puntos de tabla, desempate, tiempo muerto del suplementario, límite de faltas y partido perdido con menos de 2 jugadores.

---

## 🆕 v2 (2026-10-31): lo que cambia

**Fuente:** mi paso a paso del 2026-10-31 y la maqueta v3 (`maqueta-captura.html`).

### 🔐 Acceso: una clave por liga (decisión A)
- **Quién escribe:** solo quien tiene la clave de la liga. La app tiene una pantalla previa: elegir liga y escribir la clave.
- **Dónde vive:** una hoja `LIGAS` en la cuenta del Super Oficial (id de liga, nombre, **hash de la clave**, estado). Nunca la clave escrita.
- **Cómo se valida:** el Apps Script compara el hash y devuelve un **token de sesión** que vence. La página nunca ve la clave guardada.
- **Cambiar o quitar una clave:** el dueño edita `LIGAS`. Así se corta el acceso a una liga sin tocar las demás.

### 🧭 Previa del partido (orden fijo)
0 fecha · hora · cancha → 1 categoría (+20, +30, +40) → 2 fase (fase regular, playoff, cuartos, semifinal, final) → 3 equipos → 4 árbitros (hasta 3) → 5 oficiales de mesa (2) → 6 jugadores que vinieron + camiseta.

### 🏀 Pantalla en vivo
- Marcador arriba, **con los cuartos en vertical en el medio** y el **reloj** del cuarto. El cuarto elegido es la guía de todos los eventos.
- Botonera en 3 burbujas de color: **gestión** (cambio · tiempo muerto · falta), **juego** (pérdida · rebote · robo) y **puntos** (+1 · +2 · +3).
- **Centro de sugerencias:** tras tocar la acción, 3 jugadores sugeridos por equipo. Solo los **puntos** muestran a los 5 de cada uno. Siempre hay «ver los 5».
- Lista de jugadores en cancha con **su contador de minutos**.
- Botón **Estadísticas del partido**: resumen, y una tabla por equipo.

### 🧮 Cómo sugiere (reglas simples y explicables)
| Acción | Sube la sugerencia de… |
|---|---|
| Rebote | los más altos y de posición interior (pívot, ala-pívot) |
| Robo | bases y escoltas, los más bajos y rápidos |
| Pérdida | quienes llevan la bola (base, escolta, alero) |
| Falta | el jugador que **marca** al rival que acaba de actuar; después, el interior con más contacto |
| Cambio (quién sale) | el que más minutos lleva y más faltas tiene |
| Cambio (quién entra) | el del banco que menos jugó |

**Emparejamiento:** cada jugador en cancha marca al rival de su misma posición (o el más parecido en altura). Se calcula solo; más adelante puede editarse.

### 🗄️ Qué se suma a la base
| Dónde | Campo nuevo | Para qué |
|---|---|---|
| `Jugadores` | `altura_cm`, `posicion` (B, E, A, AP, P) | Sugerencias y emparejamiento |
| `Eventos` | `t` (segundos de juego), `uid`, `corrige`, `motivo` | Minutos jugados, sin duplicados y auditoría |
| `Eventos` (tipos) | `REB`, `ROB`, `PER` | Rebotes, robos y pérdidas |
| `Partidos` | `fase`, `categoria`, `arbitro_1..3`, `mesa_1..2` | La previa completa |
| `Jugadores` (calculado) | `MIN`, `REB`, `ROB`, `PER`, `VAL` | Estadísticas nuevas |
| `Config` | `duracion_cuarto` (10 min) y pesos de la valoración | Se cambian sin tocar código |
| `LIGAS` (nueva) | `id_liga`, `nombre`, `hash_clave`, `estado` | Acceso por clave |
| `Correcciones` (nueva) | hora, antes → después, marcador | Auditoría |

**Minutos jugados:** suma de los tramos entre que un jugador entra (quinteto o cambio) y sale. Depende del **reloj**, así que el reloj es parte del modelo (antes decía «la app no lleva reloj»).

**Valoración simple (v2):** `VAL = puntos + rebotes + robos − pérdidas − faltas`. La valoración FIBA completa también pide asistencias, tiros fallados y tapas, que hoy no se anotan.

### ✅ Decisiones del 2026-10-31 (sobre mis sugerencias)
| # | Sugerencia | Decisión | Cómo quedó |
|---|---|---|---|
| 1 | Reloj | Sí, **debajo de los cuartos** y que llame la atención | Tablero LED grande: verde en marcha, naranja titilando en pausa. «Ajustar reloj» lo iguala al del tablero real |
| 2 | Asistencia | Sí, con el mismo criterio de sugerencias | Tras un doble o triple aparece «¿quién asistió?» con 3 sugeridos (bases y escoltas primero) y «Sin asistencia». Evento `AST`, con `ref` al punto |
| 3 | Rebote ofensivo/defensivo | No hace falta | Un solo `REB` |
| 4 | Tiro fallado | Sí | Interruptor **Convertido / Errado** sobre los puntos: `X1`, `X2`, `X3`. Tras un errado, la app pasa sola a «¿quién tomó el rebote?» |
| 5 | Suplementario | Sí | Si hay empate al terminar el 4.º, aparece **+Ex**: períodos de 5 min (`cuarto` 5, 6…) |
| 6 | Emparejamiento editable | Sí | Se propone solo al elegir titulares y se edita ahí o en «Quién marca a quién». Al hacer un cambio, **el que entra hereda la marca del que sale** |

**Cómo se aplica el emparejamiento (lo que pediste que te explicara):**
1. Al elegir los 5 titulares, la app propone parejas por posición y, si hay empate, por altura (base con base, pívot con pívot).
2. El oficial las corrige con un selector por jugador; si repite un rival, se **intercambian** solas.
3. Esas parejas alimentan las sugerencias de **falta**: si Sierra acaba de anotar con el #6, el primer sugerido para la falta de Marlín es quien lo marca.
4. En un cambio, quien entra toma la pareja del que sale. Si el oficial toca «Quién marca a quién», puede cambiarla en cualquier momento.
5. **En la base:** por ahora vive en la sesión de la app. Si resulta útil, se guarda como evento `MARCA` (jugador, rival) para estudiar defensas.

### 🧮 Valoración propia (borrador para que la definas)
`VAL = puntos×1 + rebotes×1 + robos×1,5 + asistencias×1,5 − pérdidas×1,5 − faltas×0,5 − libre errado×0,3 − doble errado×0,5 − triple errado×0,5`
- Los pesos viven en `BASE › Config` (B5 a B13). Se cambian ahí y todo se recalcula.
- La maqueta usa esos mismos pesos y los muestra en «Estadísticas».
- ⏳ **Falta tu criterio:** ¿cuánto pesa cada acción? ¿Querés valoración por 10 minutos (para comparar al que juega poco)? ¿Algo que premie la defensa o la constancia?

### 🖼️ Flyers de cierre (Instagram, 4:5)
Al cerrar el partido, la app arma 4 imágenes en el celular, sin servidor, y una descripción lista para copiar.
| Flyer | Qué muestra |
|---|---|
| 1 · Resultado | Marcador, ganador, parciales por cuarto (con suplementario) y figura del partido |
| 2 · Equipo local | Hasta 9 jugadores por valoración: puntos, rebotes, asistencias, robos y VAL, más % de campo, triples y libres |
| 3 · Equipo visitante | Lo mismo |
| 4 · Tabla de posiciones | Tabla actualizada tras el partido, con los dos equipos marcados «JUGÓ HOY» |
**Descripción breve:** resultado, ganador, liga, categoría y fase, fecha y hora, cancha y figura. **Ojo:** en tu mensaje decías «3 flyers» y listabas 4; armé los 4.
⏳ Para la tabla falta saber cuántos puntos da ganar y perder (hoy: 2 y 1, como ejemplo) y el criterio de desempate.

### ⏱️ Tiempos muertos por conjunto de cuartos (regla del 2026-10-31)
| Período | Tiempos muertos por equipo | Regla |
|---|---|---|
| Cuartos 1 y 2 | 2 | Se usan cuando se quiera |
| Cuartos 3 y 4 | 3 | 2 cuando se quiera; el 3.º **solo desde los últimos 2 minutos del 4.º cuarto** |
| Suplementario | 1 por período | ⏳ Supuesto mío: confirmar con la liga |

- **Lo que no se usa no se acumula:** los de la primera mitad vencen al empezar el 3.er cuarto.
- **La app rechaza** un tiempo muerto de más, con el motivo. Si el error se carga en un cuarto equivocado, la corrección «mover de cuarto» también lo valida.
- **Marcador (burbuja):** cuartos en horizontal arriba · reloj al centro entre los dos puntajes · debajo de cada puntaje, en chico, los **tiempos muertos disponibles ahora** y las faltas · abajo, **luces horizontales** por equipo.
- **Luces:** un color por grupo (ámbar = 1.ª mitad, azul = 2.ª mitad, rojo = final del 4.º, violeta = suplementario). Brillante = disponible, **oscura = usada o vencida**, contorno punteado = todavía no se puede usar.
- **En la base:** no hace falta una columna nueva. Los límites se calculan desde los eventos `TM` (con su `cuarto` y `t`). Los topes viven en `Config` (`tm_mitad1`, `tm_mitad2`, `tm_final_seg`).

### 🧠 ¿Puede la app sugerir mejor a medida que crece la base? Sí
Hoy las sugerencias son **reglas fijas** (altura, posición, a quién marca). Con partidos acumulados pueden aprender de lo que realmente pasó. Se hace por niveles, sin cambiar la app:
| Nivel | Cuándo | Qué cambia |
|---|---|---|
| 0 · Reglas | Hoy | Altura, posición y emparejamiento |
| 1 · Tasas por minuto | ~3 a 5 partidos por jugador | Rebotes, robos, asistencias, pérdidas y faltas **por minuto jugado** de cada jugador |
| 2 · Mezcla | ~8 a 10 partidos | `puntaje = (1 − w) × regla + w × tasa del jugador`, con `w` que sube con los minutos jugados (con pocos datos manda la regla) |
| 3 · Contexto | Temporada | Quién comete falta ante qué rival (parejas reales), rendimiento por fase y por cuarto |

**Lo que lo hace posible y ya quedó armado:** cada vez que el oficial elige un jugador, se guarda `rk` en el evento: **la posición que tenía entre los 3 sugeridos** (1, 2, 3 o 0 si no estaba). Así medimos el **acierto**: en la maqueta ya se ve al cerrar («2 de 3»). Sin esa medición no sabríamos si una mejora mejora.
- **Honestidad:** con pocos partidos, un promedio engaña (un jugador que jugó 8 minutos). Por eso la mezcla pesa por minutos jugados.
- **Quién decide:** el oficial siempre puede elegir a otro. La sugerencia ordena, no decide.
- **Se calcula en la base**, en una pestaña `Perfiles` (tasas por jugador). La app solo lee ese resultado.
- ⏳ **Datos de valoración:** los definimos juntos en la próxima etapa.

### 🗄️ Campos nuevos de esta vuelta
| Dónde | Campo |
|---|---|
| `Eventos` | `ref` (punto asistido), `rk` (posición entre los 3 sugeridos) y los tipos `AST`, `X1`, `X2`, `X3` |
| `Jugadores` (calculado) | `AST`, `X1`, `X2`, `X3`. `VAL` pasa a usar los pesos de `Config` |
| `Config` | `w_pts`…`w_x3` y `duracion_suplementario_min` |

---

## ✅ Decisiones (mis respuestas del 2026-10-30)

| Tema | Decisión |
|---|---|
| Puntos | «Simples» = tiros libres. Tipos: P1 (libre), P2 y P3 |
| Faltas | 4 tipos: personal, técnica, antideportiva y descalificante. Se anotan al jugador que la comete |
| Se anota | Cuartos y sus parciales · tiempos muertos por equipo · quintetos iniciales · cambios (define quién jugó y quién no). Queda abierto a sumar más |
| Quién captura | Cualquier persona, con el **celular**: la app debe ser ligera e intuitiva |
| Datos base | Equipos y jugadores sin límite, cargados a mano en la hoja. **La base manda.** Un delegado verifica que todo esté en regla |
| Quién ve | Delegados con acceso a la cuenta; jugadores con un **link privado de solo lectura** que comparten los delegados |
| Datos personales | Se guardan (inscripción y reglamento). Ver «Privacidad» |
| Dueño | Una cuenta de Google para el Super Oficial, **mía**, para poder venderlo como servicio |
| Negocio | Piloto gratis para pulirlo; después, suscripción mensual por mantenimiento (idea a desarrollar al final) |
| Categorías | +20, +30 y +40 son categorías |
| Foco | Un resultado palpable del **sistema completo**: capturador + base de liga |
| Después | Armador de flyers (estadísticas por partido, generales y tabla de posiciones) para redes |

## 🧭 Principio de diseño

**La ficha del partido existe para documentar con fidelidad los eventos que suceden.** Lo individual de cada jugador queda por debajo en las prioridades. El oficial de mesa está atento al **evento** más que a quién lo hace: por eso, al anotar, **primero se elige la acción** (punto, falta, cambio, tiempo muerto) y **después el jugador** involucrado. Ese orden sigue el ritmo real del partido.

**La app solo agrega filas de eventos. Nunca edita totales.** Los totales los calculan fórmulas. Si hay un error, el evento se marca `anulado = sí`: no se borra. Así todo se puede auditar y una falla no se propaga.

---

## 🗂️ Estructura en Drive

```
SUPER OFICIAL                       (cuenta de Google del dueño)
└─ mar-y-sierra/                    (una carpeta por liga)
   ├─ +20/   BASE · mar-y-sierra +20   ·   partidos/
   ├─ +30/   BASE · mar-y-sierra +30   ·   partidos/
   └─ +40/   BASE · mar-y-sierra +40   ·   partidos/
```

## 📊 La hoja `BASE` de cada categoría

| Pestaña | Qué tiene | Quién la escribe |
|---|---|---|
| `Equipos` | `id_equipo`, `nombre`, `delegado`, `estado` | Delegado (a mano) |
| `Jugadores` | Datos de inscripción + estadísticas (`PJ`, `PTS`, `P1`, `P2`, `P3`, `FALTAS`) | Delegado + fórmulas |
| `Partidos` | `id_partido`, `fecha`, `hora`, `cancha`, `local`, `visitante`, `estado`, `pts_local`, `pts_visit`, `enlace`, `ganador` | App al abrir y cerrar |
| `Eventos` | Todos los eventos de todos los partidos | App, al cerrar el partido |
| `Posiciones` | PJ, PG, PP, PF, PC, DIF, PTS | Fórmulas |
| `Estadisticas` | Líderes de puntos, triples y faltas | Fórmulas |
| `Config` | Puntos por ganar y perder ⏳ | Dueño |
| `Control` | Semáforo de errores | Fórmulas |

## 🧾 La tabla `Eventos` (el corazón)

| Col | Campo | Ejemplo |
|---|---|---|
| A | `id_evento` | 0000231 |
| B | `hora` | 2026-11-07 21:14:05 |
| C | `id_partido` | 2026-11-07_marlin-vs-sierra |
| D | `cuarto` | 2 |
| E | `equipo` | local / visitante |
| F | `id_jugador` | J0042 |
| G | `tipo` | ver abajo |
| H | `detalle` | personal / tecnica / antideportiva / descalificante |
| I | `jugador_2` | el que entra en un cambio |
| J | `anulado` | no |
| K | `corrige` | id del evento que reemplaza |
| L | `motivo` | jugador equivocado |
| M | `uid` | código único del toque |

### Tipos de evento
| `tipo` | Qué es | Notas |
|---|---|---|
| `P1`, `P2`, `P3` | Tiro libre, doble y triple convertidos | Valen 1, 2 y 3 puntos |
| `FALTA` | Falta de un jugador | `detalle` dice cuál de las 4 |
| `TM` | Tiempo muerto | Lleva `equipo` y `cuarto` |
| `QUINTETO` | Jugador del quinteto inicial | 5 filas por equipo |
| `CAMBIO` | Sale `id_jugador`, entra `jugador_2` | Define quién jugó |
| `JUEGA` | Marca que el jugador jugó el partido | La escribe el script al cerrar, a partir de `QUINTETO` y `CAMBIO`. De acá sale `PJ` |

**Parciales:** salen de sumar los puntos por `cuarto`. No hace falta un evento aparte.

## 🔍 Reglas de control (pestaña `Control`)

| # | Chequeo | Alerta |
|---|---|---|
| 1 | Evento sin jugador, sin cuarto o sin equipo | ⚠️ |
| 2 | Jugador con 5 o más faltas | ⚠️ (el límite exacto depende del reglamento ⏳) |
| 3 | Jugador no habilitado o ausente de la plantilla del partido | ⚠️ |
| 4 | Dos eventos idénticos en menos de 2 segundos (doble toque) | ⚠️ |
| 5 | Quinteto inicial con menos o más de 5 por equipo | ⚠️ |
| 6 | Marcador del acta en papel ≠ suma de puntos (solo en el piloto) | ⚠️ |

## 🔒 Privacidad (decisión de diseño)

La base tiene **datos personales** (inscripción). Por eso:

- **Delegados:** acceso a la hoja `BASE` completa.
- **Jugadores:** link de solo lectura a un archivo **aparte**, `VISTA · mar-y-sierra +30`, que **no contiene** documento ni fecha de nacimiento. Solo nombre, camiseta, tabla y estadísticas.
- **Nunca** se comparte el link de `BASE` con los jugadores: un link de solo lectura de la hoja entera deja ver todas sus pestañas.
- Comunicarles a los jugadores para qué se guardan sus datos y quién accede.
- ✅ Menores (2026-11-16): no hay menores en la liga.

## 🧾 Procedimiento de captura de un partido (v1, mis palabras del 2026-10-30)

La hoja del partido tiene 4 pestañas: `Datos`, `Plantilla`, `Eventos` y `Resumen`. Se llena en **tres momentos**.

### 1 · PREVIO AL PARTIDO (`Datos` y `Plantilla`)
| # | Paso | Quién | Se guarda en |
|---|---|---|---|
| 1 | Elegir los dos equipos que se enfrentan | Oficial de mesa | `Datos`: local y visitante |
| 2 | La app **carga sola** los jugadores de cada equipo (desde `BASE › Jugadores`) | App | `Plantilla` (todos, `presente = no`) |
| 3 | Marcar los **jugadores presentes** y poner su **número de camiseta** de ese partido | Oficial | `Plantilla`: `presente` y `camiseta` |
| 4 | Anotar el nombre de **3 árbitros** y de **2 oficiales de mesa** | Oficial | `Datos`: `arbitro_1..3`, `mesa_1..2` |
| 5 | Anotar **fecha, hora, instancia** del torneo y **cancha** | Oficial | `Datos` |

Controles: al menos 5 presentes por equipo · camisetas sin repetir dentro de un equipo · aviso si un jugador no está habilitado.

### 2 · COMIENZA EL PARTIDO (`Eventos`)
| # | Evento | Detalle |
|---|---|---|
| 1 | **Quinteto inicial** | 5 de los presentes por equipo |
| 2 | **Cuartos y reloj** | (v2) La app lleva el reloj del cuarto y anota en qué cuarto sucede cada evento. De ahí salen los minutos |
| 3 | **Puntos** | Jugador → `+1` (libre), `+2` o `+3` |
| 4 | **Faltas** | Jugador → tipo (personal, técnica, antideportiva o descalificante) |
| 5 | **Cambios** | Sale uno que está en cancha y entra uno presente que no está |
| 6 | **Tiempos muertos** | Por equipo |

**Consulta en vivo (requisito):** dentro de la app, el oficial ve **las estadísticas de ese partido** en tiempo real: marcador y parciales por cuarto, puntos por jugador, faltas por jugador y por equipo, tiempos muertos usados y quiénes están en cancha. Se calcula en el celular a partir de los eventos (no espera a la hoja).

### 3 · AL FINALIZAR (se carga a `BASE` y `VISTA`)
| # | Paso | Resultado |
|---|---|---|
| 1 | Revisar el semáforo de control | Sin ⚠️ pendientes |
| 2 | **Quién ganó**: se suman los puntos de cada equipo | Fila cerrada en `BASE › Partidos` (puntos y ganador) |
| 3 | Pasar los eventos a `BASE › Eventos` (sin duplicar si ya estaban) y escribir `JUEGA` por jugador | La base tiene el detalle |
| 4 | **Sumar las estadísticas de cada jugador** a la tabla general | Las fórmulas actualizan `Jugadores`, `Posiciones` y `Estadisticas` de `BASE` |
| 5 | Actualizar `VISTA` con una foto de la tabla y las estadísticas, **sin datos personales** | Los jugadores ven lo nuevo con su link |
| 6 | Bloquear la hoja del partido (solo lectura) | Para corregir, el delegado la **reabre** y se vuelve a cerrar sin duplicar |

---

## 🛠️ Corrección de errores sobre la marcha

**Principio:** un error humano se corrige **agregando**, no borrando. El original queda guardado, marcado como anulado, y el nuevo evento apunta a él. Así la corrección nunca rompe lo que ya estaba.

### Qué cambia en `Eventos`
| Columna nueva | Para qué |
|---|---|
| `corrige` | `id` del evento que reemplaza (vacío si es un evento normal) |
| `motivo` | Opcional: «jugador equivocado», «equipo equivocado», «tipo equivocado», «duplicado» |
| `uid` | Código único que genera el celular en cada toque: si un envío se repite por mala señal, **no se duplica** |

Y una pestaña nueva, **`Correcciones`**, solo de lectura: hora, qué se corrigió, **antes → después** y el marcador antes y después. Es el registro de auditoría.

### Los errores típicos y su corrección
| Error | Corrección | Qué queda en los datos |
|---|---|---|
| Triple al jugador equivocado | **Cambiar jugador** | Original anulado + triple nuevo al jugador correcto |
| Punto al equipo contrario | **Cambiar equipo** (la app pide elegir el jugador correcto) | Original anulado + evento nuevo en el otro equipo |
| Puse +2 y era +3 | **Cambiar tipo** | Original anulado + evento nuevo |
| Toqué dos veces | **Anular** | Original anulado |
| Tipo de falta equivocado | **Cambiar detalle** | Original anulado + falta nueva |
| Evento en el cuarto equivocado | **Mover de cuarto** | Original anulado + evento nuevo |
| Cambio mal cargado | **Corregir cambio** | Se revisa que los eventos posteriores sigan siendo válidos (ver abajo) |

### Cómo se usa (sin pensar)
1. **Deshacer** (un toque): anula el último evento. Siempre visible.
2. **Corregir cualquiera:** en la lista de «últimos eventos», se toca el que está mal y aparece un menú corto: *cambiar jugador · cambiar equipo · cambiar tipo · mover de cuarto · anular*.
3. **Vista previa antes de confirmar:** «Antes: Local 14 · Después: Local 13» y el cambio de cada jugador.
4. **Deshacer la corrección:** también se puede; la corrección es un evento más.

### Cómo se protege lo demás
- **Reproducción completa:** después de cada corrección la app recalcula **todo el partido desde cero** con los eventos vigentes. Si la corrección deja algo imposible (por ejemplo, anular un cambio y que un jugador siga anotando sin estar en cancha), **avisa y no la aplica**, y explica qué evento choca.
- **Avisos que no bloquean:** una sexta falta, un jugador ausente de la plantilla. Se ven en el semáforo.
- **Un solo escritor a la vez:** el script usa un candado (`LockService`) para que dos celulares no pisen la misma fila.
- **Sin señal:** las correcciones se guardan en el celular y se envían **en el mismo orden**.
- **Partido cerrado:** solo el delegado puede reabrirlo; al volver a cerrar, los datos se reemplazan, no se duplican.

### Casos de prueba de la corrección (antes del piloto)
1. Triple al jugador equivocado → cambiar jugador → los puntos pasan al jugador correcto y el marcador no cambia.
2. Punto al equipo contrario → cambiar equipo → el marcador de ambos equipos se ajusta.
3. Anular un evento ya anulado → no hace nada y avisa.
4. Anular un cambio con eventos posteriores → se rechaza y explica por qué.
5. Corregir y deshacer la corrección → vuelve exactamente al estado original.
6. Corte de señal en medio de una corrección → al volver no se duplica nada.

---

## 📱 Pantallas de la app (celular, una mano)

| # | Pantalla | Qué hace |
|---|---|---|
| 1 | Elegir | Liga → categoría → partido (o crear uno) |
| 2 | Plantillas | Marcar presentes de cada equipo |
| 3 | Quintetos | Elegir 5 por equipo |
| 4 | **Juego** | Marcador y cuarto arriba. **Paso 1: la acción** (`+1` `+2` `+3` `Falta` `Cambio` `Tiempo muerto`). **Paso 2: el jugador** (los 10 en cancha, los dos equipos a la vez; tocar a uno completa el evento). Falta pide un **paso 3** con el tipo; cambio pide quién entra; tiempo muerto pide el equipo. «Último evento» con `Deshacer` y `Corregir` siempre a la vista |
| 5 | Cierre | Resumen y control de errores. Confirmar → se consolida en `BASE` |

Reglas de usabilidad: botones de 48 px o más · todo a un toque · el deshacer dura siempre · se ve si hay conexión · si se corta, el celular guarda los eventos y los envía cuando vuelve.

---

## ⏳ Pendientes

- ✅ Resueltas (2026-10-30): sin reloj, solo cuarto · instancia y cancha · 3 árbitros y 2 oficiales de mesa · `VISTA` se actualiza solo al cerrar.

- Puntos de la tabla por ganar y perder, y criterio de desempate.
- Faltas: límite de eliminación y casos especiales (antideportiva, descalificante).
- ¿Hay tiempo suplementario?
- Partidos por fecha (se analiza con el uso).
- Una planilla de referencia en papel (foto) de lo que se usa hoy.
- Menores y datos personales.
- Flyers: fase posterior.

## 🧪 Cómo se prueba
Un partido simulado (o grabado) cargado en la app y en papel a la vez. El sistema es confiable cuando los números coinciden en 3 partidos seguidos.
