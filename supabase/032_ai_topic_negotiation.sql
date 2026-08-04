-- Follow-up to 031_ai_opponents.sql: AI battles now go through the exact
-- same 60-second topic negotiation as human-human battles, instead of
-- having a topic pre-assigned at battle creation. The human proposes (as
-- always); the AI personality actually decides whether to agree or
-- reject, via a Gemini call in /api/battles/ai-topic-response — it isn't
-- a coin flip or an auto-accept. If nobody agrees within 60 seconds, the
-- existing assign_random_topic() timeout fallback applies exactly as it
-- does for two humans.

-- match_with_ai() drops the p_topic parameter — battles now start with
-- topic = null and go through the normal negotiation screen.
drop function if exists eztren.match_with_ai(uuid, text, text);

create or replace function eztren.match_with_ai(
  p_player_id uuid,
  p_format text
)
returns uuid
language plpgsql
security definer
set search_path = eztren, public
as $$
declare
  q record;
  ai_player_id uuid;
  new_battle_id uuid;
  recent_personality_ids int[];
begin
  if p_player_id != (select id from eztren.players where user_id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  delete from eztren.battle_queue
  where player_id = p_player_id and format = p_format
  returning * into q;

  if not found then
    return null;
  end if;

  select array_agg(recent.ai_personality_id) into recent_personality_ids
  from (
    select p.ai_personality_id
    from eztren.battles b
    join eztren.players p
      on p.id = (case when b.player_a_id = p_player_id then b.player_b_id else b.player_a_id end)
    where (b.player_a_id = p_player_id or b.player_b_id = p_player_id)
      and p.is_ai
    order by b.created_at desc
    limit 10
  ) recent;

  select id into ai_player_id
  from eztren.players
  where is_ai
    and (recent_personality_ids is null or ai_personality_id != all(recent_personality_ids))
  order by random()
  limit 1;

  if ai_player_id is null then
    select id into ai_player_id from eztren.players where is_ai order by random() limit 1;
  end if;

  if ai_player_id is null then
    return null;
  end if;

  -- topic left null on purpose — TopicNegotiation runs exactly as it does
  -- for two humans, with the AI's side driven by insert_ai_topic_response
  -- below (called from the human's client after they propose).
  insert into eztren.battles
    (format, player_a_id, player_b_id, status, is_private, tournament_id, player_b_ready)
  values
    (p_format, p_player_id, ai_player_id, 'waiting', q.is_private, q.tournament_id, true)
  returning id into new_battle_id;

  return new_battle_id;
end;
$$;

revoke all on function eztren.match_with_ai(uuid, text) from public, anon;
grant execute on function eztren.match_with_ai(uuid, text) to authenticated;

-- ── insert_ai_topic_response: the AI's answer to a human's topic
--    proposal. Security definer for the same reason as insert_ai_turn —
--    RLS's "cannot respond to your own proposal" / participant checks are
--    keyed to auth.uid(), and the AI has no auth session of its own. This
--    function does its own equivalent checks: caller must be the OTHER
--    participant relative to the AI (i.e. the human who's actually in
--    this battle), the AI must actually be the opponent, and the
--    proposal must belong to this battle and still be pending — mirrors
--    respond_to_topic_proposal()'s accept/reject branches exactly. ──
create or replace function eztren.insert_ai_topic_response(
  p_battle_id uuid,
  p_proposal_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = eztren, public
as $$
declare
  caller_player_id uuid;
  b record;
  p record;
  ai_id uuid;
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
    raise exception 'only a participant can trigger an AI response';
  end if;

  if not exists (select 1 from eztren.players where id = ai_id and is_ai) then
    raise exception 'opponent is not an AI personality';
  end if;

  select * into p from eztren.topic_proposals where id = p_proposal_id;
  if not found or p.battle_id != p_battle_id then
    raise exception 'proposal not found';
  end if;
  if p.proposed_by != caller_player_id then
    raise exception 'only the human''s own proposal can get an AI response';
  end if;
  if p.status != 'pending' then
    -- Already handled (e.g. the 60s timeout beat it, or this got called
    -- twice) — no-op, same as respond_to_topic_proposal.
    return;
  end if;

  if p_accept then
    update eztren.topic_proposals
    set status = 'accepted', responded_at = now()
    where id = p_proposal_id;

    update eztren.topic_proposals
    set status = 'superseded'
    where battle_id = p_battle_id and status = 'pending';

    update eztren.battles
    set topic = p.topic
    where id = p_battle_id and topic is null;
  else
    update eztren.topic_proposals
    set status = 'rejected', responded_at = now()
    where id = p_proposal_id;
  end if;
end;
$$;

revoke all on function eztren.insert_ai_topic_response(uuid, uuid, boolean) from public, anon;
grant execute on function eztren.insert_ai_topic_response(uuid, uuid, boolean) to authenticated;
