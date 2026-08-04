import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callJudgeModel, type JudgeAudio } from "@/lib/ai-judge";

// Gemini is the primary judge (and the only option for audio recordings —
// see the inline-audio path below), with OpenRouter as fallback if Gemini
// is unreachable or exhausted. See lib/ai-judge.ts. DAILY_API_KEY is also
// only touched here, for pulling the recording.

function buildPrompt(
  nameA: string,
  nameB: string,
  topic: string,
  context: {
    intendedMinutes: number;
    actualMinutes: number | null;
    endedEarly: boolean;
    format: "text" | "audio";
    emergencyCoreTopic?: string | null;
  }
) {
  const durationLine = context.actualMinutes === null
    ? `This was a free-flowing debate on the topic: "${topic}", scheduled for up to ${context.intendedMinutes} minutes.`
    : context.endedEarly
    ? `This was a free-flowing debate on the topic: "${topic}". It was scheduled for up to ${context.intendedMinutes} minutes but both players mutually agreed to end it early, after about ${context.actualMinutes} minute${context.actualMinutes === 1 ? "" : "s"}. Judge only on the substance of what was actually said — do not penalize either side for the debate being shorter than scheduled, and do not treat the early end itself as a sign either side "gave up" or "lost."`
    : `This was a free-flowing debate on the topic: "${topic}", which ran the full ${context.intendedMinutes} minutes.`;

  const emergencyLine = context.emergencyCoreTopic
    ? `

This debate was part of an Emergency League activated specifically to cover "${context.emergencyCoreTopic}". This carries a strict internal rule you must apply but never mention explicitly by name in your summary or reasoning:
- If a debater's arguments drift away from "${context.emergencyCoreTopic}" into substance that is genuinely unrelated to it, and they never bring it back, that is a serious strike against them for this match specifically — it should be enough on its own to lose them the debate, even if their unrelated arguments were individually well-reasoned. The topic itself was "${topic}", which both players agreed was related to "${context.emergencyCoreTopic}" — so straying from ${topic} into unrelated territory counts against them here.
- The one exception: if a debater goes to what looks like an unrelated angle but then explicitly, logically connects it back to "${context.emergencyCoreTopic}" — showing a real chain of reasoning for why that angle actually bears on the subject — treat that as a strength, not a violation. Reward it as genuine perspective (this is exactly the kind of "I never thought of it that way" move the sport values), not as going off-topic.
- Judge this normally alongside everything else — reasoning quality, evidence, communication — but let this factor decide close calls, and let a severe violation of it override an otherwise close debate.
- Do not state this rule, or that you applied it, anywhere in your summary or reasoning. Just factor it into the "winner" call silently, the way any other judging criterion would be applied.`
    : "";

  return `You are an experienced, fair judge for Eztren, a debate sport. The sport's stated goal is not just to win, but to make people think "I never thought of it that way" — it values perspective, reasoning, communication, and respectful disagreement.

${durationLine}${emergencyLine}

The two debaters are:
- Player A: ${nameA}
- Player B: ${nameB}

If this is an audio recording: match voices to names using any self-introduction near the start of the call, and your best judgment from context if no names were stated. Two people are speaking; if you truly cannot distinguish, do your best based on the order and content of what's said.

Judge on the strength of reasoning, use of perspective, clarity of communication, and how respectfully they engaged with disagreement — not on volume, aggression, or who spoke more.

Important calibration for how you weigh arguments:
- Do NOT default to whichever side sounds more agreeable, conventional, or "safe." A debater is not stronger just because their conclusion matches common wisdom, majority opinion, or a feel-good/moralistic framing.
- Actively reward a perspective that is different, unexpected, or goes against the grain, IF it is backed by sound logic, evidence, or a coherent chain of reasoning. Eztren's whole point is "I never thought of it that way" — a predictable, normative take that isn't defended well should lose to a sharper, less obvious one that is.
- Conversely, do not reward contrarianism for its own sake — a novel take with weak or sloppy logic still loses to a conventional take that is well-argued.
- Judge the quality of the reasoning chain itself: are claims actually supported, are counterarguments addressed, are there logical gaps or unearned leaps — independent of whether the conclusion is popular or unpopular.

Write your summary and reasoning like a real person talking, not like a report. Use short sentences. Use simple, everyday words — nothing fancy or academic. It's okay to sound a little human: say what struck you, what felt weak, what surprised you, the way a person would explain it to a friend after watching. Still be fair and back up your call with real reasons, just say it plainly.

Respond with ONLY a JSON object, no other text, in this exact shape:
{
  "winner": "A" | "B" | "tie",
  "summary": "1-2 short sentences for a public archive listing: what the debate was about and who won (or that it was a tie). Plain words, feels human, not stiff.",
  "reasoning": "A short paragraph (4-8 short sentences) explaining the call: the strongest points each side made, where one side was sharper, and why that decided it. Write it like you're actually talking to someone, with a bit of feeling in it, but keep every sentence short and every word simple. Do not quote either speaker directly — describe their arguments in your own words."
}`;
}

