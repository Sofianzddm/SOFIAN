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

function cleanEmailBody(body: string): string {
  let content = body;

  const forwardMarkers = [
    "---------- Forwarded message ---------",
    "---------- Forwarded message ----------",
    "-------- Message transféré --------",
    "-----Original Message-----",
  ];

  for (const marker of forwardMarkers) {
    if (content.includes(marker)) {
      content = content.split(marker)[1] || content;
      break;
    }
  }

  content = content.replace(/^(De|From|To|À|Cc|Date|Subject|Objet)\s*:.*/gm, "");

  const signatureMarkers = [
    "\nCordialement",
    "\nBien à vous",
    "\nBest regards",
    "\nMerci par avance pour ton retour\nTrès belle journée",
  ];

  for (const marker of signatureMarkers) {
    if (content.includes(marker)) {
      content = content.split(marker)[0] || content;
      break;
    }
  }

  return content
    .replace(/\[image:[^\]]*\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type DemandeRow = {
  id: string;
  from: string;
  subject: string;
  body: string;
  date: Date;
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
      SELECT "id", "from", "subject", "body", "date", "status", "emailPret", "sujetPret"
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
      const demande = {
        ...current,
        sujetPret: nextSujetPret,
        emailPret: nextEmailPret,
      };
      const cleanBrief = cleanEmailBody(demande.body).replace(/\n/g, "<br />");

      const htmlEmail = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#F5EBE0;font-family:'Helvetica Neue',Arial,sans-serif;">
  
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EBE0;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          
          <!-- HEADER -->
          <tr>
            <td style="background:#1A1110;padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
              <h1 style="margin:0;color:#F5EBE0;font-size:28px;letter-spacing:4px;font-weight:300;">
                GLOW UP
              </h1>
              <p style="margin:8px 0 0;color:#C08B8B;font-size:12px;letter-spacing:2px;text-transform:uppercase;">
                Casting Manager
              </p>
            </td>
          </tr>

          <!-- BADGE -->
          <tr>
            <td style="background:#C8F285;padding:12px 40px;text-align:center;">
              <p style="margin:0;color:#1A1110;font-size:13px;font-weight:600;letter-spacing:1px;">
                ✨ Un email de casting est prêt à envoyer
              </p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#ffffff;padding:40px;">
              
              <!-- BRIEF SECTION -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-bottom:24px;border-bottom:1px solid #F5EBE0;">
                    <p style="margin:0 0 16px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#C08B8B;">
                      Brief reçu
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:4px 0;">
                          <span style="font-size:12px;color:#888;width:80px;display:inline-block;">De</span>
                          <span style="font-size:13px;color:#1A1110;font-weight:500;">${demande.from}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;">
                          <span style="font-size:12px;color:#888;width:80px;display:inline-block;">Objet</span>
                          <span style="font-size:13px;color:#1A1110;">${demande.subject}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;">
                          <span style="font-size:12px;color:#888;width:80px;display:inline-block;">Reçu le</span>
                          <span style="font-size:13px;color:#1A1110;">${new Date(demande.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        </td>
                      </tr>
                    </table>
                    <div style="margin-top:16px;padding:16px;background:#F5EBE0;border-radius:8px;font-size:13px;line-height:1.7;color:#1A1110;">
                      ${cleanBrief}
                    </div>
                  </td>
                </tr>

                <!-- EMAIL PRÊT -->
                <tr>
                  <td style="padding-top:24px;">
                    <p style="margin:0 0 16px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#C08B8B;">
                      Email prêt à envoyer
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="border:2px solid #C8F285;border-radius:8px;overflow:hidden;">
                      <tr>
                        <td style="background:#C8F285;padding:10px 16px;">
                          <p style="margin:0;font-size:12px;font-weight:700;color:#1A1110;">
                            Objet : ${demande.sujetPret}
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:20px;font-size:13px;line-height:1.8;color:#1A1110;">
                          ${demande.emailPret}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#1A1110;padding:20px 40px;border-radius:0 0 12px 12px;text-align:center;">
              <p style="margin:0;color:#C08B8B;font-size:11px;letter-spacing:1px;">
                Glow Up Agence · Casting Outreach · ${new Date().getFullYear()}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
`;

      const sendResult = await resend.emails.send({
        from: "casting@glowupagence.fr",
        to: toEmail,
        subject: `[Casting prêt] ${nextSujetPret}`,
        html: htmlEmail,
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

