"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMyPlayer } from "@/lib/queries";

export default function JoinCta() {
  // null = still checking, false = show the CTA, true = hide it (already
  // has a registered player profile). Starting at null (rather than
  // defaulting to "show") avoids a flash of the button for signed-in
  // players before the check resolves.
  const [hide, setHide] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyPlayer().then((player) => {
      if (!cancelled) setHide(!!player);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (hide !== false) return null;

  return (
    <Link
      href="/join"
      className="font-data text-[13px] uppercase tracking-wider bg-bone text-void px-6 py-3 hover:bg-signal transition-colors"
    >
      Join the League
    </Link>
  );
}
