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
 * Routage : email déjà suivi → on repousse simplement son compteur ; email /
 * domaine d'une agence partenaire (Partner) → pipeline Prospection Agences ;
 * sinon → pipeline Outreach Clients (marque résolue/créée via le CRM).
 */

import { prisma } from "@/lib/prisma";
import { OUTREACH_RECONTACT_DAYS } from "@/lib/outreach-send";
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

  const fallbackName = parseSenderName(
    [input.firstname, input.lastname].filter(Boolean).join(" ") ||
      email.split("@")[0]
  );
  const firstname = (input.firstname || "").trim() || fallbackName.prenom || fallbackName.nom;
  const lastname = (input.lastname || "").trim() || (fallbackName.prenom ? fallbackName.nom : "");

  // 2. Agence partenaire connue : pipeline Prospection Agences.
  if (resolution.kind === "known-agency") {
    const { partner } = resolution;

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
 * Fait entrer dans le cycle outreach 45j les flux entrants clôturés :
 *  - InboundOpportunity : réponse reçue, séquence R1/R2 épuisée, ou archivée
 *    (hors CONVERTED, géré par la conversion elle-même).
 *  - DemandeEntrante : status "repondu" ou "relance_terminee".
 *
 * Idempotent : chaque ligne traitée est marquée (outreachBridgedAt), y compris
 * en cas d'échec de routage (ref "skipped:<raison>") pour ne pas boucler.
 */
export async function runOutreachBridgeSweep(): Promise<BridgeSweepResult> {
  const result: BridgeSweepResult = {
    inboundProcessed: 0,
    demandesProcessed: 0,
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
