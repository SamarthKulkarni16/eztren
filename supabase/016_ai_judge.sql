-- Links each archived match back to its battle (so the app can find the
-- match row right after a battle ends, to kick off judging) and adds a
-- small state machine for the judging process itself, plus the function
-- that actually applies a verdict: writes winner_id/ai_summary and updates
-- the two players' win/loss records. Rank is deliberately NOT touched here
-- — per the Constitution, rank moves only through formal tournaments.

alter table eztren.matches add column if not exists battle_id uuid
  references eztren.battles(id) on delete set null;

alter table eztren.matches add column if not exists judge_status text
  not null default 'pending'
  check (judge_status in ('pending', 'judging', 'judged', 'failed'));

alter table eztren.matches add column if not exists judge_error text;

-- complete_battle() now also stamps battle_id onto the archived row.
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
     transcript, daily_room_name, battle_id)
  values
    (coalesce(b.topic, 'Open Debate'), b.player_a_id, b.player_b_id, a_league, current_date,
     array[b.format, 'live-battle'], null, b.recording_url, compiled_transcript,
     b.daily_room_name, b.id);
end;
$$;

grant execute on function eztren.complete_battle(uuid) to authenticated;

-- Atomic claim so two clients (both players' browsers) can't both kick off
-- judging for the same match at once. Returns true if this call won the claim.
create or replace function eztren.claim_match_for_judging(match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = eztren, public
as $$
declare
  claimed boolean;
begin
  update eztren.matches
  set judge_status = 'judging'
  where id = match_id
    and judge_status in ('pending', 'failed');

  claimed := found;
  return claimed;
end;
$$;

grant execute on function eztren.claim_match_for_judging(uuid) to authenticated;

create or replace function eztren.mark_match_judge_failed(match_id uuid, error_text text)
returns void
language plpgsql
security definer
set search_path = eztren, public
as $$
begin
  update eztren.matches
  set judge_status = 'failed', judge_error = error_text
  where id = match_id;
end;
$$;

grant execute on function eztren.mark_match_judge_failed(uuid, text) to authenticated;

-- winner_player_id = null means a declared tie: summary gets written, no
-- win/loss change. Rank is never touched here — tournaments only.
create or replace function eztren.apply_match_result(
  match_id uuid,
  winner_player_id uuid,
  summary text
)
returns void
language plpgsql
security definer
set search_path = eztren, public
as $$
declare
  m record;
  loser_id uuid;
begin
  select * into m from eztren.matches where id = match_id;
  if not found then
    raise exception 'match not found';
  end if;

  update eztren.matches
  set winner_id = winner_player_id,
      ai_summary = summary,
      judge_status = 'judged',
      judge_error = null
  where id = match_id;

  if winner_player_id is not null then
    loser_id := case
      when winner_player_id = m.player_a_id then m.player_b_id
      else m.player_a_id
    end;

    update eztren.players set wins = wins + 1 where id = winner_player_id;
    update eztren.players set losses = losses + 1 where id = loser_id;
  end if;
end;
$$;

grant execute on function eztren.apply_match_result(uuid, uuid, text) to authenticated;
