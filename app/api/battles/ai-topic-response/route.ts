import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callPlayerBot } from "@/lib/ai-players";

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function forcedRejectCount(seed: number): number {
  const mode = seed % 5;
  if (mode === 0) return Number.POSITIVE_INFINITY;
  if (mode === 1) return 2;
  if (mode === 2) return 1;
  return 0;
}

// Called right after a human proposes a topic against an AI opponent (see
// TopicNegotiation.tsx) — asks the AI player, using the personality's own
// system prompt, to actually decide whether to agree or reject. Not an
// auto-accept: a personality that's picky about its subject matter can and
// does reject a topic that doesn't fit, same as a human might.
//
// This is an in-character player decision, not a neutral judging call, so
// it goes through the same Groq -> OpenRouter chain as
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

  const { data: humanProposals } = await asHuman
    .from("topic_proposals")
    .select("id")
    .eq("battle_id", battleId)
    .eq("proposed_by", humanPlayer.id);
  const humanProposalCount = humanProposals?.length ?? 1;
  const rejectCount = forcedRejectCount(hashString(`${battleId}:${aiPlayer.id}`));

  const prompt = `${systemPrompt}

[TOPIC PROPOSAL]
A human opponent has just proposed the following debate topic for this battle: "${proposal.topic}"

[NEGOTIATION STYLE]
Do not agree to every topic. During this one-minute topic selection, act like a real opponent with preferences. Some AI personalities should agree quickly, some should reject one or two topics before agreeing, and some should keep rejecting topics until the timer assigns one.

For this specific battle, your private stance is: ${rejectCount === Number.POSITIVE_INFINITY ? "be very hard to satisfy and reject the proposed topic" : rejectCount > 0 && humanProposalCount <= rejectCount ? "reject this proposal and wait for a better one" : "decide normally, accepting only if this topic genuinely interests you"}.

Reply with exactly one word and nothing else: AGREE or REJECT.`;

  let decisionText: string;
  try {
    const { text } = await callPlayerBot(prompt, 5);
    decisionText = text;
  } catch {
    // If every player-bot provider is unreachable/exhausted, use the same
    // per-battle negotiation stance so AI opponents still sometimes reject
    // instead of always agreeing. The 60s timeout can assign a topic if the
    // AI keeps saying no.
    decisionText = humanProposalCount <= rejectCount ? "REJECT" : "AGREE";
  }

  const modelAccept = !decisionText.toUpperCase().includes("REJECT");
  const accept = humanProposalCount <= rejectCount ? false : modelAccept;

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
