/**
 * Analyse des bulletins de salaire Glow Up.
 *
 * Format machine en-tête (extrait de Bulletins_MM_YYYY.pdf) :
 *   GLOWUP##BULLETIN##MM-YYYY##matricule##NOM##Prenom##SIRET
 *
 * + OCR Claude pour Acquis / Pris / Solde (CP, RTT) et montants.
 */

import Anthropic from "@anthropic-ai/sdk";

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

export type PayslipExtract = {
  periodMonth: number;
  periodYear: number;
  matricule: string;
  nom: string | null;
  prenom: string | null;
  siret: string | null;
  rawHeader: string | null;
  cpAcquis: number | null;
  cpPris: number | null;
  cpSolde: number | null;
  rttAcquis: number | null;
  rttPris: number | null;
  rttSolde: number | null;
  grossSalary: number | null;
  netPay: number | null;
  source: "header" | "ocr" | "header+ocr";
  analyseLe: string;
};

const HEADER_RE =
  /GLOWUP##BULLETIN##(\d{2})-(\d{4})##(\d+)##([^#\n]+)##([^#\n]+)##(\d+)/gi;

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.round(v * 100) / 100;
  }
  if (typeof v === "string") {
    const cleaned = v
      .replace(/\s/g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  return null;
}

/** Texte PDF via pdfjs (streams compressés Silae / Glow Up). */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
    }).promise;
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map((it) => ("str" in it ? String(it.str) : ""))
        .join(" ");
      parts.push(line);
    }
    return parts.join("\n");
  } catch (e) {
    console.warn("extractPdfText:", e);
    return buffer.toString("latin1");
  }
}

