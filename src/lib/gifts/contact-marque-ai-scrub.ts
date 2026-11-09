/** Helpers de nettoyage des drafts gift IA (fichier séparé = HMR Turbopack safe). */

export function giftBodyLooksComplete(body: string): boolean {
  const text = body.replace(/\s+/g, " ").trim();
  const withoutGreeting = text
    .replace(/^(?:Hey|Hello|Coucou|Bonjour|Salut)[^,]*,?\s*/i, "")
    .trim();
  if (withoutGreeting.length < 280) return false;
  // Au moins 2 vrais paragraphes (sinon « tout collé »)
  const paras = body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paras.length >= 3;
}

/**
 * Si le modèle a collé tout en un pavé, découpe après les phrases
 * (garde les \n\n déjà présents).
 */
export function ensureGiftParagraphs(body: string): string {
  let text = body.replace(/\r\n/g, "\n").trim();
  const existing = text.split(/\n\s*\n+/).filter((p) => p.trim());
  if (existing.length >= 3) {
    return existing.join("\n\n").trim();
  }

  // Accroche sur sa propre ligne si « Hey X, » collé au reste
  text = text.replace(
    /^(Hey|Hello|Coucou|Bonjour|Salut)(\s+[^,\n]+)?,\s+/i,
    (_, hi: string, name: string | undefined) =>
      `${hi}${name || ""},\n\n`
  );

  // Découpe sur fin de phrase + majuscule (évite un seul mur)
  const sentences = text
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+(?=[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ«"])/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length < 3) {
    return text.replace(/\n{3,}/g, "\n\n").trim();
  }

  // Groupe : 1) salut 2) 2-3 phrases 3) 1-2 4) reste… ~4-6 blocs
  const chunks: string[] = [];
  let i = 0;
  if (/^(Hey|Hello|Coucou|Bonjour|Salut)\b/i.test(sentences[0])) {
    chunks.push(sentences[0]);
    i = 1;
  }
  const sizes = [2, 2, 2, 3, 2];
  for (const size of sizes) {
    if (i >= sentences.length) break;
    chunks.push(sentences.slice(i, i + size).join(" "));
    i += size;
  }
  if (i < sentences.length) {
    chunks.push(sentences.slice(i).join(" "));
  }
  return chunks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Retire le jargon marketing / anglicismes cringe (scénographie, showcase…).
 * Coupe la phrase entière si elle ne tient que sur ce jargon.
 */
export function scrubMarketingFluff(body: string): string {
  let text = body.replace(/\r\n/g, "\n");

  // Phrases entières typiques
  text = text.replace(
    /[^.!?\n]*\b(?:sc[ée]nographie\s+totale|v[ée]ritable\s+showcase|showcase\s+de\s+ta\s+collection|univers\s+(?:forts?|immersifs?|coh[ée]rents?)|refuge\s+joyeux|duo\s+ultra\s+attachant)[^.!?\n]*[.!?]?/gi,
    ""
  );

  // Anglicismes / buzzwords isolés → reformulation soft ou suppression
  const wordReps: Array<[RegExp, string]> = [
    [/\bshowcase\b/gi, "mise en avant"],
    [/\bstatement\b/gi, "pièce forte"],
    [/\bsc[ée]nographie\b/gi, "déco"],
    [/\bimmersi(?:f|ve|fs|ves)\b/gi, "chaleureux"],
    [/\bultra\s+attachant\b/gi, "attachant"],
    [/\bparentalit[ée]\s+moderne\s+et\s+inspirante\b/gi, "jeune maman"],
    [/\bun\s+v[ée]ritable\s+univers\b/gi, "une ambiance"],
    [/\btransformera?\s+sa\s+boutique\s+en\s+v[ée]ritable[^.!?\n]*/gi, "habillera sa boutique"],
  ];
  for (const [re, to] of wordReps) {
    text = text.replace(re, to);
  }

  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(/ +\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/,\s*,/g, ",");
  text = text.replace(/\.\s*\./g, ".");
  return text.trim();
}

/**
 * Interdit « Hey » : remplace par Hello (EN) ou Bonjour (FR).
 * `language` force la cible ; sinon heuristique légère.
 */
export function scrubHeyOpeners(
  body: string,
  language?: "fr" | "en" | null
): string {
  let text = body.replace(/\r\n/g, "\n");
  const isEn =
    language === "en" ||
    (language !== "fr" &&
      /^(hey|hello)\b/i.test(text.trim()) &&
      !/\b(bonjour|salut|je\s+te|est-ce\s+que)\b/i.test(text.slice(0, 400)));
  const hi = isEn ? "Hello" : "Bonjour";
  text = text.replace(/^(Hey|HEY|hey)(\s+[^,\n]+)?(\s*,)/m, `${hi}$2$3`);
  text = text.replace(/\n(Hey|HEY|hey)(\s+[^,\n]+)?(\s*,)/g, `\n${hi}$2$3`);
  return text;
}

/** Réécrit les accroches de fausse relance sans vider le mail. */
export function scrubFalseFollowUpOpeners(body: string): string {
  let text = body.replace(/\r\n/g, "\n").trim();
  text = text.replace(
    /\bje\s+reviens\s+vers\s+toi\s+(?:avec|pour|sur)\b/gi,
    "Je te contacte pour"
  );
  text = text.replace(
    /\bje\s+reviens\s+vers\s+toi\b/gi,
    "Je me permets de te contacter"
  );
  text = text.replace(
    /\bsuite\s+[àa]\s+(?:notre|ton|mon)\s+(?:échange|mail|dernier\s+message|conversation)\b[^.!?\n]*[.!?]?\s*/gi,
    ""
  );
  text = text.replace(/\bcomme\s+convenu\b[^.!?\n]*[.!?]?\s*/gi, "");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/** Corrige les fuites de vouvoiement (mélange tu/vous). */
export function scrubVouvoiementLeaks(body: string): string {
  let text = body;
  const reps: Array<[RegExp, string]> = [
    [/\bvous\s+incarnez\b/gi, "tu incarnes"],
    [/\bvous\s+représentez\b/gi, "tu représentes"],
    [/\bvous\s+proposez\b/gi, "tu proposes"],
    [/\bvous\s+avez\b/gi, "tu as"],
    [/\bvous\s+êtes\b/gi, "tu es"],
    [/\bvous\s+pouvez\b/gi, "tu peux"],
    [/\bvous\s+souhaitez\b/gi, "tu souhaites"],
    [/\bvous\s+travaillez\b/gi, "tu travailles"],
    [/\bvous\s+offrez\b/gi, "tu offres"],
    [/\bvotre\b/gi, "ton"],
    [/\bvos\b/gi, "tes"],
    [/\bvôtre\b/gi, "tien"],
    [/\bvous\b/gi, "tu"],
  ];
  for (const [re, to] of reps) {
    text = text.replace(re, to);
  }
  text = text.replace(/\bton collection\b/gi, "ta collection");
  text = text.replace(/\bton collections\b/gi, "tes collections");
  text = text.replace(
    /\bton nouvelles collections\b/gi,
    "tes nouvelles collections"
  );
  return text;
}

/** Retire les promesses de formats inventées (stories/reels/TikTok). */
export function scrubInventedContentPromises(
  body: string,
  contrepartie: string | null
): string {
  const allowed = (contrepartie || "").toLowerCase();
  const hasExplicit =
    allowed.includes("story") ||
    allowed.includes("reel") ||
    allowed.includes("tiktok") ||
    allowed.includes("post") ||
    allowed.includes("mention");
  if (hasExplicit) return body;

  let text = body.replace(/\r\n/g, "\n");
  text = text.replace(
    /\s*\((?:[^)]*\b(?:stories?|reels?|tiktoks?|posts?|feed|unboxing|haul)\b[^)]*)\)/gi,
    ""
  );
  text = text.replace(
    /\b(?:stories?|reels?|tiktoks?(?:\s+long(?:ue)?(?:\s+format)?)?|posts?\s+feed|unboxings?|hauls?)\b/gi,
    ""
  );
  // Ne PAS collapser les \n (sinon le mail devient un pavé unique)
  text = text.replace(/[^\S\n]{2,}/g, " ");
  text = text.replace(/\s+,/g, ",");
  text = text.replace(/,\s*,+/g, ",");
  text = text.replace(/\(\s*\)/g, "");
  text = text.replace(/[^\S\n]+\./g, ".");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/** Retire les CTA trop casual (« ça te parle ? », etc.). */
export function scrubCringeCtas(body: string): string {
  let text = body.replace(/\r\n/g, "\n").trim();
  text = text.replace(
    /\n+[^\n]*(?:ça\s+te\s+parle|si\s+ça\s+te\s+parle|dis[- ]moi\s+si\s+ça\s+te\s+parle)[^\n]*$/gi,
    ""
  );
  text = text.replace(
    /\n+[^\n]*(?:tu\s+kiffes|on\s+en\s+parle\s+quand\s+tu\s+veux)[^\n]*$/gi,
    ""
  );
  text = text.replace(
    /\s*(?:Dis[- ]moi\s+si\s+)?ça\s+te\s+parle\s*\??/gi,
    ""
  );
  return text.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
}

/** Signature en fin de mail uniquement (pas le prénom talent au milieu). */
export function stripGiftAiSignOff(
  body: string,
  names: { talentName: string; amName: string }
): string {
  let text = body.replace(/\r\n/g, "\n").trim();
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  text = text.replace(
    /\n+(?:bien\s+[àa]\s+toi|belle\s+journ[ée]e(?:\s+[àa]\s+toi)?|bonne\s+journ[ée]e(?:\s+[àa]\s+toi)?|cordialement|amicalement|à\s+tr[èe]s\s+vite)[^\n]*\s*$/i,
    ""
  );
  text = text.replace(
    /\n+(?:—|-)?\s*(?:glow\s*up(?:\s+agence)?|account\s*manager)[^\n]*\s*$/i,
    ""
  );

  const endNames = [
    names.talentName.trim(),
    ...names.talentName.split(/\s+/).filter((p) => p.length >= 4),
    names.amName.trim(),
  ].filter(Boolean);
  for (const name of endNames) {
    text = text.replace(
      new RegExp(`\\n+(?:—|-)?\\s*${escape(name)}\\s*$`, "i"),
      ""
    );
  }
  return text.trim();
}
