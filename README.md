# TU LIGA

Plataforma web para ligas de básquet amateur: **calendario, tabla, estadísticas y partidos en vivo** para todos, y una **planilla de mesa (Super Oficial)** para capturar cada partido desde el celular. Lo capturado queda en una base segura y se refleja en una **hoja de Drive privada** de administración.

> **Demo:** `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/` · con `?demo=1` al final abre con datos de ejemplo.

## Cómo está armado

```
   Jugadores / público ──┐
   Planilleros (celular) ─┼──►  WEB  (docs/)  ◄──►  SUPABASE  (base-de-datos/)  ──►  HOJA DE DRIVE  (drive/)
   Coordinador ──────────┘      HTML + JS          datos, cuentas, tiempo real        copia privada y carga
                                instalable          reglas de seguridad                de ida y vuelta
```

| Carpeta | Qué contiene |
|---|---|
| `docs/` | **La web publicada** (GitHub Pages): inicio, calendario, tabla, jugadores, Super Oficial, perfiles de planillero y coordinador. |
| `base-de-datos/` | SQL de Supabase (tablas, seguridad por perfil, vistas) y **100 pruebas automáticas** de seguridad y de flujo. |
| `drive/` | Script de la hoja administrativa: copia de TU LIGA a Drive y carga desde Drive, con clave propia. |
| `supabase-funciones/` | Función segura para que el coordinador cambie claves de cuentas. |
| `documentacion/` | Arquitectura, modelo de datos, cómo publicar y guion de prueba de la demo. |

## Qué hace cada perfil

- **Sin usuario (jugador o público):** consulta calendario, tabla, estadísticas, jugadores y partidos en vivo.
- **Planillero (5 cuentas de la liga):** elige un partido del fixture y lo captura con Super Oficial. Un partido, un planillero; reloj fijo con pausa; retoma un partido interrumpido.
- **Coordinador (1 cuenta de la liga):** arma el fixture, carga equipos con logo y color, jugadores y su documentación, corrige partidos, libera cuentas.

## Seguridad y privacidad

- El público solo lee: nombre, camiseta por partido, altura y estadísticas.
- Documento y fecha de nacimiento solo los ve el coordinador de esa liga y la hoja privada de Drive (con clave propia).
- Las jugadas **no se borran**: una corrección es una anulación más una jugada nueva.
- Cada cuenta admite una sola sesión a la vez.
- La clave pública de Supabase (`docs/config.js`) es pública por diseño. **La clave secreta nunca está en este repositorio.**

## Puesta en marcha

1. **Base:** `base-de-datos/GUIA-SUPABASE-paso-a-paso.md`
2. **Drive:** `drive/GUIA-DRIVE.md`
3. **Publicar la web:** `documentacion/PUBLICAR.md`

## Estado

Demo funcional probada de punta a punta con datos de ejemplo. Pendiente de validar en uso real: prueba prolongada en celulares reales, que la pantalla no se apague durante un partido y guardado de jugadas sin conexión.

## Licencia

Todos los derechos reservados. Este repositorio se publica para demostración.
