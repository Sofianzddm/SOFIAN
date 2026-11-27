import { prisma } from "@/lib/prisma";
import {
  notifyGiftContactsReady,
  notifyMarqueCompletionResolved,
} from "@/lib/emails/notify-enrichissement";
import { normalizeMissionBrandKey } from "@/lib/contact-missions";
import { queueMarqueEnrichissement } from "@/lib/envoyer-marque-outreach";
import { isBelgianPays } from "@/lib/pays";

export type AwaitingSourceKind = "pipeline" | "projet" | "gift";

export type ResolvedAwaitingMission = {
  missionId: string;
  brandName: string;
  source: AwaitingSourceKind;
  campaignId: string | null;
  campaignTitle: string | null;
  giftId?: string | null;
  giftReference?: string | null;
  talentId?: string | null;
  talentName?: string | null;
};

export type ResolveAwaitingResult = {
  resolvedCount: number;
  emailableCount: number;
  sources: AwaitingSourceKind[];
  sourceLabel: string;
  missions: ResolvedAwaitingMission[];
  mailSent?: boolean;
  notifiedTo?: string[];
};

/** Seuil auto-déblocage : au moins 2 emails utilisables sur la fiche marque. */
export const MIN_EMAILABLE_CONTACTS_TO_RESOLVE = 2;

function countEmailableFromContacts(
  contacts: Array<{ email: string | null; emailSuggested?: string | null }>
): number {
  return contacts.filter((c) => {
    const email = (c.email || c.emailSuggested || "").trim();
    return email.includes("@");
  }).length;
}

/**
 * Emails CRM par marché pour une marque FR.
 *
 * - FR : contacts marque (ignore `outreachExcluded`, respect opt-out diffusion).
 * - BE : entreprises Benelux liées (`linkedMarqueId`) — pas la fiche FR.
 *   Talent belge → seuls les mails BE comptent pour débloquer.
 */
export async function countEmailableByMarketForMarque(
  marqueId: string
): Promise<{ fr: number; be: number }> {
  const id = String(marqueId || "").trim();
  if (!id) return { fr: 0, be: 0 };

  const [frContacts, beCompanies] = await Promise.all([
    prisma.marqueContact.findMany({
      where: {
        marqueId: id,
        diffusionOptOut: false,
      },
      select: { email: true, emailSuggested: true },
    }),
    prisma.beneluxCompany.findMany({
      where: { linkedMarqueId: id },
      select: {
        contacts: {
          select: { email: true, emailSuggested: true },
        },
      },
    }),
  ]);

  return {
    fr: countEmailableFromContacts(frContacts),
    be: countEmailableFromContacts(beCompanies.flatMap((c) => c.contacts)),
  };
}

/** Total FR+BE (affichage / legacy). Préférer `countEmailableByMarketForMarque`. */
export async function countEmailableContactsForMarque(
  marqueId: string
): Promise<number> {
  const { fr, be } = await countEmailableByMarketForMarque(marqueId);
  return fr + be;
}

/**
 * Nombre d’emails qui comptent pour débloquer une mission selon le pays talent.
 * Belge → fiche BE liée uniquement. Sinon → fiche FR uniquement.
 */
export function emailableCountForTalentMarket(
  counts: { fr: number; be: number },
  talentPays: string | null | undefined
): number {
  return isBelgianPays(talentPays) ? counts.be : counts.fr;
}

/** Mission créée / taguée par le flux gift (strategyReason). */
export function missionReasonLooksLikeGift(reason: string | null | undefined): boolean {
  const r = String(reason || "").trim();
  if (!r) return false;
  const lower = r.toLowerCase();
  return (
    /^gift\b/i.test(r) ||
    lower.includes("demande gift") ||
    /\bgift-\d{4}-\d+\b/i.test(r)
  );
}

