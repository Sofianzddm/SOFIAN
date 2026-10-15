/**
 * Analyse des bulletins de salaire Glow Up.
 *
 * Format machine en-tête (extrait de Bulletins_MM_YYYY.pdf) :
 *   GLOWUP##BULLETIN##MM-YYYY##matricule##NOM##Prenom##SIRET
 *
 * Compteurs Silae (bas de page) — texte PDF reconstitué par lignes :
 *   Congés N-1 Congés N [Jours RTT]
 *   Acquis 25.00 4.17 [5.93]
 *   Pris 9.00
 *   Solde 16.00 4.17 [5.93]
 *
 * + OCR Claude en secours si le texte PDF ne contient pas les compteurs.
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
  source: "header" | "ocr" | "header+ocr" | "header+text";
  analyseLe: string;
};

export type LeaveCounters = {
  cpAcquis: number | null;
  cpPris: number | null;
  cpSolde: number | null;
  rttAcquis: number | null;
  rttPris: number | null;
  rttSolde: number | null;
};

const HEADER_RE =
  /GLOWUP##BULLETIN##(\d{2})-(\d{4})##(\d+)##([^#\n]+)##([^#\n]+)##(\d+)/gi;

const EMPTY_COUNTERS: LeaveCounters = {
  cpAcquis: null,
  cpPris: null,
  cpSolde: null,
  rttAcquis: null,
  rttPris: null,
  rttSolde: null,
};

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

function sumNums(nums: Array<number | null | undefined>): number | null {
  const ok = nums.filter((n): n is number => n != null && Number.isFinite(n));
  if (!ok.length) return null;
  return Math.round(ok.reduce((a, b) => a + b, 0) * 100) / 100;
}

/** Jours type 25.00 / 4,17 — ignore dates compactes type 060726. */
function dayNumsInLine(line: string): number[] {
  const matches = line.match(/\b\d{1,3}[.,]\d{2}\b/g) || [];
  return matches
    .map((m) => toNum(m))
    .filter((n): n is number => n != null);
}

/**
 * Reconstitue le texte PDF ligne par ligne (tri Y puis X).
 * Le join plat de pdfjs mélange les cellules du tableau Congés et perd les soldes.
 */
export function linesFromPdfTextContent(content: {
  items: Array<unknown>;
}): string[] {
  const items = content.items
    .filter((it): it is { str: string; transform: number[] } => {
      if (!it || typeof it !== "object") return false;
      const o = it as { str?: unknown; transform?: unknown };
      return typeof o.str === "string" && Array.isArray(o.transform);
    })
    .map((it) => ({
      str: it.str,
      x: it.transform[4] ?? 0,
      y: Math.round(it.transform[5] ?? 0),
    }))
    .filter((it) => it.str.trim().length > 0);

  const byY = new Map<number, typeof items>();
  for (const it of items) {
    const list = byY.get(it.y) || [];
    list.push(it);
    byY.set(it.y, list);
  }

  return [...byY.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, arr]) =>
      arr
        .sort((a, b) => a.x - b.x)
        .map((x) => x.str)
        .join(" ")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
}

