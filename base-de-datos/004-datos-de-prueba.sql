-- ============================================================================
-- Super Oficial de Mesa · 004 · DATOS DE PRUEBA (opcional, 100 % inventados)
-- Para qué: ver la web con una liga de mentira antes de cargar la real. Nombres, alturas y partidos son ficticios.
-- Crea: dos ligas («mar-y-sierra» con todo lo de abajo y «liga-del-valle», casi vacía, para ver la pantalla de elegir liga), la categoría +20, 4 equipos con 8 jugadores cada uno, 4 partidos cerrados,
--       1 partido EN VIVO (cuarto 2) y 2 programados.
-- Para borrarlos después: delete from ligas where slug in ('mar-y-sierra', 'liga-del-valle');  (borra todo lo de esas ligas)
-- ⚠️ Si ya cargaste tu liga real con ese mismo slug, NO ejecutes este archivo.
-- Ejecutar después de 003.
-- ============================================================================

create function _seed_partido(p uuid, p_cuartos_jugar int, p_reloj_final int) returns void
language plpgsql as $$
declare
  v_local uuid; v_vis uuid;
  lj uuid[]; vj uuid[]; cl uuid[]; cv uuid[];
  q int; i int; n_ev int := 34; reloj int; es_local boolean;
  arr uuid[]; otro uuid[]; jug uuid; jug2 uuid; r float; ev uuid; sale uuid; entra uuid;
begin
  select local_id, visitante_id into v_local, v_vis from partidos where id = p;
  select array_agg(jugador_id order by camiseta) into lj from partido_jugadores where partido_id = p and equipo_id = v_local;
  select array_agg(jugador_id order by camiseta) into vj from partido_jugadores where partido_id = p and equipo_id = v_vis;
  cl := lj[1:5]; cv := vj[1:5];
  for i in 1..5 loop
    insert into eventos (partido_id, tipo, jugador_id, cuarto, reloj_seg) values (p, 'QUINTETO', lj[i], 1, 600), (p, 'QUINTETO', vj[i], 1, 600);
  end loop;

  for q in 1..p_cuartos_jugar loop
    insert into eventos (partido_id, tipo, cuarto, reloj_seg) values (p, 'CUARTO_INICIO', q, 600);
    for i in 1..n_ev loop
      reloj := 600 - (i * 600) / (n_ev + 1);
      exit when q = p_cuartos_jugar and reloj < p_reloj_final;

      if i = 8 and q in (2, 3) then          -- cambio de cada lado a mitad del cuarto
        sale := cl[1]; entra := lj[4 + q];
        insert into eventos (partido_id, tipo, jugador_id, jugador2_id, cuarto, reloj_seg) values (p, 'CAMBIO', sale, entra, q, reloj);
        cl := array_append(cl[2:5], entra);
        sale := cv[1]; entra := vj[4 + q];
        insert into eventos (partido_id, tipo, jugador_id, jugador2_id, cuarto, reloj_seg) values (p, 'CAMBIO', sale, entra, q, reloj);
        cv := array_append(cv[2:5], entra);
      end if;

      es_local := random() < 0.5;
      arr := case when es_local then cl else cv end;
      otro := case when es_local then cv else cl end;
      jug := arr[1 + floor(random() * 5)::int];
      jug2 := arr[1 + floor(random() * 5)::int];
      r := random();
      ev := gen_random_uuid();

      if r < 0.30 then
        insert into eventos (id, partido_id, tipo, jugador_id, cuarto, reloj_seg) values (ev, p, 'P2', jug, q, reloj);
        if random() < 0.5 and jug2 <> jug then
          insert into eventos (partido_id, tipo, jugador_id, cuarto, reloj_seg, ref) values (p, 'AST', jug2, q, reloj, ev);
        end if;
      elsif r < 0.42 then
        insert into eventos (partido_id, tipo, jugador_id, cuarto, reloj_seg) values (p, 'P3', jug, q, reloj);
      elsif r < 0.50 then
        insert into eventos (partido_id, tipo, jugador_id, cuarto, reloj_seg) values (p, 'P1', jug, q, reloj);
      elsif r < 0.68 then
        insert into eventos (id, partido_id, tipo, jugador_id, cuarto, reloj_seg) values (ev, p, 'E2', jug, q, reloj);
        insert into eventos (partido_id, tipo, jugador_id, cuarto, reloj_seg, ref)
          values (p, 'REB', case when random() < 0.65 then otro[1 + floor(random() * 5)::int] else jug2 end, q, reloj, ev);
      elsif r < 0.76 then
        insert into eventos (id, partido_id, tipo, jugador_id, cuarto, reloj_seg) values (ev, p, 'E3', jug, q, reloj);
        insert into eventos (partido_id, tipo, jugador_id, cuarto, reloj_seg, ref)
          values (p, 'REB', otro[1 + floor(random() * 5)::int], q, reloj, ev);
      elsif r < 0.82 then
        insert into eventos (partido_id, tipo, jugador_id, cuarto, reloj_seg, detalle) values (p, 'FALTA', jug, q, reloj, 'personal');
      elsif r < 0.88 then
        insert into eventos (id, partido_id, tipo, jugador_id, cuarto, reloj_seg) values (ev, p, 'ROB', jug, q, reloj);
        insert into eventos (partido_id, tipo, jugador_id, cuarto, reloj_seg, ref)
          values (p, 'PER', otro[1 + floor(random() * 5)::int], q, reloj, ev);
      elsif r < 0.98 then
        insert into eventos (partido_id, tipo, jugador_id, cuarto, reloj_seg) values (p, 'P2', jug, q, reloj);
      else
        insert into eventos (partido_id, tipo, equipo, cuarto, reloj_seg)
          values (p, 'TM', case when es_local then 'local' else 'visitante' end::lado, q, reloj);
      end if;
    end loop;
    if not (q = p_cuartos_jugar and p_reloj_final > 0) then
      insert into eventos (partido_id, tipo, cuarto, reloj_seg) values (p, 'CUARTO_FIN', q, 0);
    end if;
  end loop;
