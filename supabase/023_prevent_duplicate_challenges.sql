-- Bug fix: tapping a player's name multiple times quickly (e.g. 3 fast
-- taps on mobile) fired off that many separate INSERTs into
-- battle_challenges before the client had a chance to react to the first
-- one, so the same player could end up with several duplicate pending
-- challenges from the same person. The client-side fix (disabling the
-- button after the first tap) closes the common case, but this partial
-- unique index is the actual backstop: the database itself now refuses a
-- second pending challenge between the same challenger/opponent/format,
-- no matter how it's triggered (double-tap, two open tabs, retried
-- request, etc).
create unique index if not exists battle_challenges_one_pending_per_pair
  on eztren.battle_challenges (challenger_id, opponent_id, format)
  where status = 'pending';