export function formatAwaitingSourcesLabel(
  sources: AwaitingSourceKind[],
  projetTitles: string[] = []
): string {
  const hasPipeline = sources.includes("pipeline");
  const hasProjet = sources.includes("projet");
  const hasGift = sources.includes("gift");
  const parts: string[] = [];
  if (hasPipeline) parts.push("Pipeline indiv");
  if (hasProjet) {
    const titles = projetTitles.filter(Boolean);
    parts.push(
      titles.length
        ? `Projet outreach (${titles.join(", ")})`
        : "Projet outreach"
    );
  }
  if (hasGift) parts.push("Gifting");
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return parts.join(" + ");
}

export function contextsFromResolvedMissions(
  missions: ResolvedAwaitingMission[]
): Array<{ kind: AwaitingSourceKind; label: string; path: string }> {
  const seen = new Set<string>();
  const contexts: Array<{ kind: AwaitingSourceKind; label: string; path: string }> =
    [];
  for (const m of missions) {
    const key =
      m.source === "projet"
        ? `projet:${m.campaignId || m.missionId}`
        : m.source === "gift"
          ? `gift:${m.missionId}`
          : "pipeline";
    if (seen.has(key)) continue;
    seen.add(key);
    if (m.source === "projet" && m.campaignId) {
      contexts.push({
        kind: "projet",
        label: m.campaignTitle
          ? `Projet « ${m.campaignTitle} »`
          : "Projet outreach",
        path: `/projets-outreach/${m.campaignId}`,
      });
    } else if (m.source === "gift") {
      contexts.push({
        kind: "gift",
        label: m.giftReference ? `Gifting ${m.giftReference}` : "Gifting",
        path: m.giftId ? `/gifts/${m.giftId}` : "/gifts",
      });
    } else if (m.source === "pipeline") {
      contexts.push({
        kind: "pipeline",
        label: "Pipeline indiv",
        path: "/strategy/projet-individuel-talent/pipeline",
      });
    }
  }
  return contexts;
}

/** Notifie les Casting Managers (mail + in-app) qu'une marque est débloquée. */
export async function notifyCastingMarqueDebloquee(opts: {
  marqueName: string;
  sourceLabel: string;
  emailableCount?: number;
  missions: ResolvedAwaitingMission[];
  actorId?: string | null;
  resolvedByName?: string | null;
}): Promise<{ sent: boolean; to: string[] }> {
  try {
    const castingManagers = await prisma.user.findMany({
      where: { role: "CASTING_MANAGER", actif: true },
      select: { id: true, email: true },
    });
    const recipients = castingManagers.filter(
      (u) => u.id !== opts.actorId && Boolean(u.email)
    );
    const toEmails = recipients.map((u) => u.email).filter(Boolean);

    let resolvedByName = opts.resolvedByName?.trim() || null;
    if (!resolvedByName && opts.actorId) {
      const actor = await prisma.user.findUnique({
        where: { id: opts.actorId },
        select: { prenom: true, nom: true, email: true },
      });
      resolvedByName =
        `${actor?.prenom || ""} ${actor?.nom || ""}`.trim() ||
        actor?.email ||
        null;
    }

    const contexts = contextsFromResolvedMissions(opts.missions);
    const mail = await notifyMarqueCompletionResolved({
      marqueName: opts.marqueName,
      sourceLabel: opts.sourceLabel,
      resolvedByName,
      emailableCount: opts.emailableCount,
      contexts,
      toEmails,
    });

    const primaryPath =
      contexts.find((c) => c.kind === "projet")?.path ||
      contexts[0]?.path ||
      "/enrichissement";

    await Promise.all(
      recipients.map((u) =>
        prisma.notification.create({
          data: {
            userId: u.id,
            type: "GENERAL",
            titre: `${opts.marqueName} enrichie`,
            message: `${resolvedByName || "Quelqu’un"} a débloqué ${opts.marqueName} — ${opts.sourceLabel || "outreach"}. Rédaction possible.`,
            lien: primaryPath,
          },
        })
      )
    );

    return mail;
  } catch (error) {
    console.error("notifyCastingMarqueDebloquee:", error);
    return { sent: false, to: [] };
  }
}

type LinkedGift = {
  id: string;
  reference: string;
  talentName: string;
};

