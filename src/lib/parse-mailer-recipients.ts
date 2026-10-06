/**
 * Parse d'une liste de destinataires pour le rédacteur de mails (style Streak).
 * CSV / TSV / texte collé : Email + Prénom / Nom + auto-détection
 * de la colonne « nom de boîte » / établissement.
 */

import { worksheetToTsv } from "@/lib/carto-excel";
import { splitFullName } from "@/lib/parse-carto";

export type MailerRecipientRow = {
  email: string;
  name: string;
  /** Nom d'établissement / boîte (import → CRM Prestataires). */
  hotel: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** En-têtes qui désignent clairement l'établissement / la boîte. */
function hotelHeaderScore(c: string): number {
  if (!c) return 0;

  // Match exact / très fort
  const exact = new Set([
    "hotel",
    "hotels",
    "nom de boite",
    "nom boite",
    "boite",
    "boite mail", // rare
    "etablissement",
    "nom etablissement",
    "enseigne",
    "maison",
    "prestataire",
    "traiteur",
    "fleuriste",
    "decorateur",
    "studio",
    "institut",
    "societe",
    "lieu",
    "restaurant",
    "venue",
    "property",
    "company",
    "entreprise",
    "marque",
    "brand",
    "account",
    "client",
    "transporteur",
    "nom hotel",
    "nom de l hotel",
    "nom de l'hotel",
    "hotel name",
    "company name",
    "nom societe",
    "nom de la societe",
    "nom de la boite",
    "nom de la marque",
  ]);
  if (exact.has(c)) return 100;

  // Préfixes / inclusions
  if (c.startsWith("hotel")) return 95;
  if (c.includes("etablissement")) return 90;
  if (c.includes("boite")) return 90;
  if (c.includes("enseigne")) return 85;
  if (c.includes("prestataire")) return 85;
  if (c.includes("entreprise") || c.includes("company") || c.includes("societe"))
    return 80;
  if (c.includes("traiteur") || c.includes("fleuriste") || c.includes("decorateur"))
    return 80;
  if (c.includes("studio") || c.includes("institut") || c.includes("restaurant"))
    return 75;
  if (c.includes("marque") || c.includes("brand") || c === "lieu") return 70;
  if (c.includes("venue") || c.includes("property")) return 70;
  if (c.startsWith("nom de ") && !c.includes("contact") && !c.includes("personne"))
    return 65;

  return 0;
}

function isPersonHeader(c: string): boolean {
  return (
    c === "prenom" ||
    c === "firstname" ||
    c === "first name" ||
    c === "first" ||
    c === "nom" ||
    c === "lastname" ||
    c === "last name" ||
    c === "last" ||
    c === "fullname" ||
    c === "full name" ||
    c === "name" ||
    c === "nom complet" ||
    c === "contact" ||
    c === "destinataire" ||
    c === "personne" ||
    c === "interlocuteur" ||
    c === "poste" ||
    c === "role" ||
    c === "titre" ||
    c === "job" ||
    c === "title"
  );
}

function isEmailHeader(c: string): boolean {
  return (
    c === "email" ||
    c === "e-mail" ||
    c === "mail" ||
    c.startsWith("email") ||
    c.startsWith("e-mail") ||
    c === "adresse email" ||
    c === "adresse mail" ||
    c === "courriel"
  );
}

function isSkipHeader(c: string): boolean {
  return (
    c.includes("ville") ||
    c.includes("city") ||
    c.includes("telephone") ||
    c === "tel" ||
    c === "phone" ||
    c === "mobile" ||
    c.includes("linkedin") ||
    c.includes("url") ||
    c.includes("lien") ||
    c.includes("note") ||
    c.includes("comment") ||
    c.includes("prior") ||
    c.includes("statut") ||
    c.includes("status") ||
    c.includes("date") ||
    c.includes("adresse") ||
    c.includes("address") ||
    c.includes("cp") ||
    c.includes("postal") ||
    c.includes("pays") ||
    c.includes("country") ||
    c.includes("marche") ||
    c.includes("market")
  );
}

function detectDelimiter(sampleLines: string[]): string {
  const candidates = ["\t", ";", ","] as const;
  let best: string = ",";
  let bestScore = -1;
  for (const d of candidates) {
    let score = 0;
    for (const line of sampleLines) {
      if (!line.trim()) continue;
      score += line.split(d).length - 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Découpe une ligne CSV en tenant compte des guillemets. */
function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

type MappedCols = {
  email?: number;
  prenom?: number;
  nom?: number;
  hotel?: number;
  /** Libellé brut de la colonne boîte détectée (pour toast UI). */
  hotelHeaderLabel?: string;
};

function mapHeader(cells: string[]): MappedCols | null {
  const cols: MappedCols = {};
  let bestHotelScore = 0;
  let bestHotelIdx = -1;
  let bestHotelLabel = "";

  cells.forEach((raw, idx) => {
    const c = norm(raw);
    if (!c) return;

    const hScore = hotelHeaderScore(c);
    if (hScore > bestHotelScore) {
      bestHotelScore = hScore;
      bestHotelIdx = idx;
      bestHotelLabel = raw.trim();
    }

    if (isEmailHeader(c)) {
      if (cols.email === undefined) cols.email = idx;
      return;
    }
    if (c === "prenom" || c === "firstname" || c === "first name" || c === "first") {
      if (cols.prenom === undefined) cols.prenom = idx;
      return;
    }
    // « Nom » personne : seulement si ce n'est PAS une colonne boîte
    if (
      hScore === 0 &&
      (c === "nom" ||
        c === "lastname" ||
        c === "last name" ||
        c === "last" ||
        c === "fullname" ||
        c === "full name" ||
        c === "name" ||
        c === "nom complet" ||
        c === "contact" ||
        c === "destinataire" ||
        c === "personne" ||
        c === "interlocuteur")
    ) {
      if (cols.nom === undefined) cols.nom = idx;
    }
  });

  if (cols.email === undefined) return null;

  if (bestHotelScore > 0 && bestHotelIdx >= 0) {
    cols.hotel = bestHotelIdx;
    cols.hotelHeaderLabel = bestHotelLabel;
  } else {
    // Fallback : 1re colonne non email / non personne / non technique
    for (let idx = 0; idx < cells.length; idx++) {
      const raw = cells[idx]?.trim() || "";
      const c = norm(raw);
      if (!c) continue;
      if (idx === cols.email || idx === cols.prenom || idx === cols.nom) continue;
      if (isEmailHeader(c) || isPersonHeader(c) || isSkipHeader(c)) continue;
      cols.hotel = idx;
      cols.hotelHeaderLabel = raw;
      break;
    }
  }

  return cols;
}

/**
 * Parse un texte CSV/TSV (avec en-têtes) en destinataires email + nom + hôtel.
 */
export function parseMailerRecipientsText(text: string): {
  rows: MailerRecipientRow[];
  skipped: number;
  error: string | null;
  /** Colonne boîte auto-détectée (libellé brut). */
  hotelColumn: string | null;
} {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], skipped: 0, error: "Fichier vide.", hotelColumn: null };
  }

  const delimiter = detectDelimiter(lines.slice(0, Math.min(5, lines.length)));
  const split = (line: string) => splitCsvLine(line, delimiter);

  let headerIdx = -1;
  let cols: MappedCols | null = null;
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const mapped = mapHeader(split(lines[i]));
    if (mapped) {
      headerIdx = i;
      cols = mapped;
      break;
    }
  }

  // Pas d'en-tête : chaque ligne non vide = une adresse email.
  if (!cols || headerIdx < 0) {
    const rows: MailerRecipientRow[] = [];
    const seen = new Set<string>();
    let skipped = 0;
    for (const line of lines) {
      const emailMatch = line.match(/[^\s,;<]+@[^\s,;>]+/);
      const email = (emailMatch?.[0] || "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        skipped += 1;
        continue;
      }
      if (seen.has(email)) {
        skipped += 1;
        continue;
      }
      seen.add(email);
      const before = line
        .slice(0, line.indexOf(emailMatch![0]))
        .replace(/[<\s,;"]+$/g, "")
        .trim();
      rows.push({ email, name: before, hotel: "" });
    }
    if (rows.length === 0) {
      return {
        rows: [],
        skipped,
        error:
          "Aucune adresse email trouvée. Ajoute une colonne « Email » (et idéalement « Prénom » / « Nom »).",
        hotelColumn: null,
      };
    }
    return { rows, skipped, error: null, hotelColumn: null };
  }

  const rows: MailerRecipientRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  const hotelColumn = cols.hotelHeaderLabel || null;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = split(lines[i]);
    const email = (cells[cols.email!] || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      if (cells.some((c) => c.trim())) skipped += 1;
      continue;
    }
    if (seen.has(email)) {
      skipped += 1;
      continue;
    }
    seen.add(email);

    let prenom = cols.prenom !== undefined ? (cells[cols.prenom] || "").trim() : "";
    let nom = cols.nom !== undefined ? (cells[cols.nom] || "").trim() : "";
    if (!prenom && nom && cols.prenom === undefined) {
      const splitName = splitFullName(nom);
      prenom = splitName.prenom;
      nom = splitName.nom;
    }
    const name = [prenom, nom].filter(Boolean).join(" ").trim();
    const hotel =
      cols.hotel !== undefined ? (cells[cols.hotel] || "").trim() : "";
    rows.push({ email, name, hotel });
  }

  if (rows.length === 0) {
    return {
      rows: [],
      skipped,
      error: "Aucune ligne avec une adresse email valide dans le fichier.",
      hotelColumn: null,
    };
  }

  return { rows, skipped, error: null, hotelColumn };
}

/** Lit un .xlsx / .csv / .tsv / .txt et renvoie les destinataires. */
export async function parseMailerRecipientsFile(file: File): Promise<{
  rows: MailerRecipientRow[];
  skipped: number;
  error: string | null;
  truncated: boolean;
  hotelColumn: string | null;
}> {
  let text: string;
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return {
        rows: [],
        skipped: 0,
        error: "Le fichier Excel ne contient aucune feuille.",
        truncated: false,
        hotelColumn: null,
      };
    }
    text = worksheetToTsv(sheet);
  } else if (/\.(xls|numbers)$/i.test(file.name)) {
    return {
      rows: [],
      skipped: 0,
      error: "Format non géré — enregistre le fichier en .xlsx ou .csv.",
      truncated: false,
      hotelColumn: null,
    };
  } else {
    text = await file.text();
  }

  const parsed = parseMailerRecipientsText(text);
  return { ...parsed, truncated: false };
}
