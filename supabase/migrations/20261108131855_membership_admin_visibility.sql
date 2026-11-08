create or replace function review_billing.snapshot(u uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; old_until timestamptz;
begin
 result:=review_billing.snapshot_v1(u);
 select until into old_until from review_private.memberships where user_id=u;
 if old_until>now() and old_until>coalesce((result->>'legacyUntil')::timestamptz,'-infinity') then
  update review_billing.subscriptions set legacy_until=old_until,plan=case when plan='pro' and expires_at>now() then 'pro' else 'plus' end,
   status=case when plan='pro' and expires_at>now() then status else 'grace' end,expires_at=greatest(coalesce(expires_at,now()),old_until,now()+interval '30 days'),plus_since=coalesce(plus_since,now()),updated_at=now() where user_id=u;
  result:=review_billing.snapshot_v1(u);
 end if;
 return result||jsonb_build_object('admin',exists(select 1 from review_private.game_admins where user_id=u));
end $$;
