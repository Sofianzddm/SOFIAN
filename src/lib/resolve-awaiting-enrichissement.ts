import { prisma } from "@/lib/prisma";

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

    return {
      resolvedCount: missions.length,
      emailableCount,
      sources,
      sourceLabel,
      missions,
    };
  } catch (error) {
    console.error("resolveAwaitingEnrichissementForMarque:", error);
    return empty;
  }
}
