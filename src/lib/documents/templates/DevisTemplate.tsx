// src/lib/documents/templates/DevisTemplate.tsx

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
import { formatMontant, getDeviseInfo } from "@/lib/devises";
import {
  getDocLabels,
  normalizeLocale,
  intlLocale,
  translateMentionTVA,
  translateModePaiement,
  getCGVClauses,
  getCGVFooter,
  type DocLocale,
} from "@/lib/documents/i18n";

// Couleurs Glow Up Agency
const COLORS = {
  licorice: "#220101",   // Marron très foncé
  oldRose: "#B06F70",    // Rose poudré
  teaGreen: "#E5F2B5",   // Vert clair
  oldLace: "#F5EDEO",    // Beige clair
};

// Chemin vers le logo PNG
const LOGO_PATH = path.join(process.cwd(), 'public/logo-glowup.png');

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 9,
    fontFamily: "Helvetica",
    backgroundColor: "#FFFFFF",
  },
  
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 25,
    paddingBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.licorice,
    borderBottomStyle: "solid",
  },
  
  emetteurBox: {
    width: "50%",
  },
  
  logo: {
    width: 80,
    height: 80,
    marginBottom: 10,
  },
  
  emetteurNom: {
    fontSize: 11,
    fontWeight: "bold",
    color: COLORS.licorice,
    marginBottom: 3,
  },
  
  emetteurText: {
    fontSize: 8,
    color: "#333333",
    lineHeight: 1.4,
  },
  
  documentBox: {
    textAlign: "right",
  },
  
  documentType: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.licorice,
    marginBottom: 5,
  },
  
  documentRef: {
    fontSize: 10,
    color: COLORS.licorice,
    marginBottom: 2,
  },
  
  documentDate: {
    fontSize: 9,
    color: "#333333",
    marginBottom: 2,
  },
  
  // Client (désormais dans le header)
  // Pas besoin de styles spécifiques, géré inline
  
  // Titre campagne
  campagneTitre: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.licorice,
    marginBottom: 15,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.oldRose,
    borderBottomStyle: "solid",
  },
  
  // Tableau principal
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.licorice,
    padding: 8,
    marginBottom: 2,
  },
  
  tableHeaderCell: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  
  tableRow: {
    flexDirection: "row",
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
    borderBottomStyle: "solid",
    minHeight: 40,
  },
  
  tableCell: {
    fontSize: 9,
    color: "#000000",
  },
  
  colDesignation: { width: "50%" },
  colQte: { width: "10%", textAlign: "center" },
  colPUHT: { width: "15%", textAlign: "right" },
  colTVA: { width: "10%", textAlign: "center" },
  colTotalHT: { width: "15%", textAlign: "right" },
  
  // Récap TVA
  recapTVA: {
    flexDirection: "row",
    backgroundColor: COLORS.teaGreen,
    padding: 10,
    marginTop: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.licorice,
    borderStyle: "solid",
  },
  
  recapTVACol: {
    flex: 1,
    textAlign: "center",
  },
  
  recapTVALabel: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#000000",
    marginBottom: 4,
  },
  
  recapTVAValue: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#000000",
  },
  
  // Section signature
  signatureSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 20,
  },
  
  paiementBox: {
    width: "45%",
  },
  
  signatureBox: {
    width: "45%",
    borderWidth: 1,
    borderColor: COLORS.oldRose,
    borderStyle: "solid",
    padding: 10,
    minHeight: 80,
  },
  
  signatureLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: COLORS.licorice,
    marginBottom: 5,
  },
  
  signatureText: {
    fontSize: 8,
    color: "#666666",
  },
  
  // Totaux (wrap: false en JSX pour ne jamais couper le carré entre deux pages)
  totauxBox: {
    marginLeft: "auto",
    width: 250,
    padding: 15,
    backgroundColor: COLORS.licorice,
    borderWidth: 2,
    borderColor: COLORS.oldRose,
    borderStyle: "solid",
  },
  totauxWrapper: {
    // Conteneur pour garder le carré d'un bloc (remonte si coupé)
    marginTop: 10,
    marginBottom: 5,
  },
  
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  
  totalLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  
  totalValue: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  
  netPayerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 2,
    borderTopColor: COLORS.oldRose,
    borderTopStyle: "solid",
  },
  
  netPayerLabel: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  
  netPayerValue: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  
  // Pénalités et commentaires
  penalitesBox: {
    marginTop: 25,
    padding: 12,
    backgroundColor: COLORS.teaGreen,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.licorice,
    borderLeftStyle: "solid",
  },
  
  penalitesText: {
    fontSize: 7,
    color: "#666666",
    lineHeight: 1.5,
  },
  
  commentairesBox: {
    marginTop: 15,
  },
  
  commentairesLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: COLORS.licorice,
    marginBottom: 5,
  },
  
  commentairesText: {
    fontSize: 8,
    color: "#666666",
    fontStyle: "italic",
  },
  
  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 30,
    right: 30,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.oldRose,
    borderTopStyle: "solid",
  },
  
  footerText: {
    fontSize: 7,
    color: "#666666",
    textAlign: "center",
    lineHeight: 1.4,
  },
  
  pageNumber: {
    fontSize: 8,
    color: "#999999",
    textAlign: "right",
    marginTop: 5,
  },
  
  // Page CGV
  cgvPage: {
    padding: 30,
    fontSize: 8,
  },
  
  cgvTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.licorice,
    marginBottom: 20,
    textAlign: "center",
  },
  
  cgvClause: {
    marginBottom: 15,
  },
  
  cgvClauseTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: COLORS.licorice,
    marginBottom: 5,
  },
  
  cgvClauseText: {
    fontSize: 8,
    color: "#333333",
    lineHeight: 1.6,
    textAlign: "justify",
  },
});

