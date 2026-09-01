export const dynamic = "force-dynamic";

import Link from "next/link";
import AlphabetLadder from "@/components/AlphabetLadder";
import VSCard from "@/components/VSCard";
import JoinCta from "@/components/JoinCta";
import { getMatches, getTournaments, getPlayers, getPlayerLookup, getActivePlayerCount } from "@/lib/queries";
import { getLiveBattles } from "@/lib/battle";
import { isFlagshipLive, isFlagshipTournament } from "@/lib/config";

export default async function Home() {
  const [matches, tournaments, players, liveBattles, playerLookup, playerCount] = await Promise.all([
    getMatches(),
    getTournaments(),
    getPlayers(),
    getLiveBattles(),
    getPlayerLookup(),
    getActivePlayerCount(),
  ]);
  const flagshipLive = isFlagshipLive(playerCount);
  const featured = matches[0];
  const activeTournaments = tournaments.filter(
    (t) => t.status === "active" && (flagshipLive || !isFlagshipTournament(t.type))
  );
  const ace = players.find((p) => p.rank === "A");

  return (
    <>
      {/* Hero */}
      <section className="border-b border-steel-line">
        <div className="max-w-6xl mx-auto px-6 pt-20 pb-16">
          <p className="font-data text-[13px] uppercase tracking-wider text-signal mb-6">
            A Debate Sport &mdash; Est. 2026
          </p>
          <h1 className="font-display text-[clamp(2.5rem,6vw,5rem)] leading-[1.03] tracking-tight max-w-4xl">
            Eztren is the global debate sport, played &amp; ranked online.
          </h1>
          <p className="mt-6 text-lg text-steel leading-relaxed max-w-xl italic">
            &ldquo;Wow&hellip; I never thought of it that way.&rdquo;
          </p>
          <p className="mt-4 max-w-xl text-lg text-steel leading-relaxed">
            That&rsquo;s the win condition. Not the loudest voice or the
            fastest talker &mdash; the argument that moves a judge, and the
            room, somewhere new. Eztren ranks debaters in letters, not
            numbers. Climb from the lower alphabet leagues toward becoming{" "}
            <span className="text-signal font-medium">A</span>.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <JoinCta />
            <Link
              href="/constitution"
              className="font-data text-[13px] uppercase tracking-wider border border-bone px-6 py-3 hover:border-signal hover:text-signal transition-colors"
            >
              Read the Constitution
            </Link>
          </div>

          <div className="mt-16 pt-10 border-t border-steel-line">
            <p className="font-data text-[12px] uppercase tracking-wider text-steel mb-4">
              The Climb
            </p>
            <AlphabetLadder />
          </div>
        </div>
      </section>

      {/* Live now */}
      {liveBattles.length > 0 && (
        <section className="border-b border-steel-line bg-steel-line">
          <div className="max-w-6xl mx-auto px-6 py-16">
            <div className="flex items-baseline justify-between mb-8">
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-signal animate-pulse" />
                <h2 className="font-display text-2xl">Live Now</h2>
              </div>
              <Link
                href="/watch"
                className="font-data text-[13px] uppercase tracking-wider text-steel hover:text-signal"
              >
                Watch all &rarr;
              </Link>
            </div>
            <div className="space-y-4">
              {liveBattles.slice(0, 3).map((b) => {
                const a = playerLookup.get(b.playerAId);
                const bp = playerLookup.get(b.playerBId);
                if (!a || !bp) return null;
                return (
                  <VSCard
                    key={b.id}
                    playerA={{ id: a.id, name: a.name, rank: a.rank, league: a.league, isAi: a.isAi }}
                    playerB={{ id: bp.id, name: bp.name, rank: bp.rank, league: bp.league, isAi: bp.isAi }}
                    status="live"
                    compact
                    href={`/watch/${b.id}`}
                  />
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-3 gap-12">
        <div>
          <p className="font-data text-signal text-sm mb-3">10 min</p>
          <h3 className="font-display text-xl mb-2">One match, free-flowing</h3>
          <p className="text-steel leading-relaxed text-[15px]">
            Two players, one judge, one referee. Players agree on the topic
            and who speaks first &mdash; if they can&rsquo;t, the referee
            decides, final.
          </p>
        </div>
        <div>
          <p className="font-data text-signal text-sm mb-3">Every match</p>
          <h3 className="font-display text-xl mb-2">Recorded, forever</h3>
          <p className="text-steel leading-relaxed text-[15px]">
            Video, transcript, and AI summary, searchable by topic. One of
            the world&rsquo;s largest public libraries of human reasoning,
            built one debate at a time.
          </p>
        </div>
        <div>
          <p className="font-data text-signal text-sm mb-3">10 matches</p>
          <h3 className="font-display text-xl mb-2">Judge before you rank</h3>
          <p className="text-steel leading-relaxed text-[15px]">
            To enter either flagship tournament, you must have judged at
            least 10 official matches. Perspective is earned from both
            sides of the table.
          </p>
        </div>
      </section>

      {/* Active tournaments */}
      <section className="border-t border-steel-line bg-steel-line">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="flex items-baseline justify-between mb-10">
            <h2 className="font-display text-3xl">Active Tournaments</h2>
            <Link
              href="/tournaments"
              className="font-data text-[13px] uppercase tracking-wider text-steel hover:text-signal"
            >
              View all &rarr;
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-px bg-steel-line border border-steel-line">
            {activeTournaments.map((t) => (
              <div key={t.id} className="bg-void p-8">
                <p className="font-data text-[12px] uppercase tracking-wider text-signal mb-3">
                  {t.league}
                </p>
                <h3 className="font-display text-2xl mb-3">{t.name}</h3>
                <p className="text-steel text-[15px] leading-relaxed mb-4">
                  {t.description}
                </p>
                <p className="font-data text-[12px] text-steel">
                  {t.dates}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured match / current Ace */}
      <section className="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-5 gap-12">
        <div className="md:col-span-3">
          <p className="font-data text-[12px] uppercase tracking-wider text-steel mb-4">
            From the Archive
          </p>
          {featured ? (
            <Link href="/archive" className="group block">
              <h3 className="font-display text-2xl mb-3 group-hover:text-signal transition-colors">
                {featured.topic}
              </h3>
              <p className="text-steel text-[15px] leading-relaxed mb-4">
                {featured.aiSummary}
              </p>
              <div className="flex flex-wrap gap-2">
                {featured.tags.map((tag) => (
                  <span
                    key={tag}
                    className="font-data text-[11px] uppercase tracking-wider text-steel border border-steel-line px-2 py-1"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          ) : (
            <p className="text-steel text-[15px]">
              No matches recorded yet.{" "}
              <Link href="/join" className="text-signal hover:underline">
                Be the first to play one.
              </Link>
            </p>
          )}
        </div>
        <div className="md:col-span-2 border-l border-steel-line pl-12">
          <p className="font-data text-[12px] uppercase tracking-wider text-steel mb-4">
            Current Ace
          </p>
          {ace && (
            <Link href="/rankings" className="group block">
              <p className="font-display text-4xl text-[var(--gold)] mb-1">
                {ace.rank}
              </p>
              <h3 className="font-display text-2xl group-hover:text-signal transition-colors mb-2">
                {ace.name}
              </h3>
              <p className="text-steel text-[15px]">{ace.bio}</p>
            </Link>
          )}
        </div>
      </section>
    </>
  );
}
