import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { talentSlug } from "@/lib/talent-slug";

// Mode live : aucune mise en cache côté Next / Edge / CDN.
// La grille tarifaire publique doit toujours refléter ce qui est saisi
// sur la fiche talent (stats + tarifs).
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
} as const;

const SELECT_STATS = {
  igFollowers: true,
  igFollowersEvol: true,
  igEngagement: true,
  igEngagementEvol: true,
  ttFollowers: true,
  ttFollowersEvol: true,
  ttEngagement: true,
  ttEngagementEvol: true,
  ytAbonnes: true,
  ytAbonnesEvol: true,
} as const;

const SELECT_TARIFS = {
  tarifStory: true,
  tarifStoryConcours: true,
  tarifPost: true,
  tarifPostConcours: true,
  tarifPostCommun: true,
  tarifPostCrosspost: true,
  tarifReel: true,
  tarifReelCrosspost: true,
  tarifReelConcours: true,
  tarifTiktokVideo: true,
  tarifTiktokConcours: true,
  tarifYoutubeVideo: true,
  tarifYoutubeShort: true,
  tarifSnapchatStory: true,
  tarifSnapchatSpotlight: true,
  tarifEvent: true,
  tarifShooting: true,
  tarifAmbassadeur: true,
} as const;

const SELECT_TALENT = {
  id: true,
  prenom: true,
  nom: true,
  photo: true,
  instagram: true,
  tiktok: true,
  youtube: true,
  niches: true,
  stats: { select: SELECT_STATS },
  tarifs: { select: SELECT_TARIFS },
} as const;

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Le slug n'est pas stocké en base : on charge tous les talents non
  // archivés puis on filtre en mémoire via talentSlug(prenom, nom).
  const talents = await prisma.talent.findMany({
    where: { isArchived: false },
    select: SELECT_TALENT,
  });

  const talent = talents.find(
    (t) => talentSlug(t.prenom, t.nom) === slug.toLowerCase()
  );

  if (!talent) {
    return NextResponse.json(
      { error: "Talent introuvable" },
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }

  const s = talent.stats;
  const tf = talent.tarifs;

  return NextResponse.json(
    {
      id: talent.id,
      prenom: talent.prenom,
      nom: talent.nom,
      photo: talent.photo,
      niches: talent.niches,
      instagram: talent.instagram,
      tiktok: talent.tiktok,
      youtube: talent.youtube,
      stats: {
        instagram: s
          ? {
              followers: s.igFollowers ?? null,
              followersEvol: toNum(s.igFollowersEvol),
              engagement: toNum(s.igEngagement),
              engagementEvol: toNum(s.igEngagementEvol),
            }
          : null,
        tiktok: s
          ? {
              followers: s.ttFollowers ?? null,
              followersEvol: toNum(s.ttFollowersEvol),
              engagement: toNum(s.ttEngagement),
              engagementEvol: toNum(s.ttEngagementEvol),
            }
          : null,
        youtube: s
          ? {
              followers: s.ytAbonnes ?? null,
              followersEvol: toNum(s.ytAbonnesEvol),
              // Pas d'engagement YouTube en base actuellement
              engagement: null,
              engagementEvol: null,
            }
          : null,
      },
      tarifs: tf
        ? {
            tarifStory: toNum(tf.tarifStory),
            tarifStoryConcours: toNum(tf.tarifStoryConcours),
            tarifPost: toNum(tf.tarifPost),
            tarifPostConcours: toNum(tf.tarifPostConcours),
            tarifPostCommun: toNum(tf.tarifPostCommun),
            tarifPostCrosspost: toNum(tf.tarifPostCrosspost),
            tarifReel: toNum(tf.tarifReel),
            tarifReelCrosspost: toNum(tf.tarifReelCrosspost),
            tarifReelConcours: toNum(tf.tarifReelConcours),
            tarifTiktokVideo: toNum(tf.tarifTiktokVideo),
            tarifTiktokConcours: toNum(tf.tarifTiktokConcours),
            tarifYoutubeVideo: toNum(tf.tarifYoutubeVideo),
            tarifYoutubeShort: toNum(tf.tarifYoutubeShort),
            tarifSnapchatStory: toNum(tf.tarifSnapchatStory),
            tarifSnapchatSpotlight: toNum(tf.tarifSnapchatSpotlight),
            tarifEvent: toNum(tf.tarifEvent),
            tarifShooting: toNum(tf.tarifShooting),
            tarifAmbassadeur: toNum(tf.tarifAmbassadeur),
          }
        : null,
      updatedAt: new Date().toISOString(),
    },
    { headers: NO_CACHE_HEADERS }
  );
}
