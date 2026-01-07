// src/lib/documents/templates/FactureTemplate.tsx

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  logo: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1a1a1a",
  },
  logoSubtitle: {
    fontSize: 10,
    color: "#666666",
    marginTop: 2,
  },
  documentInfo: {
    textAlign: "right",
  },
  documentType: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  documentRef: {
    fontSize: 12,
    color: "#666666",
  },
  parties: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  partyBox: {
    width: "45%",
  },
  partyTitle: {
    fontSize: 8,
    color: "#999999",
    textTransform: "uppercase",
    marginBottom: 6,
    letterSpacing: 1,
  },
  partyName: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  partyAddress: {
    fontSize: 10,
    color: "#666666",
    lineHeight: 1.4,
  },
  infoGrid: {
    flexDirection: "row",
    backgroundColor: "#f8f8f8",
    padding: 15,
    borderRadius: 4,
    marginBottom: 25,
  },
  infoItem: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 8,
    color: "#999999",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 11,
    color: "#1a1a1a",
    fontWeight: "bold",
  },
  collabTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
    borderBottomStyle: "solid",
  },
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#1a1a1a",
    padding: 10,
    borderRadius: 4,
  },
  tableHeaderCell: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
    borderBottomStyle: "solid",
  },
  tableRowAlt: {
    flexDirection: "row",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
    borderBottomStyle: "solid",
    backgroundColor: "#fafafa",
  },
  tableCell: {
    fontSize: 10,
    color: "#333333",
  },
  colDescription: { width: "45%" },
  colQuantite: { width: "10%", textAlign: "center" },
  colPrixUnit: { width: "20%", textAlign: "right" },
  colTVA: { width: "10%", textAlign: "center" },
  colTotal: { width: "15%", textAlign: "right" },
  totalsContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
  },
  totalsBox: {
    width: 250,
    backgroundColor: "#f8f8f8",
    padding: 15,
    borderRadius: 4,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 10,
    color: "#666666",
  },
  totalValue: {
    fontSize: 10,
    color: "#1a1a1a",
    fontWeight: "bold",
  },
  totalTTCRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 2,
    borderTopColor: "#1a1a1a",
    borderTopStyle: "solid",
  },
  totalTTCLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1a1a1a",
  },
  totalTTCValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1a1a1a",
  },
  mentionsTVA: {
    fontSize: 9,
    color: "#666666",
    marginTop: 20,
    fontStyle: "italic",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
  },
  footerDivider: {
    borderTopWidth: 1,
    borderTopColor: "#eeeeee",
    borderTopStyle: "solid",
    marginBottom: 15,
  },
  footerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerSection: {
    width: "30%",
  },
  footerTitle: {
    fontSize: 8,
    color: "#999999",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  footerText: {
    fontSize: 9,
    color: "#666666",
    lineHeight: 1.4,
  },
  ribBox: {
    marginTop: 30,
    padding: 15,
    backgroundColor: "#f8f8f8",
    borderRadius: 4,
  },
  ribTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 10,
  },
  ribRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  ribLabel: {
    width: 60,
    fontSize: 9,
    color: "#999999",
  },
  ribValue: {
    fontSize: 9,
    color: "#333333",
    fontFamily: "Courier",
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
  type: "DEVIS" | "FACTURE" | "AVOIR" | "BON_DE_COMMANDE";
  reference: string;
  titre: string;
  dateDocument: string;
  dateEcheance: string;
  poClient?: string;
  emetteur: {
    nom: string;
    adresse: string;
    codePostal: string;
    ville: string;
    siret: string;
    tva?: string;
  };
  client: {
    nom: string;
    adresse?: string;
    codePostal?: string;
    ville?: string;
    pays?: string;
    tva?: string;
  };
  lignes: LigneFacture[];
  montantHT: number;
  tauxTVA: number;
  montantTVA: number;
  montantTTC: number;
  mentionTVA: string;
  modePaiement: string;
  rib?: {
    banque: string;
    iban: string;
    bic: string;
  };
  notes?: string;
}

