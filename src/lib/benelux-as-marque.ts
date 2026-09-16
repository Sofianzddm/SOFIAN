/**
 * Normalise une BeneluxCompany vers la forme MarqueDetail attendue par
 * MarqueRecordPage — même UI CRM FR / BENELUX.
 * Si une marque FR est liée, collabs / facturation / CA viennent de là.
 */

export type LinkedMarqueCrm = {
  id: string;
  nom: string;
  raisonSociale: string | null;
  formeJuridique: string | null;
  siret: string | null;
  numeroTVA: string | null;
  adresseRue: string | null;
  adresseComplement: string | null;
  codePostal: string | null;
  ville: string | null;
  pays: string | null;
  delaiPaiement: number | null;
  modePaiement: string | null;
  devise: string | null;
  collaborations: Array<{
    id: string;
    reference: string;
    typeContenu: string;
    // Prisma Decimal | number selon le client
    montantBrut: unknown;
    statut: string;
    talent: { prenom: string; nom: string };
  }>;
  _count: { collaborations: number };
};

export type BeneluxCompanyRaw = {
  id: string;
  nom: string;
  secteur: string | null;
  siteWeb: string | null;
  ville: string | null;
  notes: string | null;
  createdAt: string | Date;
  linkedMarqueId?: string | null;
  contacts: Array<{
    id: string;
    prenom: string;
    nom: string | null;
    email: string | null;
    poste: string | null;
    language: string;
    principal: boolean;
    source: string | null;
    perimetre: string | null;
    localisation: string | null;
    priorite: string | null;
    linkedinUrl: string | null;
    outreachExcluded: boolean;
    emailLookupStatus?: string | null;
    emailSuggested?: string | null;
    outreachTargets: Array<{
      id: string;
      status: string;
      cycleCount: number;
      lastSentAt: string | Date | null;
      nextRecontactAt: string | Date | null;
      lastRepliedAt: string | Date | null;
    }>;
  }>;
  _count?: { contacts: number; outreachTargets: number };
};

function iso(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  return typeof d === "string" ? d : d.toISOString();
}

function money(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  if (v && typeof v === "object" && "toNumber" in v && typeof (v as { toNumber: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v) || 0;
}

export function beneluxCompanyToMarqueDetail(
  company: BeneluxCompanyRaw,
  linked?: LinkedMarqueCrm | null
) {
  const collaborations = (linked?.collaborations || []).map((c) => ({
    id: c.id,
    reference: c.reference,
    typeContenu: c.typeContenu,
    montantBrut: money(c.montantBrut),
    statut: c.statut,
    talent: c.talent,
  }));

  return {
    id: company.id,
    nom: company.nom,
    secteur: company.secteur,
    siteWeb: company.siteWeb,
    notes: company.notes,
    raisonSociale: linked?.raisonSociale ?? null,
    formeJuridique: linked?.formeJuridique ?? null,
    siret: linked?.siret ?? null,
    numeroTVA: linked?.numeroTVA ?? null,
    adresseRue: linked?.adresseRue ?? null,
    adresseComplement: linked?.adresseComplement ?? null,
    codePostal: linked?.codePostal ?? null,
    ville: linked?.ville ?? company.ville,
    pays: linked?.pays ?? "BENELUX",
    delaiPaiement: linked?.delaiPaiement ?? 30,
    modePaiement: linked?.modePaiement ?? "Virement",
    devise: linked?.devise ?? "EUR",
    createdAt:
      typeof company.createdAt === "string"
        ? company.createdAt
        : company.createdAt.toISOString(),
    contacts: company.contacts.map((c) => ({
      id: c.id,
      prenom: c.prenom,
      nom: c.nom || c.prenom || "Contact",
      email: c.email,
      telephone: null,
      poste: c.poste,
      principal: c.principal,
      language: c.language,
      priorite: c.priorite,
      perimetre: c.perimetre,
      localisation: c.localisation,
      linkedinUrl: c.linkedinUrl,
      source: c.source,
      outreachExcluded: c.outreachExcluded,
      diffusionOptOut: c.outreachExcluded,
      diffusionOptOutAt: null,
      emailLookupStatus: c.emailLookupStatus ?? null,
      emailSuggested: c.emailSuggested ?? null,
      outreachTargets: (c.outreachTargets || []).map((t) => ({
        id: t.id,
        status: t.status as
          | "TO_CONTACT"
          | "WAITING"
          | "TO_RECONTACT"
          | "STOPPED",
        cycleCount: t.cycleCount,
        lastSentAt: iso(t.lastSentAt),
        nextRecontactAt: iso(t.nextRecontactAt),
        lastRepliedAt: iso(t.lastRepliedAt),
      })),
      sousMarques: [] as { marque: { id: string; nom: string } }[],
    })),
    cartoFiles: [] as {
      id: string;
      fileName: string;
      size: number;
      createdAt: string;
      kind?: string;
    }[],
    collaborations,
    parent: null,
    children: [],
    sousMarqueContacts: [],
    _count: { collaborations: linked?._count.collaborations ?? collaborations.length },
    market: "BENELUX" as const,
    linkedMarqueId: linked?.id ?? company.linkedMarqueId ?? null,
    linkedMarque: linked ? { id: linked.id, nom: linked.nom } : null,
  };
}
