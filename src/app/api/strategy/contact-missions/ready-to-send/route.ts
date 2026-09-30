import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { findAllMarqueIdsByName, findMarqueByName } from "@/lib/marque-resolver";
import {
  CASTING_COOLDOWN_DAYS,
  extractAlreadySentEmails,
  findEmailsBlockedByCooldown,
} from "@/lib/casting-auto-send";
import {
  loadFuzzyCandidatesCached,
  rankFuzzyCandidates,
} from "@/lib/marque-fuzzy-search";
import {
  listIndivBrandWaveSends,
  INDIV_BRAND_WAVE_DAYS,
} from "@/lib/contact-cooldown";
import { brandsLookSame } from "@/lib/brand-match";

const ALLOWED_ROLES = ["HEAD_OF_SALES", "ADMIN", "HEAD_OF", "CASTING_MANAGER"] as const;

const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;

type AppContactOut = {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  role: string;
  principal: boolean;
  blockedByCooldown: boolean;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

function attachedEmails(clientContacts: unknown): Set<string> {
  if (!Array.isArray(clientContacts)) return new Set();
  const out = new Set<string>();
  for (const c of clientContacts) {
    const email = String((c as { email?: string })?.email || "")
      .trim()
      .toLowerCase();
    if (email) out.add(email);
  }
  return out;
}

/** Toutes les fiches matchantes (doublons inclus), sinon fuzzy sur 1 fiche. */
async function resolveAllMarqueIds(brand: string): Promise<string[]> {
  const all = await findAllMarqueIdsByName(brand);
  if (all.length > 0) return all;

  const exact = await findMarqueByName(brand);
  if (exact) return [exact.marqueId];

  const candidates = await loadFuzzyCandidatesCached("marques:all", async () => {
    const rows = await prisma.marque.findMany({
      select: { id: true, nom: true, aliases: { select: { label: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      labels: [r.nom, ...r.aliases.map((a) => a.label)],
    }));
  });

  const ranked = rankFuzzyCandidates(brand, candidates, { threshold: 0.6, limit: 5 });
  return ranked.map((r) => r.id);
}

function mapMission(m: any, primaryMarqueId: string | null, marqueNomById: Map<string, string>) {
  return {
    id: m.id,
    campaignId: m.campaignId,
    campaignTitle: m.campaign?.title ?? null,
    talentId: m.talentId,
    talentName: m.talent ? `${m.talent.prenom} ${m.talent.nom}`.trim() : null,
    creatorName: m.creatorName,
    targetBrand: m.targetBrand,
    marqueId: primaryMarqueId,
    marqueNom: primaryMarqueId ? marqueNomById.get(primaryMarqueId) ?? null : null,
    strategyReason: m.strategyReason,
    recommendedAngle: m.recommendedAngle,
    objective: m.objective,
    dos: m.dos,
    donts: m.donts,
    priority: m.priority,
    status: m.status,
    stage: m.stage,
    draftEmailSubject: m.draftEmailSubject ?? null,
    draftEmailBody: m.draftEmailBody ?? null,
    draftLanguage: m.draftLanguage ?? null,
    clientLanguage: m.clientLanguage ?? null,
    clientContacts: m.clientContacts ?? null,
    scheduledSendAt: m.scheduledSendAt ?? null,
    sentAt: m.sentAt ?? null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

/**
 * Missions rédigées (DRAFTED) scindées en :
 * - withContacts : contact email déjà en fiche marque → prêt à planifier
 * - needsEnrichment : pas de contact utilisable → à enrichir
 * Exclut les marques déjà contactées en pipeline (vague 20 j).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const talentId = String(request.nextUrl.searchParams.get("talentId") || "").trim() || null;

    const where: Record<string, unknown> = {
      stage: "DRAFTED_FOR_VALIDATION",
      OR: [
        { campaignId: null },
        { campaign: { events: { none: { type: "CREATED" } } } },
      ],
    };
    if (talentId) where.talentId = talentId;

    const [missionsRaw, brandWave] = await Promise.all([
      contactMissionModel.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          talent: { select: { id: true, prenom: true, nom: true } },
          campaign: { select: { id: true, title: true } },
        },
        take: 800,
      }),
      listIndivBrandWaveSends(),
    ]);

    const missions = (missionsRaw as any[]).filter((m) => {
      const subject = String(m.draftEmailSubject || "").trim();
      const body = String(m.draftEmailBody || "").trim();
      return Boolean(subject && body);
    });

    const isBrandBlocked = (m: {
      marqueId?: string | null;
      targetBrand?: string | null;
    }) => {
      const brand = String(m.targetBrand || "").trim();
      return brandWave.some((w) => {
        if (m.marqueId && w.marqueId && m.marqueId === w.marqueId) return true;
        return (
          brandsLookSame(brand, w.targetBrand) ||
          (w.targetBrandKey
            ? brandsLookSame(brand, w.targetBrandKey)
            : false)
        );
      });
    };

    const marqueIdsByMission = new Map<string, string[]>();
    const brandsToResolve = new Map<string, string[]>();

    for (const m of missions) {
      const brand = String(m.targetBrand || "").trim();
      if (!brand && !m.marqueId) continue;
      if (brand) {
        const list = brandsToResolve.get(brand) || [];
        list.push(m.id);
        brandsToResolve.set(brand, list);
      } else if (m.marqueId) {
        marqueIdsByMission.set(m.id, [m.marqueId]);
      }
    }

    for (const [brand, missionIds] of brandsToResolve) {
      const ids = await resolveAllMarqueIds(brand);
      for (const missionId of missionIds) {
        const mission = missions.find((x) => x.id === missionId);
        const merged = new Set<string>(ids);
        if (mission?.marqueId) merged.add(mission.marqueId);
        if (merged.size > 0) marqueIdsByMission.set(missionId, Array.from(merged));
      }
    }

    const uniqueMarqueIds = Array.from(
      new Set(Array.from(marqueIdsByMission.values()).flat())
    );
    const contactsByMarque = new Map<
      string,
      Array<{
        id: string;
        prenom: string | null;
        nom: string;
        email: string | null;
        poste: string | null;
        principal: boolean;
      }>
    >();

    const marqueNomById = new Map<string, string>();
    if (uniqueMarqueIds.length > 0) {
      const marqueRows = await prisma.marque.findMany({
        where: { id: { in: uniqueMarqueIds } },
        select: { id: true, nom: true },
      });
      for (const row of marqueRows) {
        marqueNomById.set(row.id, row.nom);
      }

      const rows = await prisma.marqueContact.findMany({
        where: {
          marqueId: { in: uniqueMarqueIds },
          email: { not: null },
          OR: [{ source: { not: "AO" } }, { source: null }],
        },
        select: {
          id: true,
          marqueId: true,
          prenom: true,
          nom: true,
          email: true,
          poste: true,
          principal: true,
        },
        orderBy: [{ principal: "desc" }, { nom: "asc" }],
      });
      for (const row of rows) {
        const email = (row.email || "").trim();
        if (!email || !isValidEmail(email)) continue;
        const list = contactsByMarque.get(row.marqueId) || [];
        list.push(row);
        contactsByMarque.set(row.marqueId, list);
      }
    }

    type ReadyItem = {
      mission: Record<string, unknown>;
      availableContacts: AppContactOut[];
      alreadyAttachedCount: number;
    };
    type EnrichItem = {
      mission: Record<string, unknown>;
      reason: "no_marque" | "no_contacts";
      crmContactCount: number;
    };

    const withContacts: ReadyItem[] = [];
    const needsEnrichment: EnrichItem[] = [];

    for (const m of missions) {
      if (isBrandBlocked(m)) continue;
      if ((m as { awaitingContactsCompletion?: boolean }).awaitingContactsCompletion) {
        continue;
      }

      const marqueIds = marqueIdsByMission.get(m.id) || [];
      const primaryMarqueId = m.marqueId || marqueIds[0] || null;
      const missionPayload = mapMission(m, primaryMarqueId, marqueNomById);

      if (marqueIds.length === 0) {
        needsEnrichment.push({
          mission: missionPayload,
          reason: "no_marque",
          crmContactCount: 0,
        });
        continue;
      }

      const marqueContacts = marqueIds.flatMap((id) => contactsByMarque.get(id) || []);
      if (marqueContacts.length === 0) {
        needsEnrichment.push({
          mission: missionPayload,
          reason: "no_contacts",
          crmContactCount: 0,
        });
        continue;
      }

      const attached = attachedEmails(m.clientContacts);
      const alreadySent = extractAlreadySentEmails(m.sentMessageIds);
      const alreadyAttachedCount = attached.size;

      const seenEmails = new Set<string>();
      const candidates = marqueContacts
        .map((c) => {
          const email = (c.email || "").trim().toLowerCase();
          const prenom = (c.prenom || "").trim();
          const nom = (c.nom || "").trim();
          const firstname = prenom || nom;
          const lastname = prenom ? nom : "";
          return {
            id: c.id,
            firstname,
            lastname,
            email,
            role: (c.poste || "").trim(),
            principal: Boolean(c.principal),
          };
        })
        .filter((c) => {
          if (!c.firstname || !c.email) return false;
          if (attached.has(c.email) || alreadySent.has(c.email)) return false;
          if (seenEmails.has(c.email)) return false;
          seenEmails.add(c.email);
          return true;
        });

      // Contacts en CRM mais tous déjà attachés / envoyés → pas « à enrichir »
      // (rien de nouveau à planifier non plus).
      if (candidates.length === 0) continue;

      const blocked = await findEmailsBlockedByCooldown(
        candidates.map((c) => c.email),
        m.id
      );

      const availableContacts: AppContactOut[] = candidates.map((c) => ({
        ...c,
        blockedByCooldown: blocked.has(c.email),
      }));

      withContacts.push({
        mission: missionPayload,
        availableContacts,
        alreadyAttachedCount,
      });
    }

    return NextResponse.json({
      items: withContacts,
      withContacts,
      needsEnrichment,
      count: withContacts.length,
      enrichCount: needsEnrichment.length,
      cooldownDays: CASTING_COOLDOWN_DAYS,
      brandWaveDays: INDIV_BRAND_WAVE_DAYS,
    });
  } catch (error) {
    console.error("GET /api/strategy/contact-missions/ready-to-send:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
