-- ============================================================================
-- Super Oficial de Mesa · PRUEBA DE SEGURIDAD (solo para probar en una base local, NO en producción)
-- Qué hace: crea usuarios de mentira, prueba lo que cada perfil PUEDE y NO PUEDE hacer y muestra ✅/❌.
-- Requiere haber corrido 001 a 004 y el archivo auxiliar que imita a Supabase (roles y auth.uid()).
-- ============================================================================
create temp table resultados (n serial, prueba text, ok boolean, detalle text);
grant all on resultados to public; grant usage on sequence resultados_n_seq to public;

do $$
declare
  u_dueno uuid := gen_random_uuid(); u_coord uuid := gen_random_uuid(); u_coord2 uuid := gen_random_uuid();
  u_planA uuid := gen_random_uuid(); u_planB uuid := gen_random_uuid();
  v_liga uuid; v_liga2 uuid; v_vivo uuid; v_cerrado uuid; v_ev uuid; v_jug uuid; v_jug_otro uuid; v_jug_otro_partido uuid;
  v_n int; v_marc_antes int; v_marc_desp int; v_pts uuid;
begin
  insert into auth.users (id, email) values (u_dueno,'dueno@t'),(u_coord,'coord@t'),(u_coord2,'coord2@t'),(u_planA,'plana@t'),(u_planB,'planb@t');
  select id into v_liga from ligas where slug = 'mar-y-sierra';
  insert into ligas (slug, nombre) values ('otra-liga','Otra liga') returning id into v_liga2;
  insert into perfiles (usuario_id, liga_id, rol, nombre) values
    (u_dueno, null, 'dueno', 'Dueño'), (u_coord, v_liga, 'coordinador', 'Coord 1'), (u_coord2, v_liga2, 'coordinador', 'Coord otra liga'),
    (u_planA, v_liga, 'planillero', 'Plan A'), (u_planB, v_liga, 'planillero', 'Plan B');
  select id into v_vivo from partidos where estado = 'en_vivo';
  select id into v_cerrado from partidos where estado = 'cerrado' order by fecha_hora limit 1;
  insert into partido_planillero values (v_vivo, u_planA);
  select jugador_id into v_jug from partido_jugadores where partido_id = v_vivo and equipo_id = (select local_id from partidos where id = v_vivo) limit 1;
  select jugador_id into v_jug_otro_partido from partido_jugadores pj where partido_id = v_cerrado
     and jugador_id not in (select jugador_id from partido_jugadores where partido_id = v_vivo) limit 1;
  perform set_config('test.vivo', v_vivo::text, false); perform set_config('test.cerrado', v_cerrado::text, false);
  perform set_config('test.jug', v_jug::text, false);
  perform set_config('test.jug_ajeno', coalesce(v_jug_otro_partido::text, ''), false);
  perform set_config('test.u_planA', u_planA::text, false); perform set_config('test.u_planB', u_planB::text, false);
  perform set_config('test.u_coord', u_coord::text, false); perform set_config('test.u_coord2', u_coord2::text, false);
  perform set_config('test.u_dueno', u_dueno::text, false);
end $$;

-- ayuda: ejecuta una sentencia como un rol/usuario y anota si el resultado fue el esperado
create function t(p_nombre text, p_rol text, p_uid text, p_sql text, p_espera text) returns void language plpgsql as $$
declare v_msg text := 'sin error'; v_ok boolean; v_filas bigint;
begin
  execute format('set local role %I', p_rol);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid, ''), true);
  begin
    execute p_sql;
    get diagnostics v_filas = row_count;
    if p_espera = 'ok' then v_ok := true;
    elsif p_espera = 'cero' then v_ok := (v_filas = 0); v_msg := v_filas || ' filas';
    else v_ok := false; end if;
  exception when others then
    v_msg := sqlerrm;
    v_ok := (p_espera = 'error');
  end;
  execute 'reset role';
  insert into resultados (prueba, ok, detalle) values (p_nombre, v_ok, left(v_msg, 90));
end $$;

