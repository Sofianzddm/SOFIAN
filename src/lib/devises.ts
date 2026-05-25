/**
 * Devises supportées pour les factures (libres et liées à une collaboration).
 *
 * Liste : ISO 4217 (devises *actives* uniquement, les unités de compte techniques
 * type CHE/CHW/COU/MXV/USN/UYI/UYW/BOV/CLF/XDR ne sont pas exposées).
 *
 * - `code` : code ISO 4217 (utilisé en BDD et pour `Intl.NumberFormat`)
 * - `name` : nom français
 * - `symbol` : symbole pour le formatage de secours si `Intl` ne fournit pas un
 *   rendu correct (très rare). `Intl.NumberFormat(..., { style: "currency" })`
 *   choisira lui-même le bon symbole pour les devises répandues.
 *
 * L'ordre du tableau pilote l'ordre des `<select>` dans toute l'app : on garde
 * les principales en tête (EUR, USD, GBP, CHF, CAD, AUD, JPY, CNY, AED, HKD,
 * SGD, MAD, TND, DZD), puis le reste par code alphabétique.
 */
export interface DeviseInfo {
  code: string;
  name: string;
  symbol: string;
}

const PRINCIPALES: DeviseInfo[] = [
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "USD", name: "Dollar américain", symbol: "$" },
  { code: "GBP", name: "Livre sterling", symbol: "£" },
  { code: "CHF", name: "Franc suisse", symbol: "CHF" },
  { code: "CAD", name: "Dollar canadien", symbol: "CA$" },
  { code: "AUD", name: "Dollar australien", symbol: "A$" },
  { code: "JPY", name: "Yen japonais", symbol: "¥" },
  { code: "CNY", name: "Yuan chinois", symbol: "¥" },
  { code: "AED", name: "Dirham émirien", symbol: "AED" },
  { code: "HKD", name: "Dollar de Hong Kong", symbol: "HK$" },
  { code: "SGD", name: "Dollar de Singapour", symbol: "S$" },
  { code: "MAD", name: "Dirham marocain", symbol: "MAD" },
  { code: "TND", name: "Dinar tunisien", symbol: "TND" },
  { code: "DZD", name: "Dinar algérien", symbol: "DZD" },
];

