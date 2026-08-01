import { supabase, isSupabaseConfigured } from "./supabase";
import { Battle, BattleChallenge, BattleFormat, BattleTurn, TopicProposal } from "./types";

// This module assumes the caller is signed in (has a Player row via
// getMyPlayer()). Every function needs the caller's player id passed in —
// callers already have it from getMyPlayer() so we don't refetch here.

function mapBattle(b: any): Battle {
  return {
    id: b.id,
    format: b.format,
    playerAId: b.player_a_id,
    playerBId: b.player_b_id,
    status: b.status,
    topic: b.topic,
    durationSeconds: b.duration_seconds,
    startedAt: b.started_at,
    endedAt: b.ended_at,
    dailyRoomName: b.daily_room_name,
    dailyRoomUrl: b.daily_room_url,
    endRequestedBy: b.end_requested_by,
    recordingUrl: b.recording_url,
    transcript: b.transcript,
    createdAt: b.created_at,
    isPrivate: b.is_private ?? false,
    playerAReady: b.player_a_ready ?? false,
    playerBReady: b.player_b_ready ?? false,
  };
}

function mapChallenge(c: any): BattleChallenge {
  return {
    id: c.id,
    challengerId: c.challenger_id,
    opponentId: c.opponent_id,
    format: c.format,
    status: c.status,
    battleId: c.battle_id,
    createdAt: c.created_at,
    respondedAt: c.responded_at,
    isPrivate: c.is_private ?? false,
  };
}

function mapTurn(t: any): BattleTurn {
  return {
    id: t.id,
    battleId: t.battle_id,
    playerId: t.player_id,
    content: t.content,
    createdAt: t.created_at,
  };
}

function mapTopicProposal(p: any): TopicProposal {
  return {
    id: p.id,
    battleId: p.battle_id,
    proposedBy: p.proposed_by,
    topic: p.topic,
    status: p.status,
    createdAt: p.created_at,
    respondedAt: p.responded_at,
  };
}

// ── Queue ──

export async function joinQueue(
  playerId: string,
  format: BattleFormat,
  isPrivate: boolean = false
): Promise<{ ok: boolean; message?: string; since?: string }> {
  if (!isSupabaseConfigured || !supabase) return { ok: false, message: "Not connected." };
  const { data, error } = await supabase
    .from("battle_queue")
    .upsert(
      { player_id: playerId, format, is_private: isPrivate },
      { onConflict: "player_id,format" }
    )
    .select("joined_at")
    .single();
  if (error) return { ok: false, message: error.message };
  // joined_at is always set server-side by a trigger (see
  // 022_fix_queue_clock_skew.sql) — never the client's own clock — so it's
  // safe to hand straight back as the anchor for pollForMatch.
  return { ok: true, since: data?.joined_at };
}

export async function leaveQueue(
  playerId: string,
  format: BattleFormat
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  await supabase
    .from("battle_queue")
    .delete()
    .eq("player_id", playerId)
    .eq("format", format);
}

export async function isInQueue(
  playerId: string,
  format: BattleFormat
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  const { data } = await supabase
    .from("battle_queue")
    .select("id")
    .eq("player_id", playerId)
    .eq("format", format)
    .maybeSingle();
  return Boolean(data);
}

// Call this right after joinQueue() and while waiting on the "finding an
// opponent" screen. Polls rather than using realtime, since a freshly
// matched battle could land the caller in either player_a_id or
// player_b_id and a single postgres_changes filter can't express OR.
export function pollForMatch(
  playerId: string,
  format: BattleFormat,
  since: string,
  onMatched: (battle: Battle) => void
): () => void {
  let cancelled = false;
  const interval = setInterval(async () => {
    if (cancelled || !supabase) return;
    const { data } = await supabase
      .from("battles")
      .select("*")
      .eq("format", format)
      .gte("created_at", since)
      .or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && !cancelled) {
      cancelled = true;
      clearInterval(interval);
      onMatched(mapBattle(data));
    }
  }, 2000);
  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}

// ── Challenges ──

