"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  getMyPlayer,
  getMatchesForPlayer,
  getPlayerLookup,
  getRankHistoryForPlayer,
} from "@/lib/queries";
import { Player, Match, RankHistoryEntry } from "@/lib/types";
import { slugifyName } from "@/lib/slug";
import TimeAtRank from "@/components/TimeAtRank";

// This route is a signed-in player's own profile, e.g. eztren.xyz/samarth
// It mirrors what /join shows once a profile exists, just parked at a URL
// (and tab title) built from the player's own name instead of "/join".
export default function OwnProfilePage() {
  const params = useParams<{ handle: string }>();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [profile, setProfile] = useState<Player | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [history, setHistory] = useState<Match[]>([]);
  const [rankHistory, setRankHistory] = useState<RankHistoryEntry[]>([]);
  const [playerLookup, setPlayerLookup] = useState<Map<string, Player>>(
    new Map()
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setCheckingSession(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (checkingSession) return;
    if (!session) {
      router.replace("/join");
      return;
    }
    setCheckingProfile(true);
    getMyPlayer().then((p) => {
      setProfile(p);
      setCheckingProfile(false);
      if (!p) {
        router.replace("/join");
        return;
      }
      const correctHandle = slugifyName(p.name);
      if (correctHandle !== params.handle) {
        router.replace(`/${correctHandle}`);
      }
    });
  }, [checkingSession, session, params.handle, router]);

  useEffect(() => {
    if (!profile) return;
    getMatchesForPlayer(profile.id).then(setHistory);
    getPlayerLookup().then(setPlayerLookup);
    getRankHistoryForPlayer(profile.id).then(setRankHistory);
  }, [profile]);

  useEffect(() => {
    document.title = profile ? `${profile.name} | Eztren` : "Eztren";
  }, [profile]);

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.push("/join");
  }

  const loading = checkingSession || checkingProfile || !profile;

  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20">
        <div className="h-4 w-16 bg-steel-line/40 mb-4 animate-pulse" />
        <div className="h-10 w-64 bg-steel-line/40 mb-10 animate-pulse" />
        <div className="h-40 border border-steel-line animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-20">
      <p className="font-data text-[13px] uppercase tracking-wider text-signal mb-4">
        Your Profile
      </p>
      <h1 className="font-display text-5xl mb-6">{profile.name}</h1>

      <div className="border border-steel-line p-8 mb-8">
        <div className="flex items-baseline gap-4 mb-2">
          <span className="font-display text-5xl text-signal">
            {profile.rank}
          </span>
          <span className="font-data text-[13px] uppercase tracking-wider text-steel">
            {profile.league}
          </span>
        </div>
        <p className="font-data text-[12px] text-steel mb-6">
          At this rank for <TimeAtRank since={profile.rankSince} />
        </p>
        <div className="grid grid-cols-3 gap-4 font-data text-[13px] text-steel border-t border-steel-line pt-6">
          <div>
            <p className="text-bone text-lg">
              {profile.wins}&ndash;{profile.losses}
            </p>
            <p>win&ndash;loss</p>
          </div>
          <div>
            <p className="text-bone text-lg">{profile.judgedMatches}</p>
            <p>judged</p>
          </div>
          <div>
            <p className="text-bone text-lg">
              {profile.judgedMatches >= 10 ? "Yes" : "Not yet"}
            </p>
            <p>flagship-eligible</p>
          </div>
        </div>
      </div>

      <div className="mb-10">
        <p className="font-data text-[12px] uppercase tracking-wider text-steel mb-4">
          Rank History
        </p>
        <div className="space-y-px bg-steel-line border border-steel-line">
          {rankHistory.map((h) => (
            <div
              key={h.id}
              className="bg-void p-4 flex items-center justify-between"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-display text-xl">{h.rank}</span>
                <span className="font-data text-[11px] text-steel uppercase tracking-wider">
                  {h.league}
                </span>
              </div>
              <span className="font-data text-[12px] text-steel">
                {h.endedAt ? (
                  <TimeAtRank since={h.startedAt} until={h.endedAt} />
                ) : (
                  <>
                    <TimeAtRank since={h.startedAt} /> &middot; current
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-10">
        <p className="font-data text-[12px] uppercase tracking-wider text-steel mb-4">
          Match History
        </p>
        {history.length === 0 ? (
          <p className="text-steel text-[15px]">
            No matches yet &mdash; nothing recorded for you in the archive so
            far.
          </p>
        ) : (
          <div className="space-y-px bg-steel-line border border-steel-line">
            {history.map((m) => {
              const isJudge = m.judgeId === profile.id;
              const isReferee = m.refereeId === profile.id;
              const opponentId =
                m.playerAId === profile.id ? m.playerBId : m.playerAId;
              const opponent = playerLookup.get(opponentId);
              const wasWinner = m.winnerId === profile.id;
              return (
                <Link
                  key={m.id}
                  href={`/matches/${m.id}`}
                  className="block bg-void p-5 hover:bg-steel-line/10 transition-colors cursor-pointer"
                >
                  <p className="font-data text-[11px] uppercase tracking-wider text-steel mb-1">
                    {new Date(m.date).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    &middot;{" "}
                    {isJudge
                      ? "Judged"
                      : isReferee
                      ? "Refereed"
                      : wasWinner
                      ? "Won"
                      : m.winnerId
                      ? "Lost"
                      : "Undecided"}
                  </p>
                  <p className="font-body text-[15px]">{m.topic}</p>
                  {!isJudge && !isReferee && opponent && (
                    <p className="font-data text-[12px] text-steel mt-1">
                      vs {opponent.name}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <Link
        href="/rankings"
        className="font-data text-[13px] uppercase tracking-wider text-signal hover:underline"
      >
        View on the Ladder &rarr;
      </Link>

      <div className="mt-16 pt-6 border-t border-steel-line">
        <button
          onClick={handleSignOut}
          className="font-data text-[11px] text-steel/50 hover:text-steel transition-colors"
        >
          sign out
        </button>
      </div>
    </div>
  );
}
