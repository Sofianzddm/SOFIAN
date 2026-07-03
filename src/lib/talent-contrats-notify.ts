// Notification de l'équipe (ADMIN + HEAD_OF_INFLUENCE) quand un contrat talent
// est envoyé en signature ou relancé : notif in-app + email interne Resend.
// Utilisé côté serveur uniquement (routes API).

import React from "react";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { ContratEnvoyeInterneEmail } from "@/lib/emails/ContratEnvoyeInterneEmail";

export async function notifierEquipeContratTalent(opts: {
  talentId: string;
  talentNom: string;
  contratTitre: string;
  /** Utilisateur à l'origine de l'action (exclu des destinataires) */
  actorId: string;
  isRelance?: boolean;
}) {
  const { talentId, talentNom, contratTitre, actorId, isRelance = false } = opts;

  try {
    const [destinataires, acteur] = await Promise.all([
      prisma.user.findMany({
        where: {
          role: { in: ["ADMIN", "HEAD_OF_INFLUENCE"] },
          actif: true,
          id: { not: actorId }, // pas de notif à soi-même
        },
        select: { id: true, email: true, prenom: true },
      }),
      prisma.user.findUnique({
        where: { id: actorId },
        select: { prenom: true, nom: true },
      }),
    ]);
    if (destinataires.length === 0) return;

    const titre = isRelance
      ? "🔔 Relance signature contrat"
      : "✍️ Contrat envoyé en signature";
    const message = isRelance
      ? `Relance envoyée pour le contrat « ${contratTitre} » de ${talentNom}`
      : `Le contrat « ${contratTitre} » a été envoyé en signature électronique à ${talentNom}`;

    await Promise.all(
      destinataires.map((dest) =>
        prisma.notification.create({
          data: {
            userId: dest.id,
            type: "GENERAL",
            titre,
            message,
            lien: `/talents/${talentId}`,
            talentId,
            actorId,
          },
        })
      )
    );

    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
    if (!resendKey || !fromEmail) {
      console.warn("Contrat talent: Resend non configuré, emails internes non envoyés");
      return;
    }

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.glowupagence.fr").replace(/\/$/, "");
    const envoyeParNom =
      [acteur?.prenom, acteur?.nom].filter(Boolean).join(" ") || "Un membre de l'équipe";
    const subject = isRelance
      ? `🔔 Relance signature — ${contratTitre} (${talentNom})`
      : `✍️ Contrat envoyé en signature — ${contratTitre} (${talentNom})`;

    const resend = new Resend(resendKey);
    const seen = new Set<string>();
    for (const dest of destinataires) {
      const destEmail = dest.email?.trim().toLowerCase();
      if (!destEmail || seen.has(destEmail)) continue;
      seen.add(destEmail);
      const html = await render(
        React.createElement(ContratEnvoyeInterneEmail, {
          destinatairePrenom: dest.prenom || "l'équipe",
          contratTitre,
          talentNom,
          envoyeParNom,
          ficheTalentUrl: `${baseUrl}/talents/${talentId}`,
          isRelance,
        })
      );
      const sendResult = await resend.emails.send({
        from: `Glow Up Agence <${fromEmail}>`,
        to: dest.email,
        subject,
        html,
      });
      if (sendResult.error) {
        console.error("Contrat talent: erreur Resend email interne:", dest.email, sendResult.error);
      }
    }
  } catch (err) {
    console.error("Contrat talent: erreur notifications/emails internes:", err);
  }
}
