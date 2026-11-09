import { xaiResponse } from "@/lib/xai";
import {
  ensureGiftParagraphs,
  scrubCringeCtas,
  scrubFalseFollowUpOpeners,
  scrubHeyOpeners,
  scrubMarketingFluff,
  scrubVouvoiementLeaks,
  stripGiftAiSignOff,
} from "@/lib/gifts/contact-marque-ai-scrub";
import { normalizeContactLanguage } from "@/lib/gifts/contact-language";

function tryParseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const jsonSlice =
    trimmed.includes("{") && trimmed.includes("}")
      ? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1)
      : trimmed;
  const candidates = [
    trimmed,
    jsonSlice,
    trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
  ];
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* next */
    }
  }
  return {};
}

/**
 * Relance gift J+2 — même esprit que casting-relance-ai (lettre complète IA),
 * sans Leyna / stats casting. Tutoiement FR ou English selon la fiche contact.
 */
export async function generateGiftRelanceBody(opts: {
  language?: "fr" | "en" | null;
  marqueNom: string;
  talentName: string;
  amName: string;
  contactPrenom?: string | null;
  previousSubject?: string | null;
  previousBodyText?: string | null;
  giftReference?: string | null;
  typeGiftLabel?: string | null;
  conceptSnippet?: string | null;
}): Promise<{ subject: string; bodyText: string }> {
  if (!process.env.XAI_API_KEY?.trim()) {
    throw new Error("Clé XAI_API_KEY non configurée");
  }

  const language = normalizeContactLanguage(opts.language);
  const isEn = language === "en";
  const prenom = (opts.contactPrenom || "").trim();
  const prevSubject = (opts.previousSubject || "").trim();
  const prevBody = (opts.previousBodyText || "").trim().slice(0, 1800);
  const concept = (opts.conceptSnippet || "").trim().slice(0, 400);
  const typeLabel = (opts.typeGiftLabel || "gift").trim();

  const prompt = isEn
    ? `You are an Account Manager at Glow Up Agence. Write a COMPLETE follow-up email (round 1, ~2 business days after silence) about a gift proposal.

Language: ENGLISH ONLY. Never French.
Brand: ${opts.marqueNom}
Talent (subject of the mail, NOT the sender): ${opts.talentName}
AM sender (do NOT sign in body): ${opts.amName}
Contact first name: ${prenom || "(unknown)"}

STRUCTURE:
1) Hello ${prenom || "there"}, — NEVER "Hey"
2) Exactly: Hope you're well?
3) Short follow-up on the previous gift proposal for ${opts.marqueNom}
4) Remind who ${opts.talentName} is + the gift ask (type: ${typeLabel}) without inventing formats (stories/reels/TikTok)
5) One concrete value angle for the brand
6) Clean CTA (availability / details) — no "does this ring a bell?"
7) NO signature name / agency / "Best regards" — template + Gmail handle that

RULES:
- Language MUST match contact language (ENGLISH ONLY here). Never French.
- They did NOT reply → never "still", "as you may still be interested", "circling back again".
- Do NOT invent prior conversations beyond the previous email below.
- Plain text with blank-line paragraphs (\\n\\n). No glued wall of text. No HTML.
- No marketing fluff: showcase, scenography, immersive, statement…
- Min ~350 chars outside greeting.

Previous subject: ${prevSubject || "(n/a)"}
Previous body:
${prevBody || "(n/a)"}
Gift concept snippet: ${concept || "(n/a)"}
Reference: ${opts.giftReference || "(n/a)"}

Reply ONLY JSON: {"subject":"...","body":"..."}
Subject should be Re: … if previous subject exists.`
    : `Tu es Account Manager chez Glow Up Agence. Tu écris une RELANCE COMPLÈTE (round 1, ~2 jours ouvrés après silence) sur une proposition de gift.

Langue: FRANÇAIS — TUTOIEMENT STRICT (tu / te / ton). JAMAIS vous / votre / vos.
Marque: ${opts.marqueNom}
Talent (sujet du mail, PAS l'expéditeur): ${opts.talentName}
AM (ne PAS signer dans le body): ${opts.amName}
Prénom contact: ${prenom || "(inconnu)"}

STRUCTURE:
1) Bonjour ${prenom || ""}, — JAMAIS « Hey » / « Salut » / « Coucou »
2) Exactement: J'espère que tu vas bien ?
3) Suite courte au mail gift pour ${opts.marqueNom}
4) Rappel qui est ${opts.talentName} + la demande gift (type: ${typeLabel}) SANS inventer de formats (stories/reels/TikTok)
5) Un angle de valeur pour la marque
6) CTA pro (dispo / détails) — PAS « ça te parle ? »
7) PAS de signature / prénom / agence / « Belle journée » — le template + Gmail s'en chargent

RÈGLES:
- Langue = FRANÇAIS tutoiement (fiche contact FR). JAMAIS d'anglais.
- Pas de réponse → jamais « toujours », « encore », « si jamais ça t'intéresse encore ».
- N'invente pas d'échange hors du mail précédent ci-dessous.
- Texte brut avec paragraphes séparés par \\n\\n. INTERDIT un pavé collé. Pas de HTML.
- INTERDIT jargon : scénographie, showcase, statement, immersif…
- Min ~350 caractères hors salut.

Sujet précédent: ${prevSubject || "(n/a)"}
Corps précédent:
${prevBody || "(n/a)"}
Concept gift: ${concept || "(n/a)"}
Réf: ${opts.giftReference || "(n/a)"}

Réponds UNIQUEMENT en JSON: {"subject":"...","body":"..."}
Sujet = Re: … si un sujet précédent existe.`;

  const raw = await xaiResponse(prompt, {
    model: "grok-4.20-0309-non-reasoning",
    timeoutMs: 70_000,
  });
  const o = tryParseJsonObject(raw);
  let subject = String(o.subject || "").trim();
  let body = String(o.body || "").trim();
  if (!subject || !body) throw new Error("Relance IA vide");

  if (!/^re\s*:/i.test(subject)) {
    subject = prevSubject
      ? prevSubject.toLowerCase().startsWith("re:")
        ? prevSubject
        : `Re: ${prevSubject}`
      : isEn
        ? `Re: Gift proposal — ${opts.talentName} × ${opts.marqueNom}`
        : `Re: Proposition gift — ${opts.talentName} × ${opts.marqueNom}`;
  }

  body = stripGiftAiSignOff(body, {
    talentName: opts.talentName,
    amName: opts.amName,
  });
  body = scrubFalseFollowUpOpeners(body);
  body = scrubHeyOpeners(body, language);
  body = scrubCringeCtas(body);
  body = scrubMarketingFluff(body);
  if (!isEn) body = scrubVouvoiementLeaks(body);
  body = ensureGiftParagraphs(body);

  return { subject, bodyText: body };
}

