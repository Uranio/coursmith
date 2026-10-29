import "server-only";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export const emptyUsage = (): Usage => ({ promptTokens: 0, completionTokens: 0, costUsd: 0 });

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    costUsd: a.costUsd + b.costUsd,
  };
}

export interface JsonCallOptions {
  model: string;
  system: string;
  content: string | ContentPart[];
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}

/** Errors that will repeat for every request until credits are added or a quota resets. */
export function isQuotaError(err: unknown): err is LlmError {
  return err instanceof LlmError && (err.status === 402 || (err.status === 429 && err.retryAt !== undefined));
}

export class LlmError extends Error {
  constructor(
    message: string,
    /** HTTP status from OpenRouter, when the failure came from the API. */
    readonly status?: number,
    /** For quota errors (out of credits, free-model daily limit): when it is worth trying again. */
    readonly retryAt?: Date,
  ) {
    super(message);
  }
}

/** One chat completion constrained to a JSON Schema (structured output). Retries transient failures. */
export async function chatJson<T>(opts: JsonCallOptions): Promise<{ data: T; usage: Usage; model: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new LlmError("Missing environment variable OPENROUTER_API_KEY.");

  const body = JSON.stringify({
    model: opts.model,
    // Reasoning models spend output tokens thinking: keep the effort low and leave room for the answer.
    max_tokens: opts.maxTokens ?? 12_000,
    reasoning: { effort: process.env.MODERATION_REASONING_EFFORT ?? "low" },
    temperature: 0,
    usage: { include: true },
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: opts.schemaName, strict: true, schema: opts.schema },
    },
  });

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 2_000 * 2 ** attempt));
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "x-title": "Coursmith moderation",
          "http-referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        },
        body,
        signal: AbortSignal.timeout(180_000),
      });
    } catch (err) {
      lastError = (err as Error).message;
      continue;
    }
    const text = await res.text();
    if (res.status === 429) {
      const quota = dailyQuotaReset(text);
      if (quota) throw new LlmError(`OpenRouter quota exhausted: ${text.slice(0, 300)}`, 429, quota);
    }
    if (res.status === 429 || res.status >= 500) {
      lastError = `${res.status}: ${text.slice(0, 300)}`;
      continue;
    }
    if (!res.ok) throw new LlmError(`OpenRouter ${res.status}: ${text.slice(0, 500)}`, res.status);

    const payload = JSON.parse(text) as {
      model?: string;
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
      error?: { message?: string };
    };
    if (payload.error) {
      lastError = payload.error.message ?? "unknown provider error";
      continue;
    }
    const content = payload.choices?.[0]?.message?.content ?? "";
    const usage: Usage = {
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      completionTokens: payload.usage?.completion_tokens ?? 0,
      costUsd: payload.usage?.cost ?? 0,
    };
    try {
      return { data: JSON.parse(stripFences(content)) as T, usage, model: payload.model ?? opts.model };
    } catch {
      lastError = `Unparseable model output (finish_reason=${payload.choices?.[0]?.finish_reason}): ${content.slice(0, 200)}`;
    }
  }
  throw new LlmError(`OpenRouter call failed after retries: ${lastError}`);
}

/** OpenRouter's free-model daily limit (as opposed to a short burst limit) and when it resets. */
function dailyQuotaReset(body: string): Date | undefined {
  try {
    const err = (JSON.parse(body) as { error?: { message?: string; metadata?: { limit_source?: string; headers?: Record<string, string> } } }).error;
    const daily = /daily/.test(err?.metadata?.limit_source ?? "") || /per-day/.test(err?.message ?? "");
    if (!daily) return undefined;
    const reset = Number(err?.metadata?.headers?.["X-RateLimit-Reset"]);
    return reset > Date.now() ? new Date(reset) : new Date(Date.now() + 60 * 60_000);
  } catch {
    return undefined;
  }
}

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}
