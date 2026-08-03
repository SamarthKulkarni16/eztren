"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getMatchById, getPlayerLookup } from "@/lib/queries";
import { triggerJudging, JudgeResult } from "@/lib/judge";
import { supabase } from "@/lib/supabase";
import { Match, Player } from "@/lib/types";
import VSCard from "@/components/VSCard";

const MAX_AUTO_RETRIES = 8; // ~2 minutes at 15s apart — covers Daily's recording processing delay

export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<Match | null | undefined>(undefined);
  const [playerLookup, setPlayerLookup] = useState<Map<string, Player>>(new Map());
  const [signedIn, setSignedIn] = useState(false);
  const [judging, setJudging] = useState(false);
  const wasJudgedRef = useRef(false);
  const [justRevealed, setJustRevealed] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([getMatchById(id), getPlayerLookup()]).then(([m, lookup]) => {
      setMatch(m);
      setPlayerLookup(lookup);
    });
  }, [id]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  async function runJudging(matchId: string, attemptsLeft: number) {
    setJudging(true);
    const result: JudgeResult = await triggerJudging(matchId);
    if (result.status === "judged") {
      const refreshed = await getMatchById(matchId);
      setMatch(refreshed);
      setJudging(false);
      return;
    }
    if ((result.status === "pending" || result.status === "judging") && attemptsLeft > 0) {
      setTimeout(() => runJudging(matchId, attemptsLeft - 1), 15000);
      return;
    }
    setJudging(false);
    const refreshed = await getMatchById(matchId);
    setMatch(refreshed);
  }

  useEffect(() => {
    if (!match || !signedIn) return;
    if (match.judgeStatus === "judged" || judging) return;
    if (match.judgeStatus === "pending" || match.judgeStatus === "failed") {
      runJudging(match.id, MAX_AUTO_RETRIES);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id, match?.judgeStatus, signedIn]);

  useEffect(() => {
    if (!match) return;
    const nowJudged = Boolean(match.aiSummary);
    if (nowJudged && !wasJudgedRef.current) setJustRevealed(true);
    wasJudgedRef.current = nowJudged;
  }, [match?.aiSummary]);

  if (match === undefined) return null;
  if (match === null) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20">
        <p className="font-display text-2xl mb-4">Match not found.</p>
        <Link href="/archive" className="font-data text-[13px] uppercase tracking-wider text-signal hover:underline">
          &larr; Back to Archive
        </Link>
      </div>
    );
  }


  const a = playerLookup.get(match.playerAId);
  const b = playerLookup.get(match.playerBId);
  const judge = match.judgeId ? playerLookup.get(match.judgeId) : undefined;

  const transcriptLines = match.transcript
    ? match.transcript.split("\n").map((line) => {
        const idx = line.indexOf(": ");
        if (idx === -1) return { speaker: null, text: line };
        return { speaker: line.slice(0, idx), text: line.slice(idx + 2) };
      })
    : [];

  return (
    <div className="max-w-3xl mx-auto px-6 py-20">
      <Link
        href="/archive"
        className="font-data text-[13px] uppercase tracking-wider text-signal hover:underline"
      >
        &larr; Archive
      </Link>

      <p className="font-data text-[12px] uppercase tracking-wider text-steel mt-8 mb-2">
        {match.tournament ? `${match.tournament} \u00b7 ` : ""}
        {match.league}
        {" \u00b7 "}
        {new Date(match.date).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </p>
      <h1 className="font-display text-4xl mb-8">{match.topic}</h1>

      {a && b && (
        <div className={`mb-8 ${justRevealed && match.aiSummary ? "animate-verdict-in" : ""}`}>
          <VSCard
            playerA={{ id: a.id, name: a.name, rank: a.rank, league: a.league, isAi: a.isAi }}
            playerB={{ id: b.id, name: b.name, rank: b.rank, league: b.league, isAi: b.isAi }}
            status={match.aiSummary ? "completed" : "live"}
            winnerId={match.winnerId}
            topic={null}
          />
        </div>
      )}

      {!match.aiSummary ? (
        <div className="relative overflow-hidden border border-steel-line px-8 py-10 mb-8 text-center">
          <div className="absolute top-0 left-0 h-[2px] w-1/4 bg-signal animate-scan-sweep" />
          <p className="font-versus font-extrabold uppercase tracking-wide text-2xl sm:text-3xl mb-3 text-bone">
            {match.judgeStatus === "failed" && !judging
              ? "Judging hit a snag"
              : "The AI judge is deliberating"}
          </p>
          <p className="font-data text-[12px] uppercase tracking-[0.15em] text-steel flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
            {match.judgeStatus === "failed" && !judging
              ? "Will retry automatically \u2014 or try again below"
              : "Weighing every turn, every argument"}
          </p>
          {signedIn && !judging && (
            <button
              onClick={() => runJudging(match.id, MAX_AUTO_RETRIES)}
              className="font-data text-[12px] uppercase tracking-wider text-signal hover:underline mt-6"
            >
              {match.judgeStatus === "failed" ? "Retry Judging" : "Judge This Match Now"}
            </button>
          )}
          {!signedIn && (
            <p className="font-data text-[12px] text-steel mt-6">
              <Link href="/join" className="text-signal hover:underline">Sign in</Link> to trigger AI judging.
            </p>
          )}
        </div>
      ) : (
        <div className={justRevealed ? "animate-verdict-in" : ""}>
          <p className="font-data text-[12px] uppercase tracking-[0.2em] text-gold mb-3">
            &#9679; The Verdict Is In
            {!match.winnerId && <span className="text-steel ml-2 normal-case tracking-normal">&mdash; ruled a tie</span>}
          </p>
          <p className="text-steel text-[16px] leading-relaxed mb-2 max-w-2xl">
            {match.aiSummary}
          </p>
          {judge && (
            <p className="font-data text-[11px] uppercase tracking-wider text-steel mb-6">
              Judged by {judge.name}
            </p>
          )}
        </div>
      )}

      {match.judgeReasoning && (
        <div className="mb-10">
          <p className="font-data text-[12px] uppercase tracking-wider text-steel mb-4">
            Judge&rsquo;s Reasoning
          </p>
          <p className="text-steel text-[15px] leading-relaxed max-w-2xl border-l-2 border-signal pl-6">
            {match.judgeReasoning}
          </p>
        </div>
      )}

      {match.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-10">
          {match.tags.map((tag) => (
            <span
              key={tag}
              className="font-data text-[11px] uppercase tracking-wider text-steel border border-steel-line px-2 py-1"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {transcriptLines.length > 0 && (
        <div>
          <p className="font-data text-[12px] uppercase tracking-wider text-steel mb-4">
            Transcript
          </p>
          <div className="border border-steel-line p-8 space-y-5">
            {transcriptLines.map((line, i) => (
              <div key={i}>
                {line.speaker && (
                  <p className="font-data text-[11px] uppercase tracking-wider text-steel mb-1">
                    {line.speaker}
                  </p>
                )}
                <p className="text-[15px] leading-relaxed">{line.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {match.tags.includes("audio") && (
        <div>
          <p className="font-data text-[12px] uppercase tracking-wider text-steel mb-4">
            Recording
          </p>
          {match.recordingUrl ? (
            <audio controls src={match.recordingUrl} className="w-full mb-2" />
          ) : (
            <p className="text-steel text-[14px] italic">
              No recording available for this match.
            </p>
          )}
        </div>
      )}

      {!match.transcript && !match.tags.includes("audio") && (
        <p className="text-steel text-[15px] italic">
          No transcript recorded for this match yet.
        </p>
      )}
    </div>
  );
}
