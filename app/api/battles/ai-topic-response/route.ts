import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callPlayerBot } from "@/lib/ai-players";

// Called right after a human proposes a topic against an AI opponent (see
// TopicNegotiation.tsx) — asks the AI player, using the personality's own
// system prompt, to actually decide whether to agree or reject. Not an
// auto-accept: a personality that's picky about its subject matter can and
// does reject a topic that doesn't fit, same as a human might.
//
// This is an in-character player decision, not a neutral judging call, so
// it goes through the same Groq -> Cerebras -> OpenRouter chain as
// ai-turn/route.ts (lib/ai-players.ts) rather than Gemini.
//
// Same two-client pattern as /api/battles/ai-turn: `asHuman` (anon key +
// caller's own token) for every RLS-scoped read/write, `asService`
// (service-role key) only to read the personality's system_prompt, which
// has no anon/authenticated grant at all.

export async function POST(req: NextRequest) {
  const { battleId, proposalId } = await req.json();
  if (!battleId || !proposalId) {
    return NextResponse.json({ error: "battleId and proposalId required" }, { status: 400 });
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
  if (!battle || battle.status !== "waiting") {
    return NextResponse.json({ status: "not_open" });
  }

  const { data: proposal } = await asHuman
    .from("topic_proposals")
    .select("*")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal || proposal.battle_id !== battleId || proposal.status !== "pending") {
    return NextResponse.json({ status: "not_pending" });
  }

  const { data: humanPlayer } = await asHuman
    .from("players")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!humanPlayer || proposal.proposed_by !== humanPlayer.id) {
    return NextResponse.json({ error: "Not this player's proposal" }, { status: 403 });
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

  const asService = createClient(url, serviceKey, { db: { schema: "eztren" } });
  const { data: personality } = await asService
    .from("ai_personalities")
    .select("system_prompt")
    .eq("id", aiPlayer.ai_personality_id)
    .maybeSingle();
  if (!personality) {
    return NextResponse.json({ error: "Personality not found" }, { status: 500 });
  }

  const prompt = `${personality.system_prompt}

[TOPIC PROPOSAL]
A human opponent has just proposed the following debate topic for this battle: "${proposal.topic}"

Decide, in character as ${aiPlayer.name}, whether you're willing to debate this topic. Most reasonable topics are fine to accept — only reject if it's genuinely a bad fit for how you argue, too vague to take a side on, or something you'd realistically pass on. Reply with exactly one word and nothing else: AGREE or REJECT.`;

  let decisionText: string;
  try {
    const { text } = await callPlayerBot(prompt, 5);
    decisionText = text;
  } catch {
    // If every player-bot provider is unreachable/exhausted, default to
    // accepting rather than stalling the human's negotiation window — the
    // 60s timeout fallback exists, but there's no reason to force it when
    // we can just say yes.
    decisionText = "AGREE";
  }

  const accept = !decisionText.toUpperCase().includes("REJECT");

  const { error: rpcError } = await asHuman.rpc("insert_ai_topic_response", {
    p_battle_id: battleId,
    p_proposal_id: proposalId,
    p_accept: accept,
  });
  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", accept });
}
