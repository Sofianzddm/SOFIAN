import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { canReadContratMarqueReview } from "@/lib/contratMarqueAccess";
import {
  findJuristesContratMarque,
  isContratMarqueExcludedNotificationEmail,
  CONTRAT_MARQUE_MAILBOX,
} from "@/lib/contratMarqueNotifications";
import { ContratMarqueNouveauCommentaireEmail } from "@/lib/emails/ContratMarqueNouveauCommentaireEmail";
import { MentionEmail } from "@/lib/emails/MentionEmail";

const MESSAGE_PREVIEW_MAX_LEN = 280;
const MENTION_REGEX = /@\[([a-z0-9]+)\]/gi;

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
        reference: true,
        accountManagerId: true,
        contratMarqueVersionActuelle: true,
        talent: { select: { managerId: true, prenom: true, nom: true } },
        marque: { select: { nom: true } },
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

    const label = `${collab.talent.prenom} ${collab.talent.nom} x ${collab.marque.nom}`.trim();
    const rawBase = (process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr").trim();
    const baseUrl = rawBase.replace(/\/$/, "");
    const messagePreview =
      contenu.length > MESSAGE_PREVIEW_MAX_LEN
        ? contenu.slice(0, MESSAGE_PREVIEW_MAX_LEN) + "…"
        : contenu;
    // Lien adapté au destinataire : le juriste a son espace dédié.
    const reviewLinkFor = (role: string | null | undefined) =>
      role === "JURISTE" ? `/juriste/${id}` : `/collaborations/${id}/contrat-marque`;

    // --- @mentions : notification in-app + email ciblé pour chaque personne mentionnée ---
    const mentionedIds = new Set<string>();
    let mentionMatch: RegExpExecArray | null;
    while ((mentionMatch = MENTION_REGEX.exec(contenu)) !== null) {
      if (mentionMatch[1] !== user.id) mentionedIds.add(mentionMatch[1]);
    }
    /** Emails déjà notifiés via @mention → à exclure du broadcast pour éviter les doublons. */
    const mentionedEmails = new Set<string>();

    if (mentionedIds.size > 0) {
      const mentionedUsers = await prisma.user.findMany({
        where: { id: { in: Array.from(mentionedIds) }, actif: true },
        select: { id: true, email: true, prenom: true, role: true },
      });

      try {
        await prisma.$transaction(
          mentionedUsers.map((mu) =>
            prisma.notification.create({
              data: {
                userId: mu.id,
                type: "MENTION",
                titre: `${profile?.prenom ?? auteur} vous a mentionné`,
                message: `sur la relecture du contrat ${label}`,
                lien: reviewLinkFor(mu.role),
                actorId: user.id,
                collabId: id,
              },
            })
          )
        );
      } catch (notifErr) {
        console.error("Erreur création notification mention contrat marque:", notifErr);
      }

      const mentionResendKey = process.env.RESEND_API_KEY?.trim();
      if (mentionResendKey) {
        const resend = new Resend(mentionResendKey);
        const mentionSubject = `[Contrat marque] ${auteur} vous a mentionné — ${label}`;
        for (const mu of mentionedUsers) {
          // Le juriste est notifié sur la boîte partagée, pas sur son mail perso.
          const isJuriste = mu.role === "JURISTE";
          const to = isJuriste ? CONTRAT_MARQUE_MAILBOX : mu.email?.trim();
          if (!to) continue;
          if (!isJuriste && isContratMarqueExcludedNotificationEmail(to)) continue;
          mentionedEmails.add(to.toLowerCase());
          try {
            const html = await render(
              React.createElement(MentionEmail, {
                mentionnedName: mu.prenom?.trim() || "vous",
                mentionnedByName: auteur,
                contextType: "contrat_marque",
                contextReference: label,
                messageContent: messagePreview,
                contextUrl: `${baseUrl}${reviewLinkFor(mu.role)}`,
              })
            );
            await resend.emails.send({
              from: "Glow Up <contrat@glowupagence.fr>",
              to,
              subject: mentionSubject,
              html,
            });
          } catch (mentionMailErr) {
            console.error("Erreur envoi email mention contrat marque:", to, mentionMailErr);
          }
        }
      }
    }

    const resendKey = process.env.RESEND_API_KEY?.trim();
    if (resendKey) {
      try {
        const juristes = await findJuristesContratMarque();
        const tmId = collab.talent.managerId;
        const destinataires: { email: string | null; prenom: string | null }[] = juristes
          .filter((j) => j.id !== user.id)
          .map((j) => ({ email: j.email, prenom: j.prenom }));
        if (tmId && tmId !== user.id) {
          const tmUser = await prisma.user.findUnique({
            where: { id: tmId },
            select: { email: true, prenom: true },
          });
          if (tmUser) destinataires.push(tmUser);
        }
        const reviewUrl = `${baseUrl}/collaborations/${id}/contrat-marque`;
        const resend = new Resend(resendKey);
        const seenTo = new Set<string>();
        const subjectLine = `[Contrat marque] ${auteur} — ${label}`;
        for (const dest of destinataires) {
          const to = dest.email?.trim();
          if (!to || isContratMarqueExcludedNotificationEmail(to)) continue;
          const k = to.toLowerCase();
          // Déjà notifié via @mention : on n'envoie pas le mail générique en plus.
          if (mentionedEmails.has(k)) continue;
          if (seenTo.has(k)) continue;
          seenTo.add(k);
          const recipientPrenom = dest.prenom?.trim() || "l'équipe";
          const html = await render(
            React.createElement(ContratMarqueNouveauCommentaireEmail, {
              recipientPrenom,
              talentMarqueLabel: label,
              auteurLabel: auteur,
              auteurRole,
              messagePreview,
              reviewUrl,
            })
          );
          await resend.emails.send({
            from: "Glow Up <contrat@glowupagence.fr>",
            to,
            subject: subjectLine,
            html,
          });
        }
      } catch (mailErr) {
        console.error("Erreur envoi email commentaire contrat marque:", mailErr);
      }
    }

    return NextResponse.json(commentaire);
  } catch (error) {
    console.error("POST contrat-marque/commentaire:", error);
    return NextResponse.json({ error: "Erreur lors de l'ajout du commentaire" }, { status: 500 });
  }
}
