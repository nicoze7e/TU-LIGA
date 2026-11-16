# Guía de Supabase · paso a paso (la hacemos juntos)

_Para qué: poner la base de TU LIGA en internet, con sus 6 cuentas (1 coordinador y 5 planilleros), para poder mostrarla._
_Tiempo total: ~40 min. Hacelo desde la cuenta de Google del proyecto._

**Regla de oro:** me pasás solo la **URL** y la clave **pública (anon)**. Contraseñas y la clave `service_role` **nunca** me las pegues ni las guardes en archivos.

---

## Antes de empezar: qué es cada cosa

- **Proyecto Supabase:** la base de datos + las cuentas + el tiempo real, alojados por ellos.
- **SQL Editor:** donde pegás los archivos `.sql` de esta carpeta y tocás **Run**.
- **Clave pública (anon):** va en `docs/config.js`. Es pública a propósito: la seguridad la dan las reglas que ya probamos (67 pruebas).
- **Clave secreta (service_role):** da acceso total. No va en la web, ni en el cerebro, ni en Notas, ni en Drive. No la necesitamos: la usa solo la función "cambiar-clave" dentro de Supabase.

---

## Paso 1 · Crear el proyecto  _(lo hacés vos · 5 min)_

1. Entrá a **supabase.com** → **Sign in with Google** (cuenta del proyecto).
2. **New project** → nombre `tu-liga` → región **South America (São Paulo)** → inventá una contraseña de base de datos.
3. Guardá esa contraseña en tu gestor de contraseñas.
4. Esperá ~2 min hasta que diga **Project is ready**.

✅ _Listo cuando:_ ves el panel del proyecto con el menú de la izquierda.

## Paso 2 · Crear las tablas y la seguridad  _(lo hacés vos · 5 min)_

1. Menú izquierdo → **SQL Editor** → **New query**.
2. Abrí `base-de-datos/supabase-todo-en-uno.sql`, copiá **todo**, pegá y **Run**. Debe decir **Success**.
3. Segunda consulta nueva: pegá `004-datos-de-prueba.sql` → **Run**. Carga 2 ligas inventadas para poder mostrar la web ya mismo.

✅ _Listo cuando:_ en **Table Editor** ves las tablas `ligas`, `equipos`, `partidos`, etc.

## Paso 3 · Cerrar el registro público  _(lo hacés vos · 2 min)_

1. **Authentication → Sign In / Providers → Email**: desactivá **"Allow new users to sign up"** (y "Confirm email" si aparece).
2. Así nadie se crea una cuenta solo: las 6 cuentas las creás vos.

## Paso 4 · Crear las 6 cuentas  _(lo hacés vos · 10 min)_

1. **Authentication → Users → Add user → Create new user**. Tildá **Auto Confirm User**.
2. Creá estos 6 (el correo es solo un nombre técnico, no recibe mensajes):

| Cuenta | Correo técnico |
|---|---|
| Coordinador | `coordinador.mar-y-sierra@example.com` |
| Planillero 1 a 5 | `planillero1.mar-y-sierra@example.com` … `planillero5.mar-y-sierra@example.com` |

3. A cada una, una contraseña distinta (mínimo 6 caracteres). **Guardalas en tu gestor de contraseñas.**
4. **SQL Editor → New query** → pegá `006-cuentas-de-liga.sql` → **Run**. Debe avisar: _Perfiles listos: 6 de 6_.
5. (Opcional) Tu cuenta de **dueño**: creá `dueno@example.com` y seguí el bloque comentado al final de `006`.

✅ _Listo cuando:_ en **Table Editor → perfiles** ves 6 filas con rol `coordinador` y `planillero`.

> Cuando pongas la liga real, cambiá `mar-y-sierra` por su slug en los correos y en el archivo `006`.

## Paso 5 · Pasarme la URL y la clave pública  _(lo hacés vos · 2 min)_

1. **Project Settings → API** (o "API Keys").
2. Copiame **Project URL** y la clave **anon / publishable**. _(NO la `service_role`.)_
3. Con eso conecto la web (`docs/config.js`), la dejo hablando con Supabase y la pruebo contra tu proyecto real.

## Paso 5b · Ajustes de la planilla y de la liga  _(lo hacés vos · 1 min)_

**SQL Editor → Create a new snippet** → pegá `007-ajustes-planilla-y-liga.sql` → **Run**. Una sola vez. Permite que la planilla guarde el plantel y que el coordinador edite su liga.

## Paso 6 · Función "cambiar-clave"  _(lo hacés vos, yo te acompaño · 5 min)_

Para que el coordinador cambie la clave de una cuenta desde la web:

1. **Edge Functions → Deploy a new function** → nombre `cambiar-clave`.
2. Pegá el contenido de `supabase-funciones/cambiar-clave/index.ts` → **Deploy**.

## Paso 7 · Logos  _(ya queda hecho por el SQL)_

El archivo `005` crea el espacio público `logos` en **Storage**. El coordinador sube los logos desde la web (cada liga tiene su carpeta).

---

## Qué hago yo y qué hacés vos

| Yo | Vos |
|---|---|
| Escribir y probar el SQL (67 pruebas de seguridad pasan) | Crear el proyecto y pegar los SQL |
| Conectar la web a tu proyecto y probarla | Crear las 6 cuentas y guardar sus claves |
| Mantener estos archivos al día | Pasarme la URL y la clave pública |

## Límites del plan gratis

- Se **pausa tras 1 semana sin uso** (se reactiva a mano). Para una liga activa, el plan Pro (~USD 25/mes) lo evita.
- 500 MB de base de datos y 1 GB de archivos: de sobra para ligas amateur.

## Si algo falla

Copiame el mensaje de error tal cual (sin claves) y lo resolvemos. Lo más común: correr los archivos fuera de orden (siempre 1.º todo-en-uno, 2.º `004`, 3.º `006`).
