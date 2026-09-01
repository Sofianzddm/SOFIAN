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
  absenceDaysInWeek: number
): number {
  if (agreementDays === 0) return 0;
  if (absenceDaysInWeek >= 3) return 0;
  if (absenceDaysInWeek >= 1) return 1;
  return agreementDays;
}

/**
 * Split overtime against weekly contract (default 35h).
 * First 8h beyond contract → 25%, beyond 43h total → 50%.
 */
export function splitOvertime(
  weeklyMinutes: number,
  contractMinutes = 35 * 60
): { at25: number; at50: number } {
  const overtime = Math.max(0, weeklyMinutes - contractMinutes);
  if (overtime === 0) return { at25: 0, at50: 0 };
  const at25Cap = 8 * 60;
  const at25 = Math.min(overtime, at25Cap);
  const at50 = Math.max(0, overtime - at25Cap);
  return { at25, at50 };
}

/** 25 CP / an, crédités 2,08 j à chaque mois clos (Lucca). */
export const CP_DAYS_PER_YEAR = 25;
export const CP_PER_MONTH = Math.round((CP_DAYS_PER_YEAR / 12) * 100) / 100;

/** Exercice Glow Up : 1er juillet N → 30 juin N+1. */
export function cpExercise(date: Date): {
  startYear: number;
  label: string;
  start: Date;
  end: Date;
} {
  const y = date.getUTCFullYear();
  const startYear = date.getUTCMonth() >= 6 ? y : y - 1;
  return {
    startYear,
    label: `Congés payés ${startYear}/${startYear + 1}`,
    start: new Date(Date.UTC(startYear, 6, 1)),
    end: new Date(Date.UTC(startYear + 1, 5, 30)),
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

export function nextPeriodCpAccrued(today: Date): number {
  const current = cpExercise(today);
  const months = completedMonthsSince(current.start, today);
  return Math.min(
    CP_DAYS_PER_YEAR,
    Math.round(months * CP_PER_MONTH * 100) / 100
  );
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
  accountCode: "CP" | "RECUP" | "RTT" | "SS"
): number {
  if (accountCode !== "CP") return remaining;
  const unlock = new Date(hireDate);
  unlock.setFullYear(unlock.getFullYear() + 1);
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
  yearScale: Record<number, number> = { 5: 0.339 }
): number {
  const rate = yearScale[fiscalHorsepower] ?? 0.339;
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
