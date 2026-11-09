import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getDestinatairesNotification,
  talentAccessForGiftSelect,
} from "@/lib/delegations";
import { canContactGiftMarques } from "@/lib/gifts/gift-roles";

const STATUTS = new Set([
  "A_CONTACTER",
  "CONTACTEE",
  "RELANCEE",
  "ACCEPTEE",
  "REFUSEE",
  "SANS_REPONSE",
]);

// PATCH — maj statutContact / note réponse d'une marque
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; marqueId: string }> }
) {
  try {
    const { id, marqueId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const user = session.user as { id: string; role: string };
    if (!canContactGiftMarques(user.role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      statutContact?: string;
      reponseNote?: string | null;
      updateGiftStatut?: boolean;
      /** true = stop relance auto J+2 ; false = réactiver */
      cancelRelance?: boolean;
    };

    const link = await prisma.demandeGiftMarque.findUnique({
      where: {
        demandeGiftId_marqueId: { demandeGiftId: id, marqueId },
      },
      include: {
        marque: { select: { nom: true } },
        demandeGift: {
          select: {
            id: true,
            reference: true,
            statut: true,
            archivedAt: true,
            talent: { select: { prenom: true, nom: true, ...talentAccessForGiftSelect } },
          },
        },
      },
    });
    if (!link) {
      return NextResponse.json(
        { error: "Marque non liée à cette demande." },
        { status: 404 }
      );
    }
    if (link.demandeGift.archivedAt) {
      return NextResponse.json(
        { error: "Cette demande est archivée." },
        { status: 400 }
      );
    }

    const data: {
      statutContact?: string;
      reponseNote?: string | null;
      relanceCancelledAt?: Date | null;
    } = {};

    if (body.statutContact !== undefined) {
      const statut = String(body.statutContact).trim().toUpperCase();
      if (!STATUTS.has(statut)) {
        return NextResponse.json(
          { error: `statutContact invalide: ${body.statutContact}` },
          { status: 400 }
        );
      }
      data.statutContact = statut;
    }
    if ("reponseNote" in body) {
      data.reponseNote =
        body.reponseNote === null || body.reponseNote === undefined
          ? null
          : String(body.reponseNote).trim() || null;
    }
    if (typeof body.cancelRelance === "boolean") {
      data.relanceCancelledAt = body.cancelRelance ? new Date() : null;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Rien à modifier." }, { status: 400 });
    }

    const updated = await prisma.demandeGiftMarque.update({
      where: {
        demandeGiftId_marqueId: { demandeGiftId: id, marqueId },
      },
      data,
    });

    let giftStatut: string | null = null;
    if (
      body.updateGiftStatut &&
      data.statutContact === "ACCEPTEE" &&
      link.demandeGift.statut !== "ACCEPTE" &&
      link.demandeGift.statut !== "ENVOYE" &&
      link.demandeGift.statut !== "RECU"
    ) {
      await prisma.demandeGift.update({
        where: { id },
        data: {
          statut: "ACCEPTE",
          dateReponseMarque: new Date(),
        },
      });
      giftStatut = "ACCEPTE";

      try {
        const gift = await prisma.demandeGift.findUnique({
          where: { id },
          select: { talentId: true, reference: true, marqueId: true },
        });
        if (gift?.talentId) {
          const destinataires = (
            await getDestinatairesNotification(gift.talentId)
          ).filter((destId) => destId !== user.id);
          const talentName = [
            link.demandeGift.talent?.prenom,
            link.demandeGift.talent?.nom,
          ]
            .filter(Boolean)
            .join(" ");
          await Promise.all(
            destinataires.map((userId) =>
              prisma.notification.create({
                data: {
                  userId,
                  type: "GENERAL",
                  titre: "Mise à jour de ta demande de gift",
                  message: `🎉 La marque a accepté ta demande ${gift.reference} pour ${talentName}`,
                  lien: `/gifts/${id}`,
                  actorId: user.id,
                  talentId: gift.talentId,
                  marqueId: gift.marqueId,
                },
              })
            )
          );
        }
      } catch (notifErr) {
        console.error("Notif acceptation marque gift:", notifErr);
      }
    }

    if (data.statutContact === "REFUSEE") {
      await prisma.commentaireGift.create({
        data: {
          demandeGiftId: id,
          auteurId: user.id,
          contenu: `[Réponse marque] ${link.marque.nom} : Refusée${
            data.reponseNote ? `\nNote : ${data.reponseNote}` : ""
          }`,
          interne: true,
        },
      });
    } else if (data.statutContact === "ACCEPTEE") {
      await prisma.commentaireGift.create({
        data: {
          demandeGiftId: id,
          auteurId: user.id,
          contenu: `[Réponse marque] ${link.marque.nom} : Acceptée${
            data.reponseNote ? `\nNote : ${data.reponseNote}` : ""
          }${giftStatut ? "\n→ Statut gift passé à Accepté." : ""}`,
          interne: true,
        },
      });
    } else if (data.statutContact === "SANS_REPONSE") {
      await prisma.commentaireGift.create({
        data: {
          demandeGiftId: id,
          auteurId: user.id,
          contenu: `[Réponse marque] ${link.marque.nom} : Sans réponse`,
          interne: true,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      marque: updated,
      giftStatut,
    });
  } catch (error) {
    console.error("PATCH /api/gifts/[id]/marques/[marqueId]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
