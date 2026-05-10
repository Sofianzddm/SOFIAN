import { render } from "@react-email/render";
import { Resend } from "resend";

import { CannesCoiffeurBookingCancelledEmail } from "@/emails/CannesCoiffeurBookingCancelledEmail";
import { CannesCoiffeurBookingConfirmationEmail } from "@/emails/CannesCoiffeurBookingConfirmationEmail";
import { formatParisTime } from "@/lib/cannes-coiffeur/formatParisTime";

function baseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr").trim().replace(/\/$/, "");
  return raw;
}

function publicAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr")
    .trim()
    .replace(/\/$/, "");
}

function locationText(): string {
  return (
    process.env.CANNES_COIFFEUR_LOCATION?.trim() ||
    "Lieu communiqué séparément par l’équipe Glow Up à Cannes."
  );
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
}): string {
  const whenLong = `${formatParisTime(args.startsAt, "EEEE d MMMM yyyy à HH:mm")} — ${formatParisTime(args.endsAt, "HH:mm")} (Paris)`;
  const prest = args.prestationTitle?.trim();
  return [
    "Glow Up · Cannes 2026 — Rendez-vous coiffeur annulé",
    "",
    `Bonjour ${args.recipientName},`,
    "",
    "Ta réservation a été annulée côté organisation (salon / équipe Glow Up).",
    "",
    prest ? `Prestation : ${prest}` : null,
    `Créneau concerné : ${whenLong}`,
    "",
    `Lieu (rappel) : ${locationText()}`,
    "",
    "En cas de doute ou d’erreur, contacte ton référent Glow Up.",
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
}) {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();

  if (!resendKey || !fromEmail) {
    console.warn("[cannes-coiffeur] Email d’annulation non envoyé — RESEND non configuré");
    return;
  }

  const to = payload.recipientEmail.trim().toLowerCase();
  if (!to.includes("@")) return;

  const appUrl = baseUrl();
  const loc = locationText();
  const prestationTitle = payload.prestationTitle?.trim() || "Prestation coiffeur";

  const resend = new Resend(resendKey);
  const from = fromEmail.includes("<") ? fromEmail : `Glow Up Agence <${fromEmail}>`;

  const html = await render(
    <CannesCoiffeurBookingCancelledEmail
      recipientName={payload.recipientName}
      startsAt={payload.startsAt}
      endsAt={payload.endsAt}
      prestationTitle={prestationTitle}
      locationLine={loc}
      appUrl={appUrl}
    />
  );

  await resend.emails.send({
    from,
    to,
    subject: `Cannes 2026 — Créneau coiffeur annulé · ${formatParisTime(payload.startsAt, "dd/MM HH:mm")}`,
    html,
    text: buildPlainTextCancellation({
      recipientName: payload.recipientName,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      prestationTitle,
    }),
  });
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
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
  const notifyStaff = process.env.CANNES_COIFFEUR_NOTIFY_EMAIL?.trim();

  if (!resendKey || !fromEmail) {
    console.warn(
      "[cannes-coiffeur] Email de confirmation non envoyé — définir RESEND_API_KEY et RESEND_FROM_EMAIL (.env)."
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
  const from = fromEmail.includes("<") ? fromEmail : `Glow Up Agence <${fromEmail}>`;

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
}

export async function sendCoiffeurBookingCancellationEmails(payload: {
  recipientEmail: string;
  recipientName: string;
  startsAt: Date;
  endsAt: Date;
  prestationTitle: string | null;
}) {
  await sendCoiffeurBookingCancellationEmail(payload);
}