type Verdict = { winner: "A" | "B" | "tie"; summary: string; reasoning: string };

export async function POST(req: NextRequest) {
  const { matchId } = await req.json();
  if (!matchId) {
    return NextResponse.json({ error: "matchId required" }, { status: 400 });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const dailyKey = process.env.DAILY_API_KEY;

  if (!url || !anonKey || (!geminiKey && !openrouterKey)) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const supabase = createClient(url, anonKey, {
    db: { schema: "eztren" },
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: match } = await supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  if (match.judge_status === "judged") {
    return NextResponse.json({ status: "judged", winnerId: match.winner_id, summary: match.ai_summary });
  }
  if (match.judge_status === "judging") {
    return NextResponse.json({ status: "judging" });
  }

  const isAudio = (match.tags ?? []).includes("audio");

  // Audio recordings need time to finish processing on Daily's side — if
  // it's not ready yet, don't claim the match, just tell the client to
  // retry shortly.
  let audioBase64: string | null = null;
  let audioMimeType = "audio/mp4";

  if (isAudio) {
    if (!dailyKey) {
      return NextResponse.json({ error: "Daily not configured" }, { status: 500 });
    }
    if (!match.daily_room_name) {
      return NextResponse.json({ status: "pending", reason: "no_room" });
    }

    const listRes = await fetch(
      `https://api.daily.co/v1/recordings?room_name=${match.daily_room_name}`,
      { headers: { Authorization: `Bearer ${dailyKey}` } }
    );
    const list = await listRes.json();
    const recording = list.data?.find((r: any) => r.status === "finished");
    if (!recording) {
      return NextResponse.json({ status: "pending", reason: "recording_not_ready" });
    }

    const linkRes = await fetch(
      `https://api.daily.co/v1/recordings/${recording.id}/access-link`,
      { headers: { Authorization: `Bearer ${dailyKey}` } }
    );
    const link = await linkRes.json();
    if (!linkRes.ok) {
      return NextResponse.json({ status: "pending", reason: "link_failed" });
    }

    const audioRes = await fetch(link.download_link);
    if (!audioRes.ok) {
      return NextResponse.json({ status: "pending", reason: "download_failed" });
    }
    const contentType = audioRes.headers.get("content-type");
    if (contentType) audioMimeType = contentType;
    const buffer = await audioRes.arrayBuffer();
    if (buffer.byteLength > 19 * 1024 * 1024) {
      // Over Gemini's inline request limit for this MVP path.
      await supabase.rpc("mark_match_judge_failed", {
        match_id: matchId,
        error_text: "Recording too large for inline judging",
      });
      return NextResponse.json({ status: "failed", reason: "too_large" });
    }
    audioBase64 = Buffer.from(buffer).toString("base64");
  } else if (!match.transcript) {
    return NextResponse.json({ status: "pending", reason: "no_transcript" });
  }

  // Claim the match so a second client polling at the same moment doesn't
  // also fire off a Gemini call for the same match.
  const { data: claimed } = await supabase.rpc("claim_match_for_judging", {
    match_id: matchId,
  });
  if (!claimed) {
    return NextResponse.json({ status: "judging" });
  }

  const { data: playerA } = await supabase
    .from("players")
    .select("name")
    .eq("id", match.player_a_id)
    .maybeSingle();
  const { data: playerB } = await supabase
    .from("players")
    .select("name")
    .eq("id", match.player_b_id)
    .maybeSingle();

  // Pull the real scheduled vs. actual duration off the underlying battle
  // row (matches.battle_id) so the judge knows whether this ended early —
  // otherwise a battle mutually ended after 2 minutes would get judged
  // against a hardcoded "10-minute debate" framing that no longer matched
  // what actually happened.
  let intendedMinutes = 10;
  let actualMinutes: number | null = null;
  let endedEarly = false;
  if (match.battle_id) {
    const { data: b } = await supabase
      .from("battles")
      .select("duration_seconds, started_at, ended_at")
      .eq("id", match.battle_id)
      .maybeSingle();
    if (b) {
      intendedMinutes = Math.round((b.duration_seconds ?? 600) / 60);
      if (b.started_at && b.ended_at) {
        const actualSeconds =
          (new Date(b.ended_at).getTime() - new Date(b.started_at).getTime()) / 1000;
        actualMinutes = Math.max(1, Math.round(actualSeconds / 60));
        // 15s grace for the usual gap between the timer hitting zero and
        // the completion call landing — anything beyond that is a genuine
        // early end, not just network/processing lag.
        endedEarly = actualSeconds < (b.duration_seconds ?? 600) - 15;
      }
    }
  }

  // If this match belongs to an emergency league, pull its core subject so
  // the judge enforces the on-topic rule (see buildPrompt). Not shown to
  // players anywhere — purely a server-side prompt input.
  let emergencyCoreTopic: string | null = null;
  if (match.tournament_id) {
    const { data: tournament } = await supabase
      .from("tournaments")
      .select("core_topic")
      .eq("id", match.tournament_id)
      .maybeSingle();
    emergencyCoreTopic = tournament?.core_topic ?? null;
  }

  const prompt = buildPrompt(playerA?.name ?? "Player A", playerB?.name ?? "Player B", match.topic, {
    intendedMinutes,
    actualMinutes,
    endedEarly,
    format: isAudio ? "audio" : "text",
    emergencyCoreTopic,
  });

  try {
    const audio: JudgeAudio | undefined =
      isAudio && audioBase64 ? { base64: audioBase64, mimeType: audioMimeType } : undefined;
    const fullPrompt = audio ? prompt : `${prompt}\n\nTranscript:\n${match.transcript}`;

    const { result: verdict } = await callJudgeModel<Verdict>(fullPrompt, {
      geminiKey,
      openrouterKey,
      audio,
    });

    const winnerPlayerId =
      verdict.winner === "A"
        ? match.player_a_id
        : verdict.winner === "B"
        ? match.player_b_id
        : null;

    await supabase.rpc("apply_match_result", {
      match_id: matchId,
      winner_player_id: winnerPlayerId,
      summary: verdict.summary,
      reasoning: verdict.reasoning,
    });

    return NextResponse.json({
      status: "judged",
      winnerId: winnerPlayerId,
      summary: verdict.summary,
      reasoning: verdict.reasoning,
    });
  } catch (err: any) {
    await supabase.rpc("mark_match_judge_failed", {
      match_id: matchId,
      error_text: err?.message ?? "Unknown error",
    });
    return NextResponse.json({ error: err?.message ?? "Judging failed" }, { status: 500 });
  }
}
