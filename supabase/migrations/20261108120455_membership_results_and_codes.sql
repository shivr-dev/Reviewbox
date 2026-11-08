alter table review_billing.credit_operations add column result_json jsonb;
alter function review_billing.server_api(text,jsonb) rename to credit_api_v1;
create function review_billing.server_api(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;u uuid:=(payload->>'userId')::uuid;cached jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'membership_server_only' using errcode='42501';end if;
 if action='settle' and (payload->'result' is null or octet_length((payload->'result')::text)>192000) then raise exception 'membership_result';end if;
 result:=review_billing.credit_api_v1(action,payload);
 if action='settle' and not coalesce((result->>'replay')::boolean,false) then
  update review_billing.credit_operations set result_json=payload->'result' where user_id=u and request_id=payload->>'requestId' and status='committed';
 end if;
 if action='reserve' and coalesce((result->>'replay')::boolean,false) and result->>'status'='committed' then
  select result_json into cached from review_billing.credit_operations where user_id=u and request_id=payload->>'requestId' and finished_at>now()-interval '7 days';
  result:=result||jsonb_build_object('result',cached);
 end if;
 update review_billing.credit_operations set result_json=null where user_id=u and result_json is not null and finished_at<now()-interval '7 days';
 return result;
end $$;
revoke all on function review_billing.server_api(text,jsonb) from public,anon,authenticated;
grant execute on function review_billing.server_api(text,jsonb) to service_role;

create function review_billing.redeem(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();code_text text:=upper(trim(payload->>'code'));req text:=payload->>'requestId';c review_private.reward_codes;claim review_private.code_claims;requested_plan text;days integer;s review_billing.subscriptions;until_time timestamptz;final_plan text;
begin
 if u is null then raise exception 'membership_auth' using errcode='42501';end if;
 perform review_billing.snapshot(u);
 if code_text is null or code_text!~'^[A-Z0-9-]{6,64}$' or req is null or length(req) not between 8 and 80 then raise exception 'membership_code_invalid';end if;
 select * into claim from review_private.code_claims where user_id=u and request_id=req;
 if found then
  if claim.code<>code_text then raise exception 'membership_replay_mismatch';end if;
  return review_billing.snapshot(u)||jsonb_build_object('redeemed',true,'replay',true);
 end if;
 select * into c from review_private.reward_codes where code=code_text for update;
 if not found or not c.active or c.used>=c.max_uses or c.expires_at<=now() then raise exception 'membership_code_unavailable';end if;
 requested_plan:=c.rewards->>'membershipPlan';days:=(c.rewards->>'membershipDays')::integer;
 if coalesce(requested_plan,'') not in ('plus','pro') or days is null or days not between 1 and 3650 then raise exception 'membership_code_legacy';end if;
 if (select count(*) from review_private.code_claims where user_id=u and code=code_text)>=c.per_user_limit then raise exception 'membership_code_limit';end if;
 select * into s from review_billing.subscriptions where user_id=u for update;
 -- A lower-tier gift never discards an active higher-tier subscription.
 final_plan:=case when s.plan='pro' and s.expires_at>now() then 'pro' else requested_plan end;
 until_time:=greatest(coalesce(s.expires_at,now()),now())+make_interval(days=>days);
 update review_billing.subscriptions set plan=final_plan,status='active',starts_at=case when s.expires_at>now() then s.starts_at else now() end,
 expires_at=until_time,cycle_anchor=case when s.expires_at>now() then s.cycle_anchor else now() end,plus_since=case when s.expires_at>now() then coalesce(s.plus_since,now()) else now() end,
 cancel_at_period_end=false,auto_renew=false,updated_at=now() where user_id=u;
 insert into review_private.code_claims(user_id,code,request_id) values(u,code_text,req) returning * into claim;
 update review_private.reward_codes set used=used+1 where code=code_text;
 insert into review_billing.subscription_events(id,user_id,type,plan,details) values('code:'||claim.id,u,'code-redemption',final_plan,jsonb_build_object('days',days,'expiresAt',until_time));
 return review_billing.snapshot(u)||jsonb_build_object('redeemed',true,'redeemedPlan',final_plan,'redeemedDays',days);
end $$;

alter function review_billing.member_api(text,jsonb) rename to member_api_v1;
create function review_billing.member_api(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();code_text text;rewards jsonb;uses integer;per_user integer;is_admin boolean;
begin
 if u is null then raise exception 'membership_auth' using errcode='42501';end if;
 if action in ('state','cancel') then return review_billing.member_api_v1(action,payload);
 elsif action='redeem' then return review_billing.redeem(payload);
 elsif action like 'admin-%' then
  select exists(select 1 from review_private.game_admins where user_id=u) into is_admin;
  if not is_admin then raise exception 'membership_admin' using errcode='42501';end if;
  if action='admin-code-save' then
   code_text:=upper(trim(payload->>'code'));rewards:=payload->'rewards';uses:=(payload->>'maxUses')::integer;per_user:=coalesce((payload->>'perUserLimit')::integer,1);
   if code_text!~'^[A-Z0-9-]{6,64}$' or code_text is null or coalesce(rewards->>'membershipPlan','') not in ('plus','pro') or coalesce((rewards->>'membershipDays')::integer,0) not between 1 and 3650 or uses is null or uses not between 1 and 1000000 or per_user not between 1 and uses then raise exception 'membership_code_invalid';end if;
   insert into review_private.reward_codes(code,rewards,max_uses,per_user_limit,expires_at,created_by) values(code_text,jsonb_build_object('membershipPlan',rewards->>'membershipPlan','membershipDays',(rewards->>'membershipDays')::integer),uses,per_user,nullif(payload->>'expiresAt','')::timestamptz,u)
   on conflict(code) do update set rewards=excluded.rewards,max_uses=excluded.max_uses,per_user_limit=excluded.per_user_limit,expires_at=excluded.expires_at;
  elsif action='admin-code-disable' then update review_private.reward_codes c set active=false where c.code=upper(trim(payload->>'code')) and c.rewards ? 'membershipPlan';
  elsif action<>'admin-code-list' then raise exception 'membership_action';end if;
  return jsonb_build_object('codes',(select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc),'[]') from review_private.reward_codes c where c.rewards ? 'membershipPlan'));
 else raise exception 'membership_action';end if;
end $$;
revoke all on function review_billing.redeem(jsonb) from public,anon,authenticated;
revoke all on function review_billing.member_api(text,jsonb) from public,anon;
grant execute on function review_billing.member_api(text,jsonb) to authenticated;

-- Retain the old game code endpoint while routing new membership codes through the new ledger.
alter function review_private.game_api(text,jsonb) rename to game_api_legacy;
create function review_private.game_api(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare code_rewards jsonb;result jsonb;
begin
 if auth.uid() is null then raise exception 'membership_auth' using errcode='42501';end if;
 if action='redeem' then
  select rewards into code_rewards from review_private.reward_codes where code=upper(trim(payload->>'code'));
  if code_rewards ? 'membershipPlan' then
   result:=review_billing.redeem(payload);
   return review_private.game_api_legacy('state','{}')||jsonb_build_object('membership',result,'redeemedReward',code_rewards,'redemptionId',payload->>'requestId');
  end if;
 end if;
 return review_private.game_api_legacy(action,payload);
end $$;
revoke all on function review_private.game_api(text,jsonb) from public,anon;
grant execute on function review_private.game_api(text,jsonb) to authenticated;

create or replace function public.review_membership(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select review_billing.member_api(action,payload)$$;
create or replace function public.review_membership_server(action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select review_billing.server_api(action,payload)$$;
create or replace function public.review_game(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select review_private.game_api(action,payload)$$;
