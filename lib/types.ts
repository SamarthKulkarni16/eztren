export type League =
  | "Alphabet League"
  | "Two Alphabet League"
  | "One Alphabet League";

export interface Player {
  id: string;
  name: string;
  rank: string; // e.g. "A", "B", "AC"
  league: League;
  judgedMatches: number;
  wins: number;
  losses: number;
  joinedAt: string;
  rankSince: string;
  country: string;
  bio?: string;
  // True for one of Eztren's rotating AI personalities rather than a
  // registered human. AI players sit outside the human rank ladder (see
  // supabase/031_ai_opponents.sql) — always check this before treating
  // rank/league/wins as meaningful for a given Player.
  isAi?: boolean;
}

export interface RankHistoryEntry {
  id: string;
  playerId: string;
  playerName?: string;
  rank: string;
  league: League;
  startedAt: string;
  endedAt: string | null;
}

export interface Match {
  id: string;
  topic: string;
  playerAId: string;
  playerBId: string;
  judgeId: string;
  refereeId: string;
  tournament: string;
  league: League;
  winnerId: string | null;
  date: string;
  tags: string[];
  aiSummary: string;
  videoUrl?: string;
  transcriptUrl?: string;
  transcript?: string;
  battleId?: string;
  judgeStatus?: "pending" | "judging" | "judged" | "failed";
  judgeError?: string;
  judgeReasoning?: string;
  isPrivate?: boolean;
  recordingUrl?: string | null;
}

export interface Tournament {
  id: string;
  slug: string;
  name: string;
  type: "promotion" | "flagship" | "emergency";
  league: League | "Cross-League";
  status: "upcoming" | "active" | "completed";
  dates: string;
  description: string;
  // The real-world subject an emergency league exists to cover (e.g. "AI
  // regulation"). Null for flagship/promotion tournaments — those don't
  // gate topic negotiation on relevance to a single subject.
  coreTopic: string | null;
  // Pre-written motions scoped to this tournament, used for the topic
  // placeholder rotation and as the fallback pool when players can't agree
  // (or when the AI relevance check rejects an off-topic agreed topic).
  topics: string[];
}

export type BattleFormat = "text" | "audio";
export type BattleStatus = "waiting" | "live" | "completed" | "abandoned";
export type ChallengeStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired";

export interface Battle {
  id: string;
  format: BattleFormat;
  playerAId: string;
  playerBId: string;
  status: BattleStatus;
  topic: string | null;
  tournamentId: string | null;
  durationSeconds: number;
  startedAt: string | null;
  endedAt: string | null;
  dailyRoomName: string | null;
  dailyRoomUrl: string | null;
  endRequestedBy: string | null;
  recordingUrl: string | null;
  transcript: string | null;
  createdAt: string;
  isPrivate: boolean;
  playerAReady: boolean;
  playerBReady: boolean;
}

export interface BattleChallenge {
  id: string;
  challengerId: string;
  opponentId: string;
  format: BattleFormat;
  status: ChallengeStatus;
  tournamentId: string | null;
  battleId: string | null;
  createdAt: string;
  respondedAt: string | null;
  isPrivate: boolean;
}

export interface BattleTurn {
  id: string;
  battleId: string;
  playerId: string;
  content: string;
  createdAt: string;
}

export type TopicProposalStatus = "pending" | "accepted" | "rejected" | "superseded";

export interface TopicProposal {
  id: string;
  battleId: string;
  proposedBy: string;
  topic: string;
  status: TopicProposalStatus;
  createdAt: string;
  respondedAt: string | null;
}
