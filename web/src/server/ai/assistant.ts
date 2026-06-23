import "server-only";
import { z } from "zod";

/**
 * Unified AI assistant — one brain, two modes (`medical` | `meow`).
 *
 * Design (see ROADMAP.md §Fase 4):
 *  - RAG by CONTEXT INJECTION, not a vector DB: a single cat's data is a handful
 *    of rows, so we inject the relevant snippets directly into the prompt.
 *  - The caller (client) supplies the cat context it already holds locally
 *    (IndexedDB), so this works before server↔DB sync exists. The data is
 *    zod-validated and size-capped upstream in the route.
 *  - Hard guardrails in the system prompt: informational, NOT a veterinarian,
 *    refuses diagnosis/dosing, redirects emergencies to a real vet.
 *  - Provider: OpenAI gpt-4o-mini (cheap, capable). Server-only API key; the
 *    function is a no-op-with-message when OPENAI_API_KEY is unset, so the app
 *    builds and runs without it.
 */

export type AssistantMode = "medical" | "meow";

/**
 * Request schema (single source of truth, shared with the API route). Caps every
 * field so the injected context can't bloat the prompt or carry an attack.
 */
export const assistantSchema = z.object({
  mode: z.enum(["medical", "meow"]),
  locale: z.enum(["es", "en"]),
  question: z.string().min(1).max(1000),
  context: z.object({
    name: z.string().max(80).optional(),
    breed: z.string().max(80).optional(),
    ageYears: z.number().min(0).max(40).optional(),
    vaccines: z
      .array(z.object({ name: z.string().max(80), status: z.string().max(40), date: z.string().max(40).optional() }))
      .max(30)
      .optional(),
    records: z
      .array(z.object({ kind: z.string().max(40), title: z.string().max(120), date: z.string().max(40).optional() }))
      .max(30)
      .optional(),
    recentMeows: z
      .array(z.object({ cls: z.string().max(40), confidence: z.number().min(0).max(1), date: z.string().max(40).optional() }))
      .max(20)
      .optional(),
  }),
});

export type AssistantRequest = z.infer<typeof assistantSchema>;
export type CatContext = AssistantRequest["context"];

export type AssistantResult =
  | { ok: true; answer: string }
  | { ok: false; code: "not-configured" | "provider-error"; message: string };

const MODEL = "gpt-4o-mini";
const MAX_TOKENS = 500;

/** Shared safety guardrails — identical contract across both modes. */
function systemPrompt(mode: AssistantMode, locale: "es" | "en"): string {
  const lang = locale === "es" ? "español" : "English";
  const base =
    `You are an informational assistant inside the MeowDecoder app. You are NOT a ` +
    `veterinarian and you do NOT provide diagnosis, treatment, drug doses or medical ` +
    `advice. Use ONLY the provided cat context and general, well-established cat-care ` +
    `knowledge. If asked for diagnosis/medication/dosing, or if the user describes an ` +
    `emergency or worrying symptoms, clearly tell them to consult a licensed veterinarian ` +
    `immediately. Be honest about uncertainty; if the context lacks the answer, say so. ` +
    `Keep answers concise and kind. Always answer in ${lang}.`;
  const modeNote =
    mode === "medical"
      ? ` This conversation is about the cat's logged medical record (vaccines, notes).`
      : ` This conversation explains the app's acoustic meow analysis (class + confidence). ` +
        `These are probabilistic guesses about vocalization type, not literal translation.`;
  return base + modeNote;
}

function contextBlock(ctx: CatContext): string {
  const lines: string[] = [];
  if (ctx.name) lines.push(`Cat: ${ctx.name}`);
  if (ctx.breed) lines.push(`Breed: ${ctx.breed}`);
  if (typeof ctx.ageYears === "number") lines.push(`Age: ${ctx.ageYears} years`);
  if (ctx.vaccines?.length)
    lines.push(
      "Vaccines:\n" +
        ctx.vaccines.map((v) => `  - ${v.name}: ${v.status}${v.date ? ` (${v.date})` : ""}`).join("\n"),
    );
  if (ctx.records?.length)
    lines.push(
      "Medical notes:\n" +
        ctx.records.map((r) => `  - [${r.kind}] ${r.title}${r.date ? ` (${r.date})` : ""}`).join("\n"),
    );
  if (ctx.recentMeows?.length)
    lines.push(
      "Recent meow analyses:\n" +
        ctx.recentMeows
          .map((m) => `  - ${m.cls} (${Math.round(m.confidence * 100)}%)${m.date ? ` (${m.date})` : ""}`)
          .join("\n"),
    );
  return lines.length ? lines.join("\n") : "(no cat context provided)";
}

export async function askAssistant(req: AssistantRequest): Promise<AssistantResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, code: "not-configured", message: "AI assistant is not configured." };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt(req.mode, req.locale) },
          { role: "system", content: `Cat context:\n${contextBlock(req.context)}` },
          { role: "user", content: req.question },
        ],
      }),
    });
    if (!res.ok) {
      return { ok: false, code: "provider-error", message: `Provider returned ${res.status}` };
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) return { ok: false, code: "provider-error", message: "Empty response" };
    return { ok: true, answer };
  } catch (e) {
    return { ok: false, code: "provider-error", message: e instanceof Error ? e.message : "error" };
  }
}