const formatMoney = (amount: number) => {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const typeLabels: Record<string, string> = {
  DEVIS: "Devis",
  FACTURE: "Facture",
  AVOIR: "Avoir",
  BON_DE_COMMANDE: "Bon de commande",
};

export function FactureTemplate({ data }: { data: FactureData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>GLOW UP</Text>
            <Text style={styles.logoSubtitle}>Agence d&apos;influence marketing</Text>
          </View>
          <View style={styles.documentInfo}>
            <Text style={styles.documentType}>{typeLabels[data.type] || data.type}</Text>
            <Text style={styles.documentRef}>{data.reference}</Text>
          </View>
        </View>

        {/* Émetteur / Client */}
        <View style={styles.parties}>
          <View style={styles.partyBox}>
            <Text style={styles.partyTitle}>Émetteur</Text>
            <Text style={styles.partyName}>{data.emetteur.nom}</Text>
            <Text style={styles.partyAddress}>
              {data.emetteur.adresse}
              {"\n"}
              {data.emetteur.codePostal} {data.emetteur.ville}
              {"\n"}
              SIRET : {data.emetteur.siret}
              {data.emetteur.tva ? `\nTVA : ${data.emetteur.tva}` : ""}
            </Text>
          </View>
          <View style={styles.partyBox}>
            <Text style={styles.partyTitle}>Client</Text>
            <Text style={styles.partyName}>{data.client.nom}</Text>
            <Text style={styles.partyAddress}>
              {data.client.adresse ? `${data.client.adresse}\n` : ""}
              {data.client.codePostal && data.client.ville ? `${data.client.codePostal} ${data.client.ville}\n` : ""}
              {data.client.pays && data.client.pays !== "France" ? `${data.client.pays}\n` : ""}
              {data.client.tva ? `TVA : ${data.client.tva}` : ""}
            </Text>
          </View>
        </View>

        {/* Infos document */}
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Date d&apos;émission</Text>
            <Text style={styles.infoValue}>{formatDate(data.dateDocument)}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Date d&apos;échéance</Text>
            <Text style={styles.infoValue}>{formatDate(data.dateEcheance)}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Mode de paiement</Text>
            <Text style={styles.infoValue}>{data.modePaiement}</Text>
          </View>
          {data.poClient ? (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>N° PO Client</Text>
              <Text style={styles.infoValue}>{data.poClient}</Text>
            </View>
          ) : null}
        </View>

        {/* Titre collaboration */}
        <Text style={styles.collabTitle}>{data.titre}</Text>

        {/* Table des lignes */}
        <View style={styles.table}>
          {/* Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colDescription]}>Description</Text>
            <Text style={[styles.tableHeaderCell, styles.colQuantite]}>Qté</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrixUnit]}>Prix unit. HT</Text>
            <Text style={[styles.tableHeaderCell, styles.colTVA]}>TVA</Text>
            <Text style={[styles.tableHeaderCell, styles.colTotal]}>Total HT</Text>
          </View>
          {/* Rows */}
          {data.lignes.map((ligne, index) => (
            <View
              key={index}
              style={index % 2 === 1 ? styles.tableRowAlt : styles.tableRow}
            >
              <Text style={[styles.tableCell, styles.colDescription]}>{ligne.description}</Text>
              <Text style={[styles.tableCell, styles.colQuantite]}>{ligne.quantite}</Text>
              <Text style={[styles.tableCell, styles.colPrixUnit]}>{formatMoney(ligne.prixUnitaire)}</Text>
              <Text style={[styles.tableCell, styles.colTVA]}>{ligne.tauxTVA}%</Text>
              <Text style={[styles.tableCell, styles.colTotal]}>{formatMoney(ligne.totalHT)}</Text>
            </View>
          ))}
        </View>

        {/* Totaux */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total HT</Text>
              <Text style={styles.totalValue}>{formatMoney(data.montantHT)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TVA ({data.tauxTVA}%)</Text>
              <Text style={styles.totalValue}>{formatMoney(data.montantTVA)}</Text>
            </View>
            <View style={styles.totalTTCRow}>
              <Text style={styles.totalTTCLabel}>Total TTC</Text>
              <Text style={styles.totalTTCValue}>{formatMoney(data.montantTTC)}</Text>
            </View>
          </View>
        </View>

        {/* Mention TVA */}
        {data.mentionTVA ? (
          <Text style={styles.mentionsTVA}>{data.mentionTVA}</Text>
        ) : null}

        {/* RIB */}
        {data.rib ? (
          <View style={styles.ribBox}>
            <Text style={styles.ribTitle}>Coordonnées bancaires</Text>
            <View style={styles.ribRow}>
              <Text style={styles.ribLabel}>Banque</Text>
              <Text style={styles.ribValue}>{data.rib.banque}</Text>
            </View>
            <View style={styles.ribRow}>
              <Text style={styles.ribLabel}>IBAN</Text>
              <Text style={styles.ribValue}>{data.rib.iban}</Text>
            </View>
            <View style={styles.ribRow}>
              <Text style={styles.ribLabel}>BIC</Text>
              <Text style={styles.ribValue}>{data.rib.bic}</Text>
            </View>
          </View>
        ) : null}

        {/* Notes */}
        {data.notes ? (
          <Text style={[styles.mentionsTVA, { marginTop: 15 }]}>{data.notes}</Text>
        ) : null}

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <View style={styles.footerContent}>
            <View style={styles.footerSection}>
              <Text style={styles.footerTitle}>Contact</Text>
              <Text style={styles.footerText}>
                contact@glowup-agence.fr{"\n"}
                +33 6 00 00 00 00
              </Text>
            </View>
            <View style={styles.footerSection}>
              <Text style={styles.footerTitle}>Adresse</Text>
              <Text style={styles.footerText}>
                {data.emetteur.adresse}{"\n"}
                {data.emetteur.codePostal} {data.emetteur.ville}
              </Text>
            </View>
            <View style={styles.footerSection}>
              <Text style={styles.footerTitle}>Légal</Text>
              <Text style={styles.footerText}>
                SIRET : {data.emetteur.siret}
              </Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export type { FactureData, LigneFacture };