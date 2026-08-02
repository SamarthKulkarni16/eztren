-- service_role bypasses RLS but still needs ordinary schema/function grants
-- like any other role. 027 never granted it USAGE on eztren (only
-- anon/authenticated got that, for the public-facing API), so the
-- GitHub Actions cron job — which authenticates as service_role to reach
-- recompute_letters(), a function deliberately NOT exposed to
-- anon/authenticated — was hitting "permission denied for schema eztren".
--
-- This does NOT expose player_ratings or recompute_letters() to the
-- public API. anon/authenticated still have no grants on either. Only
-- service_role (i.e. your GitHub Actions secret) gets access.

grant usage on schema eztren to service_role;
grant execute on function eztren.recompute_letters() to service_role;
