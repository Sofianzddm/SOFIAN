import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GlowUpLogo } from "@/components/ui/logo";

const COLORS = {
  background: "#F5EBE0",
  header: "#1A1110",
  accent: "#C08B8B",
  ctaBg: "#C8F285",
  ctaText: "#1A1110",
  text: "#1A1110",
  cardBg: "#E8E4E0",
  white: "#FFFFFF",
  footerText: "#B0A8A3",
} as const;

export interface SignatureRequestEmailProps {
  signerName: string;
  documentReference: string;
  talentPrenom: string;
  talentNom: string;
  marqueNom: string;
  montantHT: string | number;
  dateDocument: string;
  signingUrl: string;
}

export function SignatureRequestEmail({
  signerName,
  documentReference,
  talentPrenom,
  talentNom,
  marqueNom,
  montantHT,
  dateDocument,
  signingUrl,
}: SignatureRequestEmailProps) {
  const montantStr = typeof montantHT === "number" ? `${montantHT} €` : `${montantHT}`;
  return (
    <div
      style={{
        backgroundColor: COLORS.background,
        fontFamily: "Georgia, 'Times New Roman', serif",
        padding: "24px",
        margin: 0,
      }}
    >
      {/* HEADER */}
      <div
        style={{
          backgroundColor: COLORS.header,
          color: COLORS.white,
          padding: "24px 32px",
          textAlign: "center",
        }}
      >
        <div style={{ display: "inline-block", margin: "0 auto" }}>
          <GlowUpLogo
            variant="light"
            style={{ width: 180, height: 32, display: "block" }}
          />
        </div>
        <p style={{ margin: "12px 0 0", fontSize: "14px", opacity: 0.9 }}>
          Agence d&apos;influence
        </p>
      </div>

      {/* CORPS */}
      <div
        style={{
          backgroundColor: COLORS.white,
          margin: "24px auto",
          maxWidth: "560px",
          padding: "32px",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(26,17,16,0.08)",
        }}
      >
        <p style={{ color: COLORS.text, fontSize: "16px", lineHeight: 1.6, margin: "0 0 20px" }}>
          Bonjour {signerName},
        </p>
        <p style={{ color: COLORS.text, fontSize: "16px", lineHeight: 1.6, margin: "0 0 24px" }}>
          Vous avez reçu un devis à signer électroniquement.
        </p>

        {/* Card récap */}
        <div
          style={{
            backgroundColor: COLORS.cardBg,
            borderRadius: "8px",
            padding: "20px",
            marginBottom: "24px",
          }}
        >
          <p style={{ margin: "0 0 8px", color: COLORS.text, fontSize: "14px" }}>
            📄 Référence : <strong>{documentReference}</strong>
          </p>
          <p style={{ margin: "0 0 8px", color: COLORS.text, fontSize: "14px" }}>
            🎯 Collaboration : {talentPrenom} {talentNom} × {marqueNom}
          </p>
          <p style={{ margin: "0 0 8px", color: COLORS.text, fontSize: "14px" }}>
            💶 Montant HT : {montantStr}
          </p>
          <p style={{ margin: 0, color: COLORS.text, fontSize: "14px" }}>
            📅 Date : {dateDocument}
          </p>
        </div>

        <p style={{ color: COLORS.text, fontSize: "16px", lineHeight: 1.6, margin: "0 0 24px" }}>
          Cliquez sur le bouton ci-dessous pour consulter et signer votre document de façon
          sécurisée.
        </p>

        <p style={{ textAlign: "center", margin: "0 0 8px" }}>
          <a
            href={signingUrl}
            style={{
              display: "inline-block",
              backgroundColor: COLORS.ctaBg,
              color: COLORS.ctaText,
              fontWeight: 700,
              padding: "16px 32px",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "16px",
            }}
          >
            ✍️ Signer le document
          </a>
        </p>
      </div>

      {/* FOOTER */}
      <div
        style={{
          backgroundColor: COLORS.header,
          color: COLORS.white,
          padding: "24px 32px",
          textAlign: "center",
          fontSize: "13px",
        }}
      >
        <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Glow Up Agence</p>
        <p style={{ margin: "0 0 4px", color: COLORS.footerText }}>
          5 Avenue Jean Moulin, Paris
        </p>
        <p style={{ margin: "0 0 4px", color: COLORS.footerText }}>
          SIRET : 92103414600024
        </p>
        <p style={{ margin: "0 0 12px", color: COLORS.footerText }}>
          contact@glowupagence.fr
        </p>
        <p style={{ margin: 0, fontSize: "11px", color: COLORS.footerText, opacity: 0.85 }}>
          Cet email a été envoyé via DocuSeal. Si vous n&apos;attendiez pas ce document, ignorez
          cet email.
        </p>
      </div>
    </div>
  );
}

export function renderSignatureRequestEmail(props: SignatureRequestEmailProps): string {
  const body = renderToStaticMarkup(React.createElement(SignatureRequestEmail, props));
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Devis à signer</title>
</head>
<body style="margin:0;padding:0">${body}</body>
</html>`;
}
