-- ============================================================================
-- Super Oficial de Mesa · 002 · SEGURIDAD (quién ve y quién escribe qué)
-- Para qué: que cada perfil haga solo lo suyo, aunque alguien vea la clave pública de la web.
--   Jugadores (sin login): solo leen lo público.   Planilleros: solo anotan SU partido.
--   Coordinadores: cargan y corrigen SU liga.      Dueño: todo.
-- Ejecutar después de 001.
-- ============================================================================

-- ---------------------------------------------------------------- ayudas
create function mi_rol() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from perfiles where usuario_id = auth.uid() and activo
$$;

create function es_dueno() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol() = 'dueno', false)
$$;

-- ¿Soy coordinador de esa liga (o el dueño)?
create function es_coord_de(p_liga uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfiles
    where usuario_id = auth.uid() and activo
      and (rol = 'dueno' or (rol = 'coordinador' and liga_id = p_liga))
  )
$$;

-- ¿Soy el planillero asignado a ese partido?
create function es_planillero_de(p_partido uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from partido_planillero pp
    join perfiles pf on pf.usuario_id = pp.usuario_id
    where pp.partido_id = p_partido and pp.usuario_id = auth.uid()
      and pf.activo and pf.rol = 'planillero'
  )
$$;

create function liga_de_partido(p_partido uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select liga_id from partidos where id = p_partido
$$;

-- ---------------------------------------------------------------- privilegios
revoke all on all tables in schema public from anon, authenticated;

grant select on ligas, categorias, equipos, jugadores, inscripciones, partidos,
               partido_jugadores, partido_planillero, eventos, eventos_vigentes
      to anon, authenticated;
grant select on perfiles to authenticated;
grant insert, update, delete on ligas, perfiles, categorias, equipos, jugadores,
               inscripciones, partidos, partido_jugadores, partido_planillero to authenticated;
grant select, insert, update, delete on jugadores_privado to authenticated;
-- Los eventos NO se editan ni se borran: solo se agregan (append-only).
grant insert on eventos to authenticated;

-- ---------------------------------------------------------------- reglas por fila (RLS)
alter table ligas              enable row level security;
alter table categorias         enable row level security;
alter table equipos            enable row level security;
alter table jugadores          enable row level security;
alter table jugadores_privado  enable row level security;
alter table inscripciones      enable row level security;
alter table perfiles           enable row level security;
alter table partidos           enable row level security;
alter table partido_jugadores  enable row level security;
alter table partido_planillero enable row level security;
alter table eventos            enable row level security;
alter table sesiones_activas   enable row level security;   -- sin políticas: solo se toca por las funciones de abajo

-- Lectura pública (lo que ve cualquiera sin login)
create policy leer_ligas      on ligas             for select using (true);
create policy leer_categorias on categorias        for select using (true);
create policy leer_equipos    on equipos           for select using (true);
create policy leer_jugadores  on jugadores         for select using (true);
create policy leer_inscrip    on inscripciones     for select using (true);
create policy leer_partidos   on partidos          for select using (true);
create policy leer_planilla   on partido_jugadores for select using (true);
create policy leer_asignados  on partido_planillero for select using (true);
create policy leer_eventos    on eventos           for select using (true);

-- Ligas: solo el dueño
create policy dueno_ligas on ligas for all to authenticated
  using (es_dueno()) with check (es_dueno());

-- Perfiles: cada uno ve el suyo, el coordinador ve los de su liga, el dueño maneja todo
create policy ver_perfiles on perfiles for select to authenticated
  using (usuario_id = auth.uid() or es_coord_de(liga_id));
create policy dueno_perfiles on perfiles for all to authenticated
  using (es_dueno()) with check (es_dueno());

-- Coordinadores (de esa liga) y dueño: cargan y corrigen la liga
create policy coord_categorias on categorias for all to authenticated
  using (es_coord_de(liga_id)) with check (es_coord_de(liga_id));

create policy coord_equipos on equipos for all to authenticated
  using (es_coord_de((select c.liga_id from categorias c where c.id = equipos.categoria_id)))
  with check (es_coord_de((select c.liga_id from categorias c where c.id = equipos.categoria_id)));

create policy coord_jugadores on jugadores for all to authenticated
  using (es_coord_de(liga_id)) with check (es_coord_de(liga_id));

create policy coord_privado on jugadores_privado for all to authenticated
  using (es_coord_de((select j.liga_id from jugadores j where j.id = jugadores_privado.jugador_id)))
  with check (es_coord_de((select j.liga_id from jugadores j where j.id = jugadores_privado.jugador_id)));

create policy coord_inscrip on inscripciones for all to authenticated
  using (es_coord_de((select j.liga_id from jugadores j where j.id = inscripciones.jugador_id)))
  with check (es_coord_de((select j.liga_id from jugadores j where j.id = inscripciones.jugador_id)));

create policy coord_partidos on partidos for all to authenticated
  using (es_coord_de(liga_id)) with check (es_coord_de(liga_id));

create policy coord_planilla on partido_jugadores for all to authenticated
  using (es_coord_de(liga_de_partido(partido_id))) with check (es_coord_de(liga_de_partido(partido_id)));

create policy coord_asignar on partido_planillero for all to authenticated
  using (es_coord_de(liga_de_partido(partido_id))) with check (es_coord_de(liga_de_partido(partido_id)));

-- Eventos: solo se agregan.
-- El planillero asignado anota mientras el partido no esté cerrado.
create policy planillero_anota on eventos for insert to authenticated
  with check (
    creado_por = auth.uid()
    and es_planillero_de(partido_id)
    and (select p.estado from partidos p where p.id = eventos.partido_id) in ('programado', 'en_vivo')
  );
-- El coordinador (de esa liga) puede agregar eventos en cualquier estado: así corrige un partido cerrado.
create policy coord_corrige on eventos for insert to authenticated
  with check (creado_por = auth.uid() and es_coord_de(liga_de_partido(partido_id)));

-- ---------------------------------------------------------------- acciones del partido
-- Marcador calculado desde los eventos vigentes (la foto que se guarda al cerrar).
create function _recalcular_marcador(p_partido uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update partidos set
    marcador_local = coalesce((select sum(case tipo when 'P1' then 1 when 'P2' then 2 when 'P3' then 3 end)
                               from eventos_vigentes where partido_id = p_partido and equipo = 'local'), 0),
    marcador_visitante = coalesce((select sum(case tipo when 'P1' then 1 when 'P2' then 2 when 'P3' then 3 end)
                               from eventos_vigentes where partido_id = p_partido and equipo = 'visitante'), 0)
  where id = p_partido;
end $$;

-- El planillero (o un coordinador) abre el partido: pasa a "en vivo".
create function abrir_partido(p_partido uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (es_planillero_de(p_partido) or es_coord_de(liga_de_partido(p_partido))) then
    raise exception 'No tenés permiso para abrir este partido' using errcode = 'insufficient_privilege';
  end if;
  update partidos set estado = 'en_vivo', abierto_at = coalesce(abierto_at, now())
   where id = p_partido and estado in ('programado', 'suspendido');
  if not found then raise exception 'El partido no se puede abrir (ya está en vivo o cerrado)'; end if;
end $$;

-- El planillero cierra el partido: guarda el marcador final y todo se refleja solo en la web.
create function cerrar_partido(p_partido uuid) returns partidos
language plpgsql security definer set search_path = public as $$
declare r partidos;
begin
  if not (es_planillero_de(p_partido) or es_coord_de(liga_de_partido(p_partido))) then
    raise exception 'No tenés permiso para cerrar este partido' using errcode = 'insufficient_privilege';
  end if;
  perform _recalcular_marcador(p_partido);
  update partidos set estado = 'cerrado', cerrado_at = now(), cerrado_por = auth.uid()
   where id = p_partido and estado = 'en_vivo'
   returning * into r;
  if not found then raise exception 'Solo se puede cerrar un partido que está en vivo'; end if;
  return r;
end $$;

-- El coordinador corrige un partido cerrado (anula/agrega eventos) y recalcula el marcador.
create function recalcular_partido(p_partido uuid) returns partidos
language plpgsql security definer set search_path = public as $$
declare r partidos;
begin
  if not es_coord_de(liga_de_partido(p_partido)) then
    raise exception 'Solo un coordinador de la liga puede corregir un partido' using errcode = 'insufficient_privilege';
  end if;
  perform _recalcular_marcador(p_partido);
  select * into r from partidos where id = p_partido;
  return r;
end $$;

revoke execute on function _recalcular_marcador(uuid) from public, anon, authenticated;
revoke execute on function abrir_partido(uuid), cerrar_partido(uuid), recalcular_partido(uuid) from public, anon;
grant execute on function abrir_partido(uuid), cerrar_partido(uuid), recalcular_partido(uuid) to authenticated;

-- ---------------------------------------------------------------- en vivo (Supabase Realtime)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table eventos, partidos;
  end if;
end $$;

-- ---------------------------------------------------------------- cuentas de la liga y partidos (v2)
-- ¿Soy parte de esa liga (coordinador o planillero) o el dueño?
create function es_miembro_de(p_liga uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfiles
    where usuario_id = auth.uid() and activo
      and (rol = 'dueno' or (rol in ('coordinador', 'planillero') and liga_id = p_liga))
  )
$$;

-- Un planillero reclama un partido (queda a nombre de su cuenta). Un partido = un planillero.
create function reclamar_partido(p_partido uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_liga uuid := liga_de_partido(p_partido); v_otro uuid;
begin
  if not exists (select 1 from perfiles where usuario_id = auth.uid() and activo and rol = 'planillero' and liga_id = v_liga) then
    raise exception 'Solo una cuenta de planillero de esta liga puede reclamar el partido' using errcode = 'insufficient_privilege';
  end if;
  if (select estado from partidos where id = p_partido) not in ('programado', 'en_vivo') then
    raise exception 'Ese partido ya no se puede capturar';
  end if;
  select usuario_id into v_otro from partido_planillero where partido_id = p_partido;
  if v_otro is not null and v_otro <> auth.uid() then
    raise exception 'Ese partido ya lo lleva otra cuenta de planillero' using errcode = 'check_violation';
  end if;
  insert into partido_planillero (partido_id, usuario_id) values (p_partido, auth.uid()) on conflict (partido_id) do nothing;
end $$;

-- El coordinador libera un partido (por ejemplo, si un celular se perdió): otra cuenta puede retomarlo.
create function liberar_partido(p_partido uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_coord_de(liga_de_partido(p_partido)) then
    raise exception 'Solo el coordinador de la liga puede liberar un partido' using errcode = 'insufficient_privilege';
  end if;
  delete from partido_planillero where partido_id = p_partido;
end $$;

-- Sesión única por cuenta. Devuelve 'ok' o 'en_uso' (otra sesión activa en los últimos 60 s; con p_forzar la reemplaza).
create function tomar_sesion(p_sid text, p_forzar boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare s sesiones_activas;
begin
  if auth.uid() is null then raise exception 'Hace falta iniciar sesión' using errcode = 'insufficient_privilege'; end if;
  select * into s from sesiones_activas where usuario_id = auth.uid();
  if found and s.sid <> p_sid and s.latido > now() - interval '60 seconds' and not p_forzar then return 'en_uso'; end if;
  insert into sesiones_activas (usuario_id, sid, latido) values (auth.uid(), p_sid, now())
    on conflict (usuario_id) do update set sid = excluded.sid, latido = now();
  return 'ok';
end $$;

-- Latido: true si sigo siendo la sesión de la cuenta; false si otra la tomó o el coordinador la liberó.
create function latido_sesion(p_sid text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update sesiones_activas set latido = now() where usuario_id = auth.uid() and sid = p_sid;
  return found;
end $$;

create function cerrar_sesion(p_sid text) returns void
language sql security definer set search_path = public as $$
  delete from sesiones_activas where usuario_id = auth.uid() and sid = p_sid
$$;

-- El coordinador libera una cuenta de su liga: la sesión que la usaba se cierra en su próximo latido.
create function liberar_cuenta(p_usuario uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_liga uuid;
begin
  select liga_id into v_liga from perfiles where usuario_id = p_usuario;
  if v_liga is null or not es_coord_de(v_liga) then
    raise exception 'Solo el coordinador de la liga puede liberar sus cuentas' using errcode = 'insufficient_privilege';
  end if;
  delete from sesiones_activas where usuario_id = p_usuario;
end $$;

-- Estado de las cuentas de la liga (para la pantalla "Cuentas de la liga" del coordinador).
create function cuentas_de_liga(p_liga uuid)
returns table (usuario_id uuid, nombre text, rol rol_usuario, en_uso boolean, partido_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not es_coord_de(p_liga) then
    raise exception 'Solo el coordinador de la liga puede ver sus cuentas' using errcode = 'insufficient_privilege';
  end if;
  return query
    select pf.usuario_id, pf.nombre, pf.rol,
           coalesce(s.latido > now() - interval '60 seconds', false),
           (select pp.partido_id from partido_planillero pp join partidos pa on pa.id = pp.partido_id
             where pp.usuario_id = pf.usuario_id and pa.estado in ('programado', 'en_vivo') limit 1)
    from perfiles pf left join sesiones_activas s on s.usuario_id = pf.usuario_id
    where pf.liga_id = p_liga and pf.activo and pf.rol in ('coordinador', 'planillero')
    order by pf.rol desc, pf.nombre;
end $$;

revoke execute on function es_miembro_de(uuid), reclamar_partido(uuid), liberar_partido(uuid), tomar_sesion(text, boolean),
  latido_sesion(text), cerrar_sesion(text), liberar_cuenta(uuid), cuentas_de_liga(uuid) from public, anon;
grant execute on function es_miembro_de(uuid), reclamar_partido(uuid), liberar_partido(uuid), tomar_sesion(text, boolean),
  latido_sesion(text), cerrar_sesion(text), liberar_cuenta(uuid), cuentas_de_liga(uuid) to authenticated;

-- ---------------------------------------------------------------- ajustes de la planilla y de la liga (007)
create policy coord_liga on ligas for update to authenticated
  using (es_coord_de(id)) with check (es_coord_de(id));

-- El planillero de ese partido (o un coordinador de la liga) deja armada la planilla.
-- p_jugadores: [{"jugador_id":"…","equipo_id":"…","camiseta":9,"titular":true}, …]
create function cargar_planilla(p_partido uuid, p_jugadores jsonb, p_arbitros text[], p_cronometrista text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (es_planillero_de(p_partido) or es_coord_de(liga_de_partido(p_partido))) then
    raise exception 'No tenés permiso sobre la planilla de este partido' using errcode = 'insufficient_privilege';
  end if;
  if (select estado from partidos where id = p_partido) not in ('programado', 'en_vivo', 'suspendido') then
    raise exception 'Ese partido ya está cerrado';
  end if;
  insert into partido_jugadores (partido_id, jugador_id, equipo_id, camiseta, titular)
  select p_partido, (x->>'jugador_id')::uuid, (x->>'equipo_id')::uuid, (x->>'camiseta')::smallint, coalesce((x->>'titular')::boolean, false)
  from jsonb_array_elements(p_jugadores) x
  on conflict (partido_id, jugador_id) do update set equipo_id = excluded.equipo_id, camiseta = excluded.camiseta, titular = excluded.titular;
  update partidos set arbitros = coalesce(p_arbitros, '{}'), cronometrista = p_cronometrista where id = p_partido;
end $$;

revoke execute on function cargar_planilla(uuid, jsonb, text[], text) from public, anon;
grant execute on function cargar_planilla(uuid, jsonb, text[], text) to authenticated;
