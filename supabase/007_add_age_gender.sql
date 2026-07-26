-- Adds age/gender to signups (private — never exposed on the public
-- Rankings/Archive pages, only visible to you via the Supabase dashboard).

alter table eztren.signups add column if not exists age int;
alter table eztren.signups add column if not exists gender text;

create or replace function eztren.register_player(
  p_name text,
  p_country text,
  p_role text default 'player',
  p_age int default null,
  p_gender text default null
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

  insert into eztren.signups (name, email, role, country, status, created_at, age, gender)
  values (p_name, coalesce(verified_email, 'unknown'), p_role, p_country, 'accepted', now(), p_age, p_gender);

  return new_row;
end;
$$;

revoke all on function eztren.register_player(text, text, text, int, text) from public, anon;
grant execute on function eztren.register_player(text, text, text, int, text) to authenticated;

-- Old 3-argument version is no longer used by the client.
drop function if exists eztren.register_player(text, text, text);
