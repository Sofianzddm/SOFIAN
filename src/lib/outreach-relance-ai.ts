/**
 * Relance IA Outreach Clients / BENELUX — même « genre lettre » que
 * projets-outreach / casting (gpt-4o), calée sur le mail initial du cycle.
 * Soft-fail → null → template `buildOutreachRelanceTemplate`.
 */
import OpenAI from "openai";
import { plainTextToEmailHtml } from "@/lib/email-body-html";
import { ensureTalentExtralinksInHtml } from "@/lib/talent-email-links";

const AI_MODEL = "gpt-4o";
const MAX_BODY_CHARS = 4500;
const MIN_PLAIN_CHARS = 380;

export type OutreachRelanceAiRound = 1 | 2;

export type OutreachRelanceAiInput = {
  touchId: string;
  /** 1 = J+3 après le mail ; 2 = J+10 après la relance 1. */
  round?: OutreachRelanceAiRound;
  language: "fr" | "en";
  company: string;
  previousSubject: string;
  previousBodyHtml: string;
  firstSentAt: Date | null;
};

export type OutreachRelanceAiResult = {
  bodyHtml: string;
};

function stripHtmlToText(html: string): string {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function detectTone(previousText: string, language: "fr" | "en"): "tu" | "vous" {
  if (language === "en") return "vous"; // EN = you (neutre)
  const t = previousText.toLowerCase();
  if (
    /\bj['']espère que tu\b/.test(t) ||
    /\bhello\s+\{\{\s*contact\.firstname\s*\}\}/i.test(previousText) ||
    /\b(te|ton|ta|tes)\s+(parlerait|intéresser)/i.test(t)
  ) {
    return "tu";
  }
  if (/\bj['']espère que vous\b/.test(t) || /\bseriez-vous\b/.test(t)) {
    return "vous";
  }
  // Défaut outreach clients : vouvoiement (marques corporate)
  return "vous";
}

function pickCta(
  touchId: string,
  round: OutreachRelanceAiRound,
  language: "fr" | "en",
  tone: "tu" | "vous"
): string {
  const frTuR1 = [
    "Ces créateurs t’intéresseraient ?",
    "On en discute ?",
    "Tu veux que je t’envoie les media kits ?",
  ];
  const frVousR1 = [
    "Ces créateurs vous intéresseraient-ils ?",
    "Souhaitez-vous que je vous envoie les media kits ?",
    "Pourriez-vous me dire quelles seraient vos prochaines campagnes ?",
  ];
  const frTuR2 = [
    "Tu as pu regarder leur côté ?",
    "Je t’envoie les media kits ?",
    "Quelles seraient vos prochaines campagnes — on calerait ça dessus ?",
  ];
  const frVousR2 = [
    "Avez-vous pu regarder leur profil ?",
    "Souhaitez-vous que je vous envoie les media kits ?",
    "Quelles seraient vos prochaines campagnes — on pourrait caler une activation dessus ?",
  ];
  const enR1 = [
    "Would these creators be of interest?",
    "Would you like me to send over their media kits?",
    "Could you share what your next campaigns would be?",
  ];
  const enR2 = [
    "Did you get a chance to look at their profiles?",
    "Shall I send over the media kits?",
    "What would your next campaigns be — we could build around that?",
  ];
  const pool =
    language === "en"
      ? round === 2
        ? enR2
        : enR1
      : tone === "tu"
        ? round === 2
          ? frTuR2
          : frTuR1
        : round === 2
          ? frVousR2
          : frVousR1;
  let hash = 0;
  const key = `${touchId}:r${round}`;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return pool[hash % pool.length]!;
}

function formatSentDate(d: Date | null, language: "fr" | "en"): string | null {
  if (!d) return null;
  return d.toLocaleDateString(language === "en" ? "en-GB" : "fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function extractJsonBody(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { body?: unknown };
    if (typeof parsed.body === "string" && parsed.body.trim()) {
      return parsed.body.trim();
    }
  } catch {
    // try fence
  }
  const m = raw.match(/\{[\s\S]*"body"\s*:\s*"([\s\S]*?)"\s*\}/);
  if (m?.[1]) {
    try {
      return JSON.parse(`"${m[1]}"`) as string;
    } catch {
      return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
  }
  return null;
}

function stripAgencySignature(html: string): string {
  return html
    .replace(/\bLeyna\s*\/\s*Glow\s*Up\s*Agence\b/gi, "")
    .replace(/Leyna\s*(?:<br\s*\/?>|\n)+\s*Glow\s*Up\s*Agence/gi, "")
    .replace(/(?:<br\s*\/?>|\n)+\s*(?:Leyna|Leyna Khaled)\s*(?:<br\s*\/?>|\n)*\s*(?:Glow Up Agence)?\s*$/i, "")
    .trim();
}

function ensureGreeting(html: string): string {
  if (/\{\{\s*contact\.firstname\s*\}\}/i.test(html)) {
    return html.replace(
      /\b(?:Salut|Bonjour|Hi)\s+(\{\{\s*contact\.firstname\s*\}\})/gi,
      "Hello $1"
    );
  }
  return `Hello {{contact.firstname}},<br /><br />${html}`;
}

function ensureHope(html: string, language: "fr" | "en", tone: "tu" | "vous"): string {
  const hope =
    language === "en"
      ? "I hope you're doing well?"
      : tone === "tu"
        ? "J'espère que tu vas bien ?"
        : "J'espère que vous allez bien ?";
  if (/j['']espère que (tu|vous)|hope you/i.test(html)) return html;
  return html.replace(
    /(Hello \{\{\s*contact\.firstname\s*\}\}[,!]?\s*(?:<br\s*\/?>)*)/i,
    `$1<br /><br />${hope}<br /><br />`
  );
}

function ensureCta(html: string, cta: string): string {
  if (html.includes(cta.slice(0, 20))) return html;
  const closing = /((?:Belle journ[eé]e|Have a great day)\s*,?\s*)/i;
  if (closing.test(html)) {
    return html.replace(closing, `${cta}<br /><br />$1`);
  }
  return `${html}<br /><br />${cta}`;
}

function ensureClosing(html: string, language: "fr" | "en"): string {
  if (/belle journ[eé]e|have a great day/i.test(html)) return html;
  const close = language === "en" ? "Have a great day," : "Belle journée,";
  return `${html}<br /><br />${close}`;
}

function postProcess(
  rawBody: string,
  language: "fr" | "en",
  tone: "tu" | "vous",
  cta: string
): string | null {
  let out = rawBody.trim();
  if (!out) return null;
  // Si l’IA a renvoyé du plain text → HTML léger
  if (!/<[a-z][\s\S]*>/i.test(out)) {
    out = plainTextToEmailHtml(out);
  }
  out = stripAgencySignature(out);
  out = ensureGreeting(out);
  out = ensureHope(out, language, tone);
  out = ensureCta(out, cta);
  out = ensureClosing(out, language);
  out = stripAgencySignature(out);

  if (out.length > MAX_BODY_CHARS) return null;
  const plainLen = stripHtmlToText(out).length;
  if (plainLen < MIN_PLAIN_CHARS) {
    console.warn(`[outreach-relance-ai] body trop court (${plainLen}) — rejeté`);
    return null;
  }
  return out;
}

function buildPrompt(args: {
  language: "fr" | "en";
  tone: "tu" | "vous";
  round: OutreachRelanceAiRound;
  company: string;
  previousSubject: string;
  previousBodyText: string;
  firstSentLabel: string | null;
  suggestedCta: string;
}): string {
  const brand = args.company || "la marque";
  const roundHint =
    args.round === 2
      ? args.language === "en"
        ? "This is the 2ND follow-up (value-add). Shorter than the first follow-up. Add one fresh concrete angle (media kit / reach / next campaigns) without repeating the first follow-up word-for-word."
        : "C’est la 2ᵉ relance (valeur ajoutée). Plus courte que la 1ʳᵉ. Ajoute un angle concret frais (media kit / reach / prochaines campagnes) sans recopier la 1ʳᵉ relance mot pour mot."
      : args.language === "en"
        ? "This is the 1ST follow-up after the cold pitch."
        : "C’est la 1ʳᵉ relance après le mail initial.";

  if (args.language === "en") {
    return `Write a COMPLETE BD follow-up email for Glow Up Agence (talent agency) to a brand contact.

CONTEXT
- Brand: ${brand}
- Round: ${args.round} — ${roundHint}
- Original subject: ${args.previousSubject || "—"}
- Original email sent${args.firstSentLabel ? ` on ${args.firstSentLabel}` : ""}:
"""
${args.previousBodyText.slice(0, 3500)}
"""

RULES
- English only. Greeting: Hello {{contact.firstname}},
- Hope you're well line right after.
- Remind the multi-talent pitch from the original (keep the SAME creators mentioned — do not invent new ones or other brands).
- When citing a creator, use their FULL name exactly as in the original email (so we can attach Instagram extralinks). Prefer HTML: <a href="https://www.instagram.com/HANDLE"><strong>First Last</strong></a> when you know the handle from the original.
- Offer concrete next steps: media kits, reach estimates, content ideas.
- End with this CTA (or very close): "${args.suggestedCta}"
- Close with "Have a great day," ONLY — never sign Leyna / Glow Up Agence (signature is added by Gmail).
- Letter style, not telegraphic. No competitor brands. 2–3 short paragraphs.
- Keep {{contact.firstname}} exactly as a template variable.

Return JSON: {"body":"<html or text with <br /> >"}`;
  }

  const toneRules =
    args.tone === "tu"
      ? "Tutoiement strict (tu / te / ton). « J'espère que tu vas bien ? »."
      : "Vouvoiement strict (vous / votre). « J'espère que vous allez bien ? ».";

  return `Rédige une relance BD COMPLÈTE pour Glow Up Agence (agence de talents) à un contact marque.

CONTEXTE
- Marque : ${brand}
- Round : ${args.round} — ${roundHint}
- Objet du mail initial : ${args.previousSubject || "—"}
- Mail initial envoyé${args.firstSentLabel ? ` le ${args.firstSentLabel}` : ""} :
"""
${args.previousBodyText.slice(0, 3500)}
"""

RÈGLES
- Français uniquement. Salutation : Hello {{contact.firstname}},
- ${toneRules}
- Rappelle le pitch multi-talents du mail initial (GARDER les MÊMES créateurs cités — n’en invente pas, ni d’autres marques).
- Quand tu cites un créateur, utilise son NOM COMPLET tel qu’il apparaît dans le mail initial (pour les extralinks Instagram). Préfère le HTML : <a href="https://www.instagram.com/HANDLE"><strong>Prénom Nom</strong></a> si le handle est dans l’original.
- Propose des next steps concrets : media kits, estimations de reach, idées de contenus.
- Termine par ce CTA (ou très proche) : « ${args.suggestedCta} »
- Ferme UNIQUEMENT par « Belle journée, » — JAMAIS signer Leyna / Glow Up Agence (la signature part de Gmail).
- Style lettre humaine, pas télégraphique. Pas de concurrents. 2–3 courts paragraphes.
- Conserve {{contact.firstname}} tel quel (variable template).

JSON : {"body":"<html ou texte avec <br /> >"}`;
}

/**
 * Génère le corps d’une relance Outreach Clients via gpt-4o.
 * Retourne null si échec → l’appelant utilise le template fallback.
 */
export async function generateOutreachRelanceBody(
  input: OutreachRelanceAiInput
): Promise<OutreachRelanceAiResult | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[outreach-relance-ai] OPENAI_API_KEY manquant — skip IA");
    return null;
  }

  try {
    const round: OutreachRelanceAiRound = input.round === 2 ? 2 : 1;
    const brand = (input.company || "").trim();
    const previousBodyText = stripHtmlToText(input.previousBodyHtml)
      .replace(/\{\{\s*contact\.company\s*\}\}/gi, brand || "la marque")
      .replace(/\{\{\s*company\s*\}\}/gi, brand || "la marque");
    const tone = detectTone(previousBodyText, input.language);
    const suggestedCta = pickCta(input.touchId, round, input.language, tone);
    const firstSentLabel = formatSentDate(input.firstSentAt, input.language);

    const prompt = buildPrompt({
      language: input.language,
      tone,
      round,
      company: brand,
      previousSubject: input.previousSubject,
      previousBodyText,
      firstSentLabel,
      suggestedCta,
    });

    const openai = new OpenAI({ apiKey });
    const safePrompt = prompt.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      temperature: round === 2 ? 0.6 : 0.55,
      max_tokens: round === 2 ? 700 : 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            input.language === "en"
              ? `You write COMPLETE BD follow-ups in ENGLISH ONLY for a talent agency client cycle (round ${round}). Hello + hope you're well + remind creators from the original pitch + offer media kits + CTA. Never French. Never sign Leyna. JSON {"body":"..."}.`
              : `Tu rédiges des relances BD COMPLÈTES en FRANÇAIS pour le cycle Outreach Clients (round ${round}). Hello + espoir que ça va + rappel des créateurs du mail initial + offre media kits + CTA. ${tone === "tu" ? "Tutoiement." : "Vouvoiement."} Jamais signer Leyna. JSON {"body":"..."}.`,
        },
        { role: "user", content: safePrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "";
    const extracted = extractJsonBody(raw);
    if (!extracted) {
      console.warn("[outreach-relance-ai] JSON body manquant");
      return null;
    }

    let bodyHtml = postProcess(extracted, input.language, tone, suggestedCta);
    if (!bodyHtml) return null;

    // Extralinks Instagram sur les noms (repris du mail initial).
    bodyHtml = ensureTalentExtralinksInHtml(
      bodyHtml,
      null,
      input.previousBodyHtml
    );

    // Garde-fou langue
    const plainCheck = stripHtmlToText(bodyHtml);
    if (input.language === "en") {
      const frHits = (
        plainCheck.match(
          /\b(Suite à mon mail|je voulais|J['’]espère que|Seriez-vous|Belle journée)\b/gi
        ) || []
      ).length;
      if (frHits >= 2) {
        console.warn(`[outreach-relance-ai] body FR alors que EN (hits=${frHits})`);
        return null;
      }
    }

    console.log(
      `[outreach-relance-ai] touch=${input.touchId} round=${round} lang=${input.language} tone=${tone}`
    );
    return { bodyHtml };
  } catch (e) {
    console.warn(
      "[outreach-relance-ai] échec:",
      e instanceof Error ? e.message : e
    );
    return null;
  }
}
