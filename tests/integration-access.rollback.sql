begin;

do $test$
declare admin_id uuid; owner_id uuid; other_owner uuid; rejected boolean; service_id text; cid text:='qa-client-'||gen_random_uuid()::text; vid text:='qa-vehicle-'||gen_random_uuid()::text; qid text:='qa-quote-'||gen_random_uuid()::text; d jsonb; w uuid; wrong_service text:='qa-other-'||gen_random_uuid()::text;
begin
 select id into admin_id from enjoy.profiles where role='admin' limit 1;
 select p.id into owner_id from enjoy.profiles p join enjoy.workshops w on w.id=p.workshop where p.role='owner' and w.status='approved' and w.deleted_at is null limit 1;
 if admin_id is null or owner_id is null then raise exception 'Test needs existing admin and approved owner';end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.enjoy_api('catalog-service-save','{"code":"__INTEGRATION_QA__","name":"QA service","category":"Motor","price":"75.00","serviceType":"Diagnóstico","estimatedMinutes":"60"}');
 select id into service_id from enjoy.central_services where code='__INTEGRATION_QA__';
 if service_id is null then raise exception 'Central service not saved';end if;
 d:=public.enjoy_api('data');
 if not exists(select 1 from jsonb_array_elements(d->'services') x where x->>'id'=service_id) then raise exception 'Admin cannot see catalogue';end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 rejected:=false;
 begin perform public.enjoy_api('catalog-service-save','{"code":"bad","name":"bad","category":"Motor","price":"1"}');exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Owner can edit central catalogue';end if;
 d:=public.enjoy_api('data');if not exists(select 1 from jsonb_array_elements(d->'services') x where x->>'id'=service_id) then raise exception 'Owner cannot read central service';end if;
 perform public.enjoy_api('save',jsonb_build_object('collection','clients','record',jsonb_build_object('id',cid,'name','QA rollback')));
 perform public.enjoy_api('save',jsonb_build_object('collection','vehicles','record',jsonb_build_object('id',vid,'clientId',cid,'plate','QA-'||left(vid,12),'brand','QA','model','QA','km',0)));
 perform public.enjoy_api('save',jsonb_build_object('collection','requests','record',jsonb_build_object('id',qid,'kind','proforma','clientId',cid,'vehicleId',vid,'status','draft','services',jsonb_build_array(service_id),'quoteLines',jsonb_build_array(jsonb_build_object('id',service_id,'kind','service','price',75,'qty',2)))));
 if not exists(select 1 from enjoy.records where id=qid and (payload->>'quoteSubtotal')::numeric=150) then raise exception 'Proforma total not persisted correctly';end if;
 rejected:=false;
 begin perform public.enjoy_api('save',jsonb_build_object('collection','requests','record',jsonb_build_object('id',qid,'kind','proforma','clientId',cid,'vehicleId',vid,'status','draft','services',jsonb_build_array(service_id),'quoteLines',jsonb_build_array(jsonb_build_object('id',service_id,'kind','service','price',1,'qty',2)))));exception when others then rejected:=true;end;
 if not rejected then raise exception 'Forged catalogue price accepted';end if;
 select workshop into w from enjoy.profiles where role='owner' and workshop<>(select workshop from enjoy.profiles where id=owner_id) limit 1;
 if w is not null then
  insert into enjoy.records(workshop,collection,id,payload) values(w,'services',wrong_service,jsonb_build_object('id',wrong_service,'name','QA other','labor',75,'supplies',0,'discount',0));
  rejected:=false;
  begin perform public.enjoy_api('save',jsonb_build_object('collection','requests','record',jsonb_build_object('id',qid,'kind','proforma','clientId',cid,'vehicleId',vid,'status','draft','services',jsonb_build_array(wrong_service),'quoteLines',jsonb_build_array(jsonb_build_object('id',wrong_service,'kind','service','price',75,'qty',1)))));exception when others then rejected:=true;end;
  if not rejected then raise exception 'Cross-workshop service accepted';end if;
 end if;
 perform set_config('request.jwt.claim.sub','',true);
 rejected:=false;begin perform public.enjoy_api('data');exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Anonymous user accepted';end if;
end $test$;
select 'PASS: admin catalogue, owner read/write separation, persistent quotes, canonical prices, cross-workshop isolation and anonymous rejection' as verification;

rollback;
