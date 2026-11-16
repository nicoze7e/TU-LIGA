# Base de datos de TU LIGA (Supabase)

Guarda la liga (equipos, jugadores, partidos y jugadas), decide **quién ve y quién escribe qué**, y calcula sola la tabla y las estadísticas.

## Los archivos (se corren en este orden en el SQL Editor de Supabase)

| Archivo | Qué hace |
|---|---|
| `supabase-todo-en-uno.sql` | **Instalación nueva:** reúne 001, 002, 003, 005 y 008 en uno solo. Pegalo entero y tocá Run. |
| `001-esquema.sql` | Tablas: ligas, categorías, equipos (con logo), jugadores, perfiles, partidos, **eventos** (jugadas, solo se agregan o se anulan) y sesiones. |
| `002-seguridad.sql` | Reglas por perfil (RLS) y acciones: reclamar y liberar partidos, abrir y cerrar, sesión única por cuenta, cargar planilla. |
| `003-vistas.sql` | Vistas públicas: tabla, estadísticas por jugador, partido y equipo (calculadas desde las jugadas). Sin datos privados. |
| `004-datos-de-prueba.sql` | _Opcional._ Dos ligas inventadas para mostrar la web. Se borran con una línea. |
| `005-logos.sql` | Espacio público de logos; solo el coordinador de cada liga puede subir a su carpeta. |
| `006-cuentas-de-liga.sql` | Crea los perfiles de las 6 cuentas de una liga (1 coordinador + 5 planilleros). |
| `007-ajustes-planilla-y-liga.sql` | **Solo si ya instalaste antes** sin él: plantel de la planilla y edición de la liga. (Ya está incluido en 002.) |
| `008-drive-ida-y-vuelta.sql` | Copia privada en Drive y carga desde Drive, con clave propia por liga. |
| `pruebas-locales/` | `probar.sh` arma un Postgres temporal que imita a Supabase y corre **100 pruebas** de seguridad y de flujo. |

## Cómo se instala (resumen)

1. Crear el proyecto en Supabase (región más cercana).
2. SQL Editor → pegar `supabase-todo-en-uno.sql` → Run. Después, opcional, `004`.
3. Authentication: apagar el registro público y crear las 6 cuentas. Correr `006`.
4. Pasar la URL y la clave **publishable** a `docs/config.js`.

Guía detallada: `GUIA-SUPABASE-paso-a-paso.md`.

## Seguridad en una línea

El público (sin login) solo lee vistas con nombre, camiseta por partido, altura y estadísticas. Documento y fecha de nacimiento viven en una tabla que solo ve el coordinador de esa liga. Los eventos **no se editan ni se borran**: una corrección es una anulación más una jugada nueva, y queda registro.

## Qué prueban las 100 pruebas

Sin login · planillero asignado y de otro partido · coordinador propio y de otra liga · dueño · un partido, un planillero · sesión única por cuenta · logos por carpeta de liga · jugadas con id propio (un reintento no duplica) · flujo completo de la planilla (reclamar, abrir, anotar, anular, cerrar) · clave de Drive correcta e incorrecta · validar sin guardar e importar sin duplicar · hora de Argentina.

Para correrlas en tu Mac: `brew install postgresql@16` y `zsh base-de-datos/pruebas-locales/probar.sh`.

## Límites

- Plan gratis de Supabase: se **pausa tras 1 semana sin uso** y tiene 500 MB. Para una liga activa conviene el plan Pro.
- La clave `service_role` nunca va en la web ni en este repositorio.
