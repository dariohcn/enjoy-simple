create table if not exists enjoy.central_services (
 id text primary key default ('central-'||gen_random_uuid()::text),
 code text not null unique,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 active boolean not null default true,
 updated timestamptz not null default now()
);
alter table enjoy.central_services enable row level security;
revoke all on enjoy.central_services from public,anon,authenticated;
create or replace function enjoy.central_catalog(action text, payload jsonb default '{}')
returns jsonb language plpgsql set search_path='' as $body$
declare u enjoy.profiles; item jsonb; items jsonb; existing enjoy.central_services; rid text; price numeric; n int:=0; product_id uuid;
begin
 select * into u from enjoy.profiles where id=auth.uid();
 if not found or u.role<>'admin' then raise exception 'Operación exclusiva del administrador.' using errcode='42501'; end if;
 if action='catalog-service-save' then items:=jsonb_build_array(payload||'{"type":"service"}'::jsonb);
 elsif action='catalog-import' and jsonb_typeof(payload->'items')='array' then items:=payload->'items';
 else raise exception 'Operación de catálogo no válida.';end if;
 if jsonb_array_length(items) not between 1 and 500 then raise exception 'Cargue de 1 a 500 partidas.';end if;
 for item in select value from jsonb_array_elements(items) loop
  if item->>'type' not in ('service','product') or item->>'type' is null then raise exception 'Tipo de partida inválido.';end if;
  if length(trim(coalesce(item->>'code',''))) not between 1 and 80 or length(trim(coalesce(item->>'name',''))) not between 1 and 160 or length(trim(coalesce(item->>'category',''))) not between 1 and 100 then raise exception 'Revise código, nombre y categoría.';end if;
  if coalesce(item->>'price','') !~ '^[0-9]+([.][0-9]{1,2})?$' then raise exception 'El precio debe ser positivo con hasta dos decimales.';end if;
  price:=(item->>'price')::numeric;if price>10000000 then raise exception 'Precio fuera del límite.';end if;
  if item->>'type'='service' then
   select * into existing from enjoy.central_services where code=trim(item->>'code') for update;
   rid:=coalesce(existing.id,'central-'||gen_random_uuid()::text);
   item:=jsonb_build_object('id',rid,'code',trim(item->>'code'),'name',trim(item->>'name'),'category',trim(item->>'category'),'labor',price,'supplies',0,'discount',0,'central',true,'serviceType',coalesce(nullif(item->>'serviceType',''),'Diagnóstico'),'estimatedMinutes',coalesce(nullif(item->>'estimatedMinutes',''),'60')::integer);
   if item->>'serviceType' not in ('Mantenimiento preventivo','Mantenimiento correctivo','Diagnóstico','Inspección','Instalación y cambio') or (item->>'estimatedMinutes')::int not between 15 and 480 then raise exception 'Revise el tipo y la duración del servicio.';end if;
   insert into enjoy.central_services(id,code,payload) values(rid,item->>'code',item) on conflict(code) do update set payload=excluded.payload,updated=now();
  else
   select id into product_id from enjoy.products where workshop is null and sku=item->>'code' order by updated desc limit 1;
   perform enjoy.product_action('product-save',jsonb_build_object('id',product_id,'name',item->>'name','sku',item->>'code','category',item->>'category','price',price,'stock',coalesce(nullif(item->>'stock',''),(select stock::text from enjoy.products where id=product_id),'0'),'image',coalesce((select image from enjoy.products where id=product_id),''),'active',true,'unit',coalesce((select attributes->>'unit' from enjoy.products where id=product_id),'Unidad'),'partType',coalesce((select attributes->>'partType' from enjoy.products where id=product_id),'Repuesto')));
  end if;
  n:=n+1;
 end loop;
 insert into enjoy.audit(actor,action) values(u.id,'Catálogo central: '||n||' partidas guardadas');
 return jsonb_build_object('ok',true,'imported',n);
