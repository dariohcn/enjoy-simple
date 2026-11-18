create or replace function public.enjoy_storage_usage(action text, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform enjoy.assert_allowed_ip();
 if action is distinct from 'storage-usage' or not exists (
  select 1 from enjoy.profiles where id=auth.uid() and role='admin'
 ) then raise exception 'Acceso reservado a Administración.' using errcode='42501'; end if;

 return (
  with workshop_usage as (
   select workshop,sum(bytes) bytes from (
    select id workshop,pg_column_size(w) bytes from enjoy.workshops w
    union all select workshop,pg_column_size(r) from enjoy.records r
    union all select workshop,pg_column_size(p) from enjoy.appointment_photos p
    union all select workshop,pg_column_size(p) from enjoy.products p where workshop is not null
    union all select workshop,pg_column_size(o) from enjoy.work_orders o
    union all select workshop,pg_column_size(r) from enjoy.reminders r
   ) usage group by workshop
  ), personal_usage as (
   select account,sum(bytes) bytes from (
    select sender account,pg_column_size(m) bytes from enjoy.partner_messages m
    union all select author,pg_column_size(b) from enjoy.blog_posts b
   ) usage group by account
  ), membership as (
   select workshop,count(*) accounts from enjoy.profiles where workshop is not null group by workshop
  ), usage_rows as (
   select p.email account,w.name workshop,coalesce(u.bytes,0)+
    case when m.accounts=1 then coalesce(s.bytes,0) else 0 end bytes
   from enjoy.profiles p left join enjoy.workshops w on w.id=p.workshop
   left join membership m on m.workshop=p.workshop
   left join workshop_usage s on s.workshop=p.workshop
   left join personal_usage u on u.account=p.id
   union all
   select 'Datos del taller',w.name,s.bytes from workshop_usage s
   join enjoy.workshops w on w.id=s.workshop left join membership m on m.workshop=s.workshop
   where m.accounts is distinct from 1
  )
  select jsonb_build_object(
   'databaseBytes',pg_database_size(current_database()),
   'fileBytes',(select coalesce(sum(case when (metadata->>'size') ~ '^[0-9]+$' then (metadata->>'size')::numeric else 0 end),0) from storage.objects),
   'quoteCount',(select count(*) from enjoy.records r where collection='requests' and r.payload->>'kind'='proforma'),
   'quoteBytes',(select coalesce(sum(pg_column_size(r.payload)),0) from enjoy.records r where collection='requests' and r.payload->>'kind'='proforma'),
   'accounts',(select coalesce(jsonb_agg(to_jsonb(u) order by u.bytes desc,u.account),'[]'::jsonb) from usage_rows u)
  )
 );
end;
$$;
revoke all on function public.enjoy_storage_usage(text,jsonb) from public, anon, authenticated;
grant execute on function public.enjoy_storage_usage(text,jsonb) to authenticated;