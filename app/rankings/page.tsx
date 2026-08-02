import Link from "next/link";
import { getPlayers } from "@/lib/queries";
export const dynamic = "force-dynamic";

import { League } from "@/lib/types";

export const metadata = { title: "Rankings" };

const leagueOrder: League[] = [
  "One Alphabet League",
  "Two Alphabet League",
  "Alphabet League",
];

function rankValue(rank: string) {
  // shorter rank strings and earlier letters rank higher; approximate sort
  if (rank.length !== 2) return rank.length * 100 + rank.charCodeAt(0);
  return 200 + (rank.charCodeAt(0) - 65) * 26 + (rank.charCodeAt(1) - 65);
}

export default async function RankingsPage() {
  const players = await getPlayers();
  return (
    <div className="max-w-5xl mx-auto px-6 py-20">
      <p className="font-data text-[13px] uppercase tracking-wider text-signal mb-4">
        Public Ranking
      </p>
      <h1 className="font-display text-5xl mb-6">The Ladder</h1>
      <p className="text-steel text-lg leading-relaxed mb-6 max-w-xl">
        A &rarr; B &rarr; C &hellip; Z &rarr; AA &rarr; AB &hellip; Rank climbs
        as letters shorten. One Alphabet Players sit at the top of the sport.
      </p>
      <p className="font-data text-[13px] mb-16">
        <Link href="/history" className="text-signal hover:underline">
          Search who&rsquo;s held a specific rank &rarr;
        </Link>
      </p>

      {leagueOrder.map((league) => {
        const rows = players
          .filter((p) => p.league === league)
          .sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
        if (rows.length === 0) return null;
        return (
          <div key={league} className="mb-16">
            <h2 className="font-display text-2xl mb-6 flex items-center gap-3">
              {league}
              {league === "One Alphabet League" && (
                <span className="font-data text-[11px] uppercase tracking-wider text-signal border border-signal px-2 py-1">
                  Elite
                </span>
              )}
            </h2>
            <div className="border-t border-steel-line">
              {rows.map((p) => (
                <Link
                  href={`/players/${p.id}`}
                  key={p.id}
                  className="grid grid-cols-[3.5rem_1fr_auto] sm:grid-cols-[4rem_1fr_8rem_8rem_8rem] items-center gap-4 border-b border-steel-line py-4 hover:bg-steel-line transition-colors -mx-2 px-2"
                >
                  <span
                    className={`font-display text-2xl ${
                      p.rank === "A" ? "text-[var(--gold)]" : "text-bone"
                    }`}
                  >
                    {p.rank}
                  </span>
                  <p className="font-body font-medium">{p.name}</p>
                  <span className="hidden sm:block font-data text-[12px] text-steel">
                    {p.wins}W&ndash;{p.losses}L
                  </span>
                  <span className="hidden sm:block font-data text-[12px] text-steel">
                    {p.judgedMatches} judged
                  </span>
                  <span className="font-data text-[12px] text-steel text-right">
                    {p.judgedMatches >= 10 ? (
                      <span className="text-brass">flagship-eligible</span>
                    ) : (
                      `${10 - p.judgedMatches} to flagship`
                    )}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
