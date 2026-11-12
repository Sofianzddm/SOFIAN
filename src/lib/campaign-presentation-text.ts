import prisma from "@/lib/prisma";
import { extractPdfText } from "@/lib/rh/payslip-analyse";

/** Limite prompt : assez pour un deck, sans exploser les tokens. */
const MAX_EXCERPT_CHARS = 12_000;
const MAX_PDF_BYTES = 20 * 1024 * 1024;

const excerptCache = new Map<string, { text: string; at: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

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
    const raw = (await extractPdfText(buf)).replace(/\u00a0/g, " ").trim();
    if (!raw) return "";
    const text =
      raw.length > MAX_EXCERPT_CHARS
        ? `${raw.slice(0, MAX_EXCERPT_CHARS)}\n…[extrait PDF tronqué]`
        : raw;
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
