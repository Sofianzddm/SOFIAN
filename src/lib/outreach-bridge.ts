/**
 * Pont vers le cycle outreach — « on n'oublie personne ».
 *
 * Deux rôles :
 *  1. `resolveOutreachPipeline(email)` : dit si un email est déjà suivi dans un
 *     des trois pipelines outreach (clients FR, agences, Benelux) ou s'il
 *     appartient à une agence partenaire connue (match email ou domaine).
 *  2. `bridgeContactToOutreach(...)` : fait ENTRER un contact absent de tout
 *     pipeline. Déclenché dès l'envoi de notre réponse inbound / demande
 *     entrante. Le sweep `runOutreachBridgeSweep` reste un filet de sécurité.
 *
 * Entrée après un email inbound (enrollmentMode = "inbound") :
 *  - Agence inconnue → Prospection Agences, file « à contacter » tout de suite
 *    (on peut envoyer un mail de prospection).
 *  - Marque inconnue → Outreach Clients, fiche contact créée, WAITING avec
 *    recontact à dernier échange + 30 j calendaires (évite de démarcher la
 *    marque juste après lui avoir répondu — une agence peut porter plusieurs
 *    marques).
 *  - Contact déjà suivi → inchangé (ni statut, ni compteur).
 *
 * Flux sortant (pipeline casting) : WAITING J+45, on vient d'écrire.
 * Autres clôtures (négo/collab) : TO_CONTACT par défaut.
 *
 * Les gifts (COLLAB_GIFTING) ne passent pas par le pont.
 */

import { prisma } from "@/lib/prisma";
import {
  OUTREACH_RECONTACT_DAYS,
  INBOUND_MARQUE_RECONTACT_DAYS,
} from "@/lib/outreach-constants";
import { findOrCreatePartnerByName } from "@/lib/agency-partner";
import {
  emailDomain,
  isGenericEmailDomain,
  ensureMarqueContact,
  linkMarqueFromBrandName,
  brandNameFromEmailDomain,
  parseSenderName,
} from "@/lib/marque-resolver";
import { emailHasDiffusionOptOut } from "@/lib/diffusion-opt-out";
import { normalizeEmail, isValidNormalizedEmail } from "@/lib/normalize-email";

export type OutreachPipeline = "client" | "agency" | "benelux";

const PIPELINE_LABELS: Record<OutreachPipeline, string> = {
  client: "Outreach Clients",
  agency: "Prospection Agences",
  benelux: "Prospection Benelux",
};

export function outreachPipelineLabel(pipeline: OutreachPipeline): string {
  return PIPELINE_LABELS[pipeline];
}

export type PipelineResolution =
  | {
      kind: "existing-target";
      pipeline: OutreachPipeline;
      target: {
        id: string;
        company: string;
        status: string;
        nextRecontactAt: Date | null;
      };
    }
  | {
      kind: "known-agency";
      partner: { id: string; name: string; slug: string; market: string };
    }
  | { kind: "none" };

function isValidEmail(value: string): boolean {
  return isValidNormalizedEmail(normalizeEmail(value));
}

/**
 * Cherche l'email dans les trois tables de targets outreach, puis parmi les
 * contacts d'agences partenaires (match exact puis match par domaine — jamais
 * sur un domaine grand public type gmail).
 */
export async function resolveOutreachPipeline(
  rawEmail: string
): Promise<PipelineResolution> {
  const email = normalizeEmail(rawEmail);
  if (!email || !isValidEmail(email)) return { kind: "none" };

  const [client, agency, benelux] = await Promise.all([
    prisma.outreachTarget.findUnique({
      where: { email },
      select: { id: true, company: true, status: true, nextRecontactAt: true },
    }),
    prisma.agencyOutreachTarget.findUnique({
      where: { email },
      select: { id: true, company: true, status: true, nextRecontactAt: true },
    }),
    prisma.beneluxOutreachTarget.findUnique({
      where: { email },
      select: { id: true, companyName: true, status: true, nextRecontactAt: true },
    }),
  ]);

  if (client) return { kind: "existing-target", pipeline: "client", target: client };
  if (agency) return { kind: "existing-target", pipeline: "agency", target: agency };
  if (benelux) {
    return {
      kind: "existing-target",
      pipeline: "benelux",
      target: {
        id: benelux.id,
        company: benelux.companyName,
        status: benelux.status,
        nextRecontactAt: benelux.nextRecontactAt,
      },
    };
  }

  // Contact d'agence connu (email exact).
  const agencyContact = await prisma.agencyContact.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      partner: { select: { id: true, name: true, slug: true, market: true } },
    },
  });
  if (agencyContact) return { kind: "known-agency", partner: agencyContact.partner };

  // Domaine d'agence connue : un collègue de la même agence est déjà en base
  // (AgencyContact) ou le domaine est celui du contact principal du Partner.
  const domain = emailDomain(email);
  if (domain && !isGenericEmailDomain(domain)) {
    const colleague = await prisma.agencyContact.findFirst({
      where: { email: { endsWith: `@${domain}`, mode: "insensitive" } },
      select: {
        partner: { select: { id: true, name: true, slug: true, market: true } },
      },
    });
    if (colleague) return { kind: "known-agency", partner: colleague.partner };

    const partner = await prisma.partner.findFirst({
      where: { contactEmail: { endsWith: `@${domain}`, mode: "insensitive" } },
      select: { id: true, name: true, slug: true, market: true },
    });
    if (partner) return { kind: "known-agency", partner };
  }

  return { kind: "none" };
}

/**
 * Garde-fou anti double-prospection à la création manuelle / import : dit si
 * l'email est déjà suivi dans un AUTRE pipeline outreach que `ownPipeline`.
 * Retourne le conflit (pipeline + libellé + entreprise) ou null.
 *
 * `allowClientBeneluxSibling` : FR (client) et Benelux sont des marchés
 * PARALLÈLES. Quand un contact est volontairement placé sur les deux marchés
 * (« FR + BE »), sa présence dans le marché frère n'est PAS un conflit — on
 * veut la même personne dans les deux cycles. Le conflit avec la prospection
 * agences reste bloquant dans tous les cas.
 */
export async function findCrossPipelineConflict(
  email: string,
  ownPipeline: OutreachPipeline,
  opts?: { allowClientBeneluxSibling?: boolean }
): Promise<{ pipeline: OutreachPipeline; label: string; company: string } | null> {
  const resolution = await resolveOutreachPipeline(email);
  if (resolution.kind !== "existing-target") return null;
  if (resolution.pipeline === ownPipeline) return null;
  if (
    opts?.allowClientBeneluxSibling &&
    ((ownPipeline === "client" && resolution.pipeline === "benelux") ||
      (ownPipeline === "benelux" && resolution.pipeline === "client"))
  ) {
    return null;
  }
  return {
    pipeline: resolution.pipeline,
    label: outreachPipelineLabel(resolution.pipeline),
    company: resolution.target.company,
  };
}

