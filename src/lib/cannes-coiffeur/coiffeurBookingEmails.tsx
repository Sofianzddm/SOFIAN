import { render } from "@react-email/render";
import { Resend } from "resend";

import { CannesCoiffeurBookingCancelledEmail } from "@/emails/CannesCoiffeurBookingCancelledEmail";
import { CannesCoiffeurBookingConfirmationEmail } from "@/emails/CannesCoiffeurBookingConfirmationEmail";
import { CannesCoiffeurStylistOperationalEmail } from "@/emails/CannesCoiffeurStylistOperationalEmail";
import { formatParisTime } from "@/lib/cannes-coiffeur/formatParisTime";
import {
  getStylistFirstName,
  getStylistNotifyEmail,
  getStylistPhoneDisplay,
  getStylistTelHref,
} from "@/lib/cannes-coiffeur/stylist-contact";

function baseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr").trim().replace(/\/$/, "");
  return raw;
}

function publicAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr")
    .trim()
    .replace(/\/$/, "");
}

/** Expéditeur dédié coiffeur Cannes (≠ contrats DocuSeal sur contrat@). */
const COIFFEUR_DEFAULT_FROM_EMAIL = "contact@glowupagence.fr";

function coiffeurFromHeader(): string {
  const raw = process.env.CANNES_COIFFEUR_FROM_EMAIL?.trim() || COIFFEUR_DEFAULT_FROM_EMAIL;
  return raw.includes("<") ? raw : `Glow Up Agence <${raw}>`;
}

function locationText(): string {
  return (
    process.env.CANNES_COIFFEUR_LOCATION?.trim() ||
    "Lieu communiqué séparément par l’équipe Glow Up à Cannes."
  );
}

async function sendStylistOperationalIfConfigured(
  resend: Resend,
  from: string,
  args: {
    kind: "new_booking" | "cancellation";
    cancelSource?: "talent" | "staff";
    guestName: string;
    guestEmail: string;
    prestationTitle: string;
    notes: string | null;
    startsAt: Date;
    endsAt: Date;
  }
): Promise<void> {
  const to = getStylistNotifyEmail();

  const html = await render(
    <CannesCoiffeurStylistOperationalEmail
      kind={args.kind}
      cancelSource={args.cancelSource}
      stylistFirstName={getStylistFirstName()}
      guestName={args.guestName}
      guestEmail={args.guestEmail}
      prestationTitle={args.prestationTitle}
      notes={args.notes}
      startsAt={args.startsAt}
      endsAt={args.endsAt}
      phoneDisplay={getStylistPhoneDisplay()}
      phoneTelHref={getStylistTelHref()}
    />
  );

  const phone = getStylistPhoneDisplay();
  const subjLead =
    args.kind === "new_booking"
      ? "Nouvelle réservation"
      : `Annulation${args.cancelSource === "talent" ? "" : " staff"}`;
  const subject = `[Coiffeur Cannes] ${subjLead} · ${args.guestName} · ${formatParisTime(args.startsAt, "dd/MM HH:mm")}`;
  const whenLong = `${formatParisTime(args.startsAt, "EEEE d MMMM yyyy à HH:mm")} — ${formatParisTime(args.endsAt, "HH:mm")} (Paris)`;
  const txt =
    args.kind === "new_booking"
      ? [
          `Nouvelle réservation Cannes 2026`,
          "",
          `Client : ${args.guestName}`,
          `Email : ${args.guestEmail}`,
          `Prestation : ${args.prestationTitle}`,
          `Créneau : ${whenLong}`,
          args.notes?.trim() ? `Précisions : ${args.notes.trim()}` : "",
          "",
          `Téléphone coiffeur agence (${getStylistFirstName()}) : ${phone}`,
        ]
          .filter((l) => l !== "")
          .join("\n")
      : [
          `Annulation — ${args.cancelSource === "talent" ? "depuis lien talent" : "console staff"}`,
          "",
          `Client : ${args.guestName}`,
          `Email : ${args.guestEmail}`,
          `Prestation : ${args.prestationTitle}`,
          `Créneau était : ${whenLong}`,
          "",
          `Téléphone : ${phone}`,
        ].join("\n");

  await resend.emails.send({ from, to, subject, html, text: txt });
}

