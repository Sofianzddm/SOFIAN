import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import type {
  CondensationRole,
  CondensationStatus,
  OutreachWaveStatus,
} from "@prisma/client";
import { marqueSlug } from "@/lib/marque-resolver";

export const WAVE_STATUS_LABEL: Record<OutreachWaveStatus, string> = {
  COLLECTING: "Collecte Strategy",
  REVIEWING_CONDENSATIONS: "Validation condensations",
  OPEN_FOR_DRAFTING: "Ouvert Casting",
  CLOSED: "Clôturée",
};

export function newCondensationGroupId(): string {
  return `cg_${randomBytes(12).toString("hex")}`;
}

/**
 * Racine marque pour condensation : unifie
 * « L'Oréal » / « L'Oréal (groupe) » / « L Oreal Groupe » → `loreal`.
 * Ne fusionne PAS les filles d'un holding (Dove ≠ Axe).
 */
export function condensationBrandRoot(value: string | null | undefined): string {
  let s = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Parenthèses : "l'oreal (groupe)" → "l'oreal"
  s = s.replace(/\s*\([^)]*\)\s*/g, " ");
  // Suffixes juridiques / groupe fréquents
  s = s.replace(
    /\b(groupe|group|holding|corp|corporation|inc|ltd|llc|sas|sasu|sarl|sa|nv|bv|gmbh|france|paris|international|intl|europe|benelux)\b/gi,
    " "
  );
  s = s.replace(/\s+/g, " ").trim();
  return marqueSlug(s);
}

export function brandClusterKey(opts: {
  marqueId?: string | null;
  marqueNom?: string | null;
  targetBrand: string;
  targetBrandKey: string;
}): string {
  const root =
    condensationBrandRoot(opts.marqueNom) ||
    condensationBrandRoot(opts.targetBrand) ||
    condensationBrandRoot(opts.targetBrandKey) ||
    opts.targetBrandKey;
  // Clé racine textuelle d'abord (unifie variantes CRM séparées).
  if (root) return `r:${root}`;
  if (opts.marqueId) return `m:${opts.marqueId}`;
  return `k:${opts.targetBrandKey}`;
}

/** Casting / envoi bloqués tant que la vague n'est pas ouverte à la rédaction. */
export function isWaveBlockingCasting(status: OutreachWaveStatus | null | undefined): boolean {
  return status === "COLLECTING" || status === "REVIEWING_CONDENSATIONS";
}

export type WaveCastingGate =
  | { blocked: false; waveId: string | null; waveStatus: OutreachWaveStatus | null }
  | {
      blocked: true;
      code: "WAVE_COLLECTING" | "WAVE_REVIEWING" | "CONDENSATION_MEMBER";
      message: string;
      waveId: string | null;
      waveStatus: OutreachWaveStatus | null;
    };

export async function getMissionCastingGate(
  missionId: string,
  opts?: { role?: string | null }
): Promise<WaveCastingGate> {
  const mission = await prisma.contactMission.findUnique({
    where: { id: missionId },
    select: {
      id: true,
      condensationRole: true,
      condensationStatus: true,
      condensationGroupId: true,
      sentAt: true,
      campaign: {
        select: {
          waveId: true,
          wave: { select: { id: true, status: true, title: true } },
        },
      },
    },
  });

  if (!mission) {
    return {
      blocked: true,
      code: "WAVE_COLLECTING",
      message: "Mission introuvable.",
      waveId: null,
      waveStatus: null,
    };
  }

  // Déjà contactée via condensation (ex. envoyée depuis l’autre talent) → plus de rédaction.
  if (
    mission.condensationGroupId &&
    mission.sentAt &&
    mission.condensationRole === "MEMBER"
  ) {
    return {
      blocked: true,
      code: "CONDENSATION_MEMBER",
      message:
        "Cette marque a déjà été contactée via la condensation (mail parti depuis un autre talent du groupe).",
      waveId: mission.campaign?.waveId ?? null,
      waveStatus: mission.campaign?.wave?.status ?? null,
    };
  }

  const wave = mission.campaign?.wave ?? null;
  if (!wave) {
    return { blocked: false, waveId: null, waveStatus: null };
  }

  // Admin : pas bloqué par la vague (seul Casting l’est).
  if (opts?.role === "ADMIN") {
    return { blocked: false, waveId: wave.id, waveStatus: wave.status };
  }

  if (wave.status === "COLLECTING") {
    return {
      blocked: true,
      code: "WAVE_COLLECTING",
      message: `Casting bloquée : la vague « ${wave.title} » est encore en collecte Strategy. Attends « Terminé » + validation des condensations.`,
      waveId: wave.id,
      waveStatus: wave.status,
    };
  }

  if (wave.status === "REVIEWING_CONDENSATIONS") {
    return {
      blocked: true,
      code: "WAVE_REVIEWING",
      message: `Casting bloquée : Strategy doit encore valider les condensations de la vague « ${wave.title} ».`,
      waveId: wave.id,
      waveStatus: wave.status,
    };
  }

  return { blocked: false, waveId: wave.id, waveStatus: wave.status };
}

