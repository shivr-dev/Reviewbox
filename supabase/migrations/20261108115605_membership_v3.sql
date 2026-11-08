create schema if not exists review_billing;
revoke all on schema review_billing from public,anon,authenticated;
create table review_billing.policy(id boolean primary key default true check(id),version integer not null,catalog jsonb not null);
create table review_billing.subscriptions(
 user_id uuid primary key references auth.users(id) on delete cascade,
 plan text not null default 'free' check(plan in ('free','plus','pro')),
 status text not null default 'free' check(status in ('free','active','cancelled','expired','grace')),
 starts_at timestamptz not null default now(),expires_at timestamptz,
 cycle_anchor timestamptz not null default now(),plus_since timestamptz,
 cancel_at_period_end boolean not null default false,auto_renew boolean not null default false,
 legacy_until timestamptz,provider text,provider_subscription_id text,updated_at timestamptz not null default now()
);
create table review_billing.periods(
 user_id uuid not null references auth.users(id) on delete cascade,starts_at timestamptz not null,ends_at timestamptz not null,
 allowance integer not null check(allowance>=0),primary key(user_id,starts_at),check(ends_at>starts_at)
);
create table review_billing.credit_operations(
 user_id uuid not null references auth.users(id) on delete cascade,request_id text not null check(length(request_id) between 8 and 100),
 fingerprint text not null,feature text not null,period_start timestamptz not null,
 reserved integer not null check(reserved>=0),charged integer not null default 0 check(charged>=0 and charged<=reserved),
 status text not null check(status in ('reserved','committed','refunded')),trial text check(trial in ('plus','pro')),
 trial_period timestamptz,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '15 minutes',
 finished_at timestamptz,usage jsonb,primary key(user_id,request_id),
 foreign key(user_id,period_start) references review_billing.periods(user_id,starts_at)
);
create index credit_operations_period on review_billing.credit_operations(user_id,period_start,status);
create index credit_operations_trial on review_billing.credit_operations(user_id,trial,trial_period,status);
create table review_billing.subscription_events(
 id text primary key,user_id uuid not null references auth.users(id) on delete cascade,type text not null,
 plan text not null check(plan in ('free','plus','pro')),at timestamptz not null default now(),details jsonb not null default '{}'
);
create index subscription_events_user on review_billing.subscription_events(user_id,at desc);
alter table review_billing.policy enable row level security;
alter table review_billing.subscriptions enable row level security;
alter table review_billing.periods enable row level security;
alter table review_billing.credit_operations enable row level security;
alter table review_billing.subscription_events enable row level security;
revoke all on all tables in schema review_billing from public,anon,authenticated;

create function review_billing.cycle(anchor timestamptz,at_time timestamptz default now()) returns timestamptz[] language plpgsql immutable set search_path='' as $$
declare n integer; start_time timestamptz;
begin
 n:=greatest(0,(extract(year from at_time at time zone 'UTC')::integer-extract(year from anchor at time zone 'UTC')::integer)*12+extract(month from at_time at time zone 'UTC')::integer-extract(month from anchor at time zone 'UTC')::integer);
 start_time:=((anchor at time zone 'UTC')+make_interval(months=>n)) at time zone 'UTC';
 if start_time>at_time then n:=greatest(0,n-1);start_time:=((anchor at time zone 'UTC')+make_interval(months=>n)) at time zone 'UTC';end if;
 return array[start_time,((anchor at time zone 'UTC')+make_interval(months=>n+1)) at time zone 'UTC'];
end $$;

