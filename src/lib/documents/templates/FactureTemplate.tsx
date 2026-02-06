// src/lib/documents/templates/FactureTemplate.tsx

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
  
  // Totaux
  totauxBox: {
    marginLeft: "auto",
    width: 250,
    padding: 15,
    backgroundColor: COLORS.licorice,
    borderWidth: 2,
    borderColor: COLORS.oldRose,
    borderStyle: "solid",
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
  
  // Coordonnées bancaires
  ibanBox: {
    marginTop: 25,
    padding: 15,
    backgroundColor: COLORS.teaGreen,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.licorice,
    borderLeftStyle: "solid",
  },
  
  ibanTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: COLORS.licorice,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  
  ibanText: {
    fontSize: 9,
    color: "#333333",
    lineHeight: 1.6,
  },
  
  // Pénalités et notes
  penalitesBox: {
    marginTop: 25,
    padding: 12,
    backgroundColor: "#FFF3CD",
    borderLeftWidth: 3,
    borderLeftColor: COLORS.oldRose,
    borderLeftStyle: "solid",
  },
  
  penalitesText: {
    fontSize: 7,
    color: "#856404",
    lineHeight: 1.5,
  },
  
  notesBox: {
    marginTop: 15,
  },
  
  notesLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: COLORS.licorice,
    marginBottom: 5,
  },
  
  notesText: {
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
});

// Types
interface LigneFacture {
  description: string;
  quantite: number;
  prixUnitaire: number;
  tauxTVA: number;
  totalHT: number;
}

interface FactureData {
  reference: string;
  titre: string;
  dateDocument: string;
  dateEcheance: string;
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
    iban?: string;
    bic?: string;
  };
  client: {
    nom: string;
    prenom?: string;
    adresse?: string;
    codePostal?: string;
    ville?: string;
    pays?: string;
    tva?: string;
    siret?: string;
  };
  lignes: LigneFacture[];
  montantHT: number;
  tauxTVA: number;
  montantTVA: number;
  montantTTC: number;
  mentionTVA?: string | null;
  notes?: string;
}

