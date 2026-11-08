-- Extend the existing content table. Its RLS/grants remain private to the gateway.
alter table public.review_public_packs add column if not exists visibility text not null default 'public' check(visibility in ('public','private'));
alter table public.review_public_packs add column if not exists review_status text not null default 'unreviewed' check(review_status in ('unreviewed','reviewed','blocked'));
alter table public.review_public_packs add column if not exists created_at timestamptz;
alter table public.review_public_packs add column if not exists catalog jsonb not null default '{}'::jsonb;

create or replace function public.review_catalog_metadata() returns trigger language plpgsql security invoker set search_path='' as $$
declare manifest jsonb:=new.pack->'manifest'; declared jsonb:=coalesce(manifest->'catalog','{}'::jsonb); total integer; explained integer; diagrams integer;
begin
 select count(*),count(*) filter(where length(coalesce(q->>'explanation',''))>0),count(*) filter(where q->'diagram' is not null and q->'diagram'<>'null'::jsonb) into total,explained,diagrams from jsonb_array_elements(new.pack->'questions') q;
 new.catalog:=jsonb_build_object(
 'subject',manifest->>'subject','grade',left(declared->>'grade',50),'curriculum',left(declared->>'curriculum',100),'language',left(declared->>'language',20),
 'author_display_name',case when declared->>'author_display_name' ~ '[@\r\n]' then null else left(declared->>'author_display_name',60) end,
 'difficulty',declared->>'difficulty','content_types',coalesce(declared->'content_types','["practice"]'::jsonb),'exam_tags',coalesce(declared->'exam_tags','[]'::jsonb),
 'license_declaration',left(declared->>'license_declaration',200),'question_types',(select coalesce(jsonb_agg(distinct q->>'type'),'[]'::jsonb) from jsonb_array_elements(new.pack->'questions') q),
 'knowledge_tags',(select coalesce(jsonb_agg(n->>'title'),'[]'::jsonb) from (select value n from jsonb_array_elements(new.pack->'knowledge') limit 50) nodes),
 'estimated_duration',(select coalesce(round(sum(least(3600,greatest(0,case when (q->>'expectedSeconds') ~ '^[0-9]+(\.[0-9]+)?$' then (q->>'expectedSeconds')::numeric else 0 end)))/60),0) from jsonb_array_elements(new.pack->'questions') q),
 'schema_status','unknown','answer_verification_status','not-verified','explanation_coverage',case when total>0 then round(explained::numeric/total,3) else 0 end,
 'diagram_coverage',case when total>0 then round(diagrams::numeric/total,3) else 0 end,'source_traceability','author-declared','review_status',new.review_status);
 if tg_op='INSERT' then new.created_at:=now();end if;
 return new;
end $$;
revoke all on function public.review_catalog_metadata() from public,anon,authenticated;
drop trigger if exists review_catalog_metadata_trigger on public.review_public_packs;
create trigger review_catalog_metadata_trigger before insert or update of pack,review_status on public.review_public_packs for each row execute function public.review_catalog_metadata();
-- Derive metadata on old rows without changing their published content or installed copies.
update public.review_public_packs set pack=pack;
create index if not exists review_catalog_subject on public.review_public_packs((catalog->>'subject'),updated_at desc,id) where published and visibility='public' and review_status<>'blocked';
create index if not exists review_catalog_tags on public.review_public_packs using gin(catalog jsonb_path_ops) where published and visibility='public';
create index if not exists review_catalog_search on public.review_public_packs using gin(to_tsvector('simple',title||' '||description||' '||catalog::text)) where published and visibility='public';

create or replace function public.review_catalog_list(filters jsonb) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare answer jsonb; batch_size integer:=least(24,greatest(1,coalesce((filters->>'limit')::integer,12))); sort_order text:=coalesce(filters->>'sort','updated'); cursor_key text:=coalesce(filters->>'cursor','');
begin
 if octet_length(filters::text)>16000 or length(cursor_key)>2500 then raise exception 'Invalid catalog request';end if;
 with source as (
   select p.*,case when sort_order='installed' then case when (filters->'installed') ? p.id::text then '0' else '1' end else '' end ||
     case when sort_order='name' then lower(p.title) else lpad((9999999999999999-(extract(epoch from case when sort_order='published' then coalesce(p.created_at,p.updated_at) else p.updated_at end)*1000000)::bigint)::text,16,'0') end || '|' || p.id::text as sort_key
   from public.review_public_packs p
   where p.published and p.visibility='public' and p.review_status<>'blocked'
   and (coalesce(filters->>'keyword','')='' or position(lower(filters->>'keyword') in lower(p.title||' '||p.description||' '||coalesce(p.catalog->'knowledge_tags','[]'::jsonb)::text||' '||coalesce(p.catalog->'exam_tags','[]'::jsonb)::text))>0)
   and (coalesce(filters->>'subject','')='' or p.catalog->>'subject'=filters->>'subject')
   and (coalesce(filters->>'grade','')='' or p.catalog->>'grade'=filters->>'grade')
   and (coalesce(filters->>'curriculum','')='' or p.catalog->>'curriculum'=filters->>'curriculum')
   and (coalesce(filters->>'language','')='' or p.catalog->>'language'=filters->>'language')
   and (coalesce(filters->>'difficulty','')='' or p.catalog->>'difficulty'=filters->>'difficulty')
   and (coalesce(filters->>'exam','')='' or p.catalog->'exam_tags' ? (filters->>'exam'))
   and (coalesce(filters->>'content_type','')='' or p.catalog->'content_types' ? (filters->>'content_type'))
 ), limited as (select * from source where sort_key collate "C">cursor_key collate "C" order by sort_key collate "C" limit batch_size+1), page as (select * from limited order by sort_key collate "C" limit batch_size)
 select jsonb_build_object('packs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'description',description,'version',version,'question_count',question_count,'updated_at',updated_at,'created_at',created_at,'metadata',catalog) order by sort_key collate "C") from page),'[]'::jsonb),'cursor',case when (select count(*) from limited)>batch_size then (select sort_key from page order by sort_key collate "C" desc limit 1) else null end) into answer;
 return answer;
end $$;
revoke all on function public.review_catalog_list(jsonb) from public,anon,authenticated;
grant execute on function public.review_catalog_list(jsonb) to service_role;
