/**
 * Backfill rh_work_days depuis les exports Lucca Office.
 * Usage: pnpm backfill:rh-office [dossier]
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient, type RhWorkPlace } from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_DIR =
  "/Users/sofian/Downloads/drive-download-20260831T125100Z-1-001";

const PLACE_RANK: Record<RhWorkPlace, number> = {
  OFFICE: 0,
  REMOTE: 1,
  TRAVEL: 2,
  SITE: 3,
};

function fold(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function nameKey(a: string, b: string) {
  return `${fold(a)}|${fold(b)}`;
}
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = lines[0]?.split(";") ?? [];
  return lines.slice(1).map((line) => {
    const cols = line.split(";");
    const o: Record<string, string> = {};
    headers.forEach((h, i) => {
      o[h] = cols[i] ?? "";
    });
    return o;
  });
}
function mapPlace(name: string): RhWorkPlace | null {
  const n = name.trim();
  if (n === "Télétravail") return "REMOTE";
  if (n === "Bureau") return "OFFICE";
  if (n === "Déplacement") return "TRAVEL";
  if (n === "Soleil du Sud") return "SITE";
  return null;
}

function isoWeekInfo(d: Date) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  const dow = (d.getUTCDay() + 6) % 7;
  const weekStart = new Date(d);
  weekStart.setUTCDate(d.getUTCDate() - dow);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  return { isoYear, isoWeek, weekStart, weekEnd };
}

async function main() {
  const dir = process.argv[2] || DEFAULT_DIR;
  if (!fs.existsSync(dir)) {
    throw new Error(`Dossier introuvable: ${dir}`);
  }
  const emps = await prisma.rhEmployee.findMany({
    include: { user: { select: { prenom: true, nom: true } } },
  });
  const index = new Map<string, string>();
  for (const e of emps) {
    index.set(nameKey(e.user.prenom, e.user.nom), e.id);
    index.set(nameKey(e.user.nom, e.user.prenom), e.id);
  }
  const files = fs.readdirSync(dir).filter((f) => f.startsWith("Office"));
  const rows: Record<string, string>[] = [];
  for (const f of files) {
    rows.push(...parseCsv(fs.readFileSync(path.join(dir, f), "utf8")));
  }

  const best = new Map<string, { employeeId: string; date: Date; place: RhWorkPlace }>();
  for (const r of rows) {
    const place = mapPlace(r.work_location_name || "");
    if (!place) continue;
    const empId =
      index.get(nameKey(r.first_name || "", r.last_name || "")) ||
      index.get(nameKey(r.last_name || "", r.first_name || ""));
    if (!empId || !/^\d{4}-\d{2}-\d{2}$/.test(r.date || "")) continue;
    const key = `${empId}|${r.date}`;
    const prev = best.get(key);
    if (!prev || PLACE_RANK[place] >= PLACE_RANK[prev.place]) {
      best.set(key, {
        employeeId: empId,
        date: new Date(`${r.date}T00:00:00.000Z`),
        place,
      });
    }
  }

  const chunk = [...best.values()].map((row) => ({
    ...row,
    half: "FULL",
  }));
  let n = 0;
  for (let i = 0; i < chunk.length; i += 400) {
    const slice = chunk.slice(i, i + 400);
    const result = await prisma.rhWorkDay.createMany({
      data: slice,
      skipDuplicates: true,
    });
    n += result.count;
  }

  const remotes = chunk.filter((r) => r.place === "REMOTE");
  const weeks = new Map<
    string,
    {
      employeeId: string;
      isoYear: number;
      isoWeek: number;
      weekStart: Date;
      weekEnd: Date;
      dates: Date[];
    }
  >();
  for (const r of remotes) {
    const info = isoWeekInfo(r.date);
    const k = `${r.employeeId}|${info.isoYear}|${info.isoWeek}`;
    const prev = weeks.get(k);
    if (!prev) {
      weeks.set(k, {
        employeeId: r.employeeId,
        isoYear: info.isoYear,
        isoWeek: info.isoWeek,
        weekStart: info.weekStart,
        weekEnd: info.weekEnd,
        dates: [r.date],
      });
    } else {
      prev.dates.push(r.date);
    }
  }
  let decl = 0;
  for (const w of weeks.values()) {
    await prisma.rhRemoteDeclaration.upsert({
      where: {
        employeeId_isoYear_isoWeek: {
          employeeId: w.employeeId,
          isoYear: w.isoYear,
          isoWeek: w.isoWeek,
        },
      },
      create: {
        employeeId: w.employeeId,
        isoYear: w.isoYear,
        isoWeek: w.isoWeek,
        weekStart: w.weekStart,
        weekEnd: w.weekEnd,
        declaredDates: w.dates,
      },
      update: { declaredDates: w.dates },
    });
    decl += 1;
  }

  console.log(
    `Office backfill: ${n} jours écrits (${chunk.length} uniques, ${rows.length} lignes CSV, ${decl} semaines TT)`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
