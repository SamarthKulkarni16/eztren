-- Fixes: rank was assigned correctly (e.g. 'A') but league was always
-- hardcoded to the bottom tier regardless. League should be derived from
-- rank length: 1 letter = One Alphabet League, 2 = Two Alphabet League,
-- 3+ = Alphabet League. Also adds rank_since so the Me page can show a
-- live "time at current rank" counter.
--
-- Note: `league` is a Postgres enum (eztren.league_type), not plain
-- text, so the CASE expression needs an explicit cast.

alter table eztren.players add column if not exists rank_since timestamptz not null default now();

create or replace function eztren.assign_next_rank() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.rank is null then
      new.rank := eztren.next_rank();
    end if;
    new.rank_since := now();
  elsif tg_op = 'UPDATE' then
    if new.rank is distinct from old.rank then
      new.rank_since := now();
    end if;
  end if;

  new.league := (case
    when length(new.rank) = 1 then 'One Alphabet League'
    when length(new.rank) = 2 then 'Two Alphabet League'
    else 'Alphabet League'
  end)::eztren.league_type;

  return new;
end;
$$;

drop trigger if exists trg_assign_rank on eztren.players;
create trigger trg_assign_rank
  before insert or update of rank on eztren.players
  for each row execute function eztren.assign_next_rank();

-- Backfill anyone already in the table (e.g. you, currently mis-filed).
update eztren.players set
  league = (case
    when length(rank) = 1 then 'One Alphabet League'
    when length(rank) = 2 then 'Two Alphabet League'
    else 'Alphabet League'
  end)::eztren.league_type,
  rank_since = coalesce(rank_since, joined_at);
