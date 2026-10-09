/**
 * Règles métier RH — réexport + helpers serveur.
 * Source unique partagée avec les tests UI.
 */
export {
  RH,
  remoteEntitlement,
  splitOvertime,
  bookableBalance,
  mealVoucherCount,
  mileageAllowance,
  minutesToLabel,
  coverageAfter,
  cpExercise,
  completedMonthsSince,
  nextPeriodCpAccrued,
  CP_DAYS_PER_YEAR,
  CP_PER_MONTH,
  LEAVE_LABELS,
  BALANCE_ACCOUNTS,
  WORKDAY_MINUTES,
  RECUP_MIN_MINUTES,
  RECUP_MAX_MINUTES,
  MICRO_OT_MAX_MINUTES,
  LEGAL_BREAK_MIN_MINUTES,
  LEGAL_BREAK_TRIGGER_MINUTES,
  minutesToLeaveDays,
  leaveDaysToMinutes,
  assertRecupMinutes,
  assertLegalBreak,
  slotsGrossMinutes,
} from "@/components/rh/lib/calculations";

export {
  easterSunday,
  frenchHolidayLabel,
  frenchHolidays,
  frenchHolidaysInMonth,
  isFrenchHoliday,
  isWorkday,
  isWeekday,
} from "@/lib/rh/holidays";
