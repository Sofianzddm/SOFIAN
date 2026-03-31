import React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

const LOGO_URL = "https://app.glowupagence.fr/Logo.png";

export interface ContratMarqueJuristeEmailProps {
  collaborationLabel: string;
  collaborationUrl: string;
}

export function ContratMarqueJuristeEmail({
  collaborationLabel,
  collaborationUrl,
}: ContratMarqueJuristeEmailProps) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>Relecture contrat marque — Glow Up Agency</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={headerSection}>
            <Img src={LOGO_URL} alt="Glow Up" width={180} height={32} style={logo} />
          </Section>

          <Section style={cardSection}>
            <Text style={greeting}>Bonjour, merci de relire le contrat ci-joint.</Text>
            <Text style={paragraph}>Collaboration : {collaborationLabel}</Text>

            <Section style={buttonSection}>
              <Button style={button} href={collaborationUrl}>
                Voir et annoter le contrat →
              </Button>
            </Section>

            <Text style={smallText}>
              Vous pouvez surligner le PDF et ajouter vos observations directement dans l’outil de relecture.
            </Text>
          </Section>

          <Section style={footerSection}>
            <Text style={footerText}>Glow Up Agency — glowupagence.fr</Text>
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
  backgroundColor: "#1A1110",
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
  marginTop: "24px",
  border: "1px solid rgba(176,111,112,0.15)",
};

const greeting = {
  color: "#1A1110",
  fontSize: "16px",
  lineHeight: 1.5,
  margin: "0 0 10px",
};

const paragraph = {
  color: "#1A1110",
  fontSize: "14px",
  lineHeight: 1.5,
  margin: "0 0 24px",
};

const buttonSection = {
  textAlign: "center" as const,
  margin: "0 0 16px",
};

const button = {
  backgroundColor: "#1A1110",
  color: "#F5EDE0",
  fontWeight: 600,
  padding: "14px 22px",
  borderRadius: "10px",
  fontSize: "14px",
  textDecoration: "none",
};

const smallText = {
  color: "#5c534d",
  fontSize: "12px",
  lineHeight: 1.45,
  margin: 0,
};

const footerSection = {
  padding: "20px 0 28px",
  textAlign: "center" as const,
};

const footerText = {
  color: "#6b6560",
  fontSize: "12px",
  margin: 0,
};
