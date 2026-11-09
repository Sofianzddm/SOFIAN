import React from "react";
import {
  Body,
  Head,
  Html,
  Preview,
  Text,
} from "@react-email/components";

export interface GiftContactMarqueEmailProps {
  contactPrenom?: string | null;
  marqueNom: string;
  amName: string;
  talentName: string;
  typeGiftLabel: string;
  reference: string;
  description?: string | null;
  contrepartieLabel?: string | null;
  /** Corps libre (texte) — découpé en paragraphes. */
  bodyText: string;
  isHotel?: boolean;
  hotelDates?: string | null;
  hotelVille?: string | null;
  /** Langue fiche contact. */
  language?: "fr" | "en" | null;
}

function bodyStartsWithGreeting(text: string) {
  return /^(hey|hello|bonjour|salut|coucou)\b/i.test(text.trim());
}

/**
 * Mail gift = mail perso Gmail (pas de template marketing).
 * Logo / encadré / closing hardcodé → non. Signature = boîte Gmail à l'envoi.
 */
export function GiftContactMarqueEmail({
  contactPrenom,
  marqueNom,
  amName: _amName,
  talentName,
  typeGiftLabel: _typeGiftLabel,
  reference: _reference,
  description: _description,
  contrepartieLabel: _contrepartie,
  bodyText,
  isHotel: _isHotel,
  hotelDates: _hotelDates,
  hotelVille: _hotelVille,
  language,
}: GiftContactMarqueEmailProps) {
  void _amName;
  void _typeGiftLabel;
  void _reference;
  void _description;
  void _contrepartie;
  void _isHotel;
  void _hotelDates;
  void _hotelVille;

  const isEn = String(language || "").toLowerCase().startsWith("en");
  const paragraphs = (bodyText || "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const hasInlineGreeting =
    paragraphs.length > 0 && bodyStartsWithGreeting(paragraphs[0]);

  const greeting = hasInlineGreeting
    ? null
    : contactPrenom?.trim()
      ? isEn
        ? `Hello ${contactPrenom.trim()},`
        : `Bonjour ${contactPrenom.trim()},`
      : isEn
        ? "Hello,"
        : "Bonjour,";

  const preview = isEn
    ? `${talentName} × ${marqueNom}`
    : `${talentName} × ${marqueNom}`;

  return (
    <Html lang={isEn ? "en" : "fr"}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        {greeting ? <Text style={paragraph}>{greeting}</Text> : null}
        {paragraphs.map((p, i) => (
          <Text key={i} style={paragraph}>
            {p.split("\n").map((line, j, arr) => (
              <React.Fragment key={j}>
                {line}
                {j < arr.length - 1 ? <br /> : null}
              </React.Fragment>
            ))}
          </Text>
        ))}
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
  margin: 0,
  padding: 0,
  color: "#222222",
};

const paragraph: React.CSSProperties = {
  color: "#222222",
  fontSize: "14px",
  lineHeight: "21px",
  margin: "0 0 14px",
};

export default GiftContactMarqueEmail;
