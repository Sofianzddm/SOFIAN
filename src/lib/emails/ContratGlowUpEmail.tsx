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
  headerDeep: "#2A1816",
  rose: "#C08B8B",
  background: "#F5EBE0",
  text: "#1A1110",
  muted: "#6B635C",
  cardBg: "#FFFFFF",
  lace: "#F5EDE0",
  border: "rgba(176,111,112,0.18)",
} as const;

export interface ContratGlowUpEmailProps {
  /** Prénom (ou nom complet) du destinataire */
  signerName: string;
  /** Titre du contrat (ex. "Contrat de management 2026") */
  contratTitre: string;
  /** Lien de signature DocuSeal propre au destinataire */
  signingUrl: string;
  /** true si le destinataire est l'agence (adapte le texte) */
  isAgence?: boolean;
  /**
   * Agence uniquement : true si le talent a déjà signé (webhook).
   * false = mail envoyé dès l'envoi du contrat (lien reçu en avance).
   */
  talentHasSigned?: boolean;
  /** true pour une relance */
  isRelance?: boolean;
}

export function ContratGlowUpEmail({
  signerName,
  contratTitre,
  signingUrl,
  isAgence = false,
  talentHasSigned = true,
  isRelance = false,
}: ContratGlowUpEmailProps) {
  const firstName = signerName.trim().split(/\s+/)[0] || signerName;

  const eyebrow = isRelance
    ? "Rappel — signature en attente"
    : isAgence && talentHasSigned
      ? "Action requise — votre signature"
      : "Signature électronique";

  const headline = isAgence
    ? talentHasSigned
      ? "Signature de l’agence requise"
      : "Contrat en attente de signature"
    : isRelance
      ? "Rappel — signature en attente"
      : "Contrat à signer";

  const intro = isAgence
    ? talentHasSigned
      ? "Le talent a signé le contrat. Merci de procéder à la signature de l’agence pour finaliser le document."
      : "Un contrat a été envoyé en signature électronique. Vous trouverez ci-dessous votre lien personnalisé."
    : isRelance
      ? "Nous vous rappelons qu’un contrat Glow Up est en attente de votre signature électronique."
      : "Vous avez reçu un contrat à signer électroniquement. Consultez le document puis validez votre signature via le bouton ci-dessous.";

  const preview = isRelance
    ? `Rappel : signer « ${contratTitre} »`
    : `À signer — ${contratTitre}`;

  return (
    <Html lang="fr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Header */}
          <Section style={headerSection}>
            <Img src={LOGO_URL} alt="Glow Up" width={168} height={30} style={logo} />
            <Text style={headerTagline}>Agence d&apos;influence</Text>
          </Section>

          {/* Hero card */}
          <Section style={cardSection}>
            <Text style={eyebrowStyle}>{eyebrow}</Text>
            <Text style={headlineStyle}>{headline}</Text>
            <Text style={greeting}>Bonjour {firstName},</Text>
            <Text style={paragraph}>{intro}</Text>

            {/* Document card */}
            <Section style={docCard}>
              <Text style={docLabel}>Document à signer</Text>
              <Text style={docTitle}>{contratTitre}</Text>
              <Text style={docMeta}>Signature électronique sécurisée</Text>
            </Section>

            <Section style={buttonSection}>
              <Button style={button} href={signingUrl}>
                Signer le contrat
              </Button>
            </Section>

            <Text style={fallback}>
              Bouton inactif ?{" "}
              <Link href={signingUrl} style={fallbackLink}>
                Ouvrir le lien de signature
              </Link>
            </Text>
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footerSection}>
            <Text style={footerTitle}>Glow Up Agence</Text>
            <Text style={footerText}>
              1330 avenue Jean-René Guillibert Gautier de La Lauzière
              <br />
              13290 Aix-en-Provence
            </Text>
            <Text style={footerText}>SIRET 921 034 146 00024</Text>
            <Link href="mailto:contact@glowupagence.fr" style={footerLink}>
              contact@glowupagence.fr
            </Link>
            <Text style={footerSmall}>
              © {new Date().getFullYear()} Glow Up Agence — Tous droits réservés.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: COLORS.background,
  fontFamily:
    "Georgia, 'Times New Roman', Times, 'Palatino Linotype', Palatino, serif",
  margin: 0,
  padding: "0 0 40px",
};

