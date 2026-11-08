create or replace function review_billing.run_workflow(u uuid,w uuid,run_slot text) returns jsonb language plpgsql security definer set search_path='' as $$
declare entitlement jsonb;flow review_billing.workflows;receipt jsonb;run_id uuid;local_start timestamptz;
begin
 entitlement:=review_billing.snapshot(u);
 if entitlement->>'plan'<>'pro' then raise exception 'membership_upgrade';end if;
 select * into flow from review_billing.workflows where user_id=u and id=w for update;
 if not found or flow.deleted or not flow.enabled then raise exception 'workflow_unavailable';end if;
 if length(run_slot)>100 then raise exception 'workflow_invalid';end if;
 select result into receipt from review_billing.workflow_runs where user_id=u and workflow_id=w and slot=run_slot;
 if found then return jsonb_build_object('replay',true,'result',receipt);end if;
 local_start:=now()-interval '7 days';
 if flow.kind='weekly-report' then
  select jsonb_build_object('kind',flow.kind,'readOnly',true,'basis','synced-records','from',local_start,'to',now(),
   'answers',count(*) filter(where kind='event' and coalesce(payload->>'occurredAt',updated_at::text)::timestamptz>=local_start and coalesce(payload->>'voidedBy','')=''),
   'courses',count(*) filter(where kind='job' and payload->>'kind'='course' and payload->>'completedAt' is not null and updated_at>=local_start),
   'subjects',(select coalesce(jsonb_agg(distinct r.payload->>'subject'),'[]') from public.review_records r where r.user_id=u and not r.deleted and r.kind='event' and coalesce(r.payload->>'occurredAt',r.updated_at::text)::timestamptz>=local_start),
   'lastSync',max(updated_at)) into receipt from public.review_records where user_id=u and not deleted;
 else
  select jsonb_build_object('kind',flow.kind,'readOnly',true,'basis','synced-records','at',now(),'exams',coalesce(jsonb_agg(jsonb_build_object('id',id,'title',payload->>'title','date',payload->>'date','subject',payload->>'subject','target',payload->'target','scoreRecorded',jsonb_typeof(payload->'result')='object')) filter(where payload->>'date'>=to_char(now()-interval '2 days','YYYY-MM-DD') and payload->>'date'<=to_char(now()+interval '14 days','YYYY-MM-DD')),'[]')) into receipt from public.review_records where user_id=u and not deleted and kind='exam' and coalesce(payload->>'scheduleStatus','active')<>'cancelled';
 end if;
 insert into review_billing.workflow_runs(user_id,workflow_id,slot,status,result) values(u,w,run_slot,'complete',receipt) returning id into run_id;
 return jsonb_build_object('id',run_id,'result',receipt);
end $$;
