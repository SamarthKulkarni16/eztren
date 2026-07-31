-- Bug fix: the client used its own wall-clock time as the "since" anchor
-- for polling whether it had been matched (see pollForMatch in
-- lib/battle.ts). If a player's device clock ran even a couple of seconds
-- ahead of the database server's clock, that anchor would end up *after*
-- the newly created battle's created_at, so the poll's `created_at >= since`
-- filter silently excluded their own match forever — they'd stay stuck on
-- "Finding an opponent…" even after the other player had already been
-- moved into the battle room.
--
-- Fix: never trust the client's clock for this. Force battle_queue.joined_at
-- to always be set by the database's own now() on every insert or update,
-- and have the client read that value back and use it as the poll anchor
-- instead of a locally generated timestamp. Anchor and target now come from
-- the same clock, so skew is no longer possible.

create or replace function eztren.set_queue_joined_at()
returns trigger
language plpgsql
as $$
begin
  new.joined_at := now();
  return new;
end;
$$;

drop trigger if exists trg_set_queue_joined_at on eztren.battle_queue;
create trigger trg_set_queue_joined_at
  before insert or update on eztren.battle_queue
  for each row execute function eztren.set_queue_joined_at();