function buildPlainText(args: {
  guestName: string;
  guestEmail?: string;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
  prestationTitle?: string | null;
  cancelUrl?: string | null;
  internal?: boolean;
}): string {
  const whenLong = `${formatParisTime(args.startsAt, "EEEE d MMMM yyyy à HH:mm")} — ${formatParisTime(args.endsAt, "HH:mm")} (heure de Paris)`;
  const prest = args.prestationTitle?.trim();
  const lines = [
    args.internal ? "COPIE INTERNE — Réservation coiffeur Cannes 2026" : "Glow Up · Cannes 2026 — Rendez-vous coiffeur",
    "",
    `Bonjour ${args.guestName},`,
    "",
    args.internal
      ? `Nouvelle réservation enregistrée${args.guestEmail ? ` (${args.guestEmail})` : ""}.`
      : "Ta réservation est confirmée. Récap (heure française) :",
    "",
    prest ? `Prestation : ${prest}` : null,
    `Créneau : ${whenLong}`,
    "",
    `Lieu : ${locationText()}`,
    "",
    `Coiffeur à l'agence (${getStylistFirstName()}) — ${getStylistPhoneDisplay()}`,
    "",
    args.notes?.trim() ? `Ta précision : ${args.notes.trim()}` : null,
    "",
    args.internal
      ? "Gérer depuis l’outil Coiffeur (Cannes 2026) dans l’admin."
      : args.cancelUrl
        ? `Gérer / annuler ta réservation : ${args.cancelUrl}`
        : "En cas d’impossibilité ou de changement, contacte vite ton référent Glow Up habituel.",
    "",
    `${baseUrl()}`,
    "Glow Up Agence · Aix-en-Provence",
  ];
  return lines.filter((l): l is string => l != null).join("\n");
}

function buildPlainTextCancellation(args: {
  recipientName: string;
  startsAt: Date;
  endsAt: Date;
  prestationTitle?: string | null;
  cancelledByTalent?: boolean;
}): string {
  const whenLong = `${formatParisTime(args.startsAt, "EEEE d MMMM yyyy à HH:mm")} — ${formatParisTime(args.endsAt, "HH:mm")} (Paris)`;
  const prest = args.prestationTitle?.trim();
  const intro =
    args.cancelledByTalent === true
      ? "Nous te confirmons l’annulation de ta réservation coiffeur pour Cannes 2026. Le créneau est libéré — tu pourras en réserver un autre via le lien public si tu le souhaites."
      : "Ta réservation a été annulée côté équipe Glow Up (agence).";
  const footerNote =
    args.cancelledByTalent === true
      ? "Une question ? Contacte ton référent Glow Up."
      : "En cas de doute ou d’erreur, contacte ton référent Glow Up.";
  const titleLine =
    args.cancelledByTalent === true
      ? "Glow Up · Cannes 2026 — Annulation confirmée"
      : "Glow Up · Cannes 2026 — Rendez-vous coiffeur annulé";
  return [
    titleLine,
    "",
    `Bonjour ${args.recipientName},`,
    "",
    intro,
    "",
    prest ? `Prestation : ${prest}` : null,
    `Créneau concerné : ${whenLong}`,
    "",
    `Lieu (rappel) : ${locationText()}`,
    "",
    `${getStylistFirstName()} (coiffeur) — ${getStylistPhoneDisplay()}`,
    "",
    footerNote,
    "",
    baseUrl(),
  ]
    .filter((l): l is string => l != null)
    .join("\n");
}

/** Notifie l’email de la réservation (sans compte), ou en secours l’email fiche talent pour d’anciennes résas. */
export async function sendCoiffeurBookingCancellationEmail(payload: {
  recipientEmail: string;
  recipientName: string;
  startsAt: Date;
  endsAt: Date;
  prestationTitle: string | null;
  /** true = annulation via lien public (talent) — libellé de confirmation. */
  cancelledByTalent?: boolean;
  /** Détail pour l’email opérationnel vers Sofiane. */
  stylistMeta?: {
    cancelSource: "talent" | "staff";
    guestEmail?: string | null;
    notes?: string | null;
  };
}) {
  const resendKey = process.env.RESEND_API_KEY?.trim();

  if (!resendKey) {
    console.warn("[cannes-coiffeur] Email d’annulation non envoyé — RESEND_API_KEY manquant (.env)");
    return;
  }

  const to = payload.recipientEmail.trim().toLowerCase();
  const recipientNameTrim = payload.recipientName.trim();
  const appUrl = baseUrl();
  const loc = locationText();
  const prestationTitle = payload.prestationTitle?.trim() || "Prestation coiffeur";

  const resend = new Resend(resendKey);
  const from = coiffeurFromHeader();

  const cancelledByTalent = payload.cancelledByTalent === true;

  if (to.includes("@") && recipientNameTrim) {
    const html = await render(
      <CannesCoiffeurBookingCancelledEmail
        recipientName={payload.recipientName}
        startsAt={payload.startsAt}
        endsAt={payload.endsAt}
        prestationTitle={prestationTitle}
        locationLine={loc}
        appUrl={appUrl}
        cancelledByTalent={cancelledByTalent}
      />
    );

    await resend.emails.send({
      from,
      to,
      subject: cancelledByTalent
        ? `Cannes 2026 — Annulation confirmée · ${formatParisTime(payload.startsAt, "dd/MM HH:mm")}`
        : `Cannes 2026 — Créneau coiffeur annulé · ${formatParisTime(payload.startsAt, "dd/MM HH:mm")}`,
      html,
      text: buildPlainTextCancellation({
        recipientName: payload.recipientName,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
        prestationTitle,
        cancelledByTalent,
      }),
    });
  }

  try {
    const guestEmailOps =
      payload.stylistMeta?.guestEmail?.trim().toLowerCase() ||
      (to.includes("@") ? to : "") ||
      "email non communiqué";

    await sendStylistOperationalIfConfigured(resend, from, {
      kind: "cancellation",
      cancelSource: payload.stylistMeta?.cancelSource ?? (cancelledByTalent ? "talent" : "staff"),
      guestName: recipientNameTrim || "Client Cannes coiffeur",
      guestEmail: guestEmailOps,
      prestationTitle,
      notes: payload.stylistMeta?.notes ?? null,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
    });
  } catch (e) {
    console.error("[cannes-coiffeur] Notification Sofiane (annulation)", e);
  }
}

