import { Resend } from "resend";

/**
 * Prévient l'assistante (Maud) qu'une nouvelle carto est disponible dans la
 * file d'enrichissement (/enrichissement) : nouveaux contacts sans email à
 * compléter. Best-effort : n'échoue jamais l'action appelante.
 */
export async function notifyEnrichissementReady(opts: {
  company: string;
  market: "FR" | "BENELUX";
  count: number;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || opts.count <= 0) return;

  const to = process.env.ENRICHISSEMENT_NOTIFY_EMAIL?.trim() || "maud@glowupagence.fr";
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr").replace(
    /\/$/,
    ""
  );
  const url = `${baseUrl}/enrichissement`;
  const marketLabel = opts.market === "BENELUX" ? "BENELUX 🇧🇪" : "France 🇫🇷";
  const contactLabel = `${opts.count} contact${opts.count > 1 ? "s" : ""}`;
  const subject = `Nouvelle carto à enrichir — ${opts.company} (${marketLabel})`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1A1110">
    <h2 style="font-size:18px;margin:0 0 8px">Nouvelle carto à enrichir</h2>
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px">
      <strong>${opts.company}</strong> · ${marketLabel}<br/>
      ${contactLabel} sans email à compléter.
    </p>
    <a href="${url}"
       style="display:inline-block;background:#1A1110;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px;font-weight:600">
      Ouvrir l'enrichissement
    </a>
    <p style="font-size:12px;color:#8A8079;margin:20px 0 0">
      Ouvre la fiche, note l'email de chaque contact (des suggestions s'affichent
      d'après les mails déjà saisis), puis clique « Prêt ».
    </p>
  </div>`;

  try {
    const resend = new Resend(key);
    await resend.emails.send({
      from: "Glow Up <contact@glowupagence.fr>",
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error("notifyEnrichissementReady:", error);
  }
}
