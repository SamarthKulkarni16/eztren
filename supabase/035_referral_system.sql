-- Referral-gated direct challenge.
--
-- Direct challenge (searching a player by name in Battle and challenging
-- them straight from the lobby) used to be open to anyone with a profile.
-- It's now locked behind referring a friend: the referrer shares a link,
-- the friend signs up through it, and direct challenge unlocks for BOTH
-- of them — but only for as long as the referred friend stays an active
-- player (battled in the last 10 days, same window as the constitution's
-- active-player definition — see 034_active_player_count_10_days.sql).
-- Go inactive past that window and the unlock drops for both people
-- again, until the friend battles and becomes active once more.
--
-- See lib/queries.ts (getMyReferralCode / isDirectChallengeUnlocked) and
-- components/BattleLobby.tsx for how the client uses this.

-- ── Referrals ──
create table eztren.referrals (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  referrer_id uuid not null references eztren.players(id) on delete cascade,
  referred_id uuid references eztren.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

-- A referrer only ever has one *unclaimed* code outstanding — repeated
-- calls to get_my_referral_code() reuse it instead of minting a new one
-- every time someone reopens the Battle page. Once claimed, they're free
-- to generate another for a second friend.
create unique index referrals_referrer_unclaimed_idx
  on eztren.referrals (referrer_id) where referred_id is null;

create index referrals_referred_idx on eztren.referrals (referred_id);

alter table eztren.referrals enable row level security;
-- No anon/authenticated policies on purpose — reads and writes only ever
-- happen through the security-definer functions below, same pattern as
-- register_player / accept_challenge elsewhere in this schema.

-- ── Get (or create) the signed-in player's referral code ──
create or replace function eztren.get_my_referral_code()
returns text
language plpgsql
security definer
set search_path = eztren
as $$
declare
  uid uuid := auth.uid();
  me eztren.players;
  existing text;
  new_code text;
begin
  if uid is null then
    raise exception 'Must be signed in to get a referral code';
  end if;

  select * into me from eztren.players where user_id = uid;
  if not found then
    raise exception 'No player profile found';
  end if;

  select code into existing from eztren.referrals
  where referrer_id = me.id and referred_id is null
  limit 1;

  if existing is not null then
    return existing;
  end if;

  loop
    new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    begin
      insert into eztren.referrals (code, referrer_id) values (new_code, me.id);
      exit;
    exception when unique_violation then
      -- extremely rare global code collision — just try another
      null;
    end;
  end loop;

  return new_code;
end;
$$;

revoke all on function eztren.get_my_referral_code() from public, anon;
grant execute on function eztren.get_my_referral_code() to authenticated;

-- ── Direct-challenge unlock check ──
-- True if p_player_id is either side of a claimed referral pair whose
-- referred player has battled in the last 10 days. Keying off the
-- referred player's activity for BOTH sides is intentional and matches
-- the spec: if the referred friend goes quiet, the unlock drops for the
-- referrer too, not just the friend.
create or replace function eztren.is_direct_challenge_unlocked(p_player_id uuid)
returns boolean
language sql
security definer
set search_path = eztren
as $$
  select exists (
    select 1
    from eztren.referrals r
    where r.referred_id is not null
      and (r.referrer_id = p_player_id or r.referred_id = p_player_id)
      and exists (
        select 1 from eztren.matches m
        where (m.player_a_id = r.referred_id or m.player_b_id = r.referred_id)
          and m.match_date >= current_date - 10
      )
  );
$$;

grant execute on function eztren.is_direct_challenge_unlocked(uuid) to anon, authenticated;

-- ── Claim a referral code at signup ──
-- Same as 007_add_age_gender.sql's version, plus an optional referral
-- code that — if it matches a still-unclaimed row and isn't the new
-- player trying to refer themselves — links the two players together.
create or replace function eztren.register_player(
  p_name text,
  p_country text,
  p_role text default 'player',
  p_age int default null,
  p_gender text default null,
  p_referral_code text default null
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

  if p_referral_code is not null then
    update eztren.referrals
    set referred_id = new_row.id, claimed_at = now()
    where code = upper(trim(p_referral_code))
      and referred_id is null
      and referrer_id <> new_row.id;
  end if;

  return new_row;
end;
$$;

revoke all on function eztren.register_player(text, text, text, int, text, text) from public, anon;
grant execute on function eztren.register_player(text, text, text, int, text, text) to authenticated;

-- Old 5-argument version is no longer used by the client.
drop function if exists eztren.register_player(text, text, text, int, text);

insert into eztren._migrations (version, name) values
  ('035', '035_referral_system.sql')
on conflict (version) do nothing;
