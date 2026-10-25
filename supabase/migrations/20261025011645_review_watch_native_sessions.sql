create or replace function public.review_device_api(action text, body jsonb, actor uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 p review_devices.pairings; d review_devices.devices; result jsonb; changed integer;
 generation_now uuid; batch jsonb; cursor_time timestamptz; cursor_id text; item jsonb; previous_time timestamptz; saved_hash text; unseen jsonb;
begin
 if action='begin' then
  if (select count(*) from review_devices.pairings where ip_hash=body->>'ipHash' and created_at>now()-interval '10 minutes')>=15 then
   raise exception 'Pairing rate limit';
  end if;
  delete from review_devices.pairings where expires_at<now()-interval '1 day';
  insert into review_devices.pairings(device_hash,user_code_hash,challenge,device_name,platform,ip_hash)
  values(body->>'deviceHash',body->>'codeHash',body->>'challenge',body->>'name',body->>'platform',body->>'ipHash')
  returning * into p;
  return jsonb_build_object('expiresAt',p.expires_at,'interval',5);
 elsif action in ('inspect','approve','deny') then
  if actor is null then raise exception 'Authentication required'; end if;
  select * into p from review_devices.pairings where user_code_hash=body->>'codeHash' for update;
  if p.id is null or p.expires_at<=now() or p.device_id is not null then raise exception 'Pairing expired or already used'; end if;
  if p.owner is not null and p.owner<>actor then raise exception 'Pairing already approved'; end if;
  if action='inspect' then return jsonb_build_object('name',p.device_name,'platform',p.platform,'expiresAt',p.expires_at); end if;
  if action='deny' then delete from review_devices.pairings where id=p.id; return '{"ok":true}'; end if;
  if (select count(*) from review_devices.devices where owner=actor and revoked_at is null)>=10 then raise exception 'Device limit reached'; end if;
  update review_devices.pairings set owner=actor,approved_at=now() where id=p.id;
  return '{"approved":true}';
 elsif action='claim' then
  select * into p from review_devices.pairings where device_hash=body->>'deviceHash' for update;
  if p.id is null or p.expires_at<=now() or p.challenge<>body->>'proofHash' then raise exception 'Invalid or expired pairing'; end if;
  if p.device_id is not null then
   select * into d from review_devices.devices where id=p.device_id;
   if d.revoked_at is not null or d.access_hash<>body->>'accessHash' or d.refresh_hash<>body->>'refreshHash' then raise exception 'Pairing already used'; end if;
   return jsonb_build_object('deviceId',d.id,'userId',d.owner,'accessUntil',d.access_until,'refreshUntil',d.refresh_until);
  end if;
  if p.last_poll>now()-interval '4 seconds' then raise exception 'Poll too fast'; end if;
  update review_devices.pairings set last_poll=now() where id=p.id;
  if p.owner is null then return '{"pending":true}'; end if;
  if (select count(*) from review_devices.devices where owner=p.owner and revoked_at is null)>=10 then raise exception 'Device limit reached'; end if;
  insert into review_devices.devices(owner,name,platform,access_hash,refresh_hash)
  values(p.owner,p.device_name,p.platform,body->>'accessHash',body->>'refreshHash') returning * into d;
  update review_devices.pairings set device_id=d.id where id=p.id;
  return jsonb_build_object('deviceId',d.id,'userId',d.owner,'accessUntil',d.access_until,'refreshUntil',d.refresh_until);
 elsif action='refresh' then
  select * into d from review_devices.devices where refresh_hash=body->>'refreshHash' or previous_refresh_hash=body->>'refreshHash' for update;
  if d.id is null or d.revoked_at is not null or d.refresh_until<=now() then raise exception 'Device authorization revoked or expired'; end if;
  if d.previous_refresh_hash=body->>'refreshHash' then
   if d.refresh_request<>(body->>'requestId')::uuid or d.refreshed_at<now()-interval '2 minutes' or d.access_hash<>body->>'nextAccessHash' or d.refresh_hash<>body->>'nextRefreshHash' then raise exception 'Refresh token already rotated'; end if;
  else
   update review_devices.devices set previous_refresh_hash=refresh_hash,refresh_hash=body->>'nextRefreshHash',access_hash=body->>'nextAccessHash',refresh_request=(body->>'requestId')::uuid,refreshed_at=now(),access_until=now()+interval '15 minutes',refresh_until=now()+interval '30 days' where id=d.id returning * into d;
  end if;
  return jsonb_build_object('deviceId',d.id,'userId',d.owner,'accessUntil',d.access_until,'refreshUntil',d.refresh_until);
 elsif action in ('list','revoke','notifications') then
  if actor is null then raise exception 'Authentication required'; end if;
  if action='revoke' then
   update review_devices.devices set revoked_at=coalesce(revoked_at,now()) where id=(body->>'deviceId')::uuid and owner=actor;
   return '{"ok":true}';
  elsif action='notifications' then
   update review_devices.devices set notifications=(body->>'enabled')::boolean where id=(body->>'deviceId')::uuid and owner=actor;
   return '{"ok":true}';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'platform',x.platform,'createdAt',x.created_at,'lastSeen',x.last_seen,'revokedAt',x.revoked_at,'notifications',x.notifications,'history',(select coalesce(jsonb_agg(h),'[]') from (select at,uploaded,downloaded from review_devices.sync_history where device_id=x.id order by at desc limit 10) h)) order by x.created_at desc),'[]') into result from review_devices.devices x where owner=actor;
  return jsonb_build_object('devices',result);
 end if;

 -- Every device request checks revocation, including requests with an unexpired access token.
 select * into d from review_devices.devices where access_hash=body->>'accessHash' for update;
 if d.id is null or d.revoked_at is not null or d.access_until<=now() then raise exception 'Device authorization revoked or expired'; end if;
 update review_devices.devices set last_seen=now() where id=d.id;
 if action='receipts' then
  if jsonb_typeof(body->'ids')<>'array' or jsonb_array_length(body->'ids')>20 then raise exception 'Invalid receipt request'; end if;
  select coalesce(jsonb_object_agg(command_id,command_hash),'{}') into result from review_devices.command_receipts where device_id=d.id and command_id in(select jsonb_array_elements_text(body->'ids'));
  return result;
 end if;
 if action='logout' then
  update review_devices.devices set revoked_at=now() where id=d.id; return '{"ok":true}';
 end if;
 perform set_config('request.jwt.claim.sub',d.owner::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',d.owner,'role','authenticated')::text,true);
 if action='status' then
  return public.review_sync_status()||jsonb_build_object('userId',d.owner,'deviceId',d.id);
 elsif action='pull' then
  perform public.review_sync_status();
  select generation into generation_now from public.review_sync_states where user_id=d.owner for share;
  if body->>'generation' is null or generation_now<>(body->>'generation')::uuid then raise exception 'Learning data was reset. Reload before syncing.'; end if;
  cursor_time:=coalesce((body->>'cursorTime')::timestamptz,'1970-01-01'); cursor_id:=coalesce(body->>'cursorId','');
  select coalesce(jsonb_agg(to_jsonb(x)-'bytes'-'position' order by x.updated_at,x.id),'[]') into batch from
   (select x.*,sum(octet_length(payload::text)+512) over(order by updated_at,id) as bytes,row_number() over(order by updated_at,id) as position from
     (select id,kind,payload,updated_at,deleted from public.review_records where user_id=d.owner and (updated_at,id)>(cursor_time,cursor_id) order by updated_at,id limit 20) x
   ) x where x.bytes<=1500000 or x.position=1;
  insert into review_devices.sync_history(device_id,downloaded) values(d.id,jsonb_array_length(batch));
  delete from review_devices.sync_history where device_id=d.id and id not in (select id from review_devices.sync_history where device_id=d.id order by id desc limit 50);
  return jsonb_build_object('generation',generation_now,'records',batch,'hasMore',jsonb_array_length(batch)>0);
 elsif action='push' then
  if jsonb_typeof(body->'records')<>'array' or jsonb_array_length(body->'records')>20 then raise exception 'Invalid batch'; end if;
  changed:=0;
  for item in select value from jsonb_array_elements(body->'records') loop
   if length(item->>'commandId') not between 1 and 150 or length(item->>'commandHash')<>64 then raise exception 'Invalid command receipt'; end if;
   select command_hash into saved_hash from review_devices.command_receipts where device_id=d.id and command_id=item->>'commandId';
   if saved_hash is not null then
    if saved_hash<>item->>'commandHash' then raise exception 'Command ID reused with different content'; end if;
    continue;
   end if;

   insert into review_devices.command_receipts(device_id,command_id,command_hash) values(d.id,item->>'commandId',item->>'commandHash');
   if item->>'kind' not in ('event','exam','note','job') then raise exception 'Invalid native record kind'; end if;
   if item->>'kind'='job' and ((item->'payload'->>'kind')<>'session' or (item->'payload'->>'ownerDeviceId')<>d.id::text or left(item->>'id',14+36+1)<>'watch-session:'||d.id||':') then raise exception 'Invalid native session'; end if;
   if item->>'kind'='exam' then
    select updated_at into previous_time from public.review_records where user_id=d.owner and id=item->>'id' and kind='exam' and not deleted for update;
    if previous_time is null or item->>'baseUpdatedAt' is null or previous_time<>(item->>'baseUpdatedAt')::timestamptz then raise exception 'Exam changed on another device. Sync before editing.'; end if;
   end if;
   item:=jsonb_set(item,'{updated_at}',to_jsonb(clock_timestamp()));
   changed:=changed+public.review_merge_records_v2(jsonb_build_array(item),(body->>'generation')::uuid);
  end loop;
  insert into review_devices.sync_history(device_id,uploaded) values(d.id,changed);
  return jsonb_build_object('changed',changed);
 end if;
 raise exception 'Unsupported device request';
end $$;
revoke all on function public.review_device_api(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.review_device_api(text,jsonb,uuid) to service_role;
