import { CP, RTT, TT, LIME, SICK, PEOPLE, buildMonth } from "./shared";

export type PeopleScreen =
  | "home"
  | "absences"
  | "planning"
  | "remote"
  | "time"
  | "expenses"
  | "team"
  | "approvals"
  | "rh"
  | "manage"
  | "mobile";

export const PEOPLE_TABS: { id: PeopleScreen; label: string; count?: number }[] = [
  { id: "home", label: "Aperçu" },
  { id: "absences", label: "Absences" },
  { id: "planning", label: "Planning" },
  { id: "remote", label: "Télétravail" },
  { id: "time", label: "Feuilles de temps" },
  { id: "expenses", label: "Frais & TR" },
  { id: "team", label: "Effectif" },
  { id: "approvals", label: "Inbox", count: 8 },
  { id: "rh", label: "RH" },
  { id: "manage", label: "Admin" },
  { id: "mobile", label: "Mobile" },
];

export function spark(vals: number[], color: string) {
  return vals.map((v) => ({ h: Math.max(4, Math.round(v * 0.28)), bg: color }));
}

function mk(
  label: string,
  value: string,
  unit: string,
  delta: string,
  deltaFg: string,
  fg: string,
  vals: number[],
  hi: string
) {
  return { label, value, unit, delta, deltaFg, fg, spark: spark(vals, hi) };
}

export const kpiCollab = [
  mk("SOLDE DISPONIBLE", "39,5", "jours", "+2,1", "#46D6C0", "#E7ECF2", [30, 40, 45, 50, 55, 60, 52, 58, 64, 70, 76, 88], LIME),
  mk("EXPIRE AU 31/08", "11,0", "jours", "URGENT", "#F2604E", "#F2604E", [90, 88, 84, 80, 74, 68, 60, 52, 44, 34, 22, 12], "#F2604E"),
  mk("POSÉS EN 2026", "17,0", "jours", "+5", "#8B95A5", "#E7ECF2", [10, 18, 22, 30, 34, 40, 46, 50, 58, 66, 72, 80], "#7C8CF8"),
  mk("PROCHAINE ABSENCE", "24/08", "5 j · CP", "J-20", "#8B95A5", "#E7ECF2", [8, 8, 8, 8, 8, 8, 8, 8, 8, 40, 70, 95], CP),
];

export const kpiManager = [
  mk("EN ATTENTE", "3", "demandes", "+2", "#F2874E", "#F2874E", [20, 30, 20, 40, 30, 50, 40, 30, 60, 50, 70, 90], "#F2874E"),
  mk("PRÉSENTS AUJOURD'HUI", "71", "%", "−7 pt", "#F0C24E", "#E7ECF2", [90, 88, 84, 86, 80, 78, 82, 76, 74, 78, 72, 71], "#F0C24E"),
  mk("PIRE JOUR À VENIR", "26/08", "57 %", "SEUIL", "#F2604E", "#F2604E", [80, 78, 76, 74, 72, 70, 68, 66, 64, 60, 58, 57], "#F2604E"),
  mk("DÉLAI DE RÉPONSE", "1,4", "jour", "objectif 2", "#46D6C0", "#46D6C0", [70, 66, 62, 60, 55, 50, 48, 44, 40, 36, 32, 28], CP),
];

export const kpiRh = [
  mk("TAUX D'ABSENCE", "7,2", "%", "−0,8 pt", "#46D6C0", "#E7ECF2", [82, 80, 78, 76, 74, 70, 72, 68, 66, 62, 60, 56], CP),
  mk("DEMANDES / MOIS", "39", "dont 3 en attente", "+11", "#8B95A5", "#E7ECF2", [30, 34, 40, 38, 44, 50, 48, 56, 60, 66, 72, 80], "#7C8CF8"),
  mk("JOURS PERDUS AU 31/08", "6,0", "jours", "3 personnes", "#F2604E", "#F2604E", [10, 14, 18, 22, 28, 34, 40, 48, 56, 66, 78, 92], "#F2604E"),
  mk("PROVISION CP", "48,2", "k€", "+3,4 k€", "#8B95A5", "#E7ECF2", [40, 44, 46, 50, 54, 56, 60, 64, 68, 72, 78, 84], "#F0C24E"),
];