/** Parse le tableau Silae Congés N-1 / Congés N [/ RTT]. */
export function parseLeaveCountersFromText(text: string): LeaveCounters {
  const lines = text
    .split(/\n/)
    .map((l) => l.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let headerIdx = lines.findIndex(
    (l) => /Cong[eé]s\s*N-1/i.test(l) && /Cong[eé]s\s*N\b/i.test(l)
  );
  let hasRttCol = false;

  if (headerIdx >= 0) {
    hasRttCol = /RTT/i.test(lines[headerIdx]!);
  } else {
    // Pas d’en-tête « Congés N-1 » (souvent compteurs vides) — tenter Acquis + chiffres
    headerIdx = lines.findIndex(
      (l) => /^Acquis\b/i.test(l) && /\d{1,3}[.,]\d{2}/.test(l)
    );
    if (headerIdx < 0) return { ...EMPTY_COUNTERS };
    hasRttCol = false;
  }

  const window = lines.slice(headerIdx, headerIdx + 8);
  const acquisLine = window.find((l) => /^Acquis\b/i.test(l));
  const prisLine = window.find((l) => /^Pris\b/i.test(l));
  const soldeLine = window.find((l) => /^Solde\b/i.test(l));

  const splitCpRtt = (nums: number[]) => {
    if (!nums.length) {
      return { cp: [] as number[], rtt: null as number | null };
    }
    if (hasRttCol && nums.length >= 3) {
      return {
        cp: nums.slice(0, 2),
        rtt: nums[nums.length - 1] ?? null,
      };
    }
    if (hasRttCol && nums.length === 1) {
      // Ambigu : une seule colonne remplie — on attribue aux CP N-1
      return { cp: [nums[0]!], rtt: null };
    }
    return { cp: nums.slice(0, 2), rtt: null as number | null };
  };

  const a = splitCpRtt(dayNumsInLine(acquisLine || ""));
  const p = splitCpRtt(dayNumsInLine(prisLine || ""));
  const s = splitCpRtt(dayNumsInLine(soldeLine || ""));

  return {
    cpAcquis: sumNums(a.cp),
    cpPris: sumNums(p.cp),
    cpSolde: sumNums(s.cp),
    rttAcquis: a.rtt,
    rttPris: p.rtt,
    rttSolde: s.rtt ?? (hasRttCol ? a.rtt : null),
  };
}

function countersHaveAny(c: LeaveCounters): boolean {
  return (
    c.cpAcquis != null ||
    c.cpPris != null ||
    c.cpSolde != null ||
    c.rttAcquis != null ||
    c.rttPris != null ||
    c.rttSolde != null
  );
}

/** Texte PDF via pdfjs — lignes reconstituées (streams compressés Silae / Glow Up). */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pages = await extractPdfPagesText(buffer);
  return pages.join("\n\n");
}

/** Une chaîne par page PDF (utile pour multi-bulletins). */
export async function extractPdfPagesText(buffer: Buffer): Promise<string[]> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
    }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(linesFromPdfTextContent(content).join("\n"));
    }
    return pages;
  } catch (e) {
    console.warn("extractPdfText:", e);
    return [buffer.toString("latin1")];
  }
}

