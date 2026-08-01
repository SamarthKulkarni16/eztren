export const metadata = { title: "Constitution" };

const sections = [
  {
    n: "01",
    title: "Vision",
    body: `A global debate sport where the goal is not just to win, but to make judges and spectators think: "Wow... I never thought of it that way."`,
  },
  {
    n: "02",
    title: "Ranking",
    body: `Public ranking uses letters: A, B, C ... Z, AA, AB, AC ... Elite players are One Alphabet Players. Everyone begins in the lower alphabet leagues and climbs upward.`,
  },
  {
    n: "03",
    title: "Match Structure",
    body: `Standard matches run 10 minutes, free-flowing, with one judge and one referee. Players first attempt to agree on the topic and who speaks first. If they cannot agree who speaks first, the referee decides \u2014 final.`,
  },
  {
    n: "04",
    title: "Rule Philosophy",
    body: `Phones, outside assistance, and physical contact are not allowed except in special leagues that explicitly permit them. Threats result in a permanent ban. Preventing your opponent from speaking is not illegal \u2014 it is poor strategy.`,
  },
  {
    n: "05",
    title: "Judge & Referee",
    body: `Online, judges and referees may be human or AI. In physical tournaments, judges and referees are human only. AI players compete exclusively in dedicated AI competitions.`,
  },
  {
    n: "06",
    title: "Judge Philosophy",
    body: `Experienced players are expected to judge, because judging provides another perspective on the game. To compete in either flagship One Alphabet tournament, a competitor must have judged at least 10 official matches.`,
  },
  {
    n: "07",
    title: "No Age Restriction",
    body: `Anyone can compete regardless of age. The sport itself has no age restriction; practical safeguarding for minors is handled in the rulebook.`,
  },
  {
    n: "08",
    title: "Flagship Tournaments",
    body: `The Unknown Road to One Alphabet promotes Two Alphabet players into the One Alphabet League, currently online. Physical tournaments coming soon. Twilight Race to Get the Ace is contested within the One Alphabet League to determine A, the highest-ranked player, planned annually each January.`,
  },
  {
    n: "09",
    title: "Emergency League",
    body: `A temporary online league activated during major world events \u2014 conflict, regulation, pandemic, disaster \u2014 to preserve high-quality debate on significant ongoing events as part of the permanent archive.`,
  },
  {
    n: "10",
    title: "Archive",
    body: `Every official match is recorded: video, audio, transcript, topic, players, judge, referee, tournament, date, league, metadata, AI summaries, and searchable tags. The goal is one of the world's largest public libraries of human reasoning.`,
  },
];

export default function ConstitutionPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-20">
      <p className="font-data text-[13px] uppercase tracking-wider text-signal mb-4">
        The Constitution
      </p>
      <h1 className="font-display text-5xl mb-6">Timeless, not detailed.</h1>
      <p className="text-steel text-lg leading-relaxed mb-16 max-w-xl">
        This document holds only the principles that mustn&rsquo;t change.
        Everything else &mdash; scoring detail, topic selection, edge cases
        &mdash; lives in a rulebook built to evolve.
      </p>

      <div className="space-y-14">
        {sections.map((s) => (
          <div
            key={s.n}
            className="grid grid-cols-[3.5rem_1fr] gap-6 border-t border-steel-line pt-8"
          >
            <span className="font-data text-signal text-sm pt-1">{s.n}</span>
            <div>
              <h2 className="font-display text-2xl mb-3">{s.title}</h2>
              <p className="text-steel leading-relaxed text-[15px]">
                {s.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
