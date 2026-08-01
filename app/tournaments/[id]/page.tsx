import Link from "next/link";
import { notFound } from "next/navigation";
import { getTournamentById } from "@/lib/queries";

export const dynamic = "force-dynamic";

const statusColor: Record<string, string> = {
  active: "text-signal border-signal",
  upcoming: "text-brass border-brass",
  completed: "text-steel border-steel-line",
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTournamentById(id);
  return { title: t ? t.name : "Tournament" };
}

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTournamentById(id);
  if (!t) notFound();

  const isCompleted = t.status === "completed";

  return (
    <div className="max-w-3xl mx-auto px-6 py-20">
      <Link
        href="/tournaments"
        className="font-data text-[12px] uppercase tracking-wider text-steel hover:text-bone transition-colors"
      >
        &larr; Tournaments
      </Link>

      <div className="flex items-center gap-3 mt-8 mb-4">
        <span
          className={`font-data text-[11px] uppercase tracking-wider border px-2 py-1 ${statusColor[t.status]}`}
        >
          {t.status}
        </span>
        <span className="font-data text-[11px] uppercase tracking-wider text-steel">
          {t.league}
        </span>
      </div>

      <h1 className="font-display text-5xl mb-6">{t.name}</h1>
      <p className="text-steel text-lg leading-relaxed mb-4 max-w-xl">{t.description}</p>
      <p className="font-data text-[12px] text-steel mb-16">{t.dates}</p>

      <div className="grid sm:grid-cols-2 gap-px bg-steel-line border border-steel-line">
        {!isCompleted && (
          <Link
            href={`/tournaments/${t.slug}/battle`}
            className="bg-void p-8 hover:bg-steel-line/10 transition-colors group"
          >
            <p className="font-data text-[12px] uppercase tracking-wider text-signal mb-2">
              Battle
            </p>
            <h2 className="font-display text-2xl mb-2">Find an opponent</h2>
            <p className="text-steel text-[14px] leading-relaxed">
              Queue up or challenge a player. Matches here count toward{" "}
              {t.name}.
            </p>
          </Link>
        )}
        <Link
          href={`/tournaments/${t.slug}/archive`}
          className={`bg-void p-8 hover:bg-steel-line/10 transition-colors group ${
            isCompleted ? "sm:col-span-2" : ""
          }`}
        >
          <p className="font-data text-[12px] uppercase tracking-wider text-signal mb-2">
            Archive
          </p>
          <h2 className="font-display text-2xl mb-2">
            {isCompleted ? "Read the record" : "Past debates"}
          </h2>
          <p className="text-steel text-[14px] leading-relaxed">
            {isCompleted
              ? "This tournament has closed. Every debate played here is archived below."
              : "Every debate played in this tournament, with video, transcript, and AI verdict."}
          </p>
        </Link>
      </div>
    </div>
  );
}
