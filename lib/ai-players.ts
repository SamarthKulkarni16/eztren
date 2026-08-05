// Shared provider chain for AI player-bot text generation (in-character
// battle turns, topic accept/reject decisions). Every call walks the same
// order — Groq -> OpenRouter — and falls to the next provider the moment
// one fails for any reason: out of tokens/quota, rate limited, down, or
// simply not configured. Judging (app/api/judge,
// app/api/battles/confirm-topic) is a separate chain — see lib/ai-judge.ts
// — because it stays Gemini-first.
//
// Cerebras was in this chain too, but got pulled — its account kept
// returning 402 Payment Required on a model documented as free-tier
// (no card required), which looked account-side rather than a config
// issue on our end. Re-add it here if that gets sorted.
//
// Because every battle turn is its own independent request, "switch
// mid-battle" needs no special handling: the moment Groq starts failing
// (e.g. its free-tier tokens run out), the very next turn's call just
// walks past it to OpenRouter, with no coordination needed between
// requests.

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

interface PlayerProvider {
  name: string;
  url: string;
  apiKey?: string;
  model: string;
  // Extra fields merged into the request body — used to tame reasoning
  // models (see openrouter below).
  extraBody?: Record<string, unknown>;
  // Floor applied to the caller's requested maxTokens for this provider.
  // Reasoning models spend part of the token budget on hidden
  // chain-of-thought before ever writing the visible answer — with a tiny
  // budget (e.g. 5-80 tokens for a short battle turn) that hidden
  // reasoning alone can eat the whole thing, leaving nothing in the
  // response content. Free-tier OpenRouter models are reasoning models
  // more often than not, so OpenRouter gets a generous floor.
  minTokens?: number;
}

// A provider that just failed with a rate-limit/quota-exhausted style
// error gets skipped for a short cooldown window, so a mid-battle
// exhaustion doesn't cost every subsequent turn a slow doomed call before
// falling through to the next provider.
const COOLDOWN_MS = 5 * 60 * 1000;
const cooldownUntil = new Map<string, number>();

function isOnCooldown(name: string): boolean {
  const until = cooldownUntil.get(name);
  return until !== undefined && Date.now() < until;
}

function markCooldown(name: string) {
  cooldownUntil.set(name, Date.now() + COOLDOWN_MS);
}

async function callProvider(
  provider: PlayerProvider,
  messages: ChatMessage[],
  maxTokens: number
): Promise<string> {
  const effectiveMaxTokens = Math.max(maxTokens, provider.minTokens ?? 0);
  const res = await fetch(provider.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      max_tokens: effectiveMaxTokens,
      ...provider.extraBody,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(
      `${provider.name} error (${res.status}): ${data?.error?.message ?? res.statusText}`
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error(`${provider.name} returned no content`);
  }
  return text.trim();
}

function buildProviders(): PlayerProvider[] {
  return [
    {
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    },
    {
      name: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: process.env.OPENROUTER_API_KEY,
      // A genuinely free (:free) OpenRouter model by default, so this tier
      // works with zero purchased credits — matching Groq above. Set
      // OPENROUTER_PLAYER_MODEL to a paid model once credits are added if
      // you want a stronger model here.
      model: process.env.OPENROUTER_PLAYER_MODEL || "openai/gpt-oss-20b:free",
      // gpt-oss-20b is a reasoning model — cap its hidden reasoning and
      // guarantee enough budget left for the actual answer, or short
      // calls (topic accept/reject, ~5 tokens) come back empty.
      extraBody: { reasoning: { effort: "low" } },
      minTokens: 300,
    },
  ];
}

export interface PlayerBotResult {
  text: string;
  provider: string;
}

// Runs `prompt` through Groq -> OpenRouter, returning the first
// successful reply. Throws only if every configured provider failed (or
// none are configured), with a message listing what happened at each step
// so failures are debuggable instead of a generic 502.
export async function callPlayerBot(
  prompt: string,
  maxTokens: number = 80
): Promise<PlayerBotResult> {
  const messages: ChatMessage[] = [{ role: "user", content: prompt }];
  const errors: string[] = [];

  for (const provider of buildProviders()) {
    if (!provider.apiKey) {
      errors.push(`${provider.name}: not configured`);
      continue;
    }
    if (isOnCooldown(provider.name)) {
      errors.push(`${provider.name}: on cooldown after a recent failure`);
      continue;
    }
    try {
      const text = await callProvider(provider, messages, maxTokens);
      if (text) return { text, provider: provider.name };
      errors.push(`${provider.name}: empty response`);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 429 || status === 402) {
        // Rate limited or out of credits/tokens — this is exactly the
        // "exhausted mid-battle" case. Cool it down so the rest of this
        // battle (and others) skip straight past it.
        markCooldown(provider.name);
      }
      errors.push(`${provider.name}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  throw new Error(`All player-bot providers failed — ${errors.join(" | ")}`);
}
