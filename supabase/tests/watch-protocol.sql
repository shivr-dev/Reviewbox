-- Synthetic fixtures only. The transaction rolls back every row, including Auth users.
begin;
do $$
declare
 v_public uuid:=gen_random_uuid(); v_owner uuid:=gen_random_uuid(); v_other uuid:=gen_random_uuid();
 v_device jsonb; v_status jsonb; v_result jsonb; v_record jsonb;
 v_at timestamptz:=now()-interval '1 hour'; v_request uuid:=gen_random_uuid();
begin
 insert into auth.users(id,aud,role,email,created_at,updated_at)
 values(v_owner,'authenticated','authenticated',v_owner||'@reviewbox-test.invalid',now(),now()),
       (v_other,'authenticated','authenticated',v_other||'@reviewbox-test.invalid',now(),now());
 perform public.review_device_api('begin',jsonb_build_object('deviceHash',repeat('a',64),'codeHash',repeat('d',64),'challenge',repeat('e',64),'name','Protocol test','platform','Android 11','ipHash','test'));
 v_result:=public.review_device_api('claim',jsonb_build_object('deviceHash',repeat('a',64),'proofHash',repeat('e',64),'accessHash',repeat('b',64),'refreshHash',repeat('c',64)));
 if v_result->>'pending'<>'true' then raise exception 'Unapproved pairing granted access'; end if;
 perform public.review_device_api('approve',jsonb_build_object('codeHash',repeat('d',64)),v_owner);
 v_result:=public.review_device_api('list','{}',v_owner);
 if jsonb_array_length(v_result->'devices')<>0 or jsonb_array_length(v_result->'pairings')<>1 then raise exception 'Approved pairing disappeared before claim'; end if;
 if (v_result->'pairings'->0) ? 'challenge' or (v_result->'pairings'->0) ? 'deviceHash' then raise exception 'Pairing proof leaked'; end if;
 if jsonb_array_length(public.review_device_api('list','{}',v_other)->'pairings')<>0 then raise exception 'Pairing leaked across accounts'; end if;
 perform public.review_device_api('cancel-pairing',jsonb_build_object('deviceId',v_result#>>'{pairings,0,id}'),v_other);
 if jsonb_array_length(public.review_device_api('list','{}',v_owner)->'pairings')<>1 then raise exception 'Another account cancelled pairing'; end if;
 update review_devices.pairings p set last_poll=now()-interval '6 seconds' where p.device_hash=repeat('a',64);
 v_device:=public.review_device_api('claim',jsonb_build_object('deviceHash',repeat('a',64),'proofHash',repeat('e',64),'accessHash',repeat('b',64),'refreshHash',repeat('c',64)));
 if v_device->>'userId'<>v_owner::text then raise exception 'Wrong account'; end if;
 v_result:=public.review_device_api('list','{}',v_owner);
 if jsonb_array_length(v_result->'devices')<>1 or jsonb_array_length(v_result->'pairings')<>0 then raise exception 'Claim did not replace pending row with device'; end if;
 if public.review_device_api('claim',jsonb_build_object('deviceHash',repeat('a',64),'proofHash',repeat('e',64),'accessHash',repeat('b',64),'refreshHash',repeat('c',64)))->>'deviceId'<>v_device->>'deviceId' then raise exception 'Lost claim response created another device'; end if;
 v_status:=public.review_device_api('status',jsonb_build_object('accessHash',repeat('b',64)));

 insert into public.review_public_packs(id,owner,source_id,title,version,question_count,pack,published)
 values(v_public,v_other,'public-protocol','Public test','1',1,
 '{"manifest":{"id":"community-protocol","title":"Public test","version":"1","subject":"math"},"knowledge":[{"id":"community-protocol:n","title":"node"}],"questions":[{"id":"community-protocol:q","nodeId":"community-protocol:n","verified":true}]}',true);
 v_result:=public.review_device_api('install-public-pack',jsonb_build_object('accessHash',repeat('b',64),'publicId',v_public,'owner',v_other));
 if v_result->>'packId'<>'community-protocol' then raise exception 'Missing canonical package ID'; end if;
 if (select payload->>'verified' from public.review_records where user_id=v_owner and id='community-protocol:q')<>'false' then raise exception 'Public question bypassed review'; end if;
 if exists(select 1 from public.review_records where user_id=v_other and id like '%community-protocol%') then raise exception 'Installation wrote to publisher instead of reader'; end if;
 update public.review_records set payload=payload||'{"verified":true,"privateReview":"keep"}' where user_id=v_owner and id='community-protocol:q';
 perform public.review_device_api('install-public-pack',jsonb_build_object('accessHash',repeat('b',64),'publicId',v_public));
 if (select payload->>'privateReview' from public.review_records where user_id=v_owner and id='community-protocol:q')<>'keep' then raise exception 'Repeat download overwrote private review'; end if;
 if (select count(*) from public.review_records where user_id=v_owner and id like '%community-protocol%')<>3 then raise exception 'Duplicate public installation'; end if;
 update public.review_public_packs set published=false where id=v_public;
 begin
  perform public.review_device_api('install-public-pack',jsonb_build_object('accessHash',repeat('b',64),'publicId',v_public));
  raise exception 'Withdrawn pack was downloadable';
 exception when others then if sqlerrm='Withdrawn pack was downloadable' then raise; end if; end;
 perform public.review_device_api('revoke',jsonb_build_object('deviceId',v_device->>'deviceId'),v_other);
 perform public.review_device_api('status',jsonb_build_object('accessHash',repeat('b',64)));
 insert into public.review_records(user_id,id,kind,payload,updated_at,deleted)
 values(v_owner,'receipt-test-exam','exam','{"id":"receipt-test-exam","title":"synthetic","result":{"score":20,"maxScore":100,"credits":1}}',v_at,false);
 v_record:=jsonb_build_object('id','receipt-test-exam','kind','exam','payload',jsonb_build_object('id','receipt-test-exam','title','synthetic','result',jsonb_build_object('score',80,'maxScore',100,'credits',1)),
 'updated_at',now(),'baseUpdatedAt',v_at,'deleted',false,'commandId','synthetic-grade-1','commandHash',repeat('f',64));
 v_result:=public.review_device_api('push',jsonb_build_object('accessHash',repeat('b',64),'generation',v_status->>'generation','records',jsonb_build_array(v_record)));
 if (v_result->>'changed')::integer<>1 then raise exception 'First delivery missing'; end if;
 v_result:=public.review_device_api('push',jsonb_build_object('accessHash',repeat('b',64),'generation',v_status->>'generation','records',jsonb_build_array(v_record)));
 if (v_result->>'changed')::integer<>0 then raise exception 'Duplicate delivery repeated a write'; end if;
 v_result:=public.review_device_api('receipts',jsonb_build_object('accessHash',repeat('b',64),'ids',jsonb_build_array('synthetic-grade-1')));
 if v_result->>'synthetic-grade-1'<>repeat('f',64) then raise exception 'Missing durable receipt'; end if;
 begin
  perform public.review_device_api('push',jsonb_build_object('accessHash',repeat('b',64),'generation',v_status->>'generation','records',jsonb_build_array(v_record||'{"commandHash":"0000000000000000000000000000000000000000000000000000000000000000"}')));
  raise exception 'REUSED_COMMAND_ACCEPTED';
 exception when others then if SQLERRM='REUSED_COMMAND_ACCEPTED' then raise; end if; end;
 v_result:=public.review_device_api('pull',jsonb_build_object('accessHash',repeat('b',64),'generation',v_status->>'generation'));
 if (select array_agg(r->>'id' order by r->>'id') from jsonb_array_elements(v_result->'records') r)<>array['community-protocol:n','pack:community-protocol','receipt-test-exam'] or not exists(select 1 from jsonb_array_elements(v_result->'records') r where r->>'id'='receipt-test-exam' and r#>>'{payload,result,score}'='80') then raise exception 'Pull/account isolation failed'; end if;
 -- New clients browse manifests and materials before downloading exact question identities.
 insert into public.review_records(user_id,id,kind,payload,updated_at,deleted) values
 (v_owner,'synthetic-material','material','{"id":"synthetic-material","title":"private reading"}',v_at,false),
 (v_owner,'synthetic-pack','pack','{"id":"synthetic-pack","title":"my package"}',v_at,false),
 (v_owner,'synthetic-q','question','{"id":"synthetic-q","subject":"math"}',v_at,false);
 v_result:=public.review_device_api('pull',jsonb_build_object('accessHash',repeat('b',64),'generation',v_status->>'generation','questionIds','[]'::jsonb));
 if not exists(select 1 from jsonb_array_elements(v_result->'records') r where r->>'id'='synthetic-material') or not exists(select 1 from jsonb_array_elements(v_result->'records') r where r->>'id'='synthetic-pack') or exists(select 1 from jsonb_array_elements(v_result->'records') r where r->>'id'='synthetic-q') then raise exception 'Manifest/material download filtering failed'; end if;
 v_record:=jsonb_build_object('id','settings','kind','setting','payload','{"id":"settings","dailyMinutes":20}'::jsonb,'expectedPayload',null,'updated_at',now(),'deleted',false,'commandId','synthetic-preferences','commandHash',repeat('7',64));
 perform public.review_device_api('push',jsonb_build_object('accessHash',repeat('b',64),'generation',v_status->>'generation','records',jsonb_build_array(v_record)));
 begin
  perform public.review_device_api('push',jsonb_build_object('accessHash',repeat('b',64),'generation',v_status->>'generation','records',jsonb_build_array(v_record||jsonb_build_object('commandId','stale-preferences','payload','{"id":"settings","dailyMinutes":40}'::jsonb))));
  raise exception 'STALE_SETTINGS_ACCEPTED';
 exception when others then if SQLERRM='STALE_SETTINGS_ACCEPTED' then raise; end if; end;
 if exists(select 1 from review_devices.command_receipts where device_id=(v_device->>'deviceId')::uuid and command_id='stale-preferences') then raise exception 'Failed transaction retained its receipt'; end if;
 insert into public.review_records(user_id,id,kind,payload,updated_at,deleted) values(v_owner,'synthetic-course','job','{"id":"synthetic-course","kind":"course","sections":[]}',v_at,false);
 v_record:=jsonb_build_object('id','course-section:synthetic','kind','job','payload','{"id":"course-section:synthetic","kind":"course-section","courseId":"synthetic-course","section":{}}'::jsonb,'expectedPayload',null,'updated_at',now(),'deleted',false,'commandId','synthetic-course-section','commandHash',repeat('8',64));
 perform public.review_device_api('push',jsonb_build_object('accessHash',repeat('b',64),'generation',v_status->>'generation','records',jsonb_build_array(v_record)));
 perform public.review_device_api('refresh',jsonb_build_object('refreshHash',repeat('c',64),'nextAccessHash',repeat('1',64),'nextRefreshHash',repeat('2',64),'requestId',v_request));
 perform public.review_device_api('refresh',jsonb_build_object('refreshHash',repeat('c',64),'nextAccessHash',repeat('1',64),'nextRefreshHash',repeat('2',64),'requestId',v_request));
 begin
  perform public.review_device_api('status',jsonb_build_object('accessHash',repeat('b',64)));
  raise exception 'OLD_ACCESS_ACCEPTED';
 exception when others then if SQLERRM='OLD_ACCESS_ACCEPTED' then raise; end if; end;
 perform public.review_device_api('revoke',jsonb_build_object('deviceId',v_device->>'deviceId'),v_owner);
 begin
  perform public.review_device_api('status',jsonb_build_object('accessHash',repeat('1',64)));
  raise exception 'REVOKED_TOKEN_ACCEPTED';
 exception when others then if SQLERRM='REVOKED_TOKEN_ACCEPTED' then raise; end if; end;
end $$;
rollback;
