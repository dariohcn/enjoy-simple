begin;
create table enjoy.whatsapp_platform (
 id boolean primary key default true check (id),
 app_id text not null default '',
 config_id text not null default '',
 api_version text not null default '',
 updated timestamptz not null default now()
);
insert into enjoy.whatsapp_platform(id) values(true);
create table enjoy.whatsapp_connections (
 workshop uuid primary key references enjoy.workshops(id),
 phone_id text not null unique check(phone_id ~ '^[0-9]{4,40}$'),
 account_id text not null check(account_id ~ '^[0-9]{4,40}$'),
 display_phone text not null,
 secret_id uuid not null,
 expires_at timestamptz,
 template_name text not null default 'enjoy_recordatorio_cita_v1',
 template_status text not null default 'PENDING',
 contacts_synced boolean not null default false,
 history_synced boolean not null default false,
 connected boolean not null default false,
 updated timestamptz not null default now()
);
create table enjoy.whatsapp_attempts (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references enjoy.profiles(id),
 workshop uuid not null references enjoy.workshops(id),
 created timestamptz not null default now(),
 state text not null default 'pending' check(state in ('pending','processing','complete','failed'))
);
alter table enjoy.whatsapp_platform enable row level security;
alter table enjoy.whatsapp_connections enable row level security;
alter table enjoy.whatsapp_attempts enable row level security;
revoke all on enjoy.whatsapp_platform,enjoy.whatsapp_connections,enjoy.whatsapp_attempts from public,anon,authenticated;

create function public.enjoy_whatsapp(action text,payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare me enjoy.profiles; cfg enjoy.whatsapp_platform; result jsonb; attempt uuid;
begin
 perform enjoy.assert_allowed_ip();
 select * into me from enjoy.profiles where id=auth.uid();
 if not found then raise exception 'Debe iniciar sesión.' using errcode='42501';end if;
 if me.role='owner' and not exists(select 1 from enjoy.workshops where id=me.workshop and status='approved' and deleted_at is null)
 then raise exception 'No existe un taller autorizado.' using errcode='42501';end if;
 if action='whatsapp-config-save' then
  if me.role<>'admin' then raise exception 'Permiso denegado.' using errcode='42501';end if;
  if coalesce(payload->>'appId','') !~ '^[0-9]{4,40}$' or coalesce(payload->>'configId','') !~ '^[0-9]{4,40}$'
   or coalesce(payload->>'apiVersion','') !~ '^v[0-9]{1,3}[.][0-9]{1,2}$' then raise exception 'Revise los identificadores y la versión de la API.';end if;
  if exists(select 1 from enjoy.whatsapp_connections) and exists(
   select 1 from enjoy.whatsapp_platform where app_id<>payload->>'appId'
  ) then raise exception 'Desconecte los talleres antes de cambiar la aplicación.';end if;
  update enjoy.whatsapp_platform set app_id=payload->>'appId',config_id=payload->>'configId',
   api_version=payload->>'apiVersion',updated=now() where id;
 elsif action='whatsapp-begin' then
  if me.role<>'owner' then raise exception 'Ingrese como propietario del taller.' using errcode='42501';end if;
  select * into cfg from enjoy.whatsapp_platform where id;
  if cfg.app_id='' or cfg.config_id='' or cfg.api_version='' then raise exception 'El administrador debe habilitar la conexión de WhatsApp.';end if;
  delete from enjoy.whatsapp_attempts where created<now()-interval '1 day';
  if (select count(*) from enjoy.whatsapp_attempts where owner_id=me.id and created>now()-interval '10 minutes')>=5 then
   raise exception 'Espere unos minutos antes de volver a conectar.';end if;
  insert into enjoy.whatsapp_attempts(owner_id,workshop) values(me.id,me.workshop) returning id into attempt;
 elsif action='whatsapp-disconnect' then
  if me.role<>'owner' then raise exception 'Ingrese como propietario del taller.' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(me.workshop::text,0));
  delete from vault.secrets where id in(select secret_id from enjoy.whatsapp_connections where workshop=me.workshop);
  delete from enjoy.whatsapp_connections where workshop=me.workshop;
  update enjoy.whatsapp_attempts set state='failed' where workshop=me.workshop and state in ('pending','processing');
  update enjoy.reminders set status='blocked',error='Conecte el WhatsApp del taller.',updated=now()
   where workshop=me.workshop and status='queued';
 elsif action<>'whatsapp-status' then raise exception 'Operación no disponible.';end if;
 select * into cfg from enjoy.whatsapp_platform where id;
 result:=jsonb_build_object('appId',cfg.app_id,'configId',cfg.config_id,'apiVersion',cfg.api_version,'attemptId',attempt);
 if me.role='admin' then
  return result||jsonb_build_object('connections',coalesce((
   select jsonb_agg(jsonb_build_object('workshop',w.name,'phone',c.display_phone,'connected',
    c.connected and (c.expires_at is null or c.expires_at>now()),
    'templateStatus',c.template_status,'expiresAt',c.expires_at) order by w.name)
   from enjoy.whatsapp_connections c join enjoy.workshops w on w.id=c.workshop
  ),'[]'::jsonb));
 end if;
 return result||jsonb_build_object('connection',(
  select jsonb_build_object('phone',display_phone,'connected',connected and (expires_at is null or expires_at>now()),
    'templateStatus',template_status,'expiresAt',expires_at,'updated',updated)
  from enjoy.whatsapp_connections where workshop=me.workshop
 ));
