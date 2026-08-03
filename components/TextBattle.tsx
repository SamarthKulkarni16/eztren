"use client";

import { useEffect, useRef, useState } from "react";
import { getTurns, sendTurn, subscribeToTurns, endBattle, createTypingChannel, requestAiTurn } from "@/lib/battle";
import { Battle, BattleTurn, Player } from "@/lib/types";
import EndBattleControl from "@/components/EndBattleControl";

function formatClock(seconds: number): string {
  const m = Math.floor(Math.max(seconds, 0) / 60);
  const s = Math.max(seconds, 0) % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TextBattle({
  battle,
  profile,
  opponent,
}: {
  battle: Battle;
  profile: Player;
  opponent: Player | null;
}) {
  const [turns, setTurns] = useState<BattleTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [opponentTyping, setOpponentTyping] = useState(false);
  const [typingDotCount, setTypingDotCount] = useState(1);
  const endedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingChannelRef = useRef<ReturnType<typeof createTypingChannel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  useEffect(() => {
    getTurns(battle.id).then(setTurns);
    const unsub = subscribeToTurns(battle.id, (turn) => {
      setTurns((prev) => (prev.some((t) => t.id === turn.id) ? prev : [...prev, turn]));
      if (turn.playerId !== profile.id) {
        setOpponentTyping(false);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle.id]);

  useEffect(() => {
    const ch = createTypingChannel(battle.id, (playerId) => {
      if (playerId === profile.id) return;
      setOpponentTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setOpponentTyping(false), 3000);
    });
    typingChannelRef.current = ch;
    return () => {
      ch.unsubscribe();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [battle.id, profile.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, opponentTyping]);

  // Countdown from battle.startedAt + duration_seconds. Whichever client's
  // clock hits zero first calls endBattle — complete_battle() is a no-op if
  // the other player's client gets there a beat later, so no race issue.
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

  function handleDraftChange(value: string) {
    setDraft(value);
    const now = Date.now();
    if (value.trim() && now - lastTypingSentRef.current > 1200) {
      lastTypingSentRef.current = now;
      typingChannelRef.current?.notifyTyping(profile.id);
    }
  }

  useEffect(() => {
    if (!opponentTyping) return;
    setTypingDotCount(1);
    const interval = setInterval(() => {
      setTypingDotCount((d) => (d % 3) + 1);
    }, 400);
    return () => clearInterval(interval);
  }, [opponentTyping]);

  async function handleSend() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft("");
    const res = await sendTurn(battle.id, profile.id, content);
    if (!res.ok) {
      setDraft(content); // put it back so nothing's lost
      setSending(false);
      return;
    }
    setSending(false);
    if (opponent?.isAi) {
      // No second browser is going to send a typing broadcast for an AI
      // opponent — drive the same indicator directly, and let the normal
      // turn-arrival handling above clear it once the reply lands.
      setOpponentTyping(true);
      requestAiTurn(battle.id).catch(() => setOpponentTyping(false));
    }
  }

  const lowTime = secondsLeft !== null && secondsLeft <= 30;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="font-display text-xl">
          {battle.topic ?? "Open Debate"}
        </p>
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

      <div
        ref={scrollRef}
        className="border border-steel-line h-96 overflow-y-auto p-6 space-y-4 mb-4"
      >
        {turns.length === 0 && (
          <p className="text-steel text-[14px]">
            No messages yet &mdash; make the opening move.
          </p>
        )}
        {turns.map((t) => {
          const mine = t.playerId === profile.id;
          return (
            <div key={t.id} className={mine ? "text-right" : "text-left"}>
              <p className="font-data text-[11px] uppercase tracking-wider text-steel mb-1">
                {mine ? "You" : opponent?.name ?? "Opponent"}
              </p>
              <p
                className={`inline-block text-left text-[15px] leading-relaxed max-w-[80%] px-4 py-2 ${
                  mine ? "bg-bone text-void" : "bg-steel-line/20 text-bone"
                }`}
              >
                {t.content}
              </p>
            </div>
          );
        })}
        {opponentTyping && (
          <div className="text-left">
            <p className="font-data text-[11px] uppercase tracking-wider text-steel mb-1">
              {opponent?.name ?? "Opponent"}
            </p>
            <p className="inline-block text-left text-[15px] leading-relaxed px-4 py-2 bg-steel-line/20 text-steel">
              <span className="inline-block w-[1.5em] text-left">
                {".".repeat(typingDotCount)}
              </span>
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-3 mb-6">
        <textarea
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder=""
          rows={2}
          className="flex-1 bg-transparent border border-steel-line p-3 text-[15px] focus:border-signal outline-none resize-none"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || sending}
          className="font-data text-[13px] uppercase tracking-wider bg-bone text-void px-6 hover:bg-signal transition-colors disabled:opacity-40"
        >
          Send
        </button>
      </div>

      <EndBattleControl battle={battle} profile={profile} opponent={opponent} />
    </div>
  );
}
