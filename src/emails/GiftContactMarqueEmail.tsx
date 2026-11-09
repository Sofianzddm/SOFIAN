import React from "react";
import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

const LOGO_URL = "https://app.glowupagence.fr/Logo.png";

const COLORS = {
  header: "#1A1110",
  background: "#F4F4F5",
  text: "#18181B",
  muted: "#71717A",
  cardBg: "#FFFFFF",
  border: "#E4E4E7",
  accent: "#6D28D9",
} as const;

export interface GiftContactMarqueEmailProps {
  contactPrenom?: string | null;
  marqueNom: string;
  amName: string;
  talentName: string;
  typeGiftLabel: string;
  reference: string;
  description?: string | null;
  contrepartieLabel?: string | null;
  /** Corps libre (texte) — découpé en paragraphes. */
  bodyText: string;
  isHotel?: boolean;
  hotelDates?: string | null;
  hotelVille?: string | null;
  /** Langue fiche contact — pilote shell HTML (greeting / meta / sign-off). */
  language?: "fr" | "en" | null;
}

function bodyStartsWithGreeting(text: string) {
  return /^(hey|hello|bonjour|salut|coucou)\b/i.test(text.trim());
}

export function GiftContactMarqueEmail({
  contactPrenom,
  marqueNom,
  amName: _amName,
  talentName,
  typeGiftLabel,
  reference,
  description,
  contrepartieLabel,
  bodyText,
  isHotel,
  hotelDates,
  hotelVille,
  language,
}: GiftContactMarqueEmailProps) {
  void _amName; // signature = boîte Gmail à l'envoi
  const isEn = String(language || "").toLowerCase().startsWith("en");
  const paragraphs = (bodyText || "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const hasInlineGreeting =
    paragraphs.length > 0 && bodyStartsWithGreeting(paragraphs[0]);

  const greeting = hasInlineGreeting
    ? null
    : contactPrenom?.trim()
      ? isEn
        ? `Hello ${contactPrenom.trim()},`
        : `Bonjour ${contactPrenom.trim()},`
      : isEn
        ? "Hello,"
        : "Bonjour,";

  const preview = isEn
    ? `${talentName} × ${marqueNom} — gift proposal Glow Up (${reference})`
    : `${talentName} × ${marqueNom} — proposition gift Glow Up (${reference})`;

  const labels = isEn
    ? {
        details: "Proposal details",
        talent: "Talent",
        type: "Type",
        need: "Brief",
        contrepartie: "Proposed counterpart",
        dates: "Dates",
        city: "City",
        ref: "Glow Up ref.",
        closing:
          "Happy to discuss — feel free to reply directly on this thread.",
      }
    : {
        details: "Détails de la proposition",
        talent: "Talent",
        type: "Type",
        need: "Besoin",
        contrepartie: "Contrepartie proposée",
        dates: "Dates",
        city: "Ville",
        ref: "Réf. Glow Up",
        closing:
          "Je reste dispo pour en discuter — n'hésite pas à me répondre directement sur ce fil.",
      };

  return (
    <Html lang={isEn ? "en" : "fr"}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={headerSection}>
            <Img
              src={LOGO_URL}
              alt="Glow Up"
              width={160}
              height={28}
              style={logo}
            />
          </Section>

          <Section style={cardSection}>
            {greeting ? <Text style={greetingStyle}>{greeting}</Text> : null}
            {paragraphs.map((p, i) => (
              <Text key={i} style={i === 0 ? bodyFirst : paragraph}>
                {p.split("\n").map((line, j, arr) => (
                  <React.Fragment key={j}>
                    {line}
                    {j < arr.length - 1 ? <br /> : null}
                  </React.Fragment>
                ))}
              </Text>
            ))}

            <Section style={infoBox}>
              <Text style={infoLabel}>{labels.details}</Text>
              <Text style={infoRow}>
                <strong>{labels.talent} :</strong> {talentName}
              </Text>
              <Text style={infoRow}>
                <strong>{labels.type} :</strong> {typeGiftLabel}
              </Text>
              {description ? (
                <Text style={infoRow}>
                  <strong>{labels.need} :</strong> {description}
                </Text>
              ) : null}
              {contrepartieLabel ? (
                <Text style={infoRow}>
                  <strong>{labels.contrepartie} :</strong> {contrepartieLabel}
                </Text>
              ) : null}
              {isHotel && hotelDates ? (
                <Text style={infoRow}>
                  <strong>{labels.dates} :</strong> {hotelDates}
                </Text>
              ) : null}
              {isHotel && hotelVille ? (
                <Text style={infoRow}>
                  <strong>{labels.city} :</strong> {hotelVille}
                </Text>
              ) : null}
              <Text style={infoRow}>
                <strong>{labels.ref} :</strong> {reference}
              </Text>
            </Section>

            <Text style={paragraph}>{labels.closing}</Text>
            {/* Signature = celle de la boîte Gmail (ajoutée à l'envoi) — pas de sign-off hardcodé */}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: COLORS.background,
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
  margin: 0,
  padding: "32px 12px",
};

const container: React.CSSProperties = {
  maxWidth: "560px",
  margin: "0 auto",
};

const headerSection: React.CSSProperties = {
  textAlign: "center" as const,
  marginBottom: "20px",
};

const logo: React.CSSProperties = {
  margin: "0 auto",
};

const cardSection: React.CSSProperties = {
  backgroundColor: COLORS.cardBg,
  borderRadius: "12px",
  border: `1px solid ${COLORS.border}`,
  padding: "28px 28px 20px",
};

const greetingStyle: React.CSSProperties = {
  color: COLORS.text,
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 12px",
};

const paragraph: React.CSSProperties = {
  color: COLORS.text,
  fontSize: "15px",
  lineHeight: "24px",
  margin: "16px 0 0",
};

const bodyFirst: React.CSSProperties = {
  color: COLORS.text,
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 12px",
};

const infoBox: React.CSSProperties = {
  backgroundColor: "#FAFAFA",
  borderRadius: "10px",
  border: `1px solid ${COLORS.border}`,
  padding: "14px 16px",
  marginTop: "20px",
};

const infoLabel: React.CSSProperties = {
  color: COLORS.accent,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
  margin: "0 0 8px",
};

const infoRow: React.CSSProperties = {
  color: COLORS.text,
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0 0 4px",
};

export default GiftContactMarqueEmail;
