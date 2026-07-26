-- Run this after 001 (schema.sql) and 002 (rank assignment) are in place.
-- Gates registration behind Supabase Auth (magic link) so one verified
-- email can only ever hold one player slot.

alter table eztren.players add column if not exists user_id uuid references auth.users(id);
create unique index if not exists players_user_id_unique
  on eztren.players (user_id) where user_id is not null;

-- register_player now requires an authenticated session (auth.uid()),
-- pulls the verified email straight from the JWT rather than trusting
-- whatever the client sends, is idempotent (calling it twice for the same
-- user just returns their existing row instead of erroring), and logs the
-- signup itself — so the client no longer needs a separate insert into
-- `signups` at all.
create or replace function eztren.register_player(
  p_name text,
  p_country text,
  p_role text default 'player'
)
returns eztren.players
language plpgsql
security definer
set search_path = eztren
as $$
declare
  new_row eztren.players;
  uid uuid := auth.uid();
  verified_email text := (auth.jwt() ->> 'email');
begin
  if uid is null then
    raise exception 'Must be signed in to register';
  end if;

  select * into new_row from eztren.players where user_id = uid;
  if found then
    return new_row;
  end if;

  insert into eztren.players (name, country, user_id)
  values (p_name, p_country, uid)
  returning * into new_row;

  insert into eztren.signups (name, email, role, country, status, created_at)
  values (p_name, coalesce(verified_email, 'unknown'), p_role, p_country, 'accepted', now());

  return new_row;
end;
$$;

revoke all on function eztren.register_player(text, text, text) from public, anon;
grant execute on function eztren.register_player(text, text, text) to authenticated;

-- Old anon-callable signature is no longer used by the client — remove it
-- so nobody can register without a verified session.
drop function if exists eztren.register_player(text, text);

-- Sign-ups are now only ever written by register_player() itself
-- (security definer, bypasses RLS), so the client no longer needs its own
-- insert policy on this table.
drop policy if exists "public can submit signups" on eztren.signups;
