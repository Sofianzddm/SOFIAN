import React, { type CSSProperties } from "react";
import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";

import { formatParisTime } from "@/lib/cannes-coiffeur/formatParisTime";

const C = {
  licorice: "#220101",
  lace: "#F5EDE0",
  laceSoft: "#E8DED0",
  roseLight: "#C48B8C",
  panel: "#2A1718",
  panelBorder: "#B06F7044",
  goldTint: "rgba(232, 208, 143, 0.15)",
} as const;

export type StylistOperationalKind = "new_booking" | "cancellation";

export interface CannesCoiffeurStylistOperationalEmailProps {
  kind: StylistOperationalKind;
  /** Qui a déclenché l’annulation côté outil ; absent si nouvelle résa. */
  cancelSource?: "talent" | "staff";
  stylistFirstName: string;
  guestName: string;
  guestEmail: string;
  prestationTitle: string;
  notes: string | null;
  startsAt: Date;
  endsAt: Date;
  phoneDisplay: string;
  phoneTelHref: string;
}

export function CannesCoiffeurStylistOperationalEmail({
  kind,
  cancelSource,
  stylistFirstName,
  guestName,
  guestEmail,
  prestationTitle,
  notes,
  startsAt,
  endsAt,
  phoneDisplay,
  phoneTelHref,
}: CannesCoiffeurStylistOperationalEmailProps) {
  const when =
    `${formatParisTime(startsAt, "EEEE d MMMM yyyy")} · ${formatParisTime(startsAt, "HH:mm")} → ${formatParisTime(endsAt, "HH:mm")} (Paris)`;
  const preview =
    kind === "new_booking"
      ? `Nouvelle résa Cannes · ${guestName}`
      : `Annulation Cannes · ${guestName}`;

  return (
    <Html lang="fr">
      <Head>
        <meta name="color-scheme" content="dark light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Text style={eyebrow}>COIFFEUR · CANNES 2026</Text>
            <Text style={headline}>
              {kind === "new_booking" ? "Nouvelle réservation" : "Annulation"}
            </Text>
            <Text style={sub}>{when}</Text>
          </Section>

          <Section style={card}>
            <Text style={greeting}>Bonjour {stylistFirstName},</Text>
            <Text style={p}>
              {kind === "new_booking" ? (
                <>
                  Nouvelle réservation via le lien public — récap ci-dessous. Ce numéro figure aussi dans leurs emails
                  pour les imprévus :
                  {" "}
                  <Link href={phoneTelHref} style={link}>
                    {phoneDisplay}
                  </Link>
                  .
                </>
              ) : (
                <>
                  {cancelSource === "talent" ? (
                    <>Le ou la cliente a annulé sa réservation via son lien personnel.</>
                  ) : (
                    <>Une réservation a été annulée depuis la console équipe / staff.</>
                  )}
                </>
              )}
            </Text>

            <Section style={kvBox}>
              <Text style={kv}>Client : {guestName}</Text>
              <Text style={kv}>Email : {guestEmail}</Text>
              <Text style={kv}>Prestation : {prestationTitle}</Text>
              {notes?.trim() ? (
                <>
                  <Hr style={hr} />
                  <Text style={kvLabel}>Précisions coupe / style</Text>
                  <Text style={notesBlock}>{notes.trim()}</Text>
                </>
              ) : null}
            </Section>

            <Text style={muted}>
              Message automatique Glow Up · planning coiffeur Cannes 2026
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: CSSProperties = {
  margin: 0,
  padding: "28px 12px",
  backgroundColor: C.licorice,
};

const container: CSSProperties = { maxWidth: "520px", margin: "0 auto" };

const header: CSSProperties = {
  padding: "20px",
  borderRadius: "14px",
  border: `1px solid ${C.panelBorder}`,
  backgroundColor: C.goldTint,
  marginBottom: "10px",
};

const eyebrow: CSSProperties = {
  margin: "0 0 8px",
  fontSize: "11px",
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: "#e8d08f",
};

const headline: CSSProperties = {
  margin: "0 0 6px",
  fontSize: "22px",
  fontWeight: 600,
  color: C.lace,
};

const sub: CSSProperties = {
  margin: 0,
  fontSize: "13px",
  color: C.laceSoft,
};

const card: CSSProperties = {
  padding: "22px",
  borderRadius: "14px",
  border: `1px solid ${C.panelBorder}`,
  backgroundColor: C.panel,
};

const greeting: CSSProperties = {
  margin: "0 0 10px",
  fontSize: "16px",
  color: C.lace,
};

const p: CSSProperties = {
  margin: "0 0 18px",
  fontSize: "14px",
  lineHeight: 1.55,
  color: C.laceSoft,
};

const link: CSSProperties = { color: C.roseLight, textDecoration: "underline" };

const kvBox: CSSProperties = {
  padding: "14px",
  borderRadius: "10px",
  border: `1px solid ${C.panelBorder}`,
  marginBottom: "14px",
};

const kv: CSSProperties = {
  margin: "0 0 6px",
  fontSize: "14px",
  color: C.lace,
};

const kvLabel: CSSProperties = {
  margin: "0 0 4px",
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: C.roseLight,
};

const notesBlock: CSSProperties = {
  margin: 0,
  fontSize: "13px",
  color: C.laceSoft,
  whiteSpace: "pre-wrap",
};

const hr: CSSProperties = {
  borderColor: C.panelBorder,
  margin: "10px 0",
};

const muted: CSSProperties = {
  margin: 0,
  fontSize: "11px",
  color: C.roseLight,
  opacity: 0.85,
};