\o /dev/null
-- ---- sin login (jugadores) ----
select t('Sin login: ve las vistas públicas', 'anon', null, 'select 1 from vista_jugadores limit 1', 'ok');
select t('Sin login: NO ve documentos ni fechas de nacimiento', 'anon', null, 'select 1 from jugadores_privado limit 1', 'error');
select t('Sin login: NO puede anotar eventos', 'anon', null,
  format('insert into eventos (partido_id, tipo, jugador_id, cuarto, reloj_seg) values (%L, ''P2'', %L, 2, 100)', current_setting('test.vivo'), current_setting('test.jug')), 'error');
select t('Sin login: NO puede cerrar un partido', 'anon', null, format('select cerrar_partido(%L)', current_setting('test.vivo')), 'error');
select t('Sin login: NO puede crear equipos', 'anon', null, 'insert into equipos (categoria_id, nombre) select id, ''x'' from categorias limit 1', 'error');

-- ---- planillero asignado ----
select t('Planillero asignado: anota un triple en su partido en vivo', 'authenticated', current_setting('test.u_planA'),
  format('insert into eventos (partido_id, creado_por, tipo, jugador_id, cuarto, reloj_seg) values (%L, %L, ''P3'', %L, 2, 200)', current_setting('test.vivo'), current_setting('test.u_planA'), current_setting('test.jug')), 'ok');
select t('Planillero asignado: NO puede anotar como si fuera otra persona', 'authenticated', current_setting('test.u_planA'),
  format('insert into eventos (partido_id, creado_por, tipo, jugador_id, cuarto, reloj_seg) values (%L, %L, ''P2'', %L, 2, 190)', current_setting('test.vivo'), current_setting('test.u_planB'), current_setting('test.jug')), 'error');
select t('Planillero de otro partido: NO puede anotar en este', 'authenticated', current_setting('test.u_planB'),
  format('insert into eventos (partido_id, creado_por, tipo, jugador_id, cuarto, reloj_seg) values (%L, %L, ''P2'', %L, 2, 190)', current_setting('test.vivo'), current_setting('test.u_planB'), current_setting('test.jug')), 'error');
select t('Planillero: NO puede anotar un jugador que no está habilitado en el partido', 'authenticated', current_setting('test.u_planA'),
  format('insert into eventos (partido_id, creado_por, tipo, jugador_id, cuarto, reloj_seg) values (%L, %L, ''P2'', %L, 2, 180)', current_setting('test.vivo'), current_setting('test.u_planA'), current_setting('test.jug_ajeno')), 'error');
select t('Planillero: NO puede editar eventos', 'authenticated', current_setting('test.u_planA'), 'update eventos set tipo = ''P1''', 'error');
select t('Planillero: NO puede borrar eventos', 'authenticated', current_setting('test.u_planA'), 'delete from eventos', 'error');
select t('Planillero: NO ve documentos de jugadores', 'authenticated', current_setting('test.u_planA'), 'select 1 from jugadores_privado', 'cero');
select t('Planillero: NO puede cargar equipos', 'authenticated', current_setting('test.u_planA'), 'insert into equipos (categoria_id, nombre) select id, ''x'' from categorias limit 1', 'error');

-- ---- idempotencia: un reintento no duplica ----
do $$ declare v uuid := gen_random_uuid(); begin perform set_config('test.ev_fijo', v::text, false); end $$;
select t('Planillero: guarda un evento con id propio', 'authenticated', current_setting('test.u_planA'),
  format('insert into eventos (id, partido_id, creado_por, tipo, jugador_id, cuarto, reloj_seg) values (%L, %L, %L, ''P1'', %L, 2, 150)', current_setting('test.ev_fijo'), current_setting('test.vivo'), current_setting('test.u_planA'), current_setting('test.jug')), 'ok');
select t('Un reintento con el mismo id NO duplica el evento (la cola sin internet es segura)', 'authenticated', current_setting('test.u_planA'),
  format('insert into eventos (id, partido_id, creado_por, tipo, jugador_id, cuarto, reloj_seg) values (%L, %L, %L, ''P1'', %L, 2, 150)', current_setting('test.ev_fijo'), current_setting('test.vivo'), current_setting('test.u_planA'), current_setting('test.jug')), 'error');