/** Vague COLLECTING active, ou création si absente. */
export async function getOrCreateCollectingWave(opts: {
  actorId: string;
  title?: string;
}) {
  const existing = await prisma.outreachWave.findFirst({
    where: { status: "COLLECTING" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const now = new Date();
  const label =
    opts.title?.trim() ||
    `Vague ${now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;

  return prisma.outreachWave.create({
    data: {
      title: label,
      status: "COLLECTING",
      createdById: opts.actorId,
    },
  });
}

type MissionForCluster = {
  id: string;
  campaignId: string | null;
  talentId: string | null;
  creatorName: string;
  targetBrand: string;
  targetBrandKey: string;
  marqueId: string | null;
  marqueNom?: string | null;
  stage: string;
  status: string;
  sentAt: Date | null;
};

/**
 * Groupe les missions d'une vague par marque racine
 * (ex. L'Oréal ≈ L'Oréal (groupe)), multi-talents uniquement.
 */
export function buildBrandClusters(missions: MissionForCluster[]) {
  const byKey = new Map<
    string,
    {
      marqueId: string | null;
      targetBrandKey: string;
      targetBrand: string;
      missions: MissionForCluster[];
    }
  >();

  for (const m of missions) {
    if (!m.campaignId) continue;
    if (m.status === "CANCELLED") continue;
    if (m.stage === "WON" || m.stage === "LOST") continue;

    const key = brandClusterKey({
      marqueId: m.marqueId,
      marqueNom: m.marqueNom,
      targetBrand: m.targetBrand,
      targetBrandKey: m.targetBrandKey,
    });
    const cur = byKey.get(key);
    if (!cur) {
      // Libellé d'affichage : préfère le nom CRM le plus court (sans « groupe »)
      const display =
        [m.marqueNom, m.targetBrand]
          .filter(Boolean)
          .sort((a, b) => String(a).length - String(b).length)[0] || m.targetBrand;
      byKey.set(key, {
        marqueId: m.marqueId,
        targetBrandKey: condensationBrandRoot(display) || m.targetBrandKey,
        targetBrand: String(display),
        missions: [m],
      });
      continue;
    }
    cur.missions.push(m);
    // Prefer a resolved marqueId when available
    if (!cur.marqueId && m.marqueId) cur.marqueId = m.marqueId;
    // Prefer shorter display name
    const candidate = m.marqueNom || m.targetBrand;
    if (candidate && candidate.length < cur.targetBrand.length) {
      cur.targetBrand = candidate;
    }
  }

  const multi: Array<{
    marqueId: string | null;
    targetBrandKey: string;
    targetBrand: string;
    missions: MissionForCluster[];
  }> = [];
  const solo: typeof multi = [];

  for (const cluster of byKey.values()) {
    const talentKeys = new Set(
      cluster.missions.map((m) => m.talentId || m.creatorName.toLowerCase())
    );
    if (talentKeys.size >= 2) multi.push(cluster);
    else solo.push(cluster);
  }

  return { multi, solo };
}

export function pickPrimaryMissionId(missions: MissionForCluster[]): string {
  const sorted = [...missions].sort((a, b) => {
    const aTime = a.sentAt?.getTime() ?? 0;
    const bTime = b.sentAt?.getTime() ?? 0;
    if (aTime !== bTime) return aTime - bTime;
    return a.id.localeCompare(b.id);
  });
  // Prefer not-yet-sent as primary when mixing; else oldest id
  const unsent = sorted.filter((m) => !m.sentAt);
  return (unsent[0] || sorted[0]).id;
}

/** Scan vague → crée clusters PENDING (multi) + rattache missions. */
export async function rebuildWaveClusters(waveId: string) {
  const campaigns = await prisma.talentProspectingCampaign.findMany({
    where: { waveId, isActive: true, status: { not: "CLOSED" } },
    select: { id: true },
  });
  const campaignIds = campaigns.map((c) => c.id);
  if (campaignIds.length === 0) {
    await prisma.outreachWaveBrandCluster.deleteMany({ where: { waveId } });
    return { multiCount: 0, soloCount: 0 };
  }

  const missions = await prisma.contactMission.findMany({
    where: { campaignId: { in: campaignIds } },
    select: {
      id: true,
      campaignId: true,
      talentId: true,
      creatorName: true,
      targetBrand: true,
      targetBrandKey: true,
      marqueId: true,
      stage: true,
      status: true,
      sentAt: true,
      marque: { select: { nom: true } },
    },
  });

  const missionsForCluster: MissionForCluster[] = missions.map((m) => ({
    id: m.id,
    campaignId: m.campaignId,
    talentId: m.talentId,
    creatorName: m.creatorName,
    targetBrand: m.targetBrand,
    targetBrandKey: m.targetBrandKey,
    marqueId: m.marqueId,
    marqueNom: m.marque?.nom ?? null,
    stage: m.stage,
    status: m.status,
    sentAt: m.sentAt,
  }));

  // Reset previous proposals for this wave
  const previousClusters = await prisma.outreachWaveBrandCluster.findMany({
    where: { waveId },
    select: { id: true },
  });
  if (previousClusters.length > 0) {
    await prisma.contactMission.updateMany({
      where: { waveClusterId: { in: previousClusters.map((c) => c.id) } },
      data: {
        waveClusterId: null,
        condensationStatus: "IN_WAVE",
        condensationRole: null,
        condensationGroupId: null,
      },
    });
  }
  await prisma.outreachWaveBrandCluster.deleteMany({ where: { waveId } });

  const { multi, solo } = buildBrandClusters(missionsForCluster);

  for (const cluster of multi) {
    const primaryId = pickPrimaryMissionId(cluster.missions);
    const created = await prisma.outreachWaveBrandCluster.create({
      data: {
        waveId,
        marqueId: cluster.marqueId,
        targetBrandKey: cluster.targetBrandKey,
        targetBrand: cluster.targetBrand,
        decision: "PENDING",
        primaryMissionId: primaryId,
      },
    });
    await prisma.contactMission.updateMany({
      where: { id: { in: cluster.missions.map((m) => m.id) } },
      data: {
        waveClusterId: created.id,
        condensationStatus: "PROPOSED",
      },
    });
  }

  // Solo missions stay IN_WAVE until validation marks them SOLO
  const soloIds = solo.flatMap((c) => c.missions.map((m) => m.id));
  if (soloIds.length > 0) {
    await prisma.contactMission.updateMany({
      where: { id: { in: soloIds } },
      data: { condensationStatus: "IN_WAVE", waveClusterId: null },
    });
  }

  return { multiCount: multi.length, soloCount: solo.length };
}

export async function applyWaveClusterDecisions(waveId: string, actorId: string) {
  const clusters = await prisma.outreachWaveBrandCluster.findMany({
    where: { waveId },
    select: { id: true, decision: true, targetBrand: true },
  });

  for (const cluster of clusters) {
    if (cluster.decision === "PENDING") {
      throw new Error(
        `Le cluster « ${cluster.targetBrand} » n'a pas encore de décision (Condenser / Solo).`
      );
    }
    await applyClusterDecision(cluster.id);
  }

  // Remaining wave missions without cluster → SOLO
  const campaignIds = (
    await prisma.talentProspectingCampaign.findMany({
      where: { waveId },
      select: { id: true },
    })
  ).map((c) => c.id);

  await prisma.contactMission.updateMany({
    where: {
      campaignId: { in: campaignIds },
      condensationStatus: { in: ["IN_WAVE", "NONE", "PROPOSED"] },
      waveClusterId: null,
    },
    data: { condensationStatus: "SOLO" },
  });

  // Open wave for casting + push campaigns to DRAFTING when possible
  await prisma.outreachWave.update({
    where: { id: waveId },
    data: {
      status: "OPEN_FOR_DRAFTING",
      validatedAt: new Date(),
      validatedById: actorId,
    },
  });

  const campaigns = await prisma.talentProspectingCampaign.findMany({
    where: {
      waveId,
      status: { in: ["BRIEF", "BRANDS"] },
      isActive: true,
    },
    include: { _count: { select: { contactMissions: true } } },
  });

  for (const c of campaigns) {
    if (c._count.contactMissions === 0) continue;
    const awaiting = await prisma.contactMission.count({
      where: { campaignId: c.id, awaitingContactsCompletion: true },
    });
    if (awaiting > 0) continue;
    await prisma.talentProspectingCampaign.update({
      where: { id: c.id },
      data: { status: "DRAFTING", isActive: true },
    });
    await prisma.prospectingCampaignEvent.create({
      data: {
        campaignId: c.id,
        actorId,
        type: "READY_FOR_DRAFTING",
        message: "Vague validée — projet ouvert à la rédaction Casting",
        payload: { from: c.status, to: "DRAFTING", via: "wave_validation" },
      },
    });
  }
}

