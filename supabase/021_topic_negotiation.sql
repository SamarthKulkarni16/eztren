-- Topic negotiation: before a text battle goes live, either player can
-- propose a topic; the other player accepts, rejects, or just proposes a
-- counter of their own (which supersedes their previous pending proposal).
-- Whoever accepts a proposal locks it in as battle.topic. If nobody agrees
-- within 60 seconds of the battle being created, the client-side countdown
-- on either player's screen calls assign_random_topic() to force a topic —
-- that function is idempotent (only writes if battle.topic is still null),
-- so it's safe even if both players' timers fire at the same moment.

create table if not exists eztren.topic_proposals (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references eztren.battles(id) on delete cascade,
  proposed_by uuid not null references eztren.players(id) on delete cascade,
  topic text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'superseded')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

alter table eztren.topic_proposals enable row level security;

drop policy if exists "participants read proposals" on eztren.topic_proposals;
create policy "participants read proposals" on eztren.topic_proposals
  for select using (
    battle_id in (
      select id from eztren.battles
      where player_a_id in (select id from eztren.players where user_id = auth.uid())
         or player_b_id in (select id from eztren.players where user_id = auth.uid())
    )
  );

grant select on eztren.topic_proposals to authenticated;
-- No direct insert/update grant — every write goes through the
-- security-definer functions below, which do the participant/ownership
-- checks and keep "only one live proposal at a time" consistent.

-- ── Propose (initial offer or counter-offer) ──
create or replace function eztren.propose_topic(battle_id uuid, topic text)
returns uuid
language plpgsql
security definer
set search_path = eztren, public
as $$
declare
  caller_player_id uuid;
  b record;
  new_id uuid;
begin
  select id into caller_player_id from eztren.players where user_id = auth.uid();
  if caller_player_id is null then
    raise exception 'not a registered player';
  end if;

  select * into b from eztren.battles where id = propose_topic.battle_id;
  if not found then
    raise exception 'battle not found';
  end if;
  if caller_player_id != b.player_a_id and caller_player_id != b.player_b_id then
    raise exception 'only a participant can propose a topic';
  end if;
  if b.status != 'waiting' then
    raise exception 'battle is no longer waiting';
  end if;
  if b.topic is not null then
    raise exception 'a topic is already set';
  end if;

  -- A fresh proposal (including a counter-offer) supersedes this player's
  -- own still-pending proposal, so the chat only ever shows one live
  -- offer per side at a time.
  update eztren.topic_proposals
  set status = 'superseded'
  where topic_proposals.battle_id = propose_topic.battle_id
    and proposed_by = caller_player_id
    and status = 'pending';

  insert into eztren.topic_proposals (battle_id, proposed_by, topic)
  values (propose_topic.battle_id, caller_player_id, propose_topic.topic)
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function eztren.propose_topic(uuid, text) to authenticated;

-- ── Respond (accept locks the topic in, reject just closes the offer) ──
create or replace function eztren.respond_to_topic_proposal(proposal_id uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = eztren, public
as $$
declare
  caller_player_id uuid;
  p record;
  b record;
begin
  select id into caller_player_id from eztren.players where user_id = auth.uid();
  if caller_player_id is null then
    raise exception 'not a registered player';
  end if;

  select * into p from eztren.topic_proposals where id = proposal_id;
  if not found then
    raise exception 'proposal not found';
  end if;

  select * into b from eztren.battles where id = p.battle_id;
  if not found then
    raise exception 'battle not found';
  end if;

  if caller_player_id != b.player_a_id and caller_player_id != b.player_b_id then
    raise exception 'only a participant can respond';
  end if;
  if caller_player_id = p.proposed_by then
    raise exception 'cannot respond to your own proposal';
  end if;
  if p.status != 'pending' then
    -- Already superseded/handled (e.g. the 60s timeout beat you to it) —
    -- silently no-op rather than erroring the UI.
    return;
  end if;

  if accept then
    update eztren.topic_proposals
    set status = 'accepted', responded_at = now()
    where id = proposal_id;

    update eztren.topic_proposals
    set status = 'superseded'
    where battle_id = p.battle_id and status = 'pending';

    update eztren.battles
    set topic = p.topic
    where id = p.battle_id and topic is null;
  else
    update eztren.topic_proposals
    set status = 'rejected', responded_at = now()
    where id = proposal_id;
  end if;
end;
$$;

grant execute on function eztren.respond_to_topic_proposal(uuid, boolean) to authenticated;

-- ── Timeout fallback ──
-- Either client calls this once its own 60s countdown (measured from
-- battle.created_at) hits zero, passing a topic it picked at random from
-- the client-side topic bank. "where topic is null" makes this safe if
-- both players' timers fire within moments of each other.
create or replace function eztren.assign_random_topic(battle_id uuid, topic text)
returns void
language plpgsql
security definer
set search_path = eztren, public
as $$
declare
  caller_player_id uuid;
begin
  select id into caller_player_id from eztren.players where user_id = auth.uid();
  if caller_player_id is null then
    raise exception 'not a registered player';
  end if;

  if caller_player_id not in (
    select player_a_id from eztren.battles where id = assign_random_topic.battle_id
    union
    select player_b_id from eztren.battles where id = assign_random_topic.battle_id
  ) then
    raise exception 'only a participant can assign a topic';
  end if;

  update eztren.battles
  set topic = assign_random_topic.topic
  where id = assign_random_topic.battle_id and topic is null;

  update eztren.topic_proposals
  set status = 'superseded'
  where topic_proposals.battle_id = assign_random_topic.battle_id
    and status = 'pending';
end;
$$;

grant execute on function eztren.assign_random_topic(uuid, text) to authenticated;

-- ── Realtime: proposals need to stream live to both players ──
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'eztren' and tablename = 'topic_proposals'
  ) then
    alter publication supabase_realtime add table eztren.topic_proposals;
  end if;
end $$;
