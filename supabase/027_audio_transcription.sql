-- Audio battles now get a browser-side live transcript too, the same way
-- text battles already do: each participant's own tab runs the Web Speech
-- API on their mic and writes recognized final segments into battle_turns
-- (see hooks/useSpeechTranscription.ts + components/AudioBattle.tsx). That
-- makes battle_turns dual-purpose — typed chat messages for text battles,
-- recognized speech segments for audio battles — so the existing compile
-- step (string_agg by created_at) just needs to stop being gated to
-- format = 'text' and it works for both.
--
-- This also fixes a real regression: 025_tournament_battles.sql's
-- complete_battle() redefinition dropped transcript / daily_room_name /
-- is_private from the matches insert list (they were present as of
-- 019/020) while only adding tournament_id. That silently broke transcript
-- archiving (and therefore text-battle AI judging, which requires
-- matches.transcript) for every battle completed since. Restored below,
-- carrying tournament_id forward too.

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

  -- No longer gated to format = 'text'. Audio battles populate battle_turns
  -- too now (one row per recognized speech segment, per speaker's own
  -- browser) so this compiles a real transcript for both formats. If no
  -- rows exist for this battle (e.g. speech recognition unsupported/failed
  -- on both sides), compiled_transcript stays null and the AI judge falls
  -- back to the recorded audio — see app/api/judge/route.ts.
  select string_agg(p.name || ': ' || t.content, E'\n' order by t.created_at)
  into compiled_transcript
  from eztren.battle_turns t
  join eztren.players p on p.id = t.player_id
  where t.battle_id = b.id;

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

-- Same fix for the no-participant-open sweep path.
create or replace function eztren.reap_stale_battles(grace_seconds int default 120)
returns void
language plpgsql
security definer
set search_path = eztren, public
as $$
declare
  b record;
  compiled_transcript text;
  a_league eztren.league_type;
  turn_count int;
begin
  for b in
    select * from eztren.battles
    where status = 'live'
      and started_at is not null
      and started_at + ((duration_seconds + grace_seconds) || ' seconds')::interval < now()
  loop
    select count(*) into turn_count
    from eztren.battle_turns
    where battle_id = b.id;

    compiled_transcript := null;
    if turn_count > 0 then
      select string_agg(p.name || ': ' || t.content, E'\n' order by t.created_at)
      into compiled_transcript
      from eztren.battle_turns t
      join eztren.players p on p.id = t.player_id
      where t.battle_id = b.id;
    end if;

    update eztren.battles
    set status = 'abandoned',
        ended_at = now(),
        transcript = coalesce(compiled_transcript, transcript)
    where id = b.id;

    if turn_count > 0 or b.recording_url is not null then
      select league into a_league from eztren.players where id = b.player_a_id;

      insert into eztren.matches
        (topic, player_a_id, player_b_id, league, match_date, tags, transcript_url, video_url,
         transcript, daily_room_name, battle_id, is_private, tournament_id)
      values
        (coalesce(b.topic, 'Open Debate'), b.player_a_id, b.player_b_id, a_league, current_date,
         array[b.format, 'live-battle', 'auto-ended'], null, b.recording_url, compiled_transcript,
         b.daily_room_name, b.id, b.is_private, b.tournament_id);
    end if;
  end loop;
end;
$$;

grant execute on function eztren.reap_stale_battles(int) to anon, authenticated;