/** Applique Condenser / Solo sur UN cluster (dès le clic Strategy). */
export async function applyClusterDecision(clusterId: string) {
  const cluster = await prisma.outreachWaveBrandCluster.findUnique({
    where: { id: clusterId },
    include: {
      missions: {
        select: {
          id: true,
          campaignId: true,
          talentId: true,
          creatorName: true,
          targetBrand: true,
          targetBrandKey: true,
          marqueId: true,
          stage: true,
          status: true,
          sentAt: true,
          clientContacts: true,
        },
      },
    },
  });
  if (!cluster) throw new Error("Cluster introuvable.");
  if (cluster.decision === "PENDING") {
    throw new Error(
      `Le cluster « ${cluster.targetBrand} » n'a pas encore de décision (Condenser / Solo).`
    );
  }

  if (cluster.decision === "SOLO" || cluster.missions.length < 2) {
    await prisma.contactMission.updateMany({
      where: { id: { in: cluster.missions.map((m) => m.id) } },
      data: {
        condensationStatus: "SOLO",
        condensationRole: null,
        condensationGroupId: null,
      },
    });
    await prisma.outreachWaveBrandCluster.update({
      where: { id: cluster.id },
      data: { condensationGroupId: null, primaryMissionId: null },
    });
    return { decision: "SOLO" as const, primaryMissionId: null as string | null };
  }

  const groupId = cluster.condensationGroupId || newCondensationGroupId();
  const primaryId =
    cluster.primaryMissionId &&
    cluster.missions.some((m) => m.id === cluster.primaryMissionId)
      ? cluster.primaryMissionId
      : pickPrimaryMissionId(cluster.missions);

  const contactMap = new Map<string, unknown>();
  for (const m of cluster.missions) {
    const raw = m.clientContacts;
    const list = Array.isArray(raw) ? raw : [];
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const email = String((c as { email?: string }).email || "")
        .trim()
        .toLowerCase();
      if (!email) continue;
      if (!contactMap.has(email)) contactMap.set(email, c);
    }
  }
  const unionContacts = [...contactMap.values()];

  for (const m of cluster.missions) {
    const role: CondensationRole = m.id === primaryId ? "PRIMARY" : "MEMBER";
    await prisma.contactMission.update({
      where: { id: m.id },
      data: {
        condensationGroupId: groupId,
        condensationRole: role,
        condensationStatus: "CONDENSED",
        ...(role === "PRIMARY" && unionContacts.length > 0
          ? { clientContacts: unionContacts as object }
          : {}),
      },
    });
  }

  await prisma.outreachWaveBrandCluster.update({
    where: { id: cluster.id },
    data: {
      condensationGroupId: groupId,
      primaryMissionId: primaryId,
    },
  });

  return { decision: "CONDENSE" as const, primaryMissionId: primaryId };
}

