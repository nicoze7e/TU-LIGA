# Publicar la web (GitHub Pages)

La web vive en la carpeta `docs/` de este repositorio. GitHub Pages la sirve gratis con https.

## Activar Pages

1. En el repositorio: **Settings → Pages**.
2. **Source:** _Deploy from a branch_ · **Branch:** `main` · **Folder:** `/docs` → **Save**.
3. Esperá ~1 minuto: arriba aparece el link `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

## Actualizar la web

Reemplazá los archivos de `docs/` (arrastrándolos en **Add file → Upload files**, o con `git push`). Pages se actualiza solo en ~1 minuto.

## Si algo falla

- **404:** revisá que Pages apunte a `main` y `/docs`, y que `docs/index.html` exista.
- **Página en blanco:** abrí el link con `?demo=1`. Si así se ve, el problema es la conexión a Supabase (revisá `docs/config.js`).
- **No se ven cambios:** recargá con Cmd+Shift+R. La web pide primero a la red; la copia guardada solo se usa sin conexión.