-- ---- corrección durante el partido ----
select t('Planillero: anula su propio evento', 'authenticated', current_setting('test.u_planA'),
  format('insert into eventos (partido_id, creado_por, tipo, anula, motivo, cuarto) values (%L, %L, ''ANULA'', %L, ''toqué mal'', 2)', current_setting('test.vivo'), current_setting('test.u_planA'), current_setting('test.ev_fijo')), 'ok');
select t('NO se puede anular dos veces el mismo evento', 'authenticated', current_setting('test.u_planA'),
  format('insert into eventos (partido_id, creado_por, tipo, anula, cuarto) values (%L, %L, ''ANULA'', %L, 2)', current_setting('test.vivo'), current_setting('test.u_planA'), current_setting('test.ev_fijo')), 'error');

-- ---- cierre ----
select t('Planillero de otro partido: NO puede cerrar este partido', 'authenticated', current_setting('test.u_planB'), format('select cerrar_partido(%L)', current_setting('test.vivo')), 'error');
select t('Planillero asignado: cierra el partido', 'authenticated', current_setting('test.u_planA'), format('select cerrar_partido(%L)', current_setting('test.vivo')), 'ok');
select t('Planillero: después de cerrar, NO puede seguir anotando', 'authenticated', current_setting('test.u_planA'),
  format('insert into eventos (partido_id, creado_por, tipo, jugador_id, cuarto, reloj_seg) values (%L, %L, ''P2'', %L, 4, 10)', current_setting('test.vivo'), current_setting('test.u_planA'), current_setting('test.jug')), 'error');

-- ---- coordinador ----
select t('Coordinador: ve documentos de jugadores de su liga', 'authenticated', current_setting('test.u_coord'), 'select 1 from jugadores_privado limit 1', 'ok');
select t('Coordinador de OTRA liga: NO ve esos documentos', 'authenticated', current_setting('test.u_coord2'), 'select 1 from jugadores_privado', 'cero');
select t('Coordinador: corrige un partido cerrado (agrega una anulación)', 'authenticated', current_setting('test.u_coord'),
  format('insert into eventos (partido_id, creado_por, tipo, anula, motivo, cuarto) select %L, %L, ''ANULA'', id, ''jugador equivocado'', 1 from eventos_vigentes where partido_id = %L and tipo = ''P2'' limit 1', current_setting('test.cerrado'), current_setting('test.u_coord'), current_setting('test.cerrado')), 'ok');
select t('Coordinador: recalcula el marcador del partido corregido', 'authenticated', current_setting('test.u_coord'), format('select recalcular_partido(%L)', current_setting('test.cerrado')), 'ok');
select t('Coordinador de OTRA liga: NO puede corregir', 'authenticated', current_setting('test.u_coord2'),
  format('insert into eventos (partido_id, creado_por, tipo, anula, cuarto) select %L, %L, ''ANULA'', id, 1 from eventos_vigentes where partido_id = %L and tipo = ''P3'' limit 1', current_setting('test.cerrado'), current_setting('test.u_coord2'), current_setting('test.cerrado')), 'error');
select t('Coordinador de OTRA liga: NO puede recalcular', 'authenticated', current_setting('test.u_coord2'), format('select recalcular_partido(%L)', current_setting('test.cerrado')), 'error');
select t('Coordinador: carga un equipo en su liga', 'authenticated', current_setting('test.u_coord'), 'insert into equipos (categoria_id, nombre) select id, ''Equipo nuevo'' from categorias where nombre = ''+20'' limit 1', 'ok');
select t('Coordinador: NO puede crear ligas', 'authenticated', current_setting('test.u_coord'), 'insert into ligas (slug, nombre) values (''nueva'', ''Nueva'')', 'error');
select t('Coordinador: NO puede crear usuarios con rol', 'authenticated', current_setting('test.u_coord'), format('insert into perfiles (usuario_id, liga_id, rol) values (%L, null, ''dueno'')', current_setting('test.u_planB')), 'error');

