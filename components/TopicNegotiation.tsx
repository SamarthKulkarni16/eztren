"use client";

import { useEffect, useRef, useState } from "react";
import {
  getTopicProposals,
  proposeTopic,
  respondToTopicProposal,
  assignRandomTopic,
  subscribeToTopicProposals,
} from "@/lib/battle";
import { DEBATE_TOPICS } from "@/lib/topics";
import { useRotatingPlaceholder } from "@/lib/useRotatingPlaceholder";
import { Battle, Player, TopicProposal } from "@/lib/types";

const NEGOTIATION_SECONDS = 60;

function formatClock(seconds: number): string {
  const s = Math.max(seconds, 0);
  return `0:${s.toString().padStart(2, "0")}`;
}

export default function TopicNegotiation({
  battle,
  profile,
  opponent,
}: {
  battle: Battle;
  profile: Player;
  opponent: Player | null;
}) {
  const [proposals, setProposals] = useState<TopicProposal[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(NEGOTIATION_SECONDS);
  const [timedOut, setTimedOut] = useState(false);
  const timeoutFiredRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rotatingTopic = useRotatingPlaceholder(DEBATE_TOPICS, 3200, !battle.topic);

  const refresh = () => {
    getTopicProposals(battle.id).then(setProposals);
  };

  useEffect(() => {
    if (battle.topic) return;
    refresh();
    const unsub = subscribeToTopicProposals(battle.id, refresh);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle.id, battle.topic]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [proposals]);

  // 60-second window measured from when the battle was created. Whichever
  // client's clock hits zero first assigns a random topic — assign_random_topic()
  // only writes if battle.topic is still null, so it's harmless if both
  // players' timers land within moments of each other.
  useEffect(() => {
    if (battle.topic) return;
    const createdAt = new Date(battle.createdAt).getTime();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - createdAt) / 1000);
      const remaining = NEGOTIATION_SECONDS - elapsed;
      setSecondsLeft(remaining);
      if (remaining <= 0 && !timeoutFiredRef.current) {
        timeoutFiredRef.current = true;
        setTimedOut(true);
        const randomTopic = DEBATE_TOPICS[Math.floor(Math.random() * DEBATE_TOPICS.length)];
        assignRandomTopic(battle.id, randomTopic);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [battle.id, battle.createdAt, battle.topic]);

  async function handlePropose() {
    const topic = draft.trim();
    if (!topic || sending) return;
    setSending(true);
    setError(null);
    const res = await proposeTopic(battle.id, topic);
    setSending(false);
    if (!res.ok) {
      setError(res.message ?? "Could not send that topic. Try again.");
      return;
    }
    setDraft("");
  }

  async function handleRespond(proposalId: string, accept: boolean) {
    setError(null);
    const res = await respondToTopicProposal(proposalId, accept);
    if (!res.ok) setError(res.message ?? "Could not respond. Try again.");
  }

  if (battle.topic) {
    return (
      <div className="mb-6">
        <p className="font-data text-[11px] uppercase tracking-wider text-steel mb-1">
          Topic
        </p>
        <p className="text-[15px]">{battle.topic}</p>
      </div>
    );
  }

  const nameFor = (playerId: string) =>
    playerId === profile.id ? "You" : opponent?.name ?? "Opponent";

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="font-data text-[11px] uppercase tracking-wider text-steel">
          Agree on a topic
        </p>
        <p
          className={`font-data text-[12px] uppercase tracking-wider ${
            secondsLeft <= 10 ? "text-signal" : "text-steel"
          }`}
        >
          {timedOut ? "Assigning a topic\u2026" : formatClock(secondsLeft)}
        </p>
      </div>

      <div
        ref={scrollRef}
        className="border border-steel-line max-h-64 overflow-y-auto p-4 space-y-3 mb-3"
      >
        {proposals.length === 0 && (
          <p className="text-steel text-[14px]">
            No topics proposed yet. Send one below to get started.
          </p>
        )}
        {proposals.map((p) => {
          const mine = p.proposedBy === profile.id;
          return (
            <div key={p.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[85%]">
                <p className="font-data text-[10px] uppercase tracking-wider text-steel mb-1">
                  {nameFor(p.proposedBy)}
                </p>
                <div
                  className={`p-3 text-[14px] leading-snug border ${
                    p.status === "accepted"
                      ? "border-signal text-bone"
                      : p.status === "rejected" || p.status === "superseded"
                      ? "border-steel-line text-steel line-through"
                      : "border-steel-line text-bone"
                  }`}
                >
                  {p.topic}
                </div>
                {p.status === "pending" && !mine && (
                  <div className="flex gap-4 mt-2">
                    <button
                      onClick={() => handleRespond(p.id, true)}
                      className="font-data text-[11px] uppercase tracking-wider text-signal hover:underline"
                    >
                      Agree
                    </button>
                    <button
                      onClick={() => handleRespond(p.id, false)}
                      className="font-data text-[11px] uppercase tracking-wider text-steel hover:underline"
                    >
                      Reject
                    </button>
                  </div>
                )}
                {p.status === "pending" && mine && (
                  <p className="font-data text-[11px] uppercase tracking-wider text-steel mt-2">
                    Waiting for {opponent?.name ?? "opponent"}&hellip;
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="font-data text-[12px] text-signal mb-2">{error}</p>}

      <div className="flex gap-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handlePropose();
          }}
          placeholder={rotatingTopic}
          disabled={sending || timedOut}
          className="flex-1 bg-transparent border-b border-steel-line py-2 focus:border-signal outline-none text-[15px] disabled:opacity-50"
        />
        <button
          onClick={handlePropose}
          disabled={sending || timedOut || !draft.trim()}
          className="font-data text-[12px] uppercase tracking-wider text-steel hover:text-signal transition-colors disabled:opacity-50 disabled:hover:text-steel"
        >
          Propose
        </button>
      </div>
    </div>
  );
}