function giftTalentName(talent?: { prenom?: string | null; nom?: string | null } | null) {
  return `${talent?.prenom || ""} ${talent?.nom || ""}`.trim();
}

/** Retrouve les demandes gift liées à une marque (lien multi + marque principale). */
export async function findGiftsLinkedToMarque(
  marqueId: string
): Promise<LinkedGift[]> {
  const [links, principal] = await Promise.all([
    prisma.demandeGiftMarque.findMany({
      where: { marqueId },
      select: {
        demandeGift: {
          select: {
            id: true,
            reference: true,
            talent: { select: { prenom: true, nom: true } },
          },
        },
      },
      take: 20,
    }),
    prisma.demandeGift.findMany({
      where: { marqueId },
      select: {
        id: true,
        reference: true,
        talent: { select: { prenom: true, nom: true } },
      },
      take: 20,
    }),
  ]);

  const byId = new Map<string, LinkedGift>();
  for (const link of links) {
    const g = link.demandeGift;
    if (!g?.id || byId.has(g.id)) continue;
    byId.set(g.id, {
      id: g.id,
      reference: g.reference,
      talentName: giftTalentName(g.talent),
    });
  }
  for (const g of principal) {
    if (!g?.id || byId.has(g.id)) continue;
    byId.set(g.id, {
      id: g.id,
      reference: g.reference,
      talentName: giftTalentName(g.talent),
    });
  }
  return Array.from(byId.values());
}

/**
 * Notifie les Assistantes TM (mail + in-app) qu'un gift est enrichi
 * et prêt à envoyer.
 * Gate stricte : la marque doit être liée à au moins une demande gift
 * (demandeGiftMarque ou marque principale). Sinon → no-op.
 */
export async function notifyAssistanteTmGiftReady(opts: {
  marqueId: string;
  marqueName: string;
  emailableCount?: number;
  missions?: ResolvedAwaitingMission[];
  actorId?: string | null;
  resolvedByName?: string | null;
}): Promise<{ sent: boolean; to: string[] }> {
  try {
    const linked = await findGiftsLinkedToMarque(opts.marqueId);
    if (linked.length === 0) {
      // Marque enrichie hors gift (ou pas encore rattachée) → pas de mail Noémie.
      return { sent: false, to: [] };
    }

    const assistantes = await prisma.user.findMany({
      where: { role: "ASSISTANTE_TM", actif: true },
      select: { id: true, email: true },
    });
    const recipients = assistantes.filter(
      (u) => u.id !== opts.actorId && Boolean(u.email)
    );
    if (recipients.length === 0) return { sent: false, to: [] };

    let resolvedByName = opts.resolvedByName?.trim() || null;
    if (!resolvedByName && opts.actorId) {
      const actor = await prisma.user.findUnique({
        where: { id: opts.actorId },
        select: { prenom: true, nom: true, email: true },
      });
      resolvedByName =
        `${actor?.prenom || ""} ${actor?.nom || ""}`.trim() ||
        actor?.email ||
        null;
    }

    const primary = linked[0];
    const giftPath = `/gifts/${primary.id}`;
    const giftReference = primary.reference || null;
    const talentName = primary.talentName || null;
    const toEmails = recipients.map((u) => u.email).filter(Boolean);

    const mail = await notifyGiftContactsReady({
      marqueName: opts.marqueName,
      giftReference,
      talentName,
      resolvedByName,
      emailableCount: opts.emailableCount,
      giftPath,
      toEmails,
    });

    const contactNote =
      typeof opts.emailableCount === "number" && opts.emailableCount > 0
        ? `${opts.emailableCount} contact${opts.emailableCount > 1 ? "s" : ""} prêt${opts.emailableCount > 1 ? "s" : ""} à envoyer`
        : "contacts prêts à envoyer";
    const titre = talentName
      ? `Gift prêt — ${talentName} · ${opts.marqueName}`
      : `Gift prêt — ${opts.marqueName}`;

    await Promise.all(
      recipients.map((u) =>
        prisma.notification.create({
          data: {
            userId: u.id,
            type: "GENERAL",
            titre,
            message: `${resolvedByName || "Quelqu’un"} a enrichi ${opts.marqueName}${
              talentName ? ` pour ${talentName}` : ""
            }${giftReference ? ` (${giftReference})` : ""} — ${contactNote}.`,
            lien: giftPath,
          },
        })
      )
    );

    return mail;
  } catch (error) {
    console.error("notifyAssistanteTmGiftReady:", error);
    return { sent: false, to: [] };
  }
}