export async function sendChallenge(
  challengerId: string,
  opponentId: string,
  format: BattleFormat,
  isPrivate: boolean = false
): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured || !supabase) return { ok: false, message: "Not connected." };
  const { error } = await supabase
    .from("battle_challenges")
    .insert({ challenger_id: challengerId, opponent_id: opponentId, format, is_private: isPrivate });
  if (error) {
    // 23505 = unique_violation — the DB-level guard against sending the
    // same player a second pending challenge (see
    // 023_prevent_duplicate_challenges.sql) caught this one.
    if (error.code === "23505") {
      return { ok: false, message: "You've already sent this player a challenge." };
    }
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

export async function getMyChallenges(
  playerId: string
): Promise<{ incoming: BattleChallenge[]; outgoing: BattleChallenge[] }> {
  if (!isSupabaseConfigured || !supabase) return { incoming: [], outgoing: [] };
  const { data } = await supabase
    .from("battle_challenges")
    .select("*")
    .or(`challenger_id.eq.${playerId},opponent_id.eq.${playerId}`)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  const all = (data ?? []).map(mapChallenge);
  return {
    incoming: all.filter((c) => c.opponentId === playerId),
    outgoing: all.filter((c) => c.challengerId === playerId),
  };
}

export async function acceptChallenge(
  challengeId: string
): Promise<{ ok: boolean; battleId?: string; message?: string }> {
  if (!isSupabaseConfigured || !supabase) return { ok: false, message: "Not connected." };
  const { data, error } = await supabase.rpc("accept_challenge", {
    challenge_id: challengeId,
  });
  if (error || !data) return { ok: false, message: error?.message ?? "Could not accept." };
  return { ok: true, battleId: data as string };
}

export async function declineChallenge(challengeId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  await supabase
    .from("battle_challenges")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", challengeId);
}

export async function cancelChallenge(challengeId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  await supabase
    .from("battle_challenges")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("id", challengeId);
}

// Realtime: fires whenever a challenge you're the opponent on arrives.
export function subscribeToIncomingChallenges(
  playerId: string,
  onIncoming: (challenge: BattleChallenge) => void
): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`incoming-challenges-${playerId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "eztren",
        table: "battle_challenges",
        filter: `opponent_id=eq.${playerId}`,
      },
      (payload) => onIncoming(mapChallenge(payload.new))
    )
    .subscribe();
  return () => {
    supabase!.removeChannel(channel);
  };
}

// Realtime: fires when a challenge you sent gets accepted/declined.
export function subscribeToOutgoingChallengeUpdates(
  playerId: string,
  onUpdate: (challenge: BattleChallenge) => void
): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`outgoing-challenges-${playerId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "eztren",
        table: "battle_challenges",
        filter: `challenger_id=eq.${playerId}`,
      },
      (payload) => onUpdate(mapChallenge(payload.new))
    )
    .subscribe();
  return () => {
    supabase!.removeChannel(channel);
  };
}

// ── Battle ──

export async function getBattle(battleId: string): Promise<Battle | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase
    .from("battles")
    .select("*")
    .eq("id", battleId)
    .maybeSingle();
  if (error || !data) return null;
  return mapBattle(data);
}

// Confirms the caller is ready. The battle only goes live once BOTH
// players have called this — enforced atomically in mark_player_ready()
// so one player can't skip waiting on the other. Returns the resulting
// battle status ('waiting' if still waiting on the opponent, 'live' once
// both are ready).
export async function markPlayerReady(battleId: string): Promise<Battle["status"] | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.rpc("mark_player_ready", { battle_id: battleId });
  if (error) return null;
  return data as Battle["status"];
}

export async function endBattle(battleId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  await supabase.rpc("complete_battle", { battle_id: battleId });
}

// Manual "end early" goes through mutual consent — this is NOT the same as
// endBattle() above, which is only for the timer running out (already
// mutually agreed when the battle started).
export async function requestEndBattle(
  battleId: string
): Promise<"requested" | "already_requested" | "confirmed" | "not_live"> {
  if (!isSupabaseConfigured || !supabase) return "not_live";
  const { data } = await supabase.rpc("request_end_battle", { battle_id: battleId });
  return (data as any) ?? "not_live";
}

export async function cancelEndRequest(battleId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  await supabase.rpc("cancel_end_request", { battle_id: battleId });
}

export async function setBattleTopic(battleId: string, topic: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  await supabase.rpc("set_battle_topic", { battle_id: battleId, new_topic: topic });
}

// ── Topic negotiation (chat-style propose / accept / reject / counter) ──

export async function getTopicProposals(battleId: string): Promise<TopicProposal[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data } = await supabase
    .from("topic_proposals")
    .select("*")
    .eq("battle_id", battleId)
    .order("created_at", { ascending: true });
  return (data ?? []).map(mapTopicProposal);
}

