import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canReadContratMarqueReview } from "@/lib/contratMarqueAccess";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { contenu?: string };
    const contenu = body.contenu?.trim();
    if (!contenu) {
      return NextResponse.json({ error: "Le contenu est requis" }, { status: 400 });
    }

    const collab = await prisma.collaboration.findUnique({
      where: { id },
      select: {
        id: true,
        accountManagerId: true,
        contratMarqueVersionActuelle: true,
        talent: { select: { managerId: true } },
      },
    });
    if (!collab) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }

    const user = session.user as { id: string; role: string; name?: string | null };
    const canComment =
      canReadContratMarqueReview(user.id, user.role, collab);
    if (!canComment) {
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: { prenom: true, nom: true, role: true },
    });
    const auteur = profile ? `${profile.prenom} ${profile.nom}`.trim() : (user.name ?? "Utilisateur");
    const auteurRole = profile?.role ?? user.role ?? "USER";

    let currentVersion = await prisma.contratMarqueVersion.findFirst({
      where: { collaborationId: id, numero: collab.contratMarqueVersionActuelle },
    });
    if (!currentVersion) {
      currentVersion = await prisma.contratMarqueVersion.findFirst({
        where: { collaborationId: id },
        orderBy: { numero: "desc" },
      });
    }

    const commentaire = await prisma.contratMarqueCommentaire.create({
      data: {
        collaborationId: id,
        auteurId: user.id,
        auteur,
        auteurRole,
        contenu,
        ...(currentVersion ? { versionId: currentVersion.id } : {}),
      },
    });

    return NextResponse.json(commentaire);
  } catch (error) {
    console.error("POST contrat-marque/commentaire:", error);
    return NextResponse.json({ error: "Erreur lors de l'ajout du commentaire" }, { status: 500 });
  }
}
