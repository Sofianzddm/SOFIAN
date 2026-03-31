import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { ContratMarqueJuristeEmail } from "@/lib/emails/ContratMarqueJuristeEmail";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!["ADMIN", "HEAD_OF_INFLUENCE"].includes(session.user.role)) {
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    const juristeEmail = process.env.JURISTE_EMAIL?.trim();
    const resendKey = process.env.RESEND_API_KEY?.trim();
    if (!juristeEmail || !resendKey) {
      return NextResponse.json(
        { error: "Configuration manquante (JURISTE_EMAIL / RESEND_API_KEY)" },
        { status: 503 }
      );
    }

    const { id } = await params;
    const collab = await prisma.collaboration.findUnique({
      where: { id },
      include: {
        talent: { select: { prenom: true, nom: true } },
        marque: { select: { nom: true } },
      },
    });
    if (!collab) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }

    const collaborationLabel = `${collab.talent.prenom} ${collab.talent.nom} x ${collab.marque.nom}`;
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr").replace(/\/$/, "");
    const collaborationUrl = `${baseUrl}/juriste/${collab.id}`;
    const html = await render(
      React.createElement(ContratMarqueJuristeEmail, {
        collaborationLabel,
        collaborationUrl,
      })
    );

    const resend = new Resend(resendKey);
    const sendResult = await resend.emails.send({
      from: "Glow Up <contrat@glowupagence.fr>",
      to: juristeEmail,
      subject: `Contrat à relire — ${collab.talent.prenom} ${collab.talent.nom} x ${collab.marque.nom}`,
      html,
    });
    if (sendResult.error) {
      return NextResponse.json({ error: "Erreur d'envoi email juriste" }, { status: 502 });
    }

    await prisma.collaboration.update({
      where: { id: collab.id },
      data: {
        contratMarqueStatut: "EN_ATTENTE_JURISTE",
        contratMarqueEnvoyeJuristeAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST contrat-marque/envoyer-juriste:", error);
    return NextResponse.json({ error: "Erreur lors de l'envoi au juriste" }, { status: 500 });
  }
}
