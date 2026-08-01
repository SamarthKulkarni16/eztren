-- Wires tournaments into the live battle system so the /tournaments pages
-- are actually functional:
--   - tournaments get a slug (for /tournaments/[slug]), a core_topic (the
--     real-world subject an emergency league exists to cover, e.g.
--     "AI regulation"), and a topics[] bank (pre-written motions scoped to
--     that subject, used instead of the generic DEBATE_TOPICS bank).
--   - battle_queue / battle_challenges / battles all get a nullable
--     tournament_id so matchmaking, challenges, and the resulting battle
--     can be scoped to a specific tournament. NULL means "open queue" —
--     tournament-scoped and open players never get paired together
--     (match_queue below filters on tournament_id is not distinct from).
--   - complete_battle() carries tournament_id through onto the archived
--     match row, so /tournaments/[id]/archive can filter by it.

alter table eztren.tournaments
  add column if not exists slug text,
  add column if not exists core_topic text,
  add column if not exists topics text[] not null default '{}';

update eztren.tournaments
set slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
where slug is null;

alter table eztren.tournaments
  add constraint tournaments_slug_key unique (slug);

alter table eztren.battle_queue
  add column if not exists tournament_id uuid references eztren.tournaments(id) on delete set null;

alter table eztren.battle_challenges
  add column if not exists tournament_id uuid references eztren.tournaments(id) on delete set null;

alter table eztren.battles
  add column if not exists tournament_id uuid references eztren.tournaments(id) on delete set null;

alter table eztren.matches
  add column if not exists tournament_id uuid references eztren.tournaments(id) on delete set null;

-- ── Re-scope matchmaking: only pair players queued for the same tournament
--    (both null = open queue, matches like before) ──
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
    and tournament_id is not distinct from new.tournament_id
  order by joined_at asc
  limit 1;

  if found then
    insert into eztren.battles (format, player_a_id, player_b_id, status, tournament_id)
    values (new.format, opponent.player_id, new.player_id, 'waiting', new.tournament_id)
    returning id into new_battle_id;

    delete from eztren.battle_queue where id = opponent.id;
    delete from eztren.battle_queue where id = new.id;
  end if;

  return new;
end;
$$;

-- ── Carry tournament_id from an accepted challenge onto its battle ──
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

  insert into eztren.battles (format, player_a_id, player_b_id, status, tournament_id)
  values (c.format, c.challenger_id, c.opponent_id, 'waiting', c.tournament_id)
  returning id into new_battle_id;

  update eztren.battle_challenges
  set status = 'accepted', responded_at = now(), battle_id = new_battle_id
  where id = challenge_id;

  return new_battle_id;
end;
$$;

-- ── Carry tournament_id from the battle onto its archived match row ──
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
    (topic, player_a_id, player_b_id, league, match_date, tags, transcript_url, video_url, tournament_id)
  values
    (coalesce(b.topic, 'Open Debate'), b.player_a_id, b.player_b_id, a_league, current_date,
     array[b.format, 'live-battle'], null, b.recording_url, b.tournament_id);
end;
$$;

-- ── Topic negotiation: acceptance now routes through /api/battles/confirm-topic
--    for tournament-scoped battles (server checks relevance against
--    tournaments.core_topic via Gemini before calling this). This function
--    itself is unchanged in behavior — it's the *caller* that changes for
--    tournament battles (see components/TopicNegotiation.tsx). Kept as-is
--    so open (non-tournament) battles keep accepting instantly.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'eztren' and table_name = 'battle_queue' and column_name = 'tournament_id'
  ) then
    raise exception 'migration did not apply cleanly';
  end if;
end $$;