const AUTRES: DeviseInfo[] = [
  { code: "AFN", name: "Afghani afghan", symbol: "؋" },
  { code: "ALL", name: "Lek albanais", symbol: "L" },
  { code: "AMD", name: "Dram arménien", symbol: "AMD" },
  { code: "ANG", name: "Florin antillais", symbol: "ƒ" },
  { code: "AOA", name: "Kwanza angolais", symbol: "Kz" },
  { code: "ARS", name: "Peso argentin", symbol: "AR$" },
  { code: "AWG", name: "Florin arubais", symbol: "ƒ" },
  { code: "AZN", name: "Manat azerbaïdjanais", symbol: "₼" },
  { code: "BAM", name: "Mark convertible bosnien", symbol: "KM" },
  { code: "BBD", name: "Dollar barbadien", symbol: "Bds$" },
  { code: "BDT", name: "Taka bangladais", symbol: "৳" },
  { code: "BGN", name: "Lev bulgare", symbol: "лв" },
  { code: "BHD", name: "Dinar bahreïni", symbol: "BHD" },
  { code: "BIF", name: "Franc burundais", symbol: "FBu" },
  { code: "BMD", name: "Dollar bermudien", symbol: "BD$" },
  { code: "BND", name: "Dollar de Brunei", symbol: "B$" },
  { code: "BOB", name: "Boliviano bolivien", symbol: "Bs." },
  { code: "BRL", name: "Real brésilien", symbol: "R$" },
  { code: "BSD", name: "Dollar bahaméen", symbol: "B$" },
  { code: "BTN", name: "Ngultrum bhoutanais", symbol: "Nu." },
  { code: "BWP", name: "Pula botswanais", symbol: "P" },
  { code: "BYN", name: "Rouble biélorusse", symbol: "Br" },
  { code: "BZD", name: "Dollar bélizien", symbol: "BZ$" },
  { code: "CDF", name: "Franc congolais", symbol: "FC" },
  { code: "CLP", name: "Peso chilien", symbol: "CL$" },
  { code: "COP", name: "Peso colombien", symbol: "CO$" },
  { code: "CRC", name: "Colón costaricien", symbol: "₡" },
  { code: "CUC", name: "Peso cubain convertible", symbol: "CUC$" },
  { code: "CUP", name: "Peso cubain", symbol: "CU$" },
  { code: "CVE", name: "Escudo cap-verdien", symbol: "Esc" },
  { code: "CZK", name: "Couronne tchèque", symbol: "Kč" },
  { code: "DJF", name: "Franc djiboutien", symbol: "Fdj" },
  { code: "DKK", name: "Couronne danoise", symbol: "kr" },
  { code: "DOP", name: "Peso dominicain", symbol: "RD$" },
  { code: "EGP", name: "Livre égyptienne", symbol: "E£" },
  { code: "ERN", name: "Nakfa érythréen", symbol: "Nfk" },
  { code: "ETB", name: "Birr éthiopien", symbol: "Br" },
  { code: "FJD", name: "Dollar fidjien", symbol: "FJ$" },
  { code: "FKP", name: "Livre des Malouines", symbol: "£" },
  { code: "GEL", name: "Lari géorgien", symbol: "₾" },
  { code: "GHS", name: "Cedi ghanéen", symbol: "₵" },
  { code: "GIP", name: "Livre de Gibraltar", symbol: "£" },
  { code: "GMD", name: "Dalasi gambien", symbol: "D" },
  { code: "GNF", name: "Franc guinéen", symbol: "FG" },
  { code: "GTQ", name: "Quetzal guatémaltèque", symbol: "Q" },
  { code: "GYD", name: "Dollar guyanien", symbol: "GY$" },
  { code: "HNL", name: "Lempira hondurien", symbol: "L" },
  { code: "HRK", name: "Kuna croate", symbol: "kn" },
  { code: "HTG", name: "Gourde haïtienne", symbol: "G" },
  { code: "HUF", name: "Forint hongrois", symbol: "Ft" },
  { code: "IDR", name: "Roupie indonésienne", symbol: "Rp" },
  { code: "ILS", name: "Shekel israélien", symbol: "₪" },
  { code: "INR", name: "Roupie indienne", symbol: "₹" },
  { code: "IQD", name: "Dinar irakien", symbol: "IQD" },
  { code: "IRR", name: "Rial iranien", symbol: "﷼" },
  { code: "ISK", name: "Couronne islandaise", symbol: "kr" },
  { code: "JMD", name: "Dollar jamaïcain", symbol: "J$" },
  { code: "JOD", name: "Dinar jordanien", symbol: "JOD" },
  { code: "KES", name: "Shilling kényan", symbol: "KSh" },
  { code: "KGS", name: "Som kirghize", symbol: "с" },
  { code: "KHR", name: "Riel cambodgien", symbol: "៛" },
  { code: "KMF", name: "Franc comorien", symbol: "CF" },
  { code: "KPW", name: "Won nord-coréen", symbol: "₩" },
  { code: "KRW", name: "Won sud-coréen", symbol: "₩" },
  { code: "KWD", name: "Dinar koweïtien", symbol: "KWD" },
  { code: "KYD", name: "Dollar des îles Caïmans", symbol: "CI$" },
  { code: "KZT", name: "Tenge kazakh", symbol: "₸" },
  { code: "LAK", name: "Kip laotien", symbol: "₭" },
  { code: "LBP", name: "Livre libanaise", symbol: "L£" },
  { code: "LKR", name: "Roupie srilankaise", symbol: "Rs" },
  { code: "LRD", name: "Dollar libérien", symbol: "L$" },
  { code: "LSL", name: "Loti lésothan", symbol: "L" },
  { code: "LYD", name: "Dinar libyen", symbol: "LD" },
  { code: "MDL", name: "Leu moldave", symbol: "L" },
  { code: "MGA", name: "Ariary malgache", symbol: "Ar" },
  { code: "MKD", name: "Denar macédonien", symbol: "ден" },
  { code: "MMK", name: "Kyat birman", symbol: "K" },
  { code: "MNT", name: "Tugrik mongol", symbol: "₮" },
  { code: "MOP", name: "Pataca macanaise", symbol: "MOP$" },
  { code: "MRU", name: "Ouguiya mauritanien", symbol: "UM" },
  { code: "MUR", name: "Roupie mauricienne", symbol: "Rs" },
  { code: "MVR", name: "Rufiyaa maldivien", symbol: "Rf" },
  { code: "MWK", name: "Kwacha malawien", symbol: "MK" },
  { code: "MXN", name: "Peso mexicain", symbol: "MX$" },
  { code: "MYR", name: "Ringgit malaisien", symbol: "RM" },
  { code: "MZN", name: "Metical mozambicain", symbol: "MT" },
  { code: "NAD", name: "Dollar namibien", symbol: "N$" },
  { code: "NGN", name: "Naira nigérian", symbol: "₦" },
  { code: "NIO", name: "Córdoba nicaraguayen", symbol: "C$" },
  { code: "NOK", name: "Couronne norvégienne", symbol: "kr" },
  { code: "NPR", name: "Roupie népalaise", symbol: "Rs" },
  { code: "NZD", name: "Dollar néo-zélandais", symbol: "NZ$" },
  { code: "OMR", name: "Rial omanais", symbol: "OMR" },
  { code: "PAB", name: "Balboa panaméen", symbol: "B/." },
  { code: "PEN", name: "Sol péruvien", symbol: "S/" },
  { code: "PGK", name: "Kina papou-néo-guinéen", symbol: "K" },
  { code: "PHP", name: "Peso philippin", symbol: "₱" },
  { code: "PKR", name: "Roupie pakistanaise", symbol: "Rs" },
  { code: "PLN", name: "Zloty polonais", symbol: "zł" },
  { code: "PYG", name: "Guaraní paraguayen", symbol: "₲" },
  { code: "QAR", name: "Rial qatarien", symbol: "QR" },
  { code: "RON", name: "Leu roumain", symbol: "lei" },
  { code: "RSD", name: "Dinar serbe", symbol: "дин" },
  { code: "RUB", name: "Rouble russe", symbol: "₽" },
  { code: "RWF", name: "Franc rwandais", symbol: "RF" },
  { code: "SAR", name: "Riyal saoudien", symbol: "SR" },
  { code: "SBD", name: "Dollar des îles Salomon", symbol: "SI$" },
  { code: "SCR", name: "Roupie seychelloise", symbol: "SR" },
  { code: "SDG", name: "Livre soudanaise", symbol: "SDG" },
  { code: "SEK", name: "Couronne suédoise", symbol: "kr" },
  { code: "SHP", name: "Livre de Sainte-Hélène", symbol: "£" },
  { code: "SLE", name: "Leone sierra-léonais", symbol: "Le" },
  { code: "SOS", name: "Shilling somalien", symbol: "Sh" },
  { code: "SRD", name: "Dollar surinamien", symbol: "Sr$" },
  { code: "SSP", name: "Livre sud-soudanaise", symbol: "SS£" },
  { code: "STN", name: "Dobra santoméen", symbol: "Db" },
  { code: "SVC", name: "Colón salvadorien", symbol: "₡" },
  { code: "SYP", name: "Livre syrienne", symbol: "S£" },
  { code: "SZL", name: "Lilangeni swazi", symbol: "E" },
  { code: "THB", name: "Baht thaïlandais", symbol: "฿" },
  { code: "TJS", name: "Somoni tadjik", symbol: "SM" },
  { code: "TMT", name: "Manat turkmène", symbol: "m" },
  { code: "TOP", name: "Pa'anga tongan", symbol: "T$" },
  { code: "TRY", name: "Livre turque", symbol: "₺" },
  { code: "TTD", name: "Dollar trinidadien", symbol: "TT$" },
  { code: "TWD", name: "Dollar taïwanais", symbol: "NT$" },
  { code: "TZS", name: "Shilling tanzanien", symbol: "TSh" },
  { code: "UAH", name: "Hryvnia ukrainienne", symbol: "₴" },
  { code: "UGX", name: "Shilling ougandais", symbol: "USh" },
  { code: "UYU", name: "Peso uruguayen", symbol: "UY$" },
  { code: "UZS", name: "Som ouzbek", symbol: "UZS" },
  { code: "VED", name: "Bolivar vénézuélien numérique", symbol: "Bs." },
  { code: "VES", name: "Bolivar vénézuélien souverain", symbol: "Bs.S" },
  { code: "VND", name: "Dong vietnamien", symbol: "₫" },
  { code: "VUV", name: "Vatu vanuatuan", symbol: "VT" },
  { code: "WST", name: "Tala samoan", symbol: "WS$" },
  { code: "XAF", name: "Franc CFA (BEAC)", symbol: "FCFA" },
  { code: "XCD", name: "Dollar des Caraïbes orientales", symbol: "EC$" },
  { code: "XOF", name: "Franc CFA (BCEAO)", symbol: "CFA" },
  { code: "XPF", name: "Franc CFP", symbol: "F" },
  { code: "YER", name: "Rial yéménite", symbol: "YR" },
  { code: "ZAR", name: "Rand sud-africain", symbol: "R" },
  { code: "ZMW", name: "Kwacha zambien", symbol: "ZK" },
  { code: "ZWG", name: "Zig zimbabwéen", symbol: "ZWG" },
];

