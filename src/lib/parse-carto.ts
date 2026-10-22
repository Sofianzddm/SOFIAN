/**
 * Parse d’une cartographie (Excel collé / TSV / CSV).
 * Gère le format enrichissement (Prénom + Nom) et le format PJ
 * (colonne unique « Nom », Rôle, Équipe / Périmètre, Marque(s) gérée(s), etc.).
 */

export type CartoParsedRow = {
  priorite: string;
  prenom: string;
  nom: string;
  poste: string;
  perimetre: string;
  localisation: string;
  linkedinUrl: string;
  email: string;
  note: string;
  telephone: string;
  marquesGerees: string;
  marche: string;
  /** Nom d’hôtel / établissement (import bulk prestataires). */
  hotel: string;
  /** Ville de l’établissement (import bulk). */
  ville: string;
  source: "CARTO" | "AO";
};

export function splitFullName(full: string): { prenom: string; nom: string } {
  const cleaned = full.replace(/\s+/g, " ").trim();
  if (!cleaned) return { prenom: "", nom: "" };
  const parts = cleaned.split(" ");
  if (parts.length === 1) return { prenom: parts[0], nom: "" };
  return { prenom: parts[0], nom: parts.slice(1).join(" ") };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Les `.includes("linkedin"|…)` ne doivent matcher que des libellés d’en-tête
 * courts. Une note « Profil LinkedIn… », un périmètre « établissement du
 * budget », ou une URL `linkedin.com/in/…` (souvent ≤ 48 car.) pris pour une
 * 2ᵉ ligne d’en-tête → prénom/nom vides à l’import enrichissement.
 */
const HEADER_LABEL_MAX = 48;

/** Ligne de contact (pas un en-tête) : priorité P1/P2, URL, email. */
function looksLikeDataRow(cells: string[]): boolean {
  return cells.some((raw) => {
    const t = raw.trim();
    if (!t) return false;
    if (/https?:\/\//i.test(t) || /linkedin\.com\//i.test(t)) return true;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return true;
    const n = norm(t);
    // P1, P2 ⭐, P1 🔥, P3 •
    if (/^p[1-5]\b/.test(n)) return true;
    return false;
  });
}

function isHotelHeaderLabel(c: string): boolean {
  return (
    c === "hotel" ||
    c === "hotels" ||
    c.startsWith("hotel") ||
    c === "etablissement" ||
    c.startsWith("etablissement") ||
    /\bnom\b.*\betablissement\b/.test(c) ||
    c === "prestataire" ||
    c === "maison" ||
    c === "enseigne" ||
    c === "nom hotel" ||
    c === "nom de l hotel" ||
    c === "nom de l'hotel" ||
    c === "nom etablissement" ||
    c === "traiteur" ||
    c === "fleuriste" ||
    c === "decorateur" ||
    c === "studio" ||
    c === "institut" ||
    c === "societe" ||
    c === "société" ||
    c === "transporteur"
  );
}

function mapHeader(cells: string[]): Record<string, number> | null {
  const cols: Record<string, number> = {};
  cells.forEach((raw, idx) => {
    const c = norm(raw);
    if (!c) return;
    const short = c.length <= HEADER_LABEL_MAX;
    if (c === "prenom" || c === "firstname" || c === "first name") {
      cols.prenom = idx;
    } else if (short && isHotelHeaderLabel(c)) {
      if (cols.hotel === undefined) cols.hotel = idx;
    } else if (
      c === "nom" ||
      c.startsWith("nom ") ||
      c === "lastname" ||
      c === "last name" ||
      c === "fullname" ||
      c === "full name" ||
      c === "name" ||
      c === "contact" ||
      c === "personne" ||
      c === "interlocuteur"
    ) {
      if (cols.nom === undefined) cols.nom = idx;
    } else if (short && c.startsWith("prior")) {
      cols.priorite = idx;
    } else if (
      short &&
      c.includes("linkedin") &&
      !c.includes("http") &&
      !c.includes("linkedin.com")
    ) {
      cols.linkedinUrl = idx;
    } else if (
      c === "email" ||
      c === "e-mail" ||
      c === "mail" ||
      c.startsWith("email") ||
      c.startsWith("e-mail") ||
      c === "adresse email" ||
      c === "adresse mail"
    ) {
      cols.email = idx;
    } else if (short && (c.includes("role") || c === "poste" || c === "titre")) {
      cols.poste = idx;
    } else if (
      short &&
      (c === "telephone" ||
        c === "tel" ||
        c === "phone" ||
        c === "mobile" ||
        c.includes("telephone"))
    ) {
      cols.telephone = idx;
    } else if (short && (c.includes("equipe") || c.includes("perim"))) {
      cols.perimetre = idx;
    } else if (short && c.includes("marque")) {
      cols.marquesGerees = idx;
    } else if (c === "ville" || c === "city" || c === "town") {
      cols.ville = idx;
    } else if (short && (c.includes("marche") || c === "market")) {
      cols.marche = idx;
    } else if (short && c.startsWith("local")) {
      cols.localisation = idx;
    } else if (c === "note" || c === "notes" || c === "commentaire" || c === "comment") {
      cols.note = idx;
    } else if (short && (c === "lieu" || c === "restaurant")) {
      if (cols.hotel === undefined) cols.hotel = idx;
    }
  });
  if (cols.nom === undefined && cols.prenom === undefined && cols.hotel === undefined) {
    return null;
  }
  if (Object.keys(cols).length < 2 && cols.hotel === undefined) return null;
  return cols;
}

/**
 * Parse un tableau collé depuis Excel / Google Sheets (TSV) ou un CSV.
 * Détecte la ligne d’en-tête et propose le nom de la maison depuis le titre
 * au-dessus du tableau (« Chanel — Top Contacts »).
 */
export function parseCartoText(text: string): {
  rows: CartoParsedRow[];
  suggestedCompany: string;
  error: string | null;
} {
  const lines = text.split(/\r?\n/);
  const splitLine = (line: string): string[] =>
    line.includes("\t") ? line.split("\t") : line.split(";");

  const headers: { idx: number; cols: Record<string, number> }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    // Ne jamais promouvoir une ligne de contact (P1, URL LinkedIn…) en en-tête.
    if (looksLikeDataRow(cells)) continue;
    const mapped = mapHeader(cells);
    if (mapped) headers.push({ idx: i, cols: mapped });
  }

  if (headers.length === 0) {
    return {
      rows: [],
      suggestedCompany: "",
      error:
        "Impossible de trouver la ligne d’en-tête (colonnes « Hôtel », « Nom » ou « Prénom »). Colle le tableau avec ses titres de colonnes.",
    };
  }

  let suggestedCompany = "";
  for (let i = 0; i < headers[0].idx; i++) {
    const first = splitLine(lines[i])[0]?.trim();
    if (first) {
      suggestedCompany = first.split(/—|–|-{2,}/)[0].trim();
      break;
    }
  }

  const rows: CartoParsedRow[] = [];
  const seen = new Set<string>();

  for (let h = 0; h < headers.length; h++) {
    const cols = headers[h].cols;
    const start = headers[h].idx + 1;
    const end = h + 1 < headers.length ? headers[h + 1].idx : lines.length;
    const cell = (cells: string[], key: string): string =>
      cols[key] !== undefined ? (cells[cols[key]] || "").trim() : "";
    const fullNameMode = cols.prenom === undefined && cols.nom !== undefined;

    for (let i = start; i < end; i++) {
      const cells = splitLine(lines[i]);
      let prenom = cell(cells, "prenom");
      let nom = cell(cells, "nom");
      if (fullNameMode) {
        const split = splitFullName(nom);
        prenom = split.prenom;
        nom = split.nom;
      }
      const email = cell(cells, "email");
      const poste = cell(cells, "poste");
      const telephone = cell(cells, "telephone");
      const perimetre = cell(cells, "perimetre");
      const localisation = cell(cells, "localisation");
      const linkedinUrl = cell(cells, "linkedinUrl");
      const note = cell(cells, "note");
      const marquesGerees = cell(cells, "marquesGerees");
      const marche = cell(cells, "marche");
      const priorite = cell(cells, "priorite");
      const hotel = cell(cells, "hotel") || marquesGerees;
      const ville = cell(cells, "ville") || localisation;
      // Sans identité (prénom/nom ou hôtel), une URL LinkedIn seule crée des
      // fantômes « email à noter » dans l’aperçu enrichissement.
      if (!prenom && !nom && !hotel) {
        continue;
      }
      const key = [
        hotel.toLowerCase(),
        prenom.toLowerCase(),
        nom.toLowerCase(),
        email.toLowerCase(),
        linkedinUrl.toLowerCase(),
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        priorite,
        prenom,
        nom,
        poste,
        perimetre,
        localisation,
        linkedinUrl,
        email,
        note,
        telephone,
        marquesGerees,
        marche,
        hotel,
        ville,
        source: "CARTO",
      });
    }
  }

  return {
    rows,
    suggestedCompany,
    error: rows.length === 0 ? "Aucune ligne trouvée sous la ligne d’en-tête." : null,
  };
}
