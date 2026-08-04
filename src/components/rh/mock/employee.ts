/**
 * Données de démonstration de l'espace salarié (Leyna Khaled — EMP-0042).
 * Aucune donnée réelle : la maquette est figée au mardi 04 août 2026, semaine 32.
 */
import {
  buildMonth,
  PEOPLE,
  type MonthGrid,
} from "@/components/rh/mock/shared";
import {
  mealVoucherCount,
  mileageAllowance,
  splitOvertime,
} from "@/components/rh/lib/calculations";

/* ------------------------------------------------------------------ */
/* Identité                                                            */
/* ------------------------------------------------------------------ */

export const EMPLOYEE = {
  name: "Leyna Khaled",
  initials: "LK",
  color: "#7C8CF8",
  matricule: "EMP-0042",
  role: "Account Manager",
  team: "Business Development",
  manager: "S. Ayad-Zeddam",
  managerFull: "Sofian Ayad-Zeddam",
  managerInitials: "SA",
  hiredAt: "02/12/2025",
  cpUnlockAt: "02/12/2026",
  contract: "CDI · 35 h / semaine",
  weeklyHours: 35,
} as const;

export const TODAY = {
  eyebrow: "MAR. 04 AOÛT 2026 · SEMAINE 32 · TÉLÉTRAVAIL AUJOURD'HUI",
  greeting: "Bonjour Leyna",
  weekLabel: "SEMAINE 32 · 03 → 09 AOÛT 2026",
} as const;

/* ------------------------------------------------------------------ */
/* Helpers temps                                                       */
/* ------------------------------------------------------------------ */

