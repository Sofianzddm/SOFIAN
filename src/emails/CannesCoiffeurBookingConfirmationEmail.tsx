import React, { type CSSProperties } from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import { formatParisTime } from "@/lib/cannes-coiffeur/formatParisTime";
import {
  getStylistFirstName,
  getStylistPhoneDisplay,
  getStylistTelHref,
} from "@/lib/cannes-coiffeur/stylist-contact";

const LOGO_URL = "https://app.glowupagence.fr/Logo.png";

/** Palette alignée sur la page publique /r/cannes-coiffeur (tailwind glowup.*) */
const C = {
  licorice: "#220101",
  licoriceMid: "#3D1515",
  rose: "#B06F70",
  roseMuted: "#9A5F60",
  roseLight: "#C48B8C",
  lace: "#F5EDE0",
  laceSoft: "#E8DED0",
  panel: "#2A1718",
  panelBorder: "#B06F7044",
  successTint: "rgba(176, 111, 112, 0.18)",
} as const;

export type CannesCoiffeurBookingEmailVariant = "talent" | "internal";

export interface CannesCoiffeurBookingConfirmationEmailProps {
  guestName: string;
  guestEmail?: string;
  startsAt: Date;
  endsAt: Date;
  prestationTitle: string;
  notes: string | null;
  locationLine: string;
  appUrl: string;
  cancelUrl?: string | null;
  variant?: CannesCoiffeurBookingEmailVariant;
}

export function CannesCoiffeurBookingConfirmationEmail({
  guestName,
  guestEmail,
  startsAt,
  endsAt,
  prestationTitle,
  notes,
  locationLine,
  appUrl,
  cancelUrl,
  variant = "talent",
}: CannesCoiffeurBookingConfirmationEmailProps) {
  const dateLine = formatParisTime(startsAt, "EEEE d MMMM yyyy");
  const startHm = formatParisTime(startsAt, "HH:mm");
  const endHm = formatParisTime(endsAt, "HH:mm");
  const internal = variant === "internal";

  const preview = internal
    ? `Nouvelle réservation coiffeur · ${guestName}`
    : `Ton créneau coiffeur Cannes est confirmé — ${startHm}`;

  return (
    <Html lang="fr">
      <Head>
        <meta name="color-scheme" content="dark light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          {internal && (
            <Section style={internalBanner}>
              <Text style={internalBannerText}>
                📋 Copie interne — réservation lien public (sans compte)
              </Text>
              {guestEmail ? (
                <Text style={internalBannerSub}>{guestEmail}</Text>
              ) : null}
            </Section>
          )}

          <Section style={header}>
            <Img src={LOGO_URL} alt="Glow Up" width={168} style={logoInv} />
            <Text style={eyebrow}>CANNES 2026</Text>
            <Text style={headline}>{internal ? "Nouvelle réservation" : "Rendez-vous confirmé"}</Text>
          </Section>

          <Section style={card}>
            <Text style={greeting}>Bonjour {guestName.split(/\s+/)[0] || guestName},</Text>
            <Text style={p}>
              {internal
                ? "Une réservation vient d’être enregistrée avec les informations ci-dessous."
                : "Ta réservation est bien enregistrée. On a hâte de t’accueillir ! Voici ton récap :"}
            </Text>

            <Section style={highlightBox}>
              <Text style={highlightLabel}>Prestation</Text>
              <Text style={highlightTitle}>{prestationTitle}</Text>
              <Hr style={hrRose} />
              <Text style={highlightLabel}>Créneau</Text>
              <Text style={highlightWhen}>
                {dateLine}
                <br />
                <span style={timeAccent}>
                  {startHm} → {endHm}
                </span>
              </Text>
            </Section>

            <Section style={locationBox}>
              <Text style={locationLabel}>Lieu</Text>
              <Text style={locationText}>{locationLine}</Text>
            </Section>

            {notes?.trim() ? (
              <Section style={notesBox}>
                <Text style={notesLabel}>Ta précision</Text>
                <Text style={notesBody}>{notes.trim()}</Text>
              </Section>
            ) : null}

            {!internal && cancelUrl ? (
              <Section style={manageBox}>
                <Text style={manageText}>
                  Un imprévu ? Tu peux annuler (gratuitement) via ce lien jusqu’à{" "}
                  <strong style={{ fontWeight: 700 }}>1 heure avant</strong> ton rendez-vous. Au-delà, appelle{" "}
                  {getStylistFirstName()} directement au numéro indiqué plus bas.
                </Text>
                <Link href={cancelUrl} style={manageButton}>
                  Gérer ma réservation
                </Link>
              </Section>
            ) : null}

            {!internal ? (
              <Section style={contactBox}>
                <Text style={contactLabel}>Ton coiffeur à l&apos;agence ({getStylistFirstName()})</Text>
                <Link href={getStylistTelHref()} style={contactTel}>
                  {getStylistPhoneDisplay()}
                </Link>
              </Section>
            ) : null}

            <Text style={pMuted}>
              {internal
                ? "Pour toute modification, contacte le talent ou ajuste le planning depuis l’outil coiffeur Cannes 2026."
                : "En cas d’empêchement ou de changement, tu peux aussi écrire à ton contact Glow Up habituel."}
            </Text>

            <Hr style={hrSoft} />

            <Text style={footer}>
              <Link href={appUrl} style={footerLink}>
                Glow Up Agence
              </Link>
              {" · "}1330 avenue Jean-René Guillibert Gautier de La Lauzière, Aix-en-Provence
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: CSSProperties = {
  margin: 0,
  padding: "32px 12px",
  background: `linear-gradient(180deg, ${C.licorice} 0%, ${C.licoriceMid} 42%, rgba(176, 111, 112, 0.18) 100%)`,
  backgroundColor: C.licorice,
};

