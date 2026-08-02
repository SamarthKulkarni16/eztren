// Single switch for the two flagship leagues (Unknown Road to One Alphabet
// promotion tournament, Twilight Race to Get the Ace championship).
//
// With almost no players yet, everyone who joins lands straight in the One
// or Two Alphabet League by default just from low headcount — not because
// they climbed there. That makes both flagship tournaments meaningless
// right now: there's no ladder underneath them to promote from or defend
// against.
//
// Rather than rip the tournaments (or their battle/archive/judging routes)
// out of the codebase, flip this flag. Everything else — the tournament
// rows in the DB, /tournaments/[slug]/battle, /tournaments/[slug]/archive,
// AI judging, rank effects — stays fully wired and untouched. Set this
// back to true once the player base is big enough for these to mean
// something, and the whole pipeline is live again with no other changes.
export const FLAGSHIP_LEAGUES_LIVE = false;

// Both current flagship rows use these `type` values (see schema.sql seed
// data). Anything else (e.g. 'emergency') is unaffected by the flag.
export function isFlagshipTournament(type: string): boolean {
  return type === "promotion" || type === "flagship";
}
