import Link from "next/link";
import { getTournaments } from "@/lib/queries";
import { FLAGSHIP_LEAGUES_LIVE, isFlagshipTournament } from "@/lib/config";

export const metadata = { title: "Tournaments" };
export const dynamic = "force-dynamic";

const statusColor: Record<string, string> = {
  active: "text-signal border-signal",
  upcoming: "text-brass border-brass",
  completed: "text-steel border-steel-line",
};

export default async function TournamentsPage() {
  const tournaments = await getTournaments();
  const flagship = tournaments.filter((t) => t.type !== "emergency");
  const emergency = tournaments.filter((t) => t.type === "emergency");

  return (
    <div className="max-w-5xl mx-auto px-6 py-20">
      <p className="font-data text-[13px] uppercase tracking-wider text-signal mb-4">
        Compete
      </p>
      <h1 className="font-display text-5xl mb-16">Tournaments</h1>

      <section className="mb-20">
        <h2 className="font-display text-2xl mb-8">Flagship</h2>
        <div className="grid md:grid-cols-2 gap-px bg-steel-line border border-steel-line">
          {flagship.map((t) =>
            !FLAGSHIP_LEAGUES_LIVE && isFlagshipTournament(t.type) ? (
              <div key={t.id} className="bg-void p-8">
                <div className="flex items-center gap-3 mb-4">
                  <span className="font-data text-[11px] uppercase tracking-wider border border-brass text-brass px-2 py-1">
                    coming soon
                  </span>
                  <span className="font-data text-[11px] uppercase tracking-wider text-steel">
                    {t.league}
                  </span>
                </div>
                <h3 className="font-display text-2xl mb-3">{t.name}</h3>
                <p className="text-steel text-[15px] leading-relaxed italic">
                  Seeing A Glimpse&hellip;
                </p>
              </div>
            ) : (
              <Link
                key={t.id}
                href={`/tournaments/${t.slug}`}
                className="bg-void p-8 hover:bg-steel-line/10 transition-colors"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className={`font-data text-[11px] uppercase tracking-wider border px-2 py-1 ${statusColor[t.status]}`}
                  >
                    {t.status}
                  </span>
                  <span className="font-data text-[11px] uppercase tracking-wider text-steel">
                    {t.league}
                  </span>
                </div>
                <h3 className="font-display text-2xl mb-3">{t.name}</h3>
                <p className="text-steel text-[15px] leading-relaxed mb-4">
                  {t.description}
                </p>
                <p className="font-data text-[12px] text-steel">{t.dates}</p>
              </Link>
            )
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl mb-2">Emergency League</h2>
        <p className="text-steel text-[15px] leading-relaxed mb-8 max-w-xl">
          Activated during major world events to preserve high-quality debate
          while the world is still deciding what it thinks.
        </p>
        <div className="border-t border-steel-line">
          {emergency.map((t) => (
            <Link
              key={t.id}
              href={`/tournaments/${t.slug}`}
              className="grid sm:grid-cols-[10rem_1fr_8rem] gap-4 items-start border-b border-steel-line py-6 hover:bg-steel-line/10 transition-colors"
            >
              <span
                className={`font-data text-[11px] uppercase tracking-wider border px-2 py-1 w-fit h-fit ${statusColor[t.status]}`}
              >
                {t.status}
              </span>
              <div>
                <h3 className="font-display text-xl mb-1">{t.name}</h3>
                <p className="text-steel text-[14px] leading-relaxed">
                  {t.description}
                </p>
              </div>
              <span className="font-data text-[12px] text-steel sm:text-right">
                {t.dates}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