const container: CSSProperties = {
  maxWidth: "520px",
  margin: "0 auto",
};

const internalBanner: CSSProperties = {
  backgroundColor: "#3d2f1f",
  border: "1px solid rgba(229, 194, 120, 0.45)",
  borderRadius: "12px",
  padding: "14px 18px",
  marginBottom: "14px",
};

const internalBannerText: CSSProperties = {
  margin: 0,
  fontSize: "13px",
  fontWeight: 600,
  color: "#f5e6c8",
};

const internalBannerSub: CSSProperties = {
  margin: "6px 0 0",
  fontSize: "12px",
  color: "#d4c4a8",
};

const header: CSSProperties = {
  textAlign: "center",
  padding: "28px 22px 20px",
  backgroundColor: C.licorice,
  borderRadius: "16px 16px 0 0",
  border: `1px solid ${C.panelBorder}`,
  borderBottom: "none",
};

const logoInv: CSSProperties = {
  margin: "0 auto 14px",
  display: "block",
  filter: "brightness(0) invert(1)",
};

const eyebrow: CSSProperties = {
  margin: "0 0 10px",
  fontSize: "11px",
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: C.roseLight,
  opacity: 0.95,
};

const headline: CSSProperties = {
  margin: 0,
  fontSize: "26px",
  lineHeight: 1.2,
  fontFamily: 'Georgia, "Times New Roman", serif',
  color: C.lace,
  fontWeight: 600,
};

const card: CSSProperties = {
  backgroundColor: C.panel,
  border: `1px solid ${C.panelBorder}`,
  borderTop: `1px solid ${C.roseMuted}33`,
  borderRadius: "0 0 16px 16px",
  padding: "26px 24px 22px",
};

const greeting: CSSProperties = {
  margin: "0 0 8px",
  fontSize: "17px",
  color: C.lace,
  fontFamily: 'Georgia, "Times New Roman", serif',
};

const p: CSSProperties = {
  margin: "0 0 18px",
  fontSize: "15px",
  lineHeight: 1.55,
  color: C.laceSoft,
};

