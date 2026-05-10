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

const LOGO_URL = "https://app.glowupagence.fr/Logo.png";

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
  cancelTint: "rgba(200, 90, 100, 0.22)",
} as const;

export interface CannesCoiffeurBookingCancelledEmailProps {
  recipientName: string;
  startsAt: Date;
  endsAt: Date;
  prestationTitle: string;
  locationLine: string;
  appUrl: string;
}

export function CannesCoiffeurBookingCancelledEmail({
  recipientName,
  startsAt,
  endsAt,
  prestationTitle,
  locationLine,
  appUrl,
}: CannesCoiffeurBookingCancelledEmailProps) {
  const dateLine = formatParisTime(startsAt, "EEEE d MMMM yyyy");
  const startHm = formatParisTime(startsAt, "HH:mm");
  const endHm = formatParisTime(endsAt, "HH:mm");
  const first = recipientName.split(/\s+/)[0] || recipientName;

  const preview = `Créneau coiffeur annulé (${startHm}) · Cannes 2026`;

  return (
    <Html lang="fr">
      <Head>
        <meta name="color-scheme" content="dark light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={badge}>
            <Text style={badgeText}>ANNULÉ PAR L’ORGANISATION</Text>
          </Section>

          <Section style={header}>
            <Img src={LOGO_URL} alt="Glow Up" width={168} style={logoInv} />
            <Text style={eyebrow}>CANNES 2026</Text>
            <Text style={headline}>Ton créneau coiffeur n’a plus lieu</Text>
            <Text style={subhead}>Décision équipe salon / Glow Up · Heure de Paris 🇫🇷</Text>
          </Section>

          <Section style={card}>
            <Text style={greeting}>Bonjour {first},</Text>
            <Text style={p}>
              Pour information, ta réservation coiffeur a été annulée côté organisation (salon Glow Up Cannes). Le
              créneau suivant est donc libéré — tu peux en choisir un autre depuis le lien communiqué par ton équipe si
              c’est encore proposé.
            </Text>

            <Section style={cancelBox}>
              <Text style={cancelLabel}>Créneau concerné</Text>
              <Text style={highlightTitle}>{prestationTitle}</Text>
              <Hr style={hrRose} />
              <Text style={highlightWhen}>
                {dateLine}
                <br />
                <span style={timeMuted}>
                  prévu → {startHm} – {endHm}
                </span>
              </Text>
            </Section>

            <Section style={locationBox}>
              <Text style={locationLabel}>Rappel du lieu prévu</Text>
              <Text style={locationText}>{locationLine}</Text>
            </Section>

            <Text style={pMuted}>
              Si tu pensais avoir encore ce rendez-vous ou que l’annulation est une erreur, contacte vite ton référent
              Glow Up habituel avec ce message sous les yeux.
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
  background: `linear-gradient(180deg, ${C.licorice} 0%, ${C.licoriceMid} 42%, rgba(176, 111, 112, 0.15) 100%)`,
  backgroundColor: C.licorice,
};

const container: CSSProperties = { maxWidth: "520px", margin: "0 auto" };

const badge: CSSProperties = {
  backgroundColor: C.cancelTint,
  border: "1px solid rgba(220, 120, 130, 0.45)",
  borderRadius: "12px",
  padding: "12px 18px",
  marginBottom: "12px",
  textAlign: "center",
};

const badgeText: CSSProperties = {
  margin: 0,
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.14em",
  color: "#ffd4d8",
};

const header: CSSProperties = {
  textAlign: "center",
  padding: "26px 22px 18px",
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
};

const headline: CSSProperties = {
  margin: "0 0 6px",
  fontSize: "24px",
  lineHeight: 1.25,
  fontFamily: 'Georgia, "Times New Roman", serif',
  color: C.lace,
  fontWeight: 600,
};

const subhead: CSSProperties = {
  margin: 0,
  fontSize: "13px",
  color: C.laceSoft,
  opacity: 0.9,
};

const card: CSSProperties = {
  backgroundColor: C.panel,
  border: `1px solid ${C.panelBorder}`,
  borderRadius: "0 0 16px 16px",
  padding: "24px 22px 20px",
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

const cancelBox: CSSProperties = {
  backgroundColor: C.cancelTint,
  borderLeft: `4px solid #d07078`,
  borderRadius: "12px",
  padding: "16px",
  margin: "0 0 14px",
};

const cancelLabel: CSSProperties = {
  margin: "0 0 4px",
  fontSize: "11px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#ecb4b9",
};

const highlightTitle: CSSProperties = {
  margin: 0,
  fontSize: "17px",
  fontWeight: 600,
  color: C.lace,
};

const highlightWhen: CSSProperties = {
  margin: 0,
  fontSize: "14px",
  lineHeight: 1.55,
  color: C.laceSoft,
};

const timeMuted: CSSProperties = {
  fontSize: "18px",
  fontWeight: 600,
  color: "#c8b8bc",
};

const hrRose: CSSProperties = {
  borderColor: `${C.rose}44`,
  borderStyle: "solid",
  borderWidth: "0 0 1px",
  margin: "12px 0",
};

const locationBox: CSSProperties = {
  margin: "0 0 14px",
  padding: "12px 14px",
  backgroundColor: "rgba(245, 237, 224, 0.05)",
  borderRadius: "10px",
  border: `1px solid ${C.panelBorder}`,
};

const locationLabel: CSSProperties = {
  margin: "0 0 6px",
  fontSize: "11px",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: C.roseLight,
};

const locationText: CSSProperties = {
  margin: 0,
  fontSize: "13px",
  color: C.lace,
  opacity: 0.9,
};

const pMuted: CSSProperties = {
  margin: "4px 0 0",
  fontSize: "13px",
  lineHeight: 1.55,
  color: C.laceSoft,
  opacity: 0.88,
};

const hrSoft: CSSProperties = {
  borderColor: C.panelBorder,
  margin: "18px 0 12px",
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