/** Parse les en-têtes GLOWUP##BULLETIN## depuis un texte déjà extrait. */
export function parseGlowupBulletinHeadersFromText(
  text: string
): PayslipExtract[] {
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

/** Heuristique : Net payé / Salaire brut + compteurs CP/RTT. */
function enrichFromPlainText(
  extract: PayslipExtract,
  text: string
): PayslipExtract {
  const net =
    text.match(/Net\s+pay[eé]\s*:?\s*([\d\s]+[.,]\d{2})\s*euros?/i) ||
    text.match(/Net\s+pay[eé]\s+([\d\s]+[.,]\d{2})/i);
  const brut = text.match(/Salaire\s+brut\s+([\d\s]+[.,]\d{2})/i);
  const counters = parseLeaveCountersFromText(text);
  const hasCounters = countersHaveAny(counters);
  return {
    ...extract,
    netPay: extract.netPay ?? toNum(net?.[1] ?? null),
    grossSalary: extract.grossSalary ?? toNum(brut?.[1] ?? null),
    cpAcquis: extract.cpAcquis ?? counters.cpAcquis,
    cpPris: extract.cpPris ?? counters.cpPris,
    cpSolde: extract.cpSolde ?? counters.cpSolde,
    rttAcquis: extract.rttAcquis ?? counters.rttAcquis,
    rttPris: extract.rttPris ?? counters.rttPris,
    rttSolde: extract.rttSolde ?? counters.rttSolde,
    source: hasCounters ? "header+text" : extract.source,
  };
}

export async function parseGlowupBulletinHeaders(
  buffer: Buffer
): Promise<PayslipExtract[]> {
  const pages = await extractPdfPagesText(buffer);
  const out: PayslipExtract[] = [];
  const seen = new Set<string>();

  for (const pageText of pages) {
    const headers = parseGlowupBulletinHeadersFromText(pageText);
    if (headers.length) {
      for (const h of headers) {
        const key = `${normalizeMatricule(h.matricule)}-${h.periodYear}-${h.periodMonth}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(enrichFromPlainText(h, pageText));
      }
    } else if (pages.length === 1) {
      // Une page sans header machine : on enrichira plus bas via OCR
    }
  }

  // Fallback : tout le document d’un coup (header + compteurs)
  if (!out.length) {
    const full = pages.join("\n\n");
    return parseGlowupBulletinHeadersFromText(full).map((e) =>
      enrichFromPlainText(e, full)
    );
  }
  return out;
}

const OCR_PROMPT = `Tu analyses un ou plusieurs bulletins de salaire français (Glow Up Agency / Silae).

Extrais pour CHAQUE salarié présent dans le document un objet JSON.
Réponds UNIQUEMENT avec un JSON : { "bulletins": [ ... ] }

Chaque élément :
{
  "matricule": "string (ex 00004)",
  "periodMonth": number 1-12,
  "periodYear": number,
  "nom": "string ou null",
  "prenom": "string ou null",
  "cpAcquis": number|null,
  "cpPris": number|null,
  "cpSolde": number|null,
  "rttAcquis": number|null,
  "rttPris": number|null,
  "rttSolde": number|null,
  "grossSalary": number|null,
  "netPay": number|null
}

Règles importantes — tableau bas de page Silae :
- Colonnes typiques : « Congés N-1 », « Congés N », parfois « Jours RTT ».
- Lignes : Acquis / Pris / Solde.
- cpAcquis / cpPris / cpSolde = SOMME des colonnes Congés N-1 + Congés N (ex. Solde 16.00 et 4.17 → cpSolde=20.17).
- rtt* = colonne RTT si présente.
- Les jours sont des nombres (ex 12.5). Pas de texte.
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
  buffer: Buffer,
  hintText?: string
): Promise<PayslipExtract[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const hint =
      hintText && hintText.trim().length > 40
        ? `\n\nTexte PDF déjà extrait (aide) :\n${hintText.slice(0, 6000)}`
        : "";
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
            { type: "text" as const, text: OCR_PROMPT + hint },
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
 * Combine en-têtes machine + texte Silae (+ OCR si soldes manquants).
 * Priorité identité = header ; soldes = texte PDF puis OCR.
 */
export async function analyzePayslipPdf(
  buffer: Buffer
): Promise<PayslipExtract[]> {
  const pages = await extractPdfPagesText(buffer);
  const fullText = pages.join("\n\n");
  const headers = await parseGlowupBulletinHeaders(buffer);

  const needsOcr =
    !headers.length ||
    headers.some(
      (h) =>
        h.cpSolde == null &&
        h.cpAcquis == null &&
        h.cpPris == null &&
        h.rttSolde == null
    );

  const ocr = needsOcr ? await ocrPayslipPdf(buffer, fullText) : [];

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
      cpAcquis: base.cpAcquis ?? o.cpAcquis,
      cpPris: base.cpPris ?? o.cpPris,
      cpSolde: base.cpSolde ?? o.cpSolde,
      rttAcquis: base.rttAcquis ?? o.rttAcquis,
      rttPris: base.rttPris ?? o.rttPris,
      rttSolde: base.rttSolde ?? o.rttSolde,
      grossSalary: base.grossSalary ?? o.grossSalary,
      netPay: base.netPay ?? o.netPay,
      source:
        base.cpSolde != null || base.cpAcquis != null
          ? base.source
          : "header+ocr",
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
