export const PROJETS_OUTREACH_ROLES = [
  "STRATEGY_PLANNER",
  "CASTING_MANAGER",
  "HEAD_OF_SALES",
  "ADMIN",
] as const;

/** Rôles qui peuvent ouvrir le hub (y compris TM/CM pour voir / gérer leurs prestas). */
export const PROJETS_OUTREACH_ACCESS_ROLES = [
  ...PROJETS_OUTREACH_ROLES,
  "TM",
  "CM",
  "HEAD_OF",
  "HEAD_OF_INFLUENCE",
] as const;

export type ProjetsOutreachRole = (typeof PROJETS_OUTREACH_ROLES)[number];
export type ProjetsOutreachAccessRole = (typeof PROJETS_OUTREACH_ACCESS_ROLES)[number];

export const CAMPAIGN_STATUSES = [
  "BRIEF",
  "BRANDS",
  "DRAFTING",
  "SENDING",
  "ACTIVE",
  "CLOSED",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_MODES = ["SOLO", "MULTI"] as const;
export type CampaignMode = (typeof CAMPAIGN_MODES)[number];

export function isValidCampaignMode(v: string): v is CampaignMode {
  return (CAMPAIGN_MODES as readonly string[]).includes(v);
}

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  BRIEF: "Brief",
  BRANDS: "Marques",
  DRAFTING: "Rédaction",
  SENDING: "Envoi",
  ACTIVE: "Actif",
  CLOSED: "Clos",
};

const STATUS_ORDER: Record<CampaignStatus, number> = {
  BRIEF: 0,
  BRANDS: 1,
  DRAFTING: 2,
  SENDING: 3,
  ACTIVE: 4,
  CLOSED: 5,
};

export const PRESTATAIRE_CATEGORIES = [
  "HOTEL",
  "TRAITEUR",
  "PHOTO",
  "BEAUTY",
  "TRANSPORT",
  "LIEU",
  "DECORATEUR",
  "FLEURISTE",
  "AUTRE",
] as const;

export type PrestataireCategorie = (typeof PRESTATAIRE_CATEGORIES)[number];

export const PRESTATAIRE_CATEGORIE_LABEL: Record<PrestataireCategorie, string> = {
  HOTEL: "Hôtels",
  TRAITEUR: "Traiteur",
  PHOTO: "Photo / vidéo",
  BEAUTY: "Beauty",
  TRANSPORT: "Transport",
  LIEU: "Lieu",
  DECORATEUR: "Décorateur",
  FLEURISTE: "Fleuriste",
  AUTRE: "Autre",
};

/** Libellé colonne « établissement » dans le CSV / Excel d’import. */
export const PRESTATAIRE_IMPORT_ENTITY_COLUMN: Record<PrestataireCategorie, string> = {
  HOTEL: "Hôtel",
  TRAITEUR: "Traiteur",
  PHOTO: "Studio",
  BEAUTY: "Institut",
  TRANSPORT: "Société",
  LIEU: "Lieu",
  DECORATEUR: "Décorateur",
  FLEURISTE: "Fleuriste",
  AUTRE: "Établissement",
};

/** Exemple de noms pour le modèle Excel. */
export const PRESTATAIRE_IMPORT_EXAMPLES: Record<
  PrestataireCategorie,
  [string, string]
> = {
  HOTEL: ["Hôtel Exemple Paris", "Hôtel Exemple Lyon"],
  TRAITEUR: ["Traiteur Exemple Paris", "Traiteur Exemple Lyon"],
  PHOTO: ["Studio Exemple Paris", "Studio Exemple Lyon"],
  BEAUTY: ["Institut Exemple Paris", "Institut Exemple Lyon"],
  TRANSPORT: ["Transport Exemple Paris", "Transport Exemple Lyon"],
  LIEU: ["Lieu Exemple Paris", "Lieu Exemple Lyon"],
  DECORATEUR: ["Décorateur Exemple Paris", "Décorateur Exemple Lyon"],
  FLEURISTE: ["Fleuriste Exemple Paris", "Fleuriste Exemple Lyon"],
  AUTRE: ["Prestataire Exemple Paris", "Prestataire Exemple Lyon"],
};

/** Grosses villes pour filtres / fiches prestataires (FR + hubs EU). */
export const PRESTATAIRE_VILLES = [
  "Paris",
  "Lyon",
  "Marseille",
  "Bordeaux",
  "Lille",
  "Toulouse",
  "Nice",
  "Nantes",
  "Strasbourg",
  "Montpellier",
  "Rennes",
  "Cannes",
  "Monaco",
  "Bruxelles",
  "Anvers",
  "Amsterdam",
  "Rotterdam",
  "Londres",
  "Milan",
  "Rome",
  "Barcelone",
  "Madrid",
  "Berlin",
  "Munich",
  "Genève",
  "Zurich",
  "Lisbonne",
  "Porto",
] as const;

export const PRESTATAIRE_STATUTS = [
  "A_CONTACTER",
  "EN_COURS",
  "CONFIRME",
  "ANNULE",
] as const;

export type PrestataireStatut = (typeof PRESTATAIRE_STATUTS)[number];

export const PRESTATAIRE_STATUT_LABEL: Record<PrestataireStatut, string> = {
  A_CONTACTER: "À contacter",
  EN_COURS: "En cours",
  CONFIRME: "Confirmé",
  ANNULE: "Annulé",
};

export const PRESTATAIRE_CANAUX = [
  "EMAIL",
  "WHATSAPP",
  "TEL",
  "IG",
  "AUTRE",
] as const;

export type PrestataireCanal = (typeof PRESTATAIRE_CANAUX)[number];

