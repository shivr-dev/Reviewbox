create or replace function public.review_catalog_list(filters jsonb) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare answer jsonb; batch_size integer:=least(24,greatest(1,coalesce((filters->>'limit')::integer,12))); sort_order text:=coalesce(filters->>'sort','updated'); cursor_key text:=coalesce(filters->>'cursor','');
begin
 if octet_length(filters::text)>16000 or length(cursor_key)>2500 then raise exception 'Invalid catalog request';end if;
 with source as (
   select p.*,case when sort_order='installed' then case when (filters->'installed') ? p.id::text then '0' else '1' end else '' end ||
     case when sort_order='name' then lower(p.title) else lpad((9999999999999999-(extract(epoch from case when sort_order='published' then coalesce(p.created_at,p.updated_at) else p.updated_at end)*1000000)::bigint)::text,16,'0') end || '|' || p.id::text as sort_key
   from public.review_public_packs p
   where p.published and p.visibility='public' and p.review_status<>'blocked'
   and (coalesce(filters->>'id','')='' or p.id::text=filters->>'id')
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