export const todayAbsent = [
  { name: "Inès Lettinger", initials: "IL", color: "#F0C24E", dept: "BUSINESS DEV", type: "Congés payés", typeDot: CP, back: "lun. 10/08", bal: "4,5 j" },
  { name: "Janha Messaoudi", initials: "JM", color: "#F2874E", dept: "SOCIAL MEDIA", type: "Congés payés", typeDot: CP, back: "lun. 17/08", bal: "16,0 j" },
  { name: "Daphnée Bessal", initials: "DB", color: "#B48CF0", dept: "TALENT MGMT", type: "Télétravail", typeDot: TT, back: "lun. 10/08", bal: "21,5 j" },
  { name: "Manon Teboul", initials: "MT", color: "#46D6C0", dept: "TALENT MGMT", type: "Congés payés", typeDot: CP, back: "lun. 10/08", bal: "7,5 j" },
];

export const coverage = [
  { dept: "Direction générale", label: "2/2 · 100%", pct: 100, color: CP },
  { dept: "Business Development", label: "3/4 · 75%", pct: 75, color: CP },
  { dept: "Social Media", label: "0/1 · 0%", pct: 4, color: "#F2604E" },
  { dept: "Talent Management", label: "6/7 · 86%", pct: 86, color: CP },
  { dept: "Agence", label: "10/14 · 71%", pct: 71, color: RTT },
];

export const feed = [
  { time: "09:41", dot: LIME, text: "Manon Jullien · récupération du 07/08 déposée, dernier délai le 16/08" },
  { time: "08:12", dot: CP, text: "Alice Marinaro · congés payés 27–28/08 approuvés par Sofian" },
  { time: "07:55", dot: "#F2874E", text: "Article 1.6 : Daphnée Bessal déclare 2 jours de télétravail en S33 pour un droit de 1" },
  { time: "hier", dot: "#F0C24E", text: "Feuille de temps de Leyna Khaled passée en pause · information demandée" },
  { time: "hier", dot: TT, text: "Anna Jaume · 3 dépassements de moins de 30 min à valider" },
  { time: "02/08", dot: "#7E8998", text: "Titres-restaurant de juillet calculés · 14 jours effectifs retenus" },
];

export const suggestions = [
  { day: "21", month: "SEPT", title: "Semaine sans absence", detail: "0 conflit dans ton équipe", score: "A+", scoreFg: LIME },
  { day: "12", month: "NOV", title: "Pont du 11 novembre", detail: "2 jours posés = 5 de repos", score: "A", scoreFg: LIME },
  { day: "19", month: "OCT", title: "Vacances scolaires zone C", detail: "3 collègues déjà positionnés", score: "B", scoreFg: RTT },
];

export const absenceMonths = [
  buildMonth(2026, 7, "AOÛT 2026", { 4: "today", 24: "sel", 25: "sel", 26: "sel", 27: "sel", 28: "sel", 10: "tt", 11: "tt", 12: "tt" }),
  buildMonth(2026, 8, "SEPTEMBRE 2026", { 21: "soft", 22: "soft", 23: "soft", 24: "soft", 25: "soft" }),
  buildMonth(2026, 9, "OCTOBRE 2026", { 19: "rtt", 20: "rtt" }),
];

