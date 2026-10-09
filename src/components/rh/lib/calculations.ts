export const RH = {
  accent: "#E5F2B5",
  success: "#46D6C0",
  warning: "#F0C24E",
  orange: "#F2874E",
  danger: "#F2604E",
  remote: "#7C8CF8",
  remoteSoft: "#A5B0FA",
  holiday: "#F2C24E",
  chip: "#1D2530",
  off: "#1D2530",
} as const;

/** Article 1.6 — droit télétravail selon absences dans la semaine. */
export function remoteEntitlement(
  agreementDays: 0 | 2 | 3,
  absenceDaysInWeek: number,
  opts?: { forOneDay?: number; forZero?: number }
): number {
  if (agreementDays === 0) return 0;
  const forZero = opts?.forZero ?? 3;
  const forOne = opts?.forOneDay ?? 1;
  if (absenceDaysInWeek >= forZero) return 0;
  if (absenceDaysInWeek >= forOne) return 1;
  return agreementDays;
}

/**
 * Split overtime against weekly contract (default 35h).
 * First N h beyond contract → 25%, beyond → 50%.
 */
export function splitOvertime(
  weeklyMinutes: number,
  contractMinutes = 35 * 60,
  at25CapHours = 8
): { at25: number; at50: number } {
  const overtime = Math.max(0, weeklyMinutes - contractMinutes);
  if (overtime === 0) return { at25: 0, at50: 0 };
  const at25Cap = Math.max(0, at25CapHours) * 60;
  const at25 = Math.min(overtime, at25Cap);
  const at50 = Math.max(0, overtime - at25Cap);
  return { at25, at50 };
}

/** Journée de référence Glow Up (7 h) — base récup / HS. */
export const WORKDAY_MINUTES = 7 * 60;
export const RECUP_MIN_MINUTES = 15;
export const RECUP_MAX_MINUTES = WORKDAY_MINUTES;
/** HS &lt; 30 min → file de suivi manager (pas conversion récup auto). */
export const MICRO_OT_MAX_MINUTES = 30;

export function minutesToLeaveDays(minutes: number): number {
  return Math.round((minutes / WORKDAY_MINUTES) * 10000) / 10000;
}

export function leaveDaysToMinutes(days: number): number {
  return Math.round(days * WORKDAY_MINUTES);
}

export function assertRecupMinutes(
  minutes: number,
  opts?: { min?: number; max?: number; step?: number }
): void {
  const min = opts?.min ?? RECUP_MIN_MINUTES;
  const max = opts?.max ?? RECUP_MAX_MINUTES;
  const step = opts?.step ?? 15;
  if (!Number.isFinite(minutes) || minutes < min || minutes > max) {
    throw new Error(
      `La récupération se pose de ${min} min à ${max / 60} h`
    );
  }
  if (minutes % step !== 0) {
    throw new Error(`La durée doit être un multiple de ${step} minutes`);
  }
}

/**
 * Pause légale FR (L3121-16) : ≥ 20 min dès que le temps de travail
 * effectif journalier atteint 6 h (avant déduction de la pause).
 */
export const LEGAL_BREAK_MIN_MINUTES = 20;
export const LEGAL_BREAK_TRIGGER_MINUTES = 6 * 60;

/**
 * Valide la pause d’une journée.
 * `grossWorkedMinutes` = somme des créneaux (avant pause).
 */
export function assertLegalBreak(
  grossWorkedMinutes: number,
  breakMinutes: number,
  opts?: { minBreak?: number; triggerMinutes?: number }
): void {
  const minBreak = opts?.minBreak ?? LEGAL_BREAK_MIN_MINUTES;
  const trigger = opts?.triggerMinutes ?? LEGAL_BREAK_TRIGGER_MINUTES;
  if (grossWorkedMinutes < trigger) return;
  if (!Number.isFinite(breakMinutes) || breakMinutes < minBreak) {
    throw new Error(
      `Pause légale : minimum ${minBreak} min dès ${trigger / 60} h de travail`
    );
  }
}

