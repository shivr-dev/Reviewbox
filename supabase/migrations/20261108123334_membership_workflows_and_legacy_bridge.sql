-- Extend authoritative legacy rights when an old code is redeemed after first migration.
alter function review_billing.snapshot(uuid) rename to snapshot_v1;
create function review_billing.snapshot(u uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; old_until timestamptz;
begin
 result:=review_billing.snapshot_v1(u);
 select until into old_until from review_private.memberships where user_id=u;
 if old_until>now() and old_until>coalesce((result->>'legacyUntil')::timestamptz,'-infinity') then
  update review_billing.subscriptions set legacy_until=old_until,plan=case when plan='pro' and expires_at>now() then 'pro' else 'plus' end,
   status=case when plan='pro' and expires_at>now() then status else 'grace' end,expires_at=greatest(coalesce(expires_at,now()),old_until,now()+interval '30 days'),plus_since=coalesce(plus_since,now()),updated_at=now() where user_id=u;
  result:=review_billing.snapshot_v1(u);
 end if;
 return result;
end $$;
revoke all on function review_billing.snapshot(uuid) from public,anon,authenticated;
grant execute on function review_billing.snapshot(uuid) to service_role;

create table review_billing.workflows(
 user_id uuid not null references auth.users(id) on delete cascade,id uuid not null,name text not null check(length(name) between 1 and 80),
 kind text not null check(kind in ('weekly-report','exam-readiness')),schedule text not null check(schedule in ('manual','weekly')),
 weekday integer not null check(weekday between 0 and 6),hour integer not null check(hour between 0 and 23),time_zone text not null,
 enabled boolean not null default true,deleted boolean not null default false,updated_at timestamptz not null default now(),primary key(user_id,id)
);
create table review_billing.workflow_runs(
 user_id uuid not null,workflow_id uuid not null,id uuid not null default gen_random_uuid(),slot text not null,status text not null check(status in ('complete','failed')),
 result jsonb,error text,at timestamptz not null default now(),primary key(user_id,id),unique(user_id,workflow_id,slot),foreign key(user_id,workflow_id) references review_billing.workflows(user_id,id)
);
alter table review_billing.workflows enable row level security;
alter table review_billing.workflow_runs enable row level security;
revoke all on review_billing.workflows,review_billing.workflow_runs from public,anon,authenticated;
create index workflow_runs_recent on review_billing.workflow_runs(user_id,at desc);
-- Read-only deterministic receipts: these do not calculate or mutate mastery, GPA or Director rankings.
create function review_billing.run_workflow(u uuid,w uuid,run_slot text) returns jsonb language plpgsql security definer set search_path='' as $$
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
   'answers',count(*) filter(where kind='event' and coalesce(payload->>'occurredAt',updated_at::text)::timestamptz>=local_start and not payload ? 'voidedBy'),
   'courses',count(*) filter(where kind='job' and payload->>'kind'='course' and payload->>'completedAt' is not null and updated_at>=local_start),
   'subjects',(select coalesce(jsonb_agg(distinct r.payload->>'subject'),'[]') from public.review_records r where r.user_id=u and not r.deleted and r.kind='event' and r.updated_at>=local_start),
   'lastSync',max(updated_at)) into receipt from public.review_records where user_id=u and not deleted;
 else
  select jsonb_build_object('kind',flow.kind,'readOnly',true,'basis','synced-records','at',now(),'exams',coalesce(jsonb_agg(jsonb_build_object('id',id,'title',payload->>'title','date',payload->>'date','subject',payload->>'subject','target',payload->'target','scoreRecorded',payload ? 'outcome')) filter(where payload->>'date'>=to_char(now()-interval '2 days','YYYY-MM-DD') and payload->>'date'<=to_char(now()+interval '14 days','YYYY-MM-DD')),'[]')) into receipt from public.review_records where user_id=u and not deleted and kind='exam';
 end if;
 insert into review_billing.workflow_runs(user_id,workflow_id,slot,status,result) values(u,w,run_slot,'complete',receipt) returning id into run_id;
 return jsonb_build_object('id',run_id,'result',receipt);
