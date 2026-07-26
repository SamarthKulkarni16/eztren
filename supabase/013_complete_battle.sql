-- When a battle ends, compile the text transcript (for text battles) and
-- create the corresponding row in the public matches table so it shows on
-- /archive and is ready for the AI judge later. winner_id and ai_summary
-- stay null until judging happens.

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
    (topic, player_a_id, player_b_id, league, match_date, tags, transcript_url, video_url)
  values
    (coalesce(b.topic, 'Open Debate'), b.player_a_id, b.player_b_id, a_league, current_date,
     array[b.format, 'live-battle'], null, b.recording_url);
end;
$$;

grant execute on function eztren.complete_battle(uuid) to authenticated;

-- Let a participant set/overwrite the topic while the battle is still waiting.
create or replace function eztren.set_battle_topic(battle_id uuid, new_topic text)
returns void
language plpgsql
security definer
set search_path = eztren, public
as $$
declare
  caller_player_id uuid;
begin
  select id into caller_player_id from eztren.players where user_id = auth.uid();

  update eztren.battles
  set topic = new_topic
  where id = battle_id
    and status = 'waiting'
    and (player_a_id = caller_player_id or player_b_id = caller_player_id);
end;
$$;

grant execute on function eztren.set_battle_topic(uuid, text) to authenticated;
