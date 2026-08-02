"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getMyPlayer } from "@/lib/queries";
import { slugifyName } from "@/lib/slug";

const links = [
  { href: "/constitution", label: "Constitution" },
  { href: "/rankings", label: "Rankings" },
  { href: "/battle", label: "Battle" },
  { href: "/watch", label: "Watch Live" },
  { href: "/history", label: "History" },
  { href: "/archive", label: "Archive" },
  { href: "/tournaments", label: "Tournaments" },
];

export default function Nav() {
  const [signedIn, setSignedIn] = useState(false);
  const [myHandle, setMyHandle] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile menu whenever the route actually changes — covers
  // both tapping a link and any programmatic navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Lock background scroll while the mobile menu is open, same as any
  // full-screen overlay — otherwise the page behind it scrolls along with
  // a swipe on the menu itself.
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      setSignedIn(Boolean(s));
      if (!s) setMyHandle(null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    getMyPlayer().then((player) => {
      if (!cancelled) setMyHandle(player ? slugifyName(player.name) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  return (
    <header className="border-b border-steel-line relative">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <Link
            href="/"
            className="font-display text-lg tracking-tight text-bone"
          >
            Eztren
          </Link>
          <nav className="hidden md:flex items-center gap-8 font-data text-[13px] uppercase tracking-wider text-steel">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="hover:text-signal transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href={signedIn && myHandle ? `/${myHandle}` : "/join"}
              className="font-data text-[13px] uppercase tracking-wider border border-bone px-4 py-2 hover:bg-bone hover:text-void transition-colors"
            >
              {signedIn ? "Me" : "Join"}
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              className="md:hidden p-2 -mr-2 text-bone"
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <nav
          className="md:hidden absolute top-full left-0 right-0 bg-void border-b border-steel-line flex flex-col font-data text-[15px] uppercase tracking-wider text-steel z-50"
          aria-label="Mobile"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="px-6 py-4 border-b border-steel-line/50 active:bg-steel-line/20"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
