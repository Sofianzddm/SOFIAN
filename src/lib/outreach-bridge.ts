/**
 * Pont vers le cycle outreach 45 jours — « on n'oublie personne ».
 *
 * Deux rôles :
 *  1. `resolveOutreachPipeline(email)` : dit si un email est déjà suivi dans un
 *     des trois pipelines outreach (clients FR, agences, Benelux) ou s'il
 *     appartient à une agence partenaire connue (match email ou domaine).
 *     Sert aussi de garde-fou anti double-prospection à la création manuelle.
 *  2. `bridgeContactToOutreach(...)` : fait entrer un contact dans le bon
 *     pipeline avec un compteur 45j calé sur le dernier échange. Utilisé par le
 *     sweep de clôture des flux entrants (`runOutreachBridgeSweep`, appelé par
 *     le cron /api/cron/relances) : un inbound / une demande entrante terminé
 *     (réponse reçue ou séquence de relances épuisée) rejoint le cycle
 *     perpétuel au lieu de disparaître des radars.
 *
 * Routage : email déjà suivi → on repousse simplement son compteur ; contact
 * qualifié « AGENCE » à la saisie (négo/inbound) → pipeline Prospection
 * Agences, agence créée à la volée si inconnue ; email / domaine d'une agence
 * partenaire (Partner) → pipeline Prospection Agences ; sinon → pipeline
 * Outreach Clients (marque résolue/créée via le CRM).
 */

import { prisma } from "@/lib/prisma";
import { OUTREACH_RECONTACT_DAYS } from "@/lib/outreach-send";
import { findOrCreatePartnerByName } from "@/lib/agency-partner";
import {
  emailDomain,
  isGenericEmailDomain,
  ensureMarqueContact,
  linkMarqueFromBrandName,
  brandNameFromEmailDomain,
  parseSenderName,
} from "@/lib/marque-resolver";

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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Cherche l'email dans les trois tables de targets outreach, puis parmi les
 * contacts d'agences partenaires (match exact puis match par domaine — jamais
 * sur un domaine grand public type gmail).
 */
