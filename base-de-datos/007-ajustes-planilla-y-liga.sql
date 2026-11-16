-- ============================================================================
-- TU LIGA · 007 · AJUSTES: plantel de la planilla y edición de la liga
-- Para qué:
--   1) El planillero guarda el plantel que vino al partido (quién jugó y con qué camiseta), árbitros y cronometrista.
--   2) El coordinador puede editar el nombre y el logo de SU liga (antes solo el dueño).
-- Es seguro correrlo una sola vez después de 001 a 006. (Ya está incluido en 002 para instalaciones nuevas.)
-- ============================================================================
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
