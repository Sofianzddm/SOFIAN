/**
 * Contact client (marque / agence) à exposer à la juriste pour un échange direct.
 * Priorité : contact confirmé à l’upload, puis négo, puis contacts CRM de la marque.
 */

export type ContratMarqueClientContact = {
  nom: string | null;
  email: string | null;
  telephone: string | null;
  poste: string | null;
  /** Origine affichée côté UI. */
  source: "COLLAB" | "NEGOCIATION" | "MARQUE_CONTACT";
};

type CollabContact = {
  contratMarqueContactNom?: string | null;
  contratMarqueContactEmail?: string | null;
  contratMarqueContactTelephone?: string | null;
};

type NegoContact = {
  contactMarque?: string | null;
  emailContact?: string | null;
};

type MarqueContactLite = {
  prenom?: string | null;
  nom: string;
  email?: string | null;
  telephone?: string | null;
  poste?: string | null;
  principal?: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidContratMarqueContactEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export type ParsedContratMarqueContactInput = {
  nom: string;
  email: string;
  telephone: string | null;
};

/** Parse + valide le contact envoyé à l’upload (nom + email obligatoires). */
export function parseContratMarqueContactInput(input: {
  nom?: string | null;
  email?: string | null;
  telephone?: string | null;
}): { ok: true; value: ParsedContratMarqueContactInput } | { ok: false; error: string } {
  const nom = input.nom?.trim() ?? "";
  const email = input.email?.trim() ?? "";
  const telephone = input.telephone?.trim() || null;
  if (!nom) {
    return { ok: false, error: "Le nom du contact client est requis." };
  }
  if (!email) {
    return { ok: false, error: "L’email du contact client est requis." };
  }
  if (!isValidContratMarqueContactEmail(email)) {
    return { ok: false, error: "L’email du contact client est invalide." };
  }
  return { ok: true, value: { nom, email, telephone } };
}

export function hasStoredContratMarqueClientContact(collab: CollabContact): boolean {
  const nom = collab.contratMarqueContactNom?.trim() ?? "";
  const email = collab.contratMarqueContactEmail?.trim() ?? "";
  return Boolean(nom && email && isValidContratMarqueContactEmail(email));
}

function formatMarqueContactName(c: MarqueContactLite): string {
  return [c.prenom?.trim(), c.nom.trim()].filter(Boolean).join(" ").trim();
}

export function resolveContratMarqueClientContact(input: {
  collaboration?: CollabContact | null;
  negociation?: NegoContact | null;
  marqueContacts?: MarqueContactLite[] | null;
}): ContratMarqueClientContact | null {
  const collab = input.collaboration;
  const collabNom = collab?.contratMarqueContactNom?.trim() || null;
  const collabEmail = collab?.contratMarqueContactEmail?.trim() || null;
  const collabTel = collab?.contratMarqueContactTelephone?.trim() || null;
  if (collabNom || collabEmail) {
    return {
      nom: collabNom,
      email: collabEmail,
      telephone: collabTel,
      poste: null,
      source: "COLLAB",
    };
  }

  const nego = input.negociation;
  const negoNom = nego?.contactMarque?.trim() || null;
  const negoEmail = nego?.emailContact?.trim() || null;
  if (negoNom || negoEmail) {
    return {
      nom: negoNom,
      email: negoEmail,
      telephone: null,
      poste: null,
      source: "NEGOCIATION",
    };
  }

  const contacts = input.marqueContacts ?? [];
  if (contacts.length === 0) return null;

  const withEmail = contacts.filter((c) => Boolean(c.email?.trim()));
  const pool = withEmail.length > 0 ? withEmail : contacts;
  const principal = pool.find((c) => c.principal) ?? pool[0];
  if (!principal) return null;

  const nom = formatMarqueContactName(principal) || null;
  const email = principal.email?.trim() || null;
  const telephone = principal.telephone?.trim() || null;
  const poste = principal.poste?.trim() || null;
  if (!nom && !email && !telephone) return null;

  return {
    nom,
    email,
    telephone,
    poste,
    source: "MARQUE_CONTACT",
  };
}
