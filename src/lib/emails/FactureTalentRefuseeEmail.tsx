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

export interface FactureTalentRefuseeEmailProps {
  prenom: string;
  reference: string;
  marque: string;
  commentaire: string;
  portalUrl: string;
}

export function FactureTalentRefuseeEmail({
  prenom,
  reference,
  marque,
  commentaire,
  portalUrl,
}: FactureTalentRefuseeEmailProps) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>Ta facture pour {reference} a été refusée</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={headerSection}>
            <Img src={LOGO_URL} width={140} height="auto" alt="Glow Up" style={logo} />
          </Section>
          <Section style={bodySection}>
            <Text style={heading}>Salut {prenom},</Text>
            <Text style={paragraph}>
              Ta facture pour la collaboration <strong>{reference}</strong>
              {marque ? (
                <>
                  {" "}
                  ({marque})
                </>
              ) : null}{" "}
              a été refusée. Merci d&apos;en renvoyer une corrigée depuis ton espace talent.
            </Text>
            <Text style={label}>Commentaire de l&apos;équipe :</Text>
            <Section style={quoteBox}>
              <Text style={quoteText}>{commentaire}</Text>
            </Section>
            <Section style={buttonSection}>
              <Button style={button} href={portalUrl}>
                Renvoyer ma facture →
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
  fontSize: "18px",
  fontWeight: 600,
  margin: "0 0 12px",
};
const paragraph = { color: "#3d3834", fontSize: "15px", lineHeight: 1.6, margin: "0 0 16px" };
const label = {
  color: "#8a827a",
  fontSize: "12px",
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  margin: "0 0 8px",
};
const quoteBox = {
  backgroundColor: "#f7f4ef",
  borderLeft: "4px solid #c2410c",
  padding: "12px 16px",
  margin: "0 0 24px",
  borderRadius: "0 8px 8px 0",
};
const quoteText = {
  color: "#3d3834",
  fontSize: "14px",
  lineHeight: 1.55,
  margin: 0,
  whiteSpace: "pre-wrap" as const,
};
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
