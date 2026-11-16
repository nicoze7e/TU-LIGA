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