export const balances = [
  { name: "Congés payés 2024/2025", code: "CP-2425 · MAI 24 → MAI 25", acquired: "25,0", taken: "14,0", left: "11,0", posable: "11,0", posFg: "#E5F2B5", exp: "31/08/26", expFg: "#F2604E", color: CP },
  { name: "Congés payés 2025/2026", code: "CP-2526 · MAI 25 → MAI 26", acquired: "25,0", taken: "2,0", left: "23,0", posable: "18,0", posFg: "#F0C24E", exp: "31/08/27", expFg: "#8B95A5", color: CP },
  { name: "Récupération 2026", code: "RECUP-26 · DÉLAI ACCORD", acquired: "7,0", taken: "5,0", left: "2,0", posable: "2,0", posFg: "#E5F2B5", exp: "16/08/26", expFg: "#F2604E", color: RTT },
  { name: "RTT 2026", code: "RTT-26 · ACQUIS AU FIL DE L'AN", acquired: "9,0", taken: "3,5", left: "5,5", posable: "4,0", posFg: "#F0C24E", exp: "31/12/26", expFg: "#8B95A5", color: RTT },
];

export const leaveRules = [
  { tag: "1 AN", tagBg: "rgba(229,242,181,.1)", tagFg: "#E5F2B5", text: "Pose autorisée à partir d'un an d'ancienneté. En deçà, la demande est bloquée et basculée en congé sans solde avec approbation." },
  { tag: "ACQ.", tagBg: "#1D2530", tagFg: "#8B95A5", text: "Le temps d'acquisition détermine ce qui est réellement posable : période de référence de mai à mai." },
  { tag: "RÉCUP", tagBg: "rgba(240,194,78,.13)", tagFg: "#F0C24E", text: "La récupération doit être prise dans le délai prévu par l'accord, sinon elle est perdue." },
  { tag: "PAIE", tagBg: "#1D2530", tagFg: "#8B95A5", text: "L'export paie dissocie congés payés, récupération et sécurité sociale, avec une ligne par date." },
];

export const history = [
  { label: "Congés payés · 06 → 10/07", days: "5,0 j", color: CP },
  { label: "RTT · 22/05", days: "1,0 j", color: RTT },
  { label: "Télétravail · 14 → 16/04", days: "3,0 j", color: TT },
];

export const GANTT: Record<string, { meta: string; rows: [string, [number, number, string][]][] }> = {
  "DIRECTION GÉNÉRALE": { meta: "2 PERSONNES · 0 ABSENT", rows: [["Sofian Ayad-Zeddam", []], ["Maud Arekonamand", [[8, 8, "half"], [10, 10, "half"], [14, 16, "half"], [23, 23, "half"]]]] },
  "BUSINESS DEVELOPMENT": { meta: "4 PERSONNES · 1 ABSENT", rows: [["Ambre Claude", []], ["Manon Jullien", [[4, 4, RTT]]], ["Leyna Khaled", [[7, 11, TT], [14, 18, TT]]], ["Inès Lettinger", [[1, 4, CP], [16, 17, CP]]]] },
  "SOCIAL MEDIA": { meta: "1 PERSONNE · 1 ABSENTE", rows: [["Janha Messaoudi", [[0, 4, CP], [7, 11, CP]]]] },
  "TALENT MANAGEMENT": { meta: "7 PERSONNES · 1 ABSENTE", rows: [["Daphnée Bessal", [[0, 4, TT]]], ["Joey Farrugia", [[14, 18, CP], [21, 25, CP]]], ["Anna Jaume", []], ["Coralie Loutre", [[7, 11, CP]]], ["Alice Marinaro", [[24, 25, CP]]], ["Cinssia Soudani", [[14, 18, CP], [24, 25, CP]]], ["Manon Teboul", [[0, 4, CP], [7, 9, TT], [26, 26, SICK]]]] },
};

