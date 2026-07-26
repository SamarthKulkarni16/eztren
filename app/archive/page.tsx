import Link from "next/link";
import { getMatches, getPlayerLookup } from "@/lib/queries";
import VSCard from "@/components/VSCard";

export const metadata = { title: "Archive | Eztren" };
export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const [matches, playerLookup] = await Promise.all([
    getMatches(),
    getPlayerLookup(),
  ]);
  const getPlayer = (id: string) => playerLookup.get(id);
  return (
    <div className="max-w-5xl mx-auto px-6 py-20">
      <p className="font-data text-[13px] uppercase tracking-wider text-signal mb-4">
        The Record
      </p>
      <h1 className="font-display text-5xl mb-6">Archive</h1>
      <p className="text-steel text-lg leading-relaxed mb-6 max-w-xl">
        Every official match, kept. Video, transcript, and an AI summary of
        how the argument actually turned.
      </p>

      <div className="mb-12">
        <input
          type="text"
          placeholder="Search by topic, player, or tag&hellip;"
          className="w-full max-w-md font-data text-sm bg-transparent border-b border-steel-line py-3 focus:border-signal outline-none placeholder:text-steel"
          disabled
        />
        <p className="font-data text-[11px] text-steel mt-2">
          Search activates once the archive connects to live data.
        </p>
      </div>

      <div className="space-y-px bg-steel-line border border-steel-line">
        {matches.length === 0 && (
          <div className="bg-void p-8 text-center">
            <p className="text-steel text-[15px]">
              No matches recorded yet — check back once the first official
              debates are played.
            </p>
          </div>
        )}
        {matches.map((m) => {
          const a = getPlayer(m.playerAId);
          const b = getPlayer(m.playerBId);
          const judge = getPlayer(m.judgeId);
          return (
            <Link
              key={m.id}
              href={`/matches/${m.id}`}
              className="block bg-void p-8 relative overflow-hidden hover:bg-steel-line/10 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                <div>
                  <p className="font-data text-[12px] uppercase tracking-wider text-steel mb-2">
                    {m.tournament ? `${m.tournament} \u00b7 ` : ""}
                    {m.league}
                  </p>
                  <h2 className="font-display text-2xl max-w-xl">{m.topic}</h2>
                </div>
                <p className="font-data text-[12px] text-steel whitespace-nowrap">
                  {new Date(m.date).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>

              <p className="text-steel text-[15px] leading-relaxed mb-5 max-w-2xl">
                {m.aiSummary || (
                  <span className="italic">
                    {m.judgeStatus === "judging"
                      ? "The AI judge is reviewing this match\u2026"
                      : m.judgeStatus === "failed"
                      ? "Judging failed \u2014 will retry."
                      : "Awaiting AI judgment."}
                  </span>
                )}
              </p>

              {a && b && (
                <div className="mb-5">
                  <VSCard
                    playerA={{ id: a.id, name: a.name, rank: a.rank, league: a.league }}
                    playerB={{ id: b.id, name: b.name, rank: b.rank, league: b.league }}
                    status="completed"
                    winnerId={m.winnerId}
                    compact
                  />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2 mb-5 font-data text-[12px] text-steel">
                {!m.winnerId && m.judgeStatus === "judged" && (
                  <span className="italic">tie</span>
                )}
                {judge && <span>Judged by {judge.name}</span>}
              </div>

              <div className="flex flex-wrap gap-2">
                {m.tags.map((tag) => (
                  <span
                    key={tag}
                    className="font-data text-[11px] uppercase tracking-wider text-steel border border-steel-line px-2 py-1"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <span className="absolute top-6 right-8 font-display text-signal text-xs uppercase tracking-widest border border-signal rounded-full w-16 h-16 flex items-center justify-center rotate-12 opacity-70 select-none hidden md:flex">
                Case {m.id.slice(0, 4)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
