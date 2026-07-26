-- Optional. Seeds the same demo matches that used to show as mock data,
-- so Archive/Home aren't blank while real matches haven't been played yet.
-- Safe to skip entirely, or delete these rows later once real matches exist.
--
-- NOTE: this depends on the demo players (Ines Adeyemi, etc.) still
-- existing. If you've already run 006_clear_seed_players.sql, skip this
-- one too — there's nothing left for it to reference.

insert into eztren.matches
  (topic, player_a_id, player_b_id, judge_id, referee_id, tournament_id, league, winner_id, match_date, tags, ai_summary)
select
  'Should AI systems be allowed to judge human debates?',
  (select id from eztren.players where name = 'Ines Adeyemi'),
  (select id from eztren.players where name = 'Kenji Watanabe'),
  (select id from eztren.players where name = 'Priya Menon'),
  (select id from eztren.players where name = 'Lucas Ferreira'),
  (select id from eztren.tournaments where name = 'Twilight Race to Get the Ace'),
  'One Alphabet League',
  (select id from eztren.players where name = 'Ines Adeyemi'),
  '2026-01-18',
  array['AI regulation', 'epistemics', 'judging'],
  'Adeyemi argued that an AI judge removes a specific kind of bias but introduces an opacity problem judges can''t be cross-examined on. Watanabe countered that human judges are already opaque in practice. The match turned on Adeyemi''s closing reframe.'
union all
select
  'Is a ceasefire that both sides call a win actually peace?',
  (select id from eztren.players where name = 'Sara Haddad'),
  (select id from eztren.players where name = 'Marcus Webb'),
  (select id from eztren.players where name = 'Ines Adeyemi'),
  (select id from eztren.players where name = 'Kenji Watanabe'),
  (select id from eztren.tournaments where name = 'Emergency League: America–Iran'),
  'Two Alphabet League',
  (select id from eztren.players where name = 'Marcus Webb'),
  '2026-02-03',
  array['geopolitics', 'conflict', 'emergency league'],
  'Haddad framed dual-claimed victory as a rhetorical device that delays reckoning. Webb argued ambiguity is often the only politically viable path to de-escalation.'
union all
select
  'Does procrastination protect us from a truth we''re not ready for?',
  (select id from eztren.players where name = 'Priya Menon'),
  (select id from eztren.players where name = 'Lucas Ferreira'),
  (select id from eztren.players where name = 'Kenji Watanabe'),
  (select id from eztren.players where name = 'Sara Haddad'),
  (select id from eztren.tournaments where name = 'The Unknown Road to One Alphabet'),
  'Two Alphabet League',
  (select id from eztren.players where name = 'Priya Menon'),
  '2026-04-09',
  array['psychology', 'procrastination', 'promotion'],
  'Menon argued procrastination is often a correctly-calibrated fear response, not a discipline failure. The judge cited her distinction between avoidance-of-failure and avoidance-of-finding-out as the deciding move.';
