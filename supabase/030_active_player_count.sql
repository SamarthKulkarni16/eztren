-- "Active player" is a hidden internal rule, not a badge or profile flag:
-- someone who has been in at least one battle (a row in eztren.matches,
-- as either side, judged or not — the act of playing is what counts,
-- not the outcome) within the last N days. Default window was 3 days;
-- see supabase/034_active_player_count_10_days.sql for the current
-- 10-day default (the app always passes days explicitly, so this only
-- matters if the RPC is ever called without an argument).
--
-- This backs the flagship-league unlock counter (see lib/config.ts /
-- getActivePlayerCount() in lib/queries.ts) — replacing the old raw
-- signup count, which could hit 100 with a pile of registered-but-idle
-- accounts and still trigger the unlock. Now it only counts people
-- actually playing.
--
-- Unlike player_ratings/recompute_letters, this IS granted to
-- anon/authenticated: it's just a number, not sensitive, and the
-- public site needs to read it directly (via the anon key) to render
-- the live "X/100 joined" counter without a service-role round trip.
create or replace function eztren.get_active_player_count(days int default 3)
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