export async function sendCoiffeurBookingConfirmationEmails(payload: {
  guestEmail: string;
  guestName: string;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
  prestationTitle?: string | null;
  publicToken?: string | null;
}) {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const notifyStaff = process.env.CANNES_COIFFEUR_NOTIFY_EMAIL?.trim();

  if (!resendKey) {
    console.warn(
      "[cannes-coiffeur] Email de confirmation non envoyé — définir RESEND_API_KEY (.env). Expéditeur coiffeur : CANNES_COIFFEUR_FROM_EMAIL (défaut contact@glowupagence.fr)."
    );
    return;
  }

  const appUrl = baseUrl();
  const loc = locationText();
  const prestationTitle = payload.prestationTitle?.trim() || "Prestation coiffeur";
  const cancelUrl = payload.publicToken
    ? `${publicAppUrl()}/r/cannes-coiffeur/manage?t=${encodeURIComponent(payload.publicToken)}`
    : null;

  const commonProps = {
    guestName: payload.guestName,
    startsAt: payload.startsAt,
    endsAt: payload.endsAt,
    prestationTitle,
    notes: payload.notes,
    locationLine: loc,
    appUrl,
  };

  const resend = new Resend(resendKey);
  const from = coiffeurFromHeader();

  const guestHtml = await render(
    <CannesCoiffeurBookingConfirmationEmail
      {...commonProps}
      guestEmail={payload.guestEmail}
      variant="talent"
      cancelUrl={cancelUrl}
    />
  );

  await resend.emails.send({
    from,
    to: payload.guestEmail,
    subject: `Cannes 2026 — Rendez-vous coiffeur confirmé · ${formatParisTime(payload.startsAt, "dd/MM HH:mm")}`,
    html: guestHtml,
    text: buildPlainText({
      guestName: payload.guestName,
      guestEmail: payload.guestEmail,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      notes: payload.notes,
      prestationTitle,
      cancelUrl,
      internal: false,
    }),
  });

    if (notifyStaff && notifyStaff.includes("@")) {
    const staffHtml = await render(
      <CannesCoiffeurBookingConfirmationEmail
        {...commonProps}
        guestEmail={payload.guestEmail}
        variant="internal"
      />
    );

    await resend.emails.send({
      from,
      to: notifyStaff,
      subject: `[Interne] Coiffeur Cannes · ${payload.guestName} · ${formatParisTime(payload.startsAt, "dd/MM HH:mm")}`,
      html: staffHtml,
      text: buildPlainText({
        guestName: payload.guestName,
        guestEmail: payload.guestEmail,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
        notes: payload.notes,
        prestationTitle,
        internal: true,
      }),
    });
  }

  try {
    await sendStylistOperationalIfConfigured(resend, from, {
      kind: "new_booking",
      guestName: payload.guestName,
      guestEmail: payload.guestEmail,
      prestationTitle,
      notes: payload.notes,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
    });
  } catch (e) {
    console.error("[cannes-coiffeur] Notification Sofiane (nouvelle résa)", e);
  }
}

export async function sendCoiffeurBookingCancellationEmails(payload: {
  recipientEmail: string;
  recipientName: string;
  startsAt: Date;
  endsAt: Date;
  prestationTitle: string | null;
  cancelledByTalent?: boolean;
  stylistMeta?: {
    cancelSource: "talent" | "staff";
    guestEmail?: string | null;
    notes?: string | null;
  };
}) {
  await sendCoiffeurBookingCancellationEmail(payload);
}