export const PRESTATAIRE_CANAL_LABEL: Record<PrestataireCanal, string> = {
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  TEL: "Téléphone",
  IG: "Instagram",
  AUTRE: "Autre",
};

export function isValidPrestataireCanal(v: string): v is PrestataireCanal {
  return (PRESTATAIRE_CANAUX as readonly string[]).includes(v);
}

export function isValidPrestataireCategorie(v: string): v is PrestataireCategorie {
  return (PRESTATAIRE_CATEGORIES as readonly string[]).includes(v);
}

export function isValidPrestataireStatut(v: string): v is PrestataireStatut {
  return (PRESTATAIRE_STATUTS as readonly string[]).includes(v);
}

export function isProjetsOutreachRole(role: string | undefined | null): role is ProjetsOutreachRole {
  return !!role && (PROJETS_OUTREACH_ROLES as readonly string[]).includes(role);
}

export function canAccessProjetsOutreach(role: string | undefined | null): boolean {
  return !!role && (PROJETS_OUTREACH_ACCESS_ROLES as readonly string[]).includes(role);
}

export function isValidCampaignStatus(v: string): v is CampaignStatus {
  return (CAMPAIGN_STATUSES as readonly string[]).includes(v);
}

export function canCreateCampaign(role: string | undefined | null): boolean {
  return role === "STRATEGY_PLANNER" || role === "ADMIN";
}

export function canEditBrief(role: string | undefined | null): boolean {
  return role === "STRATEGY_PLANNER" || role === "ADMIN";
}

export function canManageBrands(role: string | undefined | null): boolean {
  return role === "STRATEGY_PLANNER" || role === "ADMIN";
}

export function canDraft(role: string | undefined | null): boolean {
  return role === "CASTING_MANAGER" || role === "ADMIN";
}

/** Admin peut rédiger/envoyer même si la vague Strategy n’est pas encore validée. */
export function bypassesWaveCastingGate(role: string | undefined | null): boolean {
  return role === "ADMIN";
}

export function canSend(role: string | undefined | null): boolean {
  return role === "HEAD_OF_SALES" || role === "ADMIN";
}

export function needsPrestataires(campaign: {
  necessitePrestataires?: boolean | null;
}): boolean {
  return Boolean(campaign.necessitePrestataires);
}

export function canManageAllPrestataires(role: string | undefined | null): boolean {
  return role === "STRATEGY_PLANNER" || role === "ADMIN";
}

export function canManagePrestatairesOnCampaign(
  role: string | undefined | null,
  userId: string,
  campaign: { ownerTmId?: string | null; createdById?: string | null }
): boolean {
  if (canManageAllPrestataires(role)) return true;
  if (campaign.ownerTmId && campaign.ownerTmId === userId) return true;
  if (campaign.createdById && campaign.createdById === userId && canEditBrief(role)) return true;
  return false;
}

export function canEditPrestataireLine(
  role: string | undefined | null,
  userId: string,
  campaign: { ownerTmId?: string | null; createdById?: string | null },
  responsableId: string | null | undefined
): boolean {
  if (canManagePrestatairesOnCampaign(role, userId, campaign)) return true;
  return Boolean(responsableId && responsableId === userId);
}

/** Parse select value `user:xxx` | `talent:xxx`. */
export function parseResponsableValue(raw: string): {
  responsableId: string | null;
  responsableTalentId: string | null;
} | null {
  const v = String(raw || "").trim();
  if (!v) return null;
  if (v.startsWith("user:")) {
    const id = v.slice(5).trim();
    return id ? { responsableId: id, responsableTalentId: null } : null;
  }
  if (v.startsWith("talent:")) {
    const id = v.slice(7).trim();
    return id ? { responsableId: null, responsableTalentId: id } : null;
  }
  // legacy: bare user id
  return { responsableId: v, responsableTalentId: null };
}

export function formatResponsableValue(opts: {
  responsableId?: string | null;
  responsableTalentId?: string | null;
}): string {
  if (opts.responsableTalentId) return `talent:${opts.responsableTalentId}`;
  if (opts.responsableId) return `user:${opts.responsableId}`;
  return "";
}

export function canTransitionTo(
  role: string | undefined | null,
  from: CampaignStatus,
  to: CampaignStatus
): boolean {
  if (!isValidCampaignStatus(from) || !isValidCampaignStatus(to)) return false;
  if (role === "ADMIN") return true;

  if (to === "CLOSED") {
    return canEditBrief(role) || canSend(role);
  }

  if (STATUS_ORDER[to] !== STATUS_ORDER[from] + 1) return false;

  switch (to) {
    case "BRANDS":
      return canEditBrief(role);
    case "DRAFTING":
      return canManageBrands(role);
    case "SENDING":
      return canDraft(role);
    case "ACTIVE":
      return canSend(role);
    default:
      return false;
  }
}

export const DEFAULT_SENDER_EMAIL = "leyna@glowupagence.fr";

export type CampaignActivityType =
  | "CREATED"
  | "BRIEF_UPDATED"
  | "BRIEF_READY"
  | "BRANDS_ADDED"
  | "READY_FOR_DRAFTING"
  | "READY_FOR_SENDING"
  | "ACTIVATED"
  | "CLOSED"
  | "STATUS_CHANGED"
  | "MARQUE_COMPLETION_REQUESTED"
  | "MARQUE_COMPLETION_RESOLVED"
  | "PRESTATAIRES_ENABLED"
  | "PRESTATAIRE_ADDED"
  | "PRESTATAIRE_UPDATED"
  | "PRESTATAIRE_REMOVED";
