begin;
create table enjoy.appointment_photos (
 workshop uuid not null,
 appointment text not null,
 photos jsonb not null,
 primary key(workshop,appointment),
 foreign key(workshop,appointment) references enjoy.records(workshop,id) on delete cascade
);
alter table enjoy.appointment_photos enable row level security;
revoke all on enjoy.appointment_photos from public, anon, authenticated;

create function public.enjoy_appointment_details(action text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 me enjoy.profiles;
 record_data jsonb := payload->'record';
 appointment_id text := coalesce(record_data->>'id',payload->>'id');
 quote_ref text := nullif(record_data->>'proformaId','');
 attachments jsonb := payload->'photos';
 photo text;
 result jsonb;
begin
 perform enjoy.assert_allowed_ip();
 select * into me from enjoy.profiles where id=auth.uid() and role='owner';
 if not found or not exists(select 1 from enjoy.workshops w where w.id=me.workshop and w.status='approved' and w.deleted_at is null)
  then raise exception 'No existe un taller autorizado.' using errcode='42501'; end if;
 if action='appointment-details-read' then
  if not exists(select 1 from enjoy.records x where x.workshop=me.workshop and x.id=appointment_id and x.collection='appointments')
   then raise exception 'No se encontró la cita.' using errcode='42501'; end if;
  return jsonb_build_object('photos',coalesce((select f.photos from enjoy.appointment_photos f where f.workshop=me.workshop and f.appointment=appointment_id),'[]'::jsonb));
 end if;
 if action<>'appointment-details-save' or appointment_id is null or appointment_id='' then raise exception 'Operación no disponible.'; end if;
 if quote_ref is not null and not exists (
  select 1 from enjoy.records x where x.workshop=me.workshop and x.collection='requests' and x.id=quote_ref
   and x.payload->>'kind'='proforma' and x.payload->>'clientId'=record_data->>'clientId'
   and x.payload->>'vehicleId'=record_data->>'vehicleId'
 ) then raise exception 'Seleccione una proforma del cliente y vehículo de la cita.'; end if;
 if coalesce(record_data->>'followsProforma','false') not in ('true','false') or
    (quote_ref is not null and record_data->>'followsProforma' is distinct from 'true')
  then raise exception 'Revise la selección de proforma.'; end if;
 if attachments is not null then
  if jsonb_typeof(attachments) is distinct from 'array' then raise exception 'Revise las fotos del vehículo.'; end if;
  if jsonb_array_length(attachments)>4 then raise exception 'Seleccione un máximo de cuatro fotos.'; end if;
  for photo in select jsonb_array_elements_text(attachments) loop
   if photo is null or length(photo)>75000 or photo !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
    then raise exception 'Revise el formato o el tamaño de las fotos.'; end if;
  end loop;
 end if;
 result:=public.enjoy_api('save',jsonb_build_object('collection','appointments','record',record_data));
 if attachments is not null then
  insert into enjoy.appointment_photos(workshop,appointment,photos) values(me.workshop,appointment_id,attachments)
   on conflict(workshop,appointment) do update set photos=excluded.photos;
 end if;
 return result;
end $$;
revoke all on function public.enjoy_appointment_details(text,jsonb) from public, anon, authenticated;
grant execute on function public.enjoy_appointment_details(text,jsonb) to authenticated;
commit;
