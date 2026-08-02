// The two flagship leagues (Unknown Road to One Alphabet promotion
// tournament, Twilight Race to Get the Ace championship) unlock
// automatically once the platform hits a real player count — not on a
// manual flip. Below that count, everyone lands in the One/Two Alphabet
// League by default just from low headcount, which makes "promotion" and
// "highest-ranked player" meaningless titles. See isFlagshipLive() below.
//
// All underlying routes, battle flow, archive, and judging logic for both
// tournaments are untouched regardless of this check — only the display
// layer (tournament cards, homepage strip, detail pages) reacts to it.
export const FLAGSHIP_LEAGUES_THRESHOLD = 100;

// Manual override: set true to force flagship leagues live regardless of
// player count (e.g. to test the live pages before the threshold is hit).
// Leave false to let the threshold below decide automatically.
const MANUAL_OVERRIDE = false;

export function isFlagshipTournament(type: string): boolean {
  return type === "promotion" || type === "flagship";
}

export function isFlagshipLive(playerCount: number): boolean {
  return MANUAL_OVERRIDE || playerCount >= FLAGSHIP_LEAGUES_THRESHOLD;
}
