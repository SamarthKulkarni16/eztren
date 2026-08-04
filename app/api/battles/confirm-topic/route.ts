import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callJudgeModel } from "@/lib/ai-judge";

// Runs after two players mutually agree on a topic in a tournament-scoped
// battle. If the battle's tournament has a core_topic (i.e. it's an
// emergency league built around one real-world subject), this checks the
// agreed topic is actually related before locking it in. If it isn't, the
// proposal is rejected server-side and a topic is auto-assigned from the
// tournament's own topic bank instead — same idempotent fallback path the
// 60-second negotiation timeout already uses (assign_random_topic()).
//
// Non-tournament battles, and tournament battles whose tournament has no
// core_topic (flagship/promotion), skip the AI call entirely and accept
// immediately — no reason to spend a model call gating an open debate.
//
// This is a neutral moderation call, same category as /api/judge, so it
// goes through the Gemini -> OpenRouter judge chain (lib/ai-judge.ts)
// rather than the player-bot chain.

type RelevanceVerdict = { related: boolean; reason: string };

function buildRelevancePrompt(proposedTopic: string, coreTopic: string): string {
  return `You are a strict but fair moderator for a debate sport's "Emergency League" — a temporary tournament created to hold high-quality debate on one specific real-world subject while it's still unfolding.

The subject this league exists for: "${coreTopic}"

Two players have mutually agreed to debate this motion: "${proposedTopic}"

Decide: is this motion genuinely, substantively about "${coreTopic}" — not just loosely adjacent, but a real debate ON that subject or a direct, specific facet of it? A motion about a completely different subject (even if it shares a vague theme like "technology" or "government") should be rejected. Be reasonably generous with genuinely related angles or facets of the subject, but reject anything that's really a different topic wearing similar words.

Respond with ONLY a JSON object, no other text:
{
  "related": true | false,
  "reason": "one short sentence, plain words, explaining the call"
}`;
}

export async function POST(req: NextRequest) {
  const { proposalId, battleId } = await req.json();
  if (!proposalId || !battleId) {
    return NextResponse.json({ error: "proposalId and battleId required" }, { status: 400 });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!url || !anonKey) {
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

  const { data: proposal } = await supabase
    .from("topic_proposals")
    .select("*")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }
  if (proposal.status !== "pending") {
    // Already handled (e.g. the 60s timeout beat this response to it) —
    // no-op, matching respond_to_topic_proposal's own idempotent behavior.
    return NextResponse.json({ status: "already_handled" });
  }

  const { data: battle } = await supabase
    .from("battles")
    .select("id, tournament_id")
    .eq("id", battleId)
    .maybeSingle();
  if (!battle) {
    return NextResponse.json({ error: "Battle not found" }, { status: 404 });
  }

  let coreTopic: string | null = null;
  let tournamentTopics: string[] = [];
  if (battle.tournament_id) {
    const { data: tournament } = await supabase
      .from("tournaments")
      .select("core_topic, topics")
      .eq("id", battle.tournament_id)
      .maybeSingle();
    coreTopic = tournament?.core_topic ?? null;
    tournamentTopics = tournament?.topics ?? [];
  }

  // No tournament, or a tournament with no single core subject (flagship /
  // promotion) — accept straight away, same as the pre-existing behavior.
  if (!coreTopic || (!geminiKey && !openrouterKey)) {
    const { error } = await supabase.rpc("respond_to_topic_proposal", {
      proposal_id: proposalId,
      accept: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ accepted: true });
  }

  try {
    const { result: verdict } = await callJudgeModel<RelevanceVerdict>(
      buildRelevancePrompt(proposal.topic, coreTopic),
      { geminiKey, openrouterKey }
    );

    if (verdict.related) {
      const { error } = await supabase.rpc("respond_to_topic_proposal", {
        proposal_id: proposalId,
        accept: true,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ accepted: true, related: true, reason: verdict.reason });
    }

    // Formally reject the proposal, then fall back to a topic from this
    // tournament's own bank — same idempotent function the 60s countdown
    // timeout uses, so it's safe even if the other player's client also
    // races to assign one.
    await supabase.rpc("respond_to_topic_proposal", { proposal_id: proposalId, accept: false });
    const fallback =
      tournamentTopics.length > 0
        ? tournamentTopics[Math.floor(Math.random() * tournamentTopics.length)]
        : `This house would take a stance on ${coreTopic}.`;
    await supabase.rpc("assign_random_topic", { battle_id: battleId, topic: fallback });

    return NextResponse.json({
      accepted: false,
      related: false,
      reason: verdict.reason,
      assignedTopic: fallback,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Relevance check failed" }, { status: 500 });
  }
}