-- ---- dueño ----
select t('Dueño: crea una liga', 'authenticated', current_setting('test.u_dueno'), 'insert into ligas (slug, nombre) values (''nueva'', ''Nueva'')', 'ok');

-- ================= v2: cuentas de la liga, partidos reclamados, sesión única, logos =================
select set_config('test.prog', (select id::text from partidos where estado = 'programado' order by fecha_hora limit 1), false);
select set_config('test.ligaid', (select id::text from ligas where slug = 'mar-y-sierra'), false);

-- ---- reclamar y liberar partidos (un partido = un planillero) ----
select t('Sin login: NO puede reclamar un partido', 'anon', null, format('select reclamar_partido(%L)', current_setting('test.prog')), 'error');
select t('Planillero A: reclama un partido libre', 'authenticated', current_setting('test.u_planA'), format('select reclamar_partido(%L)', current_setting('test.prog')), 'ok');
select t('Planillero A: reclamar su propio partido no falla (idempotente)', 'authenticated', current_setting('test.u_planA'), format('select reclamar_partido(%L)', current_setting('test.prog')), 'ok');
select t('Planillero B: NO puede reclamar un partido que ya lleva A', 'authenticated', current_setting('test.u_planB'), format('select reclamar_partido(%L)', current_setting('test.prog')), 'error');
select t('Planillero: NO puede liberar partidos', 'authenticated', current_setting('test.u_planB'), format('select liberar_partido(%L)', current_setting('test.prog')), 'error');
select t('Coordinador de OTRA liga: NO puede liberar', 'authenticated', current_setting('test.u_coord2'), format('select liberar_partido(%L)', current_setting('test.prog')), 'error');
select t('Coordinador: libera el partido de A', 'authenticated', current_setting('test.u_coord'), format('select liberar_partido(%L)', current_setting('test.prog')), 'ok');
select t('Planillero B: reclama el partido liberado', 'authenticated', current_setting('test.u_planB'), format('select reclamar_partido(%L)', current_setting('test.prog')), 'ok');
select t('Planillero A: NO puede reclamar el que ya tomó B', 'authenticated', current_setting('test.u_planA'), format('select reclamar_partido(%L)', current_setting('test.prog')), 'error');
select t('Planillero: NO puede reclamar un partido ya cerrado', 'authenticated', current_setting('test.u_planA'), format('select reclamar_partido(%L)', current_setting('test.cerrado')), 'error');

-- ---- sesión única por cuenta ----
select t('Sesión: A toma la sesión desde el celular 1', 'authenticated', current_setting('test.u_planA'), 'select 1 / (case when tomar_sesion(''s1'') = ''ok'' then 1 else 0 end)', 'ok');
select t('Sesión: desde el celular 2, la cuenta figura en uso', 'authenticated', current_setting('test.u_planA'), 'select 1 / (case when tomar_sesion(''s2'') = ''en_uso'' then 1 else 0 end)', 'ok');
select t('Sesión: con confirmación, el celular 2 toma la cuenta', 'authenticated', current_setting('test.u_planA'), 'select 1 / (case when tomar_sesion(''s2'', true) = ''ok'' then 1 else 0 end)', 'ok');
select t('Sesión: el celular 1 ya no es la sesión vigente', 'authenticated', current_setting('test.u_planA'), 'select 1 / (case when latido_sesion(''s1'') then 0 else 1 end)', 'ok');
select t('Sesión: el celular 2 sigue vigente', 'authenticated', current_setting('test.u_planA'), 'select 1 / (case when latido_sesion(''s2'') then 1 else 0 end)', 'ok');
select t('Planillero B: NO puede liberar la cuenta de A', 'authenticated', current_setting('test.u_planB'), format('select liberar_cuenta(%L)', current_setting('test.u_planA')), 'error');
select t('Coordinador de OTRA liga: NO puede liberar la cuenta de A', 'authenticated', current_setting('test.u_coord2'), format('select liberar_cuenta(%L)', current_setting('test.u_planA')), 'error');
select t('Coordinador: libera la cuenta de A', 'authenticated', current_setting('test.u_coord'), format('select liberar_cuenta(%L)', current_setting('test.u_planA')), 'ok');
select t('Sesión: tras liberarla, el celular 2 se cierra en su latido', 'authenticated', current_setting('test.u_planA'), 'select 1 / (case when latido_sesion(''s2'') then 0 else 1 end)', 'ok');
select t('Coordinador: ve el estado de las cuentas de su liga', 'authenticated', current_setting('test.u_coord'), format('select * from cuentas_de_liga(%L)', current_setting('test.ligaid')), 'ok');
select t('Planillero: NO ve el estado de las cuentas', 'authenticated', current_setting('test.u_planA'), format('select * from cuentas_de_liga(%L)', current_setting('test.ligaid')), 'error');
select t('Sin login: NO puede tomar una sesión', 'anon', null, 'select tomar_sesion(''x'')', 'error');
select t('Nadie lee la tabla de sesiones directamente', 'authenticated', current_setting('test.u_coord'), 'select 1 from sesiones_activas', 'error');

