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
