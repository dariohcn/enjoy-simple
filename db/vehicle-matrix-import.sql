do $$
declare definition text;
begin
 definition:=pg_get_functiondef('enjoy.vehicle_catalog(text,jsonb,boolean)'::regprocedure);
 if strpos(definition,'jsonb_array_length(lines) not between 1 and 2000')=0 then
  raise exception 'No se encontró la validación anterior del catálogo.';
 end if;
 definition:=replace(definition,'jsonb_array_length(lines) not between 1 and 2000','jsonb_array_length(lines) not between 1 and 20000');
 definition:=replace(definition,'octet_length(lines::text)>1500000','octet_length(lines::text)>12000000');
 definition:=replace(definition,'entre 1 y 2.000 partidas','entre 1 y 20.000 partidas');
 definition:=replace(definition,'x.anio between 1900 and 2100','(x.anio is null or x.anio between 1900 and 2100)');
 definition:=replace(definition,'char_length(btrim(x.descripcion)) between 1 and 240','char_length(btrim(x.descripcion)) between 1 and 2500');
 definition:=replace(definition,'group by anio,modelo,version,km,codigo,tipo','where anio is not null group by anio,modelo,version,km,codigo,tipo');
 execute definition;
end;
$$;