-- ---- logos de equipo: solo el coordinador de la liga ----
select t('Coordinador: sube el logo de un equipo de su liga', 'authenticated', current_setting('test.u_coord'), format('update equipos set logo_url = ''https://ejemplo/logo.png'' where categoria_id in (select id from categorias where liga_id = %L)', current_setting('test.ligaid')), 'ok');
select t('Planillero: NO puede cambiar el logo de un equipo', 'authenticated', current_setting('test.u_planA'), format('update equipos set logo_url = ''https://x/y.png'' where categoria_id in (select id from categorias where liga_id = %L)', current_setting('test.ligaid')), 'cero');
select t('Coordinador de OTRA liga: NO puede cambiar el logo', 'authenticated', current_setting('test.u_coord2'), format('update equipos set logo_url = ''https://x/y.png'' where categoria_id in (select id from categorias where liga_id = %L)', current_setting('test.ligaid')), 'cero');
select t('Sin login: ve el logo en la vista pública', 'anon', null, 'select 1 / (case when exists (select 1 from vista_equipos where logo_url is not null) then 1 else 0 end)', 'ok');
select t('Storage: el coordinador sube a la carpeta de su liga', 'authenticated', current_setting('test.u_coord'), format('insert into storage.objects (bucket_id, name) values (''logos'', %L)', current_setting('test.ligaid') || '/equipos/marlin.png'), 'ok');
select t('Storage: el coordinador de OTRA liga NO sube a esa carpeta', 'authenticated', current_setting('test.u_coord2'), format('insert into storage.objects (bucket_id, name) values (''logos'', %L)', current_setting('test.ligaid') || '/equipos/falso.png'), 'error');
select t('Storage: el planillero NO sube logos', 'authenticated', current_setting('test.u_planA'), format('insert into storage.objects (bucket_id, name) values (''logos'', %L)', current_setting('test.ligaid') || '/equipos/falso2.png'), 'error');
select t('Storage: sin login NO sube logos', 'anon', null, 'insert into storage.objects (bucket_id, name) values (''logos'', ''x/y.png'')', 'error');

-- ---- datos que ve cada uno de la plantilla ----
select t('Sin login: NO accede a posición ni habilitación (vista de planilla)', 'anon', null, 'select 1 from vista_plantel_planilla', 'error');
select t('Planillero: ve posición y habilitación para armar la planilla', 'authenticated', current_setting('test.u_planA'), 'select 1 / (case when exists (select 1 from vista_plantel_planilla) then 1 else 0 end)', 'ok');
select t('Planillero: esa vista NO trae el documento', 'authenticated', current_setting('test.u_planA'), 'select documento from vista_plantel_planilla', 'error');
select t('Coordinador de OTRA liga: no ve esa plantilla', 'authenticated', current_setting('test.u_coord2'), 'select 1 from vista_plantel_planilla', 'cero');
select t('Planillero: ve quién lleva cada partido', 'authenticated', current_setting('test.u_planA'), 'select 1 / (case when exists (select 1 from vista_planilla_claims) then 1 else 0 end)', 'ok');
select t('Sin login: NO accede a quién lleva cada partido', 'anon', null, 'select 1 from vista_planilla_claims', 'error');

