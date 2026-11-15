-- Retire the old economy while preserving historical records and membership codes.
do $$
declare retired_rpc regprocedure;
begin
  foreach retired_rpc in array array[
    to_regprocedure('public.review_game(text,jsonb)'),
    to_regprocedure('review_private.game_api(text,jsonb)'),
    to_regprocedure('review_private.game_api_legacy(text,jsonb)')
  ] loop
    if retired_rpc is not null then
      execute format('revoke execute on function %s from public, anon, authenticated, service_role', retired_rpc);
    end if;
  end loop;
end
$$;
notify pgrst, 'reload schema';
