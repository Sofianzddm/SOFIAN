// src/lib/documents/i18n.ts
//
// Internationalisation des documents PDF (devis, factures, avoirs).
// Permet de générer un document entièrement en français (défaut) ou en anglais.
//
// Toute chaîne affichée sur un PDF doit passer par ce module afin qu'une
// traduction complète soit possible via `locale`.

export type DocLocale = "fr" | "en";

export function normalizeLocale(locale?: string | null): DocLocale {
  return (locale || "").toLowerCase().startsWith("en") ? "en" : "fr";
}

/** Locale Intl utilisée pour le formatage des dates / montants. */
export function intlLocale(locale: DocLocale): string {
  return locale === "en" ? "en-GB" : "fr-FR";
}

export interface DocLabels {
  // En-tête émetteur
  capitalDe: (montant: string) => string;
  siret: string;
  tel: string;
  email: string;

  // Types de document
  documentType: (type: string) => string;
  refPrefix: string;
  date: string;
  dueDate: string;

  // Blocs client
  client: string;
  talentPrestataire: string;
  vat: string;
  siretShort: string;

  // Objet
  objet: (type: string) => string;

  // Tableau
  colDesignation: string;
  colQte: string;
  colPUHT: string;
  colTVA: string;
  colTotalHT: string;

  // Récap TVA
  baseHT: string;
  taux: string;
  tvaShort: string;

  // Mention TVA
  regimeTVA: string;

  // Totaux
  totalHT: string;
  totalTVA: string;
  totalTTC: string;
  netAPayer: string;
  montantAvoir: string;

  // Conditions de paiement / signature (devis)
  conditionsPaiement: string;
  modePaiement: string;
  echeance: string;
  bonPourAccord: string;
  signatureClient: string;

  // Pénalités
  penalitesDevis: string;
  penalitesFacture: string;

  // Commentaires / notes
  commentaires: string;
  notes: string;

  // Coordonnées bancaires / avoir (facture)
  coordonneesBancaires: string;
  iban: string;
  bic: string;
  virementReference: (ref: string) => string;
  avoirTitre: string;
  avoirTexte: (ref: string) => string;

  // Footer
  footerTVA: string;
  footerSIREN: string;
  footerRCS: string;
  footerCapital: (montant: string) => string;
  footerAPE: string;

  // CGV
  cgvTitle: string;
}

const TYPE_LABELS: Record<DocLocale, Record<string, string>> = {
  fr: {
    DEVIS: "DEVIS",
    FACTURE: "FACTURE",
    AVOIR: "AVOIR",
    BON_DE_COMMANDE: "BON DE COMMANDE",
  },
  en: {
    DEVIS: "QUOTE",
    FACTURE: "INVOICE",
    AVOIR: "CREDIT NOTE",
    BON_DE_COMMANDE: "PURCHASE ORDER",
  },
};

const OBJET_LABELS: Record<DocLocale, Record<string, string>> = {
  fr: {
    DEVIS: "Objet du devis",
    FACTURE: "Objet de la facture",
    AVOIR: "Objet de l'avoir",
    BON_DE_COMMANDE: "Objet du bon de commande",
  },
  en: {
    DEVIS: "Quote subject",
    FACTURE: "Invoice subject",
    AVOIR: "Credit note subject",
    BON_DE_COMMANDE: "Purchase order subject",
  },
};