const highlightBox: CSSProperties = {
  backgroundColor: C.successTint,
  borderLeft: `4px solid ${C.rose}`,
  borderRadius: "12px",
  padding: "18px 16px",
  margin: "0 0 14px",
};

const highlightLabel: CSSProperties = {
  margin: "0 0 4px",
  fontSize: "11px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: C.roseLight,
};

const highlightTitle: CSSProperties = {
  margin: 0,
  fontSize: "18px",
  fontWeight: 600,
  color: C.lace,
};

const highlightWhen: CSSProperties = {
  margin: 0,
  fontSize: "15px",
  lineHeight: 1.55,
  color: C.laceSoft,
};

const timeAccent: CSSProperties = {
  fontSize: "22px",
  fontWeight: 600,
  color: C.lace,
  letterSpacing: "0.02em",
};

const hrRose: CSSProperties = {
  borderColor: `${C.rose}44`,
  borderStyle: "solid",
  borderWidth: "0 0 1px",
  margin: "14px 0",
};

const locationBox: CSSProperties = {
  margin: "0 0 14px",
  padding: "14px",
  backgroundColor: "rgba(245, 237, 224, 0.06)",
  borderRadius: "10px",
  border: `1px solid ${C.panelBorder}`,
};

const locationLabel: CSSProperties = {
  margin: "0 0 6px",
  fontSize: "11px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: C.roseLight,
};

const locationText: CSSProperties = {
  margin: 0,
  fontSize: "14px",
  lineHeight: 1.5,
  color: C.lace,
};

const notesBox: CSSProperties = {
  margin: "0 0 16px",
  padding: "12px 14px",
  borderRadius: "10px",
  border: `1px dashed ${C.roseMuted}77`,
};

const notesLabel: CSSProperties = {
  margin: "0 0 4px",
  fontSize: "11px",
  color: C.roseLight,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const notesBody: CSSProperties = {
  margin: 0,
  fontSize: "14px",
  color: C.laceSoft,
  whiteSpace: "pre-wrap",
};

const manageBox: CSSProperties = {
  marginTop: "14px",
  padding: "20px",
  backgroundColor: "#f8f5f0",
  borderRadius: "8px",
};

const manageText: CSSProperties = {
  margin: "0 0 12px",
  fontSize: "13px",
  color: "#555555",
};

const manageButton: CSSProperties = {
  display: "inline-block",
  padding: "10px 20px",
  backgroundColor: "#1a0a0a",
  color: "#f5ede0",
  textDecoration: "none",
  borderRadius: "6px",
  fontSize: "13px",
  letterSpacing: "0.05em",
};

const contactBox: CSSProperties = {
  marginTop: "12px",
  marginBottom: "12px",
  padding: "16px",
  borderRadius: "10px",
  border: `1px solid ${C.panelBorder}`,
  backgroundColor: "rgba(232, 208, 143, 0.08)",
  textAlign: "center",
};

const contactLabel: CSSProperties = {
  margin: "0 0 8px",
  fontSize: "11px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: C.roseLight,
};

const contactTel: CSSProperties = {
  display: "inline-block",
  marginTop: "4px",
  fontSize: "20px",
  fontWeight: 600,
  color: C.lace,
  letterSpacing: "0.04em",
  textDecoration: "none",
};

const pMuted: CSSProperties = {
  margin: "4px 0 0",
  fontSize: "13px",
  lineHeight: 1.55,
  color: C.laceSoft,
  opacity: 0.88,
};

const hrSoft: CSSProperties = {
  borderColor: `${C.panelBorder}`,
  margin: "20px 0 14px",
};

const footer: CSSProperties = {
  margin: 0,
  fontSize: "11px",
  lineHeight: 1.55,
  color: C.roseMuted,
  opacity: 0.85,
  textAlign: "center",
};

const footerLink: CSSProperties = {
  color: C.roseLight,
  textDecoration: "underline",
};
