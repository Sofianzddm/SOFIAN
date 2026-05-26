import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { sendGmail, getGmailSignature, clearGmailSignatureCache } from "@/lib/gmail";

const LEYNA_EMAIL = "leyna@glowupagence.fr";

export async function POST(req: NextRequest) {
  try {
    const session = await getAppSession(req);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé à l'admin" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { to?: string };
    const explicitTo = typeof body.to === "string" ? body.to.trim() : "";
    const to = explicitTo || session.user.email || "";
    if (!to) {
      return NextResponse.json(
        { error: "Aucune adresse destinataire trouvée." },
        { status: 400 }
      );
    }

    clearGmailSignatureCache(LEYNA_EMAIL);
    const signature = await getGmailSignature(LEYNA_EMAIL);

    try {
      await sendGmail({
        fromEmail: LEYNA_EMAIL,
        to,
        subject: "[Test signature] Mail envoyé depuis la plateforme Glow Up",
        htmlBody: `
          <p>Bonjour,</p>
          <p>Ceci est un mail de test envoyé depuis la plateforme pour vérifier que la signature Gmail de Leyna s'ajoute automatiquement aux mails sortants.</p>
          <p>Si tu vois la signature de Leyna en dessous, c'est que tout fonctionne 🎉</p>
        `,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Gmail non connecté") {
        return NextResponse.json(
          { error: "Gmail Leyna n'est pas connecté." },
          { status: 400 }
        );
      }
      throw error;
    }

    return NextResponse.json({
      ok: true,
      to,
      signatureFound: Boolean(signature.trim()),
      signatureLength: signature.length,
    });
  } catch (error) {
    console.error("POST /api/auth/gmail/test error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
