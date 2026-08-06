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

const ALLOWED_ROLES = ["HEAD_OF_SALES", "ADMIN", "HEAD_OF"] as const;

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

/**
 * Missions rédigées (validation) pour lesquelles la fiche marque app a déjà
 * au moins un contact email utilisable — pour attacher + planifier sans
 * chercher carte par carte.
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
    };
    if (talentId) where.talentId = talentId;

    const missionsRaw = await contactMissionModel.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        talent: { select: { id: true, prenom: true, nom: true } },
        campaign: { select: { id: true, title: true } },
      },
      take: 300,
    });

    const missions = (missionsRaw as any[]).filter((m) => {
      const subject = String(m.draftEmailSubject || "").trim();
      const body = String(m.draftEmailBody || "").trim();
      return Boolean(subject && body);
    });

    // Résolution marque : toutes les fiches matchantes (doublons inclus).
    // Même si `marqueId` est déjà posé, on élargit via le nom pour ne pas
    // rater les contacts d'une fiche sœur (ex. Tezenis ×2).
    const marqueIdsByMission = new Map<string, string[]>();
    const brandsToResolve = new Map<string, string[]>(); // brand → missionIds

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

    type Item = {
      mission: Record<string, unknown>;
      availableContacts: AppContactOut[];
      alreadyAttachedCount: number;
    };
    const items: Item[] = [];

    for (const m of missions) {
      const marqueIds = marqueIdsByMission.get(m.id) || [];
      if (marqueIds.length === 0) continue;

      const marqueContacts = marqueIds.flatMap((id) => contactsByMarque.get(id) || []);
      if (marqueContacts.length === 0) continue;

      const attached = attachedEmails(m.clientContacts);
      const alreadySent = extractAlreadySentEmails(m.sentMessageIds);
      const alreadyAttachedCount = attached.size;

      const seenEmails = new Set<string>();
      const candidates = marqueContacts
        .map((c) => {
          const email = (c.email || "").trim().toLowerCase();
          const prenom = (c.prenom || "").trim();
          const nom = (c.nom || "").trim();
          // parseCastingContacts exige un prénom : on retombe sur le nom si besoin.
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

      if (candidates.length === 0) continue;

      const blocked = await findEmailsBlockedByCooldown(
        candidates.map((c) => c.email),
        m.id
      );

      const availableContacts: AppContactOut[] = candidates.map((c) => ({
        ...c,
        blockedByCooldown: blocked.has(c.email),
      }));

      const primaryMarqueId = m.marqueId || marqueIds[0];
      items.push({
        mission: {
          id: m.id,
          campaignId: m.campaignId,
          campaignTitle: m.campaign?.title ?? null,
          talentId: m.talentId,
          talentName: m.talent ? `${m.talent.prenom} ${m.talent.nom}`.trim() : null,
          creatorName: m.creatorName,
          targetBrand: m.targetBrand,
          marqueId: primaryMarqueId,
          marqueNom: marqueNomById.get(primaryMarqueId) ?? null,
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
        },
        availableContacts,
        alreadyAttachedCount,
      });
    }

    return NextResponse.json({
      items,
      count: items.length,
      cooldownDays: CASTING_COOLDOWN_DAYS,
    });
  } catch (error) {
    console.error("GET /api/strategy/contact-missions/ready-to-send:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