export const INBOX = [
  { idx: 0, module: "ABSENCES", name: "Joey Farrugia", initials: "JF", color: "#46D6C0", dept: "TALENT MGMT · EMP-0012", type: "Congés payés", typeDot: CP, range: "24/08 → 28/08", days: "5,0 j", flag: "CONFLIT", flagBg: "rgba(242,96,78,.15)", flagFg: "#F2604E", ref: "REQ-2026-0184", after: "SEUIL COUVERTURE 60%", asked: "02/08 09:14", impact: "4/7 · 57%", impactPct: 57, impactFg: "#F2604E", note: "Cinssia Soudani couvre 4 des 5 jours. Talent Management passe sous le seuil de 60%. Solde après validation : 9,0 j." },
  { idx: 1, module: "ABSENCES", name: "Alice Marinaro", initials: "AM", color: "#B48CF0", dept: "TALENT MGMT · EMP-0024", type: "Congés payés", typeDot: CP, range: "27/08 → 28/08", days: "2,0 j", flag: "OK", flagBg: "rgba(70,214,192,.15)", flagFg: "#46D6C0", ref: "REQ-2026-0186", after: "CONFORME", asked: "03/08 16:02", impact: "5/7 · 71%", impactPct: 71, impactFg: "#46D6C0", note: "Aucun chevauchement bloquant. Solde après validation : 14,5 j." },
  { idx: 2, module: "ABSENCES", name: "Manon Jullien", initials: "MJ", color: "#46D6C0", dept: "BUSINESS DEV · EMP-0021", type: "Récupération", typeDot: RTT, range: "07/08", days: "1,0 j", flag: "DÉLAI", flagBg: "rgba(240,194,78,.15)", flagFg: "#F0C24E", ref: "REQ-2026-0187", after: "RÉCUP À POSER AVANT 16/08", asked: "04/08 08:41", impact: "3/4 · 75%", impactPct: 75, impactFg: "#46D6C0", note: "Dernier créneau utile : la récupération acquise le 16/05 expire le 16/08 selon l'accord." },
  { idx: 3, module: "TÉLÉTRAVAIL", name: "Daphnée Bessal", initials: "DB", color: "#B48CF0", dept: "TALENT MGMT · EMP-0009", type: "Télétravail exceptionnel", typeDot: TT, range: "13/08", days: "+1 j", flag: "HORS 1.6", flagBg: "rgba(242,96,78,.15)", flagFg: "#F2604E", ref: "TT-2026-0071", after: "ART. 1.6 · DROIT 1 J", asked: "01/08 18:22", impact: "2 j / 1 j", impactPct: 100, impactFg: "#F2604E", note: "Semaine 33 : 1 jour d'absence, le droit est donc de 1 jour. Compensation proposée en S34 (3 → 2 jours). Accord managérial requis." },
  { idx: 4, module: "TEMPS", name: "Leyna Khaled", initials: "LK", color: "#7C8CF8", dept: "BUSINESS DEV · EMP-0042", type: "Feuille de temps juillet", typeDot: "#7C8CF8", range: "JUIL. 2026", days: "163,2 h", flag: "EN PAUSE", flagBg: "rgba(240,194,78,.15)", flagFg: "#F0C24E", ref: "TS-2026-07-0042", after: "INFO DEMANDÉE · RÉPONSE REÇUE", asked: "27/07 19:40", impact: "HS 11,5 h", impactPct: 76, impactFg: "#F0C24E", note: "Précision demandée sur les 2 h du samedi 11/07, réponse apportée le 28/07. Signature électronique à déclencher après approbation." },
  { idx: 5, module: "TEMPS", name: "Manon Teboul", initials: "MT", color: "#46D6C0", dept: "TALENT MGMT · EMP-0007", type: "Aménagement horaire", typeDot: "#A5B0FA", range: "10/07", days: "1,0 h", flag: "À VALIDER", flagBg: "rgba(124,140,248,.15)", flagFg: "#A5B0FA", ref: "AH-2026-0042", after: "PAUSE 12:30 → 13:30", asked: "09/07 11:05", impact: "SANS IMPACT", impactPct: 100, impactFg: "#46D6C0", note: "Décalage de la pause déjeuner à 13:30–14:30, tournage client jusqu'à 13h15. Volume horaire inchangé." },
  { idx: 6, module: "TEMPS", name: "Anna Jaume", initials: "AJ", color: "#5FB8E8", dept: "TALENT MGMT · EMP-0015", type: "Heures sup. < 30 min", typeDot: RTT, range: "S30 · 3 JOURS", days: "0,4 h", flag: "SUIVI", flagBg: "rgba(240,194,78,.15)", flagFg: "#F0C24E", ref: "HS-2026-0318", after: "MAJORATION 25%", asked: "26/07 20:14", impact: "0,4 h", impactPct: 12, impactFg: "#F0C24E", note: "Trois dépassements de moins de 30 minutes. Validation manager requise avant intégration au décompte des heures supplémentaires." },
  { idx: 7, module: "FRAIS", name: "Ambre Claude", initials: "AC", color: "#F2874E", dept: "BUSINESS DEV · EMP-0018", type: "Note de frais + IK", typeDot: "#F2874E", range: "JUIL. 2026", days: "253,18 €", flag: "DOC", flagBg: "rgba(242,135,78,.15)", flagFg: "#F2874E", ref: "NDF-2026-07-018", after: "ASSURANCE EXPIRE 31/12/26", asked: "31/07 17:33", impact: "412 KM · 5 CV", impactPct: 64, impactFg: "#F2874E", note: "Indemnités kilométriques calculées au barème 0,339 €/km. L'attestation d'assurance doit être renouvelée avant le 31/12." },
];

