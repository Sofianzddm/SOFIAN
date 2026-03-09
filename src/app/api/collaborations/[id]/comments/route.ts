import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { MentionEmail } from "@/lib/emails/MentionEmail";

const MENTION_REGEX = /@\[([a-z0-9]+)\]/gi;

const MESSAGE_PREVIEW_MAX_LEN = 280;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const params = await Promise.resolve(context.params);
    const { id: collaborationId } = params;
    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "Le contenu du commentaire est requis" },
        { status: 400 }
      );
    }

    const collaboration = await prisma.collaboration.findUnique({
      where: { id: collaborationId },
      select: { id: true, reference: true },
    });

    if (!collaboration) {
      return NextResponse.json(
        { error: "Collaboration non trouvée" },
        { status: 404 }
      );
    }

    const currentUserId = (session.user as { id: string }).id;

    const comment = await prisma.collaborationComment.create({
      data: {
        collaborationId,
        content: content.trim(),
        userId: currentUserId,
      },
      include: {
        user: { select: { id: true, prenom: true, nom: true } },
      },
    });

    const mentionedIds = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = MENTION_REGEX.exec(content)) !== null) {
      const userId = match[1];
      if (userId !== currentUserId) mentionedIds.add(userId);
    }

    if (mentionedIds.size > 0) {
      const actor = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { prenom: true, nom: true },
      });
      const actorName = actor ? `${actor.prenom} ${actor.nom}`.trim() : "Quelqu'un";
      const link = `/collaborations/${collaborationId}`;
      // URL absolue pour les emails (fallback sur app.glowupagence.fr si NEXT_PUBLIC_BASE_URL manquant)
      const rawBase = (process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr").trim();
      const baseUrl = rawBase.replace(/\/$/, "");
      const contextUrl = `${baseUrl}${link}`;

      await prisma.$transaction([
        ...Array.from(mentionedIds).map((mentionedUserId) =>
          prisma.collabCommentMention.create({
            data: {
              commentId: comment.id,
              userId: mentionedUserId,
              mentionedBy: currentUserId,
            },
          })
        ),
        ...Array.from(mentionedIds).map((mentionedUserId) =>
          prisma.notification.create({
            data: {
              userId: mentionedUserId,
              type: "MENTION",
              titre: `${actor?.prenom ?? "Quelqu'un"} vous a mentionné`,
              message: `sur la collaboration ${collaboration.reference}`,
              lien: link,
              actorId: currentUserId,
            },
          })
        ),
      ]);

      // Email de mention via Resend
      const resendKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
      if (resendKey && fromEmail) {
        const mentionedUsers = await prisma.user.findMany({
          where: { id: { in: Array.from(mentionedIds) } },
          select: { id: true, email: true, prenom: true },
        });
        const messagePreview =
          content.length > MESSAGE_PREVIEW_MAX_LEN
            ? content.slice(0, MESSAGE_PREVIEW_MAX_LEN) + "…"
            : content;
        const resend = new Resend(resendKey);
        for (const u of mentionedUsers) {
          const mentionnedName = u.prenom?.trim() || "vous";
          try {
            const html = await render(
              React.createElement(MentionEmail, {
                mentionnedName,
                mentionnedByName: actorName,
                contextType: "collaboration",
                contextReference: collaboration.reference,
                messageContent: messagePreview,
                contextUrl,
              })
            );
            await resend.emails.send({
              from: fromEmail.includes("<") ? fromEmail : `Glow Up Agence <${fromEmail}>`,
              to: u.email,
              subject: `[Mention] ${actorName} vous a mentionné dans ${collaboration.reference}`,
              html,
            });
          } catch (err) {
            console.error("Erreur envoi email mention collaboration:", u.email, err);
          }
        }
      }
    }

    return NextResponse.json(comment);
  } catch (error) {
    console.error("Erreur création commentaire collab:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'ajout du commentaire" },
      { status: 500 }
    );
  }
}
