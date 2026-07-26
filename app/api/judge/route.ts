import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// The only place GEMINI_API_KEY and DAILY_API_KEY get touched — both are
// server-only env vars, never shipped to the browser.

const GEMINI_MODEL = "gemini-3.5-flash";

function buildPrompt(nameA: string, nameB: string, topic: string) {
  return `You are an experienced, fair judge for Eztren, a debate sport. The sport's stated goal is not just to win, but to make people think "I never thought of it that way" — it values perspective, reasoning, communication, and respectful disagreement.

This was a free-flowing 10-minute debate on the topic: "${topic}"

The two debaters are:
- Player A: ${nameA}
- Player B: ${nameB}

If this is an audio recording: match voices to names using any self-introduction near the start of the call, and your best judgment from context if no names were stated. Two people are speaking; if you truly cannot distinguish, do your best based on the order and content of what's said.

Judge on the strength of reasoning, use of perspective, clarity of communication, and how respectfully they engaged with disagreement — not on volume, aggression, or who spoke more.

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
  if (!text) throw new Error("Gemini returned no content");
  return JSON.parse(text) as { winner: "A" | "B" | "tie"; summary: string; reasoning: string };
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

  const prompt = buildPrompt(playerA?.name ?? "Player A", playerB?.name ?? "Player B", match.topic);

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