export type BridgeInput = {
  email: string;
  firstname?: string | null;
  lastname?: string | null;
  /** Nom de marque / entreprise si connu (ex. extractedBrand de l'inbound). */
  company?: string | null;
  /** Marque CRM déjà liée au flux entrant, si connue. */
  marqueId?: string | null;
  /**
   * Qualification manuelle du contact : "AGENCE" force le routage vers la
   * Prospection Agences (agence créée à la volée si inconnue), même si le
   * domaine ne matche aucune agence en base. "MARQUE" / null : routage normal
   * (la détection par domaine d'agence connue reste prioritaire, par sécurité).
   */
  contactKind?: string | null;
  /** Nom de l'agence saisi (si contactKind = AGENCE). */
  contactAgence?: string | null;
  language?: string | null;
  /** Date du dernier échange, tracée dans la raison d'entrée. */
  lastExchangeAt: Date;
  /** Utilisateur porteur du target créé (notifications de cycle). */
  createdById: string;
  /** Libellé du flux d'origine, pour la raison affichée (ex. "inbound"). */
  sourceLabel?: string;
  /** Remplace « Échange <source> clôturé » dans la raison (ex. « Réponse inbound envoyée »). */
  reasonLabel?: string;
  /**
   * Mode d'entrée dans le cycle (contact absent uniquement) :
   *  - `inbound` : agence → TO_CONTACT ; marque → WAITING J+30 calendaires
   *  - `outbound` : WAITING J+45 (on vient d'écrire, ex. pipeline casting)
   *  - `default` : TO_CONTACT (négo / collab / rattrapage)
   */
  enrollmentMode?: "inbound" | "outbound" | "default";
};

export type BridgeResult =
  | {
      ok: true;
      /**
       * `already-tracked` : le contact était déjà dans un pipeline, sa cible
       * n'a PAS été modifiée (ni statut, ni compteur de recontact).
       */
      action: "created" | "already-tracked" | "skipped-stopped";
      pipeline: OutreachPipeline;
      targetId: string;
      company: string;
    }
  | { ok: false; reason: string };

function formatFrDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function addRecontactDelay(from: Date, days: number = OUTREACH_RECONTACT_DAYS): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Statut + compteur d'entrée selon le mode et le pipeline cible.
 * Contact déjà suivi : jamais appelé (already-tracked en amont).
 */
function resolveEntry(
  mode: "inbound" | "outbound" | "default",
  pipeline: "agency" | "client",
  lastExchangeAt: Date,
  origin: string
): {
  status: "TO_CONTACT" | "WAITING";
  nextRecontactAt: Date | null;
  reason: string;
} {
  // Flux sortant : on vient d'écrire → attente J+45 quel que soit le pipeline.
  if (mode === "outbound") {
    const next = addRecontactDelay(lastExchangeAt, OUTREACH_RECONTACT_DAYS);
    return {
      status: "WAITING",
      nextRecontactAt: next,
      reason:
        `${origin} le ${formatFrDate(lastExchangeAt)} : ` +
        `recontact planifié au ${formatFrDate(next)} (J+${OUTREACH_RECONTACT_DAYS}).`,
    };
  }

  // Inbound → agence : file « à contacter » tout de suite.
  if (mode === "inbound" && pipeline === "agency") {
    return {
      status: "TO_CONTACT",
      nextRecontactAt: null,
      reason:
        `${origin} le ${formatFrDate(lastExchangeAt)} : ` +
        `contact ajouté à la file « à contacter ».`,
    };
  }

  // Inbound → marque : WAITING + 30 j calendaires (pas de double contact immédiat).
  if (mode === "inbound" && pipeline === "client") {
    const next = addRecontactDelay(lastExchangeAt, INBOUND_MARQUE_RECONTACT_DAYS);
    return {
      status: "WAITING",
      nextRecontactAt: next,
      reason:
        `${origin} le ${formatFrDate(lastExchangeAt)} : ` +
        `recontact planifié au ${formatFrDate(next)} (J+${INBOUND_MARQUE_RECONTACT_DAYS}).`,
    };
  }

  // Négo / collab / défaut : TO_CONTACT.
  return {
    status: "TO_CONTACT",
    nextRecontactAt: null,
    reason:
      `${origin} le ${formatFrDate(lastExchangeAt)} : ` +
      `contact ajouté à la file « à contacter ».`,
  };
}

/**
 * Nom du Partner pour un contact qualifié « agence ». Le nom saisi prime ;
 * sinon on déduit du domaine de l'expéditeur (`alex@heaven.paris` → "Heaven").
 * `company` (marque du brief, ex. "Adobe France") n'est jamais utilisé ici :
 * ce serait créer une fiche agence au nom de l'annonceur.
 */
function resolveForcedAgencyName(
  input: Pick<BridgeInput, "contactAgence">,
  email: string
): string {
  return (input.contactAgence || "").trim() || brandNameFromEmailDomain(email) || "";
}

/**
 * Fait entrer un contact dans le cycle outreach s'il n'y est pas déjà.
 *
 *  - Déjà suivi : cible laissée intacte (`already-tracked`).
 *  - Agence (qualifiée / domaine connu) : Prospection Agences.
 *  - Sinon : Outreach Clients (marque résolue/créée, contact fiche inclus).
 *  - Mode d'entrée : voir `enrollmentMode` sur `BridgeInput`.
 */