export async function resolveOutreachPipeline(
  rawEmail: string
): Promise<PipelineResolution> {
  const email = rawEmail.trim().toLowerCase();
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
 */
export async function findCrossPipelineConflict(
  email: string,
  ownPipeline: OutreachPipeline
): Promise<{ pipeline: OutreachPipeline; label: string; company: string } | null> {
  const resolution = await resolveOutreachPipeline(email);
  if (resolution.kind !== "existing-target") return null;
  if (resolution.pipeline === ownPipeline) return null;
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
  /** Date du dernier échange : le compteur 45j part de là. */
  lastExchangeAt: Date;
  /** Utilisateur porteur du target créé (notifications de cycle). */
  createdById: string;
  /** Libellé du flux d'origine, pour la raison affichée (ex. "inbound"). */
  sourceLabel?: string;
};

export type BridgeResult =
  | {
      ok: true;
      action: "created" | "rescheduled" | "skipped-stopped";
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

function addRecontactDelay(from: Date): Date {
  return new Date(from.getTime() + OUTREACH_RECONTACT_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Fait entrer (ou re-planifie) un contact dans le cycle outreach 45j.
 *
 *  - Email déjà suivi (quel que soit le pipeline) : on repousse son
 *    `nextRecontactAt` à dernier échange + 45j (jamais avancé) et on le remet
 *    en WAITING s'il attendait un envoi — inutile de le prospecter juste après
 *    un échange. Un target STOPPED reste stoppé (respect du stop manuel).
 *  - Agence partenaire connue (email/domaine) : entre dans Prospection Agences.
 *  - Sinon : entre dans Outreach Clients (marque résolue/créée via le CRM).
 */
export async function bridgeContactToOutreach(input: BridgeInput): Promise<BridgeResult> {
  const email = (input.email || "").trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    return { ok: false, reason: "email-invalide" };
  }

  const nextRecontactAt = addRecontactDelay(input.lastExchangeAt);
  const language = input.language === "en" ? "en" : "fr";
  const sourceLabel = input.sourceLabel || "échange entrant";
  const reason =
    `Échange ${sourceLabel} clôturé le ${formatFrDate(input.lastExchangeAt)} : ` +
    `recontact planifié au ${formatFrDate(nextRecontactAt)} (J+${OUTREACH_RECONTACT_DAYS}).`;

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
    // pipeline marque alors qu'un doublon historique existait) : on le
    // re-planifie au lieu de violer l'unicité de l'email.
    const existing = await prisma.agencyOutreachTarget.findUnique({
      where: { email },
      select: { id: true, company: true, status: true, nextRecontactAt: true },
    });
    if (existing) {
      if (existing.status === "STOPPED") {
        return {
          ok: true,
          action: "skipped-stopped",
          pipeline: "agency",
          targetId: existing.id,
          company: existing.company,
        };
      }
      const keepExisting =
        existing.nextRecontactAt &&
        existing.nextRecontactAt.getTime() >= nextRecontactAt.getTime();
      await prisma.agencyOutreachTarget.update({
        where: { id: existing.id },
        data: {
          status: "WAITING",
          ...(keepExisting ? {} : { nextRecontactAt }),
          autoRescheduleReason: reason,
          autoRescheduledAt: new Date(),
        },
      });
      return {
        ok: true,
        action: "rescheduled",
        pipeline: "agency",
        targetId: existing.id,
        company: existing.company,
      };
    }

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
        status: "WAITING",
        nextRecontactAt,
        autoRescheduleReason: reason,
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

  // 1. Déjà suivi quelque part : on repousse juste son compteur.
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

      const agencyName =
        (input.contactAgence || "").trim() || target.company || (input.company || "").trim();
      if (!agencyName) return { ok: false, reason: "agence-sans-nom" };
      const partner = await findOrCreatePartnerByName(agencyName, input.createdById);
      return enterAgencyPipeline(partner);
    }

    // Jamais avancé : si le compteur existant est déjà plus loin, on le garde.
    const keepExisting =
      target.nextRecontactAt &&
      target.nextRecontactAt.getTime() >= nextRecontactAt.getTime();
    const data = {
      status: "WAITING" as const,
      ...(keepExisting ? {} : { nextRecontactAt }),
      autoRescheduleReason: reason,
      autoRescheduledAt: new Date(),
    };

    if (pipeline === "client") {
      await prisma.outreachTarget.update({ where: { id: target.id }, data });
    } else if (pipeline === "agency") {
      await prisma.agencyOutreachTarget.update({ where: { id: target.id }, data });
    } else {
      await prisma.beneluxOutreachTarget.update({ where: { id: target.id }, data });
    }

    return {
      ok: true,
      action: "rescheduled",
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
  // le Partner à la volée (nom saisi, sinon marque/domaine) et il entre en
  // Prospection Agences — il ne passera jamais par Outreach Clients.
  if (forcedAgency) {
    const agencyName =
      (input.contactAgence || "").trim() ||
      (input.company || "").trim() ||
      brandNameFromEmailDomain(email) ||
      "";
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

  const target = await prisma.outreachTarget.create({
    data: {
      marqueId,
      marqueContactId: marqueContact?.id || null,
      firstname,
      lastname: lastname || null,
      email,
      company,
      language,
      status: "WAITING",
      nextRecontactAt,
      autoRescheduleReason: reason,
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
  rescheduled: number;
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
  const trimmed = (fromValue || "").trim();
  const bracketMatch = trimmed.match(/<([^>]+)>/);
  if (bracketMatch?.[1]) return bracketMatch[1].trim().toLowerCase();
  return trimmed.toLowerCase();
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

/**
 * Fait entrer dans le cycle outreach 45j les flux clôturés :
 *  - InboundOpportunity : réponse reçue, séquence R1/R2 épuisée, ou archivée
 *    (hors CONVERTED, géré par la conversion elle-même).
 *  - DemandeEntrante : status "repondu" ou "relance_terminee".
 *  - Negociation : refusée/annulée, ou devenue collaboration (hors collab
 *    encore en négo) — le contact marque du deal revient dans la boucle.
 *  - Collaboration directe (sans négo) : publiée / facturée / payée / perdue —
 *    le contact billing de la marque revient dans la boucle.
 *
 * Idempotent : chaque ligne traitée est marquée (outreachBridgedAt), y compris
 * en cas d'échec de routage (ref "skipped:<raison>") pour ne pas boucler.
 */
export async function runOutreachBridgeSweep(): Promise<BridgeSweepResult> {
  const result: BridgeSweepResult = {
    inboundProcessed: 0,
    demandesProcessed: 0,
    negosProcessed: 0,
    collabsProcessed: 0,
    created: 0,
    rescheduled: 0,
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
    else if (bridge.action === "rescheduled") result.rescheduled += 1;
    else result.skipped += 1;
    return `${bridge.pipeline}:${bridge.targetId}`;
  };

  // --- InboundOpportunity clôturées ---
  const inbounds = await prisma.inboundOpportunity.findMany({
    where: {
      outreachBridgedAt: null,
      status: { not: "CONVERTED" },
      OR: [
        { replied: true },
        { relance2SentAt: { not: null } },
        { status: "ARCHIVED" },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: SWEEP_BATCH_SIZE,
    select: {
      id: true,
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

  // --- DemandeEntrante clôturées ---
  const demandes = await prisma.demandeEntrante.findMany({
    where: {
      outreachBridgedAt: null,
      status: { in: ["repondu", "relance_terminee"] },
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
            where: { email: { not: null } },
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

export type CrmEnrollSweepResult = {
  contactsProcessed: number;
  enrolledClient: number;
  enrolledAgency: number;
  alreadyTracked: number;
  skipped: number;
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
 * Routage : domaine/email d'agence connue → Prospection Agences ; sinon →
 * Outreach Clients. Respecte `outreachExcluded` (contact sorti volontairement).
 * Idempotent : chaque contact traité est marqué (outreachEnrolledAt), y compris
 * les emails invalides. Les contacts dont la marque a un flux actif ne sont pas
 * marqués : ils sont exclus par la requête et reviendront naturellement quand
 * le flux sera clos (le pont de clôture couvre alors le contact du deal).
 */
export async function runCrmDormantEnrollSweep(): Promise<CrmEnrollSweepResult> {
  const result: CrmEnrollSweepResult = {
    contactsProcessed: 0,
    enrolledClient: 0,
    enrolledAgency: 0,
    alreadyTracked: 0,
    skipped: 0,
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
      email: { not: null },
      createdAt: { lt: graceCutoff },
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
      marqueId: true,
      marque: { select: { nom: true } },
    },
  });

  for (const contact of contacts) {
    result.contactsProcessed += 1;
    const email = (contact.email || "").trim().toLowerCase();
    let ref: string;

    try {
      if (!email || !isValidEmail(email)) {
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
