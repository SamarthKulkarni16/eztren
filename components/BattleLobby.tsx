"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getMyPlayer, getPlayers } from "@/lib/queries";
import {
  joinQueue,
  leaveQueue,
  isInQueue,
  pollForMatch,
  sendChallenge,
  getMyChallenges,
  acceptChallenge,
  declineChallenge,
  cancelChallenge,
  subscribeToIncomingChallenges,
  subscribeToOutgoingChallengeUpdates,
} from "@/lib/battle";
import { Player, BattleFormat, BattleChallenge } from "@/lib/types";

// Shared lobby UI for both /battle (open queue) and /tournaments/[id]/battle
// (scoped queue). Passing a tournamentId scopes queueing, challenges, and
// the resulting battle to that tournament — see match_queue() in
// 025_tournament_battles.sql for how the scoping is enforced server-side.
export default function BattleLobby({
  tournamentId = null,
  tournamentName,
}: {
  tournamentId?: string | null;
  tournamentName?: string;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [format, setFormat] = useState<BattleFormat>("text");
  const [isPrivate, setIsPrivate] = useState(false);

  const [inQueue, setInQueue] = useState(false);
  const [queueSince, setQueueSince] = useState<string | null>(null);
  const [stopPolling, setStopPolling] = useState<(() => void) | null>(null);
  const [dotCount, setDotCount] = useState(1);

  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState("");

  const [incoming, setIncoming] = useState<BattleChallenge[]>([]);
  const [outgoing, setOutgoing] = useState<BattleChallenge[]>([]);
  const [challengeMessage, setChallengeMessage] = useState("");
  const [queueError, setQueueError] = useState<string | null>(null);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setLoading(false);
        return;
      }
      const p = await getMyPlayer();
      setProfile(p);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    getPlayers().then(setPlayers);
  }, []);

  const refreshChallenges = useCallback(async () => {
    if (!profile) return;
    const { incoming, outgoing } = await getMyChallenges(profile.id);
    setIncoming(incoming);
    setOutgoing(outgoing);
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    refreshChallenges();
    isInQueue(profile.id, format).then(setInQueue);

    const unsubIn = subscribeToIncomingChallenges(profile.id, () => refreshChallenges());
    const unsubOut = subscribeToOutgoingChallengeUpdates(profile.id, (c) => {
      refreshChallenges();
      if (c.status === "accepted" && c.battleId) {
        router.push(`/battle/${c.battleId}`);
      }
    });
    return () => {
      unsubIn();
      unsubOut();
    };
  }, [profile, format, refreshChallenges, router]);

  useEffect(() => {
    if (!inQueue) return;
    setDotCount(1);
    const interval = setInterval(() => {
      setDotCount((d) => (d % 3) + 1);
    }, 500);
    return () => clearInterval(interval);
  }, [inQueue]);

  async function handleJoinQueue() {
    if (!profile) return;
    setQueueError(null);
    const res = await joinQueue(profile.id, format, tournamentId ? false : isPrivate, tournamentId);
    if (!res.ok) {
      setQueueError(res.message ?? "Could not join the queue. Try again.");
      return;
    }
    // Use the database's own timestamp for the match poll's anchor, not the
    // client's local clock — a device clock running even a couple seconds
    // fast used to make a player's own match invisible to their poll
    // forever. Fall back to local time only if the server somehow didn't
    // hand one back.
    const since = res.since ?? new Date().toISOString();
    setInQueue(true);
    setQueueSince(since);
    const stop = pollForMatch(profile.id, format, since, (battle) => {
      router.push(`/battle/${battle.id}`);
    });
    setStopPolling(() => stop);
  }

  async function handleLeaveQueue() {
    if (!profile) return;
    stopPolling?.();
    setStopPolling(null);
    setQueueError(null);
    await leaveQueue(profile.id, format);
    setInQueue(false);
  }

  async function handleChallenge(opponentId: string) {
    if (!profile || sendingTo) return;
    setSendingTo(opponentId);
    setChallengeMessage("");
    const res = await sendChallenge(profile.id, opponentId, format, tournamentId ? false : isPrivate, tournamentId);
    setChallengeMessage(res.ok ? "Challenge sent." : res.message ?? "Could not send challenge.");
    setSendingTo(null);
    refreshChallenges();
  }

  async function handleAccept(challengeId: string) {
    const res = await acceptChallenge(challengeId);
    if (res.ok && res.battleId) {
      router.push(`/battle/${res.battleId}`);
    }
  }

  const filteredPlayers = players.filter(
    (p) =>
      p.id !== profile?.id &&
      (p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.rank.toLowerCase() === search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20">
        <div className="h-4 w-16 bg-steel-line/40 mb-4 animate-pulse" />
        <div className="h-10 w-64 bg-steel-line/40 mb-10 animate-pulse" />
        <div className="h-40 border border-steel-line animate-pulse" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20">
        <p className="font-data text-[13px] uppercase tracking-wider text-signal mb-4">
          {tournamentName ? `Battle \u00b7 ${tournamentName}` : "Battle"}
        </p>
        <h1 className="font-display text-4xl mb-6">Register to battle.</h1>
        <p className="text-steel text-lg leading-relaxed mb-8">
          You need a ranked profile before you can queue up or send a
          challenge.
        </p>
        <Link
          href="/join"
          className="font-data text-[13px] uppercase tracking-wider bg-bone text-void px-8 py-4 hover:bg-signal transition-colors"
        >
          Join the League
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-20">
      <p className="font-data text-[13px] uppercase tracking-wider text-signal mb-4">
        {tournamentName ? `Battle \u00b7 ${tournamentName}` : "Battle"}
      </p>
      <h1 className="font-display text-4xl mb-10">Find an opponent.</h1>

      <div className="flex gap-px bg-steel-line border border-steel-line w-fit mb-6">
        {(["text", "audio"] as const).map((f) => (
          <button
            key={f}
            onClick={() => {
              if (!inQueue) setFormat(f);
            }}
            disabled={inQueue}
            className={`font-data text-[13px] uppercase tracking-wider px-6 py-3 transition-colors disabled:cursor-not-allowed ${
              format === f
                ? "bg-bone text-void"
                : "bg-void text-steel hover:text-bone"
            }`}
          >
            {f === "text" ? "Text Battle" : "Audio Battle"}
          </button>
        ))}
      </div>

      <div className="border border-steel-line p-8 mb-12">
        {inQueue ? (
          <div>
            <p className="font-display text-2xl mb-2">
              Finding an opponent
              <span className="inline-block w-[1.5em] text-left align-bottom">
                {".".repeat(dotCount)}
              </span>
            </p>
            <p className="text-steel text-[15px] mb-6">
              You&rsquo;ll be moved into the battle room automatically the
              moment someone else queues up for {format}
              {isPrivate ? ", also looking for a private match" : ""}.
            </p>
            <button
              onClick={handleLeaveQueue}
              className="font-data text-[13px] uppercase tracking-wider border border-bone px-6 py-3 hover:bg-bone hover:text-void transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div>
            <p className="text-steel text-[15px] mb-6">
              Queue up for a random {format} battle, or challenge a specific
              player below.
            </p>
            <button
              onClick={handleJoinQueue}
              className="font-data text-[13px] uppercase tracking-wider bg-bone text-void px-8 py-4 hover:bg-signal transition-colors"
            >
              Join Queue
            </button>
            {queueError && (
              <p className="font-data text-[12px] text-signal mt-4">{queueError}</p>
            )}
          </div>
        )}
      </div>

      {incoming.length > 0 && (
        <div className="mb-12">
          <p className="font-data text-[12px] uppercase tracking-wider text-steel mb-4">
            Incoming Challenges
          </p>
          <div className="space-y-px bg-steel-line border border-steel-line">
            {incoming.map((c) => {
              const from = players.find((p) => p.id === c.challengerId);
              return (
                <div
                  key={c.id}
                  className="bg-void p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="font-body text-[15px]">
                      {from?.name ?? "Unknown player"}
                    </p>
                    <p className="font-data text-[11px] text-steel uppercase tracking-wider">
                      {c.format} battle{c.isPrivate ? " \u00b7 private" : ""}                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleAccept(c.id)}
                      className="font-data text-[12px] uppercase tracking-wider text-signal hover:underline"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => declineChallenge(c.id).then(refreshChallenges)}
                      className="font-data text-[12px] uppercase tracking-wider text-steel hover:underline"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="mb-12">
          <p className="font-data text-[12px] uppercase tracking-wider text-steel mb-4">
            Sent Challenges
          </p>
          <div className="space-y-px bg-steel-line border border-steel-line">
            {outgoing.map((c) => {
              const to = players.find((p) => p.id === c.opponentId);
              return (
                <div
                  key={c.id}
                  className="bg-void p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="font-body text-[15px]">
                      {to?.name ?? "Unknown player"}
                    </p>
                    <p className="font-data text-[11px] text-steel uppercase tracking-wider">
                      {c.format} battle{c.isPrivate ? " \u00b7 private" : ""} &middot; waiting
                    </p>
                  </div>
                  <button
                    onClick={() => cancelChallenge(c.id).then(refreshChallenges)}
                    className="font-data text-[12px] uppercase tracking-wider text-steel hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="font-data text-[12px] uppercase tracking-wider text-steel mb-4">
          Challenge a Player
        </p>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or rank"
          className="w-full bg-transparent border-b border-steel-line py-3 mb-2 focus:border-signal outline-none"
        />
        {challengeMessage && (
          <p className="font-data text-[12px] text-signal mb-2">{challengeMessage}</p>
        )}
        {search && (
          <div className="space-y-px bg-steel-line border border-steel-line max-h-64 overflow-y-auto">
            {filteredPlayers.slice(0, 8).map((p) => {
              const alreadyPending = outgoing.some(
                (c) => c.opponentId === p.id && c.format === format && c.status === "pending"
              );
              const sending = sendingTo === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handleChallenge(p.id)}
                  disabled={alreadyPending || sending}
                  className="w-full bg-void p-4 flex items-center justify-between hover:bg-steel-line/20 transition-colors text-left disabled:hover:bg-void disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span className="font-body text-[15px]">{p.name}</span>
                  <span className="font-data text-[12px] text-steel">
                    {alreadyPending ? "Pending" : sending ? "Sending\u2026" : p.rank}
                  </span>
                </button>
              );
            })}
            {filteredPlayers.length === 0 && (
              <p className="bg-void p-4 text-steel text-[14px]">No players found.</p>
            )}
          </div>
        )}
      </div>

      {!tournamentId && (
        <label className="flex items-start gap-3 mt-12 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={isPrivate}
            disabled={inQueue}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="mt-1 accent-signal disabled:cursor-not-allowed"
          />
          <span className="text-steel text-[14px] leading-snug">
            Keep this battle private
            <span className="block font-data text-[11px] uppercase tracking-wider mt-0.5">
              Won&rsquo;t appear in the archive or Watch Live
            </span>
          </span>
        </label>
      )}
    </div>
  );
}
