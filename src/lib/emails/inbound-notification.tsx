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
import { render } from "@react-email/render";
import { Resend } from "resend";

const LOGO_URL = "https://app.glowupagence.fr/Logo.png";
const APP_URL = (process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr").replace(/\/$/, "");

type InboundCategory = "COLLAB_PAID" | "COLLAB_GIFTING" | "PRESS_KIT" | "EVENT_INVITE" | "OTHER";
type InboundPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

type InboundEmailOpportunity = {
  id: string;
  talentName: string;
  senderEmail: string;
  senderName?: string | null;
  senderDomain: string;
  subject: string;
  bodyExcerpt: string;
  category: InboundCategory;
  priority: InboundPriority;
  confidence: number;
  extractedBrand?: string | null;
  extractedBudget?: string | null;
  extractedDeadline?: string | null;
  briefSummary?: string | null;
};

export function InboundNotificationEmail({
  recipientName,
  opportunity,
}: {
  recipientName: string;
  opportunity: InboundEmailOpportunity;
}) {
  const brand = opportunity.extractedBrand || opportunity.senderDomain;
  const senderLabel = opportunity.senderName
    ? `${opportunity.senderName} <${opportunity.senderEmail}>`
    : opportunity.senderEmail;
  const excerpt =
    (opportunity.bodyExcerpt || "").slice(0, 280) +
    ((opportunity.bodyExcerpt || "").length > 280 ? "..." : "");
  const confidencePct = `${Math.round((opportunity.confidence || 0) * 100)}%`;
  const ctaUrl = `${APP_URL}/inbound/${opportunity.id}`;
  const categoryLabel: Record<InboundCategory, string> = {
    COLLAB_PAID: "Collab payee",
    COLLAB_GIFTING: "Gifting",
    PRESS_KIT: "Press kit",
    EVENT_INVITE: "Event invite",
    OTHER: "Autre",
  };

  return (
    <Html lang="fr">
      <Head />
      <Preview>{`Nouvelle opportunite inbound: ${brand} -> ${opportunity.talentName}`}</Preview>
      <Body style={{ backgroundColor: "#F5EBE0", margin: 0, padding: "24px 0", fontFamily: "Arial, sans-serif" }}>
        <Container style={{ maxWidth: "620px", margin: "0 auto", padding: "0 16px" }}>
          <Section style={{ backgroundColor: "#1A1110", borderRadius: "14px 14px 0 0", padding: "20px", textAlign: "center" }}>
            <Img src={LOGO_URL} alt="Glow Up" width={160} style={{ margin: "0 auto", filter: "brightness(0) invert(1)" }} />
          </Section>
          <Section style={{ backgroundColor: "#ffffff", borderRadius: "0 0 14px 14px", border: "1px solid #eadfcf", padding: "22px" }}>
            <Text style={{ margin: 0, fontSize: "22px", color: "#1A1110", fontFamily: "Georgia, serif", fontWeight: 700 }}>
              📬 Nouvelle opportunite detectee
            </Text>
            <Text style={{ marginTop: "8px", color: "#6b7280", fontSize: "14px" }}>
              Une marque a contacte un de nos talents.
            </Text>
            <Section style={{ backgroundColor: "#faf7f2", border: "1px solid #eee3d6", borderRadius: "12px", padding: "14px", marginTop: "14px" }}>
              <Text style={row}><strong>👤 Talent contacte:</strong> {opportunity.talentName}</Text>
              <Text style={row}><strong>🏢 Marque:</strong> {brand}</Text>
              <Text style={row}><strong>📧 De:</strong> {senderLabel}</Text>
              <Text style={row}><strong>📝 Sujet:</strong> {opportunity.subject}</Text>
              <Text style={row}><strong>🎯 Categorie:</strong> {categoryLabel[opportunity.category]}</Text>
              <Text style={row}><strong>⚡ Priorite:</strong> {opportunity.priority}</Text>
              <Text style={row}><strong>🤖 Confiance IA:</strong> {confidencePct}</Text>
            </Section>
            {opportunity.briefSummary ? <Text style={row}><strong>💼 Brief:</strong> {opportunity.briefSummary}</Text> : null}
            {opportunity.extractedBudget ? <Text style={row}><strong>💰 Budget:</strong> {opportunity.extractedBudget}</Text> : null}
            {opportunity.extractedDeadline ? <Text style={row}><strong>📅 Deadline:</strong> {opportunity.extractedDeadline}</Text> : null}
            <Section style={{ backgroundColor: "#f8fafc", borderLeft: "3px solid #C08B8B", padding: "10px 12px", marginTop: "14px", borderRadius: "6px" }}>
              <Text style={{ margin: 0, color: "#6b7280", fontStyle: "italic", fontSize: "13px" }}>{excerpt}</Text>
            </Section>
            <Section style={{ textAlign: "center", marginTop: "18px" }}>
              <Button href={ctaUrl} style={{ backgroundColor: "#C8F285", color: "#1A1110", textDecoration: "none", padding: "12px 20px", borderRadius: "10px", fontWeight: 700 }}>
                Voir l'opportunite
              </Button>
            </Section>
            <Text style={{ marginTop: "18px", color: "#9ca3af", fontSize: "12px", textAlign: "center" }}>
              Glow Up Agence - 1330 avenue Jean-Rene Guillibert Gautier de La Lauziere, Aix-en-Provence
            </Text>
            <Text style={{ marginTop: "4px", color: "#9ca3af", fontSize: "12px", textAlign: "center" }}>
              Bonjour {recipientName}, cette notification est envoyee automatiquement.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const row = { margin: "4px 0", color: "#1A1110", fontSize: "14px" };

export async function sendInboundNotificationEmail({
  to,
  recipientName,
  opportunity,
}: {
  to: string;
  recipientName: string;
  opportunity: InboundEmailOpportunity;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const resend = new Resend(key);
  const brand = opportunity.extractedBrand || opportunity.senderDomain;
  const html = await render(
    <InboundNotificationEmail recipientName={recipientName} opportunity={opportunity} />
  );
  await resend.emails.send({
    from: "Glow Up Platform <notifications@glowupagence.fr>",
    to,
    subject: `📬 [Inbound] ${brand} a contacte ${opportunity.talentName}`,
    html,
  });
}
