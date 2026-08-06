import { supabase, isSupabaseConfigured } from "./supabase";
import { Player, Match, Tournament, RankHistoryEntry } from "./types";
import {
  players as mockPlayers,
  matches as mockMatches,
  tournaments as mockTournaments,
} from "./data";

// Every function below tries Supabase first. If the project isn't
// configured yet, or a query fails for any reason, it quietly falls back
// to the seed data so the site never breaks mid-setup.

export async function getPlayers(): Promise<Player[]> {
  if (!isSupabaseConfigured || !supabase) return mockPlayers;
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .order("wins", { ascending: false });
  if (error || !data) return mockPlayers;
  return data.map(
    (p): Player => ({
      id: p.id,
      name: p.name,
      rank: p.rank,
      league: p.league,
      judgedMatches: p.judged_matches,
      wins: p.wins,
      losses: p.losses,
      joinedAt: p.joined_at,
      rankSince: p.rank_since,
      country: p.country,
      bio: p.bio ?? undefined,
      isAi: p.is_ai ?? false,
    })
  );
}

// Cheap head-count query (no row data pulled) — used to decide whether
// the flagship tournaments have hit their player-count threshold yet.
// See lib/config.ts for the threshold and the isFlagshipLive() check.
export async function getPlayerCount(): Promise<number> {
  if (!isSupabaseConfigured || !supabase) return mockPlayers.length;
  const { count, error } = await supabase
    .from("players")
    .select("*", { count: "exact", head: true });
  if (error || count == null) return mockPlayers.length;
  return count;
}

// Active-player count (battled at least once in the last 10 days) — this,
// not raw signups, is what actually gates the flagship-league unlock.
// See supabase/030_active_player_count.sql for the definition of "active."
// This is an internal rule only: it's never shown as a badge, label, or
// profile field anywhere on the site.
export async function getActivePlayerCount(): Promise<number> {
  if (!isSupabaseConfigured || !supabase) return mockPlayers.length;
  const { data, error } = await supabase.rpc("get_active_player_count", { days: 10 });
  if (error || data == null) return 0;
  return data as number;
}

export async function getMatches(): Promise<Match[]> {
  if (!isSupabaseConfigured || !supabase) return mockMatches;
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("is_private", false)
    .order("match_date", { ascending: false });
  if (error || !data) return mockMatches;
  return data.map(
    (m): Match => ({
      id: m.id,
      topic: m.topic,
      playerAId: m.player_a_id,
      playerBId: m.player_b_id,
      judgeId: m.judge_id,
      refereeId: m.referee_id,
      tournament: m.tournament_id,
      league: m.league,
      winnerId: m.winner_id,
      date: m.match_date,
      tags: m.tags ?? [],
      aiSummary: m.ai_summary ?? "",
      videoUrl: m.video_url ?? undefined,
      transcriptUrl: m.transcript_url ?? undefined,
      transcript: m.transcript ?? undefined,
      battleId: m.battle_id ?? undefined,
      judgeStatus: m.judge_status ?? "judged",
      judgeError: m.judge_error ?? undefined,
      judgeReasoning: m.judge_reasoning ?? undefined,
      isPrivate: m.is_private ?? false,
    })
  );
}

export async function getMatchById(id: string): Promise<Match | null> {
  if (!isSupabaseConfigured || !supabase) {
    return mockMatches.find((m) => m.id === id) ?? null;
  }
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    topic: data.topic,
    playerAId: data.player_a_id,
    playerBId: data.player_b_id,
    judgeId: data.judge_id,
    refereeId: data.referee_id,
    tournament: data.tournament_id,
    league: data.league,
    winnerId: data.winner_id,
    date: data.match_date,
    tags: data.tags ?? [],
    aiSummary: data.ai_summary ?? "",
    videoUrl: data.video_url ?? undefined,
    transcriptUrl: data.transcript_url ?? undefined,
    transcript: data.transcript ?? undefined,
    battleId: data.battle_id ?? undefined,
    judgeStatus: data.judge_status ?? "judged",
    judgeError: data.judge_error ?? undefined,
    judgeReasoning: data.judge_reasoning ?? undefined,
    isPrivate: data.is_private ?? false,
    recordingUrl: data.recording_url ?? null,
    recordingUrlA: data.recording_url_a ?? null,
    recordingUrlB: data.recording_url_b ?? null,
  };
}

