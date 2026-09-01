import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "History",
  description:
    "Eztren rank history — search who has held each letter rank in the global debate sport over time.",
  alternates: { canonical: "https://eztren.xyz/history" },
};

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
