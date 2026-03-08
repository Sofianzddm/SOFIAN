import React from "react";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { MentionEmail } from "@/lib/emails/MentionEmail";

// Format stocké en DB : @[userId] (comme collaborations)
const MENTION_REGEX = /@\[([a-z0-9]+)\]/gi;
const MESSAGE_PREVIEW_MAX_LEN = 280;

// POST - Ajouter un commentaire
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    const { contenu } = await request.json();

    if (!contenu?.trim()) {
      return NextResponse.json({ message: "Contenu obligatoire" }, { status: 400 });
    }

    const currentUserId = (session.user as { id: string }).id;

    // Créer le commentaire
    const commentaire = await prisma.negoCommentaire.create({
      data: {
        negociationId: id,
        userId: currentUserId,
        contenu: contenu.trim(),
      },
      include: {
        user: {
          select: { id: true, prenom: true, nom: true, role: true },
        },
      },
    });

    // Mettre à jour le statut si c'est le Head Of qui commente et que c'est en attente
    const nego = await prisma.negociation.findUnique({
      where: { id: id },
      select: { statut: true, reference: true },
    });

    if (nego?.statut === "EN_ATTENTE" && (session.user.role === "HEAD_OF" || session.user.role === "HEAD_OF_INFLUENCE" || session.user.role === "ADMIN")) {
      await prisma.negociation.update({
        where: { id: id },
        data: { statut: "EN_DISCUSSION" },
      });
    }

    // Extraire les @[userId] et envoyer les emails
    const mentionedIds = [...new Set([...contenu.matchAll(MENTION_REGEX)].map((m) => m[1].trim()).filter(Boolean))].filter((id) => id !== currentUserId);
    if (mentionedIds.length > 0 && nego?.reference) {
      const mentionedUsers = await prisma.user.findMany({
        where: { id: { in: mentionedIds } },
        select: { id: true, email: true, prenom: true },
      });
      const toEmail = mentionedUsers;

      const resendKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
      if (resendKey && fromEmail && toEmail.length > 0) {
        const actor = await prisma.user.findUnique({
          where: { id: currentUserId },
          select: { prenom: true, nom: true },
        });
        const actorName = actor ? `${actor.prenom} ${actor.nom}`.trim() : "Quelqu'un";
        const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/$/, "");
        const link = `/negociations/${id}`;
        const contextUrl = baseUrl ? `${baseUrl}${link}` : link;
        const messagePreview =
          contenu.length > MESSAGE_PREVIEW_MAX_LEN
            ? contenu.slice(0, MESSAGE_PREVIEW_MAX_LEN) + "…"
            : contenu;

        const resend = new Resend(resendKey);
        for (const u of toEmail) {
          const mentionnedName = u.prenom?.trim() || "vous";
          try {
            const html = await render(
              React.createElement(MentionEmail, {
                mentionnedName,
                mentionnedByName: actorName,
                contextType: "negociation",
                contextReference: nego.reference,
                messageContent: messagePreview,
                contextUrl,
              })
            );
            await resend.emails.send({
              from: fromEmail.includes("<") ? fromEmail : `Glow Up Agence <${fromEmail}>`,
              to: u.email,
              subject: `[Mention] ${actorName} vous a mentionné dans ${nego.reference}`,
              html,
            });
          } catch (err) {
            console.error("Erreur envoi email mention négociation:", u.email, err);
          }
        }
      }
    }

    return NextResponse.json(commentaire, { status: 201 });
  } catch (error) {
    console.error("Erreur POST commentaire:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}