export async function bridgeContactToOutreach(input: BridgeInput): Promise<BridgeResult> {
  const email = normalizeEmail(input.email);
  if (!email || !isValidEmail(email)) {
    return { ok: false, reason: "email-invalide" };
  }

  // Opt-out client « liste de diffusion » : email conservé, aucun pipeline.
  if (await emailHasDiffusionOptOut(email)) {
    return { ok: false, reason: "diffusion-opt-out" };
  }

  const language = input.language === "en" ? "en" : "fr";
  const sourceLabel = input.sourceLabel || "échange entrant";
  const enrollmentMode = input.enrollmentMode || "default";
  const origin =
    (input.reasonLabel || "").trim() || `Échange ${sourceLabel} clôturé`;

  const resolution = await resolveOutreachPipeline(email);
  const forcedAgency = (input.contactKind || "").trim().toUpperCase() === "AGENCE";

  const fallbackName = parseSenderName(
    [input.firstname, input.lastname].filter(Boolean).join(" ") ||
      email.split("@")[0]
  );
  const firstname = (input.firstname || "").trim() || fallbackName.prenom || fallbackName.nom;
  const lastname = (input.lastname || "").trim() || (fallbackName.prenom ? fallbackName.nom : "");

  /** Entre le contact en Prospection Agences (contact + target sous `partner`). */
  const enterAgencyPipeline = async (partner: {
    id: string;
    name: string;
    slug: string;
    market: string;
  }): Promise<BridgeResult> => {
    // L'email peut déjà avoir un target agence (ex. migration depuis un
    // pipeline marque alors qu'un doublon historique existait) : on le laisse
    // intact au lieu de violer l'unicité de l'email.
    const existing = await prisma.agencyOutreachTarget.findUnique({
      where: { email },
      select: { id: true, company: true, status: true },
    });
    if (existing) {
      return {
        ok: true,
        action: existing.status === "STOPPED" ? "skipped-stopped" : "already-tracked",
        pipeline: "agency",
        targetId: existing.id,
        company: existing.company,
      };
    }

    const entry = resolveEntry(enrollmentMode, "agency", input.lastExchangeAt, origin);

    const contact = await prisma.agencyContact.upsert({
      where: { partnerId_email: { partnerId: partner.id, email } },
      update: {},
      create: {
        partnerId: partner.id,
        prenom: firstname,
        nom: lastname || null,
        email,
        language,
        createdById: input.createdById,
      },
    });

    const target = await prisma.agencyOutreachTarget.create({
      data: {
        partnerId: partner.id,
        agencyContactId: contact.id,
        firstname,
        lastname: lastname || null,
        email,
        company: partner.name,
        partnerSlug: partner.slug,
        language,
        market: partner.market === "BENELUX" ? "BENELUX" : "FR",
        status: entry.status,
        nextRecontactAt: entry.nextRecontactAt,
        autoRescheduleReason: entry.reason,
        autoRescheduledAt: new Date(),
        createdById: input.createdById,
      },
    });

    return {
      ok: true,
      action: "created",
      pipeline: "agency",
      targetId: target.id,
      company: partner.name,
    };
  };

  // 1. Déjà suivi quelque part : on n'y touche pas. Le cycle outreach et les
  //    échanges entrants sont deux choses distinctes — un inbound, une négo ou
  //    une collab ne doit ni recaler le compteur de recontact ni changer le
  //    statut d'une cible existante.
  if (resolution.kind === "existing-target") {
    const { pipeline, target } = resolution;
    if (target.status === "STOPPED") {
      return {
        ok: true,
        action: "skipped-stopped",
        pipeline,
        targetId: target.id,
        company: target.company,
      };
    }

    // Requalifié AGENCE alors qu'il est suivi dans un pipeline marque : on
    // stoppe l'ancien target (trace conservée) et il migre vers la Prospection
    // Agences — jamais d'agence dans Outreach Clients / Benelux.
    if (forcedAgency && pipeline !== "agency") {
      // Nom résolu AVANT de stopper l'ancien target : sans nom exploitable, le
      // contact reste dans son pipeline actuel plutôt que de finir stoppé
      // partout.
      const agencyName = resolveForcedAgencyName(input, email);
      if (!agencyName) return { ok: false, reason: "agence-sans-nom" };

      const migrationNote =
        `Contact requalifié « agence » (${sourceLabel}) : ` +
        `déplacé vers Prospection Agences le ${formatFrDate(new Date())}.`;
      const stopData = {
        status: "STOPPED" as const,
        autoRescheduleReason: migrationNote,
        autoRescheduledAt: new Date(),
      };
      if (pipeline === "client") {
        await prisma.outreachTarget.update({ where: { id: target.id }, data: stopData });
      } else {
        await prisma.beneluxOutreachTarget.update({ where: { id: target.id }, data: stopData });
      }

      const partner = await findOrCreatePartnerByName(agencyName, input.createdById);
      return enterAgencyPipeline(partner);
    }

    return {
      ok: true,
      action: "already-tracked",
      pipeline,
      targetId: target.id,
      company: target.company,
    };
  }

  // 2. Agence partenaire connue (email/domaine) : pipeline Prospection Agences.
  if (resolution.kind === "known-agency") {
    return enterAgencyPipeline(resolution.partner);
  }

  // 2bis. Qualifié AGENCE à la saisie mais agence inconnue en base : on crée
  // le Partner à la volée (nom saisi, sinon domaine) et il entre en
  // Prospection Agences — il ne passera jamais par Outreach Clients.
  if (forcedAgency) {
    const agencyName = resolveForcedAgencyName(input, email);
    if (!agencyName) return { ok: false, reason: "agence-sans-nom" };
    const partner = await findOrCreatePartnerByName(agencyName, input.createdById);
    return enterAgencyPipeline(partner);
  }

  // 3. Pipeline Outreach Clients : marque requise (liée, ou résolue par nom /
  //    domaine via le résolveur central — jamais de doublon de fiche).
  let marqueId = (input.marqueId || "").trim() || null;
  let company = (input.company || "").trim();

  if (marqueId) {
    const marque = await prisma.marque.findUnique({
      where: { id: marqueId },
      select: { id: true, nom: true },
    });
    if (marque) {
      company = marque.nom;
    } else {
      marqueId = null;
    }
  }

  if (!marqueId) {
    const brandName = company || brandNameFromEmailDomain(email) || "";
    if (!brandName) {
      return { ok: false, reason: "marque-introuvable" };
    }
    const linked = await linkMarqueFromBrandName({
      brandName,
      source: "INBOUND",
      createDefaults: { sourceInitiale: "INBOUND" },
    });
    if (!linked) return { ok: false, reason: "marque-introuvable" };
    marqueId = linked.marqueId;
    const marque = await prisma.marque.findUnique({
      where: { id: marqueId },
      select: { nom: true },
    });
    company = marque?.nom || brandName;
  }

  // Fiche contact marque : toujours créée / liée, même si le contact était
  // déjà suivi (le chemin already-tracked est au-dessus). Ici = 1ʳᵉ entrée.
  await ensureMarqueContact({
    marqueId,
    email,
    prenom: firstname,
    nom: lastname || firstname,
    poste: "Contact inbound",
  });
  const marqueContact = await prisma.marqueContact.findFirst({
    where: { marqueId, email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });

  const entry = resolveEntry(enrollmentMode, "client", input.lastExchangeAt, origin);

  const target = await prisma.outreachTarget.create({
    data: {
      marqueId,
      marqueContactId: marqueContact?.id || null,
      firstname,
      lastname: lastname || null,
      email,
      company,
      language,
      status: entry.status,
      nextRecontactAt: entry.nextRecontactAt,
      autoRescheduleReason: entry.reason,
      autoRescheduledAt: new Date(),
      createdById: input.createdById,
    },
  });

  return {
    ok: true,
    action: "created",
    pipeline: "client",
    targetId: target.id,
    company,
  };
}

// ============================================================
// Sweep de clôture des flux entrants (appelé par /api/cron/relances)
// ============================================================

export type BridgeSweepResult = {
  inboundProcessed: number;
  demandesProcessed: number;
  negosProcessed: number;
  collabsProcessed: number;
  created: number;
  /** Déjà dans un pipeline : cible laissée intacte. */
  alreadyTracked: number;
  skipped: number;
};

const SWEEP_BATCH_SIZE = 50;

function maxDate(...dates: Array<Date | null | undefined>): Date | null {
  let max: Date | null = null;
  for (const d of dates) {
    if (d && (!max || d.getTime() > max.getTime())) max = d;
  }
  return max;
}

/** "Marie Dupont <marie@agence.fr>" → "marie@agence.fr" */
function extractEmailFromHeader(fromValue: string): string {
  return normalizeEmail(fromValue);
}

/** "Marie Dupont <marie@agence.fr>" → "Marie Dupont" (sinon ""). */
function extractNameFromHeader(fromValue: string): string {
  const trimmed = (fromValue || "").trim();
  const idx = trimmed.indexOf("<");
  if (idx <= 0) return "";
  return trimmed.slice(0, idx).replace(/["']/g, "").trim();
}

/** Porteur des targets créés par le pont : premier ADMIN actif. */
async function resolveBridgeCreatedById(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", actif: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return admin?.id ?? null;
}

function bridgeRef(bridge: BridgeResult): string {
  if (!bridge.ok) return `skipped:${bridge.reason}`;
  return `${bridge.pipeline}:${bridge.targetId}`;
}

/**
 * Persiste la qualification inbound, crée / met à jour la fiche contact
 * (Partner + AgencyContact, ou Marque + MarqueContact) ET enrôle tout de suite
 * dans le cycle outreach si le contact n'y est pas déjà :
 *  - Agence → Prospection Agences, file « à contacter »
 *  - Marque → Outreach Clients, WAITING J+30
 */
export type PersistInboundContactResult =
  | {
      ok: true;
      kind: "AGENCE";
      partnerId: string;
      partnerName: string;
      contactId: string;
      href: string;
      created: boolean;
      outreachAction: "created" | "already-tracked" | "skipped-stopped" | "skipped";
      outreachPipeline?: "agency" | "client" | "benelux";
    }
  | {
      ok: true;
      kind: "MARQUE";
      marqueId: string;
      marqueName: string;
      contactId: string | null;
      href: string;
      created: boolean;
      outreachAction: "created" | "already-tracked" | "skipped-stopped" | "skipped";
      outreachPipeline?: "agency" | "client" | "benelux";
    }
  | { ok: false; reason: string };

export async function persistInboundQualifiedContact(
  opportunityId: string,
  createdById: string,
  qualification: {
    contactKind: "MARQUE" | "AGENCE";
    contactAgence?: string | null;
    contactLanguage?: string | null;
  }
): Promise<PersistInboundContactResult> {
  const opp = await prisma.inboundOpportunity.findUnique({
    where: { id: opportunityId },
    select: {
      id: true,
      senderEmail: true,
      senderName: true,
      extractedBrand: true,
      marqueId: true,
      receivedAt: true,
      outreachBridgedAt: true,
    },
  });
  if (!opp) return { ok: false, reason: "introuvable" };

  const email = normalizeEmail(opp.senderEmail);
  if (!email || !isValidEmail(email)) {
    return { ok: false, reason: "email-invalide" };
  }

  const language =
    String(qualification.contactLanguage || "").trim().toLowerCase() === "en"
      ? "en"
      : "fr";
  const kind = qualification.contactKind;
  const sender = parseSenderName(opp.senderName);
  const firstname =
    sender.prenom || sender.nom || email.split("@")[0] || "Contact";
  const lastname = sender.prenom ? sender.nom || null : null;
  const lastExchangeAt = opp.receivedAt || new Date();

  /** Enrôle dans le cycle outreach + marque l'opportunité comme bridgée. */
  const enrollOutreach = async (input: {
    company?: string | null;
    marqueId?: string | null;
    contactKind: "MARQUE" | "AGENCE";
    contactAgence?: string | null;
  }): Promise<{
    action: "created" | "already-tracked" | "skipped-stopped" | "skipped";
    pipeline?: "agency" | "client" | "benelux";
  }> => {
    let bridge: BridgeResult;
    try {
      bridge = await bridgeContactToOutreach({
        email,
        firstname,
        lastname,
        company: input.company,
        marqueId: input.marqueId,
        contactKind: input.contactKind,
        contactAgence: input.contactAgence,
        language,
        lastExchangeAt,
        createdById,
        sourceLabel: "inbound",
        reasonLabel: "Qualification inbound enregistrée",
        enrollmentMode: "inbound",
      });
    } catch (error) {
      console.warn(
        `[outreach-bridge] enroll on qualify ${opp.id} (${email}):`,
        error
      );
      bridge = { ok: false, reason: "erreur" };
    }

    await prisma.inboundOpportunity
      .update({
        where: { id: opp.id },
        data: {
          outreachBridgedAt: opp.outreachBridgedAt ?? new Date(),
          outreachTargetRef: bridgeRef(bridge),
        },
      })
      .catch((e) =>
        console.warn(`[outreach-bridge] marquage qualify ${opp.id}:`, e)
      );

    if (!bridge.ok) return { action: "skipped" };
    return { action: bridge.action, pipeline: bridge.pipeline };
  };

  if (kind === "AGENCE") {
    const agencyName =
      (qualification.contactAgence || "").trim() ||
      brandNameFromEmailDomain(email) ||
      "";
    if (!agencyName) {
      return { ok: false, reason: "agence-sans-nom" };
    }

    const partner = await findOrCreatePartnerByName(agencyName, createdById);
    const existing = await prisma.agencyContact.findUnique({
      where: { partnerId_email: { partnerId: partner.id, email } },
      select: { id: true },
    });
    const contact = await prisma.agencyContact.upsert({
      where: { partnerId_email: { partnerId: partner.id, email } },
      update: {
        language,
        ...(firstname ? { prenom: firstname } : {}),
        ...(lastname ? { nom: lastname } : {}),
      },
      create: {
        partnerId: partner.id,
        prenom: firstname,
        nom: lastname,
        email,
        language,
        createdById,
      },
      select: { id: true },
    });

    await prisma.inboundOpportunity.update({
      where: { id: opp.id },
      data: {
        contactKind: "AGENCE",
        contactAgence: agencyName,
        contactLanguage: language,
      },
    });

    const outreach = await enrollOutreach({
      company: agencyName,
      contactKind: "AGENCE",
      contactAgence: agencyName,
    });

    return {
      ok: true,
      kind: "AGENCE",
      partnerId: partner.id,
      partnerName: partner.name,
      contactId: contact.id,
      href: `/partners/manage/${partner.id}`,
      created: !existing,
      outreachAction: outreach.action,
      outreachPipeline: outreach.pipeline,
    };
  }

  // MARQUE
  let marqueId = (opp.marqueId || "").trim() || null;
  let marqueName = (opp.extractedBrand || "").trim();

  if (marqueId) {
    const marque = await prisma.marque.findUnique({
      where: { id: marqueId },
      select: { id: true, nom: true },
    });
    if (marque) {
      marqueName = marque.nom;
    } else {
      marqueId = null;
    }
  }

  if (!marqueId) {
    const brandName =
      marqueName || brandNameFromEmailDomain(email) || "";
    if (!brandName) {
      return { ok: false, reason: "marque-introuvable" };
    }
    const linked = await linkMarqueFromBrandName({
      brandName,
      source: "INBOUND",
      createDefaults: { sourceInitiale: "INBOUND" },
    });
    if (!linked) return { ok: false, reason: "marque-introuvable" };
    marqueId = linked.marqueId;
    const marque = await prisma.marque.findUnique({
      where: { id: marqueId },
      select: { nom: true },
    });
    marqueName = marque?.nom || brandName;
  }

  const existingMarqueContact = await prisma.marqueContact.findFirst({
    where: { marqueId, email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });

  await ensureMarqueContact({
    marqueId,
    email,
    prenom: firstname,
    nom: lastname || firstname,
    poste: "Contact inbound",
  });

  const marqueContact = await prisma.marqueContact.findFirst({
    where: { marqueId, email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });

  if (marqueContact) {
    await prisma.marqueContact.update({
      where: { id: marqueContact.id },
      data: { language },
    });
  }

  await prisma.inboundOpportunity.update({
    where: { id: opp.id },
    data: {
      contactKind: "MARQUE",
      contactAgence: null,
      contactLanguage: language,
      marqueId,
    },
  });

  const outreach = await enrollOutreach({
    company: marqueName,
    marqueId,
    contactKind: "MARQUE",
  });

  return {
    ok: true,
    kind: "MARQUE",
    marqueId,
    marqueName,
    contactId: marqueContact?.id || null,
    href: `/marques/${marqueId}`,
    created: !existingMarqueContact,
    outreachAction: outreach.action,
    outreachPipeline: outreach.pipeline,
  };
}

/**
 * Enrôle un contact juste après l'envoi de notre réponse inbound.
 * Gifts exclus. Contact déjà suivi : cycle intact.
 * Marque `outreachBridgedAt` pour que le sweep ne re-traite pas la ligne.
 */
export async function bridgeInboundOpportunityAfterSend(
  opportunityId: string,
  createdById?: string | null,
  opts?: { lastExchangeAt?: Date; label?: string }
): Promise<BridgeResult> {
  const opp = await prisma.inboundOpportunity.findUnique({
    where: { id: opportunityId },
    select: {
      id: true,
      category: true,
      senderEmail: true,
      senderName: true,
      extractedBrand: true,
      marqueId: true,
      contactKind: true,
      contactAgence: true,
      contactLanguage: true,
      outreachBridgedAt: true,
    },
  });
  if (!opp) return { ok: false, reason: "introuvable" };

  // Gift : on répond éventuellement, mais on n'enrôle pas en prospection.
  if (opp.category === "COLLAB_GIFTING") {
    await prisma.inboundOpportunity
      .update({
        where: { id: opp.id },
        data: {
          outreachBridgedAt: opp.outreachBridgedAt ?? new Date(),
          outreachTargetRef: "skipped:gifting",
        },
      })
      .catch(() => undefined);
    return { ok: false, reason: "gifting" };
  }

  const actorId = createdById || (await resolveBridgeCreatedById());
  if (!actorId) return { ok: false, reason: "createdBy-manquant" };

  const lastExchangeAt = opts?.lastExchangeAt || new Date();
  const label = opts?.label || "Réponse inbound envoyée";
  const sender = parseSenderName(opp.senderName);

  let bridge: BridgeResult;
  try {
    bridge = await bridgeContactToOutreach({
      email: opp.senderEmail,
      firstname: sender.prenom,
      lastname: sender.prenom ? sender.nom : null,
      company: opp.extractedBrand,
      marqueId: opp.marqueId,
      contactKind: opp.contactKind,
      contactAgence: opp.contactAgence,
      language: opp.contactLanguage,
      lastExchangeAt,
      createdById: actorId,
      sourceLabel: "inbound",
      reasonLabel: label,
      enrollmentMode: "inbound",
    });
  } catch (error) {
    console.warn(
      `[outreach-bridge] bridge inbound send ${opp.id} (${opp.senderEmail}):`,
      error
    );
    bridge = { ok: false, reason: "erreur" };
  }

  await prisma.inboundOpportunity
    .update({
      where: { id: opp.id },
      data: {
        outreachBridgedAt: opp.outreachBridgedAt ?? new Date(),
        outreachTargetRef: bridgeRef(bridge),
      },
    })
    .catch((e) =>
      console.warn(`[outreach-bridge] marquage inbound send ${opp.id}:`, e)
    );

  return bridge;
}

/**
 * Après un envoi pipeline casting / projets : si le contact n'est pas encore
 * dans un cycle outreach, l'enrôler en WAITING J+45. Ne touche pas aux
 * contacts déjà suivis, ni aux partners / agences connues (Woo, Samy…).
 */
export async function enrollIfMissingAfterPipelineSend(input: {
  email: string;
  firstname?: string | null;
  lastname?: string | null;
  company?: string | null;
  marqueId?: string | null;
  language?: string | null;
  createdById: string;
  sentAt?: Date;
  sourceLabel?: string;
}): Promise<BridgeResult | { ok: true; action: "already-tracked" | "skipped-partner" }> {
  const email = normalizeEmail(input.email);
  if (!email || !isValidEmail(email)) {
    return { ok: false, reason: "email-invalide" };
  }

  const resolution = await resolveOutreachPipeline(email);
  if (resolution.kind === "existing-target") {
    return { ok: true, action: "already-tracked" };
  }
  if (resolution.kind === "known-agency") {
    return { ok: true, action: "skipped-partner" };
  }

  const sentAt = input.sentAt || new Date();
  return bridgeContactToOutreach({
    email,
    firstname: input.firstname,
    lastname: input.lastname,
    company: input.company,
    marqueId: input.marqueId,
    language: input.language,
    lastExchangeAt: sentAt,
    createdById: input.createdById,
    sourceLabel: input.sourceLabel || "pipeline casting",
    reasonLabel: input.sourceLabel || "Mail pipeline casting envoyé",
    // Flux sortant : on vient d'écrire au contact, il attend J+45 au lieu de
    // repartir immédiatement dans la file « à contacter ».
    enrollmentMode: "outbound",
  });
}

/**
 * Même pont pour une DemandeEntrante juste après envoi / relance / réponse.
 */
export async function bridgeDemandeEntranteAfterSend(
  demandeId: string,
  createdById?: string | null,
  opts?: { lastExchangeAt?: Date; label?: string }
): Promise<BridgeResult> {
  const demande = await prisma.demandeEntrante.findUnique({
    where: { id: demandeId },
    select: {
      id: true,
      from: true,
      extractedBrand: true,
      marqueId: true,
      outreachBridgedAt: true,
    },
  });
  if (!demande) return { ok: false, reason: "introuvable" };

  const actorId = createdById || (await resolveBridgeCreatedById());
  if (!actorId) return { ok: false, reason: "createdBy-manquant" };

  const email = extractEmailFromHeader(demande.from);
  const lastExchangeAt = opts?.lastExchangeAt || new Date();
  const label = opts?.label || "Réponse demande entrante envoyée";
  const sender = parseSenderName(extractNameFromHeader(demande.from));

  let bridge: BridgeResult;
  try {
    bridge = await bridgeContactToOutreach({
      email,
      firstname: sender.prenom,
      lastname: sender.prenom ? sender.nom : null,
      company: demande.extractedBrand,
      marqueId: demande.marqueId,
      lastExchangeAt,
      createdById: actorId,
      sourceLabel: "demande entrante",
      reasonLabel: label,
      enrollmentMode: "inbound",
    });
  } catch (error) {
    console.warn(
      `[outreach-bridge] bridge demande send ${demande.id} (${email}):`,
      error
    );
    bridge = { ok: false, reason: "erreur" };
  }

  await prisma.demandeEntrante
    .update({
      where: { id: demande.id },
      data: {
        outreachBridgedAt: demande.outreachBridgedAt ?? new Date(),
        outreachTargetRef: bridgeRef(bridge),
      },
    })
    .catch((e) =>
      console.warn(`[outreach-bridge] marquage demande send ${demande.id}:`, e)
    );

  return bridge;
}

/**
 * Fait entrer dans le cycle outreach 45j les flux clôturés OU déjà contactés :
 *  - InboundOpportunity : réponse envoyée (sentAt), réponse reçue, R2, ou
 *    archivée après envoi (hors CONVERTED).
 *  - DemandeEntrante : status "envoye" / "repondu" / "relance_terminee".
 *  - Negociation : refusée/annulée, ou devenue collaboration (hors collab
 *    encore en négo) — le contact marque du deal revient dans la boucle.
 *  - Collaboration directe (sans négo) : publiée / facturée / payée / perdue —
 *    le contact billing de la marque revient dans la boucle.
 *
 * Idempotent : chaque ligne traitée est marquée (outreachBridgedAt), y compris
 * en cas d'échec de routage (ref "skipped:<raison>") pour ne pas boucler.
 * L'enrôlement synchrone à l'envoi (`bridgeInboundOpportunityAfterSend` /
 * `bridgeDemandeEntranteAfterSend`) est le chemin nominal ; ce sweep rattrape
 * les historiques et les cas où le pont synchrone a échoué.
 */
export async function runOutreachBridgeSweep(): Promise<BridgeSweepResult> {
  const result: BridgeSweepResult = {
    inboundProcessed: 0,
    demandesProcessed: 0,
    negosProcessed: 0,
    collabsProcessed: 0,
    created: 0,
    alreadyTracked: 0,
    skipped: 0,
  };

  const createdById = await resolveBridgeCreatedById();
  if (!createdById) {
    console.warn("[outreach-bridge] aucun ADMIN actif : sweep ignoré.");
    return result;
  }

  const applyResult = (bridge: BridgeResult): string => {
    if (!bridge.ok) {
      result.skipped += 1;
      return `skipped:${bridge.reason}`;
    }
    if (bridge.action === "created") result.created += 1;
    else if (bridge.action === "already-tracked") result.alreadyTracked += 1;
    else result.skipped += 1;
    return `${bridge.pipeline}:${bridge.targetId}`;
  };

  // --- InboundOpportunity contactées / clôturées ---
  // Dès qu'on a envoyé une réponse (sentAt), ou à la clôture (réponse client,
  // R2, archive après envoi). Une simple archive sans envoi ne crée pas
  // d'entrée — évite les doublons avec l'inbound non traité.
  const inbounds = await prisma.inboundOpportunity.findMany({
    where: {
      outreachBridgedAt: null,
      status: { not: "CONVERTED" },
      OR: [
        { sentAt: { not: null } },
        { replied: true },
        { relance2SentAt: { not: null } },
        { status: "ARCHIVED", sentAt: { not: null } },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: SWEEP_BATCH_SIZE,
    select: {
      id: true,
      category: true,
      senderEmail: true,
      senderName: true,
      extractedBrand: true,
      marqueId: true,
      contactKind: true,
      contactAgence: true,
      contactLanguage: true,
      receivedAt: true,
      sentAt: true,
      relance1SentAt: true,
      relance2SentAt: true,
      archivedAt: true,
      replied: true,
      updatedAt: true,
    },
  });

  for (const opp of inbounds) {
    result.inboundProcessed += 1;

    if (opp.category === "COLLAB_GIFTING") {
      result.skipped += 1;
      await prisma.inboundOpportunity
        .update({
          where: { id: opp.id },
          data: { outreachBridgedAt: new Date(), outreachTargetRef: "skipped:gifting" },
        })
        .catch((e) => console.warn(`[outreach-bridge] marquage inbound ${opp.id}:`, e));
      continue;
    }

    const lastExchangeAt =
      maxDate(
        opp.receivedAt,
        opp.sentAt,
        opp.relance1SentAt,
        opp.relance2SentAt,
        opp.archivedAt,
        // La détection de réponse ne stocke pas de date dédiée : updatedAt est
        // la meilleure approximation du dernier échange.
        opp.replied ? opp.updatedAt : null
      ) || new Date();

    const sender = parseSenderName(opp.senderName);
    let ref: string;
    try {
      const bridge = await bridgeContactToOutreach({
        email: opp.senderEmail,
        firstname: sender.prenom,
        lastname: sender.prenom ? sender.nom : null,
        company: opp.extractedBrand,
        marqueId: opp.marqueId,
        contactKind: opp.contactKind,
        contactAgence: opp.contactAgence,
        language: opp.contactLanguage,
        lastExchangeAt,
        createdById,
        sourceLabel: "inbound",
        enrollmentMode: "inbound",
      });
      ref = applyResult(bridge);
    } catch (error) {
      console.warn(`[outreach-bridge] inbound ${opp.id} (${opp.senderEmail}):`, error);
      result.skipped += 1;
      ref = "skipped:erreur";
    }

    await prisma.inboundOpportunity
      .update({
        where: { id: opp.id },
        data: { outreachBridgedAt: new Date(), outreachTargetRef: ref },
      })
      .catch((e) => console.warn(`[outreach-bridge] marquage inbound ${opp.id}:`, e));
  }

  // --- DemandeEntrante contactées / clôturées ---
  const demandes = await prisma.demandeEntrante.findMany({
    where: {
      outreachBridgedAt: null,
      status: { in: ["envoye", "repondu", "relance_terminee"] },
    },
    orderBy: { updatedAt: "asc" },
    take: SWEEP_BATCH_SIZE,
    select: {
      id: true,
      from: true,
      extractedBrand: true,
      marqueId: true,
      date: true,
      sentAt: true,
      relance1SentAt: true,
      relance2SentAt: true,
      replied: true,
      updatedAt: true,
    },
  });

  // --- Négociations terminées (refusées/annulées ou devenues collabs) ---
  // Le contact marque du deal entre dans le cycle : recontact = dernière
  // activité du deal + 45j. Les négos encore en discussion ne sont pas
  // touchées (on est en train de leur parler) ; elles entreront à la clôture.
  const negos = await prisma.negociation.findMany({
    where: {
      outreachBridgedAt: null,
      emailContact: { not: null },
      statut: { in: ["REFUSEE", "ANNULEE", "VALIDEE"] },
    },
    orderBy: { updatedAt: "asc" },
    take: SWEEP_BATCH_SIZE,
    select: {
      id: true,
      emailContact: true,
      contactMarque: true,
      contactKind: true,
      contactAgence: true,
      contactLanguage: true,
      nomMarqueSaisi: true,
      marqueId: true,
      dateValidation: true,
      lastModifiedAt: true,
      updatedAt: true,
      collaboration: { select: { marqueId: true, updatedAt: true } },
    },
  });

  for (const nego of negos) {
    result.negosProcessed += 1;
    const lastExchangeAt =
      maxDate(
        nego.lastModifiedAt,
        nego.dateValidation,
        nego.collaboration?.updatedAt
      ) || nego.updatedAt;

    const sender = parseSenderName(nego.contactMarque);
    let ref: string;
    try {
      const bridge = await bridgeContactToOutreach({
        email: (nego.emailContact || "").trim(),
        firstname: sender.prenom,
        lastname: sender.prenom ? sender.nom : null,
        company: nego.nomMarqueSaisi,
        marqueId: nego.marqueId || nego.collaboration?.marqueId,
        contactKind: nego.contactKind,
        contactAgence: nego.contactAgence,
        language: nego.contactLanguage,
        lastExchangeAt,
        createdById,
        sourceLabel: "négo/collab",
      });
      ref = applyResult(bridge);
    } catch (error) {
      console.warn(`[outreach-bridge] négo ${nego.id} (${nego.emailContact}):`, error);
      result.skipped += 1;
      ref = "skipped:erreur";
    }

    await prisma.negociation
      .update({
        where: { id: nego.id },
        data: { outreachBridgedAt: new Date(), outreachTargetRef: ref },
      })
      .catch((e) => console.warn(`[outreach-bridge] marquage négo ${nego.id}:`, e));
  }

  // --- Collaborations directes terminées (créées sans négo) ---
  // Les collabs issues d'une négo sont bridgées via la négo ; ici on couvre
  // les collabs saisies en direct (formulaire + billing). Le contact client
  // (email billing → contact principal de la marque) entre dans le cycle une
  // fois la collab publiée / facturée / payée (ou perdue).
  const collabs = await prisma.collaboration.findMany({
    where: {
      outreachBridgedAt: null,
      negociation: { is: null },
      statut: { in: ["PERDU", "PUBLIE", "FACTURE_RECUE", "PAYE"] },
    },
    orderBy: { updatedAt: "asc" },
    take: SWEEP_BATCH_SIZE,
    select: {
      id: true,
      marqueId: true,
      contactKind: true,
      contactAgence: true,
      contactLanguage: true,
      datePublication: true,
      factureTalentRecueAt: true,
      marquePayeeAt: true,
      paidAt: true,
      updatedAt: true,
      marque: {
        select: {
          nom: true,
          contacts: {
            where: {
              email: { not: null },
              OR: [{ source: { not: "AO" } }, { source: null }],
            },
            orderBy: [{ principal: "desc" }, { createdAt: "desc" }],
            take: 1,
            select: { email: true, prenom: true, nom: true, language: true },
          },
        },
      },
    },
  });

  for (const collab of collabs) {
    result.collabsProcessed += 1;
    const contact = collab.marque.contacts[0];
    let ref: string;
    if (!contact?.email) {
      result.skipped += 1;
      ref = "skipped:email-manquant";
    } else {
      const lastExchangeAt =
        maxDate(
          collab.datePublication,
          collab.factureTalentRecueAt,
          collab.marquePayeeAt,
          collab.paidAt
        ) || collab.updatedAt;
      try {
        const bridge = await bridgeContactToOutreach({
          email: contact.email,
          firstname: contact.prenom,
          lastname: contact.prenom ? contact.nom : null,
          company: collab.marque.nom,
          marqueId: collab.marqueId,
          contactKind: collab.contactKind,
          contactAgence: collab.contactAgence,
          language: collab.contactLanguage || contact.language,
          lastExchangeAt,
          createdById,
          sourceLabel: "collaboration",
        });
        ref = applyResult(bridge);
      } catch (error) {
        console.warn(`[outreach-bridge] collab ${collab.id} (${contact.email}):`, error);
        result.skipped += 1;
        ref = "skipped:erreur";
      }
    }

    await prisma.collaboration
      .update({
        where: { id: collab.id },
        data: { outreachBridgedAt: new Date(), outreachTargetRef: ref },
      })
      .catch((e) => console.warn(`[outreach-bridge] marquage collab ${collab.id}:`, e));
  }

  for (const demande of demandes) {
    result.demandesProcessed += 1;
    const lastExchangeAt =
      maxDate(
        demande.date,
        demande.sentAt,
        demande.relance1SentAt,
        demande.relance2SentAt,
        demande.replied ? demande.updatedAt : null
      ) || new Date();

    const sender = parseSenderName(extractNameFromHeader(demande.from));
    let ref: string;
    try {
      const bridge = await bridgeContactToOutreach({
        email: extractEmailFromHeader(demande.from),
        firstname: sender.prenom,
        lastname: sender.prenom ? sender.nom : null,
        company: demande.extractedBrand,
        marqueId: demande.marqueId,
        lastExchangeAt,
        createdById,
        sourceLabel: "demande entrante",
        enrollmentMode: "inbound",
      });
      ref = applyResult(bridge);
    } catch (error) {
      console.warn(`[outreach-bridge] demande ${demande.id}:`, error);
      result.skipped += 1;
      ref = "skipped:erreur";
    }

    await prisma.demandeEntrante
      .update({
        where: { id: demande.id },
        data: { outreachBridgedAt: new Date(), outreachTargetRef: ref },
      })
      .catch((e) => console.warn(`[outreach-bridge] marquage demande ${demande.id}:`, e));
  }

  return result;
}

// ============================================================
// Enrôlement des contacts CRM dormants (appelé par /api/cron/relances)
// ============================================================

/** Délai de carence après la création du contact avant enrôlement auto. */
export const CRM_ENROLL_GRACE_DAYS = 14;
/** Fenêtre « échange récent » : marque touchée il y a moins de N jours → on attend. */
const CRM_RECENT_EXCHANGE_DAYS = OUTREACH_RECONTACT_DAYS;
/** Petits lots pour un flux digeste dans la file « à contacter » de Leyna. */
const CRM_ENROLL_BATCH_SIZE = 25;

/** Marquage permanent : les contacts Achats / AO ne rejoignent jamais le cycle. */
const AO_SKIP_REF = "skipped:source-ao";

/**
 * Adresses techniques auxquelles il est inutile d'écrire (no-reply, robots,
 * notifications) : présentes dans le CRM via des mails automatiques archivés.
 */
function isNoReplyEmail(email: string): boolean {
  const local = email.split("@")[0] || "";
  return /no[-_.]?reply|ne[-_.]?pas[-_.]?repondre|do[-_.]?not[-_.]?reply|mailer[-_.]?daemon|notification|automated|donotanswer/i.test(
    local
  );
}

export type PurgeAoOutreachResult = {
  deletedClient: number;
  deletedAgency: number;
  marked: number;
};

/**
 * Règle métier dure : aucun contact `source=AO` (feuille Achats / Appel d'offre)
 * ne doit figurer dans un pipeline outreach. Retire les cibles déjà créées à
 * tort et marque tous les contacts AO pour qu'ils ne soient plus enrôlés.
 */
export async function purgeAoContactsFromOutreach(): Promise<PurgeAoOutreachResult> {
  const result: PurgeAoOutreachResult = {
    deletedClient: 0,
    deletedAgency: 0,
    marked: 0,
  };

  const aoClientTargets = await prisma.outreachTarget.findMany({
    where: { marqueContact: { source: "AO" } },
    select: { id: true },
  });
  if (aoClientTargets.length > 0) {
    const deleted = await prisma.outreachTarget.deleteMany({
      where: { id: { in: aoClientTargets.map((t) => t.id) } },
    });
    result.deletedClient = deleted.count;
  }

  const aoAgencyRefs = await prisma.marqueContact.findMany({
    where: {
      source: "AO",
      outreachTargetRef: { startsWith: "agency:" },
    },
    select: { id: true, outreachTargetRef: true },
  });
  for (const contact of aoAgencyRefs) {
    const targetId = (contact.outreachTargetRef || "").slice("agency:".length).trim();
    if (!targetId) continue;
    const deleted = await prisma.agencyOutreachTarget.deleteMany({
      where: { id: targetId },
    });
    result.deletedAgency += deleted.count;
  }

  const marked = await prisma.marqueContact.updateMany({
    where: { source: "AO" },
    data: {
      outreachEnrolledAt: new Date(),
      outreachTargetRef: AO_SKIP_REF,
    },
  });
  result.marked = marked.count;

  return result;
}

export type CrmEnrollSweepResult = {
  contactsProcessed: number;
  enrolledClient: number;
  enrolledAgency: number;
  alreadyTracked: number;
  skipped: number;
  aoPurge: PurgeAoOutreachResult;
};

/**
 * Filet de sécurité « aucune fiche ne dort » : tout contact marque du CRM avec
 * un email valide, présent dans AUCUN pipeline outreach, dont la marque n'a ni
 * flux actif (négo / collab / inbound / demande en cours) ni échange récent
 * (< 45j), entre automatiquement dans le cycle en TO_CONTACT — il apparaît
 * dans la file « à contacter » (aucun envoi automatique ici).
 *
 * Couvre les fiches marques créées à la main avec leurs contacts (ex. import
 * carto) qui ne passent par aucun flux : sans ce sweep, personne ne les
 * prospecterait jamais.
 *
 * Les contacts Achats / AO (`source=AO`) sont exclus : ils ne rejoignent
 * jamais le cycle (purge + filtre + garde dans la boucle).
 *
 * Routage : domaine/email d'agence connue → Prospection Agences ; sinon →
 * Outreach Clients. Respecte `outreachExcluded` (contact sorti volontairement).
 * Idempotent : chaque contact traité est marqué (outreachEnrolledAt), y compris
 * les emails invalides. Les contacts dont la marque a un flux actif ne sont pas
 * marqués : ils sont exclus par la requête et reviendront naturellement quand
 * le flux sera clos (le pont de clôture couvre alors le contact du deal).
 */
export async function runCrmDormantEnrollSweep(): Promise<CrmEnrollSweepResult> {
  const aoPurge = await purgeAoContactsFromOutreach();

  const result: CrmEnrollSweepResult = {
    contactsProcessed: 0,
    enrolledClient: 0,
    enrolledAgency: 0,
    alreadyTracked: 0,
    skipped: 0,
    aoPurge,
  };

  const createdById = await resolveBridgeCreatedById();
  if (!createdById) {
    console.warn("[crm-enroll] aucun ADMIN actif : sweep ignoré.");
    return result;
  }

  const now = Date.now();
  const graceCutoff = new Date(now - CRM_ENROLL_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const recentCutoff = new Date(now - CRM_RECENT_EXCHANGE_DAYS * 24 * 60 * 60 * 1000);

  const contacts = await prisma.marqueContact.findMany({
    where: {
      outreachEnrolledAt: null,
      outreachExcluded: false,
      diffusionOptOut: false,
      email: { not: null },
      createdAt: { lt: graceCutoff },
      // Achats / AO : jamais dans le cycle (Prisma `not: "AO"` exclut aussi null).
      OR: [{ source: { not: "AO" } }, { source: null }],
      marque: {
        // Flux actif ou échange récent (< 45j) sur la marque → on n'enrôle pas
        // maintenant ; le contact sera repris à un prochain passage (non marqué).
        collaborations: {
          none: {
            OR: [
              { statut: { in: ["NEGO", "GAGNE", "EN_COURS"] } },
              { updatedAt: { gt: recentCutoff } },
            ],
          },
        },
        negociations: {
          none: {
            OR: [
              { statut: { in: ["BROUILLON", "EN_ATTENTE", "EN_DISCUSSION"] } },
              { updatedAt: { gt: recentCutoff } },
            ],
          },
        },
        inboundOpportunities: {
          none: {
            OR: [
              { outreachBridgedAt: null, status: { in: ["NEW", "READY", "IN_REVIEW"] } },
              { receivedAt: { gt: recentCutoff } },
            ],
          },
        },
        demandesEntrantes: {
          none: {
            OR: [
              { outreachBridgedAt: null, status: { notIn: ["repondu", "relance_terminee"] } },
              { date: { gt: recentCutoff } },
            ],
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: CRM_ENROLL_BATCH_SIZE,
    select: {
      id: true,
      email: true,
      prenom: true,
      nom: true,
      poste: true,
      language: true,
      source: true,
      marqueId: true,
      marque: { select: { nom: true } },
    },
  });

  for (const contact of contacts) {
    result.contactsProcessed += 1;
    const email = normalizeEmail(contact.email);
    let ref: string;

    try {
      if ((contact.source || "").toUpperCase() === "AO") {
        result.skipped += 1;
        ref = AO_SKIP_REF;
      } else if (!email || !isValidEmail(email)) {
        result.skipped += 1;
        ref = "skipped:email-invalide";
      } else if (isNoReplyEmail(email)) {
        result.skipped += 1;
        ref = "skipped:no-reply";
      } else {
        const resolution = await resolveOutreachPipeline(email);

        if (resolution.kind === "existing-target") {
          // Déjà suivi quelque part : rien à créer, on trace juste le lien.
          result.alreadyTracked += 1;
          ref = `${resolution.pipeline}:${resolution.target.id}`;
        } else if (resolution.kind === "known-agency") {
          // Contact d'agence rangé par erreur dans une fiche marque : il part
          // en Prospection Agences — jamais dans Outreach Clients.
          const { partner } = resolution;
          const language = contact.language === "en" ? "en" : "fr";
          const agencyContact = await prisma.agencyContact.upsert({
            where: { partnerId_email: { partnerId: partner.id, email } },
            update: {},
            create: {
              partnerId: partner.id,
              prenom: contact.prenom || contact.nom,
              nom: contact.prenom ? contact.nom : null,
              email,
              language,
              createdById,
            },
          });
          const target = await prisma.agencyOutreachTarget.create({
            data: {
              partnerId: partner.id,
              agencyContactId: agencyContact.id,
              firstname: contact.prenom || contact.nom,
              lastname: contact.prenom ? contact.nom : null,
              email,
              company: partner.name,
              partnerSlug: partner.slug,
              language,
              market: partner.market === "BENELUX" ? "BENELUX" : "FR",
              // status TO_CONTACT (défaut) : file « à contacter », pas d'envoi auto.
              createdById,
            },
          });
          result.enrolledAgency += 1;
          ref = `agency:${target.id}`;
        } else {
          const target = await prisma.outreachTarget.create({
            data: {
              marqueId: contact.marqueId,
              marqueContactId: contact.id,
              firstname: contact.prenom || contact.nom,
              lastname: contact.prenom ? contact.nom : null,
              email,
              company: contact.marque.nom,
              language: contact.language === "en" ? "en" : "fr",
              // status TO_CONTACT (défaut) : file « à contacter », pas d'envoi auto.
              createdById,
            },
          });
          result.enrolledClient += 1;
          ref = `client:${target.id}`;
        }
      }
    } catch (error) {
      console.warn(`[crm-enroll] contact ${contact.id} (${email}):`, error);
      result.skipped += 1;
      ref = "skipped:erreur";
    }

    await prisma.marqueContact
      .update({
        where: { id: contact.id },
        data: { outreachEnrolledAt: new Date(), outreachTargetRef: ref },
      })
      .catch((e) => console.warn(`[crm-enroll] marquage contact ${contact.id}:`, e));
  }

  return result;
}
