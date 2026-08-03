import Link from "next/link";
import type { League } from "@/lib/types";

export type VSCardStatus = "scheduled" | "live" | "completed";

export interface VSCardPlayer {
  id: string;
  name: string;
  rank: string;
  league: League | null;
  isAi?: boolean;
}

interface VSCardProps {
  playerA: VSCardPlayer;
  playerB: VSCardPlayer;
  status: VSCardStatus;
  winnerId?: string | null;
  topic?: string | null;
  href?: string;
  compact?: boolean;
}

function isTopRank(p: VSCardPlayer) {
  return p.rank === "A" || p.league === "One Alphabet League";
}

function Side({
  player,
  align,
  isWinner,
  isLoser,
}: {
  player: VSCardPlayer;
  align: "left" | "right";
  isWinner: boolean;
  isLoser: boolean;
}) {
  const top = isTopRank(player);
  return (
    <div
      className={`flex-1 min-w-0 flex flex-col justify-center px-4 py-6 sm:px-6 ${
        align === "right" ? "items-end text-right" : "items-start text-left"
      } ${isLoser ? "opacity-40" : ""}`}
    >
      <span
        className="font-versus font-extrabold uppercase leading-[0.85] tracking-tight text-[13vw] sm:text-4xl md:text-5xl truncate max-w-full"
        style={{ color: player.isAi ? "var(--ai-glow)" : isWinner ? "var(--signal)" : "var(--bone)" }}
      >
        {player.name}
      </span>
      <span
        className={`font-data text-xs sm:text-sm mt-2 px-2 py-0.5 border ${
          player.isAi
            ? "border-[var(--ai-glow)] text-[var(--ai-glow)]"
            : top
            ? "border-[var(--gold)] text-[var(--gold)]"
            : "border-steel-line text-steel"
        }`}
      >
        {player.isAi ? "AI Personality" : `RANK ${player.rank}`}
      </span>
    </div>
  );
}

export default function VSCard({
  playerA,
  playerB,
  status,
  winnerId,
  topic,
  href,
  compact = false,
}: VSCardProps) {
  const content = (
    <div className="relative w-full border border-steel-line bg-void">
      {status === "live" && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
          <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
          <span className="font-data text-[11px] tracking-[0.2em] text-signal">
            LIVE
          </span>
        </div>
      )}
      <div className="flex items-stretch">
        <Side
          player={playerA}
          align="left"
          isWinner={status === "completed" && winnerId === playerA.id}
          isLoser={
            status === "completed" &&
            winnerId != null &&
            winnerId !== playerA.id
          }
        />
        <div className="flex items-center px-2 sm:px-3 shrink-0">
          <span className="font-versus font-extrabold text-steel text-lg sm:text-2xl">
            VS
          </span>
        </div>
        <Side
          player={playerB}
          align="right"
          isWinner={status === "completed" && winnerId === playerB.id}
          isLoser={
            status === "completed" &&
            winnerId != null &&
            winnerId !== playerB.id
          }
        />
      </div>
      {!compact && topic && (
        <div className="border-t border-steel-line px-4 py-2 sm:px-6">
          <span className="font-body text-xs sm:text-sm text-steel truncate block">
            {topic}
          </span>
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block group">
        <div className="transition-opacity group-hover:opacity-90">
          {content}
        </div>
      </Link>
    );
  }

  return content;
}
