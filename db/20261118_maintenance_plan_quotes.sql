begin;
do $migration$
declare
 definition text := pg_get_functiondef('public.enjoy_api(text,jsonb)'::regprocedure);
 start_marker constant text := $marker$  result:='[]'::jsonb;
  for linked in select value from jsonb_array_elements(r->'quoteLines') loop$marker$;
 end_marker constant text := $marker$  r:=r||jsonb_build_object('services',result,'quoteSubtotal',(select sum((x->>'qty')::numeric*(x->>'price')::numeric) from jsonb_array_elements(r->'quoteLines') x));$marker$;
begin
 if strpos(definition,start_marker)=0 or strpos(definition,end_marker)=0 then
  raise exception 'No se encontró la validación de proformas esperada.';
 end if;
 definition:=replace(definition,start_marker,$patch$  if r->>'quoteSource'='maintenance-plan' then
   if r->>'status' is distinct from 'draft' then raise exception 'La proforma del plan debe guardarse como borrador.';end if;
   result:='[]'::jsonb;
   for linked in select value from jsonb_array_elements(r->'quoteLines') loop
    if jsonb_typeof(linked) is distinct from 'object'
       or coalesce(linked->>'kind','') not in ('service','product')
       or length(trim(coalesce(linked->>'name',''))) not between 1 and 2500
       or jsonb_typeof(linked->'qty') is distinct from 'number'
       or jsonb_typeof(linked->'price') is distinct from 'number'
    then raise exception 'Complete la descripción, cantidad y precio de cada partida.';end if;
    if (linked->>'qty')::numeric <= 0 or (linked->>'qty')::numeric > 100000
       or (linked->>'price')::numeric < 0 or (linked->>'price')::numeric > 1000000
    then raise exception 'Cantidad o precio fuera del rango permitido.';end if;
   end loop;
   r:=r||jsonb_build_object('services',result,'quoteSubtotal',(
    select sum(round((x->>'qty')::numeric*(x->>'price')::numeric,2)) from jsonb_array_elements(r->'quoteLines') x
   ));
  else
$patch$||start_marker);
 definition:=replace(definition,end_marker,end_marker||E'\n  end if;');
 execute definition;
end;
$migration$;
commit;