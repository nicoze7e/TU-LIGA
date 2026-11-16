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