/**
 * Après écriture d’un email CRM : tente le déblocage awaiting (best-effort).
 * Respecte la règle marché (FR → talents non belges ; BE → talents belges).
 */
export async function tryResolveAwaitingAfterEmailWrite(
  marqueId: string | null | undefined,
  opts?: { actorId?: string | null }
): Promise<number> {
  const id = String(marqueId || "").trim();
  if (!id) return 0;
  try {
    const resolved = await resolveAwaitingEnrichissementForMarque({
      marqueId: id,
      actorId: opts?.actorId || null,
      notifyCasting: false,
    });
    return resolved.resolvedCount || 0;
  } catch (e) {
    console.error("tryResolveAwaitingAfterEmailWrite:", e);
    return 0;
  }
}

/**
 * Débloque les missions en attente d'enrichissement d'une marque.
 *
 * Règle marché :
 * - talent belge → ≥ 2 emails sur la fiche BE liée (FR ne suffit pas)
 * - sinon → ≥ 2 emails sur la fiche FR
 *
 * Best-effort : n'échoue jamais l'action appelante.
 */
export async function resolveAwaitingEnrichissementForMarque(opts: {
  marqueId: string;
  actorId?: string | null;
  /** Si true, résout même sans vérifier les emails (forcer). */
  force?: boolean;
  /** Si false, ne mail pas Casting (défaut: true). */
  notifyCasting?: boolean;
}): Promise<ResolveAwaitingResult> {
  const empty: ResolveAwaitingResult = {
    resolvedCount: 0,
    emailableCount: 0,
    sources: [],
    sourceLabel: "",
    missions: [],
  };

  try {
    const marqueId = String(opts.marqueId || "").trim();
    if (!marqueId) return empty;

    const marque = await prisma.marque.findUnique({
      where: { id: marqueId },
      select: { id: true, nom: true },
    });
    if (!marque) return empty;

    const marketCounts = await countEmailableByMarketForMarque(marqueId);
    const emailableCount = marketCounts.fr + marketCounts.be;

    const awaiting = await prisma.contactMission.findMany({
      where: {
        marqueId,
        awaitingContactsCompletion: true,
        status: { not: "CANCELLED" },
      },
      select: {
        id: true,
        targetBrand: true,
        strategyReason: true,
        campaignId: true,
        campaign: { select: { id: true, title: true } },
        talent: { select: { pays: true } },
      },
      take: 200,
    });
    if (awaiting.length === 0) {
      return { ...empty, emailableCount };
    }

    const toResolve = opts.force
      ? awaiting
      : awaiting.filter((m) => {
          const n = emailableCountForTalentMarket(marketCounts, m.talent?.pays);
          return n >= MIN_EMAILABLE_CONTACTS_TO_RESOLVE;
        });

    if (toResolve.length === 0) {
      return { ...empty, emailableCount };
    }

    const ids = toResolve.map((m) => m.id);
    await prisma.contactMission.updateMany({
      where: { id: { in: ids } },
      data: { awaitingContactsCompletion: false },
    });

    const linkedGifts = await findGiftsLinkedToMarque(marqueId);
    const giftByReference = new Map(
      linkedGifts.map((g) => [g.reference.toUpperCase(), g])
    );
    const primaryGift = linkedGifts[0] || null;

    const missions: ResolvedAwaitingMission[] = toResolve.map((m) => {
      const reason = String(m.strategyReason || "");
      const isGift = missionReasonLooksLikeGift(reason);
      const source: AwaitingSourceKind = m.campaignId
        ? "projet"
        : isGift
          ? "gift"
          : "pipeline";
      const refMatch = reason.match(/\b(GIFT-\d{4}-\d+)\b/i);
      const refFromReason = refMatch?.[1]?.toUpperCase() || null;
      const matchedGift =
        (refFromReason && giftByReference.get(refFromReason)) ||
        (source === "gift" ? primaryGift : null);
      return {
        missionId: m.id,
        brandName: marque.nom || m.targetBrand,
        source,
        campaignId: m.campaign?.id ?? null,
        campaignTitle: m.campaign?.title ?? null,
        giftId: matchedGift?.id ?? null,
        giftReference: matchedGift?.reference || refFromReason || null,
      };
    });

    const sourceSet = new Set<AwaitingSourceKind>(missions.map((m) => m.source));
    const sources = Array.from(sourceSet);
    const projetTitles = [
      ...new Set(
        missions
          .filter((m) => m.source === "projet")
          .map((m) => m.campaignTitle || "")
          .filter(Boolean)
      ),
    ];
    const sourceLabel = formatAwaitingSourcesLabel(sources, projetTitles);

    for (const m of toResolve) {
      if (!m.campaignId || !opts.actorId) continue;
      await prisma.prospectingCampaignEvent.create({
        data: {
          campaignId: m.campaignId,
          type: "MARQUE_COMPLETION_RESOLVED",
          message: `${marque.nom} — contacts CRM complétés (auto)`,
          payload: {
            missionId: m.id,
            marqueId,
            marqueName: marque.nom,
            source: "auto-resolve-enrichissement",
            emailableCount,
            emailableFr: marketCounts.fr,
            emailableBe: marketCounts.be,
            talentBelgian: isBelgianPays(m.talent?.pays),
          },
          actorId: opts.actorId,
        },
      });
    }

    let mailSent = false;
    let notifiedTo: string[] = [];
    if (opts.notifyCasting !== false) {
      const mail = await notifyCastingMarqueDebloquee({
        marqueName: marque.nom,
        sourceLabel,
        emailableCount,
        missions,
        actorId: opts.actorId,
      });
      mailSent = mail.sent;
      notifiedTo = mail.to;
    }

    // Assistante TM uniquement si la marque est liée à un vrai gift.
    const giftMail = await notifyAssistanteTmGiftReady({
      marqueId,
      marqueName: marque.nom,
      emailableCount,
      missions,
      actorId: opts.actorId,
    });
    mailSent = mailSent || giftMail.sent;
    notifiedTo = Array.from(new Set([...notifiedTo, ...giftMail.to]));

    return {
      resolvedCount: missions.length,
      emailableCount,
      sources,
      sourceLabel,
      missions,
      mailSent,
      notifiedTo,
    };
  } catch (error) {
    console.error("resolveAwaitingEnrichissementForMarque:", error);
    return empty;
  }
}

