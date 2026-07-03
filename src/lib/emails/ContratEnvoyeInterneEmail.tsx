import React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

const LOGO_URL = "https://app.glowupagence.fr/Logo.png";

const COLORS = {
  header: "#1A1110",
  accent: "#C08B8B",
  ctaBg: "#C8F285",
  ctaText: "#1A1110",
  background: "#F5EBE0",
  text: "#1A1110",
  cardBg: "#FFFFFF",
  lace: "#F5EDE0",
} as const;

export interface ContratEnvoyeInterneEmailProps {
  /** Prénom du destinataire interne */
  destinatairePrenom: string;
  /** Titre du contrat */
  contratTitre: string;
  /** Nom complet du talent */
  talentNom: string;
  /** Qui a envoyé le contrat */
  envoyeParNom: string;
  /** Lien vers la fiche talent */
  ficheTalentUrl: string;
  /** true si c'est une relance (adapte le texte) */
  isRelance?: boolean;
}

/** Email interne (admins / heads) : un contrat talent vient de partir en signature (ou relance). */
export function ContratEnvoyeInterneEmail({
  destinatairePrenom,
  contratTitre,
  talentNom,
  envoyeParNom,
  ficheTalentUrl,
  isRelance = false,
}: ContratEnvoyeInterneEmailProps) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>
        {isRelance
          ? `Relance signature — ${contratTitre}`
          : `Contrat envoyé en signature — ${contratTitre}`}
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={headerSection}>
            <Img src={LOGO_URL} alt="Glow Up" width={180} height={32} style={logo} />
          </Section>

          <Section style={cardSection}>
            <Text style={greeting}>Bonjour {destinatairePrenom},</Text>
            <Text style={paragraph}>
              {isRelance
                ? "Une relance de signature vient d'être envoyée pour un contrat talent en attente."
                : "Un contrat vient d'être envoyé en signature électronique à un talent."}
            </Text>

            <Section style={infoBox}>
              <Text style={infoLine}>📄 Contrat : <strong>{contratTitre}</strong></Text>
              <Text style={infoLine}>⭐ Talent : {talentNom}</Text>
              <Text style={infoLine}>👤 {isRelance ? "Relancé par" : "Envoyé par"} : {envoyeParNom}</Text>
            </Section>

            <Section style={buttonSection}>
              <Button style={button} href={ficheTalentUrl}>
                Voir la fiche talent
              </Button>
            </Section>
          </Section>

          <Hr style={hr} />

          <Section style={footerSection}>
            <Text style={footerTitle}>Glow Up Agence</Text>
            <Text style={footerSmall}>
              Notification interne — © {new Date().getFullYear()} Glow Up Agence
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: COLORS.background,
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: 0,
};

const container = {
  margin: "0 auto",
  maxWidth: "600px",
  padding: "0 24px",
};

const headerSection = {
  background: "linear-gradient(180deg, #1A1110 0%, #3D1515 100%)",
  padding: "32px 24px 28px",
  textAlign: "center" as const,
};

const logo = {
  display: "block",
  margin: "0 auto",
  filter: "brightness(0) invert(1)",
};

const cardSection = {
  backgroundColor: COLORS.cardBg,
  borderRadius: "16px",
  padding: "32px",
  marginTop: "32px",
  boxShadow: "0 4px 24px rgba(34,1,1,0.12)",
  border: "1px solid rgba(176,111,112,0.15)",
};

const greeting = {
  color: COLORS.text,
  fontSize: "17px",
  lineHeight: 1.6,
  margin: "0 0 8px",
};

const paragraph = {
  color: COLORS.text,
  fontSize: "15px",
  lineHeight: 1.6,
  margin: "0 0 24px",
  opacity: 0.9,
};

const infoBox = {
  backgroundColor: "#E8DED0",
  borderRadius: "12px",
  padding: "20px",
  marginBottom: "24px",
  borderLeft: "4px solid " + COLORS.accent,
};

const infoLine = {
  color: COLORS.text,
  fontSize: "14px",
  margin: "0 0 10px",
};

const buttonSection = {
  textAlign: "center" as const,
  margin: "0",
};

const button = {
  backgroundColor: COLORS.ctaBg,
  color: COLORS.ctaText,
  fontWeight: 600,
  padding: "14px 32px",
  borderRadius: "12px",
  fontSize: "15px",
  textDecoration: "none",
  boxShadow: "0 2px 12px rgba(176,111,112,0.35)",
};

const hr = {
  borderColor: "rgba(176,111,112,0.2)",
  margin: "32px 0",
};

const footerSection = {
  backgroundColor: COLORS.header,
  color: COLORS.lace,
  padding: "24px",
  textAlign: "center" as const,
  fontSize: "13px",
};

const footerTitle = {
  margin: "0 0 6px",
  fontWeight: 600,
  fontSize: "14px",
};

const footerSmall = {
  margin: "0",
  fontSize: "11px",
  opacity: 0.7,
};
