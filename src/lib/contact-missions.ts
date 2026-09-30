import { prisma } from "@/lib/prisma";
import { marqueSlug } from "@/lib/marque-resolver";
import { brandsLookSame } from "@/lib/brand-match";

/**
 * @deprecated Utiliser `marqueSlug()` depuis `@/lib/marque-resolver`.
 * Conservé pour compat ascendante : alias strict de `marqueSlug` afin que les
 * `ContactMission.targetBrandKey` historiques restent cohérents avec
 * `Marque.slug`.
 */
export function normalizeMissionBrandKey(value: string): string {
  return marqueSlug(value);
}

export function parseMissionPriority(value: unknown): "LOW" | "MEDIUM" | "HIGH" | "URGENT" {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "LOW" || raw === "HIGH" || raw === "URGENT") return raw;
  return "MEDIUM";
}

/** Fenêtre anti-recontact talent × marque (ajout campagne indiv). */
export const TALENT_BRAND_RECONTACT_DAYS = 20;

export type TalentBrandLastSend = {
  marqueId: string | null;
  targetBrand: string;
  targetBrandKey: string;
  sentAt: Date;
  daysAgo: number;
  daysLeft: number;
  blocked: boolean;
  missionId: string;
};

function daysBetween(from: Date, to: Date = new Date()): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Dernier envoi (sentAt) par marque pour un talent — toutes campagnes.
 * `blocked` si envoyé il y a moins de TALENT_BRAND_RECONTACT_DAYS.
 */
export async function listTalentBrandLastSends(
  talentId: string
): Promise<TalentBrandLastSend[]> {
  const tid = String(talentId || "").trim();
  if (!tid) return [];

  const rows = await prisma.contactMission.findMany({
    where: {
      talentId: tid,
      sentAt: { not: null },
    },
    select: {
      id: true,
      marqueId: true,
      targetBrand: true,
      targetBrandKey: true,
      sentAt: true,
    },
    orderBy: { sentAt: "desc" },
    take: 800,
  });

  const best = new Map<string, TalentBrandLastSend>();
  for (const row of rows) {
    if (!row.sentAt) continue;
    const key =
      row.marqueId ||
      row.targetBrandKey ||
      normalizeMissionBrandKey(row.targetBrand) ||
      row.id;
    if (best.has(key)) continue;
    const daysAgo = daysBetween(row.sentAt);
    const daysLeft = Math.max(0, TALENT_BRAND_RECONTACT_DAYS - daysAgo);
    best.set(key, {
      marqueId: row.marqueId,
      targetBrand: row.targetBrand,
      targetBrandKey:
        row.targetBrandKey || normalizeMissionBrandKey(row.targetBrand),
      sentAt: row.sentAt,
      daysAgo,
      daysLeft,
      blocked: daysAgo < TALENT_BRAND_RECONTACT_DAYS,
      missionId: row.id,
    });
  }
  return [...best.values()];
}

/** Dernier envoi talent×marque (marqueId ou fuzzy nom). */
export async function findTalentBrandLastSend(opts: {
  talentId: string;
  marqueId?: string | null;
  targetBrand?: string | null;
}): Promise<TalentBrandLastSend | null> {
  const list = await listTalentBrandLastSends(opts.talentId);
  const mid = String(opts.marqueId || "").trim() || null;
  const brand = String(opts.targetBrand || "").trim();
  if (mid) {
    const byId = list.find((x) => x.marqueId === mid);
    if (byId) return byId;
  }
  if (brand) {
    const byName = list.find(
      (x) =>
        brandsLookSame(brand, x.targetBrand) ||
        normalizeMissionBrandKey(brand) === x.targetBrandKey
    );
    if (byName) return byName;
  }
  return null;
}
