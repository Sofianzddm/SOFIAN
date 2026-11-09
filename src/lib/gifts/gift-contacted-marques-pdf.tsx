import path from "path";
import React from "react";
import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { AGENCE_CONFIG } from "@/lib/documents/config";

/** Même palette que la feuille de temps RH. */
const COLORS = {
  ink: "#1A1110",
  muted: "#5C5654",
  line: "#E6E0DC",
  soft: "#F7F4F1",
  accent: "#B06F70",
  tea: "#E5F2B5",
  white: "#FFFFFF",
};

const LOGO_PATH = path.join(process.cwd(), "public/logo-glowup-black.png");

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
  logo: { width: 128, height: 22, marginBottom: 8, objectFit: "contain" },
  brand: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  brandMeta: { fontSize: 7.5, color: COLORS.muted, lineHeight: 1.35 },
  docMeta: { alignItems: "flex-end", maxWidth: 240 },
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
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    alignItems: "center",
  },
  rowAlt: { backgroundColor: COLORS.soft },
  cell: { fontSize: 9.5 },
  cellBold: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  cellMuted: { fontSize: 8, color: COLORS.muted },
  summary: {
    marginTop: 14,
    flexDirection: "row",
    gap: 8,
  },
  summaryCard: {
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
});

export type GiftContactedMarquesPdfProps = {
  talentName: string;
  reference: string;
  typeGiftLabel: string;
  marqueNoms: string[];
  generatedAt: Date;
};

function formatFrDate(d: Date) {
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function GiftContactedMarquesPdfDocument({
  talentName,
  reference,
  typeGiftLabel,
  marqueNoms,
  generatedAt,
}: GiftContactedMarquesPdfProps) {
  return (
    <Document
      title={`Sélection de marques — ${talentName}`}
      author="Glow Up Agency"
      subject={`Sélection de marques pour ${talentName}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
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
            <Text style={styles.docTitle}>SÉLECTION DE MARQUES</Text>
            <Text style={styles.docRef}>{reference}</Text>
            <Text style={styles.docSub}>Pour {talentName}</Text>
            <Text style={styles.docSub}>Émis le {formatFrDate(generatedAt)}</Text>
          </View>
        </View>

        <View style={styles.banner}>
          <View style={styles.bannerCol}>
            <Text style={styles.label}>Talent</Text>
            <Text style={styles.value}>{talentName}</Text>
          </View>
          <View style={styles.bannerCol}>
            <Text style={styles.label}>Référence</Text>
            <Text style={styles.value}>{reference}</Text>
            <Text style={styles.valueSoft}>{typeGiftLabel}</Text>
          </View>
          <View style={styles.bannerCol}>
            <Text style={styles.label}>Marques</Text>
            <Text style={styles.value}>{marqueNoms.length}</Text>
            <Text style={styles.valueSoft}>
              sélectionnée{marqueNoms.length > 1 ? "s" : ""}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Liste des marques</Text>
        <View style={styles.tableHead}>
          <Text style={[styles.th, { width: "12%" }]}>N°</Text>
          <Text style={[styles.th, { width: "88%" }]}>Marque</Text>
        </View>
        {marqueNoms.map((nom, i) => (
          <View
            key={`${nom}-${i}`}
            style={[styles.row, i % 2 === 1 ? styles.rowAlt : {}]}
            wrap={false}
          >
            <Text style={[styles.cellMuted, { width: "12%" }]}>
              {String(i + 1).padStart(2, "0")}
            </Text>
            <Text style={[styles.cellBold, { width: "88%" }]}>{nom}</Text>
          </View>
        ))}

        <View style={styles.summary}>
          <View style={styles.summaryCard}>
            <Text style={styles.label}>Total</Text>
            <Text style={styles.value}>
              {marqueNoms.length} marque{marqueNoms.length > 1 ? "s" : ""}
            </Text>
          </View>
        </View>

        <View style={styles.noteBox}>
          <Text style={styles.label}>Note</Text>
          <Text style={styles.noteText}>
            Sélection de marques préparée par Glow Up Agency dans le cadre de ta
            demande gift. Document destiné au talent.
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Glow Up Agency · Sélection de marques · {reference}
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
