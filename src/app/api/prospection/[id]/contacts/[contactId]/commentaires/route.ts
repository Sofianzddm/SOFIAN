import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionAndContact } from "../route";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { MentionEmail } from "@/lib/emails/MentionEmail";

const MENTION_REGEX = /@\[([a-z0-9]+)\]/gi;
const MESSAGE_PREVIEW_MAX_LEN = 280;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const { contactId } = await params;
    const result = await getSessionAndContact(request, contactId);
    if ("error" in result) return result.error;

    const { session, contact } = result;

    const body = await request.json();
    const { contenu } = body as { contenu?: string };

    const finalContenu = (contenu || "").trim();
    if (!finalContenu) {
      return NextResponse.json({ error: "Contenu requis" }, { status: 400 });
    }

    const [commentaire] = await prisma.$transaction([
      prisma.prospectionCommentaire.create({
        data: {
          contactId,
          auteurId: session.user.id,
          contenu: finalContenu,
        },
        include: {
          auteur: {
            select: {
              id: true,
              prenom: true,
              nom: true,
            },
          },
        },
      }),
      prisma.prospectionHistorique.create({
        data: {
          contactId,
          auteurId: session.user.id,
          type: "COMMENTAIRE",
          detail:
            finalContenu.length > 50
              ? `${finalContenu.slice(0, 47)}...`
              : finalContenu,
        },
      }),
    ]);

    const currentUserId = session.user.id;

    const mentionedIds = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = MENTION_REGEX.exec(finalContenu)) !== null) {
      const userId = match[1].trim();
      if (userId && userId !== currentUserId) {
        mentionedIds.add(userId);
      }
    }

    if (mentionedIds.size > 0) {
      const actor = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { prenom: true, nom: true },
      });
      const actorName = actor
        ? `${actor.prenom} ${actor.nom}`.trim()
        : "Quelqu'un";
      const link = `/prospection/${contact.fichierId}`;
      const rawBase =
        (process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr").trim();
      const baseUrl = rawBase.replace(/\/$/, "");
      const contextUrl = `${baseUrl}${link}`;

      await prisma.$transaction([
        ...Array.from(mentionedIds).map((mentionedUserId) =>
          prisma.notification.create({
            data: {
              userId: mentionedUserId,
              type: "MENTION",
              titre: `${actor?.prenom ?? "Quelqu'un"} vous a mentionné`,
              message: `dans un fichier de prospection (${contact.fichier.titre})`,
              lien: link,
              actorId: currentUserId,
            },
          })
        ),
      ]);

      const resendKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
      if (resendKey && fromEmail) {
        const mentionedUsers = await prisma.user.findMany({
          where: { id: { in: Array.from(mentionedIds) } },
          select: { id: true, email: true, prenom: true },
        });
        const messagePreview =
          finalContenu.length > MESSAGE_PREVIEW_MAX_LEN
            ? finalContenu.slice(0, MESSAGE_PREVIEW_MAX_LEN) + "…"
            : finalContenu;
        const resend = new Resend(resendKey);
        for (const u of mentionedUsers) {
          const mentionnedName = u.prenom?.trim() || "vous";
          try {
            const html = await render(
              React.createElement(MentionEmail, {
                mentionnedName,
                mentionnedByName: actorName,
                contextType: "prospection",
                contextReference: contact.nomOpportunite,
                messageContent: messagePreview,
                contextUrl,
              })
            );
            await resend.emails.send({
              from: fromEmail.includes("<")
                ? fromEmail
                : `Glow Up Agence <${fromEmail}>`,
              to: u.email,
              subject: `[Mention] ${actorName} vous a mentionné dans une opportunité`,
              html,
            });
          } catch (err) {
            console.error(
              "Erreur envoi email mention prospection:",
              u.email,
              err
            );
          }
        }
      }
    }

    return NextResponse.json(
      {
        id: commentaire.id,
        contenu: commentaire.contenu,
        createdAt: commentaire.createdAt,
        auteur: {
          id: commentaire.auteur.id,
          name: `${commentaire.auteur.prenom} ${commentaire.auteur.nom}`.trim(),
          image: null as string | null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Erreur POST /api/prospection/[id]/contacts/[contactId]/commentaires:",
      error
    );
    return NextResponse.json(
      { error: "Erreur lors de l'ajout du commentaire" },
      { status: 500 }
    );
  }
}

