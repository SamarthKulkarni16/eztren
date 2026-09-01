import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sitemap",
  description: "All pages on Eztren, a global debate sport platform.",
  alternates: {
    canonical: "https://eztren.xyz/html-sitemap",
  },
};

const links: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Eztren" },
  { href: "/rankings", label: "Rankings" },
  { href: "/join", label: "Join the League" },
  { href: "/battle", label: "Battle" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/watch", label: "Watch Live" },
  { href: "/archive", label: "Archive" },
  { href: "/history", label: "History" },
  { href: "/constitution", label: "Constitution" },
];

export default function HtmlSitemap() {
  return (
    <section className="max-w-3xl mx-auto px-6 py-20">
      <p className="font-data text-[13px] uppercase tracking-wider text-signal mb-6">
        Sitemap
      </p>
      <h1 className="font-display text-[clamp(2rem,5vw,3.5rem)] leading-[1.05] tracking-tight mb-10">
        All Pages
      </h1>
      <ul className="space-y-4 border-t border-steel-line pt-8">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="font-data text-[15px] uppercase tracking-wider text-steel hover:text-signal transition-colors"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
