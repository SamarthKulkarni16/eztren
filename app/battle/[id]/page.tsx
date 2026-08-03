"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getMyPlayer, getPlayerById, getMatchByBattleId, getTournamentById } from "@/lib/queries";
import { getBattle, markPlayerReady, subscribeToBattle } from "@/lib/battle";
import { Player, Battle, Tournament } from "@/lib/types";
import TextBattle from "@/components/TextBattle";
import AudioBattle from "@/components/AudioBattle";
import VSCard, { VSCardStatus } from "@/components/VSCard";
import TopicNegotiation from "@/components/TopicNegotiation";

function toVSCardStatus(status: Battle["status"]): VSCardStatus {
  if (status === "live") return "live";
  if (status === "completed" || status === "abandoned") return "completed";
  return "scheduled";
}

export default function BattleRoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<Player | null>(null);
  const [battle, setBattle] = useState<Battle | null>(null);
  const [opponent, setOpponent] = useState<Player | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyPlayer().then(setProfile);
  }, []);

  useEffect(() => {
    if (!id) return;
    getBattle(id).then(async (b) => {
      setBattle(b);
      setLoading(false);
    });
    const unsub = subscribeToBattle(id, setBattle);
    return unsub;
  }, [id]);

  useEffect(() => {
    if (!battle?.tournamentId) {
      setTournament(null);
      return;
    }
    getTournamentById(battle.tournamentId).then(setTournament);
  }, [battle?.tournamentId]);

  useEffect(() => {
    if (!battle || !profile) return;
    const opponentId =
      battle.playerAId === profile.id ? battle.playerBId : battle.playerAId;
    getPlayerById(opponentId).then(setOpponent);
  }, [battle, profile]);

  useEffect(() => {
    if (battle?.status !== "completed" && battle?.status !== "abandoned") return;
    getMatchByBattleId(battle.id).then((match) => {
      if (match) router.replace(`/matches/${match.id}`);
    });
  }, [battle?.status, battle?.id, router]);

  if (loading) return null;

  if (!battle || !profile) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20">
        <p className="font-display text-2xl mb-4">Battle not found.</p>
        <Link href="/battle" className="font-data text-[13px] uppercase tracking-wider text-signal hover:underline">
          &larr; Back to Battle
        </Link>
      </div>
    );
  }

  const isParticipant = battle.playerAId === profile.id || battle.playerBId === profile.id;
  if (!isParticipant) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20">
        <p className="font-display text-2xl">This isn&rsquo;t your battle.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-20">
      <p className="font-data text-[13px] uppercase tracking-wider text-signal mb-4">
        {battle.format === "text" ? "Text Battle" : "Audio Battle"}
        {battle.isPrivate && (
          <span className="ml-3 text-steel">&middot; Private &mdash; won&rsquo;t be archived</span>
        )}
      </p>
      {opponent && (
        <div className="mb-10">
          <VSCard
            playerA={{ id: profile.id, name: profile.name, rank: profile.rank, league: profile.league, isAi: profile.isAi }}
            playerB={{ id: opponent.id, name: opponent.name, rank: opponent.rank, league: opponent.league, isAi: opponent.isAi }}
            status={toVSCardStatus(battle.status)}
            topic={battle.topic}
          />
        </div>
      )}

      <div className={battle.status === "live" ? "" : "border border-steel-line p-8 mb-8"}>
        {battle.status === "waiting" && (() => {
          const isPlayerA = battle.playerAId === profile.id;
          const myReady = isPlayerA ? battle.playerAReady : battle.playerBReady;
          const opponentReady = isPlayerA ? battle.playerBReady : battle.playerAReady;
          return (
            <div>
              <p className="text-steel text-[15px] mb-4">
                Both players need to confirm ready before this goes live.
                {battle.format === "text" &&
                  !battle.topic &&
                  " Agree on a topic below — you have 60 seconds before one is picked for you."}
              </p>
              {battle.format === "text" && (
                <TopicNegotiation
                  battle={battle}
                  profile={profile}
                  opponent={opponent}
                  tournamentTopics={tournament?.topics}
                  tournamentCoreTopic={tournament?.coreTopic ?? null}
                />
              )}
              {myReady ? (
                <p className="font-data text-[13px] uppercase tracking-wider text-steel">
                  {opponentReady
                    ? "Starting…"
                    : `Waiting for ${opponent?.name ?? "your opponent"} to confirm ready…`}
                </p>
              ) : (
                <button
                  onClick={() => markPlayerReady(battle.id)}
                  className="font-data text-[13px] uppercase tracking-wider bg-bone text-void px-8 py-4 hover:bg-signal transition-colors"
                >
                  I&rsquo;m Ready
                  {opponentReady ? " — opponent is waiting on you" : ""}
                </button>
              )}
            </div>
          );
        })()}
        {battle.status === "live" && battle.format === "text" && (
          <TextBattle battle={battle} profile={profile} opponent={opponent} />
        )}
        {battle.status === "live" && battle.format === "audio" && (
          <AudioBattle battle={battle} profile={profile} opponent={opponent} />
        )}
        {(battle.status === "completed" || battle.status === "abandoned") && (
          <div>
            <p className="font-display text-2xl mb-2">
              {battle.status === "abandoned" ? "Battle timed out." : "Battle ended."}
            </p>
            <p className="font-data text-[13px] uppercase tracking-wider text-steel">
              Taking you to the AI judge&hellip;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