end $body$;
revoke all on function enjoy.central_catalog(text,jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.enjoy_api(action text, payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u enjoy.profiles;w enjoy.workshops;r jsonb;old jsonb;linked jsonb;result jsonb;coll text;rid text;k text;sid text;required text[];target uuid;stamp timestamptz;minutes integer;
begin
 if auth.uid() is null then raise exception 'Debe iniciar sesión.' using errcode='42501';end if;
 select * into u from enjoy.profiles where id=auth.uid();if not found then raise exception 'No existe un perfil autorizado.' using errcode='42501';end if;
 if u.role='owner' then
  select * into w from enjoy.workshops where id=u.workshop;
  if w.deleted_at is not null then raise exception 'El taller fue retirado de la plataforma. Consulte al administrador.' using errcode='42501';end if;
  if w.status<>'approved' then raise exception '%',case when w.status='pending' then 'Su solicitud está pendiente de aprobación.' else 'Su solicitud fue rechazada.' end using errcode='42501';end if;
 end if;
 if action in ('catalog-service-save','catalog-import') then return enjoy.central_catalog(action,payload);end if;
 if action in ('product-save','product-remove','product-permission','workshop-image') then return enjoy.product_action(action,payload);end if;
 if action='session' then return jsonb_build_object('email',u.email,'role',u.role,'workshop',w.name);end if;
 if action='data' then
  result:=jsonb_build_object('workshopId',u.workshop,'workshopImage',coalesce(w.image,''),'productPermission',case when u.role='admin' then 'manage' else w.product_permission end,'products',coalesce((select jsonb_agg(to_jsonb(p)) from (select * from enjoy.products where u.role='admin' or workshop is null or workshop=u.workshop order by updated desc limit 200)p),'[]'::jsonb));
  foreach coll in array array['clients','vehicles','appointments','plans','services','requests'] loop
   result:=result||jsonb_build_object(coll,coalesce((select jsonb_agg(x.payload order by x.updated,x.id) from enjoy.records x where x.workshop=u.workshop and x.collection=coll),'[]'));
  end loop;
  result:=result||jsonb_build_object('services',coalesce(result->'services','[]'::jsonb)||coalesce((select jsonb_agg(c.payload||jsonb_build_object('active',c.active) order by c.code) from enjoy.central_services c where c.active or u.role='admin'),'[]'::jsonb));
  result:=result||jsonb_build_object('catalogAllowed',u.role='admin' or w.catalog,'whatsappConnected',(select whatsapp_live from enjoy.settings where id),'workshopContact',case when u.role='owner' then jsonb_build_object('phone',w.phone,'whatsapp_optin',w.whatsapp_optin) else null end,
   'activity',coalesce((select jsonb_agg(to_jsonb(t)) from (select a.action,a.created from enjoy.audit a where a.workshop is not distinct from u.workshop order by a.id desc limit 30)t),'[]'),
   'reminders',coalesce((select jsonb_agg(to_jsonb(t)) from (select j.id,j.appointment,j.role,extract(epoch from j.due) as due,j.status,j.error from enjoy.reminders j where u.role='admin' or j.workshop=u.workshop order by j.due desc limit 100)t),'[]'));
  if u.role='admin' then
   result:=result||jsonb_build_object('monitor',enjoy.admin_monitor());
   result:=result||jsonb_build_object('workshops',coalesce((select jsonb_agg(to_jsonb(t)) from (select x.*,coalesce((select jsonb_object_agg(c.collection,c.n) from (select collection,count(*) n from enjoy.records where workshop=x.id group by collection)c),'{}') counts from enjoy.workshops x order by x.created)t),'[]'),
   'users',coalesce((select jsonb_agg(to_jsonb(t)) from (select p.id,p.email,p.role,p.workshop,x.name as "workshopName",x.owner as name,x.status from enjoy.profiles p left join enjoy.workshops x on p.workshop=x.id order by p.role,p.email)t),'[]'));
  end if;return result;
 end if;

 if action in ('archive','restore') then
  if u.role<>'admin' then raise exception 'Permiso exclusivo del administrador.' using errcode='42501';end if;
  target:=(payload->>'id')::uuid;
  perform 1 from enjoy.workshops where id=target for update;
  if action='archive' then
   update enjoy.workshops set deleted_at=now() where id=target and status='approved' and deleted_at is null;
   if not found then raise exception 'El taller debe estar autorizado y activo.';end if;
   update enjoy.reminders set status='cancelled',error='Taller retirado de la red.',updated=now() where workshop=target and status in ('queued','blocked');
  else
   update enjoy.workshops set deleted_at=null where id=target and deleted_at is not null;
   if not found then raise exception 'El taller no se encuentra eliminado.';end if;
  end if;
  insert into enjoy.audit(workshop,actor,action) values(target,u.id,case when action='archive' then 'Taller eliminado de la red' else 'Taller restaurado en la red' end);
  return '{"ok":true}';
 end if;
 if action in ('decision','permission') then
  if u.role<>'admin' then raise exception 'Permiso exclusivo del administrador.' using errcode='42501';end if;
  target:=(payload->>'id')::uuid;perform 1 from enjoy.workshops where id=target and deleted_at is null for update;if not found then raise exception 'No existe el taller.';end if;
  if action='decision' then
   if payload->>'status' is null or payload->>'status' not in ('approved','rejected') then raise exception 'Estado inválido.';end if;
   update enjoy.workshops set status=payload->>'status' where id=target;
  else
   if jsonb_typeof(payload->'catalog') is distinct from 'boolean' then raise exception 'Permiso inválido.';end if;
   update enjoy.workshops set catalog=(payload->>'catalog')::boolean where id=target and status='approved';if not found then raise exception 'El taller debe estar autorizado.';end if;
  end if;
  insert into enjoy.audit(actor,action) values(u.id,'Permisos de taller actualizados');return '{"ok":true}';
 end if;
 if u.role<>'owner' then raise exception 'Operación exclusiva del propietario del taller.' using errcode='42501';end if;
 perform 1 from enjoy.workshops where id=u.workshop for update;
 if action='workshop-contact' then
  k:=regexp_replace(coalesce(payload->>'phone',''),'[^0-9]','','g');if k !~ '^[1-9][0-9]{7,14}$' then raise exception 'Ingrese un número con código de país.';end if;
  update enjoy.workshops set phone=k,whatsapp_optin=coalesce(payload->>'whatsappOptIn','false')='true' where id=u.workshop;return '{"ok":true}';
 end if;
 if action<>'save' then raise exception 'Operación no disponible.';end if;
 coll:=payload->>'collection';r:=payload->'record';rid:=coalesce(nullif(r->>'id',''),gen_random_uuid()::text);r:=r||jsonb_build_object('id',rid);
 if coll is null or coll not in ('clients','vehicles','appointments','plans','services','requests') then raise exception 'Registro no permitido.';end if;
 if jsonb_typeof(r) is distinct from 'object' or octet_length(r::text)>50000 then raise exception 'Registro inválido.';end if;
 if rid is null or rid !~ '^[A-Za-z0-9_-]{1,80}$' then raise exception 'Identificador inválido.';end if;
 perform 1 from enjoy.records where workshop=u.workshop and id=rid and collection<>coll;if found then raise exception 'Identificador ya utilizado.';end if;
 if coll='services' and exists(select 1 from enjoy.central_services c where c.id=rid) then raise exception 'El catálogo central solo se administra desde su sección correspondiente.' using errcode='42501';end if;
 if coll='services' and not w.catalog then raise exception 'El administrador no ha habilitado la edición del catálogo.' using errcode='42501';end if;
 required:=case coll when 'clients' then array['name'] when 'vehicles' then array['plate','brand','model','clientId'] when 'appointments' then array['clientId','vehicleId','date','time','reason'] when 'plans' then array['vehicleId','service'] when 'services' then array['name','category'] else array['clientId','vehicleId','status','services'] end;
 foreach k in array required loop if coalesce(trim(r->>k),'')='' then raise exception 'Complete los datos requeridos.';end if;end loop;
 if r ? 'clientId' then perform 1 from enjoy.records where workshop=u.workshop and collection='clients' and id=r->>'clientId';if not found then raise exception 'El cliente no pertenece al taller.' using errcode='42501';end if;end if;
 if r ? 'vehicleId' then
  select x.payload into linked from enjoy.records x where workshop=u.workshop and collection='vehicles' and id=r->>'vehicleId';if not found then raise exception 'El vehículo no pertenece al taller.' using errcode='42501';end if;
  if r ? 'clientId' and linked->>'clientId'<>r->>'clientId' then raise exception 'El vehículo no pertenece al cliente seleccionado.';end if;
 end if;
 if coll='clients' then
  if r ? 'whatsappOptIn' and jsonb_typeof(r->'whatsappOptIn') is distinct from 'boolean' then raise exception 'Revise la autorización de mensajes.';end if;
  if coalesce(r->>'whatsappOptIn','false')='true' and regexp_replace(coalesce(r->>'phone',''),'[^0-9]','','g') !~ '^[1-9][0-9]{7,14}$' then raise exception 'Ingrese WhatsApp con código de país.';end if;
 end if;
 if coll='vehicles' then
  if coalesce(r->>'km','0') !~ '^\d+(\.\d+)?$' then raise exception 'El kilometraje no puede ser negativo.';end if;
  perform 1 from enjoy.records x where x.workshop=u.workshop and x.collection='vehicles' and x.id<>rid and upper(x.payload->>'plate')=upper(r->>'plate');if found then raise exception 'El vehículo ya está registrado.';end if;
  select x.payload into old from enjoy.records x where x.workshop=u.workshop and x.id=rid;
  if old is not null and old->>'clientId'<>r->>'clientId' then raise exception 'El cambio de propietario requiere conservar el historial. Registre otra ficha.';end if;
 end if;
 if coll='appointments' then
  if r->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or r->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Fecha u hora inválida.';end if;
  stamp:=((r->>'date')::date+(r->>'time')::time) at time zone 'America/Guayaquil';minutes:=coalesce(r->>'duration','60')::integer;r:=r||jsonb_build_object('duration',minutes,'status',coalesce(r->>'status','scheduled'));
  if minutes not between 15 and 480 or r->>'status' not in ('scheduled','arrived','done','cancelled') then raise exception 'Revise duración y estado.';end if;
  if r->>'status' not in ('done','cancelled') then
   perform 1 from enjoy.records x where x.workshop=u.workshop and x.collection='appointments' and x.id<>rid and x.payload->>'vehicleId'=r->>'vehicleId' and x.payload->>'status' not in ('done','cancelled')
   and tstzrange((((x.payload->>'date')::date+(x.payload->>'time')::time) at time zone 'America/Guayaquil'),(((x.payload->>'date')::date+(x.payload->>'time')::time) at time zone 'America/Guayaquil')+coalesce(x.payload->>'duration','60')::integer*interval '1 minute','[)') && tstzrange(stamp,stamp+minutes*interval '1 minute','[)');
   if found then raise exception 'El vehículo ya tiene una cita en ese horario.';end if;
  end if;
 end if;
 if coll='plans' then
  if coalesce(r->>'date','')='' and coalesce(r->>'km','')='' then raise exception 'Indique fecha o kilometraje.';end if;
  if coalesce(r->>'date','')<>'' then perform (r->>'date')::date;end if;
  if coalesce(r->>'km','')<>'' and r->>'km' !~ '^\d+(\.\d+)?$' then raise exception 'El kilometraje no puede ser negativo.';end if;
 end if;
 if coll='services' then
  foreach k in array array['supplies','labor','discount'] loop if coalesce(r->>k,'0') !~ '^\d+(\.\d+)?$' then raise exception 'Los valores deben ser números positivos.';end if;end loop;
  if coalesce(r->>'discount','0')::numeric>100 then raise exception 'El descuento máximo es 100%%.';end if;
 end if;

 if coll in ('requests','appointments') and r ? 'associatedProducts' then
  if jsonb_typeof(r->'associatedProducts')='string' then r:=jsonb_set(r,'{associatedProducts}',(r->>'associatedProducts')::jsonb);end if;
  if jsonb_typeof(r->'associatedProducts') is distinct from 'array' or jsonb_array_length(r->'associatedProducts')>100 then raise exception 'Lista de productos inválida.';end if;
  for linked in select value from jsonb_array_elements(r->'associatedProducts') loop
   if coalesce(linked->>'qty','') !~ '^[0-9]+$' or (linked->>'qty')::int not between 1 and 999 then raise exception 'Cantidad de producto inválida.';end if;
   perform 1 from enjoy.products p where p.id::text=linked->>'id' and p.active and (p.workshop is null or p.workshop=u.workshop);
   if not found then raise exception 'Producto no disponible para este taller.';end if;
  end loop;
 end if;
 if coll='appointments' and r ? 'catalogueServiceId' then
  perform 1 from enjoy.records where workshop=u.workshop and collection='services' and id=r->>'catalogueServiceId';
  if not found and not exists(select 1 from enjoy.central_services c where c.id=r->>'catalogueServiceId' and c.active) then raise exception 'Servicio no disponible para este taller.';end if;
 end if;
 if coll='requests' and r->>'kind'='proforma' then
  if jsonb_typeof(r->'quoteLines') is distinct from 'array' or jsonb_array_length(r->'quoteLines') not between 1 and 100 then raise exception 'La proforma requiere de 1 a 100 partidas.';end if;
  result:='[]'::jsonb;
  for linked in select value from jsonb_array_elements(r->'quoteLines') loop
   if coalesce(linked->>'qty','') !~ '^[0-9]+$' or (linked->>'qty')::int not between 1 and 999 or coalesce(linked->>'price','') !~ '^[0-9]+([.][0-9]{1,2})?$' then raise exception 'Cantidad o precio inválido.';end if;
   if linked->>'kind'='service' then
    select x.payload into old from enjoy.records x where x.workshop=u.workshop and x.collection='services' and x.id=linked->>'id';
    if not found then select c.payload into old from enjoy.central_services c where c.id=linked->>'id' and c.active;end if;
    if old is null then raise exception 'Servicio no disponible.';end if;
    if round((coalesce(old->>'labor','0')::numeric+coalesce(old->>'supplies','0')::numeric)*(1-coalesce(old->>'discount','0')::numeric/100),2)<>(linked->>'price')::numeric then raise exception 'El precio del servicio cambió. Quite y agregue nuevamente la partida.';end if;
    result:=result||jsonb_build_array(linked->>'id');
   elsif linked->>'kind'='product' then
    perform 1 from enjoy.products p where p.id::text=linked->>'id' and p.active and (p.workshop is null or p.workshop=u.workshop) and p.price=(linked->>'price')::numeric;
    if not found then raise exception 'El producto o su precio ya no está disponible. Actualice la partida.';end if;
   else raise exception 'Tipo de partida inválido.';end if;
  end loop;
  r:=r||jsonb_build_object('services',result,'quoteSubtotal',(select sum((x->>'qty')::numeric*(x->>'price')::numeric) from jsonb_array_elements(r->'quoteLines') x));
 end if;
 if coll='requests' then
  if r->>'status' not in ('draft','confirmed') or jsonb_typeof(r->'services') is distinct from 'array' then raise exception 'Solicitud inválida.';end if;
  select x.payload into old from enjoy.records x where x.workshop=u.workshop and x.id=rid;if old->>'status'='confirmed' then raise exception 'La solicitud confirmada no puede modificarse.';end if;
  for sid in select jsonb_array_elements_text(r->'services') loop perform 1 from enjoy.records where workshop=u.workshop and collection='services' and id=sid; if not found and not exists(select 1 from enjoy.central_services c where c.id=sid and c.active) then raise exception 'Servicio no autorizado.';end if;end loop;
 end if;
 insert into enjoy.records(workshop,collection,id,payload) values(u.workshop,coll,rid,r) on conflict(workshop,id) do update set payload=excluded.payload,updated=now();
 if coll='appointments' then perform enjoy.sync(u.workshop,r);end if;
 insert into enjoy.audit(workshop,actor,action) values(u.workshop,u.id,'Registro actualizado: '||coll);return '{"ok":true}';
end $function$;