export async function proposeTopic(
  battleId: string,
  topic: string
): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured || !supabase) return { ok: false, message: "Not connected." };
  const { error } = await supabase.rpc("propose_topic", { battle_id: battleId, topic });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function respondToTopicProposal(
  proposalId: string,
  accept: boolean
): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured || !supabase) return { ok: false, message: "Not connected." };
  const { error } = await supabase.rpc("respond_to_topic_proposal", {
    proposal_id: proposalId,
    accept,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// Timeout fallback — safe to call from both players' clients at once, the
// server only applies the first one to land (see 021_topic_negotiation.sql).
export async function assignRandomTopic(battleId: string, topic: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  await supabase.rpc("assign_random_topic", { battle_id: battleId, topic });
}

// Realtime: fires on any new proposal or status change (accept/reject/
// supersede) for this battle — callers should re-run getTopicProposals()
// rather than patch a single row, same pattern as the challenge feed.
export function subscribeToTopicProposals(
  battleId: string,
  onChange: () => void
): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`topic-proposals-${battleId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "eztren",
        table: "topic_proposals",
        filter: `battle_id=eq.${battleId}`,
      },
      () => onChange()
    )
    .subscribe();
  return () => {
    supabase!.removeChannel(channel);
  };
}

// ── Spectating ──
// Public reads, backed by the "public read live battles" / "public read
// live turns" policies in 018_spectator_mode.sql. No signed-in player
// required — this is what powers /watch and /watch/[id].

// Sweeps and closes out any battle stuck at status='live' past its timer
// (see 020_reap_stale_battles.sql for why this is needed at all — briefly,
// nobody's browser may be open to fire the normal client-side endBattle()
// call). Fire-and-forget: if it fails, the stale battle just shows up one
// more time and gets caught on the next sweep.
export async function reapStaleBattles(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase.rpc("reap_stale_battles");
  } catch {
    // best-effort — never block the page on this
  }
}

export async function getLiveBattles(): Promise<Battle[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  await reapStaleBattles();
  const { data, error } = await supabase
    .from("battles")
    .select("*")
    .eq("status", "live")
    .order("started_at", { ascending: false });
  if (error || !data) return [];
  return data.map(mapBattle);
}

// Fires on any battle flipping to/from live, or being updated while live —
// callers should re-run getLiveBattles() on each event rather than trying
// to patch a single row, since a battle going from live -> completed means
// it should drop off the list entirely.
export function subscribeToLiveBattles(onChange: () => void): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel("live-battles")
    .on(
      "postgres_changes",
      { event: "*", schema: "eztren", table: "battles" },
      () => onChange()
    )
    .subscribe();
  return () => {
    supabase!.removeChannel(channel);
  };
}

export function subscribeToBattle(
  battleId: string,
  onChange: (battle: Battle) => void
): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`battle-${battleId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "eztren",
        table: "battles",
        filter: `id=eq.${battleId}`,
      },
      (payload) => onChange(mapBattle(payload.new))
    )
    .subscribe();
  return () => {
    supabase!.removeChannel(channel);
  };
}

// ── Text battle turns ──

export async function getTurns(battleId: string): Promise<BattleTurn[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data } = await supabase
    .from("battle_turns")
    .select("*")
    .eq("battle_id", battleId)
    .order("created_at", { ascending: true });
  return (data ?? []).map(mapTurn);
}

export async function sendTurn(
  battleId: string,
  playerId: string,
  content: string
): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured || !supabase) return { ok: false, message: "Not connected." };
  const { error } = await supabase
    .from("battle_turns")
    .insert({ battle_id: battleId, player_id: playerId, content });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// Lightweight typing indicator — broadcast only, no table, nothing
// persisted. Each side pings the channel while typing; the receiver treats
// silence for a few seconds as "stopped typing" rather than needing an
// explicit stop event.
export function createTypingChannel(
  battleId: string,
  onTyping: (playerId: string) => void
): { notifyTyping: (playerId: string) => void; unsubscribe: () => void } {
  if (!supabase) return { notifyTyping: () => {}, unsubscribe: () => {} };
  const channel = supabase
    .channel(`typing-${battleId}`, { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload?.playerId) onTyping(payload.playerId);
    })
    .subscribe();
  return {
    notifyTyping: (playerId: string) => {
      channel.send({ type: "broadcast", event: "typing", payload: { playerId } });
    },
    unsubscribe: () => {
      supabase!.removeChannel(channel);
    },
  };
}

export function subscribeToTurns(
  battleId: string,
  onTurn: (turn: BattleTurn) => void
): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`turns-${battleId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "eztren",
        table: "battle_turns",
        filter: `battle_id=eq.${battleId}`,
      },
      (payload) => onTurn(mapTurn(payload.new))
    )
    .subscribe();
  return () => {
    supabase!.removeChannel(channel);
  };
}
