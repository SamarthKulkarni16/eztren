-- Run this in the SQL Editor of the same project (after 001/schema.sql).
-- Adds automatic "lowest current rank + 1" assignment for new players.

-- ── Rank <-> integer, using the same A,B,...Z,AA,AB,... sequence shown on the site ──
create or replace function eztren.rank_to_int(r text) returns bigint
language plpgsql immutable as $$
declare
  result bigint := 0;
begin
  for i in 1..length(r) loop
    result := result * 26 + (ascii(upper(substring(r from i for 1))) - ascii('A') + 1);
  end loop;
  return result;
end;
$$;

create or replace function eztren.int_to_rank(n bigint) returns text
language plpgsql immutable as $$
declare
  result text := '';
  num bigint := n;
begin
  while num > 0 loop
    num := num - 1;
    result := chr(65 + (num % 26)) || result;
    num := num / 26;
  end loop;
  return result;
end;
$$;

create or replace function eztren.next_rank() returns text
language plpgsql as $$
declare
  max_int bigint;
begin
  select coalesce(max(eztren.rank_to_int(rank)), 0) into max_int from eztren.players;
  return eztren.int_to_rank(max_int + 1);
end;
$$;

-- ── Auto-assign rank + league on insert whenever rank isn't explicitly given ──
alter table eztren.players alter column rank drop not null;

create or replace function eztren.assign_next_rank() returns trigger
language plpgsql as $$
begin
  if new.rank is null then
    new.rank := eztren.next_rank();
  end if;
  if new.league is null then
    new.league := 'Alphabet League';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_rank on eztren.players;
create trigger trg_assign_rank
  before insert on eztren.players
  for each row execute function eztren.assign_next_rank();

-- ── Public registration entry point ──
-- The client can only ever pass name + country. Rank, league, wins,
-- losses, judged_matches are always set by the database, never the caller
-- — this is what stops someone from crafting a raw insert that claims
-- rank 'A' or a fake win count.
create or replace function eztren.register_player(p_name text, p_country text)
returns eztren.players
language plpgsql
security definer
set search_path = eztren
as $$
declare
  new_row eztren.players;
begin
  insert into eztren.players (name, country)
  values (p_name, p_country)
  returning * into new_row;
  return new_row;
end;
$$;

revoke all on function eztren.register_player(text, text) from public;
grant execute on function eztren.register_player(text, text) to anon, authenticated;
