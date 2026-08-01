import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// The only place GEMINI_API_KEY and DAILY_API_KEY get touched — both are
// server-only env vars, never shipped to the browser.

const GEMINI_MODEL = "gemini-3.5-flash";

function buildPrompt(
  nameA: string,
  nameB: string,
  topic: string,
  context: {
    intendedMinutes: number;
    actualMinutes: number | null;
    endedEarly: boolean;
    format: "text" | "audio";
  }
) {
  const durationLine = context.actualMinutes === null
    ? `This was a free-flowing debate on the topic: "${topic}", scheduled for up to ${context.intendedMinutes} minutes.`
    : context.endedEarly
    ? `This was a free-flowing debate on the topic: "${topic}". It was scheduled for up to ${context.intendedMinutes} minutes but both players mutually agreed to end it early, after about ${context.actualMinutes} minute${context.actualMinutes === 1 ? "" : "s"}. Judge only on the substance of what was actually said — do not penalize either side for the debate being shorter than scheduled, and do not treat the early end itself as a sign either side "gave up" or "lost."`
    : `This was a free-flowing debate on the topic: "${topic}", which ran the full ${context.intendedMinutes} minutes.`;

  return `You are an experienced, fair judge for Eztren, a debate sport. The sport's stated goal is not just to win, but to make people think "I never thought of it that way" — it values perspective, reasoning, communication, and respectful disagreement.

${durationLine}

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

Respond with ONLY a JSON object, no other text, in this exact shape:
{
  "winner": "A" | "B" | "tie",
  "summary": "1-2 sentences for a public archive listing: what the debate was about and who won (or that it was a tie).",
  "reasoning": "A fuller paragraph (4-8 sentences) explaining the verdict in detail: the strongest points each side made, where one side's reasoning or perspective was sharper than the other's, and specifically why that tipped the decision. Written for someone who wants to understand the judge's actual thinking, not just the headline. Do not quote either speaker directly — describe their arguments in your own words."
}`;
}

async function callGemini(apiKey: string, parts: any[]) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message ?? "Gemini request failed");
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const finishReason = data.candidates?.[0]?.finishReason;
    throw new Error(
      finishReason ? `Gemini returned no content (finishReason: ${finishReason})` : "Gemini returned no content"
    );
  }

  try {
    return JSON.parse(text) as { winner: "A" | "B" | "tie"; summary: string; reasoning: string };
  } catch {
    // responseMimeType:"application/json" usually guarantees clean JSON, but
    // if Gemini ever wraps it in markdown fences or stray text, salvage the
    // JSON object instead of failing the whole judging run.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Gemini returned unparseable content: ${text.slice(0, 200)}`);
    try {
      return JSON.parse(match[0]) as { winner: "A" | "B" | "tie"; summary: string; reasoning: string };
    } catch {
      throw new Error(`Gemini returned malformed JSON: ${text.slice(0, 200)}`);
    }
  }
}

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
  const dailyKey = process.env.DAILY_API_KEY;

  if (!url || !anonKey || !geminiKey) {
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

  const prompt = buildPrompt(playerA?.name ?? "Player A", playerB?.name ?? "Player B", match.topic, {
    intendedMinutes,
    actualMinutes,
    endedEarly,
    format: isAudio ? "audio" : "text",
  });

  try {
    const parts: any[] = [{ text: prompt }];
    if (isAudio && audioBase64) {
      parts.push({ inlineData: { mimeType: audioMimeType, data: audioBase64 } });
    } else {
      parts.push({ text: `\n\nTranscript:\n${match.transcript}` });
    }

    const verdict = await callGemini(geminiKey, parts);

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