-- ---- planilla y edición de la liga (007) ----
select t('Planillero del partido: deja armada la planilla', 'authenticated', current_setting('test.u_planB'),
  format('select cargar_planilla(%L, (select jsonb_agg(jsonb_build_object(''jugador_id'', jugador_id, ''equipo_id'', equipo_id, ''camiseta'', camiseta, ''titular'', titular)) from partido_jugadores where partido_id = %L), array[''Rossi''], ''Mesa 1'')', current_setting('test.prog'), current_setting('test.prog')), 'ok');
select t('Planillero de OTRO partido: NO toca esa planilla', 'authenticated', current_setting('test.u_planA'),
  format('select cargar_planilla(%L, ''[]''::jsonb, array[''x''], ''x'')', current_setting('test.prog')), 'error');
select t('Sin login: NO toca la planilla', 'anon', null, format('select cargar_planilla(%L, ''[]''::jsonb, array[''x''], ''x'')', current_setting('test.prog')), 'error');
select t('Coordinador: cambia el nombre de su liga', 'authenticated', current_setting('test.u_coord'), format('update ligas set nombre = ''Liga Mar y Sierra'' where id = %L', current_setting('test.ligaid')), 'ok');
select t('Coordinador de OTRA liga: NO cambia esa liga', 'authenticated', current_setting('test.u_coord2'), format('update ligas set nombre = ''x'' where id = %L', current_setting('test.ligaid')), 'cero');
select t('Planillero: NO cambia la liga', 'authenticated', current_setting('test.u_planA'), format('update ligas set nombre = ''x'' where id = %L', current_setting('test.ligaid')), 'cero');

-- ---- el flujo completo de la planilla, tal como lo hace la web (Planillero B lleva el partido liberado/reclamado arriba) ----
select t('Planilla: abre el partido (queda en vivo)', 'authenticated', current_setting('test.u_planB'), format('select abrir_partido(%L)', current_setting('test.prog')), 'ok');
select t('Planilla: carga los 10 quintetos de una vez', 'authenticated', current_setting('test.u_planB'),
  format('insert into eventos (partido_id, tipo, jugador_id, cuarto, reloj_seg) select %L, ''QUINTETO'', jugador_id, 1, 600 from partido_jugadores where partido_id = %L and titular', current_setting('test.prog'), current_setting('test.prog')), 'ok');
select t('Planilla: anota un doble con un id creado en el celular', 'authenticated', current_setting('test.u_planB'),
  format('insert into eventos (id, partido_id, tipo, jugador_id, cuarto, reloj_seg) select ''11111111-1111-4111-8111-111111111111'', %L, ''P2'', jugador_id, 1, 540 from partido_jugadores where partido_id = %L and titular limit 1', current_setting('test.prog'), current_setting('test.prog')), 'ok');
select t('Planilla: repetir el mismo id (reintento sin internet) NO duplica', 'authenticated', current_setting('test.u_planB'),
  format('insert into eventos (id, partido_id, tipo, jugador_id, cuarto, reloj_seg) select ''11111111-1111-4111-8111-111111111111'', %L, ''P2'', jugador_id, 1, 540 from partido_jugadores where partido_id = %L and titular limit 1', current_setting('test.prog'), current_setting('test.prog')), 'error');
select t('Planilla: anula la jugada y la anulación se guarda', 'authenticated', current_setting('test.u_planB'),
  format('insert into eventos (partido_id, tipo, anula, motivo, cuarto) values (%L, ''ANULA'', ''11111111-1111-4111-8111-111111111111'', ''corrección en la planilla'', 1)', current_setting('test.prog')), 'ok');
