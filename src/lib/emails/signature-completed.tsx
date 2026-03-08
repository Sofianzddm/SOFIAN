import React from "react";
import { GlowUpLogo } from "@/components/ui/logo";

const COLORS = {
  background: "#F5EBE0",
  header: "#1A1110",
  ctaBg: "#C8F285",
  ctaText: "#1A1110",
  text: "#1A1110",
  cardBg: "#E8E4E0",
  white: "#FFFFFF",
  footerText: "#B0A8A3",
  success: "#0F766E",
} as const;

export interface SignatureCompletedEmailProps {
  recipientName: string;
  documentReference: string;
  talentPrenom: string;
  talentNom: string;
  marqueNom: string;
  montantHT: string | number;
  signedAt: string;
  signedDocumentUrl: string;
}

export function SignatureCompletedEmail({
  recipientName,
  documentReference,
  talentPrenom,
  talentNom,
  marqueNom,
  montantHT,
  signedAt,
  signedDocumentUrl,
}: SignatureCompletedEmailProps) {
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
          Bonjour {recipientName},
        </p>
        <p
          style={{
            color: COLORS.success,
            fontSize: "17px",
            fontWeight: 600,
            lineHeight: 1.5,
            margin: "0 0 24px",
          }}
        >
          ✓ Le devis a été signé par toutes les parties.
        </p>

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
            📅 Signé le : {signedAt}
          </p>
        </div>

        <p style={{ color: COLORS.text, fontSize: "16px", lineHeight: 1.6, margin: "0 0 24px" }}>
          Vous pouvez télécharger le document signé via le lien ci-dessous.
        </p>

        <p style={{ textAlign: "center", margin: "0 0 8px" }}>
          <a
            href={signedDocumentUrl}
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
            📥 Voir le document signé
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
          1330 avenue Jean-René Guillibert Gautier de La Lauzière, 13290 Aix-en-Provence
        </p>
        <p style={{ margin: "0 0 4px", color: COLORS.footerText }}>
          SIRET : 92103414600024
        </p>
        <p style={{ margin: 0, color: COLORS.footerText }}>contact@glowupagence.fr</p>
      </div>
    </div>
  );
}

