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

/** Jours TT / semaine configurables par avenant (0 = aucun). */
export type RemoteAgreementDays = 0 | 1 | 2 | 3 | 4 | 5;

/** Normalise un avenant TT saisi (RH) vers 0–5 j / semaine. */
export function normalizeRemoteAgreement(n: unknown): RemoteAgreementDays {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (v >= 5) return 5;
  return v as RemoteAgreementDays;
}

/** Article 1.6 — droit télétravail selon absences dans la semaine. */
export function remoteEntitlement(
  agreementDays: number,
  absenceDaysInWeek: number,
  opts?: { forOneDay?: number; forZero?: number }
): number {
  const agreement = normalizeRemoteAgreement(agreementDays);
  if (agreement === 0) return 0;
  const forZero = opts?.forZero ?? 3;
  const forOne = opts?.forOneDay ?? 1;
  if (absenceDaysInWeek >= forZero) return 0;
  if (absenceDaysInWeek >= forOne) return Math.min(1, agreement);
  return agreement;
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

/**
 * Majoration payée (heures « en plus ») + équivalent temps payé.
 * Ex. 8 h @ 25 % → majoration 2 h · équivalent 10 h.
 */
export function overtimePremium(ot25Minutes: number, ot50Minutes = 0): {
  premium25: number;
  premium50: number;
  premiumTotal: number;
  paidEquivalent25: number;
  paidEquivalent50: number;
  paidEquivalentTotal: number;
} {
  const ot25 = Math.max(0, Math.round(ot25Minutes || 0));
  const ot50 = Math.max(0, Math.round(ot50Minutes || 0));
  const premium25 = Math.round(ot25 * 0.25);
  const premium50 = Math.round(ot50 * 0.5);
  return {
    premium25,
    premium50,
    premiumTotal: premium25 + premium50,
    paidEquivalent25: ot25 + premium25,
    paidEquivalent50: ot50 + premium50,
    paidEquivalentTotal: ot25 + ot50 + premium25 + premium50,
  };
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
      `Pause légale obligatoire : minimum ${minBreak} min dès ${trigger / 60} h de travail (L3121-16). Indique ta vraie pause — elle ne peut pas être inventée.`
    );
  }
}

/** True si ≥ 6 h brutes et pause &lt; 20 min (illégal sans saisie réelle). */
export function missingLegalBreak(
  slots: Array<{ from: string; to: string }>,
  breakMinutes = 0,
  opts?: { minBreak?: number; triggerMinutes?: number }
): boolean {
  const filled = slots.filter((s) => s.from && s.to);
  const gross = slotsGrossMinutes(filled);
  const minBreak = opts?.minBreak ?? LEGAL_BREAK_MIN_MINUTES;
  const trigger = opts?.triggerMinutes ?? LEGAL_BREAK_TRIGGER_MINUTES;
  if (gross < trigger) return false;
  const effective =
    slotsBreakMinutes(filled) > 0
      ? slotsBreakMinutes(filled)
      : Math.max(0, breakMinutes || 0);
  return effective < minBreak;
}