const container = {
  margin: "0 auto",
  maxWidth: "560px",
  padding: "24px 16px 0",
};

const headerSection = {
  backgroundColor: COLORS.header,
  background: `linear-gradient(165deg, ${COLORS.header} 0%, ${COLORS.headerDeep} 55%, #3D1F1C 100%)`,
  padding: "36px 28px 32px",
  textAlign: "center" as const,
  borderRadius: "20px 20px 0 0",
};

const logo = {
  display: "block",
  margin: "0 auto 10px",
  filter: "brightness(0) invert(1)",
};

const headerTagline = {
  margin: "0",
  color: COLORS.rose,
  fontSize: "11px",
  letterSpacing: "0.22em",
  textTransform: "uppercase" as const,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  opacity: 0.95,
};

const cardSection = {
  backgroundColor: COLORS.cardBg,
  borderRadius: "0 0 20px 20px",
  padding: "36px 32px 32px",
  boxShadow: "0 12px 40px rgba(26,17,16,0.10)",
  border: `1px solid ${COLORS.border}`,
  borderTop: "none",
};

const eyebrowStyle = {
  margin: "0 0 10px",
  color: COLORS.rose,
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.18em",
  textTransform: "uppercase" as const,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

const headlineStyle = {
  margin: "0 0 20px",
  color: COLORS.text,
  fontSize: "26px",
  lineHeight: 1.25,
  fontWeight: 400,
  letterSpacing: "-0.02em",
};

const greeting = {
  color: COLORS.text,
  fontSize: "16px",
  lineHeight: 1.5,
  margin: "0 0 8px",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontWeight: 600,
};

const paragraph = {
  color: COLORS.muted,
  fontSize: "15px",
  lineHeight: 1.65,
  margin: "0 0 28px",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

const docCard = {
  backgroundColor: "#FAF7F3",
  borderRadius: "12px",
  padding: "20px 22px",
  marginBottom: "28px",
  border: `1px solid ${COLORS.border}`,
  borderLeft: `3px solid ${COLORS.rose}`,
};

const docLabel = {
  margin: "0 0 6px",
  color: COLORS.muted,
  fontSize: "11px",
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontWeight: 600,
};

const docTitle = {
  margin: "0 0 8px",
  color: COLORS.text,
  fontSize: "16px",
  lineHeight: 1.4,
  fontWeight: 600,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

const docMeta = {
  margin: 0,
  color: COLORS.muted,
  fontSize: "13px",
  lineHeight: 1.4,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

const buttonSection = {
  textAlign: "center" as const,
  margin: "0 0 16px",
};

const button = {
  backgroundColor: COLORS.header,
  color: COLORS.lace,
  fontWeight: 600,
  padding: "14px 32px",
  borderRadius: "10px",
  fontSize: "15px",
  textDecoration: "none",
  letterSpacing: "0.01em",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  display: "inline-block",
};

const fallback = {
  margin: 0,
  textAlign: "center" as const,
  color: COLORS.muted,
  fontSize: "12px",
  lineHeight: 1.5,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

const fallbackLink = {
  color: COLORS.header,
  textDecoration: "underline",
  fontWeight: 600,
};

const hr = {
  borderColor: "rgba(176,111,112,0.2)",
  margin: "28px 0 0",
  border: "none",
  borderTop: `1px solid rgba(176,111,112,0.2)`,
};

const footerSection = {
  padding: "28px 16px 8px",
  textAlign: "center" as const,
  fontSize: "12px",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

const footerTitle = {
  margin: "0 0 8px",
  fontWeight: 700,
  fontSize: "13px",
  color: COLORS.text,
  letterSpacing: "0.04em",
};

const footerText = {
  margin: "0 0 4px",
  color: COLORS.muted,
  lineHeight: 1.5,
};

const footerLink = {
  color: COLORS.rose,
  textDecoration: "none",
  display: "inline-block",
  margin: "8px 0 12px",
  fontWeight: 600,
};

const footerSmall = {
  margin: "0",
  fontSize: "11px",
  color: COLORS.muted,
  opacity: 0.85,
};
