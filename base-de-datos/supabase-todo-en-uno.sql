-- ============================================================================
-- Super Oficial de Mesa · 001 · ESQUEMA (tablas)
-- Para qué: crear las tablas de la liga. Se ejecuta UNA vez, en este orden: 001, 002, 003 y (opcional) 004.
-- Dónde: Supabase → SQL Editor → pegar el archivo entero → Run.
-- Nota: los eventos son "append-only": nunca se editan ni se borran, solo se agregan o se anulan.
-- ============================================================================

create type rol_usuario as enum ('dueno', 'coordinador', 'planillero');
create type estado_partido as enum ('programado', 'en_vivo', 'cerrado', 'suspendido');
create type lado as enum ('local', 'visitante');

-- ---------------------------------------------------------------- ligas
create table ligas (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  nombre      text not null,
  logo_url    text,                          -- logo de la liga (la web lo muestra al inicio; se sube a Storage, ver 005)
  -- ⏳ reglamento provisorio: los puntos de tabla y el desempate se confirman con la liga
  reglamento  jsonb not null default '{
    "puntos_ganado": 2, "puntos_perdido": 1,
    "cuartos": 4, "minutos_cuarto": 10, "minutos_suplementario": 5,
    "faltas_jugador": 5, "faltas_equipo_bonus": 5, "tiempos_muertos_mitad": 2
  }'::jsonb,
  creada_at   timestamptz not null default now()
);

create table categorias (
  id          uuid primary key default gen_random_uuid(),
  liga_id     uuid not null references ligas on delete cascade,
  nombre      text not null,                 -- +20, +30, +40
  temporada   text not null,                 -- 2026
  unique (liga_id, nombre, temporada)
);

create table equipos (
  id                  uuid primary key default gen_random_uuid(),
  categoria_id        uuid not null references categorias on delete cascade,
  nombre              text not null,
  color_principal     text not null default '#1f6feb',
  color_alternativo   text not null default '#ffffff',
  logo_url            text,                          -- logo del equipo (Storage 'logos'); lo sube solo el coordinador
  unique (categoria_id, nombre)
);

-- ---------------------------------------------------------------- jugadores
-- Solo lo que es PÚBLICO (nombre, apellido y altura). Lo reglamentario va en jugadores_privado.
create table jugadores (
  id         uuid primary key default gen_random_uuid(),
  liga_id    uuid not null references ligas on delete cascade,
  nombre     text not null,
  apellido   text not null,
  altura_cm  smallint check (altura_cm between 120 and 250),
  creado_at  timestamptz not null default now()
);

-- Documentación reglamentaria: SOLO la ven los coordinadores de la liga. Nunca se publica.
create table jugadores_privado (
  jugador_id        uuid primary key references jugadores on delete cascade,
  documento         text,
  fecha_nacimiento  date,
  posicion          text check (posicion in ('B','E','A','AP','P')),   -- base, escolta, alero, ala-pívot, pívot (la usa Super Oficial)
  habilitado        boolean not null default true,
  foto_ruta         text,            -- ruta de la foto en un bucket privado de Storage
  notas             text
);

create table inscripciones (
  id                uuid primary key default gen_random_uuid(),
  jugador_id        uuid not null references jugadores on delete cascade,
  equipo_id         uuid not null references equipos on delete cascade,
  camiseta_habitual smallint check (camiseta_habitual between 0 and 99),
  activa            boolean not null default true,
  unique (jugador_id, equipo_id)
);

-- ---------------------------------------------------------------- perfiles (quién es quién)
create table perfiles (
  usuario_id  uuid primary key references auth.users on delete cascade,
  liga_id     uuid references ligas on delete cascade,   -- null solo para el dueño
  rol         rol_usuario not null,
  nombre      text,
  activo      boolean not null default true,
  check ((rol = 'dueno') = (liga_id is null))
);

-- ---------------------------------------------------------------- partidos
create table partidos (
  id                  uuid primary key default gen_random_uuid(),
  liga_id             uuid not null references ligas on delete cascade,
  categoria_id        uuid not null references categorias on delete cascade,
  local_id            uuid not null references equipos,
  visitante_id        uuid not null references equipos,
  fecha_hora          timestamptz not null,
  cancha              text,
  fase                text not null default 'fase regular',
  grupo               text,                                -- A, B, C… (opcional)
  nro_fecha           smallint,                            -- número de fecha del fixture
  estado              estado_partido not null default 'programado',
  marcador_local      integer not null default 0,        -- foto al cerrar (en vivo se calcula desde eventos)
  marcador_visitante  integer not null default 0,
  arbitros            text[] not null default '{}',
  cronometrista       text,                               -- lleva el reloj oficial
  oficiales           text[] not null default '{}',
  abierto_at          timestamptz,
  cerrado_at          timestamptz,
  cerrado_por         uuid references auth.users,
  check (local_id <> visitante_id)
);
create index on partidos (categoria_id, fecha_hora);
create index on partidos (estado);

-- La liga del partido siempre sale de su categoría (así no puede quedar inconsistente).
create function partidos_liga() returns trigger language plpgsql as $$
begin
  select liga_id into new.liga_id from categorias where id = new.categoria_id;
  return new;
end $$;
create trigger partidos_liga_t before insert or update of categoria_id on partidos
  for each row execute function partidos_liga();

