"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  sendMagicLink,
  registerPlayer,
  getMyPlayer,
  getMatchesForPlayer,
  getPlayerLookup,
  getRankHistoryForPlayer,
} from "@/lib/queries";
import { Player, Match, RankHistoryEntry } from "@/lib/types";
import TimeAtRank from "@/components/TimeAtRank";

// Referral code is kept in sessionStorage as a fallback for the magic-link
// round trip — sendMagicLink also bakes it into the redirect URL, but some
// email clients rewrite links, so this covers that case too.
const REFERRAL_STORAGE_KEY = "eztren_referral_code";

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinPageInner />
    </Suspense>
  );
}

function JoinPageInner() {
  const searchParams = useSearchParams();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [profile, setProfile] = useState<Player | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [history, setHistory] = useState<Match[]>([]);
  const [rankHistory, setRankHistory] = useState<RankHistoryEntry[]>([]);
  const [playerLookup, setPlayerLookup] = useState<Map<string, Player>>(
    new Map()
  );

  // Step 1: email → magic link
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [linkMessage, setLinkMessage] = useState("");
  const [sendingLink, setSendingLink] = useState(false);

  // Step 2: registration, once signed in and no existing profile
  const [role, setRole] = useState<"player" | "judge">("player");
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState("");

  useEffect(() => {
    const fromUrl = searchParams.get("ref");
    if (fromUrl) {
      setReferralCode(fromUrl);
      try {
        sessionStorage.setItem(REFERRAL_STORAGE_KEY, fromUrl);
      } catch {
        // sessionStorage unavailable (private browsing, etc.) — the URL
        // param alone still covers the common case.
      }
    } else {
      try {
        const stored = sessionStorage.getItem(REFERRAL_STORAGE_KEY);
        if (stored) setReferralCode(stored);
      } catch {
        // ignore
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setCheckingSession(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    setCheckingProfile(true);
    getMyPlayer().then((p) => {
      setProfile(p);
      setCheckingProfile(false);
    });
  }, [session]);

  useEffect(() => {
    if (!profile) {
      setHistory([]);
      setRankHistory([]);
      return;
    }
    getMatchesForPlayer(profile.id).then(setHistory);
    getPlayerLookup().then(setPlayerLookup);
    getRankHistoryForPlayer(profile.id).then(setRankHistory);
  }, [profile]);

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault();
    setSendingLink(true);
    const res = await sendMagicLink(email, referralCode);
    setLinkMessage(res.message);
    setLinkSent(res.ok);
    setSendingLink(false);
  }

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRegistering(true);
    setRegisterError("");
    const form = new FormData(e.currentTarget);
    const res = await registerPlayer({
      name: String(form.get("name") ?? ""),
      country: String(form.get("country") ?? ""),
      role,
      age: form.get("age") ? Number(form.get("age")) : null,
      gender: String(form.get("gender") ?? ""),
      referralCode,
    });
    if (res.ok) {
      try {
        sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
      } catch {
        // ignore
      }
      const p = await getMyPlayer();
      setProfile(p);
    } else {
      setRegisterError(res.message);
    }
    setRegistering(false);
  }

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
    setLinkSent(false);
    setLinkMessage("");
    setEmail("");
  }

  const loading = checkingSession || (session && checkingProfile);

  return (
    <div className="max-w-xl mx-auto px-6 py-20">
      <p className="font-data text-[13px] uppercase tracking-wider text-signal mb-4">
        {loading ? "\u00a0" : profile ? "Your Profile" : "Register"}
      </p>
      <h1 className="font-display text-5xl mb-6">
        {loading ? "\u00a0" : profile ? profile.name : "Join the League"}
      </h1>

      {loading ? null : profile ? (
        <div>
          <div className="border border-steel-line p-8 mb-8">
            <div className="flex items-baseline gap-4 mb-2">
              <span className="font-display text-5xl text-signal">
                {profile.rank}
              </span>
              <span className="font-data text-[13px] uppercase tracking-wider text-steel">
                {profile.league}
              </span>
            </div>
            <p className="font-data text-[12px] text-steel mb-6">
              At this rank for <TimeAtRank since={profile.rankSince} />
            </p>
            <div className="grid grid-cols-3 gap-4 font-data text-[13px] text-steel border-t border-steel-line pt-6">
              <div>
                <p className="text-bone text-lg">
                  {profile.wins}&ndash;{profile.losses}
                </p>
                <p>win&ndash;loss</p>
              </div>
              <div>
                <p className="text-bone text-lg">{profile.judgedMatches}</p>
                <p>judged</p>
              </div>
              <div>
                <p className="text-bone text-lg">
                  {profile.judgedMatches >= 10 ? "Yes" : "Not yet"}
                </p>
                <p>flagship-eligible</p>
              </div>
            </div>
          </div>

          <div className="mb-10">
            <p className="font-data text-[12px] uppercase tracking-wider text-steel mb-4">
              Rank History
            </p>
            <div className="space-y-px bg-steel-line border border-steel-line">
              {rankHistory.map((h) => (
                <div
                  key={h.id}
                  className="bg-void p-4 flex items-center justify-between"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="font-display text-xl">{h.rank}</span>
                    <span className="font-data text-[11px] text-steel uppercase tracking-wider">
                      {h.league}
                    </span>
                  </div>
                  <span className="font-data text-[12px] text-steel">
                    {h.endedAt ? (
                      <TimeAtRank since={h.startedAt} until={h.endedAt} />
                    ) : (
                      <>
                        <TimeAtRank since={h.startedAt} /> &middot; current
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-10">
            <p className="font-data text-[12px] uppercase tracking-wider text-steel mb-4">
              Match History
            </p>
            {history.length === 0 ? (
              <p className="text-steel text-[15px]">
                No matches yet &mdash; nothing recorded for you in the
                archive so far.
              </p>
            ) : (
              <div className="space-y-px bg-steel-line border border-steel-line">
                {history.map((m) => {
                  const isJudge = m.judgeId === profile.id;
                  const isReferee = m.refereeId === profile.id;
                  const opponentId =
                    m.playerAId === profile.id ? m.playerBId : m.playerAId;
                  const opponent = playerLookup.get(opponentId);
                  const wasWinner = m.winnerId === profile.id;
                  return (
                    <div key={m.id} className="bg-void p-5">
                      <p className="font-data text-[11px] uppercase tracking-wider text-steel mb-1">
                        {new Date(m.date).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}{" "}
                        &middot;{" "}
                        {isJudge
                          ? "Judged"
                          : isReferee
                          ? "Refereed"
                          : wasWinner
                          ? "Won"
                          : m.winnerId
                          ? "Lost"
                          : "Undecided"}
                      </p>
                      <p className="font-body text-[15px]">{m.topic}</p>
                      {!isJudge && !isReferee && opponent && (
                        <p className="font-data text-[12px] text-steel mt-1">
                          vs {opponent.name}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Link
            href="/rankings"
            className="font-data text-[13px] uppercase tracking-wider text-signal hover:underline"
          >
            View on the Ladder &rarr;
          </Link>

          <div className="mt-16 pt-6 border-t border-steel-line">
            <button
              onClick={handleSignOut}
              className="font-data text-[11px] text-steel/50 hover:text-steel transition-colors"
            >
              sign out
            </button>
          </div>
        </div>
      ) : session ? (
        <form onSubmit={handleRegister} className="space-y-8">
          <p className="text-steel text-lg leading-relaxed">
            Everyone starts unranked, at the bottom of the alphabet leagues.
            No entry fee. One verified email, one rank.
          </p>
          {referralCode && (
            <p className="font-data text-[12px] uppercase tracking-wider text-signal">
              Joining via a friend&rsquo;s invite &mdash; you&rsquo;ll both
              unlock Direct Challenge once you&rsquo;re active.
            </p>
          )}
          <p className="font-data text-[12px] uppercase tracking-wider text-steel">
            Signed in as{" "}
            <span className="text-bone">{session.user.email}</span>{" "}
            <button
              type="button"
              onClick={handleSignOut}
              className="text-signal hover:underline normal-case ml-2"
            >
              not you?
            </button>
          </p>

          <div className="flex gap-px bg-steel-line border border-steel-line w-fit">
            {(["player", "judge"] as const).map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setRole(r)}
                className={`font-data text-[13px] uppercase tracking-wider px-6 py-3 transition-colors ${
                  role === r
                    ? "bg-bone text-void"
                    : "bg-void text-steel hover:text-bone"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="font-data text-[12px] uppercase tracking-wider text-steel">
              Full name
            </span>
            <input
              required
              name="name"
              type="text"
              className="w-full bg-transparent border-b border-steel-line py-3 mt-2 focus:border-signal outline-none"
            />
          </label>

          <label className="block">
            <span className="font-data text-[12px] uppercase tracking-wider text-steel">
              Country
            </span>
            <input
              required
              name="country"
              type="text"
              className="w-full bg-transparent border-b border-steel-line py-3 mt-2 focus:border-signal outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-6">
            <label className="block">
              <span className="font-data text-[12px] uppercase tracking-wider text-steel">
                Age
              </span>
              <input
                name="age"
                type="number"
                min={5}
                max={120}
                className="w-full bg-transparent border-b border-steel-line py-3 mt-2 focus:border-signal outline-none"
              />
            </label>
            <label className="block">
              <span className="font-data text-[12px] uppercase tracking-wider text-steel">
                Gender
              </span>
              <select
                name="gender"
                defaultValue=""
                className="w-full bg-transparent border-b border-steel-line py-3 mt-2 focus:border-signal outline-none"
              >
                <option value="">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="nonbinary">Non-binary</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <p className="font-data text-[11px] text-steel -mt-4">
            Age and gender are kept private &mdash; never shown on the
            public Rankings or Archive.
          </p>

          {role === "judge" && (
            <p className="font-data text-[12px] text-steel border border-steel-line p-4">
              Note: entry into either flagship tournament as a player still
              requires 10 judged matches, regardless of your judging
              application here.
            </p>
          )}

          {registerError && (
            <p className="font-data text-[12px] text-signal">{registerError}</p>
          )}

          <button
            type="submit"
            disabled={registering}
            className="font-data text-[13px] uppercase tracking-wider bg-bone text-void px-8 py-4 hover:bg-signal transition-colors disabled:opacity-50"
          >
            {registering ? "Registering\u2026" : `Register as ${role}`}
          </button>
        </form>
      ) : (
        <div>
          <p className="text-steel text-lg leading-relaxed mb-12">
            Everyone starts unranked, at the bottom of the alphabet leagues.
            No entry fee. One verified email, one rank.
          </p>
          {referralCode && !linkSent && (
            <p className="font-data text-[12px] uppercase tracking-wider text-signal -mt-8 mb-12">
              Joining via a friend&rsquo;s invite &mdash; you&rsquo;ll both
              unlock Direct Challenge once you&rsquo;re active.
            </p>
          )}
          {linkSent ? (
            <div className="border border-steel-line p-8">
              <p className="font-display text-2xl mb-2">Check your inbox.</p>
              <p className="text-steel text-[15px]">{linkMessage}</p>
            </div>
          ) : (
            <form onSubmit={handleSendLink} className="space-y-6">
              <label className="block">
                <span className="font-data text-[12px] uppercase tracking-wider text-steel">
                  Email
                </span>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-transparent border-b border-steel-line py-3 mt-2 focus:border-signal outline-none"
                />
              </label>
              <p className="font-data text-[12px] text-steel">
                No password. We&rsquo;ll email you a one-time link to sign in.
              </p>
              {linkMessage && !linkSent && (
                <p className="font-data text-[12px] text-signal">{linkMessage}</p>
              )}
              <button
                type="submit"
                disabled={sendingLink}
                className="font-data text-[13px] uppercase tracking-wider bg-bone text-void px-8 py-4 hover:bg-signal transition-colors disabled:opacity-50"
              >
                {sendingLink ? "Sending\u2026" : "Send sign-in link"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
