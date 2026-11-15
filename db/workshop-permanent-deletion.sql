create or replace function enjoy.purge_workshop(target uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $purge$
declare
 owner_ids uuid[];
begin
 if not exists (select 1 from enjoy.profiles where id=auth.uid() and role='admin') then
  raise exception 'Permiso exclusivo del administrador.' using errcode='42501';
 end if;
 perform 1 from enjoy.workshops where id=target and deleted_at is not null for update;
 if not found then
  raise exception 'El taller debe estar en la pestaña Eliminados.' using errcode='22023';
 end if;
 if exists (select 1 from enjoy.profiles where workshop=target and role is distinct from 'owner') then
  raise exception 'El taller contiene una cuenta que no se puede eliminar.' using errcode='42501';
 end if;
 select coalesce(array_agg(id),'{}'::uuid[]) into owner_ids from enjoy.profiles where workshop=target;
 if exists (select 1 from storage.objects o where o.owner_id in (select id::text from unnest(owner_ids) as account(id))) then
  raise exception 'El taller tiene archivos en almacenamiento que requieren eliminación previa.';
 end if;
 delete from enjoy.partner_messages where sender=any(owner_ids) or recipient=any(owner_ids);
 delete from enjoy.audit where workshop=target or actor=any(owner_ids);
 delete from enjoy.reminders where workshop=target;
 delete from enjoy.work_orders where workshop=target;
 delete from enjoy.records where workshop=target;
 delete from enjoy.products where workshop=target;
 delete from auth.users where id=any(owner_ids);
 delete from enjoy.workshops where id=target;
 return jsonb_build_object('ok',true);
end;
$purge$;

revoke all on function enjoy.purge_workshop(uuid) from public, anon, authenticated;

do $dispatch$
declare
 definition text:=pg_get_functiondef('public.enjoy_api(text,jsonb)'::regprocedure);
 anchor text:=' if action in (''archive'',''restore'') then';
 dispatch text:=$branch$
 if action='purge-workshop' then
  if u.role<>'admin' then raise exception 'Permiso exclusivo del administrador.' using errcode='42501';end if;
  if payload->>'confirmation' is distinct from 'ELIMINAR' then raise exception 'Escriba ELIMINAR para confirmar.' using errcode='22023';end if;
  return enjoy.purge_workshop((payload->>'id')::uuid);
 end if;
$branch$;
begin
 if strpos(definition,dispatch)>0 then return; end if;
 if strpos(definition,anchor)=0 then raise exception 'No se encontró el bloque de gestión de talleres.'; end if;
 execute replace(definition,anchor,dispatch||anchor);
end;
$dispatch$;