end $$;

do $$
declare
  v_liga uuid; v_cat uuid; v_eq uuid[] := '{}'; v_id uuid;
  nombres text[] := array['Mateo','Lucas','Joaquín','Tomás','Franco','Nicolás','Santiago','Bruno','Facundo','Ignacio','Agustín','Matías',
    'Lautaro','Gonzalo','Emiliano','Ramiro','Julián','Maximiliano','Federico','Sebastián','Diego','Martín','Pablo','Hernán','Gastón',
    'Leandro','Ezequiel','Damián','Cristian','Marcos','Andrés','Rodrigo'];
  apellidos text[] := array['Acosta','Benítez','Castro','Domínguez','Escobar','Fernández','Gómez','Herrera','Ibarra','Juárez','Luna','Medina',
    'Navarro','Ortiz','Peralta','Quiroga','Ramos','Sosa','Torres','Urquiza','Vega','Werner','Yáñez','Zárate','Aguirre','Bustos','Correa',
    'Duarte','Espeche','Figueroa','Godoy','Ledesma'];
  eq_nombre text[] := array['Marlin','Sierra','Costa','Lobos'];
  eq_color text[] := array['#1f6feb','#2da44e','#f2a900','#d1242f'];
  eq_color2 text[] := array['#ffffff','#ffffff','#111111','#ffffff'];
  i int; j int; k int; n int := 0; v_j uuid; v_p uuid; cam int;
  pares int[][] := array[[1,2],[3,4],[1,3],[2,4],[1,4],[2,3]];
  v_estado estado_partido;
