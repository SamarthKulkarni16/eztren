"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getMatchById, getPlayerLookup } from "@/lib/queries";
import { triggerJudging, JudgeResult } from "@/lib/judge";
import { supabase } from "@/lib/supabase";
import { Match, Player } from "@/lib/types";

const MAX_AUTO_RETRIES = 8; // ~2 minutes at 15s apart — covers Daily's recording processing delay

export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<Match | null | undefined>(undefined);
  const [playerLookup, setPlayerLookup] = useState<Map<string, Player>>(new Map());
  const [signedIn, setSignedIn] = useState(false);
  const [judging, setJudging] = useState(false);

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
  const winner = match.winnerId ? playerLookup.get(match.winnerId) : undefined;

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

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 mb-8 font-data text-[13px] text-steel border-y border-steel-line py-5">
        <span>
          {a?.rank} {a?.name}
          {winner?.id === a?.id && <span className="text-signal ml-1">&#9679; won</span>}
        </span>
        <span className="text-steel-line">vs</span>
        <span>
          {b?.rank} {b?.name}
          {winner?.id === b?.id && <span className="text-signal ml-1">&#9679; won</span>}
        </span>
        {!match.winnerId && <span className="italic">undecided</span>}
        {judge && <span>Judged by {judge.name}</span>}
      </div>

      <p className="text-steel text-[16px] leading-relaxed mb-4 max-w-2xl">
        {match.aiSummary || (
          <span className="italic">
            {match.judgeStatus === "judging" || judging
              ? "The AI judge is reviewing this match\u2026"
              : match.judgeStatus === "failed"
              ? "Judging failed \u2014 will retry automatically, or try again below."
              : "Awaiting AI judgment \u2014 the record below is the full, unedited match."}
          </span>
        )}
      </p>

      {!match.aiSummary && signedIn && !judging && (
        <button
          onClick={() => runJudging(match.id, MAX_AUTO_RETRIES)}
          className="font-data text-[12px] uppercase tracking-wider text-signal hover:underline mb-10 block"
        >
          {match.judgeStatus === "failed" ? "Retry Judging" : "Judge This Match Now"}
        </button>
      )}
      {!match.aiSummary && !signedIn && (
        <p className="font-data text-[12px] text-steel mb-10">
          <Link href="/join" className="text-signal hover:underline">Sign in</Link> to trigger AI judging.
        </p>
      )}
      {match.aiSummary && <div className="mb-6" />}

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
