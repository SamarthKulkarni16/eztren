-- Private battles: a battle either player opts into as private never shows
-- up in the public archive, and — since a "private" live battle being
-- watchable by strangers in /watch would defeat the point — never shows
-- up in public live spectating either. Participants are unaffected; they
-- can always see and play their own battles regardless of is_private.

alter table eztren.battle_queue add column if not exists is_private boolean not null default false;
alter table eztren.battle_challenges add column if not exists is_private boolean not null default false;
alter table eztren.battles add column if not exists is_private boolean not null default false;
alter table eztren.matches add column if not exists is_private boolean not null default false;

-- Queue matching now also requires both sides to want the same privacy —
-- a public-seeking queuer should never get silently paired into a private
-- battle, and vice versa.
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
    and is_private = new.is_private
    and player_id != new.player_id
  order by joined_at asc
  limit 1;

  if found then
    insert into eztren.battles (format, player_a_id, player_b_id, status, is_private)
    values (new.format, opponent.player_id, new.player_id, 'waiting', new.is_private)
    returning id into new_battle_id;

    delete from eztren.battle_queue where id = opponent.id;
    delete from eztren.battle_queue where id = new.id;
  end if;

  return new;
end;
$$;

-- accept_challenge() carries the challenge's privacy onto the battle it creates.
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

  insert into eztren.battles (format, player_a_id, player_b_id, status, is_private)
  values (c.format, c.challenger_id, c.opponent_id, 'waiting', c.is_private)
  returning id into new_battle_id;

  update eztren.battle_challenges
  set status = 'accepted', responded_at = now(), battle_id = new_battle_id
  where id = challenge_id;

  return new_battle_id;
end;
$$;

-- complete_battle() carries is_private onto the archived matches row.
create or replace function eztren.complete_battle(battle_id uuid)
returns void
language plpgsql
security definer
set search_path = eztren, public
as $$
declare
  b record;
  caller_player_id uuid;
  compiled_transcript text;
  a_league eztren.league_type;
begin
  select id into caller_player_id from eztren.players where user_id = auth.uid();

  select * into b from eztren.battles where id = battle_id;

  if not found then
    raise exception 'battle not found';
  end if;

  if caller_player_id != b.player_a_id and caller_player_id != b.player_b_id then
    raise exception 'only a participant can end this battle';
  end if;

  if b.status = 'completed' then
    return;
  end if;

  if b.format = 'text' then
    select string_agg(p.name || ': ' || t.content, E'\n' order by t.created_at)
    into compiled_transcript
    from eztren.battle_turns t
    join eztren.players p on p.id = t.player_id
    where t.battle_id = b.id;
  end if;

  select league into a_league from eztren.players where id = b.player_a_id;

  update eztren.battles
  set status = 'completed',
      ended_at = now(),
      transcript = coalesce(compiled_transcript, transcript)
  where id = b.id;

  insert into eztren.matches
    (topic, player_a_id, player_b_id, league, match_date, tags, transcript_url, video_url,
     transcript, daily_room_name, battle_id, is_private)
  values
    (coalesce(b.topic, 'Open Debate'), b.player_a_id, b.player_b_id, a_league, current_date,
     array[b.format, 'live-battle'], null, b.recording_url, compiled_transcript,
     b.daily_room_name, b.id, b.is_private);
end;
$$;

-- ── RLS ──

-- Archive: never shows private matches, to anyone, including the two
-- participants — "don't want to show in the archive" means never, not
-- "only visible to us". Direct links to a private match still work for
-- participants via getMatchById/getMatchesForPlayer, just not the public feed.
drop policy if exists "public read matches" on eztren.matches;
create policy "public read matches" on eztren.matches
  for select using (
    not is_private
    or player_a_id in (select id from eztren.players where user_id = auth.uid())
    or player_b_id in (select id from eztren.players where user_id = auth.uid())
  );

-- Spectating: private live battles never appear for anyone but the two
-- participants (who already read battles/turns through the separate
-- "participants read ..." policies from 012_live_battles.sql).
drop policy if exists "public read live battles" on eztren.battles;
create policy "public read live battles" on eztren.battles
  for select using (status = 'live' and not is_private);

drop policy if exists "public read live turns" on eztren.battle_turns;
create policy "public read live turns" on eztren.battle_turns
  for select using (
    battle_id in (select id from eztren.battles where status = 'live' and not is_private)
  );
