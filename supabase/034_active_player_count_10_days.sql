-- Bump the "active player" window from 3 days to 10 days.
-- The app (lib/queries.ts getActivePlayerCount) now calls this RPC with
-- days: 10 explicitly, so this migration just brings the function's
-- default in line with that so the two never drift out of sync.
create or replace function eztren.get_active_player_count(days int default 10)
returns bigint
language sql
security definer
set search_path = eztren, public
as $$
  select count(distinct player_id) from (
    select player_a_id as player_id from eztren.matches
    where match_date >= current_date - days
    union
    select player_b_id as player_id from eztren.matches
    where match_date >= current_date - days
  ) active_players;
$$;

grant execute on function eztren.get_active_player_count(int) to anon, authenticated;