export function hm(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** 531 → "8 h 51" */
export function minutesLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

/** 531 → "8h51" */
export function minutesCompact(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Accueil — KPI                                                       */
/* ------------------------------------------------------------------ */

export type EmployeeKpi = {
  id: "posable" | "cp" | "hs" | "frais";
  label: string;
  value: string;
  unit: string;
  sub: string;
  tone: string;
  locked?: boolean;
};

export const kpis: EmployeeKpi[] = [
  {
    id: "posable",
    label: "JOURS POSABLES",
    value: "4,0",
    unit: "j",
    sub: "3,0 RTT · 1,0 récupération",
    tone: "#E5F2B5",
  },
  {
    id: "cp",
    label: "CONGÉS PAYÉS",
    value: "8,33",
    unit: "j",
    sub: "Bloqués jusqu'au 02/12/2026",
    tone: "#46D6C0",
    locked: true,
  },
  {
    id: "hs",
    label: "HEURES SUPP. — AOÛT",
    value: "11,5",
    unit: "h",
    sub: "8,0 h à 25 % · 3,5 h à 50 %",
    tone: "#F0C24E",
  },
  {
    id: "frais",
    label: "FRAIS EN COURS",
    value: "253",
    unit: "€",
    sub: "6 lignes · 1 justificatif manquant",
    tone: "#F2874E",
  },
];

/* ------------------------------------------------------------------ */
/* Accueil — à faire                                                   */
/* ------------------------------------------------------------------ */

export type EmployeeTodo = {
  id: string;
  bar: string;
  tag: string;
  tagBg: string;
  title: string;
  meta: string;
  cta: string;
  target: "time" | "expenses" | "folder" | "requests";
  urgent?: boolean;
};

export const todos: EmployeeTodo[] = [
  {
    id: "todo-pause",
    bar: "#F2604E",
    tag: "URGENT",
    tagBg: "#F2604E",
    title: "Maud vous demande de confirmer votre pause déjeuner du jeudi 06/08",
    meta: "33 min enregistrées · minimum conventionnel 45 min · réponse avant le 08/08",
    cta: "Répondre",
    target: "time",
    urgent: true,
  },
  {
    id: "todo-justif",
    bar: "#F2874E",
    tag: "FRAIS",
    tagBg: "#F2874E",
    title: "Justificatif manquant — Taxi G7 du 28/07 · 34,50 €",
    meta: "Sans justificatif au 10/08, la ligne sera retirée de la note de frais de juillet",
    cta: "Ajouter le reçu",
    target: "expenses",
  },
  {
    id: "todo-mutuelle",
    bar: "#F0C24E",
    tag: "DOSSIER",
    tagBg: "#F0C24E",
    title: "Attestation mutuelle Alan à signer",
    meta: "Formule Confort · adhésion du 01/01/2026 · signature électronique",
    cta: "Signer",
    target: "folder",
  },
  {
    id: "todo-adresse",
    bar: "#7C8CF8",
    tag: "TÉLÉTRAVAIL",
    tagBg: "#7C8CF8",
    title: "Adresse de télétravail à mettre à jour",
    meta: "L'attestation d'assurance habitation date de 2025 — requise par l'article 1.6",
    cta: "Mettre à jour",
    target: "folder",
  },
];

/* ------------------------------------------------------------------ */
/* Accueil — ma semaine / absents / suggestions                        */
/* ------------------------------------------------------------------ */

export type MyWeekDay = {
  dow: string;
  date: string;
  mode: "office" | "remote";
  modeLabel: string;
  detail: string;
  today?: boolean;
};

export const myWeek: MyWeekDay[] = [
  { dow: "LUN", date: "03", mode: "office", modeLabel: "Bureau", detail: "8 h 51" },
  {
    dow: "MAR",
    date: "04",
    mode: "remote",
    modeLabel: "Télétravail",
    detail: "En cours",
    today: true,
  },
  { dow: "MER", date: "05", mode: "office", modeLabel: "Bureau", detail: "Prévu 7 h" },
  { dow: "JEU", date: "06", mode: "remote", modeLabel: "Télétravail", detail: "Prévu 7 h" },
  { dow: "VEN", date: "07", mode: "office", modeLabel: "Bureau", detail: "Prévu 7 h" },
];

export type AwayPerson = {
  name: string;
  initials: string;
  color: string;
  reason: string;
  tone: string;
  until: string;
};

export const awayToday: AwayPerson[] = PEOPLE.filter(
  (p) => p.m !== EMPLOYEE.matricule && p.st !== "OK"
).map((p) => ({
  name: p.n,
  initials: p.i,
  color: p.c,
  reason: p.st === "ABSENT" ? "Congés payés" : "Télétravail",
  tone: p.st === "ABSENT" ? "#46D6C0" : "#7C8CF8",
  until: p.st === "ABSENT" ? "Retour le 10/08" : "Sur site demain",
}));

export type Suggestion = {
  score: "A+" | "A" | "B";
  scoreBg: string;
  period: string;
  title: string;
  reasons: string[];
  coverage: string;
};

export const suggestions: Suggestion[] = [
  {
    score: "A+",
    scoreBg: "#E5F2B5",
    period: "S36 · 31/08 → 04/09",
    title: "Meilleure fenêtre du trimestre",
    reasons: [
      "Aucun livrable client sur la semaine",
      "Équipe Business Dev à 80 % de présence",
      "Aucune demande concurrente déposée",
    ],
    coverage: "Couverture après pose : 80 %",
  },
  {
    score: "A",
    scoreBg: "#46D6C0",
    period: "VEN 21/08",
    title: "Pont de fin de semaine",
    reasons: [
      "Charge faible après la livraison Sephora",
      "1 RTT suffit pour un week-end de 3 jours",
      "Manager disponible pour valider",
    ],
    coverage: "Couverture après pose : 86 %",
  },
  {
    score: "B",
    scoreBg: "#F0C24E",
    period: "S39 · 21/09 → 25/09",
    title: "Possible mais tendu",
    reasons: [
      "2 collègues déjà absents sur la semaine",
      "Comité marques le 23/09",
      "Congés payés indisponibles avant le 02/12",
    ],
    coverage: "Couverture après pose : 57 %",
  },
];

/* ------------------------------------------------------------------ */
/* Palette de commandes                                                */
/* ------------------------------------------------------------------ */

export const paletteSections = [
  {
    title: "MES ACTIONS",
    items: [
      { key: "01", label: "Poser une absence", code: "⌘N", active: true },
      { key: "02", label: "Déclarer une journée de télétravail exceptionnelle", code: "TT" },
      { key: "03", label: "Répondre à Maud — pause déjeuner du 06/08", code: "!" },
      { key: "04", label: "Ajouter un justificatif de frais", code: "⌘J" },
      { key: "05", label: "Corriger un badgeage", code: "⌘B" },
      { key: "06", label: "Télécharger mon bulletin de juillet 2026", code: "PDF" },
      { key: "07", label: "Mettre à jour mon adresse", code: "→" },
      { key: "08", label: "Voir mes demandes en attente", code: "3" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Mes absences                                                        */
/* ------------------------------------------------------------------ */

const augustMarks: Record<number, string> = {
  4: "todaytt",
  6: "tt",
  11: "tt",
  12: "sel",
  13: "tt",
  15: "hol",
  18: "tt",
  20: "tt",
  24: "rtt",
  25: "tt",
  27: "tt",
};

const septemberMarks: Record<number, string> = {
  1: "tt",
  3: "tt",
  8: "tt",
  10: "tt",
  15: "tt",
  17: "tt",
  21: "blocked",
  22: "blocked",
  23: "blocked",
  24: "tt",
  29: "tt",
};

const octoberMarks: Record<number, string> = {
  1: "tt",
  6: "tt",
  8: "tt",
  13: "tt",
  15: "tt",
  20: "tt",
  22: "tt",
  27: "tt",
  29: "tt",
};

export const leaveMonths: MonthGrid[] = [
  buildMonth(2026, 7, "AOÛT 2026", augustMarks),
  buildMonth(2026, 8, "SEPTEMBRE 2026", septemberMarks),
  buildMonth(2026, 9, "OCTOBRE 2026", octoberMarks),
];

export const leaveLegend = [
  { label: "Télétravail", color: "rgba(124,140,248,.35)", fg: "#A5B0FA" },
  { label: "Demande en cours", color: "#F0C24E", fg: "#0A0C0F" },
  { label: "Férié", color: "rgba(242,194,78,.28)", fg: "#F2C24E" },
  { label: "Indisponible", color: "#0E1116", fg: "#3A4553" },
];

export type BalanceRow = {
  code: string;
  label: string;
  color: string;
  acquired: string;
  taken: string;
  pending: string;
  balance: string;
  bookable: string;
  note: string;
  blocked?: boolean;
};

export const balances: BalanceRow[] = [
  {
    code: "CP",
    label: "Congés payés",
    color: "#46D6C0",
    acquired: "10,83",
    taken: "2,50",
    pending: "0,00",
    balance: "8,33",
    bookable: "0,00",
    note: "1 an d'ancienneté requis — déblocage le 02/12/2026",
    blocked: true,
  },
  {
    code: "RTT",
    label: "RTT",
    color: "#F0C24E",
    acquired: "4,00",
    taken: "1,00",
    pending: "0,00",
    balance: "3,00",
    bookable: "3,00",
    note: "Acquisition 0,5 j / mois travaillé",
  },
  {
    code: "RECUP",
    label: "Récupération (HS)",
    color: "#E5F2B5",
    acquired: "1,50",
    taken: "0,00",
    pending: "0,50",
    balance: "1,50",
    bookable: "1,00",
    note: "À consommer avant le 30/09/2026",
  },
  {
    code: "SS",
    label: "Congé sans solde",
    color: "#7E8998",
    acquired: "—",
    taken: "0,00",
    pending: "0,00",
    balance: "—",
    bookable: "—",
    note: "Soumis à accord express de la direction",
  },
];

export const leaveDraft = {
  type: "Récupération",
  typeColor: "#E5F2B5",
  date: "12/08/2026",
  dayLabel: "Mercredi 12 août 2026",
  halfDay: true,
  halfDayLabel: "Après-midi (13:30 → 18:00)",
  decompte: "0,5 j",
  balanceBefore: "1,0 j",
  balanceAfter: "0,5 j",
  impact: [
    { label: "Décompte", value: "0,5 j" },
    { label: "Solde récupération", value: "1,0 j → 0,5 j" },
    { label: "Titres-restaurant", value: "−1 (demi-journée)" },
    { label: "Droit télétravail S33", value: "2 j → 1 j" },
  ],
  approver: "S. Ayad-Zeddam",
};

export const teamCoverage = {
  status: "OK",
  headline: "Aucun conflit sur l'équipe",
  detail: "4 présents sur 5 le 12/08 — couverture 80 %",
  members: [
    { initials: "AC", color: "#F2874E", state: "Présente" },
    { initials: "MJ", color: "#46D6C0", state: "Présente" },
    { initials: "IL", color: "#F0C24E", state: "Présente" },
    { initials: "LK", color: "#7C8CF8", state: "Absente ½ j" },
  ],
};

export const recupAlert = {
  title: "1,5 j de récupération expirent le 30/09/2026",
  body:
    "Les heures supplémentaires converties en repos doivent être prises dans les 3 mois. Passé cette date, elles sont perdues et ne sont pas payées.",
};

/* ------------------------------------------------------------------ */
/* Mon télétravail                                                     */
/* ------------------------------------------------------------------ */

export type RemoteWeek = {
  week: string;
  range: string;
  agreement: number;
  entitlement: number;
  planned: { dow: string; date: string }[];
  absences: string;
  status: "ok" | "over" | "future";
  statusLabel: string;
  note: string;
  action?: string;
};

export const remoteWeeks: RemoteWeek[] = [
  {
    week: "S32",
    range: "03 → 09 AOÛT",
    agreement: 2,
    entitlement: 2,
    planned: [
      { dow: "MAR", date: "04" },
      { dow: "JEU", date: "06" },
    ],
    absences: "Aucune absence",
    status: "ok",
    statusLabel: "CONFORME",
    note: "2 jours posés sur 2 autorisés",
  },
  {
    week: "S33",
    range: "10 → 16 AOÛT",
    agreement: 2,
    entitlement: 1,
    planned: [
      { dow: "MAR", date: "11" },
      { dow: "JEU", date: "13" },
    ],
    absences: "Récupération ½ j le 12/08",
    status: "over",
    statusLabel: "DÉPASSEMENT",
    note:
      "Une absence dans la semaine ramène le droit à 1 jour (article 1.6). Un jour doit être retiré avant le 08/08.",
    action: "Retirer le jeudi 13/08",
  },
  {
    week: "S34",
    range: "17 → 23 AOÛT",
    agreement: 2,
    entitlement: 2,
    planned: [
      { dow: "MAR", date: "18" },
      { dow: "JEU", date: "20" },
    ],
    absences: "Aucune absence",
    status: "future",
    statusLabel: "PLANIFIÉ",
    note: "2 jours posés sur 2 autorisés",
  },
  {
    week: "S35",
    range: "24 → 30 AOÛT",
    agreement: 2,
    entitlement: 1,
    planned: [
      { dow: "MAR", date: "25" },
      { dow: "JEU", date: "27" },
    ],
    absences: "RTT le 24/08",
    status: "future",
    statusLabel: "À AJUSTER",
    note: "Le RTT du 24/08 réduira le droit à 1 jour dès validation de la demande.",
  },
];

export const remoteRules = [
  {
    code: "1.6.1",
    text: "2 jours de télétravail par semaine, fixés au mardi et au jeudi par avenant.",
  },
  {
    code: "1.6.2",
    text: "Une à deux absences dans la semaine ramènent le droit à 1 jour de télétravail.",
  },
  {
    code: "1.6.3",
    text: "À partir de 3 jours d'absence, aucun jour de télétravail n'est ouvert.",
  },
  {
    code: "1.6.4",
    text: "Les jours non pris ne sont ni reportés ni indemnisés.",
  },
  {
    code: "1.6.5",
    text: "Attestation d'assurance habitation à jour obligatoire pour le lieu déclaré.",
  },
];

export const remoteExceptional = {
  date: "07/08/2026",
  dayLabel: "Vendredi 07 août 2026",
  reasons: [
    "Rendez-vous médical",
    "Livraison à domicile",
    "Transports perturbés",
    "Autre (à préciser)",
  ],
  selectedReason: "Transports perturbés",
  compensateLabel: "Compenser par un jour sur site la semaine suivante",
  compensateHint: "Recommandé : maintient le quota de 2 jours sur S33.",
};

export const remoteAddress = {
  line1: "18 rue de Paradis",
  line2: "75010 Paris",
  status: "À METTRE À JOUR",
  insurer: "Attestation habitation MAIF — expirée le 31/12/2025",
  declaredAt: "Déclarée le 04/01/2026",
};

/* ------------------------------------------------------------------ */
/* Mon temps — grille de semaine                                       */
/* ------------------------------------------------------------------ */

export type TimeSegment = {
  kind: "work" | "break";
  from: string;
  to: string;
  minutes: number;
  label: string;
  anomaly?: boolean;
};

export type WeekColumn = {
  id: string;
  dow: string;
  date: string;
  mode: "office" | "remote" | "weekend";
  modeLabel: string;
  today: boolean;
  weekend: boolean;
  minutes: number;
  totalLabel: string;
  overtime: number;
  overtimeLabel: string;
  segments: TimeSegment[];
  anomaly?: string;
};

export type WeekGrid = {
  startMin: number;
  endMin: number;
  hours: string[];
  columns: WeekColumn[];
  totalMinutes: number;
  totalLabel: string;
  contractMinutes: number;
  contractLabel: string;
  overtimeMinutes: number;
  overtimeLabel: string;
  at25Label: string;
  at50Label: string;
};

type RawDay = {
  id: string;
  dow: string;
  date: string;
  mode: "office" | "remote" | "weekend";
  today?: boolean;
  punches?: [string, string][];
  anomaly?: string;
};

const RAW_WEEK: RawDay[] = [
  {
    id: "lun",
    dow: "LUN",
    date: "03",
    mode: "office",
    punches: [
      ["08:58", "12:31"],
      ["13:29", "18:47"],
    ],
  },
  {
    id: "mar",
    dow: "MAR",
    date: "04",
    mode: "remote",
    today: true,
    punches: [
      ["09:04", "12:46"],
      ["13:34", "18:41"],
    ],
  },
  {
    id: "mer",
    dow: "MER",
    date: "05",
    mode: "office",
    punches: [
      ["08:52", "12:38"],
      ["13:36", "19:12"],
    ],
  },
  {
    id: "jeu",
    dow: "JEU",
    date: "06",
    mode: "remote",
    punches: [
      ["09:11", "12:29"],
      ["13:02", "18:26"],
    ],
    anomaly: "Pause déjeuner de 33 min — minimum conventionnel 45 min",
  },
  {
    id: "ven",
    dow: "VEN",
    date: "07",
    mode: "office",
    punches: [
      ["09:02", "12:34"],
      ["13:31", "18:04"],
    ],
  },
  { id: "sam", dow: "SAM", date: "08", mode: "weekend" },
  { id: "dim", dow: "DIM", date: "09", mode: "weekend" },
];

const MODE_LABEL: Record<RawDay["mode"], string> = {
  office: "Bureau",
  remote: "Télétravail",
  weekend: "Week-end",
};

const DAILY_CONTRACT = 7 * 60;

/** Construit la grille horaire de la semaine affichée (08:00 → 20:00). */
export function buildWeek(): WeekGrid {
  const startMin = hm("08:00");
  const endMin = hm("20:00");

  const hours: string[] = [];
  for (let h = 8; h <= 20; h++) hours.push(`${String(h).padStart(2, "0")}:00`);

  const columns: WeekColumn[] = RAW_WEEK.map((day) => {
    const segments: TimeSegment[] = [];
    let minutes = 0;

    (day.punches ?? []).forEach((punch, index, all) => {
      const [from, to] = punch;
      const worked = hm(to) - hm(from);
      minutes += worked;
      segments.push({
        kind: "work",
        from,
        to,
        minutes: worked,
        label: `${from} → ${to}`,
      });
      const next = all[index + 1];
      if (next) {
        const pause = hm(next[0]) - hm(to);
        segments.push({
          kind: "break",
          from: to,
          to: next[0],
          minutes: pause,
          label: `Pause ${pause} min`,
          anomaly: pause < 45,
        });
      }
    });

    const overtime = day.mode === "weekend" ? 0 : Math.max(0, minutes - DAILY_CONTRACT);

    return {
      id: day.id,
      dow: day.dow,
      date: day.date,
      mode: day.mode,
      modeLabel: MODE_LABEL[day.mode],
      today: Boolean(day.today),
      weekend: day.mode === "weekend",
      minutes,
      totalLabel: minutes ? minutesLabel(minutes) : "—",
      overtime,
      overtimeLabel: overtime ? `+${minutesCompact(overtime)}` : "",
      segments,
      anomaly: day.anomaly,
    };
  });

  const totalMinutes = columns.reduce((sum, c) => sum + c.minutes, 0);
  const contractMinutes = EMPLOYEE.weeklyHours * 60;
  const { at25, at50 } = splitOvertime(totalMinutes, contractMinutes);

  return {
    startMin,
    endMin,
    hours,
    columns,
    totalMinutes,
    totalLabel: minutesCompact(totalMinutes),
    contractMinutes,
    contractLabel: `${EMPLOYEE.weeklyHours}h00`,
    overtimeMinutes: totalMinutes - contractMinutes,
    overtimeLabel: minutesCompact(Math.max(0, totalMinutes - contractMinutes)),
    at25Label: minutesCompact(at25),
    at50Label: minutesCompact(at50),
  };
}

export const weekGrid = buildWeek();

export const pauseRequest = {
  from: "Maud Arekonamand",
  initials: "MA",
  color: "#8ED98A",
  role: "Assistante de direction",
  sentAt: "Hier · 17:42",
  day: "Jeudi 06 août 2026",
  message:
    "Ta pause déjeuner du jeudi est enregistrée à 33 min (12:29 → 13:02). La convention impose 45 min minimum : peux-tu confirmer l'horaire réel ou corriger le badgeage ? La feuille de temps de la semaine reste bloquée tant que le point n'est pas tranché.",
  options: [
    { id: "confirm", label: "Le badgeage est correct — j'ai déjeuné 33 min" },
    { id: "fix", label: "Corriger : 12:29 → 13:14 (45 min)" },
    { id: "other", label: "Autre horaire (préciser)" },
  ],
};

export type HsRow = {
  day: string;
  date: string;
  worked: string;
  base: string;
  extra: string;
  split: string;
  splitTone: string;
};

export const hsRows: HsRow[] = weekGrid.columns
  .filter((c) => c.overtime > 0)
  .map((c) => {
    const splitLabel =
      c.id === "ven"
        ? "0h16 à 25 % · 0h49 à 50 %"
        : `${minutesCompact(c.overtime)} à 25 %`;
    return {
      day: c.dow,
      date: `${c.date}/08`,
      worked: c.totalLabel,
      base: "7 h 00",
      extra: c.overtimeLabel,
      split: splitLabel,
      splitTone: c.id === "ven" ? "#F2874E" : "#F0C24E",
    };
  });

export type FlowStep = {
  label: string;
  meta: string;
  state: "done" | "current" | "blocked" | "todo";
};

export const tsFlow: FlowStep[] = [
  {
    label: "Badgeage automatique",
    meta: "03/08 → 09/08 · 10 pointages",
    state: "done",
  },
  {
    label: "Contrôle des pauses",
    meta: "1 anomalie détectée — jeudi 06/08",
    state: "blocked",
  },
  {
    label: "Réponse du salarié",
    meta: "En attente de votre confirmation",
    state: "current",
  },
  {
    label: "Validation manager",
    meta: "S. Ayad-Zeddam",
    state: "todo",
  },
  {
    label: "Intégration paie",
    meta: "Clôture le 25/08/2026",
    state: "todo",
  },
];

export const tsMonth = {
  label: "AOÛT 2026",
  worked: "43 h 49 sur S32",
  cumul: "Cumul mois : 43 h 49 / 35 h 00",
  hs: "11,5 h de HS cumulées depuis le 01/08",
  recup: "Conversion possible en récupération jusqu'au 20/08",
};

/* ------------------------------------------------------------------ */
/* Mes frais — titres-restaurant                                       */
/* ------------------------------------------------------------------ */

const TR_PARAMS = {
  workedOpenDays: 21,
  leaveDays: 1,
  sickDays: 0,
  halfDays: 1,
  companyMeals: 2,
  reimbursedTravelMeals: 3,
};

export const trCount = mealVoucherCount(TR_PARAMS);

export type TrRow = { label: string; value: string; tone?: string; hint: string };

export const trRows: TrRow[] = [
  {
    label: "Jours ouvrés du mois",
    value: "21",
    hint: "Août 2026 — hors samedis, dimanches et 15/08",
  },
  {
    label: "Congés et RTT",
    value: "−1",
    tone: "#F2874E",
    hint: "RTT du 24/08",
  },
  {
    label: "Arrêts maladie",
    value: "−0",
    hint: "Aucun arrêt sur la période",
  },
  {
    label: "Demi-journées",
    value: "−1",
    tone: "#F2874E",
    hint: "Récupération ½ j du 12/08",
  },
  {
    label: "Repas pris en charge par l'agence",
    value: "−2",
    tone: "#F2874E",
    hint: "Déjeuners d'équipe des 06/08 et 20/08",
  },
  {
    label: "Repas remboursés en note de frais",
    value: "−3",
    tone: "#F2874E",
    hint: "Non cumulable avec un titre-restaurant",
  },
];

export const trFacial = {
  value: "9,50 €",
  employer: "5,70 €",
  employee: "3,80 €",
  employerRate: "60 %",
  totalEmployer: "79,80 €",
  totalEmployee: "53,20 €",
  total: "133,00 €",
  delivery: "Crédit Swile le 28/08/2026",
};

export type TrExclusion = { date: string; label: string; impact: string; tone: string };

export const trExcl: TrExclusion[] = [
  { date: "06/08", label: "Déjeuner d'équipe Glow Up", impact: "−1", tone: "#7C8CF8" },
  { date: "11/08", label: "Repas client remboursé (Sephora)", impact: "−1", tone: "#F2874E" },
  { date: "12/08", label: "Récupération — demi-journée", impact: "−1", tone: "#E5F2B5" },
  { date: "18/08", label: "Repas client remboursé (Dior)", impact: "−1", tone: "#F2874E" },
  { date: "20/08", label: "Déjeuner d'équipe Glow Up", impact: "−1", tone: "#7C8CF8" },
  { date: "24/08", label: "RTT", impact: "−1", tone: "#F0C24E" },
  { date: "26/08", label: "Repas remboursé (shooting Royza)", impact: "−1", tone: "#F2874E" },
];

/* ------------------------------------------------------------------ */
/* Mes frais — note de frais                                           */
/* ------------------------------------------------------------------ */

export type ExpenseLine = {
  id: string;
  date: string;
  label: string;
  category: string;
  project: string;
  amount: string;
  amountValue: number;
  status: "ok" | "missing" | "review";
  statusLabel: string;
};

const IK_AMOUNT = mileageAllowance(78, 5);

export const expLines: ExpenseLine[] = [
  {
    id: "NDF-0412",
    date: "28/07",
    label: "Taxi G7 — Gare du Nord → Client",
    category: "Transport",
    project: "Dior Beauty",
    amount: "34,50 €",
    amountValue: 34.5,
    status: "missing",
    statusLabel: "JUSTIFICATIF MANQUANT",
  },
  {
    id: "NDF-0413",
    date: "29/07",
    label: "Déjeuner client — Le Georges",
    category: "Restauration",
    project: "Sephora",
    amount: "68,40 €",
    amountValue: 68.4,
    status: "ok",
    statusLabel: "CONFORME",
  },
  {
    id: "NDF-0414",
    date: "30/07",
    label: "SNCF Paris → Lille (A/R)",
    category: "Transport",
    project: "Shooting Royza",
    amount: "84,00 €",
    amountValue: 84,
    status: "ok",
    statusLabel: "CONFORME",
  },
  {
    id: "NDF-0415",
    date: "31/07",
    label: "Indemnités kilométriques — 78 km",
    category: "Véhicule",
    project: "Shooting Royza",
    amount: `${IK_AMOUNT.toFixed(2).replace(".", ",")} €`,
    amountValue: IK_AMOUNT,
    status: "review",
    statusLabel: "CONTRÔLE VÉHICULE",
  },
  {
    id: "NDF-0416",
    date: "03/08",
    label: "Parking Indigo — Opéra",
    category: "Transport",
    project: "Dior Beauty",
    amount: "12,80 €",
    amountValue: 12.8,
    status: "ok",
    statusLabel: "CONFORME",
  },
  {
    id: "NDF-0417",
    date: "03/08",
    label: "Fournitures shooting (accessoires)",
    category: "Achats",
    project: "Shooting Royza",
    amount: "27,04 €",
    amountValue: 27.04,
    status: "ok",
    statusLabel: "CONFORME",
  },
];

const expTotalValue = expLines.reduce((sum, l) => sum + l.amountValue, 0);

export const expTotals = {
  total: `${expTotalValue.toFixed(2).replace(".", ",")} €`,
  count: expLines.length,
  reimbursable: "192,24 €",
  onHold: `${IK_AMOUNT.toFixed(2).replace(".", ",")} €`,
  missing: "34,50 €",
  payout: "Virement avec la paie du 25/08/2026",
  breakdown: [
    { label: "Transport", value: "131,30 €", color: "#7C8CF8" },
    { label: "Restauration", value: "68,40 €", color: "#46D6C0" },
    { label: "Véhicule (IK)", value: "26,44 €", color: "#F0C24E" },
    { label: "Achats", value: "27,04 €", color: "#F2874E" },
  ],
};

export const vehicleAlert = {
  title: "Indemnités kilométriques suspendues",
  body:
    "La carte grise déclarée a expiré le 30/06/2026. Le barème 5 CV (0,339 €/km) reste appliqué à titre provisoire ; sans mise à jour au 01/09, les IK seront retirées de la note de frais.",
  cta: "Mettre à jour le véhicule",
};

/* ------------------------------------------------------------------ */
/* Mon dossier                                                         */
/* ------------------------------------------------------------------ */

export type DocRow = {
  name: string;
  kind: string;
  updatedAt: string;
  size: string;
  status: "signed" | "todo" | "archive";
  statusLabel: string;
};

export const docs: DocRow[] = [
  {
    name: "Contrat de travail — CDI",
    kind: "Contrat",
    updatedAt: "02/12/2025",
    size: "412 Ko",
    status: "signed",
    statusLabel: "SIGNÉ",
  },
  {
    name: "Avenant n°1 — Télétravail 2 j / semaine",
    kind: "Avenant",
    updatedAt: "05/01/2026",
    size: "188 Ko",
    status: "signed",
    statusLabel: "SIGNÉ",
  },
  {
    name: "Accord d'entreprise 2026",
    kind: "Accord collectif",
    updatedAt: "12/01/2026",
    size: "1,2 Mo",
    status: "archive",
    statusLabel: "LECTURE",
  },
  {
    name: "Charte informatique et données",
    kind: "Charte",
    updatedAt: "12/01/2026",
    size: "240 Ko",
    status: "signed",
    statusLabel: "SIGNÉ",
  },
  {
    name: "Attestation mutuelle Alan",
    kind: "Prévoyance",
    updatedAt: "28/07/2026",
    size: "96 Ko",
    status: "todo",
    statusLabel: "À SIGNER",
  },
  {
    name: "Attestation assurance habitation (télétravail)",
    kind: "Télétravail",
    updatedAt: "04/01/2026",
    size: "154 Ko",
    status: "todo",
    statusLabel: "EXPIRÉE",
  },
  {
    name: "RIB — Qonto",
    kind: "Paiement",
    updatedAt: "10/12/2025",
    size: "48 Ko",
    status: "archive",
    statusLabel: "VALIDE",
  },
  {
    name: "Pièce d'identité",
    kind: "Identité",
    updatedAt: "02/12/2025",
    size: "820 Ko",
    status: "archive",
    statusLabel: "VALIDE",
  },
];

export type ContactField = {
  label: string;
  value: string;
  hint: string;
  warning?: boolean;
};

export const contactFields: ContactField[] = [
  {
    label: "Adresse postale",
    value: "18 rue de Paradis, 75010 Paris",
    hint: "Déclarée le 04/01/2026 — attestation habitation expirée",
    warning: true,
  },
  {
    label: "Téléphone mobile",
    value: "+33 6 •• •• •• 42",
    hint: "Utilisé pour la double authentification",
  },
  {
    label: "Email personnel",
    value: "l.khaled@••••••.com",
    hint: "Envoi des bulletins de paie",
  },
  {
    label: "Contact d'urgence",
    value: "Nadia Khaled — +33 6 •• •• •• 07",
    hint: "Lien : sœur",
  },
  {
    label: "IBAN",
    value: "FR76 •••• •••• •••• •••• 0042",
    hint: "Qonto — vérifié le 10/12/2025",
  },
];

export const contratCard = {
  type: "CDI",
  role: "Account Manager",
  team: "Business Development",
  hours: "35 h / semaine",
  hiredAt: "02/12/2025",
  trial: "Période d'essai validée le 02/06/2026",
  notice: "Préavis : 1 mois",
  classification: "Statut employé — coefficient 250",
  salary: "Rémunération brute mensuelle : 2 850,00 €",
};

export const mutuelleCard = {
  provider: "Alan",
  plan: "Formule Confort",
  since: "01/01/2026",
  employerShare: "60 %",
  employeeShare: "28,40 € / mois",
  dependents: "Aucun ayant droit déclaré",
  status: "Attestation 2026 à signer",
};

export type Payslip = {
  period: string;
  net: string;
  netSocial: string;
  issuedAt: string;
  size: string;
};

export const payslips: Payslip[] = [
  { period: "Juillet 2026", net: "2 214,86 €", netSocial: "2 398,12 €", issuedAt: "25/07/2026", size: "142 Ko" },
  { period: "Juin 2026", net: "2 186,40 €", netSocial: "2 366,05 €", issuedAt: "25/06/2026", size: "141 Ko" },
  { period: "Mai 2026", net: "2 208,72 €", netSocial: "2 391,44 €", issuedAt: "25/05/2026", size: "140 Ko" },
  { period: "Avril 2026", net: "2 174,19 €", netSocial: "2 352,88 €", issuedAt: "24/04/2026", size: "139 Ko" },
  { period: "Mars 2026", net: "2 231,05 €", netSocial: "2 415,60 €", issuedAt: "25/03/2026", size: "141 Ko" },
  { period: "Février 2026", net: "2 168,93 €", netSocial: "2 347,02 €", issuedAt: "25/02/2026", size: "138 Ko" },
];

/* ------------------------------------------------------------------ */
/* Mes demandes                                                        */
/* ------------------------------------------------------------------ */

export type RequestStatus = "pending" | "approved" | "refused";

export type EmployeeRequest = {
  ref: string;
  type: string;
  typeColor: string;
  period: string;
  duration: string;
  submittedAt: string;
  approver: string;
  status: RequestStatus;
  statusLabel: string;
  summary: string;
  flow: FlowStep[];
};

export const REQS: EmployeeRequest[] = [
  {
    ref: "REQ-2026-0187",
    type: "Récupération",
    typeColor: "#E5F2B5",
    period: "12/08/2026",
    duration: "0,5 j",
    submittedAt: "03/08/2026 · 09:12",
    approver: "S. Ayad-Zeddam",
    status: "pending",
    statusLabel: "EN ATTENTE",
    summary:
      "Demi-journée d'après-midi sur le compteur récupération. Réduit le droit télétravail de la semaine 33 à 1 jour.",
    flow: [
      { label: "Demande déposée", meta: "03/08 · 09:12", state: "done" },
      { label: "Contrôle des règles", meta: "Aucun conflit d'équipe", state: "done" },
      { label: "Validation manager", meta: "S. Ayad-Zeddam · relancé le 04/08", state: "current" },
      { label: "Mise à jour des compteurs", meta: "Récupération 1,5 j → 1,0 j", state: "todo" },
    ],
  },
  {
    ref: "REQ-2026-0184",
    type: "Télétravail exceptionnel",
    typeColor: "#7C8CF8",
    period: "07/08/2026",
    duration: "1 j",
    submittedAt: "01/08/2026 · 16:40",
    approver: "S. Ayad-Zeddam",
    status: "approved",
    statusLabel: "VALIDÉE",
    summary:
      "Jour exceptionnel accordé pour transports perturbés, compensé par une présence sur site le 10/08.",
    flow: [
      { label: "Demande déposée", meta: "01/08 · 16:40", state: "done" },
      { label: "Contrôle article 1.6", meta: "Quota hebdomadaire respecté", state: "done" },
      { label: "Validation manager", meta: "02/08 · 08:22", state: "done" },
      { label: "Planning mis à jour", meta: "Compensation le 10/08", state: "done" },
    ],
  },
  {
    ref: "REQ-2026-0179",
    type: "Note de frais",
    typeColor: "#F2874E",
    period: "Juillet 2026",
    duration: "253,18 €",
    submittedAt: "31/07/2026 · 19:05",
    approver: "Comptabilité",
    status: "pending",
    statusLabel: "EN ATTENTE",
    summary:
      "6 lignes déposées. Un justificatif manque (taxi du 28/07) et les indemnités kilométriques sont suspendues.",
    flow: [
      { label: "Note déposée", meta: "31/07 · 19:05", state: "done" },
      { label: "Contrôle des justificatifs", meta: "1 pièce manquante", state: "blocked" },
      { label: "Validation manager", meta: "En attente des pièces", state: "todo" },
      { label: "Remboursement", meta: "Paie du 25/08/2026", state: "todo" },
    ],
  },
  {
    ref: "REQ-2026-0175",
    type: "RTT",
    typeColor: "#F0C24E",
    period: "24/08/2026",
    duration: "1,0 j",
    submittedAt: "24/07/2026 · 11:28",
    approver: "S. Ayad-Zeddam",
    status: "approved",
    statusLabel: "VALIDÉE",
    summary:
      "RTT accordé. Réduira le droit télétravail de la semaine 35 à 1 jour et retirera 1 titre-restaurant.",
    flow: [
      { label: "Demande déposée", meta: "24/07 · 11:28", state: "done" },
      { label: "Contrôle des règles", meta: "Solde RTT suffisant", state: "done" },
      { label: "Validation manager", meta: "25/07 · 09:03", state: "done" },
      { label: "Compteurs mis à jour", meta: "RTT 4,0 j → 3,0 j", state: "done" },
    ],
  },
  {
    ref: "REQ-2026-0168",
    type: "Congé sans solde",
    typeColor: "#7E8998",
    period: "21/09 → 23/09/2026",
    duration: "3,0 j",
    submittedAt: "12/07/2026 · 14:51",
    approver: "Direction",
    status: "refused",
    statusLabel: "REFUSÉE",
    summary:
      "Refus motivé par le comité marques du 23/09 et la présence de deux absences déjà validées sur la semaine 39.",
    flow: [
      { label: "Demande déposée", meta: "12/07 · 14:51", state: "done" },
      { label: "Contrôle de couverture", meta: "Couverture 57 % — seuil 70 %", state: "done" },
      { label: "Décision direction", meta: "Refusée le 16/07", state: "done" },
      { label: "Alternative proposée", meta: "Semaine 36 (31/08 → 04/09)", state: "done" },
    ],
  },
  {
    ref: "REQ-2026-0161",
    type: "Correction de badgeage",
    typeColor: "#46D6C0",
    period: "30/07/2026",
    duration: "+22 min",
    submittedAt: "30/07/2026 · 18:58",
    approver: "M. Arekonamand",
    status: "approved",
    statusLabel: "VALIDÉE",
    summary:
      "Oubli de badgeage au retour de déjeuner. Correction appliquée sur la feuille de temps de la semaine 31.",
    flow: [
      { label: "Correction demandée", meta: "30/07 · 18:58", state: "done" },
      { label: "Vérification RH", meta: "Cohérente avec l'agenda", state: "done" },
      { label: "Validation", meta: "31/07 · 09:14", state: "done" },
      { label: "Feuille de temps mise à jour", meta: "S31 · 36 h 12", state: "done" },
    ],
  },
  {
    ref: "REQ-2026-0157",
    type: "Télétravail S33",
    typeColor: "#7C8CF8",
    period: "11/08 et 13/08/2026",
    duration: "2 j",
    submittedAt: "10/07/2026 · 10:02",
    approver: "S. Ayad-Zeddam",
    status: "pending",
    statusLabel: "À CORRIGER",
    summary:
      "Dépassement article 1.6 : la récupération du 12/08 ramène le droit à 1 jour. Un des deux jours doit être retiré avant le 08/08.",
    flow: [
      { label: "Demande déposée", meta: "10/07 · 10:02", state: "done" },
      { label: "Contrôle article 1.6", meta: "Droit réduit à 1 j par l'absence du 12/08", state: "blocked" },
      { label: "Correction du salarié", meta: "Retirer le jeudi 13/08", state: "current" },
      { label: "Validation manager", meta: "S. Ayad-Zeddam", state: "todo" },
    ],
  },
];

export const requestFilters = [
  { id: "all", label: "Toutes", count: REQS.length },
  { id: "pending", label: "En attente", count: REQS.filter((r) => r.status === "pending").length },
  { id: "approved", label: "Validées", count: REQS.filter((r) => r.status === "approved").length },
  { id: "refused", label: "Refusées", count: REQS.filter((r) => r.status === "refused").length },
];

/* ------------------------------------------------------------------ */
/* Mobile                                                              */
/* ------------------------------------------------------------------ */

export const mobileHome = {
  title: "Accueil",
  status: "TÉLÉTRAVAIL",
  greeting: "Bonjour Leyna",
  date: "MAR. 04 AOÛT · S32",
  actions: [
    { label: "Poser une absence", tone: "#E5F2B5" },
    { label: "Ajouter un frais", tone: "#12161C" },
  ],
  tiles: [
    { label: "POSABLES", value: "4,0 j", tone: "#E5F2B5" },
    { label: "HS AOÛT", value: "11,5 h", tone: "#F0C24E" },
    { label: "FRAIS", value: "253 €", tone: "#F2874E" },
    { label: "TR AOÛT", value: "14", tone: "#46D6C0" },
  ],
  alert: "1 action urgente — pause déjeuner du 06/08",
};

export const mobileDay = {
  title: "Ma journée",
  date: "MARDI 04 AOÛT 2026",
  mode: "TÉLÉTRAVAIL",
  punches: [
    { label: "Arrivée", value: "09:04", state: "done" },
    { label: "Pause déjeuner", value: "12:46 → 13:34", state: "done" },
    { label: "Sortie", value: "18:41", state: "done" },
  ],
  total: "8 h 49",
  overtime: "+1 h 49 en heures supplémentaires",
  next: "Demain : bureau — 4e étage, bureau 12",
};

export const mobileTrack = {
  title: "Suivi",
  items: [
    { ref: "REQ-2026-0187", label: "Récupération 12/08", status: "EN ATTENTE", tone: "#F0C24E" },
    { ref: "REQ-2026-0184", label: "Télétravail 07/08", status: "VALIDÉE", tone: "#46D6C0" },
    { ref: "REQ-2026-0179", label: "Note de frais juillet", status: "EN ATTENTE", tone: "#F0C24E" },
    { ref: "REQ-2026-0157", label: "Télétravail S33", status: "À CORRIGER", tone: "#F2604E" },
    { ref: "REQ-2026-0175", label: "RTT 24/08", status: "VALIDÉE", tone: "#46D6C0" },
  ],
  footer: "3 demandes en attente · 1 à corriger",
};