-- Jugadores habilitados en cada partido, con la camiseta DE ESE PARTIDO.
create table partido_jugadores (
  partido_id  uuid not null references partidos on delete cascade,
  jugador_id  uuid not null references jugadores,
  equipo_id   uuid not null references equipos,
  camiseta    smallint not null check (camiseta between 0 and 99),
  titular     boolean not null default false,
  primary key (partido_id, jugador_id),
  unique (partido_id, equipo_id, camiseta)
);

-- Un planillero lleva todo el partido. Dos partidos a la vez = dos planilleros distintos.
create table partido_planillero (
  partido_id  uuid primary key references partidos on delete cascade,
  usuario_id  uuid not null references auth.users
);

-- ---------------------------------------------------------------- eventos (el corazón)
create table eventos (
  id          uuid primary key default gen_random_uuid(),   -- lo crea el celular: así un reintento no duplica
  seq         bigint generated always as identity,          -- el orden lo da el servidor
  partido_id  uuid not null references partidos on delete cascade,
  creado_por  uuid references auth.users default auth.uid(),
  creado_at   timestamptz not null default now(),
  cliente_ts  timestamptz,                                  -- hora del celular cuando se tocó
  tipo        text not null check (tipo in (
                'P1','P2','P3',            -- tiro libre, doble y triple convertidos
                'E1','E2','E3',            -- tiros errados
                'REB','AST','ROB','PER',   -- rebote, asistencia, robo y pérdida
                'FALTA','TM',              -- falta y tiempo muerto
                'QUINTETO','CAMBIO',       -- quién juega
                'CUARTO_INICIO','CUARTO_FIN',
                'RELOJ',                   -- sincronización: "el reloj oficial marca esto ahora"
                'ANULA')),                 -- anula otro evento (corrección)
  equipo      lado,
  jugador_id  uuid references jugadores,
  jugador2_id uuid references jugadores,                    -- en CAMBIO, el que entra
  cuarto      smallint check (cuarto between 1 and 10),
  reloj_seg   integer check (reloj_seg >= 0),               -- segundos que faltan del cuarto según el reloj OFICIAL
  detalle     text,                                         -- tipo de falta: personal, tecnica, antideportiva, descalificante
  ref         uuid references eventos (id),                 -- REB → tiro errado, AST → punto, PER → ROB
  anula       uuid references eventos (id),
  motivo      text,
  meta        jsonb not null default '{}'
);
create index on eventos (partido_id, seq);
create index on eventos (anula) where anula is not null;

-- Eventos vigentes = todos menos los anulados (y menos las propias anulaciones).
create view eventos_vigentes as
select e.* from eventos e
where e.tipo <> 'ANULA'
  and not exists (select 1 from eventos a where a.anula = e.id);

-- Controles al guardar un evento: jugador habilitado, equipo deducido y anulaciones válidas.
create function eventos_validar() returns trigger language plpgsql as $$
declare
  v_equipo uuid; v_local uuid; v_ref record;
begin
  select local_id into v_local from partidos where id = new.partido_id;

  if new.jugador_id is not null then
    select equipo_id into v_equipo from partido_jugadores
      where partido_id = new.partido_id and jugador_id = new.jugador_id;
    if v_equipo is null then
      raise exception 'El jugador % no está habilitado en este partido', new.jugador_id using errcode = 'check_violation';
    end if;
    new.equipo := case when v_equipo = v_local then 'local' else 'visitante' end::lado;
  end if;

  if new.jugador2_id is not null then
    perform 1 from partido_jugadores pj
      where pj.partido_id = new.partido_id and pj.jugador_id = new.jugador2_id
        and pj.equipo_id = (select equipo_id from partido_jugadores where partido_id = new.partido_id and jugador_id = new.jugador_id);
    if not found then
      raise exception 'El jugador que entra tiene que estar habilitado y ser del mismo equipo' using errcode = 'check_violation';
    end if;
  end if;

  if new.tipo = 'ANULA' then
    select * into v_ref from eventos where id = new.anula;
    if not found or v_ref.partido_id <> new.partido_id or v_ref.tipo = 'ANULA' then
      raise exception 'Solo se puede anular un evento de este mismo partido' using errcode = 'check_violation';
    end if;
    if exists (select 1 from eventos where anula = new.anula) then
      raise exception 'Ese evento ya está anulado' using errcode = 'check_violation';
    end if;
  elsif new.anula is not null then
    raise exception 'Solo un evento ANULA puede anular a otro' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger eventos_validar_t before insert on eventos
  for each row execute function eventos_validar();

-- ---------------------------------------------------------------- sesiones (una sola por cuenta)
-- Las cuentas son de la LIGA (1 coordinador y 5 planilleros). Cada cuenta admite una sola sesión activa a la vez.
-- La web llama a tomar_sesion() al entrar y a latido_sesion() cada 15 s; si otra sesión la toma, la anterior se cierra.
create table sesiones_activas (
  usuario_id  uuid primary key references auth.users on delete cascade,
  sid         text not null,
  latido      timestamptz not null default now()
);
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
-- ============================================================================
-- Super Oficial de Mesa · 003 · VISTAS PÚBLICAS (lo que consulta la web sin login)
-- Para qué: la tabla de posiciones y las estadísticas NO se cargan a mano: se calculan solas desde los eventos.
-- Privacidad: estas vistas NO incluyen documento, fecha de nacimiento ni foto. Solo NOMBRE, CAMISETA POR PARTIDO,
--             ALTURA y estadísticas.
-- Ejecutar después de 002.
-- ============================================================================

