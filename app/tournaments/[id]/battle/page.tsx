import { notFound, redirect } from "next/navigation";
import { getTournamentById } from "@/lib/queries";
import BattleLobby from "@/components/BattleLobby";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTournamentById(id);
  return { title: t ? `${t.name} \u00b7 Battle` : "Battle" };
}

export default async function TournamentBattlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTournamentById(id);
  if (!t) notFound();
  // Closed tournaments only have an archive — send anyone who lands here
  // (e.g. a stale bookmark) back to the tournament page instead of
  // showing a dead matchmaking screen.
  if (t.status === "completed") redirect(`/tournaments/${t.slug}`);

  return <BattleLobby tournamentId={t.id} tournamentName={t.name} tournamentTopics={t.topics} />;
}
