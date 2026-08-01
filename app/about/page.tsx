import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "What is Eztren? Eztren is a global debate sport played online — ranked debate battles judged live, climbing through alphabet leagues from Z toward A.",
  alternates: {
    canonical: "https://eztren.xyz/about",
  },
};

export default function About() {
  return (
    <section className="max-w-3xl mx-auto px-6 py-20">
      <p className="font-data text-[13px] uppercase tracking-wider text-signal mb-6">
        About
      </p>
      <h1 className="font-display text-[clamp(2rem,5vw,3.5rem)] leading-[1.05] tracking-tight mb-8">
        What is Eztren?
      </h1>

      <div className="space-y-6 text-steel text-[16px] leading-relaxed">
        <p>
          <strong className="text-bone">Eztren</strong> is a debate sport
          &mdash; a competitive format where two players argue live, judged
          in real time, and ranked in letters instead of numbers. Players
          climb from the lower alphabet leagues (starting near{" "}
          <span className="text-signal">Z</span>) toward becoming{" "}
          <span className="text-signal">A</span>, the top rank in the game.
        </p>
        <p>
          It began under the name{" "}
          <span className="text-bone">One Alphabet</span>, and the in-game
          league names &mdash; One Alphabet League, Two Alphabet League
          &mdash; still reflect that origin. Eztren is the platform where
          matches are played, judged, recorded, and ranked.
        </p>
        <p>
          Every match is free-flowing: two players, one judge, one referee.
          Matches are recorded with video, transcript, and an AI-generated
          summary, building a searchable public archive of debate and
          reasoning over time.
        </p>
        <p>
          Eztren is a web platform, built and operated independently. It is
          unrelated to Honeywell&rsquo;s &ldquo;eZtrend&rdquo; industrial
          data recorder software &mdash; different product, different
          industry, similar-sounding name only.
        </p>
      </div>

      <div className="mt-12 pt-8 border-t border-steel-line flex flex-wrap gap-4">
        <Link
          href="/join"
          className="font-data text-[13px] uppercase tracking-wider bg-bone text-void px-6 py-3 hover:bg-signal transition-colors"
        >
          Join the League
        </Link>
        <Link
          href="/constitution"
          className="font-data text-[13px] uppercase tracking-wider border border-bone px-6 py-3 hover:border-signal hover:text-signal transition-colors"
        >
          Read the Constitution
        </Link>
      </div>
    </section>
  );
}