const LABELS: Record<DocLocale, DocLabels> = {
  fr: {
    capitalDe: (m) => `Capital de ${m}`,
    siret: "Siret :",
    tel: "Tel :",
    email: "Email :",

    documentType: (t) => TYPE_LABELS.fr[t?.toUpperCase()] || TYPE_LABELS.fr.FACTURE,
    refPrefix: "N°",
    date: "DATE :",
    dueDate: "DATE D'ÉCHÉANCE :",

    client: "Client",
    talentPrestataire: "Talent / Prestataire",
    vat: "TVA :",
    siretShort: "SIRET :",

    objet: (t) => OBJET_LABELS.fr[t?.toUpperCase()] || OBJET_LABELS.fr.FACTURE,

    colDesignation: "DÉSIGNATION",
    colQte: "QTÉ",
    colPUHT: "PU HT",
    colTVA: "TVA",
    colTotalHT: "TOTAL HT",

    baseHT: "BASE HT",
    taux: "TAUX",
    tvaShort: "TVA",

    regimeTVA: "Régime de TVA applicable :",

    totalHT: "TOTAL HT",
    totalTVA: "Total TVA",
    totalTTC: "TOTAL TTC",
    netAPayer: "NET À PAYER",
    montantAvoir: "MONTANT DE L'AVOIR",

    conditionsPaiement: "Conditions de paiement",
    modePaiement: "Mode de paiement :",
    echeance: "Échéance :",
    bonPourAccord: "Bon pour accord le :",
    signatureClient: "Signature du client",

    penalitesDevis:
      "Taux de pénalité : En cas de retard de paiement, application d'intérêts de 3 fois le taux légal selon la loi n°2008-776 du 4 août 2008.\nEn cas de retard de paiement, application d'une indemnité forfaitaire pour frais de recouvrement de 40€ selon l'article D. 441-5 du code du commerce.",
    penalitesFacture:
      "En cas de retard de paiement, application d'intérêts de 3 fois le taux légal selon la loi n°2008-776 du 4 août 2008.\nIndemnité forfaitaire pour frais de recouvrement : 40€ (article D. 441-5 du code de commerce).",

    commentaires: "Commentaires :",
    notes: "Notes :",

    coordonneesBancaires: "Coordonnées bancaires pour le paiement",
    iban: "IBAN :",
    bic: "BIC :",
    virementReference: (ref) => `Merci d'effectuer le virement avec la référence : ${ref}`,
    avoirTitre: "Avoir / Note de crédit",
    avoirTexte: (ref) =>
      `Le présent avoir vient en déduction des sommes dues ou donne lieu à remboursement par virement bancaire.\nRéférence à rappeler : ${ref}`,

    footerTVA: "N°TVA",
    footerSIREN: "SIREN",
    footerRCS: "RCS",
    footerCapital: (m) => `Capital de ${m}`,
    footerAPE: "APE",

    cgvTitle: "CONDITIONS GÉNÉRALES DE VENTE",
  },
  en: {
    capitalDe: (m) => `Share capital ${m}`,
    siret: "Company reg. (SIRET):",
    tel: "Phone:",
    email: "Email:",

    documentType: (t) => TYPE_LABELS.en[t?.toUpperCase()] || TYPE_LABELS.en.FACTURE,
    refPrefix: "No. ",
    date: "DATE:",
    dueDate: "DUE DATE:",

    client: "Client",
    talentPrestataire: "Talent / Contractor",
    vat: "VAT:",
    siretShort: "Company reg.:",

    objet: (t) => OBJET_LABELS.en[t?.toUpperCase()] || OBJET_LABELS.en.FACTURE,

    colDesignation: "DESCRIPTION",
    colQte: "QTY",
    colPUHT: "UNIT PRICE",
    colTVA: "VAT",
    colTotalHT: "TOTAL (EXCL. VAT)",

    baseHT: "NET AMOUNT",
    taux: "RATE",
    tvaShort: "VAT",

    regimeTVA: "Applicable VAT regime:",

    totalHT: "TOTAL (EXCL. VAT)",
    totalTVA: "Total VAT",
    totalTTC: "TOTAL (INCL. VAT)",
    netAPayer: "AMOUNT DUE",
    montantAvoir: "CREDIT NOTE AMOUNT",

    conditionsPaiement: "Payment terms",
    modePaiement: "Payment method:",
    echeance: "Due date:",
    bonPourAccord: "Approved on:",
    signatureClient: "Client signature",

    penalitesDevis:
      "Late-payment penalty rate: in the event of late payment, interest at 3 times the statutory rate applies (French Act No. 2008-776 of 4 August 2008).\nIn the event of late payment, a fixed recovery-cost indemnity of €40 applies (Article D. 441-5 of the French Commercial Code).",
    penalitesFacture:
      "In the event of late payment, interest at 3 times the statutory rate applies (French Act No. 2008-776 of 4 August 2008).\nFixed recovery-cost indemnity: €40 (Article D. 441-5 of the French Commercial Code).",

    commentaires: "Comments:",
    notes: "Notes:",

    coordonneesBancaires: "Bank details for payment",
    iban: "IBAN:",
    bic: "BIC:",
    virementReference: (ref) => `Please make the transfer using the reference: ${ref}`,
    avoirTitre: "Credit note",
    avoirTexte: (ref) =>
      `This credit note is deducted from amounts owed or refunded by bank transfer.\nReference to quote: ${ref}`,

    footerTVA: "VAT No.",
    footerSIREN: "Company No. (SIREN)",
    footerRCS: "Trade register (RCS)",
    footerCapital: (m) => `Share capital ${m}`,
    footerAPE: "Business code (APE)",

    cgvTitle: "GENERAL TERMS AND CONDITIONS OF SALE",
  },
};

