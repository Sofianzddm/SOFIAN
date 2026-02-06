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
}

const formatMoney = (amount: number) => {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true, // Active le séparateur de milliers
  }).format(amount).replace(/\u202F/g, ' '); // Remplace l'espace fine par une espace normale
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export function DevisTemplate({ data }: { data: DevisData }) {
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
              <Text style={styles.documentType}>DEVIS</Text>
              <Text style={styles.documentRef}>N°{data.reference}</Text>
              <Text style={styles.documentDate}>DATE : {formatDate(data.dateDocument)}</Text>
              <Text style={styles.documentDate}>
                DATE D'ÉCHÉANCE : {formatDate(data.dateEcheance)} (30 JOURS)
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
                Client
              </Text>
              <Text style={{
                fontSize: 8,
                color: "#333333",
                lineHeight: 1.5
              }}>
                {data.client.nom}
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
            Objet du devis
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
            Conditions de paiement
          </Text>
          <Text style={{
            fontSize: 8,
            color: "#333333",
            marginBottom: 5
          }}>
            Mode de paiement : {data.modePaiement}
          </Text>
          <Text style={{
            fontSize: 8,
            color: "#333333"
          }}>
            Échéance : {formatDate(data.dateEcheance)} (30 jours fin du mois)
          </Text>
        </View>
        
        {/* Signature section */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureLabel}>Bon pour accord le :</Text>
            <Text style={styles.signatureText}>Signature du client</Text>
          </View>
        </View>
        
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
        
        {/* Pénalités */}
        <View style={styles.penalitesBox}>
          <Text style={styles.penalitesText}>
            Taux de pénalité : En cas de retard de paiement, application d'intérêts de 3 fois le taux légal selon la loi n°2008-776 du 4 août 2008.
            {"\n"}
            En cas de retard de paiement, application d'une indemnité forfaitaire pour frais de recouvrement de 40€ selon l'article D. 441-5 du code du commerce.
          </Text>
        </View>
        
        {/* Commentaires */}
        {data.commentaires && (
          <View style={styles.commentairesBox}>
            <Text style={styles.commentairesLabel}>Commentaires :</Text>
            <Text style={styles.commentairesText}>{data.commentaires}</Text>
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
          <Text style={styles.pageNumber}>1/3</Text>
        </View>
      </Page>
      
      {/* PAGE 2-3 : CGV */}
      <Page size="A4" style={styles.cgvPage}>
        <Text style={styles.cgvTitle}>CONDITIONS GÉNÉRALES DE VENTE</Text>
        
        <View style={styles.cgvClause}>
          <Text style={styles.cgvClauseTitle}>**Clause n° 1 : Objet et champ d'application**</Text>
          <Text style={styles.cgvClauseText}>
            Les présentes conditions générales de vente (CGV) constituent le socle de la négociation commerciale et sont systématiquement adressées ou remises à chaque acheteur pour lui permettre de passer commande. Les conditions générales de vente décrites ci-après détaillent les droits et obligations de la société SASU Glow Up Agency, située au *EUROPARC DE PICHAURY C7, 1330 AVENUE JEAN-RENÉ GUILLIBERT GAUTIER DE LA LAUZIERE, 13290 AIX-EN-PROVENCE* et de son client dans le cadre du devis de la prestation de service demandé. Toute acceptation du devis/bon de commande englobe la mention « Je reconnais avoir pris connaissance et j'accepte les conditions générales de vente ci-annexées », impliquant l'adhésion sans réserve de l'acheteur aux présentes conditions générales de vente.
          </Text>
        </View>
        
        <View style={styles.cgvClause}>
          <Text style={styles.cgvClauseTitle}>**Clause n° 2 : Prix**</Text>
          <Text style={styles.cgvClauseText}>
            Le prix des prestations de services vendues sont ceux en vigueur au jour de la prise de commande. Ils sont libellés en euros et calculés hors taxes. Par voie de conséquence, ils seront majorés du taux de TVA et des frais de transport applicables au jour de la commande. La société Glow Up Agency se réserve le droit de modifier ses tarifs à tout moment avant la signature. Toutefois, elle s'engage à facturer les prestations aux prix indiqués lors de l'enregistrement de la commande.
          </Text>
        </View>
        
        <View style={styles.cgvClause}>
          <Text style={styles.cgvClauseTitle}>**Clause n° 3 : Escompte**</Text>
          <Text style={styles.cgvClauseText}>
            Aucun escompte ne sera consenti en cas de paiement anticipé.
          </Text>
        </View>
        
        <View style={styles.cgvClause}>
          <Text style={styles.cgvClauseTitle}>**Clause n° 4 : Modalités de paiement**</Text>
          <Text style={styles.cgvClauseText}>
            Le règlement des commandes s'effectue uniquement par virement bancaire. Les règlements seront effectués selon les conditions suivantes : paiement sous X jours suivant la réception de la facture (mentionné en bas de page sur la première page du devis).
          </Text>
        </View>
        
        <View style={styles.cgvClause}>
          <Text style={styles.cgvClauseTitle}>**Clause n° 5 : Retard de paiement**</Text>
          <Text style={styles.cgvClauseText}>
            En cas de défaut de paiement total à échéance, l'acheteur doit verser à la société Glow Up Agency une pénalité de retard égale à trois fois le taux de l'intérêt légal. Le taux de l'intérêt légal retenu est celui en vigueur au jour du devis. Cette pénalité est calculée sur le montant TTC de la somme restant due et court à compter de la date d'échéance du prix sans qu'aucune mise en demeure préalable ne soit nécessaire.
            {"\n\n"}
            En sus des indemnités de retard, toute somme non payée à sa date d'exigibilité produira de plein droit une indemnité forfaitaire de 40 euros due au titre des frais de recouvrement (Articles 441-10 et D. 441-5 du code de commerce).
          </Text>
        </View>
        
        <View style={styles.cgvClause}>
          <Text style={styles.cgvClauseTitle}>**Clause n° 6 : Clause résolutoire**</Text>
          <Text style={styles.cgvClauseText}>
            Si dans les quinze jours qui suivent la mise en œuvre de la clause « Retard de paiement », l'acheteur ne s'est pas acquitté des sommes restantes dues, la vente sera résolue de plein droit et pourra ouvrir droit à l'allocation de dommages et intérêts au profit de la société Glow Up Agency.
          </Text>
        </View>
        
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {data.emetteur.nom} - {data.emetteur.adresse} - {data.emetteur.codePostal} {data.emetteur.ville}, {data.emetteur.pays}
            {"\n"}
            N°TVA {data.emetteur.tva} - SIREN {data.emetteur.siret} - RCS {data.emetteur.rcs}
            {"\n"}
            Capital de {formatMoney(data.emetteur.capital)} - APE {data.emetteur.ape}
          </Text>
          <Text style={styles.pageNumber}>2/3</Text>
        </View>
      </Page>
      
      <Page size="A4" style={styles.cgvPage}>
        <View style={styles.cgvClause}>
          <Text style={styles.cgvClauseTitle}>**Clause n° 7 : Clause de réserve de propriété**</Text>
          <Text style={styles.cgvClauseText}>
            La société Glow Up Agency conserve la propriété des biens vendus jusqu'au paiement intégral du prix, en principal et en accessoires. À ce titre, si l'acheteur fait l'objet d'un redressement ou d'une liquidation judiciaire, la société Glow Up Agency se réserve le droit de revendiquer, dans le cadre de la procédure collective, les prestations vendues et restées impayées.
          </Text>
        </View>
        
        <View style={styles.cgvClause}>
          <Text style={styles.cgvClauseTitle}>**Clause n° 8 : Force majeure**</Text>
          <Text style={styles.cgvClauseText}>
            La responsabilité de la société Glow Up Agency ne pourra pas être mise en œuvre si la non-exécution ou le retard dans l'exécution de l'une de ses obligations découle d'un cas de force majeure. À ce titre, la force majeure s'entend de tout événement extérieur, imprévisible et irrésistible au sens de l'article 1148 du Code civil.
          </Text>
        </View>
        
        <View style={styles.cgvClause}>
          <Text style={styles.cgvClauseTitle}>**Clause n° 9 : Protection des données personnelles**</Text>
          <Text style={styles.cgvClauseText}>
            La société Glow Up Agency s'engage à respecter la réglementation applicable en matière de protection des données personnelles, en particulier le Règlement Général sur la Protection des Données (RGPD). Les données collectées dans le cadre de l'exécution des présentes CGV sont strictement confidentielles et destinées uniquement à la gestion de la relation commerciale avec le client. Le client dispose d'un droit d'accès, de rectification, et de suppression de ses données, qu'il peut exercer en envoyant une demande écrite à l'adresse suivante : *s.zeddam@glowupagence.fr*.
          </Text>
        </View>
        
        <View style={styles.cgvClause}>
          <Text style={styles.cgvClauseTitle}>**Clause n° 10: Tribunal compétent**</Text>
          <Text style={styles.cgvClauseText}>
            Tout litige relatif à l'interprétation et à l'exécution des présentes conditions générales de vente est soumis au droit français. À défaut de résolution amiable, le litige sera porté devant le Tribunal de commerce de Lyon.
          </Text>
        </View>
        
        <View style={styles.cgvClause}>
          <Text style={styles.cgvClauseTitle}>**Clause n° 11 : Communication externe d'un salarié**</Text>
          <Text style={styles.cgvClauseText}>
            Tout salarié de Glow Up Agency entrant en contact direct avec un client ou une autre entité externe en dehors du cadre défini par l'agence doit immédiatement en informer la direction. Le non-respect de cette obligation pourrait donner lieu à des sanctions appropriées, conformément aux règles internes de l'entreprise.
          </Text>
        </View>
        
        <Text style={[styles.cgvClauseText, { marginTop: 20, textAlign: "center", fontStyle: "italic" }]}>
          **Fait à Aix-en-Provence, à la date de signature du devis par le client.**
          {"\n\n"}
          ---
          {"\n\n"}
          **CGV VALABLE JUSQU'A DÉCEMBRE 2026**
        </Text>
        
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {data.emetteur.nom} - {data.emetteur.adresse} - {data.emetteur.codePostal} {data.emetteur.ville}, {data.emetteur.pays}
            {"\n"}
            N°TVA {data.emetteur.tva} - SIREN {data.emetteur.siret} - RCS {data.emetteur.rcs}
            {"\n"}
            Capital de {formatMoney(data.emetteur.capital)} - APE {data.emetteur.ape}
          </Text>
          <Text style={styles.pageNumber}>3/3</Text>
        </View>
      </Page>
    </Document>
  );
}

export type { DevisData, LigneDevis };
