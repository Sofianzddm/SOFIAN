import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

// POST /api/gifts/[id]/commentaires - Ajouter un commentaire
export async function POST(
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
    const body = await req.json();
    const { contenu, interne } = body;

    if (!contenu || contenu.trim() === "") {
      return NextResponse.json(
        { error: "Le contenu du commentaire est obligatoire" },
        { status: 400 }
      );
    }

    // Vérifier que la demande existe
    const demande = await prisma.demandeGift.findUnique({
      where: { id },
      include: {
        talent: {
          select: {
            prenom: true,
            nom: true,
          },
        },
      },
    });

    if (!demande) {
      return NextResponse.json(
        { error: "Demande non trouvée" },
        { status: 404 }
      );
    }

    // Vérifier les droits d'accès
    const hasAccess =
      user.role === "ADMIN" ||
      user.role === "HEAD_OF" ||
      user.role === "HEAD_OF_INFLUENCE" ||
      user.role === "CM" ||
      demande.tmId === user.id ||
      demande.accountManagerId === user.id;

    if (!hasAccess) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const commentaire = await prisma.commentaireGift.create({
      data: {
        demandeGiftId: id,
        auteurId: user.id,
        contenu,
        interne: interne || false,
      },
      include: {
        auteur: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            role: true,
          },
        },
      },
    });

    // Notifications sur nouveau commentaire
    try {
      const auteurRole = user.role;
      const auteurSession = session.user as any;
      const auteurNom = `${auteurSession.prenom || ""} ${auteurSession.nom || ""}`.trim();
      const ref = demande.reference;
      const lien = `/gifts/${id}`;

      const staffRoles: Role[] = [
        "HEAD_OF",
        "HEAD_OF_INFLUENCE",
        "HEAD_OF_SALES",
        "ADMIN",
      ];

      // Auteur TM → notifier AM assigné, ou tous AM+ADMIN si pas encore assigné
      if (auteurRole === "TM") {
        if (demande.accountManagerId) {
          if (demande.accountManagerId !== user.id) {
            const amUser = await prisma.user.findUnique({
              where: { id: demande.accountManagerId },
              select: { id: true, role: true },
            });

            if (amUser && staffRoles.includes(amUser.role)) {
              await prisma.notification.create({
                data: {
                  userId: amUser.id,
                  type: "GENERAL",
                  titre: "Nouveau commentaire sur une demande de gift",
                  message: `${auteurNom} a commenté la demande ${ref}`,
                  lien,
                  actorId: user.id,
                  talentId: demande.talentId,
                  marqueId: demande.marqueId,
                },
              });
            }
          }
        } else {
          // Pas encore assigné → tous les AM/ADMIN (CM exclu)
          const destinataires = await prisma.user.findMany({
            where: {
              role: { in: staffRoles },
              actif: true,
              id: { not: user.id },
            },
            select: { id: true },
          });

          for (const dest of destinataires) {
            await prisma.notification.create({
              data: {
                userId: dest.id,
                type: "GENERAL",
                titre: "Nouveau commentaire sur une demande de gift",
                message: `${auteurNom} a commenté la demande ${ref}`,
                lien,
                actorId: user.id,
                talentId: demande.talentId,
                marqueId: demande.marqueId,
              },
            });
          }
        }
      }

      // Auteur AM/ADMIN (staff) → notifier la TM, sauf commentaire interne
      if (
        staffRoles.includes(auteurRole as Role) &&
        demande.tmId &&
        demande.tmId !== user.id
      ) {
        if (!interne) {
          await prisma.notification.create({
            data: {
              userId: demande.tmId,
              type: "GENERAL",
              titre: "Nouveau commentaire sur ta demande de gift",
              message: `${auteurNom} a commenté la demande ${ref}`,
              lien,
              actorId: user.id,
              talentId: demande.talentId,
              marqueId: demande.marqueId,
            },
          });
        }
      }
    } catch (notifError) {
      console.error("Erreur notifications commentaire gift:", notifError);
    }

    return NextResponse.json(commentaire, { status: 201 });
  } catch (error) {
    console.error("Erreur POST /api/gifts/[id]/commentaires:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'ajout du commentaire" },
      { status: 500 }
    );
  }
}
