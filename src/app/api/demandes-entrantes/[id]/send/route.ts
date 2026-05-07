import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";
import { sendGmail } from "@/lib/gmail";

const ALLOWED_ROLES = ["CASTING_MANAGER", "ADMIN"] as const;

type DemandeRow = {
  id: string;
  from: string;
  sujetPret: string | null;
  emailPret: string | null;
};

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

function extractEmail(fromValue: string): string {
  const trimmed = fromValue.trim();
  const bracketMatch = trimmed.match(/<([^>]+)>/);
  if (bracketMatch?.[1]) return bracketMatch[1].trim();
  return trimmed;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAllowed(session.user.role)) {
      return NextResponse.json(
        { error: "Accès réservé au Casting Manager et Admin." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const rows = (await prisma.$queryRaw`
      SELECT "id", "from", "sujetPret", "emailPret"
      FROM "DemandeEntrante"
      WHERE "id" = ${id}
      LIMIT 1
    `) as DemandeRow[];
    const demande = rows[0];

    if (!demande) {
      return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
    }
    if (!demande.sujetPret || !demande.emailPret) {
      return NextResponse.json({ error: "Sujet et email requis." }, { status: 400 });
    }

    const destinationEmail = extractEmail(demande.from);
    if (!destinationEmail || !destinationEmail.includes("@")) {
      return NextResponse.json({ error: "Email destinataire invalide." }, { status: 400 });
    }

    let messageId: string;
    try {
      messageId = await sendGmail({
        fromEmail: "leyna@glowupagence.fr",
        to: destinationEmail,
        subject: demande.sujetPret,
        htmlBody: demande.emailPret,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Gmail non connecté") {
        return NextResponse.json({ error: "gmail_not_connected" }, { status: 400 });
      }
      throw error;
    }

    await prisma.$executeRaw`
      UPDATE "DemandeEntrante"
      SET
        "status" = 'envoye',
        "gmailSentMessageId" = ${messageId},
        "sentAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "id" = ${id}
    `;

    return NextResponse.json({ success: true, messageId });
  } catch (e) {
    console.error("POST /api/demandes-entrantes/[id]/send:", e);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi Gmail." },
      { status: 500 }
    );
  }
}