export function getDocLabels(locale?: string | null): DocLabels {
  return LABELS[normalizeLocale(locale)];
}

/**
 * Traduit une mention de TVA connue. Les mentions sont générées côté serveur
 * (config.MENTIONS_TVA) et stockées en base ; on les retraduit ici pour l'EN.
 * Toute mention inconnue est renvoyée telle quelle.
 */
export function translateMentionTVA(
  mention: string | null | undefined,
  locale: DocLocale
): string | null {
  if (!mention) return null;
  if (locale === "fr") return mention;

  let out = mention;
  const rules: Array<[RegExp, string]> = [
    [/TVA française au taux normal \(20\s*%\)/i, "French VAT at the standard rate (20%)"],
    [/Autoliquidation\s*[–-]\s*article 44 directive 2006\/112\/CE/i, "Reverse charge – Article 44 of Directive 2006/112/EC"],
    [/TVA non applicable\s*[–-]\s*article 259-1 du CGI/i, "VAT not applicable – Article 259-1 of the French General Tax Code"],
    [/N°\s*TVA client\s*:/i, "Client VAT No.:"],
  ];
  for (const [re, rep] of rules) {
    out = out.replace(re, rep);
  }
  return out;
}

/**
 * Traduit un mode de paiement courant (valeur libre stockée en base).
 * Les valeurs inconnues sont renvoyées telles quelles.
 */
export function translateModePaiement(mode: string | null | undefined, locale: DocLocale): string {
  const value = (mode || "").trim();
  if (locale === "fr" || !value) return value;
  const map: Record<string, string> = {
    virement: "Bank transfer",
    "virement bancaire": "Bank transfer",
    "carte bancaire": "Credit card",
    carte: "Credit card",
    chèque: "Cheque",
    cheque: "Cheque",
    espèces: "Cash",
    especes: "Cash",
    prélèvement: "Direct debit",
    prelevement: "Direct debit",
  };
  return map[value.toLowerCase()] || value;
}

/**
 * Libellé des conditions de paiement (facture) dans la bonne langue.
 * @param jours Nombre de jours, ou 0 pour un paiement comptant.
 */
export function conditionsPaiementLabel(jours: number, locale: DocLocale): string {
  if (locale === "en") {
    if (jours <= 0) return "Payment due upon receipt of the invoice.";
    return `Payment due within ${jours} days of the invoice date.`;
  }
  if (jours <= 0) return "Paiement comptant à réception de la facture.";
  return `Paiement sous ${jours} jours à compter de la date de facture.`;
}

// Conditions Générales de Vente — version anglaise (miroir de config.CGV).
export interface CGVClause {
  title: string;
  text: string;
}

