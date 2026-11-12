import prisma from "@/lib/prisma";

/** Assez pour un pitch, sans gonfler le body JSON xAI (~37k = zone d’échec observée). */
const MAX_EXCERPT_CHARS = 4_000;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
/** Cap pages : un deck long n’a pas besoin de tout le texte. */
const MAX_PAGES = 12;

const excerptCache = new Map<string, { text: string; at: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Nettoie un extrait PDF avant injection prompt / JSON.
 * Les PDF (surtout design) produisent souvent des `\`, `\u` incomplets,
 * null bytes et caractères de contrôle qui font échouer le parse JSON xAI :
 * `unexpected end of hex escape`.
 */
export function sanitizePresentationExcerpt(raw: string): string {
  let s = String(raw || "")
    .replace(/\u00a0/g, " ")
    // Contrôles sauf \n \r \t
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, " ")
    // Backslashes (sources de `\u` / `\x` incomplets côté parseur xAI)
    .replace(/\\/g, "/")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  // Drop surrogates orphelins sans lookbehind (compat runtime).
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s[i] + s[i + 1];
        i++;
      }
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) continue;
    out += s[i];
  }
  s = out;

  if (s.length > MAX_EXCERPT_CHARS) {
    s = `${s.slice(0, MAX_EXCERPT_CHARS)}\n…[extrait PDF tronqué]`;
  }
  return s;
}

async function extractPresentationPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // Next/Turbopack ne résout pas pdf.worker.mjs → mode sans worker.
    if (typeof pdfjs.GlobalWorkerOptions !== "undefined") {
      pdfjs.GlobalWorkerOptions.workerSrc = "";
    }
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableWorker: true,
      isEvalSupported: false,
    }).promise;
    const pageCount = Math.min(doc.numPages, MAX_PAGES);
    const pages: string[] = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const line = (content.items || [])
        .map((it) => ("str" in it && typeof it.str === "string" ? it.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (line) pages.push(line);
    }
    return pages.join("\n\n");
  } catch (e) {
    // PAS de fallback latin1 (binaire PDF) — ça cassait le JSON xAI.
    console.warn("[presentation-text] pdfjs extract failed:", e);
    return "";
  }
}

/**
 * Extrait le texte d’un PDF de présentation projet (S3 / URL publique).
 * Échec silencieux → chaîne vide (la rédaction continue sur le brief).
 */
export async function loadPresentationExcerptFromUrl(
  pdfUrl: string | null | undefined
): Promise<string> {
  const url = String(pdfUrl || "").trim();
  if (!url) return "";

  const cached = excerptCache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.text;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(
        `[presentation-text] fetch PDF échoué (${res.status}) ${url.slice(0, 120)}`
      );
      return "";
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_PDF_BYTES) {
      console.warn(
        `[presentation-text] PDF vide ou trop lourd (${buf.length} octets)`
      );
      return "";
    }
    const raw = await extractPresentationPdfText(buf);
    const text = sanitizePresentationExcerpt(raw);
    if (!text) {
      console.warn(
        "[presentation-text] aucun texte extractible (PDF scanné / image ?)"
      );
      return "";
    }
    excerptCache.set(url, { text, at: Date.now() });
    return text;
  } catch (e) {
    console.warn("[presentation-text] extract failed:", e);
    return "";
  }
}

/** Charge l’extrait PDF d’une campagne projets-outreach. */
export async function loadCampaignPresentationExcerpt(
  campaignId: string | null | undefined
): Promise<string> {
  const id = String(campaignId || "").trim();
  if (!id) return "";
  try {
    const campaign = await prisma.talentProspectingCampaign.findUnique({
      where: { id },
      select: { presentationPdfUrl: true },
    });
    return loadPresentationExcerptFromUrl(campaign?.presentationPdfUrl);
  } catch (e) {
    console.warn("[presentation-text] campaign load failed:", e);
    return "";
  }
}
