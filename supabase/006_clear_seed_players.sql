-- Removes the demo/sample players (Ines Adeyemi, etc.) that were seeded
-- for the Pass 1 preview. These never had a real auth account (user_id is
-- null), so this only ever touches seed rows — real registered players
-- are untouched.
delete from eztren.players where user_id is null;

-- Promote yourself to A, since you're the first genuine registrant.
-- Replace the email below with the one you actually signed up with.
update eztren.players
set rank = 'A', league = 'One Alphabet League'
where user_id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