export const remoteWeeks = [
  { n: 32, range: "03 → 07/08", abs: "0", absFg: "#8B95A5", right: "3 j", st: "CONFORME", stBg: "rgba(70,214,192,.13)", stFg: "#46D6C0",
    days: [{ label: "L", bg: "#1D2530", fg: "#8B95A5" }, { label: "M", bg: "#7C8CF8", fg: "#0A0C0F" }, { label: "M", bg: "#7C8CF8", fg: "#0A0C0F" }, { label: "J", bg: "#1D2530", fg: "#8B95A5" }, { label: "V", bg: "#7C8CF8", fg: "#0A0C0F" }] },
  { n: 33, range: "10 → 14/08", abs: "1", absFg: "#F0C24E", right: "1 j", st: "DÉPASSEMENT", stBg: "rgba(242,96,78,.15)", stFg: "#F2604E",
    days: [{ label: "L", bg: "#46D6C0", fg: "#0A0C0F" }, { label: "M", bg: "#7C8CF8", fg: "#0A0C0F" }, { label: "M", bg: "#1D2530", fg: "#8B95A5" }, { label: "J", bg: "#7C8CF8", fg: "#0A0C0F", ring: "inset 0 0 0 1.4px #F2604E" }, { label: "V", bg: "#1D2530", fg: "#8B95A5" }] },
  { n: 34, range: "17 → 21/08", abs: "0", absFg: "#8B95A5", right: "3 j", st: "CONFORME", stBg: "rgba(70,214,192,.13)", stFg: "#46D6C0",
    days: [{ label: "L", bg: "#7C8CF8", fg: "#0A0C0F" }, { label: "M", bg: "#1D2530", fg: "#8B95A5" }, { label: "M", bg: "#7C8CF8", fg: "#0A0C0F" }, { label: "J", bg: "#1D2530", fg: "#8B95A5" }, { label: "V", bg: "#7C8CF8", fg: "#0A0C0F" }] },
  { n: 35, range: "24 → 28/08", abs: "5", absFg: "#F2604E", right: "0 j", st: "AUCUN DROIT", stBg: "rgba(242,96,78,.15)", stFg: "#F2604E",
    days: [{ label: "L", bg: "#46D6C0", fg: "#0A0C0F" }, { label: "M", bg: "#46D6C0", fg: "#0A0C0F" }, { label: "M", bg: "#46D6C0", fg: "#0A0C0F" }, { label: "J", bg: "#46D6C0", fg: "#0A0C0F" }, { label: "V", bg: "#46D6C0", fg: "#0A0C0F" }] },
];