export async function getMatchByBattleId(battleId: string): Promise<Match | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("battle_id", battleId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    topic: data.topic,
    playerAId: data.player_a_id,
    playerBId: data.player_b_id,
    judgeId: data.judge_id,
    refereeId: data.referee_id,
    tournament: data.tournament_id,
    league: data.league,
    winnerId: data.winner_id,
    date: data.match_date,
    tags: data.tags ?? [],
    aiSummary: data.ai_summary ?? "",
    videoUrl: data.video_url ?? undefined,
    transcriptUrl: data.transcript_url ?? undefined,
    transcript: data.transcript ?? undefined,
    battleId: data.battle_id ?? undefined,
    judgeStatus: data.judge_status ?? "judged",
    judgeError: data.judge_error ?? undefined,
    judgeReasoning: data.judge_reasoning ?? undefined,
    isPrivate: data.is_private ?? false,
    recordingUrl: data.recording_url ?? null,
    recordingUrlA: data.recording_url_a ?? null,
    recordingUrlB: data.recording_url_b ?? null,
  };
}

function mapTournament(t: any): Tournament {
  return {
    id: t.id,
    slug: t.slug ?? t.id,
    name: t.name,
    type: t.type,
    league: t.league,
    status: t.status,
    dates: t.dates ?? "",
    description: t.description ?? "",
    coreTopic: t.core_topic ?? null,
    topics: t.topics ?? [],
  };
}

export async function getTournaments(): Promise<Tournament[]> {
  if (!isSupabaseConfigured || !supabase) return mockTournaments;
  const { data, error } = await supabase.from("tournaments").select("*");
  if (error || !data) return mockTournaments;
  return data.map(mapTournament);
}

// Accepts either the tournament's id or its slug, so /tournaments/[id]
// works with whichever the caller landed on (cards link by id today).
export async function getTournamentById(idOrSlug: string): Promise<Tournament | null> {
  if (!isSupabaseConfigured || !supabase) {
    return mockTournaments.find((t) => t.id === idOrSlug || t.slug === idOrSlug) ?? null;
  }
  // Try slug first (always valid text), then fall back to id — combining
  // both in one .or() would throw if idOrSlug isn't a valid uuid literal.
  const bySlug = await supabase.from("tournaments").select("*").eq("slug", idOrSlug).maybeSingle();
  if (bySlug.data) return mapTournament(bySlug.data);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  if (!isUuid) return null;
  const byId = await supabase.from("tournaments").select("*").eq("id", idOrSlug).maybeSingle();
  if (byId.error || !byId.data) return null;
  return mapTournament(byId.data);
}

export async function getMatchesByTournament(tournamentId: string): Promise<Match[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockMatches.filter((m) => m.tournament === tournamentId);
  }
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .eq("is_private", false)
    .order("match_date", { ascending: false });
  if (error || !data) return [];
  return data.map(
    (m): Match => ({
      id: m.id,
      topic: m.topic,
      playerAId: m.player_a_id,
      playerBId: m.player_b_id,
      judgeId: m.judge_id,
      refereeId: m.referee_id,
      tournament: m.tournament_id,
      league: m.league,
      winnerId: m.winner_id,
      date: m.match_date,
      tags: m.tags ?? [],
      aiSummary: m.ai_summary ?? "",
      videoUrl: m.video_url ?? undefined,
      transcriptUrl: m.transcript_url ?? undefined,
      transcript: m.transcript ?? undefined,
      battleId: m.battle_id ?? undefined,
      judgeStatus: m.judge_status ?? "judged",
      judgeError: m.judge_error ?? undefined,
      judgeReasoning: m.judge_reasoning ?? undefined,
      isPrivate: m.is_private ?? false,
    })
  );
}

export async function getMatchesForPlayer(playerId: string): Promise<Match[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockMatches.filter(
      (m) =>
        m.playerAId === playerId ||
        m.playerBId === playerId ||
        m.judgeId === playerId ||
        m.refereeId === playerId
    );
  }
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .or(
      `player_a_id.eq.${playerId},player_b_id.eq.${playerId},judge_id.eq.${playerId},referee_id.eq.${playerId}`
    )
    .order("match_date", { ascending: false });
  if (error || !data) return [];
  return data.map(
    (m): Match => ({
      id: m.id,
      topic: m.topic,
      playerAId: m.player_a_id,
      playerBId: m.player_b_id,
      judgeId: m.judge_id,
      refereeId: m.referee_id,
      tournament: m.tournament_id,
      league: m.league,
      winnerId: m.winner_id,
      date: m.match_date,
      tags: m.tags ?? [],
      aiSummary: m.ai_summary ?? "",
      videoUrl: m.video_url ?? undefined,
      transcriptUrl: m.transcript_url ?? undefined,
      isPrivate: m.is_private ?? false,
    })
  );
}

