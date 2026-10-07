create schema if not exists review_private;
create table if not exists review_private.game_admins(user_id uuid primary key references auth.users(id) on delete cascade);
create table if not exists review_private.reward_codes(
  code text primary key, rewards jsonb not null, max_uses integer not null check(max_uses>0),
  used integer not null default 0 check(used>=0 and used<=max_uses), per_user_limit integer not null default 1 check(per_user_limit>0),
  active boolean not null default true, expires_at timestamptz, created_at timestamptz not null default now(), created_by uuid references auth.users(id));
create table if not exists review_private.code_claims(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  code text not null references review_private.reward_codes(code), request_id text not null, at timestamptz not null default now(), unique(user_id,request_id));
create index if not exists code_claims_user_code on review_private.code_claims(user_id,code);
create table if not exists review_private.game_grants(
  id text primary key, user_id uuid not null references auth.users(id) on delete cascade, at timestamptz not null default now(), rewards jsonb not null, source text not null);
create index if not exists game_grants_user on review_private.game_grants(user_id,at);
create table if not exists review_private.memberships(user_id uuid primary key references auth.users(id) on delete cascade, until timestamptz not null);
alter table review_private.game_admins enable row level security;
alter table review_private.reward_codes enable row level security;
alter table review_private.code_claims enable row level security;
alter table review_private.game_grants enable row level security;
alter table review_private.memberships enable row level security;
revoke all on all tables in schema review_private from public,anon,authenticated;
insert into review_private.game_admins(user_id) select id from auth.users where lower(email)='shivrdream@gmail.com' on conflict do nothing;

create or replace function review_private.game_api(action text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid:=auth.uid(); admin boolean; c review_private.reward_codes%rowtype; claim review_private.code_claims%rowtype;
  r jsonb; until_time timestamptz; total integer; per_user integer; code_text text; req text;
  week_key text; result jsonb;
begin
  if u is null then raise exception '请先登录学习账户'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  select exists(select 1 from review_private.game_admins where user_id=u) into admin;
  if action like 'admin-%' and not admin then raise exception '此账户没有管理员权限'; end if;
  if action='admin-save' then
    code_text:=upper(trim(payload->>'code')); r:=payload->'rewards';
    total:=(payload->>'maxUses')::integer; per_user:=coalesce((payload->>'perUserLimit')::integer,1);
    if code_text is null or code_text !~ '^[A-Z0-9-]{6,64}$' or total not between 1 and 1000000 or per_user not between 1 and total or jsonb_typeof(r) is distinct from 'object' then raise exception '兑换码、次数或奖品配置无效'; end if;
    if coalesce((r->>'coins')::integer,0) not between 0 and 100000 or coalesce((r->>'freezes')::integer,0) not between 0 and 1000 or coalesce((r->>'superDays')::integer,0) not between 0 and 3650 then raise exception '奖品数量超出范围'; end if;
    if r->>'skin' is not null and r->>'skin' not in ('skin-sky','skin-sunset','skin-mint','skin-candy','skin-violet','skin-space','skin-gold','skin-explorer','skin-graduate','skin-raincoat','skin-astronaut','skin-scientist') then raise exception '皮肤不存在'; end if;
    if coalesce((r->>'coins')::integer,0)+coalesce((r->>'freezes')::integer,0)+coalesce((r->>'superDays')::integer,0)=0 and r->>'skin' is null and not coalesce((r->>'refill')::boolean,false) then raise exception '至少选择一种奖品'; end if;
    r:=jsonb_build_object('coins',coalesce((r->>'coins')::integer,0),'freezes',coalesce((r->>'freezes')::integer,0),'skin',r->>'skin','superDays',coalesce((r->>'superDays')::integer,0),'refill',coalesce((r->>'refill')::boolean,false));
    insert into review_private.reward_codes(code,rewards,max_uses,per_user_limit,expires_at,created_by)
      values(code_text,r,total,per_user,nullif(payload->>'expiresAt','')::timestamptz,u)
      on conflict(code) do update set rewards=excluded.rewards,max_uses=excluded.max_uses,per_user_limit=excluded.per_user_limit,expires_at=excluded.expires_at;
  elsif action='admin-disable' then
    update review_private.reward_codes set active=coalesce((payload->>'active')::boolean,false) where code=upper(trim(payload->>'code'));
  elsif action='redeem' then
    code_text:=upper(trim(payload->>'code'));req:=payload->>'requestId';
    if code_text is null or code_text !~ '^[A-Z0-9-]{6,64}$' or req is null or length(req) not between 8 and 80 then raise exception '请输入有效的兑换码'; end if;
    select * into claim from review_private.code_claims where user_id=u and request_id=req;
    if found then
      if claim.code<>code_text then raise exception '兑换请求已变化，请重新提交'; end if;
    else
      select * into c from review_private.reward_codes where code=code_text for update;
      if not found or not c.active then raise exception '兑换码不存在或已停用'; end if;
      if c.expires_at is not null and c.expires_at<=now() then raise exception '兑换码已过期'; end if;
      if c.used>=c.max_uses then raise exception '兑换码已达到使用次数上限'; end if;
      if (select count(*) from review_private.code_claims where user_id=u and code=code_text)>=c.per_user_limit then raise exception '此账户已达到该兑换码的使用上限'; end if;
      r:=c.rewards;
      if coalesce((r->>'superDays')::integer,0)>0 then
        select until into until_time from review_private.memberships where user_id=u;
        until_time:=greatest(coalesce(until_time,now()),now())+make_interval(days=>(r->>'superDays')::integer);
        insert into review_private.memberships(user_id,until) values(u,until_time) on conflict(user_id) do update set until=excluded.until;
        r:=r||jsonb_build_object('superUntil',until_time,'refill',true);
      end if;
      insert into review_private.code_claims(user_id,code,request_id) values(u,code_text,req) returning * into claim;
      insert into review_private.game_grants(id,user_id,rewards,source) values('redeem:'||claim.id,u,r,'code');
      update review_private.reward_codes set used=used+1 where code=code_text;
    end if;
  elsif action not in ('state','admin-list') then raise exception '不支持的奖励请求';
  end if;
  select until into until_time from review_private.memberships where user_id=u;
  if until_time>now() then
    week_key:=to_char(date_trunc('week',now() at time zone 'Asia/Shanghai'),'YYYY-MM-DD');
    insert into review_private.game_grants(id,user_id,rewards,source) values('weekly:'||u||':'||week_key,u,jsonb_build_object('freezes',3),'weekly') on conflict(id) do nothing;
  end if;
  select jsonb_build_object('admin',admin,'superUntil',until_time,'grants',coalesce(jsonb_agg(jsonb_build_object('id',id,'at',at,'rewards',rewards,'source',source) order by at,id),'[]'::jsonb)) into result from review_private.game_grants where user_id=u;
  if action like 'admin-%' then
    result:=result||jsonb_build_object('codes',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from review_private.reward_codes x));
  end if;
  return result;
end $$;
revoke all on function review_private.game_api(text,jsonb) from public,anon;
grant usage on schema review_private to authenticated;
grant execute on function review_private.game_api(text,jsonb) to authenticated;
create or replace function public.review_game(action text,payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select review_private.game_api(action,payload) $$;
revoke all on function public.review_game(text,jsonb) from public,anon;
grant execute on function public.review_game(text,jsonb) to authenticated;
