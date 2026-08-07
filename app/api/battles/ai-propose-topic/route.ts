import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callPlayerBot } from "@/lib/ai-players";
import { DEBATE_TOPICS } from "@/lib/topics";

// Called from TopicNegotiation.tsx a few seconds after the negotiation
// screen mounts against an AI opponent — asks the AI player, in character,
// to suggest a topic of its own instead of only ever waiting on the human
// to propose first (see insert_ai_topic_proposal in
// 036_fix_complete_battle_and_ai_topic_proposal.sql). Mirrors
// ai-topic-response's two-client pattern: `asHuman` (anon key + caller's
// token) for every RLS-scoped read/write, `asService` (service-role key)
// only to read the personality's system_prompt.

function pickFallbackTopic(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function POST(req: NextRequest) {
  const { battleId, topicPool } = await req.json();
  if (!battleId) {
    return NextResponse.json({ error: "battleId required" }, { status: 400 });
  }
  const pool: string[] = Array.isArray(topicPool) && topicPool.length > 0 ? topicPool : DEBATE_TOPICS;

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
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
  if (!battle || battle.status !== "waiting" || battle.topic) {
    return NextResponse.json({ status: "not_open" });
  }

  const { data: humanPlayer } = await asHuman
    .from("players")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!humanPlayer) {
    return NextResponse.json({ error: "Not a registered player" }, { status: 400 });
  }
  if (battle.player_a_id !== humanPlayer.id && battle.player_b_id !== humanPlayer.id) {
    return NextResponse.json({ error: "Not this player's battle" }, { status: 403 });
  }

  const aiPlayerId = battle.player_a_id === humanPlayer.id ? battle.player_b_id : battle.player_a_id;
  const { data: aiPlayer } = await asHuman
    .from("players")
    .select("id, name, is_ai, ai_personality_id")
    .eq("id", aiPlayerId)
    .maybeSingle();
  if (!aiPlayer || !aiPlayer.is_ai) {
    return NextResponse.json({ error: "Opponent is not an AI personality" }, { status: 400 });
  }

  // Don't propose again if this AI already has a live offer on the table.
  const { data: existing } = await asHuman
    .from("topic_proposals")
    .select("id")
    .eq("battle_id", battleId)
    .eq("proposed_by", aiPlayerId)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ status: "already_pending" });
  }

  let systemPrompt = `You are ${aiPlayer.name}, an AI debate personality on Eztren. Stay in character and make practical debate decisions.`;
  if (serviceKey && aiPlayer.ai_personality_id) {
    const asService = createClient(url, serviceKey, { db: { schema: "eztren" } });
    const { data: personality } = await asService
      .from("ai_personalities")
      .select("system_prompt")
      .eq("id", aiPlayer.ai_personality_id)
      .maybeSingle();
    if (personality?.system_prompt) systemPrompt = personality.system_prompt;
  }

  const samplePool = pool.slice(0, 40);
  const prompt = `${systemPrompt}

[TOPIC PROPOSAL]
You're about to debate a human opponent on Eztren, and topic negotiation just opened. Suggest ONE debate topic you'd genuinely want to argue, written as a single yes/no debate motion (in the style of: "${pickFallbackTopic(samplePool)}").

Reply with exactly the topic text and nothing else — no quotes, no preamble, no explanation.`;

  let topic: string | null = null;
  try {
    const { text } = await callPlayerBot(prompt, 60);
    const cleaned = text.trim().replace(/^["']|["']$/g, "");
    if (cleaned.length >= 8 && cleaned.length <= 200) topic = cleaned;
  } catch {
    // fall through to the random pick below
  }
  if (!topic) topic = pickFallbackTopic(pool);

  const { error: rpcError } = await asHuman.rpc("insert_ai_topic_proposal", {
    p_battle_id: battleId,
    p_topic: topic,
  });
  if (rpcError) {
    // Most likely a topic already got set / battle moved on between our
    // checks and the insert — treat as harmless rather than a hard error.
    return NextResponse.json({ status: "skipped", detail: rpcError.message });
  }

  return NextResponse.json({ status: "ok", topic });
}