-- Segundos transcurridos del partido, a partir del cuarto y del reloj oficial (segundos que faltan del cuarto).
create function seg_juego(p_cuarto int, p_reloj int, p_min int, p_cuartos int, p_min_sup int)
returns int language sql immutable as $$
  select case
    when p_cuarto <= p_cuartos
      then (p_cuarto - 1) * p_min * 60 + (p_min * 60 - coalesce(p_reloj, p_min * 60))
    else p_cuartos * p_min * 60 + (p_cuarto - p_cuartos - 1) * p_min_sup * 60
         + (p_min_sup * 60 - coalesce(p_reloj, p_min_sup * 60))
  end
$$;

-- ---------------------------------------------------------------- pantalla inicial: elegir la liga
create view vista_ligas as
select l.id, l.slug, l.nombre, l.logo_url,
       (select count(*) from categorias c where c.liga_id = l.id) as categorias,
       (select count(*) from partidos p where p.liga_id = l.id and p.estado = 'en_vivo') as en_vivo
from ligas l;

-- ---------------------------------------------------------------- estructura de la liga
create view vista_categorias as
select c.id, c.liga_id, l.slug as liga_slug, l.nombre as liga_nombre, c.nombre, c.temporada
from categorias c join ligas l on l.id = c.liga_id;

create view vista_equipos as
select e.id, e.categoria_id, e.nombre, e.color_principal, e.color_alternativo, e.logo_url
from equipos e;

-- Jugadores: solo nombre y altura (y su equipo actual).
create view vista_jugadores as
select j.id, j.liga_id, j.nombre, j.apellido, j.nombre || ' ' || j.apellido as nombre_completo,
       j.altura_cm, i.equipo_id, e.nombre as equipo_nombre, e.categoria_id, i.camiseta_habitual
from jugadores j
left join inscripciones i on i.jugador_id = j.id and i.activa
left join equipos e on e.id = i.equipo_id;

-- ---------------------------------------------------------------- partidos con marcador en vivo
create view vista_partidos as
with marcador as (
  select partido_id,
    coalesce(sum(case tipo when 'P1' then 1 when 'P2' then 2 when 'P3' then 3 end) filter (where equipo = 'local'), 0)     as m_local,
    coalesce(sum(case tipo when 'P1' then 1 when 'P2' then 2 when 'P3' then 3 end) filter (where equipo = 'visitante'), 0) as m_visit,
    max(cuarto) as cuarto_actual
  from eventos_vigentes group by partido_id
)
select p.id, p.liga_id, p.categoria_id, c.nombre as categoria_nombre,
       p.local_id, el.nombre as local_nombre, el.color_principal as local_color,
       p.visitante_id, ev.nombre as visitante_nombre, ev.color_principal as visitante_color,
       p.fecha_hora, p.cancha, p.fase, p.grupo, p.nro_fecha, p.estado,
       case when p.estado = 'en_vivo' then coalesce(m.m_local, 0) else p.marcador_local end       as marcador_local,
       case when p.estado = 'en_vivo' then coalesce(m.m_visit, 0) else p.marcador_visitante end   as marcador_visitante,
       case when p.estado = 'en_vivo' then coalesce(m.cuarto_actual, 1) end                       as cuarto_actual,
       p.arbitros, p.cronometrista
from partidos p
join categorias c on c.id = p.categoria_id
join equipos el on el.id = p.local_id
join equipos ev on ev.id = p.visitante_id
left join marcador m on m.partido_id = p.id;

create view vista_partido_jugadores as
select pj.partido_id, pj.jugador_id, j.nombre || ' ' || j.apellido as nombre_completo,
       j.altura_cm, pj.equipo_id, pj.camiseta, pj.titular
from partido_jugadores pj join jugadores j on j.id = pj.jugador_id;

