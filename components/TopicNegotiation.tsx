"use client";

import { useEffect, useRef, useState } from "react";
import {
  getTopicProposals,
  proposeTopic,
  respondToTopicProposal,
  assignRandomTopic,
  subscribeToTopicProposals,
  requestAiTopicResponse,
} from "@/lib/battle";
import { supabase } from "@/lib/supabase";
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
  tournamentTopics,
  tournamentCoreTopic = null,
}: {
  battle: Battle;
  profile: Player;
  opponent: Player | null;
  // When this battle belongs to a tournament with its own topic bank, use
  // that instead of the generic DEBATE_TOPICS pool — both for the rotating
  // placeholder and for the random fallback if nobody agrees in time.
  tournamentTopics?: string[];
  // Set only for emergency leagues (tournaments built around one
  // real-world subject). When present, any topic BOTH players agree on
  // still has to clear an AI relevance check against this subject before
  // it locks in — see handleRespond below and /api/battles/confirm-topic.
  tournamentCoreTopic?: string | null;
}) {
  const topicPool = tournamentTopics && tournamentTopics.length > 0 ? tournamentTopics : DEBATE_TOPICS;
  const [proposals, setProposals] = useState<TopicProposal[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingProposalId, setCheckingProposalId] = useState<string | null>(null);
  const [declineNotice, setDeclineNotice] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(NEGOTIATION_SECONDS);
  const [timedOut, setTimedOut] = useState(false);
  const timeoutFiredRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Proposal ids already handed to the AI for a decision — guards against
  // asking twice (e.g. a page reload landing on the same pending proposal).
  const aiRequestedRef = useRef<Set<string>>(new Set());
  // Captured once, at first render, so the countdown always starts at a
  // full 60 regardless of how long the route/data fetch took to land here.
  const startRef = useRef(Date.now());

  const rotatingTopic = useRotatingPlaceholder(topicPool, 3200, !battle.topic, 52);

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

  // Against an AI opponent, nobody's second browser is going to click
  // Agree/Reject — so whenever the human has a proposal sitting pending,
  // ask the server (Gemini, using the personality's own judgment) to
  // actually decide. Runs off proposal state rather than only right after
  // handlePropose so a reload mid-negotiation still gets a response.
  useEffect(() => {
    if (!opponent?.isAi) return;
    for (const p of proposals) {
      if (p.status === "pending" && p.proposedBy === profile.id && !aiRequestedRef.current.has(p.id)) {
        aiRequestedRef.current.add(p.id);
        requestAiTopicResponse(battle.id, p.id);
      }
    }
  }, [proposals, opponent?.isAi, profile.id, battle.id]);

  // 60-second window measured from the moment this negotiation screen
  // actually mounted on this player's device (not battle.createdAt, which
  // could already be several seconds old by the time the route/data fetch
  // finishes — that was making the timer visibly start below 60). Whichever
  // client's clock hits zero first assigns a random topic — assign_random_topic()
  // only writes if battle.topic is still null, so it's harmless if both
  // players' timers land within moments of each other.
  useEffect(() => {
    if (battle.topic) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
      const remaining = NEGOTIATION_SECONDS - elapsed;
      setSecondsLeft(remaining);
      if (remaining <= 0 && !timeoutFiredRef.current) {
        timeoutFiredRef.current = true;
        setTimedOut(true);
        const randomTopic = topicPool[Math.floor(Math.random() * topicPool.length)];
        assignRandomTopic(battle.id, randomTopic);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [battle.id, battle.topic]);

  // Best-effort autofocus: puts the cursor straight in the box on desktop,
  // and on mobile most browsers will pop the keyboard too — though some
  // (notably iOS Safari) block auto-opening the keyboard without a direct
  // tap, which is a platform restriction, not something we can override.
  useEffect(() => {
    if (battle.topic) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [battle.topic]);

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
    setDeclineNotice(null);

    if (!accept) {
      const res = await respondToTopicProposal(proposalId, false);
      if (!res.ok) setError(res.message ?? "Could not respond. Try again.");
      return;
    }

    // Non-emergency battles (no core subject to check against) accept
    // instantly, same as before — no AI call needed.
    if (!tournamentCoreTopic) {
      const res = await respondToTopicProposal(proposalId, true);
      if (!res.ok) setError(res.message ?? "Could not respond. Try again.");
      return;
    }

    // Emergency league: the agreed topic has to actually be about the
    // league's subject before it locks in. Server does the check (and,
    // if it fails, rejects the proposal and assigns a topic from this
    // tournament's own bank) — see /api/battles/confirm-topic.
    setCheckingProposalId(proposalId);
    try {
      const { data } = await supabase!.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError("Not signed in.");
        return;
      }
      const res = await fetch("/api/battles/confirm-topic", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ proposalId, battleId: battle.id }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Could not confirm that topic. Try again.");
        return;
      }
      if (result.accepted === false) {
        setDeclineNotice(
          `That topic didn't hold up as related to this league's subject, so a topic from the league's own list was assigned instead.`
        );
      }
      refresh();
    } finally {
      setCheckingProposalId(null);
    }
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
                      disabled={checkingProposalId === p.id}
                      className="font-data text-[11px] uppercase tracking-wider text-signal hover:underline disabled:opacity-50 disabled:hover:no-underline"
                    >
                      {checkingProposalId === p.id ? "Checking\u2026" : "Agree"}
                    </button>
                    <button
                      onClick={() => handleRespond(p.id, false)}
                      disabled={checkingProposalId === p.id}
                      className="font-data text-[11px] uppercase tracking-wider text-steel hover:underline disabled:opacity-50 disabled:hover:no-underline"
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

      {declineNotice && (
        <p className="font-data text-[12px] text-brass mb-2">{declineNotice}</p>
      )}
      {error && <p className="font-data text-[12px] text-signal mb-2">{error}</p>}

      <div className="flex gap-3">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handlePropose();
          }}
          placeholder={rotatingTopic}
          disabled={sending || timedOut}
          autoFocus
          enterKeyHint="send"
          className="flex-1 bg-transparent border-b border-steel-line py-2 focus:border-signal outline-none text-[15px] disabled:opacity-50 placeholder:text-steel placeholder:italic placeholder:opacity-60"
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
