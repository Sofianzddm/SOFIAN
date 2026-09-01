export type PrimeLigneType =
  | "RECRUTEMENT_TALENT"
  | "PREMIERE_COLLAB"
  | "PREMIERE_SIGNATURE_TALENT"
  | "RETRAIT_COLLABORATION"
  | "AUTRE";

export type PrimeLigne = {
  id: string;
  type: PrimeLigneType;
  description: string;
  talentNom?: string;
  montant: number;
};

export const PRIME_TYPE_LABELS: Record<PrimeLigneType, string> = {
  RECRUTEMENT_TALENT: "Recrutement talent",
  PREMIERE_COLLAB: "Première collaboration (500 €)",
  PREMIERE_SIGNATURE_TALENT: "Première signature talent",
  RETRAIT_COLLABORATION: "Retrait collaboration",
  AUTRE: "Autre",
};

export const PRIME_TYPE_OPTIONS: { value: PrimeLigneType; label: string }[] = [
  { value: "RECRUTEMENT_TALENT", label: PRIME_TYPE_LABELS.RECRUTEMENT_TALENT },
  { value: "PREMIERE_COLLAB", label: PRIME_TYPE_LABELS.PREMIERE_COLLAB },
  { value: "PREMIERE_SIGNATURE_TALENT", label: PRIME_TYPE_LABELS.PREMIERE_SIGNATURE_TALENT },
  { value: "RETRAIT_COLLABORATION", label: PRIME_TYPE_LABELS.RETRAIT_COLLABORATION },
  { value: "AUTRE", label: PRIME_TYPE_LABELS.AUTRE },
];

export function isPrimeLigneType(value: unknown): value is PrimeLigneType {
  return (
    value === "RECRUTEMENT_TALENT" ||
    value === "PREMIERE_COLLAB" ||
    value === "PREMIERE_SIGNATURE_TALENT" ||
    value === "RETRAIT_COLLABORATION" ||
    value === "AUTRE"
  );
}

export function isRetraitPrimeType(type: PrimeLigneType): boolean {
  return type === "RETRAIT_COLLABORATION";
}

/** Pour un retrait, le montant est toujours stocké en négatif. */
export function normalizePrimeMontant(type: PrimeLigneType, amount: number): number {
  const rounded = Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100;
  if (isRetraitPrimeType(type)) {
    return rounded === 0 ? 0 : -Math.abs(rounded);
  }
  return rounded;
}

function parseAmount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(/\s+/g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function parsePrimeLignes(input: unknown): PrimeLigne[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const type = r.type;
      const id = typeof r.id === "string" ? r.id.trim() : "";
      const description = typeof r.description === "string" ? r.description.trim() : "";
      const talentNom =
        typeof r.talentNom === "string" && r.talentNom.trim() ? r.talentNom.trim() : undefined;
      const amountRaw = parseAmount(r.montant);
      if (!id || !description || !isPrimeLigneType(type)) return null;
      const montant = normalizePrimeMontant(type, amountRaw);
      return { id, type, description, talentNom, montant } as PrimeLigne;
    })
    .filter((v): v is PrimeLigne => Boolean(v));
}

export function totalLignes(lignes: PrimeLigne[]): number {
  return Math.round(lignes.reduce((sum, l) => sum + (Number.isFinite(l.montant) ? l.montant : 0), 0) * 100) / 100;
}

export function euro(value: number): string {
  return `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} €`;
}
