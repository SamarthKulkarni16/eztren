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
}

export interface Tournament {
  id: string;
  name: string;
  type: "promotion" | "flagship" | "emergency";
  league: League | "Cross-League";
  status: "upcoming" | "active" | "completed";
  dates: string;
  description: string;
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
}

export interface BattleChallenge {
  id: string;
  challengerId: string;
  opponentId: string;
  format: BattleFormat;
  status: ChallengeStatus;
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