export const remoteTeam = [
  { name: "Daphnée Bessal", initials: "DB", color: "#B48CF0", dept: "TALENT MGMT", avenant: "3 J / SEM.", declared: "2 j", right: "1 j", ctl: "HORS 1.6", ctlBg: "rgba(242,96,78,.15)", ctlFg: "#F2604E" },
  { name: "Leyna Khaled", initials: "LK", color: "#7C8CF8", dept: "BUSINESS DEV", avenant: "3 J / SEM.", declared: "3 j", right: "3 j", ctl: "CONFORME", ctlBg: "rgba(70,214,192,.13)", ctlFg: "#46D6C0" },
  { name: "Manon Teboul", initials: "MT", color: "#46D6C0", dept: "TALENT MGMT", avenant: "2 J / SEM.", declared: "1 j", right: "1 j", ctl: "CONFORME", ctlBg: "rgba(70,214,192,.13)", ctlFg: "#46D6C0" },
  { name: "Coralie Loutre", initials: "CL", color: "#F06FA8", dept: "TALENT MGMT", avenant: "2 J / SEM.", declared: "2 j", right: "1 j", ctl: "HORS 1.6", ctlBg: "rgba(242,96,78,.15)", ctlFg: "#F2604E" },
  { name: "Anna Jaume", initials: "AJ", color: "#5FB8E8", dept: "TALENT MGMT", avenant: "3 J / SEM.", declared: "0 j", right: "3 j", ctl: "NON DÉCLARÉ", ctlBg: "#1D2530", ctlFg: "#8B95A5" },
  { name: "Ambre Claude", initials: "AC", color: "#F2874E", dept: "BUSINESS DEV", avenant: "AUCUN", declared: "0 j", right: "0 j", ctl: "SANS AVENANT", ctlBg: "#1D2530", ctlFg: "#8B95A5" },
];

export const tsGroups = [
  { week: "S30 · 20→26/07", count: 4, rows: [
    { initials: "CL", name: "Coralie Loutre", color: "#F06FA8", tag: "HS", tagBg: "rgba(240,194,78,.13)", tagFg: "#F0C24E", bar: 92, active: true },
    { initials: "LK", name: "Leyna Khaled", color: "#7C8CF8", tag: "PAUSE", tagBg: "rgba(240,194,78,.13)", tagFg: "#F0C24E", bar: 88, active: false },
    { initials: "AJ", name: "Anna Jaume", color: "#5FB8E8", tag: "<30", tagBg: "rgba(240,194,78,.13)", tagFg: "#F0C24E", bar: 76, active: false },
    { initials: "JF", name: "Joey Farrugia", color: "#46D6C0", tag: "OK", tagBg: "rgba(70,214,192,.13)", tagFg: "#46D6C0", bar: 100, active: false },
  ]},
  { week: "S29 · 13→19/07", count: 5, rows: [
    { initials: "MT", name: "Manon Teboul", color: "#46D6C0", tag: "AMÉN.", tagBg: "rgba(124,140,248,.15)", tagFg: "#A5B0FA", bar: 100, active: false },
    { initials: "DB", name: "Daphnée Bessal", color: "#B48CF0", tag: "OK", tagBg: "rgba(70,214,192,.13)", tagFg: "#46D6C0", bar: 100, active: false },
    { initials: "AM", name: "Alice Marinaro", color: "#B48CF0", tag: "OK", tagBg: "rgba(70,214,192,.13)", tagFg: "#46D6C0", bar: 98, active: false },
    { initials: "CS", name: "Cinssia Soudani", color: "#F2C24E", tag: "OK", tagBg: "rgba(70,214,192,.13)", tagFg: "#46D6C0", bar: 100, active: false },
    { initials: "AC", name: "Ambre Claude", color: "#F2874E", tag: "OK", tagBg: "rgba(70,214,192,.13)", tagFg: "#46D6C0", bar: 95, active: false },
  ]},
];

