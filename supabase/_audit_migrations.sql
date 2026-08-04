-- ── Migration audit ──
-- Paste this whole thing into the Supabase SQL editor and run it once.
-- It doesn't change anything — it just inspects the database (tables,
-- columns, functions, policies, indexes) for the object each numbered
-- migration file is known to create, and reports whether that object
-- exists. That's a reliable proxy for "has this file been run" for every
-- migration except the handful of one-off manual/data scripts noted below.
--
-- Each check runs inside its own exception handler, so a table or column
-- that doesn't exist yet (exactly the situation you're trying to find
-- out about) just reports false for that row instead of aborting the
-- whole script.
--
-- A few files are NOT included because they're not really "did I run
-- this yes/no" schema migrations:
--   004_seed_matches.sql        optional demo-data seed, explicitly skippable
--   006_clear_seed_players.sql  one-off cleanup, has a YOUR_EMAIL_HERE blank
--   008_full_reset.sql          destructive wipe, you'd know if you'd run it
--   009_delete_user_fallback.sql a fill-in-the-blank admin script, not a migration

drop table if exists _mig_audit;

create temporary table _mig_audit (
  sort_key text,
  version text,
  migration_file text,
  likely_applied boolean
);

do $$
begin
  insert into _mig_audit values ('002', '002', '002_rank_assignment.sql',
    to_regprocedure('eztren.next_rank()') is not null);
exception when others then
  insert into _mig_audit values ('002', '002', '002_rank_assignment.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('003', '003', '003_auth.sql',
    exists (select 1 from information_schema.columns
            where table_schema='eztren' and table_name='players' and column_name='user_id'));
exception when others then
  insert into _mig_audit values ('003', '003', '003_auth.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('005', '005', '005_fix_int_to_rank.sql',
    to_regprocedure('eztren.int_to_rank(bigint)') is not null
      and pg_get_functiondef(to_regprocedure('eztren.int_to_rank(bigint)')) like '%(num % 26))::int)%');
exception when others then
  insert into _mig_audit values ('005', '005', '005_fix_int_to_rank.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('007', '007', '007_add_age_gender.sql',
    exists (select 1 from information_schema.columns
            where table_schema='eztren' and table_name='signups' and column_name='age'));
exception when others then
  insert into _mig_audit values ('007', '007', '007_add_age_gender.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('010', '010', '010_league_from_rank_and_history.sql',
    exists (select 1 from information_schema.columns
            where table_schema='eztren' and table_name='players' and column_name='rank_since'));
exception when others then
  insert into _mig_audit values ('010', '010', '010_league_from_rank_and_history.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('011', '011', '011_rank_history.sql',
    to_regclass('eztren.rank_history') is not null);
exception when others then
  insert into _mig_audit values ('011', '011', '011_rank_history.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('012', '012', '012_live_battles.sql',
    to_regclass('eztren.battles') is not null);
exception when others then
  insert into _mig_audit values ('012', '012', '012_live_battles.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('013', '013', '013_complete_battle.sql',
    to_regprocedure('eztren.complete_battle(uuid)') is not null);
exception when others then
  insert into _mig_audit values ('013', '013', '013_complete_battle.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('014', '014', '014_match_transcript.sql',
    exists (select 1 from information_schema.columns
            where table_schema='eztren' and table_name='matches' and column_name='transcript'));
exception when others then
  insert into _mig_audit values ('014', '014', '014_match_transcript.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('015', '015', '015_daily_room_archive.sql',
    exists (select 1 from information_schema.columns
            where table_schema='eztren' and table_name='matches' and column_name='daily_room_name'));
exception when others then
  insert into _mig_audit values ('015', '015', '015_daily_room_archive.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('016', '016', '016_ai_judge.sql',
    exists (select 1 from information_schema.columns
            where table_schema='eztren' and table_name='matches' and column_name='judge_status'));
exception when others then
  insert into _mig_audit values ('016', '016', '016_ai_judge.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('017', '017', '017_mutual_end_and_reasoning.sql',
    exists (select 1 from information_schema.columns
            where table_schema='eztren' and table_name='battles' and column_name='end_requested_by'));
exception when others then
  insert into _mig_audit values ('017', '017', '017_mutual_end_and_reasoning.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('018', '018', '018_spectator_mode.sql',
    exists (select 1 from pg_policies
            where schemaname='eztren' and tablename='battles' and policyname='public read live battles'));