select t('Planilla: cierra el partido', 'authenticated', current_setting('test.u_planB'), format('select cerrar_partido(%L)', current_setting('test.prog')), 'ok');
select t('Planilla: ya cerrado, NO se puede seguir anotando', 'authenticated', current_setting('test.u_planB'),
  format('insert into eventos (partido_id, tipo, jugador_id, cuarto, reloj_seg) select %L, ''P1'', jugador_id, 1, 500 from partido_jugadores where partido_id = %L and titular limit 1', current_setting('test.prog'), current_setting('test.prog')), 'error');

-- ================= v3: Drive de ida y vuelta (008) =================
insert into drive_claves (liga_id, hash) select id, encode(extensions.digest('CLAVE-DE-PRUEBA-LARGA-123456789', 'sha256'), 'hex') from ligas where slug = 'mar-y-sierra';
select t('Drive: sin la clave NO se exportan datos privados', 'anon', null, 'select drive_exportar(''mar-y-sierra'', ''clave-incorrecta'')', 'error');
select t('Drive: la clave de OTRA liga no sirve', 'anon', null, 'select drive_exportar(''liga-del-valle'', ''CLAVE-DE-PRUEBA-LARGA-123456789'')', 'error');
select t('Drive: con la clave correcta, exporta los datos de regularidad', 'anon', null,
  'select 1 / (case when (drive_exportar(''mar-y-sierra'', ''CLAVE-DE-PRUEBA-LARGA-123456789'')->''privados'')::text like ''%documento%'' then 1 else 0 end)', 'ok');
select t('Drive: nadie lee la tabla de claves directamente (sin login)', 'anon', null, 'select hash from drive_claves', 'error');
select t('Drive: ni el coordinador lee la tabla de claves', 'authenticated', current_setting('test.u_coord'), 'select hash from drive_claves', 'error');
select t('Drive: validar sin clave NO es posible', 'anon', null, 'select drive_importar(''mar-y-sierra'', ''mala'', ''[]'', ''[]'', ''[]'', false)', 'error');
select t('Drive: validar (sin aplicar) marca la categoría inexistente y NO escribe', 'anon', null,
  $q$select 1 / (case when (drive_importar('mar-y-sierra', 'CLAVE-DE-PRUEBA-LARGA-123456789', '[{"fila":2,"categoria":"+99","equipo":"X","nombre":"Y"}]', '[]', '[]', false)->0->>'ok') = 'false' then 1 else 0 end)$q$, 'ok');
select t('Drive: validar un equipo nuevo NO lo crea', 'anon', null,
  $q$select drive_importar('mar-y-sierra', 'CLAVE-DE-PRUEBA-LARGA-123456789', '[{"fila":2,"categoria":"+20","equipo":"Faro Drive","camiseta":"7","nombre":"Pruebin","apellido":"Drive","documento":"99999999","nacimiento":"1995-05-05","habilitado":"si","posicion":"B"}]', '[]', '[]', false)$q$, 'ok');
select t('Drive: tras validar, el equipo todavía no existe', 'anon', null, $q$select 1 / (case when exists (select 1 from equipos where nombre = 'Faro Drive') then 0 else 1 end)$q$, 'ok');
select t('Drive: importar crea equipo, jugador y sus datos de regularidad', 'anon', null,
  $q$select drive_importar('mar-y-sierra', 'CLAVE-DE-PRUEBA-LARGA-123456789', '[{"fila":2,"categoria":"+20","equipo":"Faro Drive","camiseta":"7","nombre":"Pruebin","apellido":"Drive","altura":"181","documento":"99999999","nacimiento":"1995-05-05","habilitado":"si","posicion":"B"}]', '[]', '[]', true)$q$, 'ok');
select t('Drive: el equipo y el jugador quedaron en la plataforma', 'anon', null,
  $q$select 1 / (case when exists (select 1 from vista_jugadores where nombre_completo = 'Pruebin Drive' and equipo_nombre = 'Faro Drive' and camiseta_habitual = 7 and altura_cm = 181) then 1 else 0 end)$q$, 'ok');
