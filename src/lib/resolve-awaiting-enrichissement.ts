import { prisma } from "@/lib/prisma";
import {
  notifyGiftContactsReady,
  notifyMarqueCompletionResolved,
} from "@/lib/emails/notify-enrichissement";

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

function hasEmailableContact(
  contacts: Array<{ email: string | null; emailSuggested?: string | null }>
): { ok: boolean; count: number } {
  const count = contacts.filter((c) => {
    const email = (c.email || c.emailSuggested || "").trim();
    return email.includes("@");
  }).length;
  return { ok: count >= MIN_EMAILABLE_CONTACTS_TO_RESOLVE, count };
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
 * Si la fiche marque a au moins un email utilisable, débloque toutes les
 * missions en attente d'enrichissement (pipeline et/ou projets).
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
      select: {
        id: true,
        nom: true,
        contacts: {
          where: { outreachExcluded: false, diffusionOptOut: false },
          select: { email: true, emailSuggested: true },
        },
      },
    });
    if (!marque) return empty;

    const { ok, count: emailableCount } = hasEmailableContact(marque.contacts);
    if (!opts.force && !ok) {
      return { ...empty, emailableCount };
    }

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
      },
      take: 200,
    });
    if (awaiting.length === 0) {
      return { ...empty, emailableCount };
    }

    const ids = awaiting.map((m) => m.id);
    await prisma.contactMission.updateMany({
      where: { id: { in: ids } },
      data: { awaitingContactsCompletion: false },
    });

    const linkedGifts = await findGiftsLinkedToMarque(marqueId);
    const giftByReference = new Map(
      linkedGifts.map((g) => [g.reference.toUpperCase(), g])
    );
    const primaryGift = linkedGifts[0] || null;

    const missions: ResolvedAwaitingMission[] = awaiting.map((m) => {
      const reason = String(m.strategyReason || "");
      const isGift =
        /^gift\b/i.test(reason.trim()) ||
        reason.toLowerCase().includes("demande gift");
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

    for (const m of awaiting) {
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
