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
