alter function review_billing.server_api(text,jsonb) rename to server_api_v3;
create function review_billing.server_api(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=(payload->>'userId')::uuid;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'membership_server_only' using errcode='42501';end if;
 if action='reserve' then
  perform review_billing.snapshot(u);
  if not exists(select 1 from review_billing.credit_operations where user_id=u and request_id=payload->>'requestId') and (select count(*) from review_billing.credit_operations where user_id=u and created_at>now()-interval '1 minute')>=45 then raise exception 'membership_rate';end if;
 end if;
 return review_billing.server_api_v3(action,payload);
end $$;
revoke all on function review_billing.server_api(text,jsonb) from public,anon,authenticated;
grant execute on function review_billing.server_api(text,jsonb) to service_role;
create or replace function public.review_membership_server(action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select review_billing.server_api(action,payload)$$;
-- Preserve old codes, but stop minting new paid-heart memberships.
create or replace function review_private.game_api(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare code_rewards jsonb;result jsonb;
begin
 if auth.uid() is null then raise exception 'membership_auth' using errcode='42501';end if;
 if action='admin-save' and coalesce((payload->'rewards'->>'superDays')::integer,0)>0 then raise exception 'legacy_membership_readonly';end if;
 if action='redeem' then
  select rewards into code_rewards from review_private.reward_codes where code=upper(trim(payload->>'code'));
  if code_rewards ? 'membershipPlan' then result:=review_billing.redeem(payload);return review_private.game_api_legacy('state','{}')||jsonb_build_object('membership',result,'redeemedReward',code_rewards,'redemptionId',payload->>'requestId');end if;
 end if;
 return review_private.game_api_legacy(action,payload);
end $$;
create or replace function review_billing.member_api(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();s jsonb;flow_id uuid;zone text;
begin
 if action not like 'workflow-%' then return review_billing.member_api_v2(action,payload);end if;
 s:=review_billing.snapshot(u);
 if action='workflow-list' then
  return jsonb_build_object('pausedByPlan',s->>'plan'<>'pro','workflows',(select coalesce(jsonb_agg(to_jsonb(w) order by w.updated_at desc),'[]') from review_billing.workflows w where w.user_id=u),
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
 elsif action='workflow-run' then
  if (select count(*) from review_billing.workflow_runs where user_id=u and at>now()-interval '1 minute')>=6 and not exists(select 1 from review_billing.workflow_runs where user_id=u and workflow_id=flow_id and slot='manual:'||(payload->>'requestId')::uuid::text) then raise exception 'workflow_rate';end if;
  return review_billing.run_workflow(u,flow_id,'manual:'||(payload->>'requestId')::uuid::text);
 elsif action='workflow-delete' then update review_billing.workflows set deleted=true,enabled=false,updated_at=now() where user_id=u and id=flow_id;
 else raise exception 'workflow_action';end if;
 return jsonb_build_object('saved',true);
end $$;
