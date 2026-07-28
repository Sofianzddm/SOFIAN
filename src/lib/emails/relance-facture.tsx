import React from "react";
import {
  Body,
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
import { AGENCE_CONFIG } from "@/lib/documents/config";

const LOGO_URL = "https://app.glowupagence.fr/Logo.png";

export type RelanceLevel = 1 | 2 | 3;
export type RelanceLocale = "fr" | "en";

interface RelanceEmailData {
  level: RelanceLevel;
  destinataireNom: string | null;
  clientNom: string;
  reference: string;
  montantTTC: number;
  devise: string;
  dateEmission: Date;
  dateEcheance: Date | null;
  joursRetard: number;
  /** Langue de l'email ("fr" par défaut) */
  locale?: RelanceLocale;
}

function normalizeRelanceLocale(locale?: string | null): RelanceLocale {
  return (locale || "").toLowerCase().startsWith("en") ? "en" : "fr";
}

function formatMoney(amount: number, devise: string, locale: RelanceLocale): string {
  const symbol = devise === "EUR" ? " €" : devise === "GBP" ? " £" : devise === "USD" ? " $" : ` ${devise}`;
  return (
    new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0) + symbol
  );
}

function formatDateLocale(d: Date, locale: RelanceLocale): string {
  return d.toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

type ToneContent = { titre: string; intro: string; corps: string; conclusion: string; ton: string };

const TONE_FR: Record<RelanceLevel, ToneContent> = {
  1: {
    titre: "Première relance — Facture en attente de règlement",
    intro:
      "Sauf erreur de notre part, le règlement de la facture ci-dessous n'a pas encore été reçu malgré le dépassement de la date d'échéance.",
    corps:
      "Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais. Si le paiement a déjà été effectué, merci de ne pas tenir compte de ce message et de nous transmettre la preuve de virement.",
    conclusion:
      "Nous restons à votre disposition pour toute question relative à cette facture.",
    ton: "Cordialement,",
  },
  2: {
    titre: "Deuxième relance — Facture impayée",
    intro:
      "Malgré notre première relance, nous constatons que la facture ci-dessous demeure impayée à ce jour.",
    corps:
      "Nous vous remercions de procéder au règlement sous 8 jours. Sans paiement de votre part dans ce délai, nous serons contraints d'engager une procédure de recouvrement avec application des pénalités de retard prévues à nos CGV (intérêts au taux légal majoré de trois fois et indemnité forfaitaire de 40 € pour frais de recouvrement).",
    conclusion:
      "Si un paiement est en cours, merci de nous adresser la preuve de virement par retour de mail.",
    ton: "Cordialement,",
  },
  3: {
    titre: "Troisième et dernière relance avant mise en recouvrement",
    intro:
      "Malgré nos relances successives, la facture ci-dessous demeure impayée. Nous vous adressons la présente en dernière relance amiable.",
    corps:
      "À défaut de règlement sous 8 jours à compter de la réception du présent courrier, et conformément aux articles L.441-10 et D.441-5 du Code de commerce, nous transférerons ce dossier à notre service contentieux et engagerons une procédure judiciaire de recouvrement. Les pénalités de retard et l'indemnité forfaitaire de 40 € seront automatiquement appliquées, ainsi que l'ensemble des frais de procédure mis à votre charge.",
    conclusion:
      "Nous restons disposés à trouver une solution amiable si vous nous contactez sans délai.",
    ton: "Bien à vous,",
  },
};

const TONE_EN: Record<RelanceLevel, ToneContent> = {
  1: {
    titre: "First reminder — Invoice awaiting payment",
    intro:
      "Unless we are mistaken, payment of the invoice below has not yet been received despite the due date having passed.",
    corps:
      "We would be grateful if you could arrange payment as soon as possible. If payment has already been made, please disregard this message and send us the proof of transfer.",
    conclusion: "We remain at your disposal for any question regarding this invoice.",
    ton: "Kind regards,",
  },
  2: {
    titre: "Second reminder — Overdue invoice",
    intro:
      "Despite our first reminder, we note that the invoice below remains unpaid to date.",
    corps:
      "We kindly ask you to settle payment within 8 days. Failing payment within this period, we will be obliged to initiate a recovery procedure with the late-payment penalties provided for in our terms and conditions (interest at three times the statutory rate and a fixed recovery-cost indemnity of €40).",
    conclusion:
      "If a payment is already in progress, please send us the proof of transfer by return email.",
    ton: "Kind regards,",
  },
  3: {
    titre: "Third and final reminder before recovery proceedings",
    intro:
      "Despite our successive reminders, the invoice below remains unpaid. We are sending this as a final amicable reminder.",
    corps:
      "Failing payment within 8 days of receipt of this letter, and in accordance with Articles L.441-10 and D.441-5 of the French Commercial Code, we will transfer this file to our litigation department and initiate legal recovery proceedings. Late-payment penalties and the fixed indemnity of €40 will be automatically applied, along with all procedural costs charged to you.",
    conclusion:
      "We remain willing to find an amicable solution if you contact us without delay.",
    ton: "Best regards,",
  },
};

const LABELS: Record<RelanceLocale, {
  client: string;
  reference: string;
  dateEmission: string;
  dateEcheance: string;
  retard: string;
  jour: (n: number) => string;
  montantDu: string;
  coordonnees: string;
  beneficiaire: string;
  referenceAIndiquer: string;
  service: string;
  factureWord: string;
}> = {
  fr: {
    client: "Client :",
    reference: "Référence facture :",
    dateEmission: "Date d'émission :",
    dateEcheance: "Date d'échéance :",
    retard: "Retard :",
    jour: (n) => `${n} jour${n > 1 ? "s" : ""}`,
    montantDu: "Montant TTC dû :",
    coordonnees: "Coordonnées bancaires :",
    beneficiaire: "Bénéficiaire :",
    referenceAIndiquer: "Référence à indiquer :",
    service: "Service Comptabilité — Glow Up Agence",
    factureWord: "Facture",
  },
  en: {
    client: "Client:",
    reference: "Invoice reference:",
    dateEmission: "Issue date:",
    dateEcheance: "Due date:",
    retard: "Overdue by:",
    jour: (n) => `${n} day${n > 1 ? "s" : ""}`,
    montantDu: "Amount due (incl. VAT):",
    coordonnees: "Bank details:",
    beneficiaire: "Beneficiary:",
    referenceAIndiquer: "Reference to quote:",
    service: "Accounting Department — Glow Up Agence",
    factureWord: "Invoice",
  },
};

export function RelanceFactureEmail({ data }: { data: RelanceEmailData }) {
  const locale = normalizeRelanceLocale(data.locale);
  const tone = (locale === "en" ? TONE_EN : TONE_FR)[data.level];
  const t = LABELS[locale];
  const subjectLine = `${tone.titre} — ${t.factureWord} ${data.reference}`;
  const echeanceLabel = data.dateEcheance ? formatDateLocale(data.dateEcheance, locale) : "—";
  const greeting = data.destinataireNom?.trim()
    ? `${locale === "en" ? "Hello" : "Bonjour"} ${data.destinataireNom.trim()},`
    : locale === "en" ? "Hello," : "Bonjour,";

  return (
    <Html lang={locale}>
      <Head />
      <Preview>{subjectLine}</Preview>
      <Body style={{ backgroundColor: "#F5EBE0", margin: 0, padding: "24px 0", fontFamily: "Arial, sans-serif" }}>
        <Container style={{ maxWidth: "640px", margin: "0 auto", padding: "0 16px" }}>
          <Section style={{ backgroundColor: "#1A1110", borderRadius: "14px 14px 0 0", padding: "20px", textAlign: "center" }}>
            <Img
              src={LOGO_URL}
              alt="Glow Up Agence"
              width={160}
              style={{ margin: "0 auto", filter: "brightness(0) invert(1)" }}
            />
          </Section>
          <Section style={{ backgroundColor: "#ffffff", borderRadius: "0 0 14px 14px", border: "1px solid #eadfcf", padding: "26px" }}>
            <Text style={{ margin: 0, fontSize: "20px", color: "#1A1110", fontFamily: "Georgia, serif", fontWeight: 700 }}>
              {tone.titre}
            </Text>
            <Text style={{ marginTop: "16px", color: "#1A1110", fontSize: "14px" }}>{greeting}</Text>
            <Text style={{ marginTop: "12px", color: "#1A1110", fontSize: "14px", lineHeight: 1.6 }}>
              {tone.intro}
            </Text>

            <Section style={{ backgroundColor: "#faf7f2", border: "1px solid #eee3d6", borderRadius: "12px", padding: "16px", marginTop: "18px" }}>
              <Text style={row}>
                <strong>{t.client}</strong> {data.clientNom}
              </Text>
              <Text style={row}>
                <strong>{t.reference}</strong> {data.reference}
              </Text>
              <Text style={row}>
                <strong>{t.dateEmission}</strong> {formatDateLocale(data.dateEmission, locale)}
              </Text>
              <Text style={row}>
                <strong>{t.dateEcheance}</strong> {echeanceLabel}
              </Text>
              <Text style={row}>
                <strong>{t.retard}</strong>{" "}
                <span style={{ color: "#b91c1c", fontWeight: 700 }}>
                  {t.jour(data.joursRetard)}
                </span>
              </Text>
              <Text style={{ ...row, marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #eee3d6" }}>
                <strong>{t.montantDu}</strong>{" "}
                <span style={{ color: "#1A1110", fontWeight: 700, fontSize: "16px" }}>
                  {formatMoney(data.montantTTC, data.devise, locale)}
                </span>
              </Text>
            </Section>

            <Text style={{ marginTop: "16px", color: "#1A1110", fontSize: "14px", lineHeight: 1.6 }}>
              {tone.corps}
            </Text>

            <Section style={{ backgroundColor: "#f8fafc", borderLeft: "3px solid #C08B8B", padding: "12px 14px", marginTop: "16px", borderRadius: "6px" }}>
              <Text style={{ margin: 0, color: "#1A1110", fontSize: "13px", lineHeight: 1.6 }}>
                <strong>{t.coordonnees}</strong>
                <br />
                {t.beneficiaire} {AGENCE_CONFIG.rib.titulaire}
                <br />
                IBAN : {AGENCE_CONFIG.rib.iban}
                <br />
                BIC : {AGENCE_CONFIG.rib.bic}
                <br />
                {t.referenceAIndiquer} <strong>{data.reference}</strong>
              </Text>
            </Section>

            <Text style={{ marginTop: "16px", color: "#1A1110", fontSize: "14px", lineHeight: 1.6 }}>
              {tone.conclusion}
            </Text>

            <Text style={{ marginTop: "20px", color: "#1A1110", fontSize: "14px" }}>
              {tone.ton}
              <br />
              <strong>{t.service}</strong>
              <br />
              {AGENCE_CONFIG.email}
            </Text>

            <Text style={{ marginTop: "20px", color: "#9ca3af", fontSize: "11px", textAlign: "center", lineHeight: 1.5 }}>
              {AGENCE_CONFIG.raisonSociale} — {AGENCE_CONFIG.adresse}, {AGENCE_CONFIG.codePostal} {AGENCE_CONFIG.ville}
              <br />
              SIRET {AGENCE_CONFIG.siret} — TVA {AGENCE_CONFIG.tva}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const row = { margin: "4px 0", color: "#1A1110", fontSize: "14px" };

export async function sendRelanceEmail(options: {
  to: string;
  cc?: string[];
  data: RelanceEmailData;
  pdfBuffer?: Buffer;
  pdfFilename?: string;
}): Promise<{ id?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY non configurée");
  }
  const resend = new Resend(key);

  const locale = normalizeRelanceLocale(options.data.locale);
  const tone = (locale === "en" ? TONE_EN : TONE_FR)[options.data.level];
  const subject = `${tone.titre} — ${LABELS[locale].factureWord} ${options.data.reference}`;
  const html = await render(<RelanceFactureEmail data={options.data} />);

  const result = (await resend.emails.send({
    from: `Comptabilité Glow Up <${AGENCE_CONFIG.email}>`,
    to: options.to,
    cc: options.cc,
    replyTo: AGENCE_CONFIG.email,
    subject,
    html,
    attachments:
      options.pdfBuffer && options.pdfFilename
        ? [
            {
              filename: options.pdfFilename,
              content: options.pdfBuffer.toString("base64"),
            },
          ]
        : undefined,
  })) as { data?: { id?: string } | null; error?: unknown };

  if (result.error) {
    throw new Error(typeof result.error === "string" ? result.error : JSON.stringify(result.error));
  }
  return { id: result.data?.id };
}
