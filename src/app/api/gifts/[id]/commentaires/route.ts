import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDestinatairesNotification, logDelegationActivite } from "@/lib/delegations";
import type { Role } from "@prisma/client";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { MentionEmail } from "@/lib/emails/MentionEmail";

const MENTION_REGEX = /@\[([a-z0-9]+)\]/gi;
const MESSAGE_PREVIEW_MAX_LEN = 280;

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
            id: true,
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

    const mentionedIds = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = MENTION_REGEX.exec(contenu)) !== null) {
      const mentionedUserId = match[1].trim();
      if (mentionedUserId && mentionedUserId !== user.id) {
        mentionedIds.add(mentionedUserId);
      }
    }

    // Notifications sur nouveau commentaire
    try {
      const auteurRole = user.role;
      const auteurSession = session.user as any;
      const auteurNom = `${auteurSession.prenom || ""} ${auteurSession.nom || ""}`.trim();
      const ref = demande.reference;
      const lien = `/gifts/${id}`;
      const rawBase = (process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr").trim();
      const baseUrl = rawBase.replace(/\/$/, "");
      const contextUrl = `${baseUrl}${lien}`;

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

      // Auteur AM/ADMIN (staff) → notifier la TM (via délégation), sauf commentaire interne
      if (
        staffRoles.includes(auteurRole as Role) &&
        demande.talentId &&
        demande.tmId &&
        demande.tmId !== user.id
      ) {
        if (!interne) {
          const destinataires = await getDestinatairesNotification(demande.talentId);
          await Promise.all(
            destinataires.map((userId) =>
              prisma.notification.create({
                data: {
                  userId,
                  type: "GENERAL",
                  titre: "Nouveau commentaire sur ta demande de gift",
                  message: `${auteurNom} a commenté la demande ${ref}`,
                  lien,
                  actorId: user.id,
                  talentId: demande.talentId,
                  marqueId: demande.marqueId,
                },
              })
            )
          );
        }
      }

      // Mentions explicites dans le commentaire (notifications + emails)
      if (mentionedIds.size > 0) {
        await prisma.$transaction(
          Array.from(mentionedIds).map((mentionedUserId) =>
            prisma.notification.create({
              data: {
                userId: mentionedUserId,
                type: "MENTION",
                titre: `${auteurSession.prenom ?? "Quelqu'un"} vous a mentionné`,
                message: `sur la demande de gift ${ref}`,
                lien,
                actorId: user.id,
                talentId: demande.talentId,
                marqueId: demande.marqueId,
              },
            })
          )
        );

        const resendKey = process.env.RESEND_API_KEY;
        const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
        if (resendKey && fromEmail) {
          const mentionedUsers = await prisma.user.findMany({
            where: { id: { in: Array.from(mentionedIds) } },
            select: { email: true, prenom: true },
          });

          const messagePreview =
            contenu.length > MESSAGE_PREVIEW_MAX_LEN
              ? contenu.slice(0, MESSAGE_PREVIEW_MAX_LEN) + "…"
              : contenu;

          const resend = new Resend(resendKey);
          for (const mentionedUser of mentionedUsers) {
            if (!mentionedUser.email) continue;
            try {
              const html = await render(
                React.createElement(MentionEmail, {
                  mentionnedName: mentionedUser.prenom?.trim() || "vous",
                  mentionnedByName: auteurNom || "Quelqu'un",
                  contextType: "gift",
                  contextReference: ref,
                  messageContent: messagePreview,
                  contextUrl,
                })
              );

              await resend.emails.send({
                from: fromEmail.includes("<") ? fromEmail : `Glow Up Agence <${fromEmail}>`,
                to: mentionedUser.email,
                subject: `[Mention] ${auteurNom || "Quelqu'un"} vous a mentionné dans ${ref}`,
                html,
              });
            } catch (err) {
              console.error("Erreur envoi email mention gift:", mentionedUser.email, err);
            }
          }
        }
      }

      // Log d'activité de délégation (commentaire gift)
      try {
        if (demande.talent.id) {
          await logDelegationActivite({
            talentId: demande.talent.id,
            auteurId: user.id,
            type: "COMMENTAIRE_GIFT",
            entiteType: "GIFT",
            entiteId: demande.id,
            entiteRef: demande.reference,
            detail: "Commentaire ajouté",
          });
        }
      } catch (e) {
        console.error("Erreur logDelegationActivite COMMENTAIRE_GIFT:", e);
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
