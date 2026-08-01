-- matches.judge_error only ever holds the LATEST failure and gets wiped to
-- null the moment a match is successfully judged (see apply_match_result).
-- That means a transient failure that self-heals on retry leaves zero trace
-- ten minutes later — which is exactly what happened with the "is rain
-- good?" test battle. This table appends every failed judging attempt
-- permanently, independent of the match's current status, so we can
-- actually debug flakiness after the fact instead of losing the error the
-- moment a retry succeeds.

create table if not exists eztren.judge_attempts (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references eztren.matches(id) on delete cascade,
  error_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists judge_attempts_match_id_idx
  on eztren.judge_attempts (match_id);

create index if not exists judge_attempts_created_at_idx
  on eztren.judge_attempts (created_at desc);

-- Diagnostic/internal data (raw error strings) — no anon/authenticated read
-- policy on purpose. Query it from the Supabase SQL editor (service role),
-- same as you'd query any other admin table.
alter table eztren.judge_attempts enable row level security;

-- mark_match_judge_failed now logs to judge_attempts in addition to its
-- existing behavior of updating matches.judge_status/judge_error, so the
-- "latest error" UX for the app is unchanged but nothing is lost on retry.
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

  insert into eztren.judge_attempts (match_id, error_text)
  values (match_id, error_text);
end;
$$;

grant execute on function eztren.mark_match_judge_failed(uuid, text) to authenticated;
