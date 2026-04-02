import React from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
  Link,
} from "@react-email/components";

type PrimeSubmittedEmailProps = {
  prenomEmploye: string;
  moisLabel: string;
  annee: number;
  totalLignes: string;
  primeCA: string;
  totalGeneral: string;
  adminUrl: string;
};

export function PrimeSubmittedEmail({
  prenomEmploye,
  moisLabel,
  annee,
  totalLignes,
  primeCA,
  totalGeneral,
  adminUrl,
}: PrimeSubmittedEmailProps) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>{`[Glow Up] Primes soumises – ${prenomEmploye} – ${moisLabel} ${annee}`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Text style={headerTitle}>Glow Up - Primes & Rémunération</Text>
          </Section>
          <Section style={card}>
            <Text style={title}>Soumission de primes</Text>
            <Text style={line}>
              <strong>Employé :</strong> {prenomEmploye}
            </Text>
            <Text style={line}>
              <strong>Période :</strong> {moisLabel} {annee}
            </Text>
            <Text style={line}>
              <strong>Total lignes :</strong> {totalLignes}
            </Text>
            <Text style={line}>
              <strong>Prime CA :</strong> {primeCA}
            </Text>
            <Text style={line}>
              <strong>Total général :</strong> {totalGeneral}
            </Text>
            <Hr style={hr} />
            <Link href={adminUrl} style={cta}>
              Ouvrir /admin/primes
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  margin: 0,
  backgroundColor: "#F5EBE0",
  fontFamily: "Arial, sans-serif",
};
const container = { maxWidth: "620px", margin: "0 auto", padding: "20px" };
const header = { backgroundColor: "#1A1110", padding: "18px 20px", borderRadius: "12px 12px 0 0" };
const headerTitle = { margin: 0, color: "#F5EBE0", fontSize: "16px", fontWeight: 700 };
const card = {
  backgroundColor: "#FFFFFF",
  border: "1px solid #EEDFD1",
  borderTop: "none",
  borderRadius: "0 0 12px 12px",
  padding: "20px",
};
const title = { margin: "0 0 12px", color: "#1A1110", fontSize: "18px", fontWeight: 700 };
const line = { margin: "0 0 8px", color: "#1A1110", fontSize: "14px" };
const hr = { borderColor: "#EEDFD1", margin: "16px 0" };
const cta = {
  display: "inline-block",
  backgroundColor: "#C8F285",
  color: "#1A1110",
  padding: "10px 14px",
  borderRadius: "10px",
  textDecoration: "none",
  fontWeight: 700,
};