/** "HH:MM" → minutes depuis minuit (NaN si invalide). */
export function hhmmToMinutes(value: string): number {
  const [h, m] = String(value || "")
    .split(":")
    .map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

/** Minutes depuis minuit → "HH:MM". */
export function minutesToHhmm(total: number): string {
  if (!Number.isFinite(total) || total < 0) return "";
  const h = Math.floor(total / 60) % 24;
  const m = Math.floor(total % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Durée d’une pause saisie en horaires (0 si invalide / inversée). */
export function breakRangeMinutes(from: string, to: string): number {
  const a = hhmmToMinutes(from);
  const b = hhmmToMinutes(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return b - a;
}

/**
 * Première fenêtre de pause déduite des trous entre créneaux.
 * Ex. 09:30→12:00 + 14:00→18:30 → { from: "12:00", to: "14:00" }.
 */
export function slotsBreakWindow(
  slots: Array<{ from: string; to: string }>
): { from: string; to: string } | null {
  const sorted = slots
    .map((s) => ({
      from: hhmmToMinutes(s.from),
      to: hhmmToMinutes(s.to),
    }))
    .filter(
      (s) =>
        Number.isFinite(s.from) &&
        Number.isFinite(s.to) &&
        s.to > s.from
    )
    .sort((a, b) => a.from - b.from || a.to - b.to);

  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].from - sorted[i].to;
    if (gap > 0) {
      return {
        from: minutesToHhmm(sorted[i].to),
        to: minutesToHhmm(sorted[i + 1].from),
      };
    }
  }
  return null;
}

/** Minutes brutes des créneaux (somme des plages travail, hors trous). */
export function slotsGrossMinutes(
  slots: Array<{ from: string; to: string }>
): number {
  let total = 0;
  for (const s of slots) {
    const from = hhmmToMinutes(s.from);
    const to = hhmmToMinutes(s.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    total += Math.max(0, to - from);
  }
  return total;
}

/**
 * Pause auto = somme des trous entre créneaux consécutifs (triés).
 * Ex. 09:30→12:00 + 14:00→18:30 → 120 min (pas un forfait 60/120).
 */
export function slotsBreakMinutes(
  slots: Array<{ from: string; to: string }>
): number {
  const sorted = slots
    .map((s) => ({
      from: hhmmToMinutes(s.from),
      to: hhmmToMinutes(s.to),
    }))
    .filter(
      (s) =>
        Number.isFinite(s.from) &&
        Number.isFinite(s.to) &&
        s.to > s.from
    )
    .sort((a, b) => a.from - b.from || a.to - b.to);

  let gaps = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    gaps += Math.max(0, sorted[i + 1].from - sorted[i].to);
  }
  return gaps;
}

/**
 * Pause manuelle d’un créneau unique : doit être strictement *dans* la plage
 * de travail. Sinon (pause après la fin, hors plage, inversée) → ignorée.
 * Évite le cas Anna S39 : travail 12:40→13:00 + pause 13:00→22:10 = 0 h.
 */
export function sanitizeManualBreak(
  slots: Array<{ from: string; to: string }>,
  breakFrom: string | null | undefined,
  breakTo: string | null | undefined,
  breakMinutes = 0
): { breakFrom: string | null; breakTo: string | null; breakMinutes: number } {
  const filled = slots.filter((s) => s.from && s.to);
  const gaps = slotsBreakMinutes(filled);
  if (gaps > 0) {
    const win = slotsBreakWindow(filled);
    return {
      breakFrom: win?.from ?? null,
      breakTo: win?.to ?? null,
      breakMinutes: gaps,
    };
  }
  if (filled.length !== 1) {
    const mins = Math.max(0, breakMinutes || 0);
    return {
      breakFrom: breakFrom || null,
      breakTo: breakTo || null,
      breakMinutes: mins,
    };
  }
  const workFrom = hhmmToMinutes(filled[0].from);
  const workTo = hhmmToMinutes(filled[0].to);
  if (!Number.isFinite(workFrom) || !Number.isFinite(workTo) || workTo <= workFrom) {
    return { breakFrom: null, breakTo: null, breakMinutes: 0 };
  }
  const span = workTo - workFrom;
  const bf =
    typeof breakFrom === "string" && /^\d{2}:\d{2}$/.test(breakFrom)
      ? hhmmToMinutes(breakFrom)
      : NaN;
  const bt =
    typeof breakTo === "string" && /^\d{2}:\d{2}$/.test(breakTo)
      ? hhmmToMinutes(breakTo)
      : NaN;
  if (
    Number.isFinite(bf) &&
    Number.isFinite(bt) &&
    bf >= workFrom &&
    bt <= workTo &&
    bt > bf
  ) {
    return {
      breakFrom: minutesToHhmm(bf),
      breakTo: minutesToHhmm(bt),
      breakMinutes: bt - bf,
    };
  }
  // Horaires de pause saisis mais hors plage → on les jette (pas de clamp
  // qui réduirait le travail à 0, cf. Anna S39 : pause 13:00→22:10).
  if (Number.isFinite(bf) || Number.isFinite(bt)) {
    return { breakFrom: null, breakTo: null, breakMinutes: 0 };
  }
  // Pas d’horaires : durée seule, plafonnée à la plage
  const mins = Math.min(Math.max(0, breakMinutes || 0), span);
  return { breakFrom: null, breakTo: null, breakMinutes: mins };
}

/**
 * Temps de travail net d’une journée.
 * - Plusieurs créneaux : le trou (pause) est déjà exclu du brut → on ne re-soustrait pas.
 * - Un seul créneau continu : on déduit `breakMinutes` (saisi / défaut).
 */
export function dayNetMinutes(
  slots: Array<{ from: string; to: string }>,
  breakMinutes = 0
): number {
  const gross = slotsGrossMinutes(slots);
  const gaps = slotsBreakMinutes(slots);
  if (gaps > 0) return Math.max(0, gross);
  return Math.max(0, gross - Math.max(0, breakMinutes));
}

export type AbsenceKind = "FULL" | "HALF_AM" | "HALF_PM" | "MINUTES";

/** Minutes retirées du temps travaillé. Jamais plus que le brut du jour. */
export function absenceDeductionMinutes(
  kind: string | null | undefined,
  absenceMinutes: number,
  workdayMinutes: number,
  grossNetMinutes: number
): number {
  const gross = Math.max(0, grossNetMinutes || 0);
  if (!kind) return 0;
  if (kind === "FULL") return gross;
  if (kind === "HALF_AM" || kind === "HALF_PM") {
    return Math.min(gross, Math.round(Math.max(0, workdayMinutes) / 2));
  }
  if (kind === "MINUTES") {
    return Math.min(gross, Math.max(0, absenceMinutes || 0));
  }
  return 0;
}

/** Temps qui reste sur la feuille après absence. Journée entière → 0. */
export function netDayMinutes(
  gross: number,
  kind: string | null | undefined,
  absenceMinutes: number,
  workdayMinutes: number
): number {
  if (kind === "FULL") return 0;
  return Math.max(
    0,
    gross -
      absenceDeductionMinutes(kind, absenceMinutes, workdayMinutes, gross)
  );
}

export type LeaveAbsenceInput = {
  accountCode: string;
  halfDay?: boolean;
  half?: string | null;
  minutes?: number | null;
  requestId?: string | null;
};

/**
 * Plusieurs lignes de congé le même jour → une seule déduction feuille.
 * Journée, deux demi-journées, matin, après-midi, ou récup en minutes.
 */
export function collapseLeaveAbsence(
  rows: LeaveAbsenceInput[],
  workdayMinutes: number
): {
  kind: AbsenceKind;
  minutes: number;
  label: string;
  requestId: string | null;
} | null {
  if (!rows.length) return null;
  const label = LEAVE_LABELS[rows[0].accountCode] || "Absence";
  const requestId = rows[0].requestId ?? null;
  const hourly = rows.filter((r) => (r.minutes || 0) > 0 || r.half === "H");
  if (hourly.length === rows.length && hourly.some((r) => (r.minutes || 0) > 0)) {
    const minutes = hourly.reduce((sum, r) => sum + (r.minutes || 0), 0);
    return { kind: "MINUTES", minutes, label, requestId };
  }
  const hasFull = rows.some(
    (r) => !r.halfDay || r.half === "FULL" || r.half == null
  );
  const hasAm = rows.some((r) => r.half === "AM");
  const hasPm = rows.some((r) => r.half === "PM");
  if (hasFull || (hasAm && hasPm)) {
    return {
      kind: "FULL",
      minutes: Math.max(0, workdayMinutes),
      label,
      requestId,
    };
  }
  if (hasAm) {
    return {
      kind: "HALF_AM",
      minutes: Math.round(Math.max(0, workdayMinutes) / 2),
      label,
      requestId,
    };
  }
  if (hasPm) {
    return {
      kind: "HALF_PM",
      minutes: Math.round(Math.max(0, workdayMinutes) / 2),
      label,
      requestId,
    };
  }
  return {
    kind: "FULL",
    minutes: Math.max(0, workdayMinutes),
    label,
    requestId,
  };
}

/** Texte court affiché sur la feuille (« Congés payés · journée déduite »). */
export function absenceCaption(
  kind: string | null | undefined,
  label: string | null | undefined,
  minutes: number,
  workdayMinutes: number
): string | null {
  if (!kind) return null;
  const name = label?.trim() || "Absence";
  if (kind === "FULL") return `${name} · journée déduite`;
  const half = minutesToLabel(Math.round(Math.max(0, workdayMinutes) / 2));
  if (kind === "HALF_AM") return `${name} · matin déduit (−${half})`;
  if (kind === "HALF_PM") return `${name} · après-midi déduit (−${half})`;
  if (kind === "MINUTES") return `${name} · −${minutesToLabel(minutes)} déduit`;
  return name;
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
  AUTHORIZED: "Autres (décès, naissance…)",
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
  if (!Number.isFinite(minutes)) return "0 h 00";
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h} h ${String(m).padStart(2, "0")}`;
}

export function coverageAfter(
  presentAfter: number,
  teamSize: number
): number {
  if (teamSize <= 0) return 0;
  return Math.round((presentAfter / teamSize) * 100);
}
