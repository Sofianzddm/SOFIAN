/**
 * Appel xAI (Responses API) — modèle Grok configuré côté requête.
 * Extraction : output_text, blocs tools/reasoning, recherche web, etc.
 */

/** Tous les blocs `type: "output_text"` avec un `text` non vide. */
function collectOutputTextTyped(node: unknown, acc: string[]): void {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (const x of node) collectOutputTextTyped(x, acc);
    return;
  }
  if (typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  if (o.type === "output_text" && typeof o.text === "string" && o.text.trim()) {
    acc.push(o.text.trim());
  }
  for (const v of Object.values(o)) {
    collectOutputTextTyped(v, acc);
  }
}

/** Tout champ `text` dans des tableaux `content` (fallback si le type diffère). */
function collectContentTextFallback(outputArray: unknown[]): string[] {
  const acc: string[] = [];
  for (const item of outputArray) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.text === "string" && o.text.trim()) acc.push(o.text.trim());
    if (!Array.isArray(o.content)) continue;
    for (const block of o.content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (typeof b.text === "string" && b.text.trim()) acc.push(b.text.trim());
    }
  }
  return acc;
}

function extractTextFromResponsesBody(data: Record<string, unknown>): string {
  const choices = data.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const msg = (choices[0] as { message?: { content?: string } }).message?.content;
    if (typeof msg === "string" && msg.trim()) return msg;
  }

  const output = data.output;
  if (!Array.isArray(output) || output.length === 0) {
    const acc: string[] = [];
    collectOutputTextTyped(data, acc);
    return acc.length ? (acc[acc.length - 1] ?? "") : "";
  }

  const typed: string[] = [];
  collectOutputTextTyped(output, typed);
  if (typed.length > 0) {
    return typed[typed.length - 1] ?? "";
  }

  const fallback = collectContentTextFallback(output);
  if (fallback.length > 0) {
    return fallback[fallback.length - 1] ?? "";
  }

  return "";
}

export type XaiResponseOptions = {
  /**
   * Outils Agent x.ai (remplace l’ancienne `search_parameters` dépréciée).
   * Ex. recherche marque : `[{ type: "web_search" }, { type: "x_search" }]`
   */
  tools?: Array<{ type: string }>;
};

function buildRequestBody(input: string, options?: XaiResponseOptions): Record<string, unknown> {
  const base: Record<string, unknown> = {
    model: "grok-4.20-reasoning",
  };
  if (options?.tools?.length) {
    base.input = [{ role: "user", content: input }];
    base.tools = options.tools;
  } else {
    base.input = input;
  }
  return base;
}

export async function xaiResponse(
  input: string,
  options?: XaiResponseOptions
): Promise<string> {
  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify(buildRequestBody(input, options)),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`xAI error: ${error}`);
  }

  const data = (await res.json()) as Record<string, unknown>;

  if (data.error && typeof data.error === "object") {
    const err = data.error as Record<string, unknown>;
    const msg =
      typeof err.message === "string"
        ? err.message
        : typeof err.error === "string"
          ? err.error
          : JSON.stringify(data.error);
    throw new Error(msg);
  }

  const text = extractTextFromResponsesBody(data);
  if (!text) {
    const out = data.output;
    const preview =
      Array.isArray(out) && out[0] && typeof out[0] === "object"
        ? JSON.stringify(out[0]).slice(0, 500)
        : String(out);
    console.error(
      "xAI extract vide — status:",
      data.status,
      "output.length:",
      Array.isArray(out) ? out.length : "?",
      "preview:",
      preview
    );
    throw new Error("Réponse xAI vide ou format inattendu");
  }
  return text;
}
