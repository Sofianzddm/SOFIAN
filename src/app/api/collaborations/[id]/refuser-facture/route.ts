import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { v2 as cloudinary } from "cloudinary";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { FactureTalentRefuseeEmail } from "@/lib/emails/FactureTalentRefuseeEmail";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// POST - Refuser la facture talent (commentaire obligatoire + mail au talent)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Seuls les ADMIN peuvent refuser les factures talents" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const commentaire =
      typeof body?.raisonRefus === "string" ? body.raisonRefus.trim() : "";

    if (!commentaire) {
      return NextResponse.json(
        { error: "Un commentaire est obligatoire pour refuser la facture" },
        { status: 400 }
      );
    }

    const collaboration = await prisma.collaboration.findUnique({
      where: { id },
      include: {
        talent: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
            userId: true,
          },
        },
        marque: {
          select: { nom: true },
        },
      },
    });

    if (!collaboration) {
      return NextResponse.json(
        { error: "Collaboration non trouvée" },
        { status: 404 }
      );
    }

    if (!collaboration.factureTalentUrl) {
      return NextResponse.json(
        { error: "Aucune facture n'a été uploadée pour cette collaboration" },
        { status: 400 }
      );
    }

    if (collaboration.factureValidee) {
      return NextResponse.json(
        { error: "Cette facture a déjà été validée, elle ne peut plus être refusée" },
        { status: 400 }
      );
    }

    // Supprimer le fichier Cloudinary si possible
    if (collaboration.factureTalentUrl.includes("cloudinary.com")) {
      try {
        const urlParts = collaboration.factureTalentUrl.split("/");
        const filenameWithExt = urlParts[urlParts.length - 1];
        const folder = urlParts[urlParts.length - 2];
        const publicId = `${folder}/${filenameWithExt.split(".")[0]}`;
        await cloudinary.uploader.destroy(publicId);
      } catch (e) {
        console.log("Facture Cloudinary non supprimée:", e);
      }
    }

    const updated = await prisma.collaboration.update({
      where: { id },
      data: {
        factureTalentUrl: null,
        factureTalentRecueAt: null,
        factureValidee: false,
        factureValideeAt: null,
        depenseId: null,
        statut:
          collaboration.statut === "FACTURE_RECUE"
            ? "PUBLIE"
            : collaboration.statut,
      },
    });

    // Commentaire visible sur la collab
    await prisma.collaborationComment.create({
      data: {
        collaborationId: id,
        userId: session.user.id,
        content: `❌ Facture talent refusée\n\n${commentaire}`,
      },
    });

    // Notification in-app
    if (collaboration.talent.userId) {
      await prisma.notification.create({
        data: {
          userId: collaboration.talent.userId,
          type: "GENERAL",
          titre: "Facture refusée",
          message: `Votre facture pour ${collaboration.reference} a été refusée. Motif : ${commentaire}`,
          lien: `/talent/collaborations`,
          collabId: id,
        },
      });
    }

    // Email au talent (best-effort)
    let emailSent = false;
    const talentEmail = collaboration.talent.email?.trim();
    const resendKey = process.env.RESEND_API_KEY?.trim();
    const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
    if (talentEmail && resendKey && fromEmail) {
      try {
        const rawBase = (process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr").trim();
        const portalUrl = `${rawBase.replace(/\/$/, "")}/talent/collaborations`;
        const html = await render(
          React.createElement(FactureTalentRefuseeEmail, {
            prenom: collaboration.talent.prenom || "toi",
            reference: collaboration.reference,
            marque: collaboration.marque?.nom || "",
            commentaire,
            portalUrl,
          })
        );
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: fromEmail.includes("<") ? fromEmail : `Glow Up Agence <${fromEmail}>`,
          to: talentEmail,
          subject: `Facture refusée — ${collaboration.reference}`,
          html,
        });
        emailSent = true;
      } catch (mailErr) {
        console.error("Erreur envoi email refus facture talent:", mailErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: emailSent
        ? "Facture refusée. Commentaire ajouté et mail envoyé au talent."
        : "Facture refusée. Commentaire ajouté (mail non envoyé).",
      emailSent,
      collaboration: updated,
    });
  } catch (error) {
    console.error("Erreur refus facture:", error);
    return NextResponse.json(
      { error: "Erreur lors du refus de la facture" },
      { status: 500 }
    );
  }
}
