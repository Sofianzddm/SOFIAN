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

type PrimeDecisionEmailProps = {
  prenomEmploye: string;
  statut: "VALIDE" | "REFUSE";
  moisLabel: string;
  annee: number;
  totalLignes: string;
  primeCA: string;
  totalGeneral: string;
  commentaireAdmin?: string;
  primesUrl: string;
};

export function PrimeDecisionEmail({
  prenomEmploye,
  statut,
  moisLabel,
  annee,
  totalLignes,
  primeCA,
  totalGeneral,
  commentaireAdmin,
  primesUrl,
}: PrimeDecisionEmailProps) {
  const isValide = statut === "VALIDE";
  const statutLabel = isValide ? "validées" : "refusées";
  const preview = `[Glow Up] Primes ${statutLabel} – ${moisLabel} ${annee}`;

  return (
    <Html lang="fr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Text style={headerTitle}>Glow Up - Primes & Rémunération</Text>
          </Section>
          <Section style={card}>
            <Text style={title}>
              Vos primes ont été {statutLabel}
            </Text>
            <Section style={isValide ? badgeValide : badgeRefuse}>
              <Text style={badgeText}>{isValide ? "✓ VALIDÉ" : "✕ REFUSÉ"}</Text>
            </Section>
            <Text style={line}>
              Bonjour {prenomEmploye},
            </Text>
            <Text style={line}>
              {isValide
                ? `Vos primes pour ${moisLabel} ${annee} ont été validées par l'administration.`
                : `Vos primes pour ${moisLabel} ${annee} ont été refusées par l'administration.`}
            </Text>
            <Hr style={hr} />
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
            {!isValide && commentaireAdmin ? (
              <>
                <Hr style={hr} />
                <Text style={line}>
                  <strong>Motif du refus :</strong>
                </Text>
                <Text style={comment}>{commentaireAdmin}</Text>
              </>
            ) : null}
            <Hr style={hr} />
            <Link href={primesUrl} style={cta}>
              Voir mes primes
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
const badgeValide = {
  backgroundColor: "#C8F285",
  borderRadius: "8px",
  padding: "8px 12px",
  margin: "0 0 16px",
  display: "inline-block",
};
const badgeRefuse = {
  backgroundColor: "#F2C8C8",
  borderRadius: "8px",
  padding: "8px 12px",
  margin: "0 0 16px",
  display: "inline-block",
};
const badgeText = { margin: 0, color: "#1A1110", fontSize: "13px", fontWeight: 700 };
const comment = {
  margin: "0 0 8px",
  color: "#1A1110",
  fontSize: "14px",
  fontStyle: "italic",
  backgroundColor: "#F5EBE0",
  padding: "10px 12px",
  borderRadius: "8px",
};
const cta = {
  display: "inline-block",
  backgroundColor: "#C8F285",
  color: "#1A1110",
  padding: "10px 14px",
  borderRadius: "10px",
  textDecoration: "none",
  fontWeight: 700,
};
