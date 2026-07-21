import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { talentSlug } from "@/lib/talent-slug";

// Mode live : aucune mise en cache côté Next/Edge/CDN.
// La page kit media doit toujours refléter ce qui est saisi sur la fiche talent.
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
  igGenreFemme: true,
  igGenreHomme: true,
  igAge13_17: true,
  igAge18_24: true,
  igAge25_34: true,
  igAge35_44: true,
  igAge45Plus: true,
  igLocFrance: true,
  igLocAutre: true,
  ttFollowers: true,
  ttFollowersEvol: true,
  ttEngagement: true,
  ttEngagementEvol: true,
  ttGenreFemme: true,
  ttGenreHomme: true,
  ttAge13_17: true,
  ttAge18_24: true,
  ttAge25_34: true,
  ttAge35_44: true,
  ttAge45Plus: true,
  ttLocFrance: true,
  ttLocAutre: true,
  ytAbonnes: true,
  ytAbonnesEvol: true,
} as const;

const SELECT_TALENT = {
  id: true,
  prenom: true,
  nom: true,
  email: true,
  photo: true,
  kitPhotos: true,
  presentation: true,
  presentationEn: true,
  instagram: true,
  tiktok: true,
  youtube: true,
  snapchat: true,
  niches: true,
  ville: true,
  pays: true,
  typePeau: true,
  typeCheveux: true,
  couleurCheveux: true,
  selectedClients: true,
  stats: { select: SELECT_STATS },
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

  // Cherche tous les talents non archivés puis filtre par slug calculé.
  // On cherche en mémoire car le slug n'est pas stocké en base.
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

  return NextResponse.json(
    {
    id: talent.id,
    prenom: talent.prenom,
    nom: talent.nom,
    email: talent.email,
    photo: talent.photo,
    // Normalise toujours en tableau de longueur 10.
    // Les slots vides en DB sont stockés en "" (limitation Prisma String[]),
    // on les remappe en null pour le frontend.
    kitPhotos: Array.from({ length: 10 }, (_, i) => {
      const v = (talent.kitPhotos as string[] | undefined)?.[i];
      return typeof v === "string" && v.trim() ? v : null;
    }),
    presentation: talent.presentation,
    presentationEn: talent.presentationEn,
    instagram: talent.instagram,
    tiktok: talent.tiktok,
    youtube: talent.youtube,
    snapchat: talent.snapchat,
    niches: talent.niches,
    ville: talent.ville,
    pays: talent.pays,
    typePeau: talent.typePeau,
    typeCheveux: talent.typeCheveux,
    couleurCheveux: talent.couleurCheveux,
    selectedClients: talent.selectedClients,
    instagramStats: s
      ? {
          followers: s.igFollowers ?? null,
          followersEvol: toNum(s.igFollowersEvol),
          engagement: toNum(s.igEngagement),
          engagementEvol: toNum(s.igEngagementEvol),
          genreFemme: toNum(s.igGenreFemme),
          genreHomme: toNum(s.igGenreHomme),
          age13_17: toNum(s.igAge13_17),
          age18_24: toNum(s.igAge18_24),
          age25_34: toNum(s.igAge25_34),
          age35_44: toNum(s.igAge35_44),
          age45Plus: toNum(s.igAge45Plus),
          locFrance: toNum(s.igLocFrance),
          locAutre: s.igLocAutre,
        }
      : null,
    tiktokStats: s
      ? {
          followers: s.ttFollowers ?? null,
          followersEvol: toNum(s.ttFollowersEvol),
          engagement: toNum(s.ttEngagement),
          engagementEvol: toNum(s.ttEngagementEvol),
          genreFemme: toNum(s.ttGenreFemme),
          genreHomme: toNum(s.ttGenreHomme),
          age13_17: toNum(s.ttAge13_17),
          age18_24: toNum(s.ttAge18_24),
          age25_34: toNum(s.ttAge25_34),
          age35_44: toNum(s.ttAge35_44),
          age45Plus: toNum(s.ttAge45Plus),
          locFrance: toNum(s.ttLocFrance),
          locAutre: s.ttLocAutre,
        }
      : null,
    youtubeStats: s
      ? {
          abonnes: s.ytAbonnes ?? null,
          abonnesEvol: toNum(s.ytAbonnesEvol),
        }
      : null,
      updatedAt: new Date().toISOString(),
    },
    { headers: NO_CACHE_HEADERS }
  );
}