-- ---------------------------------------------------------------- estadísticas por jugador y partido
create view vista_stats_jugador_partido as
with cfg as (          -- reglas de cada liga (minutos por cuarto, etc.)
  select p.id as partido_id,
         (l.reglamento->>'cuartos')::int as cuartos,
         (l.reglamento->>'minutos_cuarto')::int as min_cuarto,
         (l.reglamento->>'minutos_suplementario')::int as min_sup
  from partidos p join ligas l on l.id = p.liga_id
),
ev as (                -- cada evento vigente con su "segundo de juego"
  select e.*, f.cuartos, f.min_cuarto, f.min_sup,
         seg_juego(coalesce(e.cuarto, 1), e.reloj_seg, f.min_cuarto, f.cuartos, f.min_sup) as t
  from eventos_vigentes e join cfg f on f.partido_id = e.partido_id
),
fin as (               -- cuándo terminó el partido (último fin de cuarto, o el último evento)
  select partido_id, coalesce(max(t) filter (where tipo = 'CUARTO_FIN'), max(t)) as t_fin
  from ev group by partido_id
),
entradas as (
  select partido_id, jugador_id, t, row_number() over (partition by partido_id, jugador_id order by t, seq) as n
  from (
    select partido_id, jugador_id, 0 as t, seq from ev where tipo = 'QUINTETO'
    union all
    select partido_id, jugador2_id, t, seq from ev where tipo = 'CAMBIO'
  ) x
),
salidas as (
  select partido_id, jugador_id, t, row_number() over (partition by partido_id, jugador_id order by t, seq) as n
  from ev where tipo = 'CAMBIO'
),
minutos as (
  select en.partido_id, en.jugador_id,
         round(sum(coalesce(sa.t, f.t_fin) - en.t) / 60.0, 1) as min
  from entradas en
  left join salidas sa on sa.partido_id = en.partido_id and sa.jugador_id = en.jugador_id and sa.n = en.n
  join fin f on f.partido_id = en.partido_id
  group by en.partido_id, en.jugador_id
),
acciones as (
  select partido_id, jugador_id,
    count(*) filter (where tipo = 'P1') as tl_conv,  count(*) filter (where tipo in ('P1','E1')) as tl_int,
    count(*) filter (where tipo = 'P2') as t2_conv,  count(*) filter (where tipo in ('P2','E2')) as t2_int,
    count(*) filter (where tipo = 'P3') as t3_conv,  count(*) filter (where tipo in ('P3','E3')) as t3_int,
    count(*) filter (where tipo = 'AST') as ast,
    count(*) filter (where tipo = 'ROB') as rob,
    count(*) filter (where tipo = 'PER') as per,
    count(*) filter (where tipo = 'FALTA') as faltas,
    count(*) filter (where tipo = 'FALTA' and detalle = 'descalificante') as descalificante
  from ev where jugador_id is not null and tipo not in ('CAMBIO','QUINTETO')
  group by partido_id, jugador_id
),
rebotes as (
  select r.partido_id, r.jugador_id,
    count(*) filter (where x.equipo = r.equipo) as ro,
    count(*) filter (where x.equipo is distinct from r.equipo) as rd
  from ev r left join eventos x on x.id = r.ref
  where r.tipo = 'REB' and r.jugador_id is not null
  group by r.partido_id, r.jugador_id
)
select pj.partido_id, pj.jugador_id, j.nombre || ' ' || j.apellido as nombre_completo,
       pj.equipo_id, pj.camiseta, pj.titular, j.altura_cm,
       p.categoria_id, p.estado as estado_partido,
       coalesce(m.min, 0) as min,
       coalesce(a.tl_conv, 0) + 2 * coalesce(a.t2_conv, 0) + 3 * coalesce(a.t3_conv, 0) as pts,
       coalesce(a.t2_conv, 0) + coalesce(a.t3_conv, 0) as tc_conv,
       coalesce(a.t2_int, 0) + coalesce(a.t3_int, 0)   as tc_int,
       coalesce(a.t3_conv, 0) as t3_conv, coalesce(a.t3_int, 0) as t3_int,
       coalesce(a.tl_conv, 0) as tl_conv, coalesce(a.tl_int, 0) as tl_int,
       coalesce(rb.ro, 0) as ro, coalesce(rb.rd, 0) as rd, coalesce(rb.ro, 0) + coalesce(rb.rd, 0) as reb,
       coalesce(a.ast, 0) as ast, coalesce(a.rob, 0) as rob, coalesce(a.per, 0) as per,
       coalesce(a.faltas, 0) as faltas,
       (coalesce(a.descalificante, 0) > 0 or coalesce(a.faltas, 0) >= (l.reglamento->>'faltas_jugador')::int) as descalificado,
       (coalesce(m.min, 0) > 0 or a.jugador_id is not null or rb.jugador_id is not null) as jugo
from partido_jugadores pj
join partidos p on p.id = pj.partido_id
join ligas l on l.id = p.liga_id
join jugadores j on j.id = pj.jugador_id
left join minutos m on m.partido_id = pj.partido_id and m.jugador_id = pj.jugador_id
left join acciones a on a.partido_id = pj.partido_id and a.jugador_id = pj.jugador_id
left join rebotes rb on rb.partido_id = pj.partido_id and rb.jugador_id = pj.jugador_id;

-- ---------------------------------------------------------------- estadísticas por jugador (temporada)
create view vista_stats_jugador as
select s.jugador_id, s.nombre_completo, s.altura_cm, s.equipo_id, e.nombre as equipo_nombre, s.categoria_id,
       count(*) as pj,
       round(avg(s.min), 1) as min_prom,
       sum(s.pts) as pts, round(avg(s.pts), 1) as pts_prom,
       sum(s.reb) as reb, round(avg(s.reb), 1) as reb_prom,
       sum(s.ast) as ast, round(avg(s.ast), 1) as ast_prom,
       sum(s.rob) as rob, round(avg(s.rob), 1) as rob_prom,
       sum(s.per) as per, round(avg(s.per), 1) as per_prom,
       sum(s.faltas) as faltas, round(avg(s.faltas), 1) as faltas_prom,
       sum(s.t3_conv) as t3_conv, sum(s.t3_int) as t3_int,
       sum(s.tl_conv) as tl_conv, sum(s.tl_int) as tl_int,
       sum(s.tc_conv) as tc_conv, sum(s.tc_int) as tc_int,
       max(s.pts) as pts_max
from vista_stats_jugador_partido s
join equipos e on e.id = s.equipo_id
where s.estado_partido = 'cerrado' and s.jugo
group by s.jugador_id, s.nombre_completo, s.altura_cm, s.equipo_id, e.nombre, s.categoria_id;

