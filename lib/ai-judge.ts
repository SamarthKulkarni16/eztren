// Shared provider chain for judging and moderation calls that must return
// structured JSON — the actual match verdict (app/api/judge) and the
// Emergency League topic-relevance check (app/api/battles/confirm-topic).
// Both are neutral "referee" calls, not in-character player generation, so
// they stay on Gemini first (it's also the only one of these paths that
// needs to accept audio for recorded voice battles) and fall back to
// OpenRouter only if Gemini is unreachable or exhausted. AI player-bot
// turns are a separate chain — see lib/ai-players.ts — because those stay
// on Groq/Cerebras/OpenRouter and never touch Gemini.

const GEMINI_MODEL = "gemini-3.5-flash";
// Free (:free) OpenRouter models by default, so the fallback works with
// zero purchased credits. Text-only judging (match verdicts on a
// transcript, topic-relevance checks) uses a strong free text model.
// Audio judging needs a model that actually accepts inline audio input —
// most free-tier models don't, so that path uses a separate multimodal
// free model. Override either with a paid model once credits are added if
// you want a stronger fallback.
const OPENROUTER_JUDGE_TEXT_MODEL = process.env.OPENROUTER_JUDGE_MODEL || "openai/gpt-oss-20b:free";
const OPENROUTER_JUDGE_AUDIO_MODEL =
  process.env.OPENROUTER_JUDGE_AUDIO_MODEL || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";

export interface JudgeAudio {
  base64: string;
  mimeType: string;
}

function parseJSONLoose<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Returned unparseable content: ${text.slice(0, 200)}`);
    return JSON.parse(match[0]) as T;
  }
}

async function callGeminiJSON<T>(apiKey: string, prompt: string, audio?: JudgeAudio): Promise<T> {
  const parts: any[] = [{ text: prompt }];
  if (audio) parts.push({ inlineData: { mimeType: audio.mimeType, data: audio.base64 } });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Gemini request failed (${res.status})`);
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const finishReason = data?.candidates?.[0]?.finishReason;
    throw new Error(
      finishReason ? `Gemini returned no content (finishReason: ${finishReason})` : "Gemini returned no content"
    );
  }
  return parseJSONLoose<T>(text);
}

async function callOpenRouterJSON<T>(apiKey: string, prompt: string, audio?: JudgeAudio): Promise<T> {
  const content: any[] = [{ type: "text", text: prompt }];
  let model = OPENROUTER_JUDGE_TEXT_MODEL;
  if (audio) {
    // OpenAI-compatible audio-input shape, and switch to the audio-capable
    // free model — most free-tier text models can't take inline audio.
    model = OPENROUTER_JUDGE_AUDIO_MODEL;
    const format = audio.mimeType.includes("wav")
      ? "wav"
      : audio.mimeType.includes("mp3")
      ? "mp3"
      : "mp4";
    content.push({ type: "input_audio", input_audio: { data: audio.base64, format } });
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://eztren.xyz",
      "X-Title": "Eztren",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `OpenRouter request failed (${res.status})`);
  }
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenRouter returned no content");
  return parseJSONLoose<T>(text);
}

export interface JudgeModelResult<T> {
  result: T;
  provider: "gemini" | "openrouter";
}

// Tries Gemini first, then OpenRouter, returning the first successful
// parsed-JSON result. `prompt` should already have any transcript text
// embedded — `audio` is only for the separate inline audio/recording case.
export async function callJudgeModel<T = unknown>(
  prompt: string,
  opts: { geminiKey?: string; openrouterKey?: string; audio?: JudgeAudio }
): Promise<JudgeModelResult<T>> {
  const errors: string[] = [];

  if (opts.geminiKey) {
    try {
      const result = await callGeminiJSON<T>(opts.geminiKey, prompt, opts.audio);
      return { result, provider: "gemini" };
    } catch (err) {
      errors.push(`gemini: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  } else {
    errors.push("gemini: not configured");
  }

  if (opts.openrouterKey) {
    try {
      const result = await callOpenRouterJSON<T>(opts.openrouterKey, prompt, opts.audio);
      return { result, provider: "openrouter" };
    } catch (err) {
      errors.push(`openrouter: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  } else {
    errors.push("openrouter: not configured");
  }

  throw new Error(`All judge providers failed — ${errors.join(" | ")}`);
}
