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

/**
 * Demande de complétion d'une fiche marque existante — notifie tous les ADMIN.
 * Best-effort Resend.
 */
export async function notifyMarqueCompletionRequested(opts: {
  marqueId: string;
  marqueName: string;
  campaignId: string;
  campaignTitle: string;
  talentName: string;
  requestedByName: string;
  contactCount: number;
  note?: string | null;
  toEmails: string[];
}): Promise<{ sent: boolean; to: string[] }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const to = Array.from(
    new Set(
      opts.toEmails
        .map((e) => String(e || "").trim().toLowerCase())
        .filter((e) => e.includes("@"))
    )
  );
  if (!key || to.length === 0) return { sent: false, to };

  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr").replace(
    /\/$/,
    ""
  );
  const ficheUrl = `${baseUrl}/marques/${encodeURIComponent(opts.marqueId)}`;
  const projetUrl = `${baseUrl}/projets-outreach/${encodeURIComponent(opts.campaignId)}`;
  const contactLabel =
    opts.contactCount === 0
      ? "aucun contact emailé"
      : opts.contactCount === 1
        ? "1 seul contact emailé"
        : `${opts.contactCount} contacts emailés`;
  const noteHtml = opts.note?.trim()
    ? `<p style="font-size:14px;line-height:1.5;margin:0 0 16px;padding:10px 12px;background:#F5EBE0;border-radius:10px"><strong>Note :</strong> ${escapeHtml(
        opts.note.trim()
      )}</p>`
    : "";

  const subject = `Compléter la marque — ${opts.marqueName}`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1A1110">
    <h2 style="font-size:18px;margin:0 0 8px">Compléter la fiche marque</h2>
    <p style="font-size:14px;line-height:1.5;margin:0 0 12px">
      <strong>${escapeHtml(opts.requestedByName)}</strong> demande de compléter
      <strong>${escapeHtml(opts.marqueName)}</strong> pour le projet
      « ${escapeHtml(opts.campaignTitle)} » (talent ${escapeHtml(opts.talentName)}).
    </p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px">
      État actuel : <strong>${contactLabel}</strong>.<br/>
      La rédaction est <strong>bloquée</strong> sur ce projet tant que la fiche
      n’est pas complétée. Merci d’ajouter les contacts
      <em>sur la fiche existante</em> (ne pas créer une nouvelle marque), puis
      de cliquer « Contacts prêts » dans le projet.
    </p>
    ${noteHtml}
    <p style="margin:0 0 10px">
      <a href="${ficheUrl}"
         style="display:inline-block;background:#1A1110;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px;font-weight:600">
        Ouvrir la fiche marque
      </a>
    </p>
    <p style="margin:0">
      <a href="${projetUrl}"
         style="display:inline-block;background:#fff;color:#1A1110;text-decoration:none;padding:9px 16px;border-radius:10px;font-size:13px;font-weight:600;border:1px solid #1A1110">
        Voir le projet
      </a>
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
    return { sent: true, to };
  } catch (error) {
    console.error("notifyMarqueCompletionRequested:", error);
    return { sent: false, to };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
