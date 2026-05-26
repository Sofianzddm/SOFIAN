/**
 * Met à jour automatiquement les stats Instagram & TikTok d'un talent
 * (followers + évolution en %) à partir des handles présents sur sa fiche.
 *
 * Utilisé par :
 *  - le cron quotidien `/api/cron/refresh-social-stats`
 *  - le bouton manuel sur la fiche talent `/api/talents/[id]/refresh-stats`
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { fetchInstagramProfile, fetchTiktokProfile } from "@/lib/social-stats";

export interface RefreshResult {
  talentId: string;
  instagram: {
    handle: string | null;
    before: number | null;
    after: number | null;
    evol: number | null;
    ok: boolean;
    error?: string;
  };
  tiktok: {
    handle: string | null;
    before: number | null;
    after: number | null;
    evol: number | null;
    ok: boolean;
    error?: string;
  };
  changed: boolean;
}

/**
 * Calcule l'évolution en pourcentage entre deux valeurs.
 * Renvoie un nombre avec 2 décimales (ex: 4.32 = +4.32%).
 * Renvoie 0 si l'ancienne valeur est null/0 et qu'on a une nouvelle valeur.
 */
function computeEvol(prev: number | null | undefined, next: number): number {
  if (!prev || prev <= 0) return 0;
  const evol = ((next - prev) / prev) * 100;
  return Math.round(evol * 100) / 100;
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

  // On ne met à jour en DB que les champs réellement récupérés (on n'écrase
  // pas une stat manuelle valide par null si Apify a échoué).
  const updateData: Prisma.TalentStatsUpdateInput = { lastUpdate: new Date() };
  const createData: Prisma.TalentStatsCreateInput = {
    talent: { connect: { id: talentId } },
    lastUpdate: new Date(),
  };

  let changed = false;

  let igEvol: number | null = null;
  if (igSnap.ok && typeof igSnap.followers === "number") {
    igEvol = computeEvol(prevIg, igSnap.followers);
    updateData.igFollowers = igSnap.followers;
    updateData.igFollowersEvol = new Prisma.Decimal(igEvol);
    createData.igFollowers = igSnap.followers;
    createData.igFollowersEvol = new Prisma.Decimal(igEvol);
    if (igSnap.followers !== prevIg) changed = true;
  }

  let ttEvol: number | null = null;
  if (ttSnap.ok && typeof ttSnap.followers === "number") {
    ttEvol = computeEvol(prevTt, ttSnap.followers);
    updateData.ttFollowers = ttSnap.followers;
    updateData.ttFollowersEvol = new Prisma.Decimal(ttEvol);
    createData.ttFollowers = ttSnap.followers;
    createData.ttFollowersEvol = new Prisma.Decimal(ttEvol);
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
      evol: igSnap.ok ? igEvol : null,
      ok: igSnap.ok,
      error: igSnap.ok ? undefined : igSnap.error,
    },
    tiktok: {
      handle: talent.tiktok,
      before: prevTt,
      after: ttSnap.ok ? ttSnap.followers : null,
      evol: ttSnap.ok ? ttEvol : null,
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
