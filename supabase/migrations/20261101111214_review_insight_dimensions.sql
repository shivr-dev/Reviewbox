alter table review_product.usage_daily add column browser text not null default 'Other', add column build text not null default 'unknown';
alter table review_product.usage_daily drop constraint usage_daily_pkey;
alter table review_product.usage_daily add primary key(day,area,event,device,duration,browser,build);
create or replace function public.review_product_operation(operation text, payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  r review_product.feedback; n integer; item jsonb; out_rows jsonb; receipt text;
begin
  -- Retention is enforced on every ingest/worker call, including quiet days' scheduled drains.
  delete from review_product.quotas where day < current_date - 7;
  delete from review_product.usage_daily where day < current_date - 90;
  update review_product.feedback set description='', environment=null
    where status='submitted' and submitted_at < now()-interval '30 days' and description<>'';
  delete from review_product.feedback where created_at < now()-interval '90 days';
  if operation = 'submit' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(payload->>'id',3));
    select * into r from review_product.feedback where id=(payload->>'id')::uuid;
    if found then
      if r.receipt_hash <> payload->>'receiptHash' then return jsonb_build_object('error','回执不匹配。'); end if;
      return jsonb_build_object('id',r.id,'status',r.status,'url',r.issue_url);
    end if;
    insert into review_product.quotas(kind,bucket,count) values('feedback',payload->>'quotaKey',1)
      on conflict(day,kind,bucket) do update set count=review_product.quotas.count+1 returning count into n;
    if n>5 then return jsonb_build_object('error','今天反馈较多，请明天再试。'); end if;
    insert into review_product.quotas(kind,bucket,count) values('feedback','global',1)
      on conflict(day,kind,bucket) do update set count=review_product.quotas.count+1 returning count into n;
    if n>100 then return jsonb_build_object('error','反馈暂时繁忙，请稍后再试。'); end if;
    insert into review_product.feedback(id,receipt_hash,title,description,area,environment)
      values((payload->>'id')::uuid,payload->>'receiptHash',payload->>'title',payload->>'description',payload->>'area',payload->'environment') returning * into r;
    return jsonb_build_object('id',r.id,'status',r.status,'url',r.issue_url);
  elsif operation = 'status' then
    select * into r from review_product.feedback where id=(payload->>'id')::uuid and receipt_hash=payload->>'receiptHash';
    if not found then return jsonb_build_object('error','未找到反馈，或回执已过期。'); end if;
    return jsonb_build_object('id',r.id,'status',r.status,'url',r.issue_url);
  elsif operation = 'metrics' then
    n := jsonb_array_length(payload->'events');
    insert into review_product.quotas(kind,bucket,count) values('metrics',payload->>'quotaKey',n)
      on conflict(day,kind,bucket) do update set count=review_product.quotas.count+excluded.count returning count into n;
    if n>250 then return jsonb_build_object('error','Metrics limit'); end if;
    insert into review_product.quotas(kind,bucket,count) values('metrics','global',jsonb_array_length(payload->'events'))
      on conflict(day,kind,bucket) do update set count=review_product.quotas.count+excluded.count returning count into n;
    if n>50000 then return jsonb_build_object('error','Metrics capacity'); end if;
    for item in select value from jsonb_array_elements(payload->'events') loop
      insert into review_product.usage_daily(day,area,event,device,duration,browser,build,count)
        values(current_date,item->>'area',item->>'event',item->>'device',item->>'duration',coalesce(item->>'browser','Other'),coalesce(item->>'build','unknown'),1)
        on conflict(day,area,event,device,duration,browser,build) do update set count=review_product.usage_daily.count+1;
    end loop;
    return jsonb_build_object('ok',true);
  elsif operation = 'claim' then
    update review_product.feedback set status='failed' where attempts>=8 and status in ('queued','retry','sending') and (lease_until is null or lease_until<now());
    with picked as (
      select id from review_product.feedback where attempts<8 and next_attempt<=now() and
        (status in ('queued','retry') or (status='sending' and lease_until<now()))
        order by created_at for update skip locked limit 10
    ), claimed as (
      update review_product.feedback f set status='sending',attempts=attempts+1,lease=gen_random_uuid(),lease_until=now()+interval '15 minutes'
      from picked where f.id=picked.id returning f.*
    ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'lease',lease,'title',title,'description',description,'area',area,'environment',environment,'createdAt',created_at)),'[]'::jsonb)
      into out_rows from claimed;
    return jsonb_build_object('reports',out_rows);
  elsif operation = 'ack' then
    update review_product.feedback set status='submitted',submitted_at=now(),issue_url=payload->>'url',lease=null,lease_until=null
      where id=(payload->>'id')::uuid and lease=(payload->>'lease')::uuid and status='sending' returning * into r;
    if not found then return jsonb_build_object('error','Delivery lease expired'); end if;
    return jsonb_build_object('ok',true);
  elsif operation = 'release' then
    update review_product.feedback set status=case when attempts>=8 then 'failed' else 'retry' end,
      next_attempt=now()+ make_interval(mins=>least(1440,10*power(2,attempts)::integer)),lease=null,lease_until=null
      where id=(payload->>'id')::uuid and lease=(payload->>'lease')::uuid and status='sending';
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Unsupported product operation';
end $$;
revoke all on function public.review_product_operation(text,jsonb) from public,anon,authenticated;
grant execute on function public.review_product_operation(text,jsonb) to service_role;
