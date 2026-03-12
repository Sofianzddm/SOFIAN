import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { GiftPriseEnChargeEmail } from "@/emails/GiftPriseEnChargeEmail";

// POST /api/gifts/[id]/prendre-en-charge - Account Manager prend en charge la demande
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

    // Seuls les Account Managers (CM) peuvent prendre en charge
    if (user.role !== "CM" && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Seuls les Account Managers peuvent prendre en charge les demandes" },
        { status: 403 }
      );
    }

    const demande = await prisma.demandeGift.findUnique({
      where: { id },
      include: {
        talent: {
          select: {
            prenom: true,
            nom: true,
          },
        },
        tm: {
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

    // Vérifier que la demande n'est pas déjà prise en charge
    if (demande.accountManagerId && demande.accountManagerId !== user.id) {
      return NextResponse.json(
        { error: "Cette demande est déjà prise en charge par un autre Account Manager" },
        { status: 400 }
      );
    }

    // Mettre à jour la demande
    const demandeUpdated = await prisma.demandeGift.update({
      where: { id },
      data: {
        accountManagerId: user.id,
        statut: "EN_COURS",
        datePriseEnCharge: new Date(),
      },
      include: {
        accountManager: {
          select: {
            prenom: true,
            nom: true,
            email: true,
          },
        },
      },
    });

    // Ajouter un commentaire automatique
    await prisma.commentaireGift.create({
      data: {
        demandeGiftId: id,
        auteurId: user.id,
        contenu: "J'ai pris en charge cette demande et je vais traiter le dossier.",
        interne: false,
      },
    });

    // Notification : informer la TM que la demande est prise en charge
    try {
      if (demande.tmId && demande.tmId !== user.id) {
        const tmUser = await prisma.user.findUnique({
          where: { id: demande.tmId },
          select: { id: true, email: true, prenom: true, nom: true },
        });

        if (tmUser) {
          const amName =
            demandeUpdated.accountManager?.prenom &&
            demandeUpdated.accountManager?.nom
              ? `${demandeUpdated.accountManager.prenom} ${demandeUpdated.accountManager.nom}`.trim()
              : "Un Account Manager";

          await prisma.notification.create({
            data: {
              userId: tmUser.id,
              type: "GENERAL",
              titre: "Demande de gift prise en charge",
              message: `${amName} a pris en charge ta demande ${demande.reference}`,
              lien: `/gifts/${id}`,
              actorId: user.id,
              talentId: demande.talentId,
              marqueId: demande.marqueId,
            },
          });

          // Email transactionnel à la TM (prise en charge)
          const resendKey = process.env.RESEND_API_KEY;
          const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
          if (resendKey && fromEmail && tmUser.email) {
            try {
              const resend = new Resend(resendKey);
              const link = `/gifts/${id}`;
              const rawBase =
                (process.env.NEXT_PUBLIC_BASE_URL ||
                  "https://app.glowupagence.fr")?.trim() || "";
              const baseUrl = rawBase.replace(/\/$/, "");
              const url = `${baseUrl}${link}`;

              const tmName =
                tmUser.prenom && tmUser.nom
                  ? `${tmUser.prenom} ${tmUser.nom}`.trim()
                  : "Talent Manager";
              const talentName = `${demande.talent.prenom} ${demande.talent.nom}`.trim();
              const typeGift = demande.typeGift;

              const baseSubject = `✅ Ta demande ${demande.reference} a été prise en charge`;
              const urgentPrefix =
                demande.priorite === "URGENTE" ? "🚨 URGENT — " : "";
              const subject = `${urgentPrefix}${baseSubject}`;

              const html = await render(
                React.createElement(GiftPriseEnChargeEmail, {
                  tmName,
                  amName,
                  reference: demande.reference,
                  talentName,
                  typeGift,
                  url,
                })
              );

              await resend.emails.send({
                from: fromEmail.includes("<")
                  ? fromEmail
                  : `Glow Up Agence <${fromEmail}>`,
                to: tmUser.email,
                subject,
                html,
              });
            } catch (err) {
              console.error(
                "Erreur envoi email prise en charge gift:",
                tmUser.email,
                err
              );
            }
          }
        }
      }
    } catch (notifError) {
      console.error("Erreur création notification/email prise en charge gift:", notifError);
    }

    return NextResponse.json(demandeUpdated);
  } catch (error) {
    console.error("Erreur POST /api/gifts/[id]/prendre-en-charge:", error);
    return NextResponse.json(
      { error: "Erreur lors de la prise en charge" },
      { status: 500 }
    );
  }
}
