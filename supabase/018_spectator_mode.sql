-- Spectator mode: anyone (signed in or not) can watch a battle while it's
-- live. Scoped strictly to status = 'live' — once a battle completes, the
-- public `matches` table (already publicly readable, see schema.sql) is
-- the record of truth, so we don't need to keep battles/turns open after
-- that. Participants keep their existing full-access policies from
-- 012_live_battles.sql; these are additive permissive policies for anon.

drop policy if exists "public read live battles" on eztren.battles;
create policy "public read live battles" on eztren.battles
  for select using (status = 'live');

drop policy if exists "public read live turns" on eztren.battle_turns;
create policy "public read live turns" on eztren.battle_turns
  for select using (
    battle_id in (select id from eztren.battles where status = 'live')
  );

grant select on eztren.battles to anon;
grant select on eztren.battle_turns to anon;