begin
  perform setseed(0.37);
  insert into ligas (slug, nombre) values ('mar-y-sierra', 'Liga Mar y Sierra') returning id into v_liga;
  insert into categorias (liga_id, nombre, temporada) values (v_liga, '+20', '2026') returning id into v_cat;

  for i in 1..4 loop
    insert into equipos (categoria_id, nombre, color_principal, color_alternativo)
      values (v_cat, eq_nombre[i], eq_color[i], eq_color2[i]) returning id into v_id;
    v_eq := v_eq || v_id;
    for j in 1..8 loop
      n := n + 1;
      insert into jugadores (liga_id, nombre, apellido, altura_cm)
        values (v_liga, nombres[n], apellidos[n], 168 + floor(random() * 32)::int) returning id into v_j;
      insert into inscripciones (jugador_id, equipo_id, camiseta_habitual) values (v_j, v_eq[i], 3 + j * 2);
      -- datos reglamentarios inventados, solo visibles para coordinadores
      insert into jugadores_privado (jugador_id, documento, fecha_nacimiento)
        values (v_j, (30000000 + n * 1111)::text, date '1990-01-01' + (n * 137));
    end loop;
  end loop;

  for k in 1..6 loop
    v_estado := case when k <= 4 then 'cerrado' when k = 5 then 'en_vivo' else 'programado' end;
    insert into partidos (categoria_id, local_id, visitante_id, fecha_hora, cancha, estado, abierto_at, arbitros, cronometrista)
      values (v_cat, v_eq[pares[k][1]], v_eq[pares[k][2]],
              case when k <= 4 then now() - ((5 - k) * interval '3 days')
                   when k = 5 then now() - interval '25 minutes'
                   else now() + interval '2 days' end,
              case when k % 2 = 0 then 'Cancha 2' else 'Cancha 1' end, 'programado', null,
              array['Rossi','Paz'], 'Cronometrista ' || k)
      returning id into v_p;
    -- jugadores habilitados con su camiseta DE ESE PARTIDO (en el partido 2, un jugador cambia de número)
    insert into partido_jugadores (partido_id, jugador_id, equipo_id, camiseta, titular)
      select v_p, i2.jugador_id, i2.equipo_id,
             i2.camiseta_habitual + case when k = 2 and i2.camiseta_habitual = 5 then 1 else 0 end,
             row_number() over (partition by i2.equipo_id order by i2.camiseta_habitual) <= 5
      from inscripciones i2 where i2.equipo_id in (v_eq[pares[k][1]], v_eq[pares[k][2]]);
    if k <= 4 then
      perform _seed_partido(v_p, 4, 0);
      update partidos set estado = 'cerrado', cerrado_at = fecha_hora + interval '2 hours' where id = v_p;
      perform _recalcular_marcador(v_p);
    elsif k = 5 then
      perform _seed_partido(v_p, 2, 240);
      update partidos set estado = 'en_vivo' where id = v_p;
    end if;
  end loop;
  insert into partidos (categoria_id, local_id, visitante_id, fecha_hora, cancha)
    values (v_cat, v_eq[3], v_eq[1], now() + interval '9 days', 'Cancha 1');
end $$;

-- Segunda liga, casi vacía: sirve para ver cómo se elige la liga y cómo se ve una liga que recién empieza.
do $$
declare v_liga uuid; v_cat uuid;
begin
  insert into ligas (slug, nombre) values ('liga-del-valle', 'Liga del Valle') returning id into v_liga;
  insert into categorias (liga_id, nombre, temporada) values (v_liga, '+30', '2026') returning id into v_cat;
  insert into equipos (categoria_id, nombre, color_principal) values (v_cat, 'Halcones', '#7c3aed'), (v_cat, 'Pumas', '#0ea5e9'), (v_cat, 'Zorros', '#ea580c');
end $$;

drop function _seed_partido(uuid, int, int);

-- ----------------------------------------------------------------------------
-- Para probar los perfiles (se hace UNA vez, a mano):
--   1) En Supabase → Authentication → Users → "Add user": creá un usuario por persona (mail y contraseña).
--   2) Dales rol con estas líneas, cambiando los mails (el dueño no lleva liga):
--        insert into perfiles (usuario_id, liga_id, rol, nombre)
--          select id, null, 'dueno', 'Dueño' from auth.users where email = 'tu-mail@...';
--        insert into perfiles (usuario_id, liga_id, rol, nombre)
--          select u.id, l.id, 'coordinador', 'Coordinador de prueba' from auth.users u, ligas l
--          where u.email = 'coordinador@...' and l.slug = 'mar-y-sierra';
--        insert into perfiles (usuario_id, liga_id, rol, nombre)
--          select u.id, l.id, 'planillero', 'Planillero de prueba' from auth.users u, ligas l
--          where u.email = 'planillero@...' and l.slug = 'mar-y-sierra';
--   3) Asigná el planillero a un partido:
--        insert into partido_planillero (partido_id, usuario_id)
--          select p.id, u.id from partidos p, auth.users u
--          where p.estado = 'en_vivo' and u.email = 'planillero@...';
-- ----------------------------------------------------------------------------