export const salaryRows = [
  { name: "Sofian Ayad-Zeddam", initials: "SA", color: "#E5F2B5", matricule: "EMP-0001", brut: "5 200", seniority: "4 a 7 m", senFg: "#8B95A5", mut: "ADHÉRENT", mutBg: "rgba(70,214,192,.13)", mutFg: "#46D6C0", tr: "14", hs: "—", hsFg: "#7E8998", variable: "—" },
  { name: "Maud Arekonamand", initials: "MA", color: "#8ED98A", matricule: "EMP-0004", brut: "2 950", seniority: "3 a 2 m", senFg: "#8B95A5", mut: "ADHÉRENT", mutBg: "rgba(70,214,192,.13)", mutFg: "#46D6C0", tr: "18", hs: "2,0", hsFg: "#F0C24E", variable: "—" },
  { name: "Manon Teboul", initials: "MT", color: "#46D6C0", matricule: "EMP-0007", brut: "2 700", seniority: "2 a 11 m", senFg: "#8B95A5", mut: "DISPENSE", mutBg: "rgba(240,194,78,.13)", mutFg: "#F0C24E", tr: "12", hs: "—", hsFg: "#7E8998", variable: "180 €" },
  { name: "Daphnée Bessal", initials: "DB", color: "#B48CF0", matricule: "EMP-0009", brut: "2 850", seniority: "2 a 6 m", senFg: "#8B95A5", mut: "ADHÉRENT", mutBg: "rgba(70,214,192,.13)", mutFg: "#46D6C0", tr: "15", hs: "1,5", hsFg: "#F0C24E", variable: "—" },
  { name: "Coralie Loutre", initials: "CL", color: "#F06FA8", matricule: "EMP-0011", brut: "2 780", seniority: "2 a 3 m", senFg: "#8B95A5", mut: "ADHÉRENT", mutBg: "rgba(70,214,192,.13)", mutFg: "#46D6C0", tr: "16", hs: "—", hsFg: "#7E8998", variable: "120 €" },
  { name: "Joey Farrugia", initials: "JF", color: "#46D6C0", matricule: "EMP-0012", brut: "2 650", seniority: "1 a 10 m", senFg: "#8B95A5", mut: "ADHÉRENT", mutBg: "rgba(70,214,192,.13)", mutFg: "#46D6C0", tr: "17", hs: "—", hsFg: "#7E8998", variable: "—" },
  { name: "Anna Jaume", initials: "AJ", color: "#5FB8E8", matricule: "EMP-0015", brut: "2 720", seniority: "1 a 7 m", senFg: "#8B95A5", mut: "DISPENSE", mutBg: "rgba(240,194,78,.13)", mutFg: "#F0C24E", tr: "19", hs: "0,4", hsFg: "#F0C24E", variable: "—" },
  { name: "Ambre Claude", initials: "AC", color: "#F2874E", matricule: "EMP-0018", brut: "3 100", seniority: "1 a 4 m", senFg: "#8B95A5", mut: "ADHÉRENT", mutBg: "rgba(70,214,192,.13)", mutFg: "#46D6C0", tr: "13", hs: "—", hsFg: "#7E8998", variable: "420 €" },
  { name: "Cinssia Soudani", initials: "CS", color: "#F2C24E", matricule: "EMP-0019", brut: "2 600", seniority: "1 a 2 m", senFg: "#8B95A5", mut: "ADHÉRENT", mutBg: "rgba(70,214,192,.13)", mutFg: "#46D6C0", tr: "16", hs: "—", hsFg: "#7E8998", variable: "—" },
  { name: "Manon Jullien", initials: "MJ", color: "#46D6C0", matricule: "EMP-0021", brut: "2 900", seniority: "11 m", senFg: "#F2874E", mut: "ADHÉRENT", mutBg: "rgba(70,214,192,.13)", mutFg: "#46D6C0", tr: "18", hs: "1,0", hsFg: "#F0C24E", variable: "250 €" },
  { name: "Alice Marinaro", initials: "AM", color: "#B48CF0", matricule: "EMP-0024", brut: "2 580", seniority: "9 m", senFg: "#F2874E", mut: "ADHÉRENT", mutBg: "rgba(70,214,192,.13)", mutFg: "#46D6C0", tr: "17", hs: "—", hsFg: "#7E8998", variable: "—" },
  { name: "Janha Messaoudi", initials: "JM", color: "#F2874E", matricule: "EMP-0027", brut: "2 640", seniority: "8 m", senFg: "#F2874E", mut: "ADHÉRENT", mutBg: "rgba(70,214,192,.13)", mutFg: "#46D6C0", tr: "11", hs: "—", hsFg: "#7E8998", variable: "—" },
  { name: "Inès Lettinger", initials: "IL", color: "#F0C24E", matricule: "EMP-0030", brut: "2 900", seniority: "6 m", senFg: "#F2874E", mut: "ADHÉRENT", mutBg: "rgba(70,214,192,.13)", mutFg: "#46D6C0", tr: "10", hs: "—", hsFg: "#7E8998", variable: "310 €" },
  { name: "Leyna Khaled", initials: "LK", color: "#7C8CF8", matricule: "EMP-0042", brut: "2 570", seniority: "4 m", senFg: "#F2874E", mut: "ADHÉRENT", mutBg: "rgba(70,214,192,.13)", mutFg: "#46D6C0", tr: "16", hs: "11,5", hsFg: "#F2874E", variable: "—" },
];