// Types
interface LigneDevis {
  description: string;
  quantite: number;
  prixUnitaire: number;
  tauxTVA: number;
  totalHT: number;
}

interface DevisData {
  reference: string;
  titre: string;
  dateDocument: string;
  dateEcheance: string;
  // Code ISO 4217 de la devise (EUR par défaut)
  devise?: string;
  emetteur: {
    nom: string;
    adresse: string;
    codePostal: string;
    ville: string;
    pays: string;
    capital: number;
    siret: string;
    telephone: string;
    email: string;
    tva: string;
    siren: string;
    rcs: string;
    ape: string;
  };
  client: {
    nom: string;
    adresse?: string;
    codePostal?: string;
    ville?: string;
    pays?: string;
    tva?: string;
    siret?: string;
    attention?: string;
  };
  lignes: LigneDevis[];
  montantHT: number;
  tauxTVA: number;
  montantTVA: number;
  montantTTC: number;
  modePaiement: string;
  mentionTVA?: string | null;
  typeTVA?: string;
  commentaires?: string;
  /** Inclure les pages CGV (défaut true) */
  inclureCgv?: boolean;
  /** Langue du document ("fr" par défaut, "en" pour une version anglaise) */
  locale?: DocLocale | string;
}

export function DevisTemplate({ data }: { data: DevisData }) {
  const locale = normalizeLocale(data.locale);
  const t = getDocLabels(locale);
  const dateLocale = intlLocale(locale);
  const devise = getDeviseInfo(data.devise).code;
  const formatMoney = (amount: number) => formatMontant(amount, devise, dateLocale);
  // Le capital social est toujours libellé en EUR (siège France), peu importe
  // la devise du devis.
  const formatMoneyEUR = (amount: number) => formatMontant(amount, "EUR", dateLocale);
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(dateLocale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };
  const inclureCgv = data.inclureCgv !== false;
  const totalPages = inclureCgv ? 3 : 1;
  const cgvClauses = getCGVClauses(locale);
  const cgvFooter = getCGVFooter(locale);
  const cgvClausesPage2 = cgvClauses.slice(0, 6);
  const cgvClausesPage3 = cgvClauses.slice(6);
  return (
    <Document>
      {/* PAGE 1 : Devis */}
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {/* Émetteur avec Logo */}
          <View style={styles.emetteurBox}>
            <Image src={LOGO_PATH} style={styles.logo} />
            <Text style={styles.emetteurNom}>{data.emetteur.nom}</Text>
            <Text style={styles.emetteurText}>
              {data.emetteur.adresse.split(" - ").join("\n")}
              {"\n"}
              {data.emetteur.codePostal} {data.emetteur.ville} - {data.emetteur.pays}
              {"\n\n"}
              {t.capitalDe(formatMoneyEUR(data.emetteur.capital))}
              {"\n"}
              {t.siret} {data.emetteur.siret}
              {"\n"}
              {t.tel} {data.emetteur.telephone}
              {"\n"}
              {t.email} {data.emetteur.email}
            </Text>
          </View>
          
          {/* Document info + Client */}
          <View style={{ width: "50%" }}>
            {/* Info document */}
            <View style={styles.documentBox}>
              <Text style={styles.documentType}>{t.documentType("DEVIS")}</Text>
              <Text style={styles.documentRef}>{t.refPrefix}{data.reference}</Text>
              <Text style={styles.documentDate}>{t.date} {formatDate(data.dateDocument)}</Text>
              <Text style={styles.documentDate}>
                {t.dueDate} {formatDate(data.dateEcheance)}
              </Text>
            </View>
            
            {/* Client (sous les dates) */}
            <View style={{ 
              marginTop: 15,
              padding: 10,
              backgroundColor: "#F9FAFB",
              borderLeftWidth: 3,
              borderLeftColor: COLORS.oldRose,
              borderLeftStyle: "solid"
            }}>
              <Text style={{
                fontSize: 8,
                fontWeight: "bold",
                color: COLORS.licorice,
                marginBottom: 5,
                textTransform: "uppercase",
                letterSpacing: 0.5
              }}>
                {t.client}
              </Text>
              <Text style={{
                fontSize: 8,
                color: "#333333",
                lineHeight: 1.5
              }}>
                {data.client.nom}
                {"\n"}
                {data.client.attention ? `${data.client.attention}\n` : ""}
                {data.client.adresse ? `${data.client.adresse}\n` : ""}
                {data.client.codePostal && data.client.ville ? `${data.client.codePostal} ${data.client.ville}\n` : ""}
                {data.client.pays ? `${data.client.pays}\n` : ""}
                {data.client.tva ? `${t.vat} ${data.client.tva}\n` : ""}
                {data.client.siret ? `${t.siretShort} ${data.client.siret}` : ""}
              </Text>
            </View>
          </View>
        </View>
        
        {/* Section Objet */}
        <View style={{ marginBottom: 15 }}>
          <Text style={{
            fontSize: 9,
            fontWeight: "bold",
            color: COLORS.licorice,
            marginBottom: 5,
            textTransform: "uppercase",
            letterSpacing: 0.5
          }}>
            {t.objet("DEVIS")}
          </Text>
          <Text style={styles.campagneTitre}>{data.titre}</Text>
        </View>
        
        {/* Tableau header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.colDesignation]}>{t.colDesignation}</Text>
          <Text style={[styles.tableHeaderCell, styles.colQte]}>{t.colQte}</Text>
          <Text style={[styles.tableHeaderCell, styles.colPUHT]}>{t.colPUHT}</Text>
          <Text style={[styles.tableHeaderCell, styles.colTVA]}>{t.colTVA}</Text>
          <Text style={[styles.tableHeaderCell, styles.colTotalHT]}>{t.colTotalHT}</Text>
        </View>
        
        {/* Lignes */}
        {data.lignes.map((ligne, index) => (
          <View key={index} style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.colDesignation]}>{ligne.description}</Text>
            <Text style={[styles.tableCell, styles.colQte]}>{ligne.quantite.toFixed(2)}</Text>
            <Text style={[styles.tableCell, styles.colPUHT]}>{formatMoney(ligne.prixUnitaire)}</Text>
            <Text style={[styles.tableCell, styles.colTVA]}>{ligne.tauxTVA.toFixed(2)} %</Text>
            <Text style={[styles.tableCell, styles.colTotalHT]}>{formatMoney(ligne.totalHT)}</Text>
          </View>
        ))}
        
        {/* Récap TVA */}
        <View style={styles.recapTVA}>
          <View style={styles.recapTVACol}>
            <Text style={styles.recapTVALabel}>{t.baseHT}</Text>
            <Text style={styles.recapTVAValue}>{formatMoney(data.montantHT)}</Text>
          </View>
          <View style={styles.recapTVACol}>
            <Text style={styles.recapTVALabel}>{t.taux}</Text>
            <Text style={styles.recapTVAValue}>{data.tauxTVA.toFixed(2)} %</Text>
          </View>
          <View style={styles.recapTVACol}>
            <Text style={styles.recapTVALabel}>{t.tvaShort}</Text>
            <Text style={styles.recapTVAValue}>{formatMoney(data.montantTVA)}</Text>
          </View>
        </View>
        
        {/* Mention TVA (régime spécial) */}
        {data.mentionTVA && (
          <View
            style={{
              marginTop: 10,
              padding: 8,
              backgroundColor: "#FFF3CD",
              borderLeftWidth: 3,
              borderLeftColor: COLORS.oldRose,
              borderLeftStyle: "solid",
            }}
          >
            <Text
              style={{
                fontSize: 8,
                color: "#856404",
                fontWeight: "bold",
              }}
            >
              {t.regimeTVA} {translateMentionTVA(data.mentionTVA, locale)}
            </Text>
          </View>
        )}
        
        {/* Totaux (carré remonté : juste après récap TVA, jamais coupé entre deux pages) */}
        <View style={styles.totauxWrapper} wrap={false}>
          <View style={styles.totauxBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t.totalHT}</Text>
              <Text style={styles.totalValue}>{formatMoney(data.montantHT)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t.totalTVA}</Text>
              <Text style={styles.totalValue}>{formatMoney(data.montantTVA)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t.totalTTC}</Text>
              <Text style={styles.totalValue}>{formatMoney(data.montantTTC)}</Text>
            </View>
            <View style={styles.netPayerRow}>
              <Text style={styles.netPayerLabel}>{t.netAPayer}</Text>
              <Text style={styles.netPayerValue}>{formatMoney(data.montantTTC)}</Text>
            </View>
          </View>
        </View>
        
        {/* Section Conditions */}
        <View style={{ 
          marginTop: 15,
          marginBottom: 10,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: "#E5E7EB",
          borderTopStyle: "solid"
        }}>
          <Text style={{
            fontSize: 9,
            fontWeight: "bold",
            color: COLORS.licorice,
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: 0.5
          }}>
            {t.conditionsPaiement}
          </Text>
          <Text style={{
            fontSize: 8,
            color: "#333333",
            marginBottom: 5
          }}>
            {t.modePaiement} {translateModePaiement(data.modePaiement, locale)}
          </Text>
          <Text
            style={{
              fontSize: 8,
              color: "#333333",
            }}
          >
            {t.echeance} {formatDate(data.dateEcheance)}
          </Text>
        </View>
        
        {/* Signature section (non coupée entre deux pages) */}
        <View style={styles.signatureSection} wrap={false}>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureLabel}>{t.bonPourAccord}</Text>
            <Text style={styles.signatureText}>{t.signatureClient}</Text>
          </View>
        </View>
        
        {/* Pénalités */}
        <View style={styles.penalitesBox}>
          <Text style={styles.penalitesText}>{t.penalitesDevis}</Text>
        </View>
        
        {/* Commentaires */}
        {data.commentaires && (
          <View style={styles.commentairesBox}>
            <Text style={styles.commentairesLabel}>{t.commentaires}</Text>
            <Text style={styles.commentairesText}>{data.commentaires}</Text>
          </View>
        )}
        
        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {data.emetteur.nom} - {data.emetteur.adresse} - {data.emetteur.codePostal} {data.emetteur.ville}, {data.emetteur.pays}
            {"\n"}
            {t.footerTVA} {data.emetteur.tva} - {t.footerSIREN} {data.emetteur.siret} - {t.footerRCS} {data.emetteur.rcs}
            {"\n"}
            {t.footerCapital(formatMoneyEUR(data.emetteur.capital))} - {t.footerAPE} {data.emetteur.ape}
          </Text>
          <Text style={styles.pageNumber}>1/{totalPages}</Text>
        </View>
      </Page>
      
      {/* PAGE 2 : CGV (optionnelles) */}
      {inclureCgv ? (
      <Page size="A4" style={styles.cgvPage}>
        <Text style={styles.cgvTitle}>{t.cgvTitle}</Text>

        {cgvClausesPage2.map((clause, index) => (
          <View key={index} style={styles.cgvClause}>
            <Text style={styles.cgvClauseTitle}>{clause.title}</Text>
            <Text style={styles.cgvClauseText}>{clause.text}</Text>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {data.emetteur.nom} - {data.emetteur.adresse} - {data.emetteur.codePostal} {data.emetteur.ville}, {data.emetteur.pays}
            {"\n"}
            {t.footerTVA} {data.emetteur.tva} - {t.footerSIREN} {data.emetteur.siret} - {t.footerRCS} {data.emetteur.rcs}
            {"\n"}
            {t.footerCapital(formatMoneyEUR(data.emetteur.capital))} - {t.footerAPE} {data.emetteur.ape}
          </Text>
          <Text style={styles.pageNumber}>2/3</Text>
        </View>
      </Page>
      ) : null}

      {/* PAGE 3 : CGV (suite) */}
      {inclureCgv ? (
      <Page size="A4" style={styles.cgvPage}>
        {cgvClausesPage3.map((clause, index) => (
          <View key={index} style={styles.cgvClause}>
            <Text style={styles.cgvClauseTitle}>{clause.title}</Text>
            <Text style={styles.cgvClauseText}>{clause.text}</Text>
          </View>
        ))}

        <Text style={[styles.cgvClauseText, { marginTop: 20, textAlign: "center", fontStyle: "italic" }]}>
          {cgvFooter.faitA}
          {"\n\n"}
          ---
          {"\n\n"}
          {cgvFooter.valid}
        </Text>
        
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {data.emetteur.nom} - {data.emetteur.adresse} - {data.emetteur.codePostal} {data.emetteur.ville}, {data.emetteur.pays}
            {"\n"}
            {t.footerTVA} {data.emetteur.tva} - {t.footerSIREN} {data.emetteur.siret} - {t.footerRCS} {data.emetteur.rcs}
            {"\n"}
            {t.footerCapital(formatMoneyEUR(data.emetteur.capital))} - {t.footerAPE} {data.emetteur.ape}
          </Text>
          <Text style={styles.pageNumber}>3/3</Text>
        </View>
      </Page>
      ) : null}
    </Document>
  );
}

export type { DevisData, LigneDevis };