/**
 * Le talent depuis lequel on rédige/envoie devient PRIMARY ;
 * les autres du groupe passent MEMBER (le mail miroirira chez eux).
 */
export async function promoteCondensationSender(missionId: string): Promise<{
  promoted: boolean;
  groupId: string | null;
}> {
  const mission = await prisma.contactMission.findUnique({
    where: { id: missionId },
    select: {
      id: true,
      condensationGroupId: true,
      condensationRole: true,
      condensationStatus: true,
    },
  });
  if (
    !mission?.condensationGroupId ||
    mission.condensationStatus !== "CONDENSED"
  ) {
    return { promoted: false, groupId: null };
  }
  if (mission.condensationRole === "PRIMARY") {
    return { promoted: false, groupId: mission.condensationGroupId };
  }

  await prisma.contactMission.updateMany({
    where: { condensationGroupId: mission.condensationGroupId },
    data: { condensationRole: "MEMBER" },
  });
  await prisma.contactMission.update({
    where: { id: missionId },
    data: { condensationRole: "PRIMARY" },
  });
  await prisma.outreachWaveBrandCluster.updateMany({
    where: { condensationGroupId: mission.condensationGroupId },
    data: { primaryMissionId: missionId },
  });

  return { promoted: true, groupId: mission.condensationGroupId };
}

