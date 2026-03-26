import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

const ADMIN_ROLES = ["ADMIN", "HEAD_OF_INFLUENCE"] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const actorId = session.user.id;
    const actorRole = (session.user.role || "") as string;
    const now = new Date();

    const fichier = await prisma.fichierProspection.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
          },
        },
        contacts: {
          where: {
            prochainDate: { lte: now },
            prochainStatut: { in: ["A_FAIRE", "EN_ATTENTE"] },
            statut: { notIn: ["GAGNE", "PERDU"] },
          },
          orderBy: { prochainDate: "asc" },
          select: {
            id: true,
            nomOpportunite: true,
            prochainDate: true,
            prochainStatut: true,
          },
        },
      },
    });

    if (!fichier) {
      return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
    }

    const canSeeAll = ADMIN_ROLES.includes(actorRole as (typeof ADMIN_ROLES)[number]);
    const isOwner = fichier.userId === actorId;
    if (!canSeeAll && !isOwner) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const dueCount = fichier.contacts.length;
    if (dueCount === 0) {
      return NextResponse.json({ success: true, sent: false, dueCount: 0 });
    }

    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const lien = `/prospection/${fichier.id}`;
    const titre = "Rappel prospection à traiter";

    // Anti-spam: 1 notification/jour/fichier
    const existingNotif = await prisma.notification.findFirst({
      where: {
        userId: fichier.user.id,
        titre,
        lien,
        createdAt: { gte: dayStart },
      },
      select: { id: true },
    });

    if (!existingNotif) {
      await prisma.notification.create({
        data: {
          userId: fichier.user.id,
          type: "GENERAL",
          titre,
          message: `${dueCount} rappel(s) à traiter dans ${fichier.titre}`,
          lien,
          actorId,
        },
      });
    }

    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
    if (resendKey && fromEmail && fichier.user.email && !existingNotif) {
      const resend = new Resend(resendKey);
      const rawBase =
        (process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr")?.trim() || "";
      const baseUrl = rawBase.replace(/\/$/, "");
      const url = `${baseUrl}${lien}`;
      const preview = fichier.contacts
        .slice(0, 8)
        .map((c) => {
          const d = c.prochainDate
            ? new Date(c.prochainDate).toLocaleDateString("fr-FR")
            : "Sans date";
          return `<li><strong>${c.nomOpportunite}</strong> — ${c.prochainStatut || "A_FAIRE"} (${d})</li>`;
        })
        .join("");

      const tmName =
        fichier.user.prenom && fichier.user.nom
          ? `${fichier.user.prenom} ${fichier.user.nom}`.trim()
          : "Talent Manager";

      await resend.emails.send({
        from: fromEmail.includes("<") ? fromEmail : `Glow Up Agence <${fromEmail}>`,
        to: fichier.user.email,
        subject: `⏰ ${dueCount} rappel(s) prospection à traiter`,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#1f2937">
            <h2 style="margin:0 0 12px">Rappels de prospection</h2>
            <p>Bonjour ${tmName},</p>
            <p>Tu as <strong>${dueCount} rappel(s)</strong> à traiter dans <strong>${fichier.titre}</strong>.</p>
            <ul>${preview}</ul>
            <p style="margin-top:16px">
              <a href="${url}" style="display:inline-block;background:#1A1110;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none">
                Ouvrir la prospection
              </a>
            </p>
          </div>
        `,
      });
    }

    return NextResponse.json({ success: true, sent: !existingNotif, dueCount });
  } catch (error) {
    console.error("Erreur POST /api/prospection/[id]/rappels:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi des rappels prospection" },
      { status: 500 }
    );
  }
}

