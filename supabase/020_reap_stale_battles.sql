-- Battles only ever flip live -> completed when a participant's own
-- browser is open at the moment their countdown hits zero (TextBattle /
-- AudioBattle call endBattle() client-side). If both tabs are closed
-- before/at that moment — or a battle is just an old test row nobody
-- ever finished — it stays status='live' forever, which means it never
-- stops showing up on /watch (frozen at 0:00 remaining, no turns).
--
-- This is a maintenance sweep that closes out anything past its
-- duration + grace period, called opportunistically from getLiveBattles()
-- on every /watch load (see lib/battle.ts) rather than needing a cron.
-- Deliberately not participant-scoped like complete_battle() — it has no
-- auth.uid() check, since it may run with nobody signed in.

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
    turn_count := 0;
    compiled_transcript := null;

    if b.format = 'text' then
      select count(*) into turn_count
      from eztren.battle_turns
      where battle_id = b.id;

      if turn_count > 0 then
        select string_agg(p.name || ': ' || t.content, E'\n' order by t.created_at)
        into compiled_transcript
        from eztren.battle_turns t
        join eztren.players p on p.id = t.player_id
        where t.battle_id = b.id;
      end if;
    end if;

    update eztren.battles
    set status = 'abandoned',
        ended_at = now(),
        transcript = coalesce(compiled_transcript, transcript)
    where id = b.id;

    -- Only archive into the public matches list if something actually
    -- happened (real turns, or an audio recording) — a stale battle with
    -- zero turns (e.g. a leftover test row) should just disappear, not
    -- show up as an empty match on /archive.
    if turn_count > 0 or b.recording_url is not null then
      select league into a_league from eztren.players where id = b.player_a_id;

      insert into eztren.matches
        (topic, player_a_id, player_b_id, league, match_date, tags, transcript_url, video_url,
         transcript, daily_room_name, battle_id, is_private)
      values
        (coalesce(b.topic, 'Open Debate'), b.player_a_id, b.player_b_id, a_league, current_date,
         array[b.format, 'live-battle', 'auto-ended'], null, b.recording_url, compiled_transcript,
         b.daily_room_name, b.id, b.is_private);
    end if;
  end loop;
end;
$$;

-- No auth.uid() check inside, so anyone can trigger a sweep — that's fine,
-- it's a pure cleanup that only touches battles already past their timer.
grant execute on function eztren.reap_stale_battles(int) to anon, authenticated;
