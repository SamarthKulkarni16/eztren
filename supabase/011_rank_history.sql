-- Adds a proper rank-history log: every rank a player has ever held, when
-- it started, and when it ended (null = current). This powers:
--   - "at this rank for Xh Ym" on profiles (already had this for current
--     rank only — now it also covers past ranks)
--   - public "search a rank, see who's held it and for how long"
--   - clickable player profiles from the Ladder

create table if not exists eztren.rank_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references eztren.players(id) on delete cascade,
  rank text not null,
  league eztren.league_type not null,
  started_at timestamptz not null,
  ended_at timestamptz
);

create index if not exists rank_history_player_idx on eztren.rank_history (player_id);
create index if not exists rank_history_rank_idx on eztren.rank_history (rank);

alter table eztren.rank_history enable row level security;
create policy "public read rank history" on eztren.rank_history for select using (true);
grant select on eztren.rank_history to anon, authenticated;

-- Log every rank change automatically. Runs AFTER the existing
-- assign_next_rank trigger has already finalized rank/league/rank_since.
create or replace function eztren.record_rank_history() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into eztren.rank_history (player_id, rank, league, started_at)
    values (new.id, new.rank, new.league, new.rank_since);
  elsif tg_op = 'UPDATE' then
    if new.rank is distinct from old.rank then
      update eztren.rank_history
      set ended_at = new.rank_since
      where player_id = new.id and ended_at is null;

      insert into eztren.rank_history (player_id, rank, league, started_at)
      values (new.id, new.rank, new.league, new.rank_since);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_record_rank_history on eztren.players;
create trigger trg_record_rank_history
  after insert or update of rank on eztren.players
  for each row execute function eztren.record_rank_history();

-- Backfill: give every existing player an open history row for their
-- current rank, so they show up in search/profile immediately.
insert into eztren.rank_history (player_id, rank, league, started_at)
select id, rank, league, rank_since
from eztren.players p
where not exists (
  select 1 from eztren.rank_history rh where rh.player_id = p.id
);