export async function getPlayerById(id: string): Promise<Player | null> {
  if (!isSupabaseConfigured || !supabase) {
    return mockPlayers.find((p) => p.id === id) ?? null;
  }
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    rank: data.rank,
    league: data.league,
    judgedMatches: data.judged_matches,
    wins: data.wins,
    losses: data.losses,
    joinedAt: data.joined_at,
    rankSince: data.rank_since,
    country: data.country,
    bio: data.bio ?? undefined,
    isAi: data.is_ai ?? false,
  };
}

export async function getRankHistoryForPlayer(
  playerId: string
): Promise<RankHistoryEntry[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("rank_history")
    .select("*")
    .eq("player_id", playerId)
    .order("started_at", { ascending: false });
  if (error || !data) return [];
  return data.map(
    (r): RankHistoryEntry => ({
      id: r.id,
      playerId: r.player_id,
      rank: r.rank,
      league: r.league,
      startedAt: r.started_at,
      endedAt: r.ended_at,
    })
  );
}

export async function searchByRank(rank: string): Promise<RankHistoryEntry[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("rank_history")
    .select("*, players(name)")
    .eq("rank", rank.toUpperCase())
    .order("started_at", { ascending: false });
  if (error || !data) return [];
  return data.map(
    (r): RankHistoryEntry => ({
      id: r.id,
      playerId: r.player_id,
      playerName: r.players?.name ?? "Unknown",
      rank: r.rank,
      league: r.league,
      startedAt: r.started_at,
      endedAt: r.ended_at,
    })
  );
}

export async function getPlayerLookup(): Promise<Map<string, Player>> {
  const all = await getPlayers();
  return new Map(all.map((p) => [p.id, p]));
}

export async function sendMagicLink(
  email: string,
  referralCode?: string | null
): Promise<{ ok: boolean; message: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      ok: false,
      message:
        "Sign-ups aren't connected to a live database yet — this will start sending real links once Supabase is wired up.",
    };
  }
  // Carry ?ref= through the magic-link round trip — otherwise it's lost
  // the moment the person leaves /join for their inbox. sessionStorage in
  // JoinPage is the other half of this belt-and-suspenders approach, for
  // the case where an email client rewrites the redirect URL.
  const redirectBase =
    typeof window !== "undefined" ? window.location.origin + "/join" : undefined;
  const emailRedirectTo =
    redirectBase && referralCode
      ? `${redirectBase}?ref=${encodeURIComponent(referralCode)}`
      : redirectBase;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Check your email for a sign-in link." };
}

export async function getMyPlayer(): Promise<Player | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    rank: data.rank,
    league: data.league,
    judgedMatches: data.judged_matches,
    wins: data.wins,
    losses: data.losses,
    joinedAt: data.joined_at,
    rankSince: data.rank_since,
    country: data.country,
    bio: data.bio ?? undefined,
    isAi: data.is_ai ?? false,
  };
}

export async function registerPlayer(input: {
  name: string;
  country: string;
  role: "player" | "judge";
  age?: number | null;
  gender?: string;
  referralCode?: string | null;
}): Promise<{ ok: boolean; message: string; rank?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, message: "Not connected to a live database yet." };
  }
  const { data, error } = await supabase.rpc("register_player", {
    p_name: input.name,
    p_country: input.country,
    p_role: input.role,
    p_age: input.age ?? null,
    p_gender: input.gender ?? null,
    p_referral_code: input.referralCode ?? null,
  });
  if (error || !data) {
    return {
      ok: false,
      message: error?.message ?? "Something went wrong. Try again in a moment.",
    };
  }
  return { ok: true, message: `Registered. You're ranked ${data.rank}.`, rank: data.rank };
}

// Direct challenge (search-and-challenge in the Battle lobby) is locked
// behind referring an active friend — see 035_referral_system.sql.
export async function getMyReferralCode(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.rpc("get_my_referral_code");
  if (error || !data) return null;
  return data as string;
}

export async function isDirectChallengeUnlocked(playerId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  const { data, error } = await supabase.rpc("is_direct_challenge_unlocked", {
    p_player_id: playerId,
  });
  if (error || data == null) return false;
  return data as boolean;
}
