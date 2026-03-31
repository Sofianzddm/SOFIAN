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

export interface ContratMarqueApprouveEmailProps {
  talentMarqueLabel: string;
  reviewUrl: string;
}

export function ContratMarqueApprouveEmail({
  talentMarqueLabel,
  reviewUrl,
}: ContratMarqueApprouveEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Contrat approuvé — signature requise</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={headerSection}>
            <Img src={LOGO_URL} width={140} height="auto" alt="Glow Up" style={logo} />
          </Section>
          <Section style={bodySection}>
            <Text style={heading}>Contrat approuvé par le juriste</Text>
            <Text style={paragraph}>
              Le contrat marque pour <strong>{talentMarqueLabel}</strong> a été approuvé. Vous pouvez
              procéder à la signature.
            </Text>
            <Section style={buttonSection}>
              <Button style={button} href={reviewUrl}>
                Signer le contrat →
              </Button>
            </Section>
            <Text style={footerNote}>Glow Up — Message automatique</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: "#F5EDE0", fontFamily: "Switzer, Helvetica, sans-serif" };
const container = { margin: "0 auto", padding: "24px 16px 48px", maxWidth: "560px" };
const headerSection = {
  backgroundColor: "#1A1110",
  padding: "28px 24px",
  borderRadius: "12px 12px 0 0",
  textAlign: "center" as const,
};
const logo = { margin: "0 auto" };
const bodySection = {
  backgroundColor: "#ffffff",
  padding: "28px 24px 32px",
  borderRadius: "0 0 12px 12px",
  border: "1px solid #ebe6df",
  borderTop: "none",
};
const heading = {
  color: "#1A1110",
  fontSize: "20px",
  fontWeight: 600,
  margin: "0 0 16px",
};
const paragraph = { color: "#3d3834", fontSize: "15px", lineHeight: 1.6, margin: "0 0 24px" };
const buttonSection = { textAlign: "center" as const, margin: "8px 0 24px" };
const button = {
  backgroundColor: "#1A1110",
  color: "#F5EDE0",
  padding: "12px 24px",
  borderRadius: "8px",
  fontWeight: 600,
  fontSize: "14px",
  textDecoration: "none",
};
const footerNote = { color: "#8a827a", fontSize: "12px", margin: "0", textAlign: "center" as const };
