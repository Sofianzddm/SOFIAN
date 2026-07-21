import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/community/collaborations
 * Espace community manager : liste en lecture seule des collaborations publiées
 * (marque, talent, date, livrables) + lien de publication (ou marqueur Story).
 * Accès réservé aux rôles COMMUNITY_MANAGER et ADMIN.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = session.user.role;
    if (role !== "COMMUNITY_MANAGER" && role !== "ADMIN") {
      return NextResponse.json({ error: "Accès réservé" }, { status: 403 });
    }

    // Toutes les collabs ayant été publiées : une fois publiée, une collab
    // avance ensuite en FACTURE_RECUE puis PAYE — elle reste donc "publiée"
    // pour la community manager, avec son lien de publication (ou Story).
    // On exclut celles sans lien ET non marquées Story (anciennes collabs
    // publiées avant que le lien devienne obligatoire).
    const collaborations = await prisma.collaboration.findMany({
      where: {
        statut: { in: ["PUBLIE", "FACTURE_RECUE", "PAYE"] },
        OR: [
          { AND: [{ lienPublication: { not: null } }, { lienPublication: { not: "" } }] },
          { isStory: true },
        ],
      },
      include: {
        talent: { select: { id: true, prenom: true, nom: true, photo: true } },
        marque: { select: { id: true, nom: true, secteur: true } },
        livrables: { orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ datePublication: "desc" }, { createdAt: "desc" }],
    });

    const formatted = collaborations.map((c) => ({
      id: c.id,
      reference: c.reference,
      marque: c.marque.nom,
      marqueId: c.marque.id,
      secteur: c.marque.secteur,
      talentId: c.talent.id,
      talentNom: `${c.talent.prenom} ${c.talent.nom}`.trim(),
      talentPhoto: c.talent.photo,
      statut: c.statut,
      lienPublication: c.lienPublication,
      isStory: c.isStory,
      datePublication: c.datePublication,
      createdAt: c.createdAt,
      livrables: c.livrables.map((l) => ({
        typeContenu: l.typeContenu,
        quantite: l.quantite,
        description: l.description,
      })),
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("❌ Erreur GET /api/community/collaborations:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des collaborations" },
      { status: 500 }
    );
  }
}