exception when others then
  insert into _mig_audit values ('018', '018', '018_spectator_mode.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('019', '019', '019_private_battles.sql',
    exists (select 1 from information_schema.columns
            where table_schema='eztren' and table_name='battles' and column_name='is_private'));
exception when others then
  insert into _mig_audit values ('019', '019', '019_private_battles.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('020', '020', '020_reap_stale_battles.sql',
    to_regprocedure('eztren.reap_stale_battles(int)') is not null);
exception when others then
  insert into _mig_audit values ('020', '020', '020_reap_stale_battles.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('021', '021', '021_topic_negotiation.sql',
    to_regclass('eztren.topic_proposals') is not null);
exception when others then
  insert into _mig_audit values ('021', '021', '021_topic_negotiation.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('022', '022', '022_fix_queue_clock_skew.sql',
    exists (select 1 from pg_trigger where tgname='trg_set_queue_joined_at'));
exception when others then
  insert into _mig_audit values ('022', '022', '022_fix_queue_clock_skew.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('023', '023', '023_prevent_duplicate_challenges.sql',
    exists (select 1 from pg_indexes
            where schemaname='eztren' and indexname='battle_challenges_one_pending_per_pair'));
exception when others then
  insert into _mig_audit values ('023', '023', '023_prevent_duplicate_challenges.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('024', '024', '024_judge_attempts_log.sql',
    to_regclass('eztren.judge_attempts') is not null);
exception when others then
  insert into _mig_audit values ('024', '024', '024_judge_attempts_log.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('025a', '025a', '025_mutual_ready.sql',
    exists (select 1 from information_schema.columns
            where table_schema='eztren' and table_name='battles' and column_name='player_a_ready'));
exception when others then
  insert into _mig_audit values ('025a', '025a', '025_mutual_ready.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('025b', '025b', '025_tournament_battles.sql',
    exists (select 1 from information_schema.columns
            where table_schema='eztren' and table_name='battle_queue' and column_name='tournament_id'));
exception when others then
  insert into _mig_audit values ('025b', '025b', '025_tournament_battles.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('026', '026', '026_tournament_topics_seed.sql (data seed — existence check, not proof)',
    exists (select 1 from eztren.tournaments where core_topic is not null));
exception when others then
  insert into _mig_audit values ('026', '026', '026_tournament_topics_seed.sql (data seed — existence check, not proof)', false);
end $$;

do $$
begin
  insert into _mig_audit values ('027', '027', '027_hidden_elo_ratings.sql',
    to_regclass('eztren.player_ratings') is not null);
exception when others then
  insert into _mig_audit values ('027', '027', '027_hidden_elo_ratings.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('028', '028', '028_grant_service_role_eztren.sql',
    has_schema_privilege('service_role', 'eztren', 'usage'));
exception when others then
  insert into _mig_audit values ('028', '028', '028_grant_service_role_eztren.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('029', '029', '029_flagship_tournament_dates.sql (data update — existence check, not proof)',
    exists (select 1 from eztren.tournaments
            where name = 'Unknown Road to One Alphabet' and dates = 'April 2027'));
exception when others then
  insert into _mig_audit values ('029', '029', '029_flagship_tournament_dates.sql (data update — existence check, not proof)', false);
end $$;

do $$
begin
  insert into _mig_audit values ('030', '030', '030_active_player_count.sql',
    to_regprocedure('eztren.get_active_player_count(int)') is not null);
exception when others then
  insert into _mig_audit values ('030', '030', '030_active_player_count.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('031', '031', '031_ai_opponents.sql',
    to_regclass('eztren.ai_personalities') is not null
      and exists (select 1 from information_schema.columns
                  where table_schema='eztren' and table_name='players' and column_name='is_ai'));
exception when others then
  insert into _mig_audit values ('031', '031', '031_ai_opponents.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('032', '032', '032_ai_topic_negotiation.sql',
    to_regprocedure('eztren.insert_ai_topic_response(uuid,uuid,boolean)') is not null);
exception when others then
  insert into _mig_audit values ('032', '032', '032_ai_topic_negotiation.sql', false);
end $$;

do $$
begin
  insert into _mig_audit values ('033', '033', '033_migration_ledger.sql',
    to_regclass('eztren._migrations') is not null);
exception when others then
  insert into _mig_audit values ('033', '033', '033_migration_ledger.sql', false);
end $$;

select version, migration_file, likely_applied from _mig_audit order by sort_key;
