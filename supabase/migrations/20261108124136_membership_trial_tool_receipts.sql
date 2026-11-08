alter function review_billing.server_api(text,jsonb) rename to server_api_v2;
create function review_billing.server_api(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=(payload->>'userId')::uuid;s jsonb;op review_billing.credit_operations;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'membership_server_only' using errcode='42501';end if;
 if action<>'authorize-tool' then return review_billing.server_api_v2(action,payload);end if;
 s:=review_billing.snapshot(u);
 if payload->>'feature'<>'workspace' then raise exception 'membership_feature';end if;
 if s->>'plan' in ('plus','pro') then return jsonb_build_object('permitted',true,'feature','workspace');end if;
 select * into op from review_billing.credit_operations where user_id=u and request_id=payload->>'requestId' and status='committed' and finished_at>now()-interval '15 minutes' and trial in ('plus','pro');
 if not found then raise exception 'membership_upgrade';end if;
 return jsonb_build_object('permitted',true,'feature','workspace','authorizationRequestId',op.request_id);
end $$;
revoke all on function review_billing.server_api(text,jsonb) from public,anon,authenticated;
grant execute on function review_billing.server_api(text,jsonb) to service_role;
create or replace function public.review_membership_server(action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select review_billing.server_api(action,payload)$$;
