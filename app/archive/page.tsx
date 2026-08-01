import ArchiveList from "@/components/ArchiveList";

export const metadata = { title: "Archive" };
export const dynamic = "force-dynamic";

export default function ArchivePage() {
  return <ArchiveList />;
}