/** Minutes brutes des créneaux (avant pause). */
export function slotsGrossMinutes(
  slots: Array<{ from: string; to: string }>
): number {
  let total = 0;
  for (const s of slots) {
    const [fh, fm] = s.from.split(":").map(Number);
    const [th, tm] = s.to.split(":").map(Number);
    total += Math.max(0, th * 60 + tm - (fh * 60 + fm));
  }
  return total;
}

/** 25 CP / an, crédités 2,08 j à chaque mois clos (Lucca). */
export const CP_DAYS_PER_YEAR = 25;
export const CP_PER_MONTH = Math.round((CP_DAYS_PER_YEAR / 12) * 100) / 100;

/** Exercice CP : début au mois `startMonth` (0–11, défaut juillet = 6). */
export function cpExercise(
  date: Date,
  startMonth = 6
): {
  startYear: number;
  label: string;
  start: Date;
  end: Date;
} {
  const m = ((startMonth % 12) + 12) % 12;
  const y = date.getUTCFullYear();
  const startYear = date.getUTCMonth() >= m ? y : y - 1;
  const endMonth = (m + 11) % 12;
  const endYear = m === 0 ? startYear : startYear + 1;
  return {
    startYear,
    label: `Congés payés ${startYear}/${endYear}`,
    start: new Date(Date.UTC(startYear, m, 1)),
    end: new Date(Date.UTC(endYear, endMonth + 1, 0)),
  };
}

/** Mois calendaires entamés depuis `from` (1er juillet → 31 août = 1). */
export function completedMonthsSince(from: Date, today: Date): number {
  return Math.max(
    0,
    (today.getUTCFullYear() - from.getUTCFullYear()) * 12 +
      (today.getUTCMonth() - from.getUTCMonth())
  );
}

export function nextPeriodCpAccrued(
  today: Date,
  opts?: { daysPerYear?: number; startMonth?: number }
): number {
  const daysPerYear = opts?.daysPerYear ?? CP_DAYS_PER_YEAR;
  const perMonth = Math.round((daysPerYear / 12) * 100) / 100;
  const current = cpExercise(today, opts?.startMonth ?? 6);
  const months = completedMonthsSince(current.start, today);
  return Math.min(daysPerYear, Math.round(months * perMonth * 100) / 100);
}

export const LEAVE_LABELS: Record<string, string> = {
  CP: "Congés payés",
  RECUP: "Récupération",
  RTT: "RTT",
  SS: "Maladie",
  UNPAID: "Congé sans solde",
  SCHOOL: "École",
  AUTHORIZED: "Absence autorisée",
};

export const BALANCE_ACCOUNTS = new Set(["CP", "RECUP", "RTT"]);

/** Congés payés bookable only after 1 year seniority. */
export function bookableBalance(
  remaining: number,
  hireDate: Date,
  today: Date,
  accountCode: "CP" | "RECUP" | "RTT" | "SS",
  seniorityYears = 1
): number {
  if (accountCode !== "CP") return remaining;
  const unlock = new Date(hireDate);
  unlock.setFullYear(unlock.getFullYear() + seniorityYears);
  if (today < unlock) return 0;
  return remaining;
}

export function mealVoucherCount(params: {
  workedOpenDays: number;
  leaveDays: number;
  sickDays: number;
  halfDays: number;
  companyMeals: number;
  reimbursedTravelMeals: number;
}): number {
  return Math.max(
    0,
    params.workedOpenDays -
      params.leaveDays -
      params.sickDays -
      params.halfDays -
      params.companyMeals -
      params.reimbursedTravelMeals
  );
}

/** Barème IK simplifié — 5 CV jusqu'à 5000 km : 0,339 €/km (maquette 2026). */
export function mileageAllowance(
  km: number,
  fiscalHorsepower: number,
  yearScale: Record<number, number> = { 5: 0.339 },
  defaultRate = 0.339
): number {
  const rate = yearScale[fiscalHorsepower] ?? defaultRate;
  return Math.round(km * rate * 100) / 100;
}

export function minutesToLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export function coverageAfter(
  presentAfter: number,
  teamSize: number
): number {
  if (teamSize <= 0) return 0;
  return Math.round((presentAfter / teamSize) * 100);
}