/** Après envoi PRIMARY : miroir SENT sur les MEMBER du même groupe. */
export async function mirrorCondensationSend(opts: {
  primaryMissionId: string;
  sentAt: Date;
  sentMessageIds: unknown;
  status?: "SENT" | "RELANCED";
  relanceSentAt?: Date | null;
  relanceMessageIds?: unknown;
  relance2SentAt?: Date | null;
  relance2MessageIds?: unknown;
}) {
  // Si on envoie depuis un MEMBER (ex. Alix), on le promeut PRIMARY d'abord.
  await promoteCondensationSender(opts.primaryMissionId);

  const primary = await prisma.contactMission.findUnique({
    where: { id: opts.primaryMissionId },
    select: {
      condensationGroupId: true,
      condensationRole: true,
    },
  });
  if (!primary?.condensationGroupId || primary.condensationRole !== "PRIMARY") {
    return { mirrored: 0 };
  }

  const result = await prisma.contactMission.updateMany({
    where: {
      condensationGroupId: primary.condensationGroupId,
      id: { not: opts.primaryMissionId },
    },
    data: {
      condensationRole: "MEMBER",
      stage: "SENT",
      status: opts.status ?? "SENT",
      sentAt: opts.sentAt,
      sentMessageIds: opts.sentMessageIds as object,
      scheduledSendAt: null,
      ...(opts.relanceSentAt !== undefined
        ? { relanceSentAt: opts.relanceSentAt }
        : {}),
      ...(opts.relanceMessageIds !== undefined
        ? { relanceMessageIds: opts.relanceMessageIds as object }
        : {}),
      ...(opts.relance2SentAt !== undefined
        ? { relance2SentAt: opts.relance2SentAt }
        : {}),
      ...(opts.relance2MessageIds !== undefined
        ? { relance2MessageIds: opts.relance2MessageIds as object }
        : {}),
    },
  });

  return { mirrored: result.count };
}

