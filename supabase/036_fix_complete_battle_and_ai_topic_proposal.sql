-- Two fixes:
--
-- 1. BUG: 025_tournament_battles.sql redefined complete_battle() to carry
--    tournament_id onto the archived match row, but its insert column
--    list regressed to the shape from BEFORE 016_ai_judge.sql /
--    019_private_battles.sql — it dropped transcript, daily_room_name,
--    battle_id, and is_private. Losing battle_id is the serious one: the
--    battle room page (app/battle/[id]/page.tsx) polls
--    getMatchByBattleId(battle.id) right after a battle ends to route the
--    player to /matches/[id] for judging. With battle_id never written,
--    that lookup can never succeed, so the player sits on "Taking you to
--    the AI judge…" forever (20 attempts over 10s, then it just gives up
--    silently). This restores every column complete_battle() is supposed
--    to carry, tournament_id included.
--
-- 2. AI opponents could only ever respond to a human's topic proposal
--    (insert_ai_topic_response, 032_ai_topic_negotiation.sql) — they
--    never proposed one themselves. If the human doesn't type a topic
--    fast, the 60-second window just sits there with nothing suggested
--    until the timeout fallback grabs a random one. insert_ai_topic_proposal
--    lets the AI's own client-triggered call (see
--    app/api/battles/ai-propose-topic) insert a proposal exactly the way
--    a human's propose_topic() would, so the human always has something
--    to react to.

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
    return; -- already archived, no-op so races between both players are safe
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
     transcript, daily_room_name, battle_id, is_private, tournament_id)
  values
    (coalesce(b.topic, 'Open Debate'), b.player_a_id, b.player_b_id, a_league, current_date,
     array[b.format, 'live-battle'], null, b.recording_url, compiled_transcript,
     b.daily_room_name, b.id, b.is_private, b.tournament_id);
end;
$$;

grant execute on function eztren.complete_battle(uuid) to authenticated;

-- ── insert_ai_topic_proposal: the AI's own suggestion, offered without
--    waiting on a human proposal first. Mirrors propose_topic()'s
--    behavior (supersede this side's own pending proposal, insert a new
--    one) but keyed off the AI's player id rather than auth.uid(), same
--    security-definer pattern as insert_ai_topic_response. Caller must be
--    the human participant on the other side of the battle from the AI. ──
create or replace function eztren.insert_ai_topic_proposal(
  p_battle_id uuid,
  p_topic text
)
returns uuid
language plpgsql
security definer
set search_path = eztren, public
as $$
declare
  caller_player_id uuid;
  b record;
  ai_id uuid;
  new_id uuid;
begin
  select id into caller_player_id from eztren.players where user_id = auth.uid();
  if caller_player_id is null then
    raise exception 'not signed in';
  end if;

  select * into b from eztren.battles where id = p_battle_id;
  if not found then
    raise exception 'battle not found';
  end if;

  if b.player_a_id = caller_player_id then
    ai_id := b.player_b_id;
  elsif b.player_b_id = caller_player_id then
    ai_id := b.player_a_id;
  else
    raise exception 'only a participant can trigger an AI proposal';
  end if;

  if not exists (select 1 from eztren.players where id = ai_id and is_ai) then
    raise exception 'opponent is not an AI personality';
  end if;

  if b.status != 'waiting' then
    raise exception 'battle is no longer waiting';
  end if;
  if b.topic is not null then
    raise exception 'a topic is already set';
  end if;

  update eztren.topic_proposals
  set status = 'superseded'
  where topic_proposals.battle_id = p_battle_id
    and proposed_by = ai_id
    and status = 'pending';

  insert into eztren.topic_proposals (battle_id, proposed_by, topic)
  values (p_battle_id, ai_id, p_topic)
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function eztren.insert_ai_topic_proposal(uuid, text) from public, anon;
grant execute on function eztren.insert_ai_topic_proposal(uuid, text) to authenticated;

insert into eztren._migrations (version, name) values
  ('036', '036_fix_complete_battle_and_ai_topic_proposal.sql')
on conflict (version) do nothing;
