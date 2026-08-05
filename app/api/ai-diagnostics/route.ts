import { NextResponse } from "next/server";

// TEMPORARY — hits each provider directly and independently (not through
// the lib/ai-players.ts / lib/ai-judge.ts fallback chains, so a working
// provider 2nd/3rd in line doesn't get hidden by an earlier one that's
// fine) to confirm each configured key actually works. Every test uses a
// tiny max_tokens so this is cheap to run. Delete this route (or add auth)
// once you're done sanity-checking — it's unauthenticated and, while it
// doesn't leak key values, anyone with the URL can trigger a few
// tiny provider calls.

interface ProbeResult {
  configured: boolean;
  ok: boolean;
  model?: string;
  latencyMs?: number;
  sample?: string;
  error?: string;
}

async function probeOpenAICompatible(
  name: string,
  url: string,
  apiKey: string | undefined,
  model: string,
  maxTokens: number = 5,
  extraBody: Record<string, unknown> = {}
): Promise<ProbeResult> {
  if (!apiKey) return { configured: false, ok: false, error: "no API key set" };
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with exactly the single word: OK" }],
        max_tokens: maxTokens,
        ...extraBody,
      }),
    });
    const data = await res.json().catch(() => ({}));
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        configured: true,
        ok: false,
        model,
        latencyMs,
        error: `${name} error (${res.status}): ${data?.error?.message ?? res.statusText}`,
      };
    }
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return { configured: true, ok: false, model, latencyMs, error: `${name} returned no content` };
    return { configured: true, ok: true, model, latencyMs, sample: text };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      model,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : "unknown error",
    };
  }
}

async function probeGemini(apiKey: string | undefined): Promise<ProbeResult> {
  if (!apiKey) return { configured: false, ok: false, error: "no API key set" };
  const model = "gemini-3.5-flash";
  const started = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Reply with exactly the single word: OK" }] }],
          // Gemini 3.x thinks by default before writing the visible
          // answer — thinkingLevel "low" keeps that bounded instead of
          // variable, and a real maxOutputTokens budget (not 5) leaves
          // room for both the hidden thinking and the actual answer, same
          // fix as the OpenRouter reasoning-model probe below.
          generationConfig: { maxOutputTokens: 300, thinkingConfig: { thinkingLevel: "low" } },
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { configured: true, ok: false, model, latencyMs, error: data?.error?.message ?? res.statusText };
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return { configured: true, ok: false, model, latencyMs, error: "Gemini returned no content" };
    return { configured: true, ok: true, model, latencyMs, sample: text };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      model,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : "unknown error",
    };
  }
}

export async function GET() {
  const [groq, cerebras, openrouterPlayer, gemini, openrouterJudge] = await Promise.all([
    probeOpenAICompatible(
      "groq",
      "https://api.groq.com/openai/v1/chat/completions",
      process.env.GROQ_API_KEY,
      process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
    ),
    probeOpenAICompatible(
      "cerebras",
      "https://api.cerebras.ai/v1/chat/completions",
      process.env.CEREBRAS_API_KEY,
      process.env.CEREBRAS_MODEL || "gpt-oss-120b"
    ),
    probeOpenAICompatible(
      "openrouter (player)",
      "https://openrouter.ai/api/v1/chat/completions",
      process.env.OPENROUTER_API_KEY,
      process.env.OPENROUTER_PLAYER_MODEL || "openai/gpt-oss-20b:free",
      // Reasoning model — needs real headroom past hidden reasoning, or
      // this probe would falsely report failure the same way the earlier
      // 5-token version did.
      300,
      { reasoning: { effort: "low" } }
    ),
    probeGemini(process.env.GEMINI_API_KEY),
    probeOpenAICompatible(
      "openrouter (judge)",
      "https://openrouter.ai/api/v1/chat/completions",
      process.env.OPENROUTER_API_KEY,
      process.env.OPENROUTER_JUDGE_MODEL || "openai/gpt-oss-20b:free",
      300,
      { reasoning: { effort: "low" } }
    ),
  ]);

  return NextResponse.json({
    playerBots: { groq, cerebras, openrouter: openrouterPlayer },
    judge: { gemini, openrouter: openrouterJudge },
  });
}