/** Parse les en-têtes GLOWUP##BULLETIN## depuis un texte déjà extrait. */
export function parseGlowupBulletinHeadersFromText(
  text: string
): PayslipExtract[] {
  // pdfjs peut coller des espaces : "AYAD   ZEDDAM" — OK pour le regex
  const normalized = text.replace(/\u00a0/g, " ");
  const out: PayslipExtract[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  HEADER_RE.lastIndex = 0;
  while ((m = HEADER_RE.exec(normalized)) !== null) {
    const periodMonth = Number(m[1]);
    const periodYear = Number(m[2]);
    const matricule = m[3];
    const key = `${normalizeMatricule(matricule)}-${periodYear}-${periodMonth}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      periodMonth,
      periodYear,
      matricule,
      nom: m[4].replace(/\s+/g, " ").trim() || null,
      prenom: m[5].replace(/\s+/g, " ").trim() || null,
      siret: m[6].trim() || null,
      rawHeader: m[0].replace(/\s+/g, " ").trim(),
      cpAcquis: null,
      cpPris: null,
      cpSolde: null,
      rttAcquis: null,
      rttPris: null,
      rttSolde: null,
      grossSalary: null,
      netPay: null,
      source: "header",
      analyseLe: new Date().toISOString(),
    });
  }
  return out;
}

/** Heuristique : Net payé / Salaire brut dans le texte. */
function enrichFromPlainText(
  extract: PayslipExtract,
  text: string
): PayslipExtract {
  const net =
    text.match(/Net\s+pay[eé]\s*:?\s*([\d\s]+[.,]\d{2})\s*euros?/i) ||
    text.match(/Net\s+pay[eé]\s+([\d\s]+[.,]\d{2})/i);
  const brut = text.match(/Salaire\s+brut\s+([\d\s]+[.,]\d{2})/i);
  return {
    ...extract,
    netPay: extract.netPay ?? toNum(net?.[1] ?? null),
    grossSalary: extract.grossSalary ?? toNum(brut?.[1] ?? null),
  };
}

export async function parseGlowupBulletinHeaders(
  buffer: Buffer
): Promise<PayslipExtract[]> {
  const text = await extractPdfText(buffer);
  return parseGlowupBulletinHeadersFromText(text).map((e) =>
    enrichFromPlainText(e, text)
  );
}

const OCR_PROMPT = `Tu analyses un ou plusieurs bulletins de salaire français (Glow Up Agency / Silae-like).

Extrais pour CHAQUE salarié présent dans le document un objet JSON.
Réponds UNIQUEMENT avec un JSON : { "bulletins": [ ... ] }

Chaque élément :
{
  "matricule": "string (ex 00004)",
  "periodMonth": number 1-12,
  "periodYear": number,
  "nom": "string ou null",
  "prenom": "string ou null",
  "cpAcquis": number|null,   // jours CP acquis (compteur Acquis)
  "cpPris": number|null,     // jours CP pris
  "cpSolde": number|null,    // jours CP solde restant
  "rttAcquis": number|null,
  "rttPris": number|null,
  "rttSolde": number|null,
  "grossSalary": number|null, // Salaire brut du mois
  "netPay": number|null       // Net payé
}

Règles :
- Les jours sont des nombres (ex 12.5). Pas de texte.
- Si la section Acquis/Pris/Solde est pour les CP, remplis cp*.
- Si RTT distincts, remplis rtt*.
- Si illisible → null. N'invente rien.
- Matricule : garde les zéros (00004).`;

function parseOcrList(raw: string): Array<Record<string, unknown>> {
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      bulletins?: unknown;
    };
    return Array.isArray(parsed.bulletins)
      ? (parsed.bulletins as Array<Record<string, unknown>>)
      : [];
  } catch {
    return [];
  }
}

function rowToExtract(
  row: Record<string, unknown>,
  fallback?: Partial<PayslipExtract>
): PayslipExtract | null {
  const matricule =
    (typeof row.matricule === "string" && row.matricule.trim()) ||
    fallback?.matricule;
  if (!matricule) return null;
  const periodMonth =
    Number(row.periodMonth) || fallback?.periodMonth || 0;
  const periodYear = Number(row.periodYear) || fallback?.periodYear || 0;
  if (periodMonth < 1 || periodMonth > 12 || periodYear < 2020) return null;

  return {
    periodMonth,
    periodYear,
    matricule: String(matricule).trim(),
    nom:
      (typeof row.nom === "string" && row.nom.trim()) ||
      fallback?.nom ||
      null,
    prenom:
      (typeof row.prenom === "string" && row.prenom.trim()) ||
      fallback?.prenom ||
      null,
    siret: fallback?.siret || null,
    rawHeader: fallback?.rawHeader || null,
    cpAcquis: toNum(row.cpAcquis),
    cpPris: toNum(row.cpPris),
    cpSolde: toNum(row.cpSolde),
    rttAcquis: toNum(row.rttAcquis),
    rttPris: toNum(row.rttPris),
    rttSolde: toNum(row.rttSolde),
    grossSalary: toNum(row.grossSalary),
    netPay: toNum(row.netPay),
    source: fallback?.rawHeader ? "header+ocr" : "ocr",
    analyseLe: new Date().toISOString(),
  };
}

/** OCR Claude sur le PDF (compteurs CP / RTT + montants). */
export async function ocrPayslipPdf(
  buffer: Buffer
): Promise<PayslipExtract[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document" as const,
              source: {
                type: "base64" as const,
                media_type: "application/pdf" as const,
                data: buffer.toString("base64"),
              },
            },
            { type: "text" as const, text: OCR_PROMPT },
          ],
        },
      ],
    });
    const text =
      message.content[0]?.type === "text" ? message.content[0].text : "";
    return parseOcrList(text)
      .map((row) => rowToExtract(row))
      .filter((x): x is PayslipExtract => !!x);
  } catch (e) {
    console.error("OCR bulletin paie:", e);
    return [];
  }
}

/**
 * Combine en-têtes machine + OCR.
 * Priorité identité = header ; soldes = OCR si présents.
 */
export async function analyzePayslipPdf(
  buffer: Buffer
): Promise<PayslipExtract[]> {
  const headers = await parseGlowupBulletinHeaders(buffer);
  const ocr = await ocrPayslipPdf(buffer);

  if (!headers.length && !ocr.length) return [];
  if (!headers.length) return ocr;
  if (!ocr.length) return headers;

  const byMat = new Map<string, PayslipExtract>();
  for (const h of headers) {
    byMat.set(normalizeMatricule(h.matricule), { ...h });
  }
  for (const o of ocr) {
    const key = normalizeMatricule(o.matricule);
    const base = byMat.get(key);
    if (!base) {
      byMat.set(key, o);
      continue;
    }
    byMat.set(key, {
      ...base,
      cpAcquis: o.cpAcquis ?? base.cpAcquis,
      cpPris: o.cpPris ?? base.cpPris,
      cpSolde: o.cpSolde ?? base.cpSolde,
      rttAcquis: o.rttAcquis ?? base.rttAcquis,
      rttPris: o.rttPris ?? base.rttPris,
      rttSolde: o.rttSolde ?? base.rttSolde,
      grossSalary: o.grossSalary ?? base.grossSalary,
      netPay: o.netPay ?? base.netPay,
      source: "header+ocr",
      analyseLe: o.analyseLe,
    });
  }
  return [...byMat.values()];
}

/** Normalise 00004 / 4 pour matching. */
export function normalizeMatricule(m: string): string {
  const t = String(m || "").trim();
  const stripped = t.replace(/^0+/, "");
  return stripped || "0";
}

export function matriculesMatch(a: string, b: string): boolean {
  return normalizeMatricule(a) === normalizeMatricule(b);
}
