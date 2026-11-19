do $patch$
declare definition text:=pg_get_functiondef('public.enjoy_whatsapp_server(text,jsonb)'::regprocedure);
begin
 definition:=replace(definition,$old$ if action='fail' then$old$,$new$
 if action='finish-refresh' then
  update enjoy.whatsapp_attempts set state='complete'
   where id=(payload->>'attemptId')::uuid and owner_id=(payload->>'userId')::uuid and state='processing';
  return '{}'::jsonb;
 end if;
 if action='fail' then$new$);
 execute definition;
end;$patch$;