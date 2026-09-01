import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Watch Live",
  description:
    "Watch Eztren debates live — every match currently in progress, with text and audio battles streaming in real time at eztren.xyz.",
  alternates: { canonical: "https://eztren.xyz/watch" },
};

export default function WatchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
