/**
 * Met à jour automatiquement les stats Instagram & TikTok d'un talent
 * (followers + évolution en %) à partir des handles présents sur sa fiche.
 *
 * Utilisé par :
 *  - le cron quotidien `/api/cron/refresh-social-stats`
 *  - le bouton manuel sur la fiche talent `/api/talents/[id]/refresh-stats`
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { fetchInstagramProfile, fetchTiktokProfile } from "@/lib/social-stats";

export interface RefreshResult {
  talentId: string;
  instagram: {
    handle: string | null;
    before: number | null;
    after: number | null;
    ok: boolean;
    error?: string;
  };
  tiktok: {
    handle: string | null;
    before: number | null;
    after: number | null;
    ok: boolean;
    error?: string;
  };
  changed: boolean;
}

export async function refreshTalentSocialStats(
  talentId: string
): Promise<RefreshResult> {
  const talent = await prisma.talent.findUnique({
    where: { id: talentId },
    select: {
      id: true,
      instagram: true,
      tiktok: true,
      stats: {
        select: {
          igFollowers: true,
          ttFollowers: true,
        },
      },
    },
  });

  if (!talent) throw new Error("Talent introuvable");

  const prevIg = talent.stats?.igFollowers ?? null;
  const prevTt = talent.stats?.ttFollowers ?? null;

  // Appels Apify en parallèle pour gagner du temps
  const [igSnap, ttSnap] = await Promise.all([
    talent.instagram
      ? fetchInstagramProfile(talent.instagram)
      : Promise.resolve({ followers: null, ok: false, error: "pas de handle IG" } as const),
    talent.tiktok
      ? fetchTiktokProfile(talent.tiktok)
      : Promise.resolve({ followers: null, ok: false, error: "pas de handle TT" } as const),
  ]);

  // On ne met à jour QUE le nombre d'abonnés. Le pourcentage d'évolution
  // (igFollowersEvol / ttFollowersEvol) reste 100 % saisi manuellement par le TM.
  const updateData: Prisma.TalentStatsUpdateInput = { lastUpdate: new Date() };
  const createData: Prisma.TalentStatsCreateInput = {
    talent: { connect: { id: talentId } },
    lastUpdate: new Date(),
  };

  let changed = false;

  if (igSnap.ok && typeof igSnap.followers === "number") {
    updateData.igFollowers = igSnap.followers;
    createData.igFollowers = igSnap.followers;
    if (igSnap.followers !== prevIg) changed = true;
  }

  if (ttSnap.ok && typeof ttSnap.followers === "number") {
    updateData.ttFollowers = ttSnap.followers;
    createData.ttFollowers = ttSnap.followers;
    if (ttSnap.followers !== prevTt) changed = true;
  }

  // Si au moins une des deux a réussi, on upsert
  if (igSnap.ok || ttSnap.ok) {
    await prisma.talentStats.upsert({
      where: { talentId },
      update: updateData,
      create: createData,
    });
  }

  return {
    talentId,
    instagram: {
      handle: talent.instagram,
      before: prevIg,
      after: igSnap.ok ? igSnap.followers : null,
      ok: igSnap.ok,
      error: igSnap.ok ? undefined : igSnap.error,
    },
    tiktok: {
      handle: talent.tiktok,
      before: prevTt,
      after: ttSnap.ok ? ttSnap.followers : null,
      ok: ttSnap.ok,
      error: ttSnap.ok ? undefined : ttSnap.error,
    },
    changed,
  };
}

/**
 * Boucle sur tous les talents qui ont au moins un handle social.
 * Utilisé par le cron quotidien.
 */
export async function refreshAllTalentsSocialStats(): Promise<{
  total: number;
  ok: number;
  failed: number;
  results: RefreshResult[];
}> {
  const talents = await prisma.talent.findMany({
    where: {
      OR: [
        { instagram: { not: null } },
        { tiktok: { not: null } },
      ],
    },
    select: { id: true },
  });

  const results: RefreshResult[] = [];
  let ok = 0;
  let failed = 0;

  // Séquentiel pour ne pas saturer Apify (et éviter rate-limit).
  // Pour 100 talents × 2 plateformes, ça prend ~3-5 min, parfait pour un cron.
  for (const t of talents) {
    try {
      const r = await refreshTalentSocialStats(t.id);
      results.push(r);
      if (r.instagram.ok || r.tiktok.ok) ok++;
      else failed++;
    } catch (e) {
      failed++;
      console.error(`refresh talent ${t.id} failed`, e);
    }
  }

  return { total: talents.length, ok, failed, results };
}