export const DEVISES: DeviseInfo[] = [...PRINCIPALES, ...AUTRES];

export type DeviseCode = string;

export const DEVISE_CODES: string[] = DEVISES.map((d) => d.code);

export function getDeviseInfo(code?: string | null): DeviseInfo {
  const target = (code || "EUR").toUpperCase();
  const found = DEVISES.find((d) => d.code === target);
  return found ?? DEVISES[0];
}

export function isDeviseSupported(code?: string | null): boolean {
  if (!code) return false;
  return DEVISES.some((d) => d.code === code.toUpperCase());
}

/**
 * Formatte un montant avec la devise indiquée, en respectant les conventions FR.
 * Si la devise est inconnue de `Intl`, on retombe sur un rendu "1 234,56 SYMBOLE".
 *
 * Le caractère espace fine insécable (U+202F) et l'insécable classique (U+00A0)
 * sont remplacés par un espace classique pour rester compatible avec
 * `@react-pdf/renderer` (police Helvetica n'a pas tous les espaces unicode).
 */
export function formatMontant(amount: number, devise?: string | null): string {
  const info = getDeviseInfo(devise);
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: info.code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    })
      .format(Number(amount) || 0)
      .replace(/\u202F/g, " ")
      .replace(/\u00A0/g, " ");
  } catch {
    const number = new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0);
    return `${number} ${info.symbol}`;
  }
}
