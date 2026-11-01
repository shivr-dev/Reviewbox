-- Pack removals survive uploads from a client that has not yet seen the removal.
-- Existing ownership RLS and the immutable-event merge rule remain unchanged.
create index if not exists review_pack_removal_owner on public.review_records(user_id)
where kind='job' and payload->>'kind'='pack-removal' and not deleted;

create function public.review_pack_removal_before_write()
returns trigger language plpgsql set search_path='' as $$
declare g jsonb; acknowledged boolean;
begin
 if new.deleted or new.kind not in ('pack','question','node','material') then return new; end if;
 for g in select r.payload from public.review_records r
   where r.user_id=new.user_id and r.kind='job' and not r.deleted
   and r.payload->>'kind'='pack-removal' and r.payload->>'status'='removed'
 loop
   if (new.kind='pack' and new.payload->>'id'=g->>'packId') or
      (new.kind='question' and (g->'questionIds') ? new.id) or
      (new.kind='node' and (g->'nodeIds') ? new.id) or
      (new.kind='material' and (g->'materialIds') ? new.id) then
     acknowledged := (new.kind='pack' and new.payload->>'restoredFromRemoval'=g->>'operationId')
       or (new.payload->'_packRestore'->>'packId'=g->>'packId' and new.payload->'_packRestore'->>'operationId'=g->>'operationId')
       or exists(select 1 from public.review_records p where p.user_id=new.user_id and p.kind='pack' and not p.deleted
         and p.payload->>'id'=g->>'packId' and p.payload->>'restoredFromRemoval'=g->>'operationId');
     if not coalesce(acknowledged,false) then new.deleted:=true; end if;
   end if;
 end loop;
 return new;
end $$;
revoke all on function public.review_pack_removal_before_write() from public,anon,authenticated;
create trigger review_pack_removal_before_write before insert or update on public.review_records
for each row execute function public.review_pack_removal_before_write();

-- A marker may be received after its content rows because sync is batched.
create function public.review_pack_removal_sweep()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.kind='job' and not new.deleted and new.payload->>'kind'='pack-removal' and new.payload->>'status'='removed' then
   update public.review_records r set deleted=true,updated_at=greatest(r.updated_at,new.updated_at)
   where r.user_id=new.user_id and not r.deleted and (
     (r.kind='pack' and r.payload->>'id'=new.payload->>'packId') or
     (r.kind='question' and (new.payload->'questionIds') ? r.id) or
     (r.kind='node' and (new.payload->'nodeIds') ? r.id) or
     (r.kind='material' and (new.payload->'materialIds') ? r.id)
   ) and not coalesce(r.payload->'_packRestore'->>'operationId'=new.payload->>'operationId',false)
     and not coalesce(r.kind='pack' and r.payload->>'restoredFromRemoval'=new.payload->>'operationId',false);
 end if;
 return new;
end $$;
revoke all on function public.review_pack_removal_sweep() from public,anon,authenticated;
create trigger review_pack_removal_sweep after insert or update on public.review_records
for each row execute function public.review_pack_removal_sweep();
