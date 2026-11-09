create table enjoy.vehicle_catalog_brands (
 name text primary key check (char_length(name) between 1 and 80),
 logo_url text not null default '' check (char_length(logo_url) <= 1000),
 created_at timestamptz not null default now()
);
create table enjoy.vehicle_catalog_imports (
 id bigint generated always as identity primary key,
 brand text not null references enjoy.vehicle_catalog_brands(name),
 vehicle_type text not null check(vehicle_type in ('liviano','pesado')),
 region text not null check((vehicle_type='liviano' and region='general') or (vehicle_type='pesado' and region in ('sierra','costa'))),
 filename text not null,
 items jsonb not null,
 created_at timestamptz not null default now()
);
create index vehicle_catalog_scope_latest on enjoy.vehicle_catalog_imports (brand,vehicle_type,region,id desc);
alter table enjoy.vehicle_catalog_brands enable row level security;
alter table enjoy.vehicle_catalog_imports enable row level security;
revoke all on enjoy.vehicle_catalog_brands,enjoy.vehicle_catalog_imports from public,anon,authenticated;

create function enjoy.vehicle_catalog(action text,payload jsonb,admin boolean) returns jsonb
language plpgsql volatile set search_path='' as $$
declare brand_name text:=upper(btrim(coalesce(payload->>'brand','')));
 kind text:=payload->>'vehicle_type'; zone text:=payload->>'region';
 logo text:=coalesce(payload->>'logo_url',''); lines jsonb:=payload->'items';
 result jsonb;
begin
 if auth.uid() is null then raise exception 'Debe iniciar sesión.' using errcode='42501';end if;
 if action='vehicle-catalog-index' then
  return jsonb_build_object(
   'brands',coalesce((select jsonb_agg(jsonb_build_object('name',name,'logo_url',logo_url) order by name) from enjoy.vehicle_catalog_brands),'[]'::jsonb),
   'imports',coalesce((select jsonb_agg(to_jsonb(s) order by s.id desc) from (
    select distinct on (brand,vehicle_type,region) id,brand,vehicle_type,region,filename,created_at,jsonb_array_length(items) as count
    from enjoy.vehicle_catalog_imports order by brand,vehicle_type,region,id desc
   ) s),'[]'::jsonb));
 end if;
 if action='vehicle-catalog-read' then
  select items into result from enjoy.vehicle_catalog_imports where brand=brand_name and vehicle_type=kind and region=zone order by id desc limit 1;
  return coalesce(result,'[]'::jsonb);
 end if;
 if not admin then raise exception 'Solo el administrador puede modificar el catálogo.' using errcode='42501';end if;
 if action='vehicle-brand-save' then
  if char_length(brand_name) not between 1 and 80 or char_length(logo)>1000 or (logo<>'' and logo !~ '^https://upload[.]wikimedia[.]org/') then
   raise exception 'Revise el nombre o el logo de la marca.' using errcode='22023';
  end if;
  insert into enjoy.vehicle_catalog_brands(name,logo_url) values(brand_name,logo)
  on conflict(name) do update set logo_url=excluded.logo_url;
  return jsonb_build_object('name',brand_name);
 end if;
 if action='vehicle-catalog-import' then
  if not exists(select 1 from enjoy.vehicle_catalog_brands where name=brand_name) then raise exception 'Seleccione una marca registrada.' using errcode='22023'; end if;
  if not coalesce((kind='liviano' and zone='general') or (kind='pesado' and zone in ('sierra','costa')),false) then raise exception 'Seleccione el tipo y la región correctos.' using errcode='22023';end if;
  if jsonb_typeof(lines) is distinct from 'array' then raise exception 'Archivo sin partidas.' using errcode='22023';end if;
  if jsonb_array_length(lines) not between 1 and 2000 or octet_length(lines::text)>1500000 then raise exception 'Cargue entre 1 y 2.000 partidas por archivo.' using errcode='22023';end if;
  if exists(select 1 from jsonb_to_recordset(lines) as x(anio int,modelo text,version text,km int,codigo text,tipo text,descripcion text,cantidad numeric,precio numeric)
   where not coalesce(x.anio between 1900 and 2100 and char_length(btrim(x.modelo)) between 1 and 120 and char_length(btrim(x.version)) between 1 and 120
    and x.km between 0 and 2000000 and char_length(btrim(x.codigo)) between 1 and 80 and x.tipo in ('MO','R')
    and char_length(btrim(x.descripcion)) between 1 and 240 and x.cantidad>0 and x.cantidad<=100000 and x.precio between 0 and 1000000,false)) then
   raise exception 'Hay partidas con campos faltantes o valores fuera de rango.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_to_recordset(lines) as x(anio int,modelo text,version text,km int,codigo text,tipo text)
   group by anio,modelo,version,km,codigo,tipo having count(*)>1) then
   raise exception 'Hay códigos repetidos en un mismo plan.' using errcode='22023';
  end if;
  insert into enjoy.vehicle_catalog_imports(brand,vehicle_type,region,filename,items)
   values(brand_name,kind,zone,left(coalesce(payload->>'filename','Catálogo'),150),lines);
  return jsonb_build_object('imported',jsonb_array_length(lines));
 end if;
 raise exception 'Acción de catálogo no válida.' using errcode='22023';
end;
$$;
revoke execute on function enjoy.vehicle_catalog(text,jsonb,boolean) from public,anon,authenticated;

do $$
declare definition text; anchor text:='if action in (''catalog-service-save'',''catalog-import'')';
begin
 definition:=pg_get_functiondef('public.enjoy_api(text,jsonb)'::regprocedure);
 if strpos(definition,anchor)=0 then raise exception 'No se encontró el punto de integración del catálogo.';end if;
 execute replace(definition,anchor,
  E'if action in (''vehicle-catalog-index'',''vehicle-catalog-read'',''vehicle-brand-save'',''vehicle-catalog-import'') then return enjoy.vehicle_catalog(action,payload,u.role=''admin''); end if;\n '||anchor);
end;
$$;
notify pgrst,'reload schema';
