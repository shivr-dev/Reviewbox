create or replace function review_billing.member_api(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
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
