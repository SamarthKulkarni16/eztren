-- Twilight Race to Get the Ace is already seeded correctly: status
-- 'upcoming', dates 'January 2027'. This does the same for Unknown Road
-- to One Alphabet, which was seeded as status 'active' / dates 'Rolling
-- — online' from before the player-count gate existed. Flipping it to
-- 'upcoming' + a fixed April date so both flagship tournaments read the
-- same way once the 100-player threshold unlocks them and the teaser
-- copy goes away.
--
-- Adjust the year below if you want a different cycle than 2027.
update eztren.tournaments
set status = 'upcoming',
    dates = 'April 2027'
where name = 'Unknown Road to One Alphabet';
