create table enjoy.user_allowed_ips (
 user_id uuid not null references auth.users(id) on delete cascade,
 ip inet not null,
 slot smallint not null check (slot in (1, 2)),
 created_at timestamptz not null default now(),
 primary key (user_id, ip),
 unique (user_id, slot),
 check (masklen(ip) = case family(ip) when 4 then 32 else 128 end)
);
alter table enjoy.user_allowed_ips enable row level security;
revoke all on enjoy.user_allowed_ips from public, anon, authenticated;

create function enjoy.assert_allowed_ip() returns void
language plpgsql volatile set search_path = '' as $$
declare
 caller uuid := auth.uid();
 headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
 client_ip inet;
 next_slot smallint;
begin
 if caller is null then
  raise exception 'Debe iniciar sesión.' using errcode = '42501';
 end if;
 begin
  client_ip := nullif(btrim(headers->>'cf-connecting-ip'), '')::inet;
 exception when invalid_text_representation then
  client_ip := null;
 end;
 if client_ip is null or masklen(client_ip) <> (case family(client_ip) when 4 then 32 else 128 end) then
  raise exception 'No se pudo verificar la IP de la conexión.' using errcode = '42501';
 end if;
 if exists(select 1 from enjoy.user_allowed_ips where user_id=caller and ip=client_ip) then
  return;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text, 713298));
 if exists(select 1 from enjoy.user_allowed_ips where user_id=caller and ip=client_ip) then
  return;
 end if;
 select s into next_slot
 from generate_series(1,2) s
 where not exists(select 1 from enjoy.user_allowed_ips where user_id=caller and slot=s)
 order by s limit 1;
 if next_slot is null then
  raise exception 'Acceso denegado: esta cuenta ya tiene dos IP autorizadas. Contacte al administrador.' using errcode = '42501';
 end if;
 insert into enjoy.user_allowed_ips(user_id, ip, slot) values(caller,client_ip,next_slot);
end;
$$;
revoke execute on function enjoy.assert_allowed_ip() from public, anon, authenticated;

-- The existing RPCs already run as postgres and keep their authorization checks.
do $$
declare entry regprocedure; definition text;
begin
 foreach entry in array array['public.enjoy_api(text,jsonb)'::regprocedure,'public.enjoy_chat(text,jsonb)'::regprocedure,'public.enjoy_orders(text,jsonb)'::regprocedure] loop
  definition := pg_get_functiondef(entry);
  if position(E'\nbegin\n' in definition)=0 then
   raise exception 'Cannot install the IP check in %',entry;
  end if;
  execute regexp_replace(definition, E'\nbegin\n', E'\nbegin\n perform enjoy.assert_allowed_ip();\n');
 end loop;
end;
$$;

notify pgrst, 'reload schema';
