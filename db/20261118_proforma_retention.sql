begin;
create function public.enjoy_storage_usage(action text, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform enjoy.assert_allowed_ip();
 if action <> 'storage-usage' or not exists (
  select 1 from enjoy.profiles where id=auth.uid() and role='admin'
 ) then raise exception 'Acceso reservado a Administración.' using errcode='42501'; end if;
 return (select jsonb_build_object(
  'databaseBytes',pg_database_size(current_database()),
  'quoteCount',count(*),
  'quoteBytes',coalesce(sum(pg_column_size(r.payload)),0)
 ) from enjoy.records r where r.collection='requests' and r.payload->>'kind'='proforma');
end;
$$;
revoke all on function public.enjoy_storage_usage(text,jsonb) from public, anon, authenticated;
grant execute on function public.enjoy_storage_usage(text,jsonb) to authenticated;

create index if not exists records_proforma_retention_idx on enjoy.records (updated)
 where collection='requests' and payload->>'kind'='proforma';

select cron.schedule('enjoy-proforma-retention','* * * * *', $job$
 with expired as (
  delete from enjoy.records
  where collection='requests' and payload->>'kind'='proforma'
   and updated<=now()-interval '14 days'
  returning workshop,id
 )
 update enjoy.records a
 set payload=a.payload-'proformaId'
 from expired q
 where a.collection='appointments' and a.workshop=q.workshop and a.payload->>'proformaId'=q.id;
$job$);
commit;