import { buildMonth, type MonthGrid, CP, RTT, TT, SICK } from "@/components/rh/mock/shared";

const ACCOUNT_MARK: Record<string, string> = {
  CP: "soft",
  RTT: "rtt",
  RECUP: "sel",
  SS: "hol",
  UNPAID: "blocked",
};

export function marksFromLeaveDays(
  year: number,
  month: number, // 0-11
  leaveDays: Array<{ date: string; accountCode: string }>,
  remoteDates: string[] = []
): Record<number, string> {
  const marks: Record<number, string> = {};
  const today = new Date();
  const isThisMonth =
    today.getFullYear() === year && today.getMonth() === month;

  for (const d of leaveDays) {
    const dt = new Date(d.date + "T12:00:00");
    if (dt.getFullYear() !== year || dt.getMonth() !== month) continue;
    marks[dt.getDate()] = ACCOUNT_MARK[d.accountCode] || "sel";
  }
  for (const r of remoteDates) {
    const dt = new Date(r + "T12:00:00");
    if (dt.getFullYear() !== year || dt.getMonth() !== month) continue;
    if (!marks[dt.getDate()]) marks[dt.getDate()] = "tt";
  }
  if (isThisMonth) {
    const day = today.getDate();
    if (marks[day] === "tt") marks[day] = "todaytt";
    else if (!marks[day]) marks[day] = "today";
  }
  return marks;
}

export function buildThreeMonths(
  leaveDays: Array<{ date: string; accountCode: string }>,
  remoteDates: string[] = [],
  start = new Date()
): MonthGrid[] {
  const out: MonthGrid[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const title = d
      .toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
      .toUpperCase();
    const marks = marksFromLeaveDays(
      d.getFullYear(),
      d.getMonth(),
      leaveDays,
      remoteDates
    );
    out.push(buildMonth(d.getFullYear(), d.getMonth(), title, marks));
  }
  return out;
}

export const LEAVE_LEGEND = [
  { label: "CP", color: CP },
  { label: "RTT / Récup", color: RTT },
  { label: "Télétravail", color: TT },
  { label: "Maladie", color: SICK },
];

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