const CGV_CLAUSES_FR: CGVClause[] = [
  {
    title: "**Clause n° 1 : Objet et champ d'application**",
    text:
      "Les présentes conditions générales de vente (CGV) constituent le socle de la négociation commerciale et sont systématiquement adressées ou remises à chaque acheteur pour lui permettre de passer commande. Les conditions générales de vente décrites ci-après détaillent les droits et obligations de la société SASU Glow Up Agency, située au *EUROPARC DE PICHAURY C7, 1330 AVENUE JEAN-RENÉ GUILLIBERT GAUTIER DE LA LAUZIERE, 13290 AIX-EN-PROVENCE* et de son client dans le cadre du devis de la prestation de service demandé. Toute acceptation du devis/bon de commande englobe la mention « Je reconnais avoir pris connaissance et j'accepte les conditions générales de vente ci-annexées », impliquant l'adhésion sans réserve de l'acheteur aux présentes conditions générales de vente.",
  },
  {
    title: "**Clause n° 2 : Prix**",
    text:
      "Le prix des prestations de services vendues sont ceux en vigueur au jour de la prise de commande. Ils sont libellés en euros et calculés hors taxes. Par voie de conséquence, ils seront majorés du taux de TVA et des frais de transport applicables au jour de la commande. La société Glow Up Agency se réserve le droit de modifier ses tarifs à tout moment avant la signature. Toutefois, elle s'engage à facturer les prestations aux prix indiqués lors de l'enregistrement de la commande.",
  },
  {
    title: "**Clause n° 3 : Escompte**",
    text: "Aucun escompte ne sera consenti en cas de paiement anticipé.",
  },
  {
    title: "**Clause n° 4 : Modalités de paiement**",
    text:
      "Le règlement des commandes s'effectue uniquement par virement bancaire. Les règlements seront effectués selon les conditions suivantes : paiement sous 30 jours suivant la réception de la facture, sauf accord contractuel spécifique mentionné sur le devis.",
  },
  {
    title: "**Clause n° 5 : Retard de paiement**",
    text:
      "En cas de défaut de paiement total à échéance, l'acheteur doit verser à la société Glow Up Agency une pénalité de retard égale à trois fois le taux de l'intérêt légal. Le taux de l'intérêt légal retenu est celui en vigueur au jour du devis. Cette pénalité est calculée sur le montant TTC de la somme restant due et court à compter de la date d'échéance du prix sans qu'aucune mise en demeure préalable ne soit nécessaire.\n\nEn sus des indemnités de retard, toute somme non payée à sa date d'exigibilité produira de plein droit une indemnité forfaitaire de 40 euros due au titre des frais de recouvrement (Articles 441-10 et D. 441-5 du code de commerce).",
  },
  {
    title: "**Clause n° 6 : Clause résolutoire**",
    text:
      "Si dans les quinze jours qui suivent la mise en œuvre de la clause « Retard de paiement », l'acheteur ne s'est pas acquitté des sommes restantes dues, la vente sera résolue de plein droit et pourra ouvrir droit à l'allocation de dommages et intérêts au profit de la société Glow Up Agency.",
  },
  {
    title: "**Clause n° 7 : Clause de réserve de propriété**",
    text:
      "La société Glow Up Agency conserve la propriété des biens vendus jusqu'au paiement intégral du prix, en principal et en accessoires. À ce titre, si l'acheteur fait l'objet d'un redressement ou d'une liquidation judiciaire, la société Glow Up Agency se réserve le droit de revendiquer, dans le cadre de la procédure collective, les prestations vendues et restées impayées.",
  },
  {
    title: "**Clause n° 8 : Force majeure**",
    text:
      "La responsabilité de la société Glow Up Agency ne pourra pas être mise en œuvre si la non-exécution ou le retard dans l'exécution de l'une de ses obligations découle d'un cas de force majeure. À ce titre, la force majeure s'entend de tout événement extérieur, imprévisible et irrésistible au sens de l'article 1148 du Code civil.",
  },
  {
    title: "**Clause n° 9 : Protection des données personnelles**",
    text:
      "La société Glow Up Agency s'engage à respecter la réglementation applicable en matière de protection des données personnelles, en particulier le Règlement Général sur la Protection des Données (RGPD). Les données collectées dans le cadre de l'exécution des présentes CGV sont strictement confidentielles et destinées uniquement à la gestion de la relation commerciale avec le client. Le client dispose d'un droit d'accès, de rectification, et de suppression de ses données, qu'il peut exercer en envoyant une demande écrite à l'adresse suivante : *s.zeddam@glowupagence.fr*.",
  },
  {
    title: "**Clause n° 10: Tribunal compétent**",
    text:
      "Tout litige relatif à l'interprétation et à l'exécution des présentes conditions générales de vente est soumis au droit français. À défaut de résolution amiable, le litige sera porté devant le Tribunal de commerce d'Aix-en-Provence.",
  },
  {
    title: "**Clause n° 11 : Communication externe d'un salarié**",
    text:
      "Tout salarié de Glow Up Agency entrant en contact direct avec un client ou une autre entité externe en dehors du cadre défini par l'agence doit immédiatement en informer la direction. Le non-respect de cette obligation pourrait donner lieu à des sanctions appropriées, conformément aux règles internes de l'entreprise.",
  },
];

