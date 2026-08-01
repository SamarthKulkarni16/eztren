-- The "I'm Ready" button was flipping battles.status straight to 'live' the
-- moment EITHER player clicked it, despite the UI text claiming "both
-- players need to confirm ready before this goes live." There was no
-- per-player ready state at all. This adds one and makes going live
-- atomic + require both flags, via a security-definer function so a race
-- between the two clients can't double-flip it or let one player skip the
-- other's confirmation.

alter table eztren.battles add column if not exists player_a_ready boolean not null default false;
alter table eztren.battles add column if not exists player_b_ready boolean not null default false;

-- Caller confirms ready. Only flips status to 'live' once BOTH players have
-- confirmed. Returns the resulting status so the client knows whether it's
-- still waiting on the opponent or the battle just went live.
create or replace function eztren.mark_player_ready(battle_id uuid)
returns text
language plpgsql
security definer
set search_path = eztren, public
as $$
declare
  caller_player_id uuid;
  b record;
  result_status text;
begin
  select id into caller_player_id from eztren.players where user_id = auth.uid();

  select * into b from eztren.battles where id = battle_id for update;

  if not found then
    raise exception 'battle not found';
  end if;

  if caller_player_id != b.player_a_id and caller_player_id != b.player_b_id then
    raise exception 'only a participant can ready up for this battle';
  end if;

  if b.status != 'waiting' then
    return b.status;
  end if;

  if caller_player_id = b.player_a_id then
    update eztren.battles set player_a_ready = true where id = battle_id;
  else
    update eztren.battles set player_b_ready = true where id = battle_id;
  end if;

  update eztren.battles
  set status = 'live', started_at = now()
  where id = battle_id
    and player_a_ready and player_b_ready
    and status = 'waiting';

  select status into result_status from eztren.battles where id = battle_id;
  return result_status;
end;
$$;

grant execute on function eztren.mark_player_ready(uuid) to authenticated;
