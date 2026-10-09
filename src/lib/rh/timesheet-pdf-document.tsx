import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";
import path from "path";
import { AGENCE_CONFIG } from "@/lib/documents/config";

const COLORS = {
  ink: "#1A1110",
  muted: "#5C5654",
  line: "#E6E0DC",
  soft: "#F7F4F1",
  accent: "#B06F70",
  tea: "#E5F2B5",
  white: "#FFFFFF",
  success: "#1F6B5A",
};

const LOGO_PATH = path.join(process.cwd(), "public/logo-glowup.png");

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 42,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: COLORS.ink,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 22,
    paddingBottom: 14,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.ink,
  },
  logo: { width: 54, height: 54, marginBottom: 6 },
  brand: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  brandMeta: { fontSize: 7.5, color: COLORS.muted, lineHeight: 1.35 },
  docMeta: { alignItems: "flex-end", maxWidth: 220 },
  docTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  docRef: { fontSize: 9, fontFamily: "Helvetica-Bold", color: COLORS.accent },
  docSub: { fontSize: 8, color: COLORS.muted, marginTop: 2 },
  banner: {
    backgroundColor: COLORS.soft,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  bannerCol: { flex: 1 },
  label: {
    fontSize: 7,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  value: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  valueSoft: { fontSize: 9, color: COLORS.ink },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    marginTop: 4,
    letterSpacing: 0.3,
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: COLORS.ink,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  th: { color: COLORS.white, fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  row: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    alignItems: "center",
  },
  rowAlt: { backgroundColor: COLORS.soft },
  rowWeekend: { backgroundColor: "#F3EEF0" },
  cell: { fontSize: 8.5 },
  cellMuted: { fontSize: 8, color: COLORS.muted },
  totals: {
    marginTop: 14,
    flexDirection: "row",
    gap: 8,
  },
  totalCard: {
    flex: 1,
    backgroundColor: COLORS.soft,
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  totalCardAccent: {
    flex: 1,
    backgroundColor: COLORS.tea,
    borderRadius: 6,
    padding: 10,
  },
  noteBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
  },
  noteText: { fontSize: 8, color: COLORS.muted, lineHeight: 1.4 },
  sigBlock: {
    marginTop: 22,
    flexDirection: "row",
    gap: 14,
  },
  sigCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 8,
    padding: 12,
    minHeight: 118,
  },
  sigCardPending: {
    borderColor: COLORS.accent,
    backgroundColor: "#FBF6F6",
  },
  sigCardDone: {
    borderColor: COLORS.success,
    backgroundColor: "#F3FAF7",
  },
  sigTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sigLine: {
    marginTop: 28,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingTop: 6,
  },
  sigImg: { width: 160, height: 48, marginTop: 8, objectFit: "contain" },
  stamp: {
    marginTop: 8,
    fontSize: 7.5,
    color: COLORS.success,
    fontFamily: "Helvetica-Bold",
  },
  pending: {
    marginTop: 18,
    fontSize: 9,
    color: COLORS.accent,
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: COLORS.muted },
  legal: {
    marginTop: 14,
    fontSize: 6.5,
    color: COLORS.muted,
    lineHeight: 1.35,
  },
  legalBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 6,
    backgroundColor: COLORS.soft,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  legalTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    color: COLORS.ink,
  },
  /** Tags DocuSeal — texte quasi invisible, détectés par l’API */
  docusealTag: {
    fontSize: 8,
    color: "#FEFEFE",
  },
});

export type TimesheetPdfDay = {
  date: string; // YYYY-MM-DD
  weekday: string;
  slotsLabel: string;
  breakMinutes: number;
  totalMinutes: number;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayLabel?: string | null;
};

export type TimesheetPdfData = {
  reference: string;
  employeeName: string;
  employeeEmail: string;
  matricule: string;
  jobTitle: string;
  department: string;
  managerName?: string | null;
  weeklyHours: number;
  isoWeek: number;
  isoYear: number;
  weekStartLabel: string;
  weekEndLabel: string;
  days: TimesheetPdfDay[];
  totalMinutes: number;
  ot25Minutes: number;
  ot50Minutes: number;
  overtimeNote?: string | null;
  generatedAtLabel: string;
  /** Zone manager */
  approvedAtLabel?: string | null;
  approverName?: string | null;
  /** Zone collaborateur */
  signatureRequested: boolean;
  signed: boolean;
  signedAtLabel?: string | null;
  signatureName?: string | null;
  signatureImageDataUrl?: string | null;
};