create function review_billing.snapshot(u uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s review_billing.subscriptions; old_until timestamptz;old_start timestamptz;anchor timestamptz;cycle_times timestamptz[];free_times timestamptz[];p jsonb;plan_name text;allowance integer;spent integer;held integer;plus_used integer;pro_used integer;
begin
 if u is null or (u is distinct from auth.uid() and coalesce(auth.jwt()->>'role','')<>'service_role') then raise exception 'membership_auth' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('membership:'||u::text,0));
 select created_at into anchor from auth.users where id=u;if not found then raise exception 'membership_auth';end if;
 select until into old_until from review_private.memberships where user_id=u;
 select min(at) into old_start from review_private.game_grants where user_id=u and rewards ? 'superUntil';
 insert into review_billing.subscriptions(user_id,plan,status,starts_at,expires_at,cycle_anchor,plus_since,legacy_until)
 values(u,case when old_until>now() then 'plus' else 'free' end,case when old_until>now() then 'grace' else 'free' end,
 coalesce(old_start,anchor),case when old_until>now() then greatest(old_until,now()+interval '30 days') end,
 case when old_until>now() then coalesce(old_start,now()) else anchor end,case when old_until>now() then coalesce(old_start,now()) end,old_until)
 on conflict(user_id) do nothing;
 if old_until>now() then insert into review_billing.subscription_events(id,user_id,type,plan,details) values('legacy:'||u,u,'legacy-migration','plus',jsonb_build_object('legacyUntil',old_until,'graceDays',30)) on conflict do nothing;end if;
 select * into s from review_billing.subscriptions where user_id=u for update;
 plan_name:=case when s.plan<>'free' and s.expires_at>now() then s.plan else 'free' end;
 select catalog into p from review_billing.policy where id;
 if p is null then raise exception 'membership_policy_missing';end if;
 cycle_times:=review_billing.cycle(case when plan_name='free' then anchor else s.cycle_anchor end);
 free_times:=review_billing.cycle(anchor);
 allowance:=(p->'plans'->plan_name->>'credits')::integer;
 insert into review_billing.periods(user_id,starts_at,ends_at,allowance) values(u,cycle_times[1],cycle_times[2],allowance)
 on conflict(user_id,starts_at) do update set allowance=excluded.allowance,ends_at=excluded.ends_at;
 update review_billing.credit_operations set status='refunded',finished_at=now() where user_id=u and status='reserved' and expires_at<now();
 select coalesce(sum(charged) filter(where status='committed'),0),coalesce(sum(reserved) filter(where status='reserved'),0) into spent,held from review_billing.credit_operations where user_id=u and period_start=cycle_times[1];
 select count(*) into plus_used from review_billing.credit_operations where user_id=u and trial='plus' and trial_period=free_times[1] and status in ('reserved','committed');
 select count(*) into pro_used from review_billing.credit_operations where user_id=u and trial='pro' and status in ('reserved','committed');
 return jsonb_build_object('plan',plan_name,'status',case when s.plan<>'free' and plan_name='free' then 'expired' else s.status end,
 'startsAt',s.starts_at,'expiresAt',s.expires_at,'cancelAtPeriodEnd',s.cancel_at_period_end,'autoRenew',s.auto_renew,'legacyUntil',s.legacy_until,
 'period',jsonb_build_object('start',cycle_times[1],'end',cycle_times[2],'allowance',allowance,'used',spent,'reserved',held,'remaining',greatest(0,allowance-spent-held)),
 'plusTrial',jsonb_build_object('remaining',case when plan_name='free' then greatest(0,3-plus_used) else 0 end,'resetsAt',free_times[2]),
 'proPreview',jsonb_build_object('eligible',plan_name='plus' and s.plus_since+interval '14 days'<=now(),'remaining',greatest(0,3-pro_used),'eligibleAt',s.plus_since+interval '14 days'),
 'ledger',(select coalesce(jsonb_agg(x order by x->>'at' desc),'[]') from (select jsonb_build_object('id',request_id,'at',created_at,'feature',feature,'reserved',reserved,'charged',charged,'status',status) x from review_billing.credit_operations where user_id=u order by created_at desc limit 30)t),
 'subscriptionEvents',(select coalesce(jsonb_agg(x order by x->>'at' desc),'[]') from (select jsonb_build_object('id',id,'at',at,'type',type,'plan',plan) x from review_billing.subscription_events where user_id=u order by at desc limit 20)t));
end $$;

