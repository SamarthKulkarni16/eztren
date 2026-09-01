import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Battle",
  description:
    "Start an Eztren battle — go live with another debater, agree on a topic, and get judged in real time in the global debate sport.",
  alternates: { canonical: "https://eztren.xyz/battle" },
};

export default function BattleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
