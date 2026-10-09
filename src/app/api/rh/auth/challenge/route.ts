import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import {
  isRhHr,
  requireRhSessionFromRequest,
} from "@/lib/rh/auth";
import {
  createLoginChallenge,
  hasRhSecureSession,
} from "@/lib/rh/secure-session";

function otpMailHtml(prenom: string, code: string) {
  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;background:#F5EBE0;font-family:Inter,-apple-system,sans-serif;color:#1A1110">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
  <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden">
    <tr><td style="background:linear-gradient(180deg,#1A1110,#3D1515);padding:28px;text-align:center">
      <img src="https://app.glowupagence.fr/Logo.png" width="150" alt="Glow Up" style="display:inline-block"/>
      <p style="margin:12px 0 0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#C08B8B;font-weight:600">Connexion sécurisée RH</p>
    </td></tr>
    <tr><td style="padding:28px">
      <p style="margin:0 0 12px">Bonjour ${prenom},</p>
      <p style="margin:0 0 16px;line-height:1.5">Voici ton code pour accéder à la console RH. Il expire dans <strong>10 minutes</strong>.</p>
      <p style="margin:0;text-align:center;font-size:32px;letter-spacing:.35em;font-weight:700;background:#F5EDE0;padding:18px;border-radius:12px">${code}</p>
      <p style="margin:18px 0 0;font-size:12px;color:#8A7A74">Si tu n’as pas demandé ce code, ignore cet e-mail.</p>
    </td></tr>
  </table>
  </td></tr></table></body></html>`;
}

/** Envoie un OTP email pour admin RH uniquement. */
export async function POST(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!isRhHr(session.employee.rhRole)) {
    return NextResponse.json({ error: "Non requis pour ton rôle" }, { status: 400 });
  }

  if (await hasRhSecureSession(session.app.user.id, request)) {
    return NextResponse.json({ ok: true, alreadySecure: true });
  }

  const { challengeId, code, expiresAt } = await createLoginChallenge(
    session.app.user.id
  );

  const key = process.env.RESEND_API_KEY?.trim();
  if (key) {
    const resend = new Resend(key);
    await resend.emails.send({
      from: "Glow Up RH <contact@glowupagence.fr>",
      to: session.employee.email,
      subject: `Code RH · ${code}`,
      html: otpMailHtml(session.employee.prenom || "bonjour", code),
    });
  } else if (process.env.NODE_ENV !== "production") {
    console.info("[rh.mfa] DEV code", code, "→", session.employee.email);
  }

  return NextResponse.json({
    ok: true,
    challengeId,
    expiresAt: expiresAt.toISOString(),
    emailHint: session.employee.email.replace(
      /(.{2}).*(@.*)/,
      "$1•••$2"
    ),
    // Uniquement hors prod / sans Resend pour faciliter le test local
    ...(process.env.NODE_ENV !== "production" && !key ? { devCode: code } : {}),
  });
}
