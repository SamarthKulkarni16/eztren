"use client";

import { useEffect, useRef, useState } from "react";
import DailyIframe, { DailyCall } from "@daily-co/daily-js";
import { supabase } from "@/lib/supabase";
import { endBattle } from "@/lib/battle";
import { Battle, Player } from "@/lib/types";
import EndBattleControl from "@/components/EndBattleControl";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

function formatClock(seconds: number): string {
  const m = Math.floor(Math.max(seconds, 0) / 60);
  const s = Math.max(seconds, 0) % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AudioBattle({
  battle,
  profile,
  opponent,
}: {
  battle: Battle;
  profile: Player;
  opponent: Player | null;
}) {
  const [status, setStatus] = useState<"connecting" | "joined" | "error">("connecting");
  const [muted, setMuted] = useState(false);
  const [opponentPresent, setOpponentPresent] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const callRef = useRef<DailyCall | null>(null);
  const endedRef = useRef(false);

  // Deterministic so exactly one side records — avoids two duplicate files
  // per battle without any mid-call coordination.
  const isRecorder = Boolean(opponent) && profile.id < opponent!.id;
  const { startRecording, stopAndUpload } = useAudioRecorder(battle.id);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      const { data } = await supabase!.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setStatus("error");
        setErrorMessage("Not signed in.");
        return;
      }

      const res = await fetch("/api/daily/create-room", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ battleId: battle.id }),
      });
      const room = await res.json();
      if (!res.ok || cancelled) {
        setStatus("error");
        setErrorMessage(room.error ?? "Could not create the call.");
        return;
      }

      const call = DailyIframe.createCallObject({
        audioSource: true,
        videoSource: false,
      });
      callRef.current = call;

      call.on("joined-meeting", () => {
        if (!cancelled) setStatus("joined");
        // In case the opponent's track is already up (e.g. a rejoin).
        if (isRecorder) startRecording(call);
      });
      call.on("participant-joined", () => {
        setOpponentPresent(true);
        // This is the normal path — remote audio only exists once the
        // opponent has actually joined.
        if (isRecorder) startRecording(call);
      });
      call.on("participant-left", () => setOpponentPresent(false));
      call.on("error", (e: any) => {
        setStatus("error");
        setErrorMessage(e?.errorMsg ?? "Call error.");
      });

      await call.join({ url: room.roomUrl });
    }

    setup();

    return () => {
      cancelled = true;
      if (isRecorder) stopAndUpload();
      callRef.current?.leave();
      callRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle.id]);

  // Same countdown pattern as the text battle.
  useEffect(() => {
    if (!battle.startedAt) return;
    const startedAt = new Date(battle.startedAt).getTime();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = battle.durationSeconds - elapsed;
      setSecondsLeft(remaining);
      if (remaining <= 0 && !endedRef.current) {
        endedRef.current = true;
        endBattle(battle.id);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [battle.startedAt, battle.durationSeconds, battle.id]);

  function toggleMute() {
    const next = !muted;
    callRef.current?.setLocalAudio(!next);
    setMuted(next);
  }

  const lowTime = secondsLeft !== null && secondsLeft <= 30;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <p className="font-display text-xl">{battle.topic ?? "Open Debate"}</p>
        {secondsLeft !== null && (
          <p
            className={`font-data text-[13px] uppercase tracking-wider ${
              lowTime ? "text-signal" : "text-steel"
            }`}
          >
            {formatClock(secondsLeft)}
          </p>
        )}
      </div>

      {status === "connecting" && (
        <p className="text-steel text-[15px] mb-8">Connecting the call&hellip;</p>
      )}
      {status === "error" && (
        <p className="text-signal text-[15px] mb-8">{errorMessage}</p>
      )}

      {status === "joined" && (
        <div className="flex items-center gap-10 mb-10">
          <div className="text-center">
            <div className="w-20 h-20 rounded-full border-2 border-bone flex items-center justify-center mx-auto mb-2 font-display text-2xl">
              {profile.name.charAt(0)}
            </div>
            <p className="font-data text-[11px] uppercase tracking-wider text-steel">
              You {muted && "(muted)"}
            </p>
          </div>
          <div className="text-center">
            <div
              className={`w-20 h-20 rounded-full border-2 flex items-center justify-center mx-auto mb-2 font-display text-2xl ${
                opponentPresent ? "border-signal" : "border-steel-line text-steel"
              }`}
            >
              {opponent?.name.charAt(0) ?? "?"}
            </div>
            <p className="font-data text-[11px] uppercase tracking-wider text-steel">
              {opponentPresent ? opponent?.name ?? "Opponent" : "Waiting to join\u2026"}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-4 mb-6">
        {status === "joined" && (
          <button
            onClick={toggleMute}
            className="font-data text-[13px] uppercase tracking-wider border border-bone px-6 py-3 hover:bg-bone hover:text-void transition-colors"
          >
            {muted ? "Unmute" : "Mute"}
          </button>
        )}
      </div>

      <EndBattleControl battle={battle} profile={profile} opponent={opponent} />
    </div>
  );
}
