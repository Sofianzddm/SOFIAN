import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/collaborations/[id]/assigner-am - Assigner un Account Manager
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };

    // Seuls HEAD_OF_SALES et ADMIN peuvent assigner un AM
    if (user.role !== "HEAD_OF_SALES" && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Seuls les HEAD_OF_SALES peuvent assigner un Account Manager" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { accountManagerId } = body;

    if (!accountManagerId) {
      return NextResponse.json(
        { error: "L'ID de l'Account Manager est requis" },
        { status: 400 }
      );
    }

    const { id } = await params;

    // Vérifier que la collaboration existe
    const collab = await prisma.collaboration.findUnique({
      where: { id },
      include: {
        talent: {
          select: { prenom: true, nom: true },
        },
        marque: {
          select: { nom: true },
        },
      },
    });

    if (!collab) {
      return NextResponse.json(
        { error: "Collaboration non trouvée" },
        { status: 404 }
      );
    }

    // Vérifier que l'utilisateur à assigner est bien un CM
    const accountManager = await prisma.user.findUnique({
      where: { id: accountManagerId },
    });

    if (!accountManager) {
      return NextResponse.json(
        { error: "Account Manager non trouvé" },
        { status: 404 }
      );
    }

    if (accountManager.role !== "CM" && accountManager.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Cet utilisateur n'est pas un Account Manager" },
        { status: 400 }
      );
    }

    // Assigner l'Account Manager
    const collabUpdated = await prisma.collaboration.update({
      where: { id },
      data: {
        accountManagerId,
        dateAssignationAM: new Date(),
      },
      include: {
        accountManager: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
          },
        },
        talent: {
          select: { prenom: true, nom: true },
        },
        marque: {
          select: { nom: true },
        },
      },
    });

    // TODO: Créer une notification pour l'Account Manager
    // await prisma.notification.create({
    //   data: {
    //     userId: accountManagerId,
    //     type: "COLLABORATION",
    //     titre: "Nouvelle collaboration assignée",
    //     message: `La collaboration ${collab.reference} vous a été assignée`,
    //     lien: `/collaborations/${collab.id}`,
    //     collabId: collab.id,
    //   },
    // });

    return NextResponse.json(collabUpdated);
  } catch (error) {
    console.error("Erreur POST /api/collaborations/[id]/assigner-am:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'assignation" },
      { status: 500 }
    );
  }
}

// DELETE /api/collaborations/[id]/assigner-am - Retirer l'Account Manager
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };

    // Seuls HEAD_OF_SALES et ADMIN peuvent retirer un AM
    if (user.role !== "HEAD_OF_SALES" && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Seuls les HEAD_OF_SALES peuvent retirer un Account Manager" },
        { status: 403 }
      );
    }

    // Retirer l'assignation
    const collabUpdated = await prisma.collaboration.update({
      where: { id },
      data: {
        accountManagerId: null,
        dateAssignationAM: null,
      },
    });

    return NextResponse.json(collabUpdated);
  } catch (error) {
    console.error("Erreur DELETE /api/collaborations/[id]/assigner-am:", error);
    return NextResponse.json(
      { error: "Erreur lors du retrait de l'assignation" },
      { status: 500 }
    );
  }
}
