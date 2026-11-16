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
