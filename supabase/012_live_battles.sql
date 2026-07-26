-- Live match system: queue matchmaking, direct challenges, the battle
-- itself, and text-battle turns. Format is 'text' or 'audio' (video comes
-- later, format list stays open by using text not an enum). Structure is
-- free-flowing: no rounds, just an overall duration_seconds timer set when
-- the battle goes live.

-- ── Queue (random matchmaking) ──
create table if not exists eztren.battle_queue (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references eztren.players(id) on delete cascade,
  format text not null check (format in ('text', 'audio')),
  joined_at timestamptz not null default now(),
  unique (player_id, format)
);

-- ── Direct challenges ──
create table if not exists eztren.battle_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references eztren.players(id) on delete cascade,
  opponent_id uuid not null references eztren.players(id) on delete cascade,
  format text not null check (format in ('text', 'audio')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  battle_id uuid,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (challenger_id != opponent_id)
);

-- ── The battle itself ──
create table if not exists eztren.battles (
  id uuid primary key default gen_random_uuid(),
  format text not null check (format in ('text', 'audio')),
  player_a_id uuid not null references eztren.players(id) on delete cascade,
  player_b_id uuid not null references eztren.players(id) on delete cascade,
  status text not null default 'waiting'
    check (status in ('waiting', 'live', 'completed', 'abandoned')),
  topic text,
  duration_seconds int not null default 600,
  started_at timestamptz,
  ended_at timestamptz,
  daily_room_name text,
  daily_room_url text,
  recording_url text,
  transcript text,
  created_at timestamptz not null default now()
);

alter table eztren.battle_challenges
  drop constraint if exists battle_challenges_battle_id_fkey;
alter table eztren.battle_challenges
  add constraint battle_challenges_battle_id_fkey
  foreign key (battle_id) references eztren.battles(id) on delete set null;

-- ── Text battle messages ──
create table if not exists eztren.battle_turns (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references eztren.battles(id) on delete cascade,
  player_id uuid not null references eztren.players(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- ── Matching function: called after a queue insert, pairs the two oldest
--    waiting players of the same format (never the same player twice) ──
create or replace function eztren.match_queue()
returns trigger
language plpgsql
security definer
set search_path = eztren, public
as $$
declare
  opponent record;
  new_battle_id uuid;
begin
  select * into opponent
  from eztren.battle_queue
  where format = new.format
    and player_id != new.player_id
  order by joined_at asc
  limit 1;

  if found then
    insert into eztren.battles (format, player_a_id, player_b_id, status)
    values (new.format, opponent.player_id, new.player_id, 'waiting')
    returning id into new_battle_id;

    delete from eztren.battle_queue where id = opponent.id;
    delete from eztren.battle_queue where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_queue_join on eztren.battle_queue;
create trigger on_queue_join
  after insert on eztren.battle_queue
  for each row execute function eztren.match_queue();

-- ── Accept-challenge function: creates the battle, marks challenge accepted ──
create or replace function eztren.accept_challenge(challenge_id uuid)
returns uuid
language plpgsql
security definer
set search_path = eztren, public
as $$
declare
  c record;
  new_battle_id uuid;
  caller_player_id uuid;
begin
  select id into caller_player_id from eztren.players where user_id = auth.uid();

  select * into c from eztren.battle_challenges where id = challenge_id;

  if not found then
    raise exception 'challenge not found';
  end if;

  if c.opponent_id != caller_player_id then
    raise exception 'only the challenged player can accept';
  end if;

  if c.status != 'pending' then
    raise exception 'challenge is no longer pending';
  end if;

  insert into eztren.battles (format, player_a_id, player_b_id, status)
  values (c.format, c.challenger_id, c.opponent_id, 'waiting')
  returning id into new_battle_id;

  update eztren.battle_challenges
  set status = 'accepted', responded_at = now(), battle_id = new_battle_id
  where id = challenge_id;

  return new_battle_id;
end;
$$;

-- ── Row Level Security ──
alter table eztren.battle_queue enable row level security;
alter table eztren.battle_challenges enable row level security;
alter table eztren.battles enable row level security;
alter table eztren.battle_turns enable row level security;

-- Queue: a player can see and manage only their own queue entry.
drop policy if exists "own queue entry" on eztren.battle_queue;
create policy "own queue entry" on eztren.battle_queue
  for all using (
    player_id in (select id from eztren.players where user_id = auth.uid())
  );

-- Challenges: visible to challenger or opponent; only the challenger can
-- create one; either side can update (cancel / decline).
drop policy if exists "read own challenges" on eztren.battle_challenges;
create policy "read own challenges" on eztren.battle_challenges
  for select using (
    challenger_id in (select id from eztren.players where user_id = auth.uid())
    or opponent_id in (select id from eztren.players where user_id = auth.uid())
  );

drop policy if exists "create challenge as self" on eztren.battle_challenges;
create policy "create challenge as self" on eztren.battle_challenges
  for insert with check (
    challenger_id in (select id from eztren.players where user_id = auth.uid())
  );

drop policy if exists "update own challenges" on eztren.battle_challenges;
create policy "update own challenges" on eztren.battle_challenges
  for update using (
    challenger_id in (select id from eztren.players where user_id = auth.uid())
    or opponent_id in (select id from eztren.players where user_id = auth.uid())
  );

-- Battles: only the two participants can read or update (e.g. mark live/completed).
drop policy if exists "participants read battle" on eztren.battles;
create policy "participants read battle" on eztren.battles
  for select using (
    player_a_id in (select id from eztren.players where user_id = auth.uid())
    or player_b_id in (select id from eztren.players where user_id = auth.uid())
  );

drop policy if exists "participants update battle" on eztren.battles;
create policy "participants update battle" on eztren.battles
  for update using (
    player_a_id in (select id from eztren.players where user_id = auth.uid())
    or player_b_id in (select id from eztren.players where user_id = auth.uid())
  );

-- Turns: only battle participants can read or write, and only into a
-- battle they're part of.
drop policy if exists "participants read turns" on eztren.battle_turns;
create policy "participants read turns" on eztren.battle_turns
  for select using (
    battle_id in (
      select id from eztren.battles
      where player_a_id in (select id from eztren.players where user_id = auth.uid())
         or player_b_id in (select id from eztren.players where user_id = auth.uid())
    )
  );

drop policy if exists "participants write turns" on eztren.battle_turns;
create policy "participants write turns" on eztren.battle_turns
  for insert with check (
    player_id in (select id from eztren.players where user_id = auth.uid())
    and battle_id in (
      select id from eztren.battles
      where player_a_id in (select id from eztren.players where user_id = auth.uid())
         or player_b_id in (select id from eztren.players where user_id = auth.uid())
    )
  );

-- ── Grants ──
grant select, insert, update, delete on eztren.battle_queue to authenticated;
grant select, insert, update on eztren.battle_challenges to authenticated;
grant select, update on eztren.battles to authenticated;
grant select, insert on eztren.battle_turns to authenticated;
grant execute on function eztren.accept_challenge(uuid) to authenticated;

-- ── Realtime: turn on replication for live updates ──
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'eztren' and tablename = 'battle_turns'
  ) then
    alter publication supabase_realtime add table eztren.battle_turns;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'eztren' and tablename = 'battles'
  ) then
    alter publication supabase_realtime add table eztren.battles;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'eztren' and tablename = 'battle_challenges'
  ) then
    alter publication supabase_realtime add table eztren.battle_challenges;
  end if;
end $$;