const CGV_CLAUSES_EN: CGVClause[] = [
  {
    title: "**Clause No. 1: Purpose and scope**",
    text:
      "These general terms and conditions of sale (GTCS) form the basis of the commercial negotiation and are systematically sent or given to each buyer to enable them to place an order. The general terms and conditions of sale set out below detail the rights and obligations of SASU Glow Up Agency, located at *EUROPARC DE PICHAURY C7, 1330 AVENUE JEAN-RENÉ GUILLIBERT GAUTIER DE LA LAUZIERE, 13290 AIX-EN-PROVENCE*, and of its client in connection with the quote for the requested service. Any acceptance of the quote/purchase order includes the statement \"I acknowledge that I have read and accept the general terms and conditions of sale attached hereto\", implying the buyer's unreserved acceptance of these general terms and conditions of sale.",
  },
  {
    title: "**Clause No. 2: Price**",
    text:
      "The price of the services sold is that in force on the day the order is placed. Prices are expressed in euros and calculated exclusive of tax. Consequently, they will be increased by the applicable VAT rate and any shipping costs in force on the day of the order. Glow Up Agency reserves the right to change its prices at any time before signature. However, it undertakes to invoice the services at the prices indicated when the order was recorded.",
  },
  {
    title: "**Clause No. 3: Discount**",
    text: "No discount will be granted for early payment.",
  },
  {
    title: "**Clause No. 4: Terms of payment**",
    text:
      "Orders are settled solely by bank transfer. Payments shall be made under the following conditions: payment within 30 days following receipt of the invoice, unless a specific contractual agreement is stated on the quote.",
  },
  {
    title: "**Clause No. 5: Late payment**",
    text:
      "In the event of total default of payment on the due date, the buyer must pay Glow Up Agency a late-payment penalty equal to three times the statutory interest rate. The statutory interest rate used is the one in force on the date of the quote. This penalty is calculated on the amount due including VAT and accrues from the payment due date, without any prior formal notice being required.\n\nIn addition to late-payment penalties, any sum unpaid on its due date shall automatically give rise to a fixed indemnity of 40 euros in respect of recovery costs (Articles 441-10 and D. 441-5 of the French Commercial Code).",
  },
  {
    title: "**Clause No. 6: Termination clause**",
    text:
      "If, within fifteen days of the implementation of the \"Late payment\" clause, the buyer has not paid the remaining sums due, the sale shall be automatically terminated and may give rise to the award of damages in favour of Glow Up Agency.",
  },
  {
    title: "**Clause No. 7: Retention of title clause**",
    text:
      "Glow Up Agency retains ownership of the goods sold until full payment of the price, in principal and ancillary costs. Accordingly, if the buyer is subject to receivership or judicial liquidation, Glow Up Agency reserves the right to claim, within the collective proceedings, the services sold and remaining unpaid.",
  },
  {
    title: "**Clause No. 8: Force majeure**",
    text:
      "Glow Up Agency's liability cannot be engaged if the non-performance or delay in the performance of any of its obligations results from a case of force majeure. In this respect, force majeure means any external, unforeseeable and irresistible event within the meaning of Article 1148 of the French Civil Code.",
  },
  {
    title: "**Clause No. 9: Protection of personal data**",
    text:
      "Glow Up Agency undertakes to comply with the applicable regulations on the protection of personal data, in particular the General Data Protection Regulation (GDPR). The data collected in connection with the performance of these GTCS are strictly confidential and intended solely for the management of the commercial relationship with the client. The client has a right of access, rectification and deletion of their data, which they may exercise by sending a written request to the following address: *s.zeddam@glowupagence.fr*.",
  },
  {
    title: "**Clause No. 10: Competent court**",
    text:
      "Any dispute relating to the interpretation and performance of these general terms and conditions of sale is subject to French law. Failing an amicable settlement, the dispute shall be brought before the Commercial Court of Aix-en-Provence.",
  },
  {
    title: "**Clause No. 11: External communication by an employee**",
    text:
      "Any Glow Up Agency employee who comes into direct contact with a client or another external entity outside the framework defined by the agency must immediately inform management. Failure to comply with this obligation may give rise to appropriate sanctions, in accordance with the company's internal rules.",
  },
];

const CGV_FOOTER: Record<DocLocale, { faitA: string; valid: string }> = {
  fr: {
    faitA: "**Fait à Aix-en-Provence, à la date de signature du devis par le client.**",
    valid: "**CGV VALABLE JUSQU'A DÉCEMBRE 2026**",
  },
  en: {
    faitA: "**Executed in Aix-en-Provence, on the date the quote is signed by the client.**",
    valid: "**GTCS VALID UNTIL DECEMBER 2026**",
  },
};

/** Renvoie les clauses CGV traduites : les 6 premières (page 2) puis 5 dernières (page 3). */
export function getCGVClauses(locale: DocLocale): CGVClause[] {
  return locale === "en" ? CGV_CLAUSES_EN : CGV_CLAUSES_FR;
}

export function getCGVFooter(locale: DocLocale) {
  return CGV_FOOTER[locale];
}
