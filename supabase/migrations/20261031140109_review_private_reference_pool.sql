-- Private reference corpus; never a public question bank or a browser bundle.
create table public.review_reference_items (
 owner uuid not null references auth.users(id) on delete cascade,
 id text not null,content_hash text not null check(length(content_hash)=64),subject text not null,
 question_type text not null,prompt text not null check(length(prompt)<=30000),answer text not null,
 explanation text not null,options jsonb not null default '[]',image_refs jsonb not null default '[]',
 grade jsonb,difficulty jsonb,concepts jsonb not null default '[]',search_terms text[] not null,
 qa_status text not null,provenance jsonb not null,raw_record jsonb not null,
 created_at timestamptz not null default now(),primary key(owner,id),unique(owner,content_hash)
);
alter table public.review_reference_items enable row level security;
revoke all on public.review_reference_items from public,anon,authenticated;
grant all on public.review_reference_items to service_role;
grant select on public.review_reference_items to authenticated;
create policy "Owner can read private references" on public.review_reference_items for select to authenticated using ((select auth.uid())=owner);
create index review_reference_subject on public.review_reference_items(owner,subject);
create index review_reference_terms on public.review_reference_items using gin(search_terms);

create function public.review_reference_search(target_subject text,target_node text,terms text[],take integer default 12)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(r)-'owner'-'search_terms'-'raw_record'), '[]'::jsonb) from (
   select i.* from public.review_reference_items i
   where i.owner=(select auth.uid()) and i.subject=target_subject and cardinality(terms) between 1 and 160
     and i.search_terms && terms
     and exists(select 1 from public.review_records e where e.user_id=(select auth.uid()) and e.kind='event' and not e.deleted
       and e.payload->>'nodeId'=target_node and (e.payload->>'outcome'='wrong' or e.payload->>'outcome'='unsure'))
   order by (select count(*) from unnest(i.search_terms) t where t=any(terms)) desc,i.content_hash
   limit least(greatest(take,1),12)
 ) r;
$$;
revoke all on function public.review_reference_search(text,text,text[],integer) from public,anon;
grant execute on function public.review_reference_search(text,text,text[],integer) to authenticated;

-- Only the trusted ingestion process can mutate the corpus; duplicates preserve
-- all provenance instead of overwriting the source with the most recent import.
create function public.review_reference_ingest(target_owner uuid,items jsonb)
returns integer language plpgsql set search_path='' as $$
declare item jsonb;counted integer:=0;
begin
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)>100 then raise exception 'Invalid reference batch'; end if;
 for item in select * from jsonb_array_elements(items) loop
  insert into public.review_reference_items(owner,id,content_hash,subject,question_type,prompt,answer,explanation,options,image_refs,grade,difficulty,concepts,search_terms,qa_status,provenance,raw_record)
  values(target_owner,item->>'id',item->>'content_hash',item->>'subject',item->>'question_type',item->>'prompt',item->>'answer',item->>'explanation',item->'options',item->'image_refs',item->'grade',item->'difficulty',item->'concepts',array(select jsonb_array_elements_text(item->'search_terms')),item->>'qa_status',item->'provenance',item->'raw_record')
  on conflict(owner,content_hash) do update set provenance=(select jsonb_agg(distinct p) from jsonb_array_elements(public.review_reference_items.provenance || excluded.provenance) p);
  counted:=counted+1;
 end loop;
 return counted;
end $$;
revoke all on function public.review_reference_ingest(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.review_reference_ingest(uuid,jsonb) to service_role;
