import React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

const LOGO_URL = "https://app.glowupagence.fr/Logo.png";

const HEADER_BG = "#1A1110";
const CTA_BG = "#1A1110";
const CTA_TEXT = "#F5EDE0";

export interface ContratTalentEmailProps {
  talentNom: string;
  marque: string;
  submitterLink: string;
}

export function ContratTalentEmail({
  talentNom,
  marque,
  submitterLink,
}: ContratTalentEmailProps) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>Votre contrat à signer — Glow Up</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={headerSection}>
            <Img src={LOGO_URL} alt="Glow Up" width={180} height={32} style={logo} />
          </Section>

          <Section style={cardSection}>
            <Text style={greeting}>Bonjour {talentNom},</Text>
            <Text style={paragraph}>
              Vous avez reçu un contrat de collaboration à signer dans le cadre de votre partenariat avec{" "}
              {marque}.
            </Text>

            <Section style={buttonSection}>
              <Button style={button} href={submitterLink}>
                Consulter et signer le contrat →
              </Button>
            </Section>

            <Text style={discrete}>
              Ce contrat a été généré par Glow Up. Pour toute question, contactez votre talent manager.
            </Text>
          </Section>

          <Section style={footerSection}>
            <Text style={footerLine}>
              Glow Up —{" "}
              <Link href="https://glowupagence.fr" style={footerLink}>
                glowupagence.fr
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: "#F5EBE0",
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: 0,
};

const container = {
  margin: "0 auto",
  maxWidth: "600px",
  padding: "0 24px",
};

const headerSection = {
  backgroundColor: HEADER_BG,
  padding: "32px 24px 28px",
  textAlign: "center" as const,
};

const logo = {
  display: "block",
  margin: "0 auto",
  filter: "brightness(0) invert(1)",
};

const cardSection = {
  backgroundColor: "#FFFFFF",
  borderRadius: "16px",
  padding: "32px",
  marginTop: "32px",
  boxShadow: "0 4px 24px rgba(34,1,1,0.12)",
  border: "1px solid rgba(176,111,112,0.15)",
};

const greeting = {
  color: "#1A1110",
  fontSize: "17px",
  lineHeight: 1.6,
  margin: "0 0 8px",
};

const paragraph = {
  color: "#1A1110",
  fontSize: "15px",
  lineHeight: 1.6,
  margin: "0 0 28px",
  opacity: 0.92,
};

const buttonSection = {
  textAlign: "center" as const,
  margin: "0 0 28px",
};

const button = {
  backgroundColor: CTA_BG,
  color: CTA_TEXT,
  fontWeight: 600,
  padding: "16px 28px",
  borderRadius: "12px",
  fontSize: "15px",
  textDecoration: "none",
  display: "inline-block",
};

const discrete = {
  color: "#5c534d",
  fontSize: "12px",
  lineHeight: 1.5,
  margin: "0",
};

const footerSection = {
  padding: "24px 8px 32px",
  textAlign: "center" as const,
};

const footerLine = {
  color: "#6b6560",
  fontSize: "12px",
  margin: 0,
};

const footerLink = {
  color: "#6b6560",
  textDecoration: "underline",
};