select t('Drive: el documento NO aparece en las vistas públicas', 'anon', null, $q$select 1 / (case when exists (select 1 from jugadores_privado where documento = '99999999') then 1 else 0 end)$q$, 'error');
select t('Drive: importar el mismo jugador otra vez lo actualiza (no duplica)', 'anon', null,
  $q$select drive_importar('mar-y-sierra', 'CLAVE-DE-PRUEBA-LARGA-123456789', '[{"fila":2,"categoria":"+20","equipo":"Faro Drive","camiseta":"8","nombre":"Pruebin","apellido":"Drive","documento":"99999999","habilitado":"no"}]', '[]', '[]', true)$q$, 'ok');
select t('Drive: sigue habiendo un solo jugador y con la camiseta nueva', 'anon', null,
  $q$select 1 / (case when (select count(*) from vista_jugadores where nombre_completo = 'Pruebin Drive') = 1 and exists (select 1 from vista_jugadores where nombre_completo = 'Pruebin Drive' and camiseta_habitual = 8) then 1 else 0 end)$q$, 'ok');
select t('Drive: el fixture rechaza un equipo que no existe', 'anon', null,
  $q$select 1 / (case when (drive_importar('mar-y-sierra', 'CLAVE-DE-PRUEBA-LARGA-123456789', '[]', '[{"fila":2,"fecha":"2027-03-10","hora":"21:00","categoria":"+20","local":"Marlin","visitante":"Inexistente"}]', '[]', true)->0->>'ok') = 'false' then 1 else 0 end)$q$, 'ok');
select t('Drive: el fixture crea un partido nuevo con fecha y hora de Argentina', 'anon', null,
  $q$select drive_importar('mar-y-sierra', 'CLAVE-DE-PRUEBA-LARGA-123456789', '[]', '[{"fila":2,"fecha":"2027-03-10","hora":"21:30","categoria":"+20","fase":"playoff","grupo":"A","nro_fecha":"3","cancha":"Cancha 9","local":"Marlin","visitante":"Faro Drive"}]', '[]', true)$q$, 'ok');
select t('Drive: el partido quedó en el fixture público a las 21:30 (hora Argentina)', 'anon', null,
  $q$select 1 / (case when exists (select 1 from vista_partidos where local_nombre = 'Marlin' and visitante_nombre = 'Faro Drive' and nro_fecha = 3 and grupo = 'A' and cancha = 'Cancha 9' and (fecha_hora at time zone 'America/Argentina/Buenos_Aires')::time = '21:30') then 1 else 0 end)$q$, 'ok');
select t('Drive: cargar un resultado cierra un partido sin jugadas', 'anon', null,
  $q$select drive_importar('mar-y-sierra', 'CLAVE-DE-PRUEBA-LARGA-123456789', '[]', '[]', '[{"fila":2,"fecha":"2027-03-10","categoria":"+20","local":"Marlin","visitante":"Faro Drive","pts_local":"77","pts_visitante":"65"}]', true)$q$, 'ok');
select t('Drive: el resultado cargado entra a la tabla de posiciones', 'anon', null,
  $q$select 1 / (case when exists (select 1 from vista_partidos where local_nombre = 'Marlin' and visitante_nombre = 'Faro Drive' and estado = 'cerrado' and marcador_local = 77 and marcador_visitante = 65) and exists (select 1 from vista_tabla where equipo_nombre = 'Faro Drive' and pj = 1 and pp = 1) then 1 else 0 end)$q$, 'ok');
select t('Drive: un partido con jugadas capturadas NO se pisa desde Drive', 'anon', null,
  $q$select 1 / (case when (drive_importar('mar-y-sierra', 'CLAVE-DE-PRUEBA-LARGA-123456789', '[]', '[]', '[{"fila":2,"categoria":"+20","local":"Marlin","visitante":"Sierra","pts_local":"1","pts_visitante":"1"}]', true)->0->>'mensaje') like 'omitido%' then 1 else 0 end)$q$, 'ok');

\o
-- ---- resultado ----
select n, case when ok then '✅' else '❌' end as ok, prueba, detalle from resultados order by n;
select count(*) filter (where ok) as pasaron, count(*) filter (where not ok) as fallaron from resultados;
