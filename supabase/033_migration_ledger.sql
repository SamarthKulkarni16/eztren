-- A running log of which migration files have actually been executed
-- against this database — the "git log" of the migrations folder. Run
-- once. From here on, every new migration file ends with an insert into
-- this table, so `select * from eztren._migrations order by version;`
-- always tells you exactly what's been applied, in order, with a
-- timestamp — no more guessing.
--
-- Underscore prefix keeps it out of eztren's normal public-facing table
-- listing conceptually; it's locked down below regardless.

create table if not exists eztren._migrations (
  version text primary key,
  name text not null,
  applied_at timestamptz not null default now()
);

alter table eztren._migrations enable row level security;
-- No policy for anon/authenticated on purpose — this is operator-only
-- bookkeeping, not application data. Read it from the SQL editor.

insert into eztren._migrations (version, name) values
  ('033', '033_migration_ledger.sql')
on conflict (version) do nothing;
