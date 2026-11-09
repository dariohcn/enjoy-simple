create table enjoy.admin_user_ips (
 user_id uuid primary key references auth.users(id) on delete cascade,
 ip1 inet,
 ip2 inet,
 approved_by uuid not null,
 updated_at timestamptz not null default now(),
 check (ip1 is null or masklen(ip1) = case family(ip1) when 4 then 32 else 128 end),
 check (ip2 is null or masklen(ip2) = case family(ip2) when 4 then 32 else 128 end),
 check (ip1 is null or ip2 is null or ip1 <> ip2)
);
alter table enjoy.admin_user_ips enable row level security;
revoke all on enjoy.admin_user_ips from public, anon, authenticated;

create or replace function enjoy.assert_allowed_ip() returns void
language plpgsql volatile set search_path = '' as $$
declare
 caller uuid := auth.uid();
 caller_role text;
 headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
 client_ip inet;
begin
 if caller is null then raise exception 'Debe iniciar sesión.' using errcode = '42501'; end if;
 select role into caller_role from enjoy.profiles where id = caller;
 if caller_role = 'admin' then return; end if;
 if caller_role is distinct from 'owner' then
  raise exception 'No existe un perfil autorizado.' using errcode = '42501';
 end if;
 begin
  client_ip := nullif(btrim(headers->>'cf-connecting-ip'), '')::inet;
 exception when invalid_text_representation then client_ip := null;
 end;
 if client_ip is null or masklen(client_ip) <> (case family(client_ip) when 4 then 32 else 128 end) then
  raise exception 'No se pudo verificar la IP de la conexión.' using errcode = '42501';
 end if;
 if not exists(select 1 from enjoy.admin_user_ips where user_id = caller and client_ip in (ip1, ip2)) then
  raise exception 'Esta IP no está autorizada. Pida al administrador que registre la IP pública de su conexión.' using errcode = '42501';
 end if;
end;
$$;

create function enjoy.manage_user_ips(action text, payload jsonb) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
 caller uuid := auth.uid();
 target_user uuid;
 addresses inet[] := array[]::inet[];
 address_text text;
 address inet;
begin
 if caller is null or not exists(select 1 from enjoy.profiles where id = caller and role = 'admin') then
  raise exception 'Solo el administrador puede gestionar las IP.' using errcode = '42501';
 end if;
 target_user := nullif(payload->>'user_id','')::uuid;
 if not exists(select 1 from enjoy.profiles where id = target_user and role = 'owner') then
  raise exception 'Seleccione un usuario de taller.' using errcode = '22023';
 end if;
 if action = 'user-ips-save' then
  if jsonb_typeof(payload->'ips') is distinct from 'array' then
   raise exception 'Indique las IP autorizadas.' using errcode = '22023';
  end if;
  if jsonb_array_length(payload->'ips') > 2 then
   raise exception 'Solo puede registrar dos IP por usuario.' using errcode = '22023';
  end if;
  for address_text in select jsonb_array_elements_text(payload->'ips') loop
   begin
    address := nullif(btrim(address_text),'')::inet;
   exception when invalid_text_representation then address := null;
   end;
   if address is null or masklen(address) <> (case family(address) when 4 then 32 else 128 end) then
    raise exception 'Ingrese direcciones IPv4 o IPv6 individuales.' using errcode = '22023';
   end if;
   if address = any(addresses) then raise exception 'Las IP deben ser distintas.' using errcode = '22023'; end if;
   addresses := array_append(addresses,address);
  end loop;
  insert into enjoy.admin_user_ips(user_id,ip1,ip2,approved_by)
  values(target_user,addresses[1],addresses[2],caller)
  on conflict(user_id) do update set ip1=excluded.ip1,ip2=excluded.ip2,approved_by=excluded.approved_by,updated_at=now();
 end if;
 return coalesce((select to_jsonb(array_remove(array[host(ip1),host(ip2)],null))
  from enjoy.admin_user_ips where user_id = target_user),'[]'::jsonb);
end;
$$;
revoke execute on function enjoy.manage_user_ips(text,jsonb) from public, anon, authenticated;

do $$
declare definition text;
begin
 definition := pg_get_functiondef('public.enjoy_api(text,jsonb)'::regprocedure);
 if position('perform enjoy.assert_allowed_ip();' in definition) = 0 then
  raise exception 'No se encontró el control de acceso existente.';
 end if;
 execute replace(definition,'perform enjoy.assert_allowed_ip();',
  E'perform enjoy.assert_allowed_ip();\n if action in (''user-ips-list'',''user-ips-save'') then return enjoy.manage_user_ips(action,payload); end if;');
end;
$$;
notify pgrst, 'reload schema';
