import React from "react";
import {
  Body,
  Button,
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
  success: "#0F766E",
} as const;

export interface SignatureCompletedEmailProps {
  signerName: string;
  documentReference: string;
  talentNom: string;
  marqueNom: string;
  montantHT: number;
  signedDocumentUrl: string;
}

export function SignatureCompletedEmail({
  signerName,
  documentReference,
  talentNom,
  marqueNom,
  montantHT,
  signedDocumentUrl,
}: SignatureCompletedEmailProps) {
  const montantStr = `${montantHT} €`;
  return (
    <Html lang="fr">
      <Head />
      <Preview>Devis {documentReference} signé — Glow Up Agence</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={headerSection}>
            <Img src={LOGO_URL} alt="Glow Up" width={180} height={32} style={logo} />
            <Text style={headerSubtitle}>Agence d&apos;influence</Text>
          </Section>

          <Section style={cardSection}>
            <Text style={greeting}>Bonjour {signerName},</Text>
            <Text style={successTitle}>✓ Le devis a été signé par toutes les parties.</Text>

            <Section style={infoBox}>
              <Text style={infoLine}>📄 Référence : <strong>{documentReference}</strong></Text>
              <Text style={infoLine}>🎯 Collaboration : {talentNom} × {marqueNom}</Text>
              <Text style={infoLine}>💶 Montant HT : {montantStr}</Text>
            </Section>

            <Text style={paragraph}>
              Vous pouvez télécharger le document signé via le lien ci-dessous.
            </Text>

            <Section style={buttonSection}>
              <Button style={button} href={signedDocumentUrl}>
                📥 Voir le document signé
              </Button>
            </Section>
          </Section>

          <Hr style={hr} />

          <Section style={footerSection}>
            <Text style={footerTitle}>Glow Up Agence</Text>
            <Text style={footerText}>1330 avenue Jean-René Guillibert Gautier de La Lauzière, 13290 Aix-en-Provence</Text>
            <Text style={footerText}>SIRET : 921 034 146 00024</Text>
            <Link href="mailto:contact@glowupagence.fr" style={footerLink}>contact@glowupagence.fr</Link>
            <Text style={footerSmall}>© {new Date().getFullYear()} Glow Up Agence. Tous droits réservés.</Text>
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
};

const headerSubtitle = {
  color: COLORS.lace,
  fontSize: "13px",
  margin: "14px 0 0",
  opacity: 0.9,
  letterSpacing: "0.05em",
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

const successTitle = {
  color: COLORS.success,
  fontSize: "17px",
  fontWeight: 600,
  lineHeight: 1.5,
  margin: "0 0 24px",
};

const paragraph = {
  color: COLORS.text,
  fontSize: "15px",
  lineHeight: 1.6,
  margin: "0 0 28px",
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
  padding: "16px 36px",
  borderRadius: "12px",
  fontSize: "16px",
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
  padding: "28px 24px",
  textAlign: "center" as const,
  fontSize: "13px",
};

const footerTitle = {
  margin: "0 0 6px",
  fontWeight: 600,
  fontSize: "14px",
};

const footerText = {
  margin: "0 0 4px",
  opacity: 0.9,
};

const footerLink = {
  color: COLORS.lace,
  textDecoration: "none",
  display: "block",
  margin: "0 0 12px",
  opacity: 0.9,
};

const footerSmall = {
  margin: "0 0 4px",
  fontSize: "11px",
  opacity: 0.7,
};