const formatMoney = (amount: number) => {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(amount).replace(/\u202F/g, ' ');
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export function FactureTemplate({ data }: { data: FactureData }) {
  return (
    <Document>
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
              Capital de {formatMoney(data.emetteur.capital)}
              {"\n"}
              Siret : {data.emetteur.siret}
              {"\n"}
              Tel : {data.emetteur.telephone}
              {"\n"}
              Email : {data.emetteur.email}
            </Text>
          </View>
          
          {/* Document info + Client */}
          <View style={{ width: "50%" }}>
            {/* Info document */}
            <View style={styles.documentBox}>
              <Text style={styles.documentType}>FACTURE</Text>
              <Text style={styles.documentRef}>N°{data.reference}</Text>
              <Text style={styles.documentDate}>DATE : {formatDate(data.dateDocument)}</Text>
              <Text style={styles.documentDate}>
                DATE D'ÉCHÉANCE : {formatDate(data.dateEcheance)}
              </Text>
            </View>
            
            {/* Client (Talent) */}
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
                Talent / Prestataire
              </Text>
              <Text style={{
                fontSize: 8,
                color: "#333333",
                lineHeight: 1.5
              }}>
                {data.client.prenom ? `${data.client.prenom} ${data.client.nom}` : data.client.nom}
                {"\n"}
                {data.client.adresse ? `${data.client.adresse}\n` : ""}
                {data.client.codePostal && data.client.ville ? `${data.client.codePostal} ${data.client.ville}\n` : ""}
                {data.client.pays ? `${data.client.pays}\n` : ""}
                {data.client.tva ? `TVA : ${data.client.tva}\n` : ""}
                {data.client.siret ? `SIRET : ${data.client.siret}` : ""}
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
            Objet de la facture
          </Text>
          <Text style={styles.campagneTitre}>{data.titre}</Text>
        </View>
        
        {/* Tableau header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.colDesignation]}>DÉSIGNATION</Text>
          <Text style={[styles.tableHeaderCell, styles.colQte]}>QTÉ</Text>
          <Text style={[styles.tableHeaderCell, styles.colPUHT]}>PU HT</Text>
          <Text style={[styles.tableHeaderCell, styles.colTVA]}>TVA</Text>
          <Text style={[styles.tableHeaderCell, styles.colTotalHT]}>TOTAL HT</Text>
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
            <Text style={styles.recapTVALabel}>BASE HT</Text>
            <Text style={styles.recapTVAValue}>{formatMoney(data.montantHT)}</Text>
          </View>
          <View style={styles.recapTVACol}>
            <Text style={styles.recapTVALabel}>TAUX</Text>
            <Text style={styles.recapTVAValue}>{data.tauxTVA.toFixed(2)} %</Text>
          </View>
          <View style={styles.recapTVACol}>
            <Text style={styles.recapTVALabel}>TVA</Text>
            <Text style={styles.recapTVAValue}>{formatMoney(data.montantTVA)}</Text>
          </View>
        </View>
        
        {/* Mention TVA (régime spécial) */}
        {data.mentionTVA && (
          <View style={{ 
            marginTop: 10,
            padding: 8,
            backgroundColor: "#FFF3CD",
            borderLeftWidth: 3,
            borderLeftColor: COLORS.oldRose,
            borderLeftStyle: "solid"
          }}>
            <Text style={{ 
              fontSize: 8,
              color: "#856404",
              fontWeight: "bold"
            }}>
              ℹ️ Régime de TVA : {data.mentionTVA}
            </Text>
          </View>
        )}
        
        {/* Totaux */}
        <View style={styles.totauxBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL HT</Text>
            <Text style={styles.totalValue}>{formatMoney(data.montantHT)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total TVA</Text>
            <Text style={styles.totalValue}>{formatMoney(data.montantTVA)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL TTC</Text>
            <Text style={styles.totalValue}>{formatMoney(data.montantTTC)}</Text>
          </View>
          <View style={styles.netPayerRow}>
            <Text style={styles.netPayerLabel}>NET À PAYER</Text>
            <Text style={styles.netPayerValue}>{formatMoney(data.montantTTC)}</Text>
          </View>
        </View>
        
        {/* Coordonnées bancaires */}
        {data.emetteur.iban && (
          <View style={styles.ibanBox}>
            <Text style={styles.ibanTitle}>Coordonnées bancaires pour le paiement</Text>
            <Text style={styles.ibanText}>
              IBAN : {data.emetteur.iban}
              {"\n"}
              {data.emetteur.bic && `BIC : ${data.emetteur.bic}\n`}
              {"\n"}
              Merci d'effectuer le virement avec la référence : {data.reference}
            </Text>
          </View>
        )}
        
        {/* Pénalités */}
        <View style={styles.penalitesBox}>
          <Text style={styles.penalitesText}>
            En cas de retard de paiement, application d'intérêts de 3 fois le taux légal selon la loi n°2008-776 du 4 août 2008.
            {"\n"}
            Indemnité forfaitaire pour frais de recouvrement : 40€ (article D. 441-5 du code de commerce).
            {"\n"}
            Paiement à effectuer sous 30 jours à réception de la facture.
          </Text>
        </View>
        
        {/* Notes */}
        {data.notes && (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Notes :</Text>
            <Text style={styles.notesText}>{data.notes}</Text>
          </View>
        )}
        
        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {data.emetteur.nom} - {data.emetteur.adresse} - {data.emetteur.codePostal} {data.emetteur.ville}, {data.emetteur.pays}
            {"\n"}
            N°TVA {data.emetteur.tva} - SIREN {data.emetteur.siret} - RCS {data.emetteur.rcs}
            {"\n"}
            Capital de {formatMoney(data.emetteur.capital)} - APE {data.emetteur.ape}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export type { FactureData, LigneFacture };
