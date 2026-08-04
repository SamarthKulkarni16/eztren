-- ── Migration audit ──
-- Paste this whole thing into the Supabase SQL editor and run it once.
-- It doesn't change anything — it just inspects the database (tables,
-- columns, functions, policies, indexes) for the object each numbered
-- migration file is known to create, and reports whether that object
-- exists. That's a reliable proxy for "has this file been run" for every
-- migration except the handful of one-off manual/data scripts noted below.
--
-- A few files are NOT included because they're not really "did I run
-- this yes/no" schema migrations:
--   004_seed_matches.sql        optional demo-data seed, explicitly skippable
--   006_clear_seed_players.sql  one-off cleanup, has a YOUR_EMAIL_HERE blank
--   008_full_reset.sql          destructive wipe, you'd know if you'd run it
--   009_delete_user_fallback.sql a fill-in-the-blank admin script, not a migration
-- If you're unsure about any of those four, the honest answer is "check your
-- own memory / git history," not a query — there's no schema fingerprint
-- a wipe or a one-off delete reliably leaves behind.

select * from (
  values
    ('002', '002_rank_assignment.sql',
      to_regprocedure('eztren.next_rank()') is not null),
    ('003', '003_auth.sql',
      exists (select 1 from information_schema.columns
              where table_schema='eztren' and table_name='players' and column_name='user_id')),
    ('005', '005_fix_int_to_rank.sql',
      to_regprocedure('eztren.int_to_rank(bigint)') is not null
        and pg_get_functiondef(to_regprocedure('eztren.int_to_rank(bigint)')) like '%(num % 26))::int)%'),
    ('007', '007_add_age_gender.sql',
      exists (select 1 from information_schema.columns
              where table_schema='eztren' and table_name='signups' and column_name='age')),
    ('010', '010_league_from_rank_and_history.sql',
      exists (select 1 from information_schema.columns
              where table_schema='eztren' and table_name='players' and column_name='rank_since')),
    ('011', '011_rank_history.sql',
      to_regclass('eztren.rank_history') is not null),
    ('012', '012_live_battles.sql',
      to_regclass('eztren.battles') is not null),
    ('013', '013_complete_battle.sql',
      to_regprocedure('eztren.complete_battle(uuid)') is not null),
    ('014', '014_match_transcript.sql',
      exists (select 1 from information_schema.columns
              where table_schema='eztren' and table_name='matches' and column_name='transcript')),
    ('015', '015_daily_room_archive.sql',
      exists (select 1 from information_schema.columns
              where table_schema='eztren' and table_name='matches' and column_name='daily_room_name')),
    ('016', '016_ai_judge.sql',
      exists (select 1 from information_schema.columns
              where table_schema='eztren' and table_name='matches' and column_name='judge_status')),
    ('017', '017_mutual_end_and_reasoning.sql',
      exists (select 1 from information_schema.columns
              where table_schema='eztren' and table_name='battles' and column_name='end_requested_by')),
    ('018', '018_spectator_mode.sql',
      exists (select 1 from pg_policies
              where schemaname='eztren' and tablename='battles' and policyname='public read live battles')),
    ('019', '019_private_battles.sql',
      exists (select 1 from information_schema.columns
              where table_schema='eztren' and table_name='battles' and column_name='is_private')),
    ('020', '020_reap_stale_battles.sql',
      to_regprocedure('eztren.reap_stale_battles(int)') is not null),
    ('021', '021_topic_negotiation.sql',
      to_regclass('eztren.topic_proposals') is not null),
    ('022', '022_fix_queue_clock_skew.sql',
      exists (select 1 from pg_trigger where tgname='trg_set_queue_joined_at')),
    ('023', '023_prevent_duplicate_challenges.sql',
      exists (select 1 from pg_indexes
              where schemaname='eztren' and indexname='battle_challenges_one_pending_per_pair')),
    ('024', '024_judge_attempts_log.sql',
      to_regclass('eztren.judge_attempts') is not null),
    ('025a', '025_mutual_ready.sql',
      exists (select 1 from information_schema.columns
              where table_schema='eztren' and table_name='battles' and column_name='player_a_ready')),
    ('025b', '025_tournament_battles.sql',
      exists (select 1 from information_schema.columns
              where table_schema='eztren' and table_name='battle_queue' and column_name='tournament_id')),
    ('026', '026_tournament_topics_seed.sql (data seed — existence check, not proof)',
      exists (select 1 from eztren.tournaments where core_topic is not null)),
    ('027', '027_hidden_elo_ratings.sql',
      to_regclass('eztren.player_ratings') is not null),
    ('028', '028_grant_service_role_eztren.sql',
      has_schema_privilege('service_role', 'eztren', 'usage')),
    ('029', '029_flagship_tournament_dates.sql (data update — existence check, not proof)',
      exists (select 1 from eztren.tournaments
              where name = 'Unknown Road to One Alphabet' and dates = 'April 2027')),
    ('030', '030_active_player_count.sql',
      to_regprocedure('eztren.get_active_player_count(int)') is not null),
    ('031', '031_ai_opponents.sql',
      to_regclass('eztren.ai_personalities') is not null
        and exists (select 1 from information_schema.columns
                    where table_schema='eztren' and table_name='players' and column_name='is_ai')),
    ('032', '032_ai_topic_negotiation.sql',
      to_regprocedure('eztren.insert_ai_topic_response(uuid,uuid,boolean)') is not null)
) as t(version, migration_file, likely_applied)
order by version;