end;$$;
revoke all on function public.enjoy_whatsapp(text,jsonb) from public,anon,authenticated;
grant execute on function public.enjoy_whatsapp(text,jsonb) to authenticated;

create function public.enjoy_whatsapp_server(action text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt enjoy.whatsapp_attempts; connection enjoy.whatsapp_connections; secret uuid; target uuid; cfg enjoy.whatsapp_platform;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Permiso denegado.' using errcode='42501';end if;
 select * into cfg from enjoy.whatsapp_platform where id;
 if action='settings' then return to_jsonb(cfg);end if;
 if action='authorize' then
  select * into attempt from enjoy.whatsapp_attempts
   where id=(payload->>'attemptId')::uuid and owner_id=(payload->>'userId')::uuid
    and state='pending' and created>now()-interval '10 minutes' for update;
  if not found then raise exception 'La autorización venció. Vuelva a conectar WhatsApp.';end if;
  if not exists(select 1 from enjoy.profiles p join enjoy.workshops w on w.id=p.workshop
   where p.id=attempt.owner_id and p.role='owner' and p.workshop=attempt.workshop and w.status='approved' and w.deleted_at is null)
   then raise exception 'No existe un taller autorizado.';end if;
  update enjoy.whatsapp_attempts set state='processing' where id=attempt.id;
  return jsonb_build_object('workshop',attempt.workshop)||to_jsonb(cfg);
 end if;
 if action='fail' then
  update enjoy.whatsapp_attempts set state='failed' where id=(payload->>'attemptId')::uuid and state='processing';
  return '{}'::jsonb;
 end if;
 if action='complete' then
  select * into attempt from enjoy.whatsapp_attempts where id=(payload->>'attemptId')::uuid and state='processing'
    and created>now()-interval '15 minutes' for update;
  if not found then raise exception 'La conexión venció. Vuelva a intentarlo.';end if;
  perform pg_advisory_xact_lock(hashtextextended(attempt.workshop::text,0));
  if exists(select 1 from enjoy.whatsapp_connections where phone_id=payload->>'phoneId' and workshop<>attempt.workshop)
    then raise exception 'Este número ya está vinculado a otro taller.';end if;
  select * into connection from enjoy.whatsapp_connections where workshop=attempt.workshop for update;
  if length(coalesce(payload->>'token','')) not between 20 and 12000 then raise exception 'Credencial inválida.';end if;
  if connection.secret_id is null then
   select vault.create_secret(payload->>'token','enjoy-whatsapp-'||attempt.workshop::text,'WhatsApp del taller') into secret;
  else
   secret:=connection.secret_id;
   perform vault.update_secret(secret,payload->>'token');
  end if;
  insert into enjoy.whatsapp_connections(workshop,phone_id,account_id,display_phone,secret_id,expires_at,template_status,connected)
  values(attempt.workshop,payload->>'phoneId',payload->>'accountId',payload->>'phone',secret,
   nullif(payload->>'expiresAt','')::timestamptz,payload->>'templateStatus',
   false)
  on conflict(workshop) do update set phone_id=excluded.phone_id,account_id=excluded.account_id,display_phone=excluded.display_phone,
   secret_id=excluded.secret_id,expires_at=excluded.expires_at,template_status=excluded.template_status,
   contacts_synced=case when enjoy.whatsapp_connections.phone_id=excluded.phone_id then enjoy.whatsapp_connections.contacts_synced else false end,
   history_synced=case when enjoy.whatsapp_connections.phone_id=excluded.phone_id then enjoy.whatsapp_connections.history_synced else false end,
   connected=false,updated=now();
  update enjoy.whatsapp_attempts set state='complete' where id=attempt.id;
  return '{}'::jsonb;
 end if;
 if action='credentials' then
  select p.workshop into target from enjoy.profiles p join enjoy.workshops w on w.id=p.workshop
   where p.id=(payload->>'userId')::uuid and p.role='owner' and w.status='approved' and w.deleted_at is null;
  select * into connection from enjoy.whatsapp_connections where workshop=target;
  if not found then raise exception 'Conecte primero el WhatsApp de su taller.';end if;
  return jsonb_build_object('workshop',target,'token',(select decrypted_secret from vault.decrypted_secrets where id=connection.secret_id),
   'phoneId',connection.phone_id,'accountId',connection.account_id,'apiVersion',cfg.api_version,
   'appId',cfg.app_id,'contactsSynced',connection.contacts_synced,'historySynced',connection.history_synced,'templateName',connection.template_name,'expiresAt',connection.expires_at);
 end if;
 if action='sync-complete' then
  update enjoy.whatsapp_connections set contacts_synced=contacts_synced or payload->>'kind'='smb_app_state_sync',
    history_synced=history_synced or payload->>'kind'='history',updated=now() where workshop=(payload->>'workshop')::uuid;
  return '{}'::jsonb;
 end if;
 if action='template-status' then
  update enjoy.whatsapp_connections set template_status=payload->>'status',connected=payload->>'status'='APPROVED' and contacts_synced and history_synced,updated=now()
   where workshop=(payload->>'workshop')::uuid;
  return '{}'::jsonb;
 end if;
 if action='webhook' then
  if payload->>'field'='message_template_status_update' then
   update enjoy.whatsapp_connections set template_status=payload->>'status',connected=payload->>'status'='APPROVED',updated=now()
    where account_id=payload->>'accountId' and template_name=payload->>'templateName';
  elsif payload->>'field'='account_update' and payload->>'event'='PARTNER_REMOVED' then
   update enjoy.whatsapp_connections set connected=false,template_status='DISCONNECTED',updated=now()
    where account_id=payload->>'accountId';
  elsif payload->>'field'='messages' then
   if payload->>'status' not in ('sent','delivered','read','failed') then return '{}'::jsonb;end if;
   if exists(select 1 from enjoy.whatsapp_connections where account_id=payload->>'accountId' and phone_id=payload->>'phoneId') then
    insert into enjoy.whatsapp_receipts(message_id,phone_id,account_id,status)
    values(payload->>'messageId',payload->>'phoneId',payload->>'accountId',payload->>'status')
    on conflict(message_id) do update set status=case
     when enjoy.whatsapp_receipts.status='read' or excluded.status='read' then 'read'
     when enjoy.whatsapp_receipts.status='delivered' or excluded.status='delivered' then 'delivered'
     else excluded.status end,updated=now();
   end if;
   update enjoy.reminders j set status=case
    when payload->>'status'='read' then 'read'
    when payload->>'status'='delivered' and j.status<>'read' then 'delivered'
    when payload->>'status'='failed' and j.status not in ('read','delivered') then 'failed'
    else j.status end,error=case when payload->>'status'='failed' then 'El proveedor informó que el mensaje no fue entregado.' else j.error end,updated=now()
   from enjoy.whatsapp_connections c where j.workshop=c.workshop and c.account_id=payload->>'accountId'
    and c.phone_id=payload->>'phoneId' and j.message_id=payload->>'messageId';
  end if;
  return '{}'::jsonb;
 end if;
 raise exception 'Operación no disponible.';
end;$$;
revoke all on function public.enjoy_whatsapp_server(text,jsonb) from public,anon,authenticated;
grant execute on function public.enjoy_whatsapp_server(text,jsonb) to service_role;

create table enjoy.whatsapp_receipts (
 message_id text primary key,
 phone_id text not null,
 account_id text not null,
 status text not null check(status in ('sent','delivered','read','failed')),
 updated timestamptz not null default now()
);
alter table enjoy.whatsapp_receipts enable row level security;
revoke all on enjoy.whatsapp_receipts from public,anon,authenticated;
create function enjoy.apply_whatsapp_receipt() returns trigger language plpgsql security definer set search_path='' as $$
declare receipt enjoy.whatsapp_receipts;
begin
 select e.* into receipt from enjoy.whatsapp_receipts e join enjoy.whatsapp_connections c
  on c.account_id=e.account_id and c.phone_id=e.phone_id and c.workshop=new.workshop
  where e.message_id=new.message_id;
 if found then
  if receipt.status='read' then new.status:='read';
  elsif receipt.status='delivered' and new.status<>'read' then new.status:='delivered';
  elsif receipt.status='failed' and new.status not in ('read','delivered') then
   new.status:='failed';new.error:='El proveedor informó que el mensaje no fue entregado.';
  end if;
 end if;
 return new;
end;$$;
revoke all on function enjoy.apply_whatsapp_receipt() from public,anon,authenticated;
create trigger apply_whatsapp_receipt before update of message_id,status on enjoy.reminders
 for each row when(new.message_id is not null) execute function enjoy.apply_whatsapp_receipt();
create index whatsapp_receipts_updated_idx on enjoy.whatsapp_receipts(updated);
select cron.schedule('enjoy-whatsapp-connection-cleanup','17 3 * * *',$job$
 delete from enjoy.whatsapp_receipts where updated<now()-interval '14 days';
 delete from enjoy.whatsapp_attempts where created<now()-interval '1 day';
$job$);
alter table enjoy.reminders drop constraint reminders_status_check;
alter table enjoy.reminders add constraint reminders_status_check check (
 status in ('queued','blocked','sending','accepted','delivered','read','failed','uncertain','cancelled','expired')
);

create or replace function public.enjoy_claim_reminders(live_mode boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j enjoy.reminders; w enjoy.workshops; a jsonb; c jsonb; v jsonb; channel enjoy.whatsapp_connections;
 phone text; secret text; result jsonb:='[]'; version text;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Permiso denegado.' using errcode='42501';end if;
 select api_version into version from enjoy.whatsapp_platform where id;
 update enjoy.settings set whatsapp_live=exists(select 1 from enjoy.whatsapp_connections
  where connected and (expires_at is null or expires_at>now())) where id;
 update enjoy.reminders set status='uncertain',error='Procesamiento interrumpido; requiere revisión.',updated=now()
  where status='sending' and updated<now()-interval '5 minutes';
 update enjoy.reminders set status='expired',updated=now() where status in ('queued','blocked') and appointment_at<=now();
 for j in select * from enjoy.reminders where status in ('queued','blocked') and due<=now() and appointment_at>now()
  order by due for update skip locked limit 20 loop
  select * into w from enjoy.workshops where id=j.workshop;
  select payload into a from enjoy.records where workshop=j.workshop and collection='appointments' and id=j.appointment;
  if a is null or a->>'status' in ('done','cancelled') or w.deleted_at is not null or w.status<>'approved'
   or (((a->>'date')::date+(a->>'time')::time) at time zone 'America/Guayaquil')<>j.appointment_at then
   update enjoy.reminders set status='cancelled',updated=now() where id=j.id;continue;
  end if;
  select * into channel from enjoy.whatsapp_connections where workshop=j.workshop;
  if channel.workshop is null or not channel.connected or channel.expires_at<=now() then
   update enjoy.reminders set status='blocked',error='Conecte el WhatsApp del taller y compruebe la aprobación del recordatorio.',updated=now()
    where id=j.id;continue;
  end if;
  select payload into c from enjoy.records where workshop=j.workshop and collection='clients' and id=a->>'clientId';
  select payload into v from enjoy.records where workshop=j.workshop and collection='vehicles' and id=a->>'vehicleId';
  phone:=regexp_replace(case when j.role='owner' then w.phone else coalesce(c->>'phone','') end,'[^0-9]','','g');
  if phone !~ '^[1-9][0-9]{7,14}$' or not(case when j.role='owner' then w.whatsapp_optin else coalesce(c->>'whatsappOptIn','false')='true' end) then
   update enjoy.reminders set status='blocked',error='Falta un contacto válido o su autorización.',updated=now() where id=j.id;continue;
  end if;
  if phone=regexp_replace(channel.display_phone,'[^0-9]','','g') then
   update enjoy.reminders set status='blocked',error='El recordatorio al propietario requiere un número diferente del emisor.',updated=now() where id=j.id;continue;
  end if;
  select decrypted_secret into secret from vault.decrypted_secrets where id=channel.secret_id;
  if secret is null then
   update enjoy.reminders set status='blocked',error='Vuelva a conectar el WhatsApp del taller.',updated=now() where id=j.id;continue;
  end if;
  update enjoy.reminders set status='sending',error='',updated=now() where id=j.id;
  result:=result||jsonb_build_array(jsonb_build_object('id',j.id,'phone',phone,'phoneId',channel.phone_id,
   'token',secret,'apiVersion',version,'templateName',channel.template_name,'language','es',
   'parameters',jsonb_build_array(w.name,coalesce(c->>'name','Cliente'),coalesce(v->>'plate','Sin placa'),
    to_char((a->>'date')::date,'DD/MM/YYYY'),a->>'time',coalesce(a->>'reason','Mantenimiento'))));
 end loop;return result;
end;$$;
revoke all on function public.enjoy_claim_reminders(boolean) from public,anon,authenticated;
grant execute on function public.enjoy_claim_reminders(boolean) to service_role;

do $patch$
declare source text:=pg_get_functiondef('public.enjoy_api(text,jsonb)'::regprocedure);
begin
 source:=replace(source,'(select whatsapp_live from enjoy.settings where id)',
  '(exists(select 1 from enjoy.whatsapp_connections wc where (u.role=''admin'' or wc.workshop=u.workshop) and wc.connected and (wc.expires_at is null or wc.expires_at>now())))');
 execute source;
end;$patch$;
commit;