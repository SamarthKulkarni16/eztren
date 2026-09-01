import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join",
  description:
    "Join Eztren, the global debate sport. Sign up, get a letter rank, judge matches, and climb from Z toward A at eztren.xyz.",
  alternates: { canonical: "https://eztren.xyz/join" },
};

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