-- ---------------------------------------------------------------- tabla de posiciones
create view vista_tabla as
with res as (
  select categoria_id, local_id as equipo_id, marcador_local as pf, marcador_visitante as pc from partidos where estado = 'cerrado'
  union all
  select categoria_id, visitante_id, marcador_visitante, marcador_local from partidos where estado = 'cerrado'
),
agg as (
  select equipo_id, count(*) as pj,
         count(*) filter (where pf > pc) as pg, count(*) filter (where pf < pc) as pp,
         sum(pf) as pf, sum(pc) as pc
  from res group by equipo_id
),
base as (
  select e.categoria_id, e.id as equipo_id, e.nombre as equipo_nombre, e.color_principal,
         coalesce(a.pj, 0) as pj, coalesce(a.pg, 0) as pg, coalesce(a.pp, 0) as pp,
         coalesce(a.pf, 0) as pf, coalesce(a.pc, 0) as pc,
         coalesce(a.pf, 0) - coalesce(a.pc, 0) as dif,
         coalesce(a.pg, 0) * (l.reglamento->>'puntos_ganado')::int
           + coalesce(a.pp, 0) * (l.reglamento->>'puntos_perdido')::int as pts
  from equipos e
  join categorias c on c.id = e.categoria_id
  join ligas l on l.id = c.liga_id
  left join agg a on a.equipo_id = e.id
)
select categoria_id, equipo_id, equipo_nombre, color_principal, pj, pg, pp, pf, pc, dif, pts,
       rank() over (partition by categoria_id order by pts desc, dif desc, pf desc) as posicion
from base;

-- ---------------------------------------------------------------- estadísticas por equipo
create view vista_stats_equipo as
select e.categoria_id, s.equipo_id, e.nombre as equipo_nombre,
       count(distinct s.partido_id) as pj,
       round(sum(s.pts)::numeric / nullif(count(distinct s.partido_id), 0), 1) as pts_prom,
       round(sum(s.reb)::numeric / nullif(count(distinct s.partido_id), 0), 1) as reb_prom,
       round(sum(s.ast)::numeric / nullif(count(distinct s.partido_id), 0), 1) as ast_prom,
       round(sum(s.rob)::numeric / nullif(count(distinct s.partido_id), 0), 1) as rob_prom,
       round(sum(s.per)::numeric / nullif(count(distinct s.partido_id), 0), 1) as per_prom,
       round(sum(s.faltas)::numeric / nullif(count(distinct s.partido_id), 0), 1) as faltas_prom,
       round(100.0 * sum(s.t3_conv) / nullif(sum(s.t3_int), 0), 1) as t3_pct,
       round(100.0 * sum(s.tl_conv) / nullif(sum(s.tl_int), 0), 1) as tl_pct,
       round(avg(s.altura_cm) filter (where s.jugo), 1) as altura_prom
from vista_stats_jugador_partido s
join equipos e on e.id = s.equipo_id
where s.estado_partido = 'cerrado' and s.jugo
group by e.categoria_id, s.equipo_id, e.nombre;

-- ---------------------------------------------------------------- permisos de lectura
grant select on vista_ligas, vista_categorias, vista_equipos, vista_jugadores, vista_partidos, vista_partido_jugadores,
               vista_stats_jugador_partido, vista_stats_jugador, vista_tabla, vista_stats_equipo
      to anon, authenticated;

-- ---------------------------------------------------------------- vistas solo para cuentas de la liga (no públicas)
-- Posición y habilitación de cada jugador: las necesita Super Oficial. NO incluyen documento ni fecha de nacimiento.
create view vista_plantel_planilla as
select j.id as jugador_id, j.liga_id, jp.posicion, coalesce(jp.habilitado, true) as habilitado
from jugadores j left join jugadores_privado jp on jp.jugador_id = j.id
where es_miembro_de(j.liga_id);

-- Quién lleva cada partido (nombre de la cuenta, p. ej. "Planillero 2").
create view vista_planilla_claims as
select pp.partido_id, pf.nombre as planillero
from partido_planillero pp join perfiles pf on pf.usuario_id = pp.usuario_id
where es_miembro_de(liga_de_partido(pp.partido_id));

