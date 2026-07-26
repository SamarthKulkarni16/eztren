-- Fallback for when the Dashboard's "Delete user" button fails.
-- Fill in your email in both spots below.

-- 1. Clear anything in our schema still pointing at this user
delete from eztren.players
where user_id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');

-- 2. Delete the auth account itself
-- (Supabase's auth schema cascades this to related sessions/identities automatically)
delete from auth.users where email = 'YOUR_EMAIL_HERE';
