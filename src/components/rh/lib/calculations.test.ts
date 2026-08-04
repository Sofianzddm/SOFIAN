import {
  bookableBalance,
  coverageAfter,
  mealVoucherCount,
  mileageAllowance,
  minutesToLabel,
  remoteEntitlement,
  splitOvertime,
} from "./calculations";

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

  assert(coverageAfter(4, 7) === 57, "coverage");
  ok("coverageAfter");

  return logs;
}

for (const line of runRhCalculationTests()) console.log(line);
console.log("All RH calculation tests passed.");
