import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callPlayerBot } from "@/lib/ai-players";

// Generates one reply from an AI personality and inserts it as the next
// battle turn. Called fire-and-forget from TextBattle.tsx right after the
// human sends their own turn against an AI opponent.
//
// Two Supabase clients are used deliberately:
//   - `asHuman`, using the anon key + the caller's own auth token, so every
//     read (battle, turns, player names) goes through normal RLS as that
//     player — it can only ever see battles it's actually part of.
//   - `asService`, using the service-role key, ONLY to read the
//     personality's system_prompt from eztren.ai_personalities. That table
//     has no anon/authenticated grant at all (see 031_ai_opponents.sql) —
//     the prompt tells the model to never break character or reveal it's
//     an AI, and that's meaningless if any signed-in player could read it
//     straight out of the table via the client SDK.
// The actual insert goes through insert_ai_turn(), a security-definer RPC
// called via `asHuman` — it does its own authorization check (caller must
// be a participant, opponent must actually be AI) before writing as the
// AI's player_id, which RLS alone would never allow a human's client to do.
//
// Text generation for the AI player itself goes through the Groq ->
// OpenRouter fallback chain (lib/ai-players.ts), not Gemini —
// Gemini is reserved for judging. See lib/ai-players.ts for how the
// mid-battle fallback works.

export async function POST(req: NextRequest) {
  const { battleId } = await req.json();
  if (!battleId) {
    return NextResponse.json({ error: "battleId required" }, { status: 400 });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const asHuman = createClient(url, anonKey, {
    db: { schema: "eztren" },
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await asHuman.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: battle } = await asHuman
    .from("battles")
    .select("*")
    .eq("id", battleId)
    .maybeSingle();
  if (!battle) {
    return NextResponse.json({ error: "Battle not found" }, { status: 404 });
  }
  if (battle.status !== "waiting" && battle.status !== "live") {
    return NextResponse.json({ status: "not_open" });
  }

  const { data: humanPlayer } = await asHuman
    .from("players")
    .select("id, name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!humanPlayer) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const aiPlayerId =
    battle.player_a_id === humanPlayer.id ? battle.player_b_id : battle.player_a_id;

  const { data: aiPlayer } = await asHuman
    .from("players")
    .select("id, name, is_ai, ai_personality_id")
    .eq("id", aiPlayerId)
    .maybeSingle();
  if (!aiPlayer || !aiPlayer.is_ai) {
    return NextResponse.json({ error: "Opponent is not an AI personality" }, { status: 400 });
  }

  const { data: turns } = await asHuman
    .from("battle_turns")
    .select("*")
    .eq("battle_id", battleId)
    .order("created_at", { ascending: true });

  // Idempotency guard: if the AI already replied to the latest human turn
  // (e.g. this route got called twice — a fast retry, a duplicate effect
  // firing in the browser), don't generate a second reply.
  const lastTurn = turns && turns.length > 0 ? turns[turns.length - 1] : null;
  if (lastTurn && lastTurn.player_id === aiPlayer.id) {
    return NextResponse.json({ status: "already_replied" });
  }
  if (!lastTurn || lastTurn.player_id !== humanPlayer.id) {
    // Nothing for the AI to respond to yet — it never opens first.
    return NextResponse.json({ status: "nothing_to_reply_to" });
  }

  const asService = createClient(url, serviceKey, { db: { schema: "eztren" } });
  const { data: personality } = await asService
    .from("ai_personalities")
    .select("system_prompt")
    .eq("id", aiPlayer.ai_personality_id)
    .maybeSingle();
  if (!personality) {
    return NextResponse.json({ error: "Personality not found" }, { status: 500 });
  }

  const transcript = (turns ?? [])
    .map((t) => `${t.player_id === humanPlayer.id ? humanPlayer.name : aiPlayer.name}: ${t.content}`)
    .join("\n");

  const prompt = `${personality.system_prompt}

[DEBATE TOPIC]
${battle.topic ?? "Open Debate"}

[TRANSCRIPT SO FAR]
${transcript}

[LENGTH OVERRIDE]
This overrides any length guidance above: reply in at most 2 short lines, roughly 25 words total. Write like a quick text message during a live back-and-forth, not a written argument or a summary. Make one sharp point, not several.

Respond now with your next turn only, as ${aiPlayer.name}. Do not include your name or any label before it — just the message itself.`;

  let replyText: string;
  try {
    const { text } = await callPlayerBot(prompt, 70);
    replyText = text;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI player-bot request failed" },
      { status: 502 }
    );
  }

  // Strip a leading "Name:" label if the model added one anyway, and any
  // stray quote-wrapping — belt and suspenders on top of the instruction.
  replyText = replyText
    .replace(new RegExp(`^\\s*${aiPlayer.name}\\s*:\\s*`, "i"), "")
    .replace(/^"([\s\S]*)"$/, "$1")
    .trim();

  if (!replyText) {
    return NextResponse.json({ error: "Empty reply generated" }, { status: 502 });
  }

  const { data: inserted, error: insertError } = await asHuman.rpc("insert_ai_turn", {
    p_battle_id: battleId,
    p_content: replyText,
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", turn: inserted });
}