create function review_billing.member_api(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();s jsonb;
begin
 if u is null then raise exception 'membership_auth' using errcode='42501';end if;
 s:=review_billing.snapshot(u);
 if action='state' then return s;
 elsif action='cancel' then
  if s->>'plan'='free' then return s;end if;
  update review_billing.subscriptions set cancel_at_period_end=true,auto_renew=false,status='cancelled',updated_at=now() where user_id=u;
  insert into review_billing.subscription_events(id,user_id,type,plan) values('cancel:'||u||':'||((s->>'expiresAt')::timestamptz)::text,u,'cancel-at-period-end',s->>'plan') on conflict do nothing;
  return review_billing.snapshot(u);
 else raise exception 'membership_action';end if;
end $$;

create function review_billing.server_api(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=(payload->>'userId')::uuid;s jsonb;p jsonb;f jsonb;req text:=payload->>'requestId';op review_billing.credit_operations;cost integer;actual integer;trial_name text;free_anchor timestamptz;free_times timestamptz[];
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'membership_server_only' using errcode='42501';end if;
 s:=review_billing.snapshot(u);select catalog into p from review_billing.policy where id;
 if action='state' then return s;end if;
 if action='reserve' then
  if req is null or length(req) not between 8 and 100 or coalesce(payload->>'fingerprint','')!~'^[a-f0-9]{64}$' then raise exception 'membership_request';end if;
  select * into op from review_billing.credit_operations where user_id=u and request_id=req;
  if found then
   if op.fingerprint<>payload->>'fingerprint' or op.feature<>payload->>'feature' then raise exception 'membership_replay_mismatch';end if;
   return jsonb_build_object('replay',true,'status',op.status,'reserved',op.reserved,'snapshot',s);
  end if;
  f:=p->'features'->(payload->>'feature');if f is null then raise exception 'membership_feature';end if;
  if (p->'plans'->(s->>'plan')->>'rank')::integer<(p->'plans'->(f->>'plan')->>'rank')::integer then
   if payload->>'trial'='plus' and f->>'plan'='plus' and s->>'plan'='free' and (s->'plusTrial'->>'remaining')::integer>0 then trial_name:='plus';
   elsif payload->>'trial'='pro' and payload->>'feature'='agent' and (s->'proPreview'->>'eligible')::boolean and (s->'proPreview'->>'remaining')::integer>0 then trial_name:='pro';
   else raise exception 'membership_upgrade' using errcode='42501';end if;
  end if;
  cost:=(f->>'credits')::integer;
  if cost>(s->'period'->>'remaining')::integer then raise exception 'membership_credits' using errcode='P0001';end if;
  select created_at into free_anchor from auth.users where id=u;free_times:=review_billing.cycle(free_anchor);
  insert into review_billing.credit_operations(user_id,request_id,fingerprint,feature,period_start,reserved,status,trial,trial_period)
  values(u,req,payload->>'fingerprint',payload->>'feature',(s->'period'->>'start')::timestamptz,cost,'reserved',trial_name,case when trial_name='plus' then free_times[1] end);
  return jsonb_build_object('replay',false,'reserved',cost,'snapshot',review_billing.snapshot(u));
 elsif action in ('settle','refund') then
  select * into op from review_billing.credit_operations where user_id=u and request_id=req for update;
  if not found then raise exception 'membership_request';end if;
  if op.status<>'reserved' then return jsonb_build_object('replay',true,'status',op.status,'snapshot',s);end if;
  actual:=case when action='refund' then 0 else coalesce((payload->>'actualCredits')::integer,op.reserved) end;
  if actual<0 or actual>op.reserved then raise exception 'membership_cost';end if;
  update review_billing.credit_operations set status=case when action='refund' then 'refunded' else 'committed' end,charged=actual,finished_at=now(),usage=payload->'usage' where user_id=u and request_id=req;
  return jsonb_build_object('charged',actual,'snapshot',review_billing.snapshot(u));
 else raise exception 'membership_action';end if;
end $$;

revoke all on all functions in schema review_billing from public,anon,authenticated;
grant usage on schema review_billing to authenticated,service_role;
grant execute on function review_billing.member_api(text,jsonb) to authenticated;
grant execute on function review_billing.server_api(text,jsonb) to service_role;
create function public.review_membership(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select review_billing.member_api(action,payload)$$;
create function public.review_membership_server(action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select review_billing.server_api(action,payload)$$;
revoke all on function public.review_membership(text,jsonb) from public,anon;
revoke all on function public.review_membership_server(text,jsonb) from public,anon,authenticated;
grant execute on function public.review_membership(text,jsonb) to authenticated;
grant execute on function public.review_membership_server(text,jsonb) to service_role;

insert into review_billing.policy(id,version,catalog) values(true,1,'{"version":1,"plans":{"free":{"name":"Free","monthly":0,"yearly":0,"credits":60,"plusTrials":3,"rank":0,"color":"neutral","tagline":"Experience Reviewbox"},"plus":{"name":"Plus","monthly":19,"yearly":168,"credits":500,"plusTrials":0,"rank":1,"color":"blue","tagline":"Your Personal AI Tutor"},"pro":{"name":"Pro","monthly":59,"yearly":588,"credits":1800,"plusTrials":0,"rank":2,"color":"violet","tagline":"Your Personal AI Learning Agent"}},"features":{"learning":{"plan":"free","credits":0},"gpa":{"plan":"free","credits":0},"sync":{"plan":"free","credits":0},"packs":{"plan":"free","credits":0},"navi_basic":{"plan":"free","credits":1},"navi_deep":{"plan":"plus","credits":3},"multi_context":{"plan":"plus","credits":5},"diagnosis":{"plan":"plus","credits":8},"workspace":{"plan":"plus","credits":0},"batch_export":{"plan":"plus","credits":0},"agent":{"plan":"pro","credits":8},"workflows":{"plan":"pro","credits":0},"twin":{"plan":"pro","credits":0}}}'::jsonb);