/** Fallback court si l'IA échoue. */
export function buildGiftRelanceFallback(opts: {
  language?: "fr" | "en" | null;
  marqueNom: string;
  talentName: string;
  contactPrenom?: string | null;
  previousSubject?: string | null;
}): { subject: string; bodyText: string } {
  const isEn = normalizeContactLanguage(opts.language) === "en";
  const prenom = (opts.contactPrenom || "").trim();
  const prev = (opts.previousSubject || "").trim();
  const subject = prev
    ? prev.toLowerCase().startsWith("re:")
      ? prev
      : `Re: ${prev}`
    : isEn
      ? `Re: Gift proposal — ${opts.talentName} × ${opts.marqueNom}`
      : `Re: Proposition gift — ${opts.talentName} × ${opts.marqueNom}`;

  const bodyText = isEn
    ? [
        prenom ? `Hello ${prenom},` : "Hello,",
        "",
        "Hope you're well?",
        "",
        `Just following up on my note about a gift collaboration with ${opts.talentName} for ${opts.marqueNom}.`,
        "",
        "Would you be open to a quick exchange if useful?",
      ].join("\n\n")
    : [
        prenom ? `Bonjour ${prenom},` : "Bonjour,",
        "",
        "J'espère que tu vas bien ?",
        "",
        `Je me permets de te relancer concernant la proposition de gift pour ${opts.talentName} auprès de ${opts.marqueNom}.`,
        "",
        "Est-ce que tu serais dispo pour en discuter rapidement ?",
      ].join("\n\n");

  return { subject, bodyText: ensureGiftParagraphs(bodyText) };
}