end $$;
revoke all on function review_billing.run_workflow(uuid,uuid,text) from public,anon,authenticated;

alter function review_billing.member_api(text,jsonb) rename to member_api_v2;
create function review_billing.member_api(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();s jsonb;flow_id uuid;zone text;
begin
 if action not like 'workflow-%' then return review_billing.member_api_v2(action,payload);end if;
 s:=review_billing.snapshot(u);
 if action='workflow-list' then
  return jsonb_build_object('pausedByPlan',s->>'plan'<>'pro','workflows',(select coalesce(jsonb_agg(to_jsonb(w) order by w.updated_at desc),'[]') from review_billing.workflows w where w.user_id=u and not w.deleted),
   'runs',(select coalesce(jsonb_agg(to_jsonb(r) order by r.at desc),'[]') from (select * from review_billing.workflow_runs where user_id=u order by at desc limit 40) r));
 end if;
 if s->>'plan'<>'pro' then raise exception 'membership_upgrade';end if;
 flow_id:=(payload->>'id')::uuid;
 if action='workflow-save' then
  zone:=coalesce(payload->>'timeZone','Asia/Shanghai');if not exists(select 1 from pg_timezone_names where name=zone) then raise exception 'workflow_timezone';end if;
  if coalesce(payload->>'name','')='' or length(payload->>'name')>80 then raise exception 'workflow_invalid';end if;
  insert into review_billing.workflows(user_id,id,name,kind,schedule,weekday,hour,time_zone,enabled)
   values(u,flow_id,payload->>'name',payload->>'kind',payload->>'schedule',coalesce((payload->>'weekday')::integer,1),coalesce((payload->>'hour')::integer,9),zone,coalesce((payload->>'enabled')::boolean,true))
   on conflict(user_id,id) do update set name=excluded.name,kind=excluded.kind,schedule=excluded.schedule,weekday=excluded.weekday,hour=excluded.hour,time_zone=excluded.time_zone,enabled=excluded.enabled,deleted=false,updated_at=now();
 elsif action='workflow-run' then return review_billing.run_workflow(u,flow_id,'manual:'||(payload->>'requestId')::uuid::text);
 elsif action='workflow-delete' then update review_billing.workflows set deleted=true,enabled=false,updated_at=now() where user_id=u and id=flow_id;
 else raise exception 'workflow_action';end if;
 return jsonb_build_object('saved',true);
end $$;
revoke all on function review_billing.member_api(text,jsonb) from public,anon;
grant execute on function review_billing.member_api(text,jsonb) to authenticated;
create or replace function public.review_membership(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select review_billing.member_api(action,payload)$$;

-- Database-scheduled reports work even when every browser is closed. No model keys or browser timers.
create extension if not exists pg_cron;
create function review_billing.tick_workflows() returns void language plpgsql security definer set search_path='' as $$
declare w review_billing.workflows;local_now timestamp;claims text:=current_setting('request.jwt.claims',true);
begin
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 for w in select f.* from review_billing.workflows f join review_billing.subscriptions s on s.user_id=f.user_id where f.enabled and not f.deleted and f.schedule='weekly' and s.plan='pro' and s.expires_at>now() loop
  local_now:=now() at time zone w.time_zone;
  if extract(dow from local_now)::integer=w.weekday and extract(hour from local_now)::integer>=w.hour then
   begin perform review_billing.run_workflow(w.user_id,w.id,'weekly:'||to_char(date_trunc('week',local_now),'YYYY-MM-DD'));
   exception when others then
    insert into review_billing.workflow_runs(user_id,workflow_id,slot,status,error) values(w.user_id,w.id,'weekly:'||to_char(date_trunc('week',local_now),'YYYY-MM-DD'),'failed','report_failed') on conflict(user_id,workflow_id,slot) do nothing;
   end;
  end if;
 end loop;
 perform set_config('request.jwt.claims',coalesce(claims,''),true);
end $$;
revoke all on function review_billing.tick_workflows() from public,anon,authenticated;
select cron.schedule('review-membership-reports','7 * * * *','select review_billing.tick_workflows()');
