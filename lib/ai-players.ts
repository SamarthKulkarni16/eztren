// Shared provider chain for AI player-bot text generation (in-character
// battle turns, topic accept/reject decisions). Every call walks the same
// order — Groq -> Cerebras -> OpenRouter — and falls to the next provider
// the moment one fails for any reason: out of tokens/quota, rate limited,
// down, or simply not configured. Judging (app/api/judge,
// app/api/battles/confirm-topic) is a separate chain — see lib/ai-judge.ts
// — because it stays Gemini-first.
//
// Because every battle turn is its own independent request, "switch
// mid-battle" needs no special handling: the moment Groq starts failing
// (e.g. its free-tier tokens run out), the very next turn's call just
// walks past it to Cerebras, then OpenRouter, with no coordination needed
// between requests.

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

interface PlayerProvider {
  name: string;
  url: string;
  apiKey?: string;
  model: string;
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
  const res = await fetch(provider.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      max_tokens: maxTokens,
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
      name: "cerebras",
      url: "https://api.cerebras.ai/v1/chat/completions",
      apiKey: process.env.CEREBRAS_API_KEY,
      // llama-3.3-70b was removed from Cerebras's public catalog. Current
      // production model — see https://inference-docs.cerebras.ai/models/overview
      model: process.env.CEREBRAS_MODEL || "gpt-oss-120b",
    },
    {
      name: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: process.env.OPENROUTER_API_KEY,
      // A genuinely free (:free) OpenRouter model by default, so this tier
      // works with zero purchased credits — matching Groq/Cerebras above.
      // Set OPENROUTER_PLAYER_MODEL to a paid model once credits are added
      // if you want a stronger model here.
      model: process.env.OPENROUTER_PLAYER_MODEL || "openai/gpt-oss-20b:free",
    },
  ];
}

export interface PlayerBotResult {
  text: string;
  provider: string;
}

// Runs `prompt` through Groq -> Cerebras -> OpenRouter, returning the first
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
