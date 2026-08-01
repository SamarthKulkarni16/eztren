import type { Metadata } from "next";

export const metadata: Metadata = { title: "Battle" };

export default function BattleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
