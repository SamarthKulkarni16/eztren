import ArchiveList from "@/components/ArchiveList";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Archive",
  description:
    "Eztren debate archive — every recorded match, transcript, and AI summary, searchable by topic. Browse the public library of the debate sport.",
  alternates: { canonical: "https://eztren.xyz/archive" },
};
export const dynamic = "force-dynamic";

export default function ArchivePage() {
  return <ArchiveList />;
}