/**
 * Pose / rafraîchit une mission gift « en attente d'enrichissement » pour une
 * marque (fichier Gifting + file principale si contacts sans email).
 * Ne touche pas aux missions projet / pipeline existantes.
 */
export async function ensureGiftMarqueInAwaitingEnrichissement(opts: {
  marqueId: string;
  giftReference?: string | null;
  talentId?: string | null;
  talentName?: string | null;
  createdById?: string | null;
  /** Si false, ne crée rien quand la marque a déjà assez d'emails. Défaut true = forcer le signal gift. */
  onlyIfNeedsContacts?: boolean;
}): Promise<{
  missionId: string | null;
  created: boolean;
  skipped: boolean;
  emailableCount: number;
  lookupQueued: number;
}> {
  const marqueId = String(opts.marqueId || "").trim();
  if (!marqueId) {
    return {
      missionId: null,
      created: false,
      skipped: true,
      emailableCount: 0,
      lookupQueued: 0,
    };
  }

  const marque = await prisma.marque.findUnique({
    where: { id: marqueId },
    select: { id: true, nom: true },
  });
  if (!marque) {
    return {
      missionId: null,
      created: false,
      skipped: true,
      emailableCount: 0,
      lookupQueued: 0,
    };
  }

  const marketCounts = await countEmailableByMarketForMarque(marqueId);
  let talentPays: string | null = null;
  if (opts.talentId) {
    const talent = await prisma.talent.findUnique({
      where: { id: opts.talentId },
      select: { pays: true },
    });
    talentPays = talent?.pays ?? null;
  }
  const emailableCount = emailableCountForTalentMarket(
    marketCounts,
    talentPays
  );

  if (
    opts.onlyIfNeedsContacts !== false &&
    emailableCount >= MIN_EMAILABLE_CONTACTS_TO_RESOLVE
  ) {
    return {
      missionId: null,
      created: false,
      skipped: true,
      emailableCount,
      lookupQueued: 0,
    };
  }

  const giftLabel = opts.giftReference
    ? `Gift ${opts.giftReference}`
    : "Demande Gift";
  const strategyReason = `${giftLabel} — contacts CRM à compléter`;
  const talentName = (opts.talentName || "").trim() || "Gift";

  const existing = await prisma.contactMission.findFirst({
    where: {
      marqueId,
      awaitingContactsCompletion: true,
      status: { not: "CANCELLED" },
      campaignId: null,
    },
    select: { id: true, strategyReason: true },
    orderBy: { contactsCompletionRequestedAt: "desc" },
  });
  const reusable =
    existing && missionReasonLooksLikeGift(existing.strategyReason)
      ? existing
      : null;

  let missionId: string;
  let created = false;
  if (reusable) {
    missionId = reusable.id;
    await prisma.contactMission.update({
      where: { id: reusable.id },
      data: {
        contactsCompletionRequestedAt: new Date(),
        strategyReason,
        ...(opts.talentId ? { talentId: opts.talentId } : {}),
      },
    });
  } else {
    let createdById = String(opts.createdById || "").trim();
    if (!createdById) {
      const fallback = await prisma.user.findFirst({
        where: {
          actif: true,
          role: { in: ["ADMIN", "CASTING_MANAGER"] },
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      createdById = fallback?.id || "";
    }
    if (!createdById) {
      return {
        missionId: null,
        created: false,
        skipped: true,
        emailableCount,
        lookupQueued: 0,
      };
    }
    const mission = await prisma.contactMission.create({
      data: {
        talentId: opts.talentId || null,
        creatorName: talentName,
        targetBrand: marque.nom,
        targetBrandKey: normalizeMissionBrandKey(marque.nom),
        marqueId,
        strategyReason,
        awaitingContactsCompletion: true,
        contactsCompletionRequestedAt: new Date(),
        createdById,
      },
      select: { id: true },
    });
    missionId = mission.id;
    created = true;
  }

  let lookupQueued = 0;
  try {
    const queued = await queueMarqueEnrichissement({ marqueId });
    if (queued.ok) lookupQueued = queued.queued;
  } catch (e) {
    console.warn(
      "[ensureGiftAwaiting] queue soft:",
      e instanceof Error ? e.message : e
    );
  }

  return {
    missionId,
    created,
    skipped: false,
    emailableCount,
    lookupQueued,
  };
}

/** True si la fiche n’a pas assez d’emails pour sortir de la file (seuil = 2). */
export function needsEnrichissementContacts(emailableCount: number): boolean {
  return emailableCount < MIN_EMAILABLE_CONTACTS_TO_RESOLVE;
}

/**
 * Auto-file « Marques en attente » si ≤ 1 contact emailable (ou pas de fiche).
 * Silencieux (pas d’email) — évite le clic manuel Enrichir.
 * @returns true si le flag vient d’être posé
 */
export async function autoMarkAwaitingContactsIfEmpty(opts: {
  missionId: string;
  /** Si déjà calculé (ready-to-send) — saute le recompte CRM. */
  knownEmpty?: boolean;
}): Promise<boolean> {
  const missionId = String(opts.missionId || "").trim();
  if (!missionId) return false;

  const mission = await prisma.contactMission.findUnique({
    where: { id: missionId },
    select: {
      id: true,
      awaitingContactsCompletion: true,
      marqueId: true,
      targetBrand: true,
      talent: { select: { pays: true } },
      marque: { select: { nom: true } },
    },
  });
  if (!mission || mission.awaitingContactsCompletion) return false;

  let needsQueue = Boolean(opts.knownEmpty);
  if (!opts.knownEmpty) {
    if (!mission.marqueId) {
      needsQueue = true;
    } else {
      // Talent belge → mails BE liés seulement ; sinon mails FR seulement.
      const counts = await countEmailableByMarketForMarque(mission.marqueId);
      let emailable = emailableCountForTalentMarket(
        counts,
        mission.talent?.pays
      );

      // Talent belge : si BE lié vide, tente les homonymes Benelux (non liés).
      if (
        needsEnrichissementContacts(emailable) &&
        isBelgianPays(mission.talent?.pays)
      ) {
        const { loadBrandContactsFrAndBe } = await import(
          "@/lib/crm-brand-contacts"
        );
        const brandNames = [
          mission.marque?.nom,
          mission.targetBrand,
        ].filter((n): n is string => Boolean(n && String(n).trim()));
        const merged = await loadBrandContactsFrAndBe({
          marqueIds: [mission.marqueId],
          brandNames,
          requireEmail: true,
        });
        emailable = merged.filter((c) => {
          if (c.market !== "BENELUX") return false;
          const email = (c.email || "").trim();
          return email.includes("@");
        }).length;
      }
      needsQueue = needsEnrichissementContacts(emailable);
    }
  }
  if (!needsQueue) return false;

  const updated = await prisma.contactMission.updateMany({
    where: { id: missionId, awaitingContactsCompletion: false },
    data: {
      awaitingContactsCompletion: true,
      contactsCompletionRequestedAt: new Date(),
    },
  });
  return updated.count > 0;
}

const GIFT_STRATEGY_REASON_OR = [
  { strategyReason: { startsWith: "Gift ", mode: "insensitive" as const } },
  {
    strategyReason: {
      contains: "Demande Gift",
      mode: "insensitive" as const,
    },
  },
  {
    strategyReason: {
      contains: "demande gift",
      mode: "insensitive" as const,
    },
  },
  { strategyReason: { contains: "GIFT-", mode: "insensitive" as const } },
] as const;

/**
 * Remonte automatiquement en file Enrichissement :
 * - missions projet outreach ouvertes (≤ 1 email)
 * - missions gift (campaignId null + reason gift) encore non flaggées
 * Best-effort — appelé au chargement de /enrichissement.
 */
export async function autoPromoteOpenProjetMissionsNeedingEnrichissement(
  take = 5000
): Promise<number> {
  try {
    const openMissions = await prisma.contactMission.findMany({
      where: {
        awaitingContactsCompletion: false,
        status: { not: "CANCELLED" },
        OR: [
          {
            campaignId: { not: null },
            campaign: { status: { not: "CLOSED" } },
          },
          {
            campaignId: null,
            OR: [...GIFT_STRATEGY_REASON_OR],
          },
        ],
      },
      select: {
        id: true,
        marqueId: true,
        talent: { select: { pays: true } },
      },
      orderBy: { updatedAt: "desc" },
      take,
    });
    if (openMissions.length === 0) return 0;

    const marqueIds = Array.from(
      new Set(
        openMissions
          .map((m) => m.marqueId)
          .filter((id): id is string => Boolean(id))
      )
    );

    const frByMarque = new Map<string, number>();
    const beByMarque = new Map<string, number>();
    if (marqueIds.length > 0) {
      const [rows, beCompanies] = await Promise.all([
        prisma.marqueContact.groupBy({
          by: ["marqueId"],
          where: {
            marqueId: { in: marqueIds },
            diffusionOptOut: false,
            OR: [
              { email: { contains: "@" } },
              { emailSuggested: { contains: "@" } },
            ],
          },
          _count: { _all: true },
        }),
        prisma.beneluxCompany.findMany({
          where: { linkedMarqueId: { in: marqueIds } },
          select: {
            linkedMarqueId: true,
            contacts: {
              where: {
                OR: [
                  { email: { contains: "@" } },
                  { emailSuggested: { contains: "@" } },
                ],
              },
              select: { id: true },
            },
          },
        }),
      ]);
      for (const row of rows) {
        frByMarque.set(row.marqueId, row._count._all);
      }
      for (const company of beCompanies) {
        const mid = company.linkedMarqueId;
        if (!mid) continue;
        beByMarque.set(
          mid,
          (beByMarque.get(mid) || 0) + company.contacts.length
        );
      }
    }

    const toMark = openMissions
      .filter((m) => {
        if (!m.marqueId) return true;
        const counts = {
          fr: frByMarque.get(m.marqueId) || 0,
          be: beByMarque.get(m.marqueId) || 0,
        };
        return needsEnrichissementContacts(
          emailableCountForTalentMarket(counts, m.talent?.pays)
        );
      })
      .map((m) => m.id);

    if (toMark.length === 0) return 0;
    return autoMarkAwaitingContactsBatch(toMark);
  } catch (error) {
    console.error("autoPromoteOpenProjetMissionsNeedingEnrichissement:", error);
    return 0;
  }
}

/**
 * Demandes gift ouvertes (ATTENTE_MARQUE / EN_COURS / EN_ATTENTE) dont la
 * fiche a ≤ 1 email → crée / remonte la mission gift dans /enrichissement.
 */
export async function autoEnsureOpenGiftDemandesNeedingEnrichissement(
  take = 400
): Promise<number> {
  try {
    const demandes = await prisma.demandeGift.findMany({
      where: {
        archivedAt: null,
        statut: { in: ["ATTENTE_MARQUE", "EN_COURS", "EN_ATTENTE"] },
      },
      select: {
        id: true,
        reference: true,
        talentId: true,
        marqueId: true,
        tmId: true,
        accountManagerId: true,
        talent: { select: { prenom: true, nom: true } },
        marques: { select: { marqueId: true } },
      },
      orderBy: { updatedAt: "desc" },
      take,
    });
    if (demandes.length === 0) return 0;

    let promoted = 0;
    for (const d of demandes) {
      const marqueIds = Array.from(
        new Set(
          [d.marqueId, ...d.marques.map((m) => m.marqueId)].filter(
            (id): id is string => Boolean(id)
          )
        )
      );
      if (marqueIds.length === 0) continue;
      const talentName =
        `${d.talent?.prenom || ""} ${d.talent?.nom || ""}`.trim() || "Gift";
      const createdById = d.accountManagerId || d.tmId || undefined;
      for (const marqueId of marqueIds) {
        const result = await ensureGiftMarqueInAwaitingEnrichissement({
          marqueId,
          giftReference: d.reference,
          talentId: d.talentId,
          talentName,
          createdById,
          onlyIfNeedsContacts: true,
        }).catch((e) => {
          console.warn(
            "[autoEnsureGift] soft:",
            e instanceof Error ? e.message : e
          );
          return null;
        });
        if (result && !result.skipped) promoted += 1;
      }
    }
    return promoted;
  } catch (error) {
    console.error("autoEnsureOpenGiftDemandesNeedingEnrichissement:", error);
    return 0;
  }
}

/** Batch : pose le flag pour une liste de missions déjà classées « à enrichir ». */
export async function autoMarkAwaitingContactsBatch(
  missionIds: string[]
): Promise<number> {
  const ids = Array.from(
    new Set(missionIds.map((id) => String(id || "").trim()).filter(Boolean))
  );
  if (ids.length === 0) return 0;
  const updated = await prisma.contactMission.updateMany({
    where: {
      id: { in: ids },
      awaitingContactsCompletion: false,
    },
    data: {
      awaitingContactsCompletion: true,
      contactsCompletionRequestedAt: new Date(),
    },
  });
  return updated.count;
}
