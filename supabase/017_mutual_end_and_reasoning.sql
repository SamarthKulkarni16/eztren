-- Two changes:
-- 1. Ending a battle early now requires both players to agree. A single
--    click sends a request; if the other player clicks too, that's their
--    agreement and the battle actually ends. Either player can cancel a
--    pending request (withdraw their own ask, or decline the other's).
-- 2. The AI judge now writes a separate, longer "reasoning" in addition to
--    the short public-facing summary.

alter table eztren.battles add column if not exists end_requested_by uuid
  references eztren.players(id);

alter table eztren.matches add column if not exists judge_reasoning text;

create or replace function eztren.request_end_battle(battle_id uuid)
returns text
language plpgsql
security definer
set search_path = eztren, public
as $$
declare
  b record;
  caller_player_id uuid;
begin
  select id into caller_player_id from eztren.players where user_id = auth.uid();
  select * into b from eztren.battles where id = battle_id;

  if not found then
    raise exception 'battle not found';
  end if;
  if caller_player_id != b.player_a_id and caller_player_id != b.player_b_id then
    raise exception 'only a participant can end this battle';
  end if;
  if b.status != 'live' then
    return 'not_live';
  end if;

  if b.end_requested_by is null then
    update eztren.battles set end_requested_by = caller_player_id where id = battle_id;
    return 'requested';
  end if;

  if b.end_requested_by = caller_player_id then
    return 'already_requested';
  end if;

  -- The other player already asked — this click is the agreement.
  perform eztren.complete_battle(battle_id);
  update eztren.battles set end_requested_by = null where id = battle_id;
  return 'confirmed';
end;
$$;

grant execute on function eztren.request_end_battle(uuid) to authenticated;

create or replace function eztren.cancel_end_request(battle_id uuid)
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
  set end_requested_by = null
  where id = battle_id
    and (player_a_id = caller_player_id or player_b_id = caller_player_id);
end;
$$;

grant execute on function eztren.cancel_end_request(uuid) to authenticated;

-- apply_match_result now also takes the fuller reasoning text — drop the
-- old 3-arg signature first so it doesn't linger as a stale overload.
drop function if exists eztren.apply_match_result(uuid, uuid, text);

create or replace function eztren.apply_match_result(
  match_id uuid,
  winner_player_id uuid,
  summary text,
  reasoning text
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
      judge_reasoning = reasoning,
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

grant execute on function eztren.apply_match_result(uuid, uuid, text, text) to authenticated;
