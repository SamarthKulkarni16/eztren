"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import DailyIframe, { DailyCall } from "@daily-co/daily-js";
import {
  getBattle,
  subscribeToBattle,
  getTurns,
  subscribeToTurns,
  reapStaleBattles,
} from "@/lib/battle";
import { getPlayerById, getMatchByBattleId } from "@/lib/queries";
import { Battle, BattleTurn, Player } from "@/lib/types";
import VSCard from "@/components/VSCard";

function formatClock(seconds: number): string {
  const m = Math.floor(Math.max(seconds, 0) / 60);
  const s = Math.max(seconds, 0) % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function WatchBattlePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [battle, setBattle] = useState<Battle | null | undefined>(undefined);
  const [playerA, setPlayerA] = useState<Player | null>(null);
  const [playerB, setPlayerB] = useState<Player | null>(null);
  const [turns, setTurns] = useState<BattleTurn[]>([]);
  const [ended, setEnded] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const [audioStatus, setAudioStatus] = useState<"idle" | "connecting" | "listening" | "error">(
    "idle"
  );
  const [audioError, setAudioError] = useState("");
  const callRef = useRef<DailyCall | null>(null);

  // ── Load the battle, watch for it ending ──
  useEffect(() => {
    if (!id) return;
    reapStaleBattles().then(() => getBattle(id)).then((b) => setBattle(b));
    const unsub = subscribeToBattle(id, setBattle);
    return unsub;
  }, [id]);

  useEffect(() => {
    if (battle === null) {
      // Never visible to us as live — maybe it already ended. Try the archive.
      getMatchByBattleId(id).then((match) => {
        if (match) router.replace(`/matches/${match.id}`);
      });
    } else if (battle && battle.status !== "live" && !ended) {
      setEnded(true);
      getMatchByBattleId(id).then((match) => {
        if (match) router.replace(`/matches/${match.id}`);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle, id]);

  useEffect(() => {
    if (!battle) return;
    getPlayerById(battle.playerAId).then(setPlayerA);
    getPlayerById(battle.playerBId).then(setPlayerB);
  }, [battle]);

  // ── Countdown, mirrors the players' own clock ──
  useEffect(() => {
    if (!battle?.startedAt) return;
    const startedAt = new Date(battle.startedAt).getTime();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSecondsLeft(battle.durationSeconds - elapsed);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [battle?.startedAt, battle?.durationSeconds]);

  // ── Text battles: read-only turn feed ──
  useEffect(() => {
    if (!battle || battle.format !== "text") return;
    getTurns(battle.id).then(setTurns);
    const unsub = subscribeToTurns(battle.id, (t) => setTurns((prev) => [...prev, t]));
    return unsub;
  }, [battle]);

  // ── Audio battles: listen-only Daily join ──
  async function listenLive() {
    if (!battle) return;
    setAudioStatus("connecting");
    try {
      const res = await fetch("/api/daily/spectator-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ battleId: battle.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not connect.");

      const call = DailyIframe.createCallObject({ audioSource: false, videoSource: false });
      callRef.current = call;
      call.on("joined-meeting", () => setAudioStatus("listening"));
      call.on("error", (e: any) => {
        setAudioStatus("error");
        setAudioError(e?.errorMsg ?? "Call error.");
      });
      await call.join({ url: data.roomUrl, token: data.token });
    } catch (e: any) {
      setAudioStatus("error");
      setAudioError(e?.message ?? "Could not connect.");
    }
  }

  useEffect(() => {
    return () => {
      callRef.current?.leave();
      callRef.current?.destroy();
    };
  }, []);

  if (battle === undefined) return null;

  if (!battle || (ended && !playerA)) {
    return (
      <div>
        <div className="max-w-xl mx-auto px-6 py-20">
          <p className="font-versus font-extrabold uppercase text-3xl mb-4">
            Not live right now
          </p>
          <Link href="/watch" className="font-data text-[13px] uppercase tracking-wider text-signal hover:underline">
            &larr; Back to Watch Live
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="max-w-2xl mx-auto px-6 py-20">
        <Link
          href="/watch"
          className="font-data text-[13px] uppercase tracking-wider text-signal hover:underline mb-8 block"
        >
          &larr; Watch Live
        </Link>

        {playerA && playerB && (
          <div className="mb-10">
            <VSCard
              playerA={{ id: playerA.id, name: playerA.name, rank: playerA.rank, league: playerA.league, isAi: playerA.isAi }}
              playerB={{ id: playerB.id, name: playerB.name, rank: playerB.rank, league: playerB.league, isAi: playerB.isAi }}
              status="live"
              topic={battle.topic}
            />
          </div>
        )}

        {secondsLeft !== null && (
          <p className="font-data text-[13px] uppercase tracking-wider text-steel mb-10">
            {formatClock(secondsLeft)} remaining
          </p>
        )}

        {battle.format === "text" && (
          <div className="border border-steel-line p-8 space-y-5 max-h-[60vh] overflow-y-auto">
            {turns.length === 0 && (
              <p className="text-steel text-[15px] italic">
                No turns yet &mdash; the debate hasn&rsquo;t started.
              </p>
            )}
            {turns.map((t) => {
              const speaker = t.playerId === playerA?.id ? playerA : playerB;
              return (
                <div key={t.id}>
                  <p className="font-data text-[11px] uppercase tracking-wider text-steel mb-1">
                    {speaker?.name ?? "Unknown"}
                  </p>
                  <p className="text-bone text-[15px] leading-relaxed">{t.content}</p>
                </div>
              );
            })}
          </div>
        )}

        {battle.format === "audio" && (
          <div className="border border-steel-line p-8">
            {audioStatus === "idle" && (
              <button
                onClick={listenLive}
                className="font-data text-[13px] uppercase tracking-wider bg-signal text-bone px-8 py-4 hover:opacity-90 transition-opacity"
              >
                Listen Live
              </button>
            )}
            {audioStatus === "connecting" && (
              <p className="text-steel text-[15px]">Connecting&hellip;</p>
            )}
            {audioStatus === "listening" && (
              <p className="font-data text-[13px] uppercase tracking-wider text-signal flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
                Listening live
              </p>
            )}
            {audioStatus === "error" && (
              <p className="text-signal text-[15px]">{audioError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
