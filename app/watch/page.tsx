"use client";

import { useEffect, useState } from "react";
import { getLiveBattles, subscribeToLiveBattles } from "@/lib/battle";
import { getPlayerLookup } from "@/lib/queries";
import { Battle, Player } from "@/lib/types";
import VSCard from "@/components/VSCard";

export default function WatchPage() {
  const [battles, setBattles] = useState<Battle[]>([]);
  const [playerLookup, setPlayerLookup] = useState<Map<string, Player>>(new Map());
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const [live, lookup] = await Promise.all([getLiveBattles(), getPlayerLookup()]);
    setBattles(live);
    setPlayerLookup(lookup);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const unsub = subscribeToLiveBattles(refresh);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="max-w-5xl mx-auto px-6 py-20">
        <p className="font-data text-[13px] uppercase tracking-wider text-signal mb-4">
          Right Now
        </p>
        <h1 className="font-versus font-extrabold uppercase text-5xl mb-6">
          Watch Live
        </h1>
        <p className="text-steel text-lg leading-relaxed mb-12 max-w-xl">
          Every debate currently in progress, open to anyone. Text battles
          stream turn by turn; audio battles you can listen in on live.
        </p>

        {!loading && battles.length === 0 && (
          <div className="border border-steel-line p-10 text-center">
            <p className="text-steel text-[15px]">
              Nothing live right now — check{" "}
              <a href="/archive" className="text-signal hover:underline">
                the archive
              </a>{" "}
              for past matches, or come back in a bit.
            </p>
          </div>
        )}

        <div className="space-y-6">
          {battles.map((b) => {
            const a = playerLookup.get(b.playerAId);
            const bp = playerLookup.get(b.playerBId);
            if (!a || !bp) return null;
            return (
              <VSCard
                key={b.id}
                playerA={{ id: a.id, name: a.name, rank: a.rank, league: a.league, isAi: a.isAi }}
                playerB={{ id: bp.id, name: bp.name, rank: bp.rank, league: bp.league, isAi: bp.isAi }}
                status="live"
                topic={b.topic ?? `${b.format === "text" ? "Text" : "Audio"} battle`}
                href={`/watch/${b.id}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
