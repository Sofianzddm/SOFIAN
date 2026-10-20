/**
 * Email / nom du signataire « Agence » pour DocuSeal (contrats talent, collab, hub).
 * Canonique + normalisation des typos de domaine pour éviter les envois vers
 * des adresses inexistantes (ex. contrat@gloupagence.fr).
 */

export const CANONICAL_AGENCE_SIGNATURE_EMAIL = "contrat@glowupagence.fr";
export const GLOWUP_EMAIL_DOMAIN = "glowupagence.fr";

/** Domaines mal orthographiés → glowupagence.fr */
const DOMAIN_TYPO_FIXES: Record<string, string> = {
  "gloupagence.fr": GLOWUP_EMAIL_DOMAIN,
  "glowupagency.fr": GLOWUP_EMAIL_DOMAIN,
  "glowup-agence.fr": GLOWUP_EMAIL_DOMAIN,
  "glowupagence.com": GLOWUP_EMAIL_DOMAIN,
};

export function normalizeGlowupEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const fixedDomain = DOMAIN_TYPO_FIXES[domain] || domain;
  return `${local}@${fixedDomain}`;
}

/**
 * Résout un email agence (body UI / env) vers une adresse sûre.
 * Corrige les typos de domaine et force contrat@ → canonique.
 */
export function resolveAgenceSignatureEmail(raw?: string | null): string {
  const source = (raw ?? "").trim()
    || process.env.AGENCE_SIGNATURE_EMAIL?.trim()
    || process.env.NEXT_PUBLIC_AGENCE_EMAIL?.trim()
    || CANONICAL_AGENCE_SIGNATURE_EMAIL;
  const normalized = normalizeGlowupEmail(source);

  // Boîte contrat@ (même avec typo domaine) → canonique
  if (normalized.startsWith("contrat@")) {
    return CANONICAL_AGENCE_SIGNATURE_EMAIL;
  }

  if (normalized.endsWith(`@${GLOWUP_EMAIL_DOMAIN}`) && normalized.includes("@")) {
    return normalized;
  }

  console.warn(
    `[agence-signature] email invalide "${source}", fallback ${CANONICAL_AGENCE_SIGNATURE_EMAIL}`
  );
  return CANONICAL_AGENCE_SIGNATURE_EMAIL;
}

/** Email agence pour signature — toujours une adresse @glowupagence.fr valide. */
export function getAgenceSignatureEmail(): string {
  return resolveAgenceSignatureEmail();
}

export function getAgenceSignatureName(): string {
  return process.env.NEXT_PUBLIC_AGENCE_NOM?.trim() || "Glow Up Agence";
}

export function isAgenceSubmitter(opts: {
  role?: string | null;
  email?: string | null;
  agenceEmail?: string;
}): boolean {
  const role = (opts.role || "").trim().toLowerCase();
  if (role === "agence") return true;

  const email = normalizeGlowupEmail(opts.email || "");
  if (!email) return false;

  const expected = normalizeGlowupEmail(
    opts.agenceEmail || getAgenceSignatureEmail()
  );
  return email === expected || email.startsWith("contrat@");
}

const DOCUSEAL_SUBMITTERS = "https://api.docuseal.com/submitters";

/**
 * Si DocuSeal a enregistré un mauvais email (typo builder / template),
 * le corrige avant l'envoi Resend.
 */
export async function ensureDocuSealSubmitterEmail(opts: {
  apiKey: string;
  submitterId: number;
  expectedEmail: string;
  expectedName?: string;
  currentEmail?: string | null;
}): Promise<{ fixed: boolean; email: string }> {
  const expected = normalizeGlowupEmail(opts.expectedEmail);
  const current = normalizeGlowupEmail(opts.currentEmail || "");
  if (current === expected) {
    return { fixed: false, email: expected };
  }

  console.warn(
    `[agence-signature] correction DocuSeal submitter ${opts.submitterId}: "${opts.currentEmail}" → "${expected}"`
  );

  const res = await fetch(`${DOCUSEAL_SUBMITTERS}/${opts.submitterId}`, {
    method: "PUT",
    headers: {
      "X-Auth-Token": opts.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: expected,
      ...(opts.expectedName ? { name: opts.expectedName } : {}),
      send_email: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(
      `[agence-signature] échec correction submitter ${opts.submitterId}:`,
      res.status,
      errText
    );
    // On continue quand même avec l'email attendu pour Resend
    return { fixed: false, email: expected };
  }

  return { fixed: true, email: expected };
}
