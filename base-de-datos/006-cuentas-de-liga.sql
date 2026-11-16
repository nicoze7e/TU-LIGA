-- ============================================================================
-- TU LIGA · 006 · CUENTAS DE LA LIGA (1 coordinador + 5 planilleros)
-- Para qué: dejar listos los perfiles de las cuentas de una liga. Las cuentas son de la LIGA, no de las personas.
-- Antes de correr esto: en Supabase → Authentication → Users → "Add user" → "Create new user" (tildá "Auto Confirm User")
-- y creá estos 6 usuarios (cambiá mar-y-sierra por el slug de tu liga). El correo es solo un nombre técnico, no recibe mensajes:
--     coordinador.mar-y-sierra@example.com
--     planillero1.mar-y-sierra@example.com   ...   planillero5.mar-y-sierra@example.com
-- Poné una contraseña distinta a cada una y guardalas en tu gestor de contraseñas (nunca en archivos del proyecto).
-- Después pegá este archivo en el SQL Editor y tocá Run. Se puede correr de nuevo sin problema.
-- ============================================================================
do $$
declare
  v_slug text := 'mar-y-sierra';          -- ← el slug de tu liga
  v_liga uuid; v_n int;
begin
  select id into v_liga from ligas where slug = v_slug;
  if v_liga is null then raise exception 'No existe la liga "%". Revisá el slug.', v_slug; end if;

  insert into perfiles (usuario_id, liga_id, rol, nombre)
  select u.id, v_liga,
         case when split_part(u.email, '.', 1) = 'coordinador' then 'coordinador'::rol_usuario else 'planillero'::rol_usuario end,
         case when split_part(u.email, '.', 1) = 'coordinador' then 'Coordinador'
              else 'Planillero ' || regexp_replace(split_part(u.email, '.', 1), '\D', '', 'g') end
  from auth.users u
  where u.email like '%.' || v_slug || '@example.com'
    and split_part(u.email, '.', 1) in ('coordinador', 'planillero1', 'planillero2', 'planillero3', 'planillero4', 'planillero5')
  on conflict (usuario_id) do update set liga_id = excluded.liga_id, rol = excluded.rol, nombre = excluded.nombre, activo = true;

  get diagnostics v_n = row_count;
  raise notice 'Perfiles listos: % de 6.', v_n;
end $$;

-- (Opcional) Tu cuenta de dueño: la que ve todas las ligas. Creá antes el usuario dueno@example.com y descomentá:
-- insert into perfiles (usuario_id, liga_id, rol, nombre)
-- select id, null, 'dueno', 'Dueño' from auth.users where email = 'dueno@example.com'
-- on conflict (usuario_id) do update set rol = 'dueno', liga_id = null, activo = true;
