-- ══════════════════════════════════════════════════════════════════════
-- Hidden Elo layer under the public letter ranks.
--
-- Design:
--   • player_ratings is a private table. It is NEVER granted to anon/
--     authenticated, so it is invisible to the site and the API even
--     though the eztren schema itself is exposed (schema USAGE grants
--     don't imply table access — grants are per-table). RLS is also
--     enabled with zero policies, as a second lock on the same door.
--     The only way to read it is the Supabase SQL editor / a service-role
--     key — i.e. you.
--   • Every judged match (win, loss, or tie) nudges both players'
--     hidden rating via standard Elo. K=32 for a player's first 20
--     matches (fast placement), K=16 after (stable, harder to move —
--     this is also what makes "played 20, won 15" beat "played 3, won
--     3": more matches at K=16 converges toward true skill instead of
--     being one lucky streak away from the top).
--   • Public letters are NOT touched live. eztren.recompute_letters()
--     re-sorts everyone by hidden rating and reassigns A, B, C...
--     Run it on a schedule (weekly is a good start) via pg_cron or a
--     GitHub Actions cron hitting this RPC with your service_role key.
--     Nobody sees a mid-week jump; nobody sees the number that moved
--     them. Letters just quietly reflect Wednesday's snapshot.
--   • Inactivity isn't punished by a decay term here — it's punished
--     automatically by relative drift: if you don't play, your rating
--     sits still while active players' ratings move past you, so your
--     letter erodes on its own without anything targeting you
--     specifically. That's what stops the "I had exams, lost 150
--     ranks" outcome — nothing is ever explicitly subtracted from an
--     inactive player, they just get gently overtaken.
-- ══════════════════════════════════════════════════════════════════════

-- ── Private rating table (no grants to anon/authenticated — see note above) ──
create table if not exists eztren.player_ratings (
  player_id uuid primary key references eztren.players(id) on delete cascade,
  rating numeric not null default 1200,
  matches_played int not null default 0,
  last_played_at timestamptz
);

alter table eztren.player_ratings enable row level security;
-- Deliberately no policies created: RLS with zero policies = default deny
-- for every role except the table owner / service_role. Combined with no
-- grant below, anon and authenticated can't see this table even exists.

-- ── Elo update, fired whenever a match gets judged ──
create or replace function eztren.apply_elo_update() returns trigger
language plpgsql
security definer
set search_path = eztren, public
as $$
declare
  a_rating numeric;
  b_rating numeric;
  a_matches int;
  b_matches int;
  a_k int;
  b_k int;
  a_expected numeric;
  b_expected numeric;
  a_score numeric;
  b_score numeric;
begin
  if new.judge_status = 'judged' and old.judge_status is distinct from 'judged' then

    insert into eztren.player_ratings (player_id)
    values (new.player_a_id)
    on conflict (player_id) do nothing;

    insert into eztren.player_ratings (player_id)
    values (new.player_b_id)
    on conflict (player_id) do nothing;

    select rating, matches_played into a_rating, a_matches
    from eztren.player_ratings where player_id = new.player_a_id;

    select rating, matches_played into b_rating, b_matches
    from eztren.player_ratings where player_id = new.player_b_id;

    a_k := case when a_matches < 20 then 32 else 16 end;
    b_k := case when b_matches < 20 then 32 else 16 end;

    a_expected := 1.0 / (1 + power(10, (b_rating - a_rating) / 400.0));
    b_expected := 1.0 / (1 + power(10, (a_rating - b_rating) / 400.0));

    if new.winner_id is null then
      a_score := 0.5;
      b_score := 0.5;
    elsif new.winner_id = new.player_a_id then
      a_score := 1;
      b_score := 0;
    else
      a_score := 0;
      b_score := 1;
    end if;

    update eztren.player_ratings
    set rating = rating + a_k * (a_score - a_expected),
        matches_played = matches_played + 1,
        last_played_at = now()
    where player_id = new.player_a_id;

    update eztren.player_ratings
    set rating = rating + b_k * (b_score - b_expected),
        matches_played = matches_played + 1,
        last_played_at = now()
    where player_id = new.player_b_id;

  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_elo_update on eztren.matches;
create trigger trg_apply_elo_update
  after update of judge_status on eztren.matches
  for each row execute function eztren.apply_elo_update();

-- ── Weekly (or whatever cadence you pick) letter recompute ──
-- Re-sorts ALL players by hidden rating (unrated players default to 1200,
-- ties broken by who joined earliest) and reassigns A, B, C... AA, AB...
-- Reuses your existing int_to_rank(); reuses the existing trg_assign_rank
-- trigger to set league + rank_since; reuses trg_record_rank_history to
-- log the change. No new plumbing needed on that side.
create or replace function eztren.recompute_letters() returns void
language plpgsql
security definer
set search_path = eztren, public
as $$
declare
  r record;
  i bigint := 0;
  new_rank text;
begin
  for r in
    select p.id
    from eztren.players p
    left join eztren.player_ratings pr on pr.player_id = p.id
    order by coalesce(pr.rating, 1200) desc, p.joined_at asc
  loop
    i := i + 1;
    new_rank := eztren.int_to_rank(i);
    if new_rank is distinct from (select rank from eztren.players where id = r.id) then
      update eztren.players set rank = new_rank where id = r.id;
    end if;
  end loop;
end;
$$;

-- No grants on player_ratings or either function above to anon/authenticated
-- — intentional. Call recompute_letters() only from the SQL editor or a
-- service_role-authenticated job (see scheduling note at bottom of file).

-- ── Backfill: give every existing player a starting rating row ──
insert into eztren.player_ratings (player_id, rating, matches_played)
select id, 1200, wins + losses from eztren.players
on conflict (player_id) do nothing;

-- ══════════════════════════════════════════════════════════════════════
-- Scheduling recompute_letters() — pick ONE:
--
-- Option A (simplest, if pg_cron is enabled on your Supabase project —
-- Dashboard → Database → Extensions → search "pg_cron" → Enable):
--
--   select cron.schedule(
--     'eztren-weekly-recompute',
--     '0 3 * * 1',                      -- every Monday 03:00 UTC
--     $$ select eztren.recompute_letters(); $$
--   );
--
-- Option B (matches your existing GitHub Actions cron pattern, e.g. your
-- "Ping" repo): a scheduled workflow that POSTs to Supabase's REST RPC
-- endpoint using the service_role key (never the anon key) —
--
--   curl -X POST \
--     "https://rrwycwlahzcxldowvfnm.supabase.co/rest/v1/rpc/recompute_letters" \
--     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
--     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
--     -H "Content-Type: application/json" -d '{}'
--
--   Store SUPABASE_SERVICE_ROLE_KEY as a GitHub Actions secret, never in
--   code. This key bypasses RLS entirely, so keep the workflow file
--   private and don't echo the key in logs.
-- ══════════════════════════════════════════════════════════════════════
