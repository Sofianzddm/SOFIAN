import { Resend } from "resend";

function baseUrl() {
  return (process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr").replace(/\/$/, "");
}

export function confirmationPublicUrl(token: string) {
  return `${baseUrl()}/confirmation/${token}`;
}

/**
 * Envoie (ou relance) au talent le lien de confirmation d'une offre.
 * Best-effort : n'échoue jamais l'action appelante, renvoie true si envoyé.
 */
export async function sendTalentConfirmationEmail(opts: {
  to: string;
  prenom: string;
  marque: string;
  token: string;
  isReminder?: boolean;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || !opts.to?.trim()) return false;

  const url = confirmationPublicUrl(opts.token);
  const subject = opts.isReminder
    ? `Rappel — ta réponse pour « ${opts.marque} »`
    : `Une proposition à confirmer — ${opts.marque}`;

  const intro = opts.isReminder
    ? `Petit rappel : on attend toujours ta réponse pour la collaboration <strong>${opts.marque}</strong>. Ça prend 30 secondes.`
    : `Voici une proposition pour la collaboration <strong>${opts.marque}</strong>. Prends 30 secondes pour vérifier les conditions et répondre.`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1A1110">
    <h2 style="font-size:18px;margin:0 0 8px">Salut ${opts.prenom} 👋</h2>
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px">${intro}</p>
    <a href="${url}"
       style="display:inline-block;background:#1A1110;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:600">
      Voir l'offre & répondre
    </a>
    <p style="font-size:12px;color:#8A8079;margin:20px 0 0">
      Tant que tu n'as pas cliqué « Je confirme », rien n'est transmis à la marque.
    </p>
  </div>`;

  try {
    const resend = new Resend(key);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL?.trim() || "Glow Up <contact@glowupagence.fr>",
      to: opts.to.trim(),
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error("sendTalentConfirmationEmail:", error);
    return false;
  }
}