function minsLabel(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h} h ${String(min).padStart(2, "0")}`;
}

export function TimesheetPdfDocument({ data }: { data: TimesheetPdfData }) {
  return (
    <Document
      title={`Feuille de temps S${data.isoWeek} ${data.isoYear} — ${data.employeeName}`}
      author="Glow Up Agency"
      subject="Feuille de temps — signature électronique"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={LOGO_PATH} style={styles.logo} />
            <Text style={styles.brand}>{AGENCE_CONFIG.raisonSociale}</Text>
            <Text style={styles.brandMeta}>
              {AGENCE_CONFIG.adresse}
              {"\n"}
              {AGENCE_CONFIG.codePostal} {AGENCE_CONFIG.ville}
              {"\n"}
              SIRET {AGENCE_CONFIG.siret}
            </Text>
          </View>
          <View style={styles.docMeta}>
            <Text style={styles.docTitle}>FEUILLE DE TEMPS</Text>
            <Text style={styles.docRef}>{data.reference}</Text>
            <Text style={styles.docSub}>
              Semaine {data.isoWeek} · {data.isoYear}
            </Text>
            <Text style={styles.docSub}>
              {data.weekStartLabel} → {data.weekEndLabel}
            </Text>
            <Text style={styles.docSub}>Émis le {data.generatedAtLabel}</Text>
          </View>
        </View>

        <View style={styles.banner}>
          <View style={styles.bannerCol}>
            <Text style={styles.label}>Collaborateur</Text>
            <Text style={styles.value}>{data.employeeName}</Text>
            <Text style={styles.valueSoft}>{data.employeeEmail}</Text>
          </View>
          <View style={styles.bannerCol}>
            <Text style={styles.label}>Poste</Text>
            <Text style={styles.value}>{data.jobTitle || "—"}</Text>
            <Text style={styles.valueSoft}>
              {data.department || "—"} · {data.matricule}
            </Text>
          </View>
          <View style={styles.bannerCol}>
            <Text style={styles.label}>Contrat</Text>
            <Text style={styles.value}>{data.weeklyHours} h / semaine</Text>
            <Text style={styles.valueSoft}>
              Manager · {data.managerName || "—"}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Détail de la semaine</Text>
        <View style={styles.tableHead}>
          <Text style={[styles.th, { width: "18%" }]}>Jour</Text>
          <Text style={[styles.th, { width: "38%" }]}>Créneaux</Text>
          <Text style={[styles.th, { width: "14%", textAlign: "right" }]}>
            Pause
          </Text>
          <Text style={[styles.th, { width: "14%", textAlign: "right" }]}>
            Total
          </Text>
          <Text style={[styles.th, { width: "16%", textAlign: "right" }]}>
            Statut
          </Text>
        </View>
        {data.days.map((d, i) => (
          <View
            key={d.date}
            style={[
              styles.row,
              i % 2 === 1 ? styles.rowAlt : {},
              d.isWeekend || d.isHoliday ? styles.rowWeekend : {},
            ]}
          >
            <View style={{ width: "18%" }}>
              <Text style={styles.cell}>{d.weekday}</Text>
              <Text style={styles.cellMuted}>{d.date}</Text>
            </View>
            <Text style={[styles.cell, { width: "38%" }]}>
              {d.slotsLabel || "—"}
            </Text>
            <Text style={[styles.cell, { width: "14%", textAlign: "right" }]}>
              {d.breakMinutes ? `${d.breakMinutes} min` : "—"}
            </Text>
            <Text
              style={[
                styles.cell,
                { width: "14%", textAlign: "right", fontFamily: "Helvetica-Bold" },
              ]}
            >
              {d.totalMinutes ? minsLabel(d.totalMinutes) : "—"}
            </Text>
            <Text
              style={[styles.cellMuted, { width: "16%", textAlign: "right" }]}
            >
              {d.isHoliday
                ? d.holidayLabel || "Férié"
                : d.isWeekend
                  ? "Week-end"
                  : d.totalMinutes
                    ? "Travaillé"
                    : "—"}
            </Text>
          </View>
        ))}

        <View style={styles.totals}>
          <View style={styles.totalCardAccent}>
            <Text style={styles.label}>Temps total</Text>
            <Text style={styles.value}>{minsLabel(data.totalMinutes)}</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.label}>HS 25 %</Text>
            <Text style={styles.value}>{minsLabel(data.ot25Minutes)}</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.label}>HS 50 %</Text>
            <Text style={styles.value}>{minsLabel(data.ot50Minutes)}</Text>
          </View>
        </View>

        {data.overtimeNote ? (
          <View style={styles.noteBox}>
            <Text style={styles.label}>Justification dépassement</Text>
            <Text style={styles.noteText}>{data.overtimeNote}</Text>
          </View>
        ) : null}

        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
          Validation & signature électronique
        </Text>
        <View style={styles.sigBlock}>
          <View style={[styles.sigCard, styles.sigCardDone]}>
            <Text style={styles.sigTitle}>1 · Validation manager</Text>
            <Text style={styles.valueSoft}>
              {data.approverName || data.managerName || "Manager"}
            </Text>
            <View style={styles.sigLine}>
              <Text style={styles.stamp}>
                {data.approvedAtLabel
                  ? `Validée le ${data.approvedAtLabel}`
                  : "Validée"}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.sigCard,
              data.signed ? styles.sigCardDone : styles.sigCardPending,
            ]}
          >
            <Text style={styles.sigTitle}>2 · Signature collaborateur</Text>
            {data.signed ? (
              <>
                <Text style={styles.valueSoft}>
                  {data.signatureName || data.employeeName}
                </Text>
                {data.signatureImageDataUrl ? (
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <Image
                    src={data.signatureImageDataUrl}
                    style={styles.sigImg}
                  />
                ) : (
                  <View style={styles.sigLine}>
                    <Text style={{ fontSize: 14, fontFamily: "Times-Italic" }}>
                      {data.signatureName || data.employeeName}
                    </Text>
                  </View>
                )}
                <Text style={styles.stamp}>
                  Signé électroniquement (DocuSeal)
                  {data.signedAtLabel ? ` le ${data.signedAtLabel}` : ""}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.pending}>SIGNATURE ÉLECTRONIQUE</Text>
                <Text style={[styles.noteText, { marginTop: 6 }]}>
                  Via DocuSeal — atteste l’exactitude des temps déclarés.
                </Text>
                <View style={{ marginTop: 14, minHeight: 42 }}>
                  <Text style={styles.docusealTag}>
                    {
                      "{{Signature;role=Collaborateur;type=signature;required=true}}"
                    }
                  </Text>
                </View>
                <Text style={styles.docusealTag}>
                  {"{{Date signature;role=Collaborateur;type=date}}"}
                </Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.legalBox}>
          <Text style={styles.legalTitle}>Cadre légal — Code du travail</Text>
          <Text style={styles.legal}>
            Art. L. 3171-2 — L’employeur établit les documents nécessaires au
            décompte de la durée du travail de chaque salarié.
            {"\n"}
            Art. D. 3171-8 — Enregistrement quotidien des heures de début et de
            fin de chaque période de travail, et récapitulation hebdomadaire.
            {"\n"}
            Art. L. 3171-4 — En cas de litige, l’employeur fournit les éléments
            justifiant les horaires effectivement réalisés ; un système
            d’enregistrement automatique doit être fiable et infalsifiable.
            {"\n"}
            Art. D. 3171-16 — Documents tenus à disposition de l’inspection du
            travail pendant un an.
            {"\n"}
            Signature électronique — Code civil art. 1366 et 1367 · règlement
            eIDAS (UE) n° 910/2014.
          </Text>
        </View>

        <Text style={styles.legal}>
          Document généré par Glow Up RH · signature via DocuSeal · Réf.{" "}
          {data.reference}.
        </Text>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Glow Up Agency · Feuille de temps · Confidentiel RH
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
