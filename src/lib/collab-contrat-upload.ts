// Helpers pour le flux « upload PDF → builder DocuSeal → multi-signataires »
// du contrat collab (même moteur que les contrats fiche talent).

export type ContratSignataire = {
  name: string;
  email: string;
  role: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseContratSignataires(raw: unknown): ContratSignataire[] {
  if (!Array.isArray(raw)) return [];
  const out: ContratSignataire[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const email = typeof r.email === "string" ? r.email.trim() : "";
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const role =
      (typeof r.role === "string" && r.role.trim()) || `Signataire ${i + 1}`;
    if (!email || !EMAIL_RE.test(email)) continue;
    out.push({
      email,
      name: name || email.split("@")[0] || `Signataire ${i + 1}`,
      role,
    });
  }
  return out;
}

/** Déduplique par email (insensible à la casse), conserve l'ordre. */
export function dedupeSignatairesByEmail(
  signataires: ContratSignataire[]
): ContratSignataire[] {
  const seen = new Set<string>();
  const out: ContratSignataire[] = [];
  for (const s of signataires) {
    const key = s.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function validateSignatairesInput(
  raw: unknown
): { ok: true; signataires: ContratSignataire[] } | { ok: false; error: string } {
  const parsed = dedupeSignatairesByEmail(parseContratSignataires(raw));
  if (parsed.length === 0) {
    return {
      ok: false,
      error: "Ajoutez au moins un signataire avec une adresse email valide",
    };
  }
  if (parsed.length > 10) {
    return { ok: false, error: "Maximum 10 signataires" };
  }
  // Réattribue des rôles stables Signataire 1..N (DocuSeal)
  const signataires = parsed.map((s, i) => ({
    ...s,
    role: `Signataire ${i + 1}`,
  }));
  return { ok: true, signataires };
}
