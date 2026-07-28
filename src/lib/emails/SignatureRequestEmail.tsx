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
} as const;

export interface SignatureRequestEmailProps {
  signerName: string;
  documentReference: string;
  talentNom: string;
  marqueNom: string;
  montantHT: number;
  dateDocument: string;
  signingUrl: string;
  locale?: "fr" | "en";
}

const T = {
  fr: {
    preview: (ref: string) => `Devis ${ref} à signer — Glow Up Agence`,
    greeting: (n: string) => `Bonjour ${n},`,
    intro: "Vous avez reçu un devis à signer électroniquement.",
    reference: "📄 Référence :",
    collaboration: "🎯 Collaboration :",
    montant: "💶 Montant HT :",
    date: "📅 Date :",
    instruction:
      "Cliquez sur le bouton ci-dessous pour consulter et signer votre document de façon sécurisée.",
    cta: "✍️ Signer le document",
    rights: "Tous droits réservés.",
  },
  en: {
    preview: (ref: string) => `Quote ${ref} to sign — Glow Up Agence`,
    greeting: (n: string) => `Hello ${n},`,
    intro: "You have received a quote to sign electronically.",
    reference: "📄 Reference:",
    collaboration: "🎯 Collaboration:",
    montant: "💶 Amount (excl. VAT):",
    date: "📅 Date:",
    instruction:
      "Click the button below to review and sign your document securely.",
    cta: "✍️ Sign the document",
    rights: "All rights reserved.",
  },
} as const;

export function SignatureRequestEmail({
  signerName,
  documentReference,
  talentNom,
  marqueNom,
  montantHT,
  dateDocument,
  signingUrl,
  locale = "fr",
}: SignatureRequestEmailProps) {
  const montantStr = `${montantHT} €`;
  const t = T[locale === "en" ? "en" : "fr"];
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{t.preview(documentReference)}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={headerSection}>
            <Img src={LOGO_URL} alt="Glow Up" width={180} height={32} style={logo} />
          </Section>

          <Section style={cardSection}>
            <Text style={greeting}>{t.greeting(signerName)}</Text>
            <Text style={paragraph}>{t.intro}</Text>

            <Section style={infoBox}>
              <Text style={infoLine}>{t.reference} <strong>{documentReference}</strong></Text>
              <Text style={infoLine}>{t.collaboration} {talentNom} × {marqueNom}</Text>
              <Text style={infoLine}>{t.montant} {montantStr}</Text>
              <Text style={infoLine}>{t.date} {dateDocument}</Text>
            </Section>

            <Text style={paragraph}>
              {t.instruction}
            </Text>

            <Section style={buttonSection}>
              <Button style={button} href={signingUrl}>
                {t.cta}
              </Button>
            </Section>
          </Section>

          <Hr style={hr} />

          <Section style={footerSection}>
            <Text style={footerTitle}>Glow Up Agence</Text>
            <Text style={footerText}>1330 avenue Jean-René Guillibert Gautier de La Lauzière, 13290 Aix-en-Provence</Text>
            <Text style={footerText}>SIRET : 921 034 146 00024</Text>
            <Link href="mailto:contact@glowupagence.fr" style={footerLink}>contact@glowupagence.fr</Link>
            <Text style={footerSmall}>© {new Date().getFullYear()} Glow Up Agence. {t.rights}</Text>
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
