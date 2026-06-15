import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { talentSlug } from "@/lib/talent-slug";

/**
 * Liens personnels (par slug nom/prénom, comme /kit/[slug]) de tous les
 * talents tagués dans cet événement.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { id } = await params;

  const tags = await prisma.eventPhotoTalent.findMany({
    where: { photo: { eventId: id } },
    select: {
      talent: { select: { id: true, prenom: true, nom: true } },
    },
  });

  // Talents uniques + nombre de photos taguées dans cet événement
  const countByTalent = new Map<string, number>();
  const talentMap = new Map<
    string,
    { id: string; prenom: string; nom: string }
  >();
  for (const tag of tags) {
    const t = tag.talent;
    talentMap.set(t.id, t);
    countByTalent.set(t.id, (countByTalent.get(t.id) || 0) + 1);
  }

  const links = Array.from(talentMap.values()).map((t) => {
    const slug = talentSlug(t.prenom, t.nom);
    return {
      talentId: t.id,
      prenom: t.prenom,
      nom: t.nom,
      slug,
      path: `/photos/${slug}`,
      photoCount: countByTalent.get(t.id) || 0,
    };
  });

  links.sort((a, b) =>
    `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, "fr")
  );

  return NextResponse.json({ links });
}
