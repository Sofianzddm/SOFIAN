import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";

const ALLOWED_ROLES = ["CASTING_MANAGER", "ADMIN"] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type DemandeRow = {
  id: string;
  from: string;
  subject: string;
  body: string;
  status: string;
  emailPret: string | null;
  sujetPret: string | null;
};

type PatchBody = {
  status?: unknown;
  emailPret?: unknown;
  sujetPret?: unknown;
};

export async function PATCH(
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
    const payload = (await request.json().catch(() => null)) as PatchBody | null;

    const currentRows = (await prisma.$queryRaw`
      SELECT "id", "from", "subject", "body", "status", "emailPret", "sujetPret"
      FROM "DemandeEntrante"
      WHERE "id" = ${id}
      LIMIT 1
    `) as DemandeRow[];

    const current = currentRows[0];
    if (!current) {
      return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
    }

    const nextStatus =
      typeof payload?.status === "string" && payload.status.trim()
        ? payload.status.trim()
        : current.status;
    const nextEmailPret =
      typeof payload?.emailPret === "string" ? payload.emailPret : (current.emailPret ?? "");
    const nextSujetPret =
      typeof payload?.sujetPret === "string" ? payload.sujetPret : (current.sujetPret ?? "");

    await prisma.$executeRaw`
      UPDATE "DemandeEntrante"
      SET
        "status" = ${nextStatus},
        "emailPret" = ${nextEmailPret},
        "sujetPret" = ${nextSujetPret},
        "updatedAt" = NOW()
      WHERE "id" = ${id}
    `;

    if (nextStatus === "pret") {
      const resendKey = process.env.RESEND_API_KEY?.trim();
      const toEmail = (process.env.LEYNA_EMAIL || "leyna@glowupagence.fr").trim();
      if (!resendKey) {
        return NextResponse.json(
          { error: "RESEND_API_KEY non configurée." },
          { status: 500 }
        );
      }

      const resend = new Resend(resendKey);
      const htmlBody = `
        <h2>Brief reçu</h2>
        <p><strong>De :</strong> ${escapeHtml(current.from)}</p>
        <p><strong>Objet original :</strong> ${escapeHtml(current.subject)}</p>
        <p><strong>Message :</strong></p>
        <div>${current.body}</div>
        <hr/>
        <h2>Email prêt à envoyer</h2>
        <p><strong>Objet :</strong> ${escapeHtml(nextSujetPret)}</p>
        <div>${nextEmailPret}</div>
      `;

      const sendResult = await resend.emails.send({
        from: "casting@glowupagence.fr",
        to: toEmail,
        subject: `[Casting prêt] ${nextSujetPret}`,
        html: htmlBody,
      });

      if (sendResult.error) {
        return NextResponse.json(
          { error: "Erreur envoi email Leyna." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("PATCH /api/demandes-entrantes/[id]:", e);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de la demande." },
      { status: 500 }
    );
  }
}

