import {
  bookableBalance,
  coverageAfter,
  mealVoucherCount,
  mileageAllowance,
  minutesToLabel,
  remoteEntitlement,
  splitOvertime,
  cpExercise,
  completedMonthsSince,
  nextPeriodCpAccrued,
  assertRecupMinutes,
  assertLegalBreak,
  slotsGrossMinutes,
  minutesToLeaveDays,
  leaveDaysToMinutes,
  WORKDAY_MINUTES,
  RECUP_MIN_MINUTES,
  RECUP_MAX_MINUTES,
  MICRO_OT_MAX_MINUTES,
  LEGAL_BREAK_MIN_MINUTES,
  LEGAL_BREAK_TRIGGER_MINUTES,
} from "./calculations";
import {
  easterSunday,
  frenchHolidayLabel,
  isFrenchHoliday,
  isWorkday,
} from "../../../lib/rh/holidays";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function almost(a: number, b: number, eps = 0.001) {
  return Math.abs(a - b) < eps;
}

export function runRhCalculationTests(): string[] {
  const logs: string[] = [];
  const ok = (name: string) => logs.push(`✓ ${name}`);

  // Art. 1.6 — TT selon absences
  assert(remoteEntitlement(3, 0) === 3, "remote 3/0");
  assert(remoteEntitlement(3, 1) === 1, "remote 3/1");
  assert(remoteEntitlement(3, 2) === 1, "remote 3/2");
  assert(remoteEntitlement(3, 3) === 0, "remote 3/3");
  assert(remoteEntitlement(2, 0) === 2, "remote 2/0");
  assert(remoteEntitlement(2, 1) === 1, "remote 2/1");
  assert(remoteEntitlement(0, 0) === 0, "remote 0");
  assert(remoteEntitlement(3, 1, { forOneDay: 2, forZero: 4 }) === 3, "remote custom thresholds");
  assert(remoteEntitlement(3, 2, { forOneDay: 2, forZero: 4 }) === 1, "remote custom 1j");
  assert(remoteEntitlement(3, 4, { forOneDay: 2, forZero: 4 }) === 0, "remote custom 0");
  ok("remoteEntitlement art.1.6");

  // HS 25 % / 50 %
  const week = 43 * 60 + 49;
  const split = splitOvertime(week, 35 * 60);
  assert(split.at25 === 8 * 60, `at25 got ${split.at25}`);
  assert(split.at50 === 49, `at50 got ${split.at50}`);
  assert(minutesToLabel(split.at25) === "8 h 00", "label 8h");
  assert(minutesToLabel(split.at50) === "0 h 49", "label 49m");
  ok("splitOvertime 43h49");

  const micro = splitOvertime(35 * 60 + 40, 35 * 60);
  assert(micro.at25 === 40 && micro.at50 === 0, "micro OT");
  assert(MICRO_OT_MAX_MINUTES === 30, "micro seuil 30");
  assert(40 > MICRO_OT_MAX_MINUTES, "40 min > micro → file manager");
  ok("splitOvertime 35h40");

  const exact8 = splitOvertime(35 * 60 + 8 * 60, 35 * 60, 8);
  assert(exact8.at25 === 8 * 60 && exact8.at50 === 0, "exact 8h @25");
  const beyond = splitOvertime(35 * 60 + 10 * 60, 35 * 60, 8);
  assert(beyond.at25 === 8 * 60 && beyond.at50 === 2 * 60, "10h → 8@25 + 2@50");
  const customCap = splitOvertime(35 * 60 + 5 * 60, 35 * 60, 3);
  assert(customCap.at25 === 3 * 60 && customCap.at50 === 2 * 60, "cap 3h");
  ok("splitOvertime HS 25/50");

  const hire = new Date("2025-12-02");
  const today = new Date("2026-08-04");
  assert(bookableBalance(8.33, hire, today, "CP") === 0, "CP blocked");
  assert(bookableBalance(1, hire, today, "RECUP") === 1, "RECUP ok");
  ok("bookableBalance");

  // TR
  const tr = mealVoucherCount({
    workedOpenDays: 22,
    leaveDays: 3,
    sickDays: 1,
    halfDays: 1,
    companyMeals: 2,
    reimbursedTravelMeals: 1,
  });
  assert(tr === 14, `TR got ${tr}`);
  assert(
    mealVoucherCount({
      workedOpenDays: 20,
      leaveDays: 5,
      sickDays: 5,
      halfDays: 5,
      companyMeals: 5,
      reimbursedTravelMeals: 5,
    }) === 0,
    "TR floor 0"
  );
  ok("mealVoucherCount TR");

  assert(almost(mileageAllowance(412, 5), 139.67), "IK 412");
  ok("mileageAllowance");

  // Récup minutes + conversion journée 7 h
  assert(WORKDAY_MINUTES === 7 * 60, "journée 7h");
  assert(RECUP_MIN_MINUTES === 15, "récup min 15");
  assert(RECUP_MAX_MINUTES === WORKDAY_MINUTES, "récup max = journée");
  assert(minutesToLeaveDays(420) === 1, "420 min = 1 j");
  assert(minutesToLeaveDays(210) === 0.5, "210 min = 0.5 j");
  assert(leaveDaysToMinutes(1) === 420, "1 j = 420 min");
  assert(leaveDaysToMinutes(0.5) === 210, "0.5 j = 210 min");
  assertRecupMinutes(15);
  assertRecupMinutes(60);
  assertRecupMinutes(420);
  let recupErr = false;
  try {
    assertRecupMinutes(10);
  } catch {
    recupErr = true;
  }
  assert(recupErr, "récup 10 min rejetée");
  recupErr = false;
  try {
    assertRecupMinutes(20); // pas multiple de 15
  } catch {
    recupErr = true;
  }
  assert(recupErr, "récup 20 min (pas de pas) rejetée");
  assertRecupMinutes(30, { min: 15, max: 420, step: 15 });
  ok("récup minutes");

  // Expiration récup : simulée via delta jours (settings.recupExpiryDays)
  const creditAt = new Date("2026-01-15T12:00:00Z");
  const expiryDays = 90;
  const expiresOn = new Date(
    creditAt.getTime() + expiryDays * 24 * 60 * 60 * 1000
  );
  assert(expiresOn.toISOString().slice(0, 10) === "2026-04-15", "récup expire +90j");
  const stillValid = new Date("2026-04-14T12:00:00Z") < expiresOn;
  const expired = new Date("2026-04-16T12:00:00Z") >= expiresOn;
  assert(stillValid && expired, "récup expiration fenêtre");
  ok("récup expiration");

  assert(almost(nextPeriodCpAccrued(new Date("2026-08-31T12:00:00Z")), 2.08), "CP next Aug");
  assert(cpExercise(new Date("2026-08-31T12:00:00Z")).label === "Congés payés 2026/2027", "exercise");
  assert(completedMonthsSince(new Date("2026-07-01T00:00:00Z"), new Date("2026-08-31T00:00:00Z")) === 1, "months");
  ok("cpAccrual");

  assert(coverageAfter(8, 10) === 80, "coverage 80%");
  assert(coverageAfter(0, 10) === 0, "coverage 0");
  assert(coverageAfter(5, 0) === 0, "coverage empty team");
  ok("coverageAfter");

  const easter26 = easterSunday(2026);
  assert(easter26.getFullYear() === 2026 && easter26.getMonth() === 3 && easter26.getDate() === 5, "easter 2026");
  const easter27 = easterSunday(2027);
  assert(easter27.getMonth() === 2 && easter27.getDate() === 28, "easter 2027");
  assert(isFrenchHoliday("2026-01-01"), "jour de l'an");
  assert(isFrenchHoliday("2026-04-06"), "lundi de Pâques 2026");
  assert(isFrenchHoliday("2026-05-01"), "1er mai");
  assert(isFrenchHoliday("2026-05-08"), "8 mai");
  assert(isFrenchHoliday("2026-05-14"), "ascension 2026");
  assert(isFrenchHoliday("2026-07-14"), "14 juillet");
  assert(isFrenchHoliday("2026-08-15"), "15 août");
  assert(isFrenchHoliday("2026-11-01"), "toussaint");
  assert(isFrenchHoliday("2026-11-11"), "armistice");
  assert(isFrenchHoliday("2026-12-25"), "noël");
  assert(!isFrenchHoliday("2026-05-25"), "lundi de Pentecôte travaillé");
  assert(!isFrenchHoliday("2026-08-31"), "lundi ouvré");
  assert(frenchHolidayLabel("2026-11-11") === "Armistice", "label");
  assert(!isWorkday("2026-11-11"), "11 nov non ouvré");
  assert(!isWorkday("2026-08-15"), "15 août samedi");
  assert(isWorkday("2026-08-31"), "31 août ouvré");
  assert(isWorkday(new Date(2026, 10, 10)), "10 nov ouvré");
  assert(!isWorkday(new Date(2026, 10, 11)), "11 nov local");
  ok("frenchHolidays");

  // Pause légale L3121-16
  assert(LEGAL_BREAK_MIN_MINUTES === 20, "pause min 20");
  assert(LEGAL_BREAK_TRIGGER_MINUTES === 360, "trigger 6h");
  assert(
    slotsGrossMinutes([
      { from: "09:30", to: "12:00" },
      { from: "14:00", to: "18:30" },
    ]) === 420,
    "slots gross 7h"
  );
  assertLegalBreak(300, 0); // < 6 h → OK sans pause
  assertLegalBreak(360, 20); // = 6 h → 20 min OK
  let broke = false;
  try {
    assertLegalBreak(420, 10);
  } catch {
    broke = true;
  }
  assert(broke, "pause < 20 rejetée dès 6 h");
  ok("assertLegalBreak");

  return logs;
}

for (const line of runRhCalculationTests()) console.log(line);
console.log("All RH calculation tests passed.");