export async function getCondensationSiblingBriefs(missionId: string) {
  const anchor = await prisma.contactMission.findUnique({
    where: { id: missionId },
    select: {
      id: true,
      condensationGroupId: true,
      condensationRole: true,
      creatorName: true,
      talentId: true,
      targetBrand: true,
      strategyReason: true,
      recommendedAngle: true,
      objective: true,
      dos: true,
      donts: true,
      campaign: {
        select: {
          title: true,
          description: true,
          objective: true,
          deliverables: true,
          angles: true,
          timeline: true,
          budgetRange: true,
          dos: true,
          donts: true,
          talent: { select: { prenom: true, nom: true } },
        },
      },
    },
  });

  if (!anchor?.condensationGroupId) {
    return null;
  }

  // Si on ouvre depuis un MEMBER (ex. Alix), on le promeut pour que le mail
  // multi-briefs parte de ce talent — l'autre (Julie) recevra le miroir SENT.
  await promoteCondensationSender(missionId);

  const members = await prisma.contactMission.findMany({
    where: { condensationGroupId: anchor.condensationGroupId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      condensationRole: true,
      creatorName: true,
      talentId: true,
      targetBrand: true,
      strategyReason: true,
      recommendedAngle: true,
      objective: true,
      dos: true,
      donts: true,
      campaign: {
        select: {
          title: true,
          description: true,
          objective: true,
          deliverables: true,
          angles: true,
          timeline: true,
          budgetRange: true,
          dos: true,
          donts: true,
          talent: { select: { prenom: true, nom: true } },
        },
      },
    },
  });

  return members.map((m) => {
    const talentName =
      m.campaign?.talent
        ? `${m.campaign.talent.prenom} ${m.campaign.talent.nom}`.trim()
        : m.creatorName;
    return {
      missionId: m.id,
      talentId: m.talentId,
      role: m.condensationRole,
      projectTitle: m.campaign?.title ?? null,
      projectDescription: m.campaign?.description ?? null,
      creatorName: talentName,
      targetBrand: m.targetBrand,
      strategyReason: m.strategyReason,
      recommendedAngle: m.recommendedAngle,
      objective: m.objective || m.campaign?.objective || null,
      deliverables: m.campaign?.deliverables ?? null,
      angles: m.campaign?.angles ?? null,
      timeline: m.campaign?.timeline ?? null,
      budgetRange: m.campaign?.budgetRange ?? null,
      dos: m.dos || m.campaign?.dos || null,
      donts: m.donts || m.campaign?.donts || null,
    };
  });
}

/** Contexte relance condensée : talents + titres de projets. */
export async function getCondensationRelanceContext(missionId: string): Promise<{
  creators: string[];
  projects: Array<{ creatorName: string; projectTitle: string | null; objective: string | null }>;
} | null> {
  const mission = await prisma.contactMission.findUnique({
    where: { id: missionId },
    select: {
      condensationGroupId: true,
      condensationRole: true,
    },
  });
  if (!mission?.condensationGroupId || mission.condensationRole !== "PRIMARY") {
    return null;
  }
  const members = await prisma.contactMission.findMany({
    where: { condensationGroupId: mission.condensationGroupId },
    orderBy: { createdAt: "asc" },
    select: {
      creatorName: true,
      objective: true,
      campaign: {
        select: {
          title: true,
          objective: true,
          talent: { select: { prenom: true, nom: true } },
        },
      },
    },
  });
  const projects = members.map((m) => {
    const creatorName =
      m.campaign?.talent
        ? `${m.campaign.talent.prenom} ${m.campaign.talent.nom}`.trim()
        : m.creatorName;
    return {
      creatorName: creatorName.trim(),
      projectTitle: m.campaign?.title?.trim() || null,
      objective: (m.objective || m.campaign?.objective || null)?.trim() || null,
    };
  });
  const creators = [
    ...new Set(projects.map((p) => p.creatorName).filter(Boolean)),
  ];
  if (creators.length < 2) return null;
  return { creators, projects };
}

