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

  assert(remoteEntitlement(3, 0) === 3, "remote 3/0");
  assert(remoteEntitlement(3, 1) === 1, "remote 3/1");
  assert(remoteEntitlement(3, 2) === 1, "remote 3/2");
  assert(remoteEntitlement(3, 3) === 0, "remote 3/3");
  ok("remoteEntitlement");

  const week = 43 * 60 + 49;
  const split = splitOvertime(week, 35 * 60);
  assert(split.at25 === 8 * 60, `at25 got ${split.at25}`);
  assert(split.at50 === 49, `at50 got ${split.at50}`);
  assert(minutesToLabel(split.at25) === "8 h 00", "label 8h");
  assert(minutesToLabel(split.at50) === "0 h 49", "label 49m");
  ok("splitOvertime 43h49");

  const micro = splitOvertime(35 * 60 + 40, 35 * 60);
  assert(micro.at25 === 40 && micro.at50 === 0, "micro OT");
  ok("splitOvertime 35h40");

  const hire = new Date("2025-12-02");
  const today = new Date("2026-08-04");
  assert(bookableBalance(8.33, hire, today, "CP") === 0, "CP blocked");
  assert(bookableBalance(1, hire, today, "RECUP") === 1, "RECUP ok");
  ok("bookableBalance");

  const tr = mealVoucherCount({
    workedOpenDays: 22,
    leaveDays: 3,
    sickDays: 1,
    halfDays: 1,
    companyMeals: 2,
    reimbursedTravelMeals: 1,
  });
  assert(tr === 14, `TR got ${tr}`);
  ok("mealVoucherCount");

  assert(almost(mileageAllowance(412, 5), 139.67), "IK 412");
  ok("mileageAllowance");

  assert(almost(nextPeriodCpAccrued(new Date("2026-08-31T12:00:00Z")), 2.08), "CP next Aug");
  assert(cpExercise(new Date("2026-08-31T12:00:00Z")).label === "Congés payés 2026/2027", "exercise");
  assert(completedMonthsSince(new Date("2026-07-01T00:00:00Z"), new Date("2026-08-31T00:00:00Z")) === 1, "months");
  ok("cpAccrual");

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

  return logs;
}

for (const line of runRhCalculationTests()) console.log(line);
console.log("All RH calculation tests passed.");
