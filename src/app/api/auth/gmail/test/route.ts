import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";
import {
  sendGmail,
  getGmailSignature,
  clearGmailSignatureCache,
  getGmailFromName,
} from "@/lib/gmail";

const DEFAULT_FROM_EMAIL = "leyna@glowupagence.fr";

export async function POST(req: NextRequest) {
  try {
    const session = await getAppSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé à l'admin" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      to?: string;
      fromEmail?: string;
    };
    const explicitTo = typeof body.to === "string" ? body.to.trim() : "";
    const to = explicitTo || session.user.email || "";
    if (!to) {
      return NextResponse.json(
        { error: "Aucune adresse destinataire trouvée." },
        { status: 400 }
      );
    }

    const fromEmail =
      (typeof body.fromEmail === "string" ? body.fromEmail.trim().toLowerCase() : "") ||
      DEFAULT_FROM_EMAIL;

    const token = await prisma.gmailToken.findUnique({
      where: { email: fromEmail },
      select: { id: true },
    });
    if (!token) {
      return NextResponse.json(
        { error: `La boîte ${fromEmail} n'est pas connectée.` },
        { status: 400 }
      );
    }

    clearGmailSignatureCache(fromEmail);
    const signature = await getGmailSignature(fromEmail);
    const fromName = await getGmailFromName(fromEmail);

    try {
      await sendGmail({
        fromEmail,
        to,
        subject: "[Test signature] Mail envoyé depuis la plateforme Glow Up",
        htmlBody: `
          <p>Bonjour,</p>
          <p>Ceci est un mail de test envoyé depuis la plateforme pour vérifier que la signature Gmail de ${fromName} (${fromEmail}) s'ajoute automatiquement aux mails sortants.</p>
          <p>Si tu vois la signature en dessous, c'est que tout fonctionne 🎉</p>
        `,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Gmail non connecté") {
        return NextResponse.json(
          { error: `La boîte ${fromEmail} n'est pas connectée.` },
          { status: 400 }
        );
      }
      throw error;
    }

    return NextResponse.json({
      ok: true,
      to,
      fromEmail,
      signatureFound: Boolean(signature.trim()),
      signatureLength: signature.length,
    });
  } catch (error) {
    console.error("POST /api/auth/gmail/test error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
