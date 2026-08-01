import { notFound } from "next/navigation";
import { getTournamentById } from "@/lib/queries";
import ArchiveList from "@/components/ArchiveList";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTournamentById(id);
  return { title: t ? `${t.name} \u00b7 Archive` : "Archive" };
}

export default async function TournamentArchivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTournamentById(id);
  if (!t) notFound();

  return <ArchiveList tournamentId={t.id} tournamentName={t.name} />;
}