grant select on vista_plantel_planilla, vista_planilla_claims to authenticated;
-- ============================================================================
-- Super Oficial de Mesa · 005 · LOGOS DE LAS LIGAS (Storage de Supabase)
-- Para qué: guardar el logo de cada liga en un lugar público, para mostrarlo al inicio de la web.
-- Quién sube un logo: solo el dueño (desde Supabase → Storage → logos → Upload). Después se copia su enlace público
-- en la columna logo_url de la liga:  update ligas set logo_url = 'https://...' where slug = 'mar-y-sierra';
-- Ejecutar después de 003. (En una base común sin Storage no hace nada.)
-- ============================================================================
-- Logos de EQUIPOS y de la LIGA: el coordinador sube la imagen a la carpeta de su liga (logos/<id-de-la-liga>/...) y guarda su enlace
-- público en equipos.logo_url o ligas.logo_url. El dueño puede subir en cualquier carpeta.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('logos', 'logos', true) on conflict (id) do nothing;
    create policy "logos: lectura publica" on storage.objects for select using (bucket_id = 'logos');
    create policy "logos: la liga sube" on storage.objects for insert to authenticated
      with check (bucket_id = 'logos' and (public.es_dueno() or
        case when split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$' then public.es_coord_de(split_part(name, '/', 1)::uuid) else false end));
    create policy "logos: la liga cambia" on storage.objects for update to authenticated
      using (bucket_id = 'logos' and (public.es_dueno() or
        case when split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$' then public.es_coord_de(split_part(name, '/', 1)::uuid) else false end));
    create policy "logos: la liga borra" on storage.objects for delete to authenticated
      using (bucket_id = 'logos' and (public.es_dueno() or
        case when split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$' then public.es_coord_de(split_part(name, '/', 1)::uuid) else false end));
  end if;
end $$;
-- ============================================================================
-- TU LIGA · 008 · DRIVE DE IDA Y VUELTA (copia privada y carga desde Drive)
-- Para qué:
--   IDA:    el script de Drive lee los datos de regularidad de los jugadores (documento, fecha de nacimiento, habilitación)
--           para dejarlos en la hoja PRIVADA de la liga. Esos datos nunca salen por las vistas públicas.
--   VUELTA: el coordinador carga plantel, fixture y resultados desde la hoja; la base los valida y los aplica.
-- Seguridad: cada liga tiene una "clave de Drive" propia (solo se guarda su huella). Quien no la tiene no entra a nada.
--            Se puede cambiar o borrar cuando quieras. NO es la clave secreta de Supabase.
-- Se corre una vez después de 001 a 007.
-- ============================================================================
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table drive_claves (
  liga_id    uuid primary key references ligas on delete cascade,
  hash       text not null,
  creada_at  timestamptz not null default now()
);
alter table drive_claves enable row level security;     -- sin políticas ni permisos: solo las funciones de abajo la tocan
revoke all on drive_claves from public, anon, authenticated;

-- Verifica la clave de Drive de una liga. Una clave mala demora 1 segundo la respuesta (frena adivinar).
create function _drive_liga(p_slug text, p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v uuid;
begin
  select l.id into v from ligas l join drive_claves d on d.liga_id = l.id
   where l.slug = p_slug and d.hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if v is null then
    perform pg_sleep(1);
    raise exception 'Clave de Drive incorrecta' using errcode = 'insufficient_privilege';
  end if;
  return v;
end $$;
revoke execute on function _drive_liga(text, text) from public, anon, authenticated;

-- IDA: datos reglamentarios de los jugadores de la liga, para la hoja privada.
create function drive_exportar(p_slug text, p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_liga uuid := _drive_liga(p_slug, p_token);
begin
  return jsonb_build_object('privados', coalesce((
    select jsonb_agg(jsonb_build_object('jugador_id', jp.jugador_id, 'documento', jp.documento, 'fecha_nacimiento', jp.fecha_nacimiento,
                                        'posicion', jp.posicion, 'habilitado', jp.habilitado, 'notas', jp.notas))
    from jugadores_privado jp join jugadores j on j.id = jp.jugador_id where j.liga_id = v_liga), '[]'::jsonb));
end $$;

-- VUELTA: valida (p_aplicar = false) o aplica (p_aplicar = true) lo cargado en la hoja. Devuelve una línea por fila con su estado.
--   p_plantel:    [{fila, categoria, equipo, camiseta, nombre, apellido, altura, posicion, documento, nacimiento, habilitado, notas}]
--   p_fixture:    [{fila, fecha 'AAAA-MM-DD', hora 'HH:MM', cancha, categoria, fase, grupo, nro_fecha, local, visitante}]
--   p_resultados: [{fila, fecha, categoria, local, visitante, pts_local, pts_visitante}]
create function drive_importar(p_slug text, p_token text, p_plantel jsonb, p_fixture jsonb, p_resultados jsonb, p_aplicar boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_liga uuid := _drive_liga(p_slug, p_token);
  r jsonb; salida jsonb := '[]'::jsonb;
  v_cat uuid; v_eq uuid; v_eq2 uuid; v_j uuid; v_p uuid; v_msg text; v_acc text; v_ts timestamptz; v_est estado_partido;
  v_tz constant text := 'America/Argentina/Buenos_Aires';
  v_hab boolean; v_pos text;
begin
  -- ------------------------------------------------ plantel (equipos y jugadores)
  for r in select * from jsonb_array_elements(coalesce(p_plantel, '[]'::jsonb)) loop
    v_msg := null; v_acc := null; v_eq := null; v_j := null;
    begin
      select c.id into v_cat from categorias c where c.liga_id = v_liga and lower(c.nombre) = lower(trim(coalesce(r->>'categoria', ''))) order by c.temporada desc limit 1;
      if v_cat is null then
        v_msg := 'La categoría "' || coalesce(r->>'categoria', '') || '" no existe (crearla en la web: Gestión → Mi liga)';
      elsif trim(coalesce(r->>'equipo', '')) = '' or trim(coalesce(r->>'nombre', '')) = '' then
        v_msg := 'Falta el equipo o el nombre';
      else
        select e.id into v_eq from equipos e where e.categoria_id = v_cat and lower(e.nombre) = lower(trim(r->>'equipo'));
        if v_eq is null then
          v_acc := 'crea el equipo y el jugador';
          if p_aplicar then insert into equipos (categoria_id, nombre) values (v_cat, trim(r->>'equipo')) returning id into v_eq; end if;
        end if;
        if trim(coalesce(r->>'documento', '')) <> '' then
          select jp.jugador_id into v_j from jugadores_privado jp join jugadores j on j.id = jp.jugador_id
           where j.liga_id = v_liga and jp.documento = trim(r->>'documento') limit 1;
        end if;
        if v_j is null and v_eq is not null then
          select j.id into v_j from jugadores j join inscripciones i on i.jugador_id = j.id and i.equipo_id = v_eq
           where j.liga_id = v_liga and lower(j.nombre) = lower(trim(r->>'nombre')) and lower(j.apellido) = lower(coalesce(nullif(trim(r->>'apellido'), ''), '-')) limit 1;
        end if;
        v_acc := coalesce(v_acc, case when v_j is null then 'crea el jugador' else 'actualiza el jugador' end);
        v_pos := nullif(upper(trim(coalesce(r->>'posicion', ''))), '');
        v_hab := not (lower(trim(coalesce(r->>'habilitado', ''))) in ('no', 'false', '0', 'n'));
        if v_pos is not null and v_pos not in ('B', 'E', 'A', 'AP', 'P') then raise exception 'Posición "%": usá B, E, A, AP o P', v_pos; end if;
        if p_aplicar then
          if v_j is null then
            insert into jugadores (liga_id, nombre, apellido, altura_cm)
              values (v_liga, trim(r->>'nombre'), coalesce(nullif(trim(r->>'apellido'), ''), '-'), nullif(trim(coalesce(r->>'altura', '')), '')::smallint) returning id into v_j;
          else
            update jugadores set nombre = trim(r->>'nombre'), apellido = coalesce(nullif(trim(r->>'apellido'), ''), apellido),
                   altura_cm = coalesce(nullif(trim(coalesce(r->>'altura', '')), '')::smallint, altura_cm) where id = v_j;
          end if;
          insert into inscripciones (jugador_id, equipo_id, camiseta_habitual)
            values (v_j, v_eq, nullif(trim(coalesce(r->>'camiseta', '')), '')::smallint)
            on conflict (jugador_id, equipo_id) do update set camiseta_habitual = coalesce(excluded.camiseta_habitual, inscripciones.camiseta_habitual), activa = true;
          insert into jugadores_privado (jugador_id, documento, fecha_nacimiento, posicion, habilitado, notas)
            values (v_j, nullif(trim(coalesce(r->>'documento', '')), ''), nullif(trim(coalesce(r->>'nacimiento', '')), '')::date, v_pos, v_hab, nullif(trim(coalesce(r->>'notas', '')), ''))
            on conflict (jugador_id) do update set documento = coalesce(excluded.documento, jugadores_privado.documento),
                   fecha_nacimiento = coalesce(excluded.fecha_nacimiento, jugadores_privado.fecha_nacimiento),
                   posicion = coalesce(excluded.posicion, jugadores_privado.posicion), habilitado = excluded.habilitado,
                   notas = coalesce(excluded.notas, jugadores_privado.notas);
        end if;
      end if;
    exception when others then v_msg := sqlerrm;
    end;
    salida := salida || jsonb_build_object('tabla', 'plantel', 'fila', (r->>'fila')::int, 'ok', v_msg is null, 'mensaje', coalesce(v_msg, v_acc));
  end loop;

  -- ------------------------------------------------ fixture oficial
  for r in select * from jsonb_array_elements(coalesce(p_fixture, '[]'::jsonb)) loop
    v_msg := null; v_acc := null; v_p := null;
    begin
      select c.id into v_cat from categorias c where c.liga_id = v_liga and lower(c.nombre) = lower(trim(coalesce(r->>'categoria', ''))) order by c.temporada desc limit 1;
      if v_cat is null then raise exception 'La categoría "%" no existe', coalesce(r->>'categoria', ''); end if;
      select e.id into v_eq from equipos e where e.categoria_id = v_cat and lower(e.nombre) = lower(trim(coalesce(r->>'local', '')));
      if v_eq is null then raise exception 'El equipo local "%" no existe en %', coalesce(r->>'local', ''), r->>'categoria'; end if;
      select e.id into v_eq2 from equipos e where e.categoria_id = v_cat and lower(e.nombre) = lower(trim(coalesce(r->>'visitante', '')));
      if v_eq2 is null then raise exception 'El equipo visitante "%" no existe en %', coalesce(r->>'visitante', ''), r->>'categoria'; end if;
      if v_eq = v_eq2 then raise exception 'Local y visitante son el mismo equipo'; end if;
      if coalesce(r->>'fecha', '') = '' then raise exception 'Falta la fecha'; end if;
      v_ts := ((r->>'fecha') || ' ' || coalesce(nullif(trim(r->>'hora'), ''), '20:00'))::timestamp at time zone v_tz;
      select p.id, p.estado into v_p, v_est from partidos p
       where p.categoria_id = v_cat and p.local_id = v_eq and p.visitante_id = v_eq2 and (p.fecha_hora at time zone v_tz)::date = (r->>'fecha')::date limit 1;
      if v_p is not null and v_est <> 'programado' then
        raise exception 'Ese partido ya está % y no se modifica desde Drive', v_est;
      end if;
      v_acc := case when v_p is null then 'crea el partido' else 'actualiza el partido' end;
      if p_aplicar then
        if v_p is null then
          insert into partidos (categoria_id, local_id, visitante_id, fecha_hora, cancha, fase, grupo, nro_fecha)
            values (v_cat, v_eq, v_eq2, v_ts, nullif(trim(coalesce(r->>'cancha', '')), ''), coalesce(nullif(trim(coalesce(r->>'fase', '')), ''), 'fase regular'),
                    nullif(trim(coalesce(r->>'grupo', '')), ''), nullif(trim(coalesce(r->>'nro_fecha', '')), '')::smallint);
        else
          update partidos set fecha_hora = v_ts, cancha = nullif(trim(coalesce(r->>'cancha', '')), ''),
                 fase = coalesce(nullif(trim(coalesce(r->>'fase', '')), ''), fase), grupo = nullif(trim(coalesce(r->>'grupo', '')), ''),
                 nro_fecha = nullif(trim(coalesce(r->>'nro_fecha', '')), '')::smallint where id = v_p;
        end if;
      end if;
    exception when others then v_msg := sqlerrm;
    end;
    salida := salida || jsonb_build_object('tabla', 'fixture', 'fila', (r->>'fila')::int, 'ok', v_msg is null, 'mensaje', coalesce(v_msg, v_acc));
  end loop;

  -- ------------------------------------------------ resultados (base de la tabla de posiciones)
  for r in select * from jsonb_array_elements(coalesce(p_resultados, '[]'::jsonb)) loop
    v_msg := null; v_acc := null; v_p := null;
    begin
      select c.id into v_cat from categorias c where c.liga_id = v_liga and lower(c.nombre) = lower(trim(coalesce(r->>'categoria', ''))) order by c.temporada desc limit 1;
      if v_cat is null then raise exception 'La categoría "%" no existe', coalesce(r->>'categoria', ''); end if;
      select e.id into v_eq from equipos e where e.categoria_id = v_cat and lower(e.nombre) = lower(trim(coalesce(r->>'local', '')));
      select e.id into v_eq2 from equipos e where e.categoria_id = v_cat and lower(e.nombre) = lower(trim(coalesce(r->>'visitante', '')));
      if v_eq is null or v_eq2 is null then raise exception 'No encuentro los equipos "%" y "%" en %', coalesce(r->>'local', ''), coalesce(r->>'visitante', ''), r->>'categoria'; end if;
      if nullif(trim(coalesce(r->>'pts_local', '')), '') is null or nullif(trim(coalesce(r->>'pts_visitante', '')), '') is null then raise exception 'Faltan los puntos'; end if;
      select p.id, p.estado into v_p, v_est from partidos p
       where p.categoria_id = v_cat and p.local_id = v_eq and p.visitante_id = v_eq2
         and (coalesce(r->>'fecha', '') = '' or (p.fecha_hora at time zone v_tz)::date = (r->>'fecha')::date)
       order by (p.estado = 'programado') desc, p.fecha_hora limit 1;
      if v_p is null then
        if coalesce(r->>'fecha', '') = '' then raise exception 'No hay un partido %-% en el fixture (poné la fecha para crearlo)', r->>'local', r->>'visitante'; end if;
        v_acc := 'crea el partido ya jugado y su resultado';
        if p_aplicar then
          insert into partidos (categoria_id, local_id, visitante_id, fecha_hora, estado, marcador_local, marcador_visitante, cerrado_at, fase)
            values (v_cat, v_eq, v_eq2, ((r->>'fecha') || ' ' || coalesce(nullif(trim(r->>'hora'), ''), '20:00'))::timestamp at time zone v_tz, 'cerrado',
                    (r->>'pts_local')::int, (r->>'pts_visitante')::int, now(), 'fase regular');
        end if;
      elsif exists (select 1 from eventos where partido_id = v_p) then
        v_acc := 'omitido: ese partido ya tiene jugadas capturadas (su resultado sale de la planilla)';
      else
        v_acc := 'carga el resultado';
        if p_aplicar then
          update partidos set marcador_local = (r->>'pts_local')::int, marcador_visitante = (r->>'pts_visitante')::int,
                 estado = 'cerrado', cerrado_at = coalesce(cerrado_at, now()) where id = v_p;
        end if;
      end if;
    exception when others then v_msg := sqlerrm;
    end;
    salida := salida || jsonb_build_object('tabla', 'resultados', 'fila', (r->>'fila')::int, 'ok', v_msg is null, 'mensaje', coalesce(v_msg, v_acc));
  end loop;

  return salida;
end $$;

revoke execute on function drive_exportar(text, text), drive_importar(text, text, jsonb, jsonb, jsonb, boolean) from public;
grant execute on function drive_exportar(text, text), drive_importar(text, text, jsonb, jsonb, jsonb, boolean) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Cómo poner (o cambiar) la clave de Drive de una liga. Inventá una clave larga (30 caracteres o más) con tu gestor de
-- contraseñas, pegala ACÁ en lugar de PEGAR-LA-CLAVE-ACÁ, corré esto y guardala también en el gestor.
-- En la base queda solo su huella; la clave en sí la vas a pegar una vez en la hoja de Drive.
--
--   insert into drive_claves (liga_id, hash)
--   select id, encode(extensions.digest('PEGAR-LA-CLAVE-ACÁ', 'sha256'), 'hex') from ligas where slug = 'mar-y-sierra'
--   on conflict (liga_id) do update set hash = excluded.hash, creada_at = now();
--
-- Para cortar el acceso de Drive:   delete from drive_claves where liga_id = (select id from ligas where slug = 'mar-y-sierra');
-- ----------------------------------------------------------------------------