/** @deprecated Preférer getCondensationRelanceContext */
export async function getCondensationCreatorNames(
  missionId: string
): Promise<string[] | null> {
  const ctx = await getCondensationRelanceContext(missionId);
  return ctx?.creators ?? null;
}

/**
 * Si Strategy ajoute une marque déjà présente chez un autre talent de la vague
 * alors que Casting était ouverte → on re-gèle (REVIEWING) + rescan clusters.
 */
export async function refreezeWaveIfNewSharedBrand(opts: {
  waveId: string;
  newMissions: Array<{
    id: string;
    talentId: string | null;
    creatorName: string;
    targetBrand: string;
    targetBrandKey: string;
    marqueId: string | null;
    marqueNom?: string | null;
  }>;
}): Promise<{ refrozen: boolean; sharedBrands: string[]; message: string | null }> {
  if (opts.newMissions.length === 0) {
    return { refrozen: false, sharedBrands: [], message: null };
  }

  const wave = await prisma.outreachWave.findUnique({
    where: { id: opts.waveId },
    select: { id: true, status: true, title: true },
  });
  if (!wave) return { refrozen: false, sharedBrands: [], message: null };

  // Pendant REVIEWING : rafraîchir les clusters pour inclure les nouvelles marques
  if (wave.status === "REVIEWING_CONDENSATIONS") {
    await rebuildWaveClusters(wave.id);
    return {
      refrozen: false,
      sharedBrands: [],
      message: "Clusters condensations mis à jour avec les nouvelles marques.",
    };
  }

  if (wave.status !== "OPEN_FOR_DRAFTING") {
    return { refrozen: false, sharedBrands: [], message: null };
  }

  const campaigns = await prisma.talentProspectingCampaign.findMany({
    where: { waveId: wave.id, isActive: true, status: { not: "CLOSED" } },
    select: { id: true },
  });
  const campaignIds = campaigns.map((c) => c.id);
  if (campaignIds.length === 0) {
    return { refrozen: false, sharedBrands: [], message: null };
  }

  const existing = await prisma.contactMission.findMany({
    where: {
      campaignId: { in: campaignIds },
      id: { notIn: opts.newMissions.map((m) => m.id) },
      status: { not: "CANCELLED" },
      stage: { notIn: ["WON", "LOST"] },
    },
    select: {
      id: true,
      talentId: true,
      creatorName: true,
      targetBrand: true,
      targetBrandKey: true,
      marqueId: true,
      marque: { select: { nom: true } },
    },
  });

  const sharedBrands: string[] = [];
  for (const neu of opts.newMissions) {
    const neuKey = brandClusterKey({
      marqueId: neu.marqueId,
      marqueNom: neu.marqueNom,
      targetBrand: neu.targetBrand,
      targetBrandKey: neu.targetBrandKey,
    });
    const neuTalent = neu.talentId || neu.creatorName.toLowerCase();
    for (const old of existing) {
      const oldKey = brandClusterKey({
        marqueId: old.marqueId,
        marqueNom: old.marque?.nom,
        targetBrand: old.targetBrand,
        targetBrandKey: old.targetBrandKey,
      });
      if (neuKey !== oldKey) continue;
      const oldTalent = old.talentId || old.creatorName.toLowerCase();
      if (neuTalent === oldTalent) continue;
      sharedBrands.push(neu.targetBrand);
      break;
    }
  }

  if (sharedBrands.length === 0) {
    return { refrozen: false, sharedBrands: [], message: null };
  }

  await prisma.outreachWave.update({
    where: { id: wave.id },
    data: {
      status: "REVIEWING_CONDENSATIONS",
      validatedAt: null,
      validatedById: null,
    },
  });
  await rebuildWaveClusters(wave.id);

  const uniq = [...new Set(sharedBrands)];
  return {
    refrozen: true,
    sharedBrands: uniq,
    message: `Casting rebloquée : marque(s) partagée(s) ajoutée(s) (${uniq.slice(0, 5).join(", ")}${uniq.length > 5 ? "…" : ""}). Strategy doit revalider les condensations.`,
  };
}