export const docRows = [
  { name: "Contrat de travail CDI", who: "LEYNA KHALED · EMP-0042", type: "CONTRAT", signed: "02/04/26", st: "SIGNÉ", stBg: "rgba(70,214,192,.13)", stFg: "#46D6C0" },
  { name: "Avenant télétravail 3 j / semaine", who: "DAPHNÉE BESSAL · EMP-0009", type: "AVENANT", signed: "12/01/26", st: "SIGNÉ", stBg: "rgba(70,214,192,.13)", stFg: "#46D6C0" },
  { name: "Avenant passage 2 j → 3 j", who: "MANON TEBOUL · EMP-0007", type: "AVENANT", signed: "—", st: "À SIGNER", stBg: "rgba(240,194,78,.13)", stFg: "#F0C24E" },
  { name: "Accord d'entreprise télétravail", who: "TOUS · ART. 1.6", type: "ACCORD", signed: "04/11/25", st: "EN VIGUEUR", stBg: "rgba(70,214,192,.13)", stFg: "#46D6C0" },
  { name: "Attestation adresse de télétravail", who: "LEYNA KHALED · EMP-0042", type: "JUSTIFICATIF", signed: "02/08/26", st: "À VÉRIFIER", stBg: "rgba(242,135,78,.15)", stFg: "#F2874E" },
  { name: "Dispense d'affiliation mutuelle", who: "ANNA JAUME · EMP-0015", type: "MUTUELLE", signed: "15/01/26", st: "VALIDE 31/12", stBg: "rgba(70,214,192,.13)", stFg: "#46D6C0" },
];

export const exportBlocks = [
  { name: "Congés payés", code: "CP · 1 LIGNE PAR DATE", dot: CP, count: "38 j" },
  { name: "Récupération", code: "RECUP · DISSOCIÉ", dot: RTT, count: "7 j" },
  { name: "Sécurité sociale", code: "SS · ARRÊTS MALADIE", dot: "#F2874E", count: "4 j" },
];

export const paletteCommands = [
  { key: "↵", label: "Poser une absence", code: "leave.create", active: true },
  { key: "A", label: "Approuver les 3 demandes en attente", code: "approvals.bulk" },
  { key: "⌘E", label: "Exporter le journal de paie d'août", code: "payroll.export" },
];

export const palettePeople = [
  { key: "1", label: "Leyna Khaled · TÉLÉTRAVAIL", code: "EMP-0042" },
  { key: "2", label: "Joey Farrugia · PRÉSENT", code: "EMP-0012" },
  { key: "3", label: "Coralie Loutre · PRÉSENT", code: "EMP-0011" },
];

export { PEOPLE };
