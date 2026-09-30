import { prisma } from "@/lib/prisma";
import { notifyMarqueCompletionResolved } from "@/lib/emails/notify-enrichissement";

export type AwaitingSourceKind = "pipeline" | "projet";

export type ResolvedAwaitingMission = {
  missionId: string;
  brandName: string;
  source: AwaitingSourceKind;
  campaignId: string | null;
  campaignTitle: string | null;
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

function hasEmailableContact(
  contacts: Array<{ email: string | null; emailSuggested?: string | null }>
): { ok: boolean; count: number } {
  const count = contacts.filter((c) => {
    const email = (c.email || c.emailSuggested || "").trim();
    return email.includes("@");
  }).length;
  return { ok: count > 0, count };
}

export function formatAwaitingSourcesLabel(
  sources: AwaitingSourceKind[],
  projetTitles: string[] = []
): string {
  const hasPipeline = sources.includes("pipeline");
  const hasProjet = sources.includes("projet");
  if (hasPipeline && hasProjet) {
    const titles = projetTitles.filter(Boolean);
    return titles.length
      ? `Pipeline Casting + projet${titles.length > 1 ? "s" : ""} (${titles.join(", ")})`
      : "Pipeline Casting + projet";
  }
  if (hasProjet) {
    const titles = projetTitles.filter(Boolean);
    return titles.length
      ? `Projet${titles.length > 1 ? "s" : ""} (${titles.join(", ")})`
      : "Projet outreach";
  }
  if (hasPipeline) return "Pipeline Casting";
  return "";
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
    } else if (m.source === "pipeline") {
      contexts.push({
        kind: "pipeline",
        label: "Pipeline Casting",
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

    const missions: ResolvedAwaitingMission[] = awaiting.map((m) => ({
      missionId: m.id,
      brandName: marque.nom || m.targetBrand,
      source: m.campaignId ? "projet" : "pipeline",
      campaignId: m.campaign?.id ?? null,
      campaignTitle: m.campaign?.title ?? null,
    }));

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
