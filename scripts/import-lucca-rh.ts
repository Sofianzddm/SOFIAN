/**
 * Import des exports Lucca dans le module RH.
 * Usage: pnpm tsx scripts/import-lucca-rh.ts [dossier]
 */
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import JSZip from "jszip";
import {
  PrismaClient,
  type RhLeaveAccount,
  type RhRequestStatus,
  type RhRole,
} from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_DIR =
  "/Users/sofian/Downloads/drive-download-20260831T125100Z-1-001";
const HOURS_PER_DAY = 7;
const AVATARS = [
  "#E5F2B5",
  "#8ED98A",
  "#46D6C0",
  "#B48CF0",
  "#F06FA8",
  "#5FB8E8",
  "#F2874E",
  "#F2C24E",
  "#7C8CF8",
  "#F0C24E",
];

const DEPT_MAP: Record<string, string> = {
  "Direction générale": "Direction générale",
  "Talent Management": "Talent Management",
  "Talent manager senior": "Talent Management",
  "Business developper": "Business Development",
  "Social Media": "Social Media",
  "Assistante de direction": "Direction générale",
};

type AccountMap = {
  code: RhLeaveAccount;
  label: string;
  periodStart?: Date;
  periodEnd?: Date;
};

function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function nameKey(prenom: string, nom: string) {
  return `${fold(prenom)}|${fold(nom)}`;
}

function decodeXml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function colIndex(col: string) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

async function readXlsx(filePath: string): Promise<string[][]> {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const stringsXml =
    (await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "";
  const strings: string[] = [];
  const siRe = /<x:si>([\s\S]*?)<\/x:si>/g;
  let si: RegExpExecArray | null;
  while ((si = siRe.exec(stringsXml))) {
    const texts = [...si[1].matchAll(/<x:t[^>]*>([\s\S]*?)<\/x:t>/g)].map((x) =>
      decodeXml(x[1])
    );
    strings.push(texts.join(""));
  }
  const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  const rows: string[][] = [];
  const rowRe = /<x:row[^>]*>([\s\S]*?)<\/x:row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(sheet))) {
    const cells: string[] = [];
    const cellRe = /<x:c ([^>]*)>([\s\S]*?)<\/x:c>/g;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(rowMatch[1]))) {
      const attrs = cell[1];
      const inner = cell[2];
      const ref = /r="([A-Z]+)(\d+)"/.exec(attrs);
      if (!ref) continue;
      const idx = colIndex(ref[1]);
      const isStr = /\bt="s"/.test(attrs);
      const v = /<x:v>([\s\S]*?)<\/x:v>/.exec(inner)?.[1] ?? "";
      const value = isStr ? strings[Number(v)] ?? "" : v;
      cells[idx] = value;
    }
    rows.push(cells.map((c) => c ?? ""));
  }
  return rows;
}

function parseCsv(text: string, sep = ";"): string[][] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length);
  return lines.map((line) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (ch === sep && !inQ) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  });
}

function csvObjects(text: string, sep = ";"): Record<string, string>[] {
  const rows = parseCsv(text, sep);
  const headers = rows[0] ?? [];
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => {
      o[h] = r[i] ?? "";
    });
    return o;
  });
}

function parseFrDate(s: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return utcDate(Number(m[3]), Number(m[2]), Number(m[1]));
}

function parseExcelSerial(s: string): Date | null {
  const n = Number(s);
  if (!Number.isFinite(n) || n < 20000) return parseFrDate(s);
  const ms = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000;
  const d = new Date(ms);
  return utcDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function utcDate(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d));
}

function parseNum(s: string): number {
  const t = (s || "").trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
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
  const weekStart = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  const dow = (weekStart.getUTCDay() + 6) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - dow);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  return { isoYear, isoWeek, weekStart, weekEnd };
}

function eachDate(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(from.getTime());
  while (cur <= to) {
    out.push(new Date(cur.getTime()));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function isWeekday(d: Date) {
  const day = d.getUTCDay();
  return day !== 0 && day !== 6;
}

function mapAccount(lucca: string): AccountMap {
  const name = lucca.trim();
  const cp = /Congés payés (\d{4})\/(\d{4})/.exec(name);
  if (cp) {
    const y = Number(cp[1]);
    return {
      code: "CP",
      label: name,
      periodStart: utcDate(y, 7, 1),
      periodEnd: utcDate(y + 1, 6, 30),
    };
  }
  if (name === "Récupération") {
    return {
      code: "RECUP",
      label: "Récupération",
      periodStart: utcDate(2026, 1, 1),
      periodEnd: utcDate(2026, 12, 31),
    };
  }
  if (name === "École") {
    return {
      code: "SCHOOL",
      label: "École",
      periodStart: utcDate(2026, 1, 1),
      periodEnd: utcDate(2026, 12, 31),
    };
  }
  if (name === "Maladie") {
    return { code: "SS", label: "Maladie" };
  }
  if (name === "Congé sans solde" || name === "Absence autorisée non payée") {
    return { code: "UNPAID", label: name };
  }
  return { code: "AUTHORIZED", label: name };
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

type DaySlot = {
  date: Date;
  days: number;
  halfDay: boolean;
  half: string | null;
};

function expandAbsence(opts: {
  from: Date;
  to: Date;
  duration: number;
  unit: string;
}): DaySlot[] {
  const calendar = opts.unit.includes("calendaire");
  const hours = opts.unit.includes("heure");
  const pool = eachDate(opts.from, opts.to).filter((d) => calendar || isWeekday(d));
  if (pool.length === 0) return [];

  if (hours) {
    let remaining = opts.duration;
    const out: DaySlot[] = [];
    for (let i = 0; i < pool.length; i++) {
      if (remaining <= 0.05) break;
      const last = i === pool.length - 1;
      const take = last ? remaining : Math.min(HOURS_PER_DAY, remaining);
      const days = round4(take / HOURS_PER_DAY);
      const halfDay = days < 0.95;
      out.push({
        date: pool[i],
        days: Math.min(days, 1),
        halfDay,
        half: halfDay ? (days >= 0.45 ? "PM" : "AM") : null,
      });
      remaining -= take;
    }
    return out;
  }

  let remaining = opts.duration;
  const out: DaySlot[] = [];
  for (let i = 0; i < pool.length; i++) {
    if (remaining <= 0.05) break;
    const last = i === pool.length - 1;
    const take = last ? remaining : Math.min(1, remaining);
    const halfDay = take < 0.95;
    out.push({
      date: pool[i],
      days: round4(Math.min(take, 1)),
      halfDay,
      half: halfDay ? "AM" : null,
    });
    remaining -= take;
  }
  return out;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function slotsFor(workMinutes: number) {
  if (workMinutes <= 0) {
    return { slots: [] as { from: string; to: string }[], breakMinutes: 0, totalMinutes: 0 };
  }
  const brk = workMinutes >= 300 ? 60 : 0;
  const span = workMinutes + brk;
  const endH = 9 + Math.floor(span / 60);
  const endM = span % 60;
  return {
    slots: [{ from: "09:00", to: `${pad2(endH)}:${pad2(endM)}` }],
    breakMinutes: brk,
    totalMinutes: workMinutes,
  };
}

function findFile(dir: string, includes: string) {
  const files = fs.readdirSync(dir);
  const hit = files.find((f) => f.toLowerCase().includes(includes.toLowerCase()));
  if (!hit) throw new Error(`Fichier introuvable (${includes}) dans ${dir}`);
  return path.join(dir, hit);
}

function emailCandidates(email: string) {
  const e = email.trim().toLowerCase();
  const out = [e];
  if (e.includes("daphnee@")) out.push(e.replace("daphnee@", "daphne@"));
  if (e.includes("daphne@") && !e.includes("daphnee@")) {
    out.push(e.replace("daphne@", "daphnee@"));
  }
  return [...new Set(out)];
}

function matchName(
  prenom: string,
  nom: string,
  index: Map<string, string>
): string | undefined {
  return (
    index.get(nameKey(prenom, nom)) ||
    index.get(nameKey(nom, prenom)) ||
    index.get(`${fold(prenom + nom)}`)
  );
}

function rhRoleFromLucca(role: string): RhRole {
  const r = fold(role);
  if (r.includes("administrateur") || r.includes("assistantededirection")) {
    return "HR";
  }
  if (r === "manager") return "MANAGER";
  return "COLLAB";
}

function isContractEnded(fin: string, today: Date) {
  const d = parseFrDate(fin);
  if (!d) return false;
  return d.getTime() < today.getTime();
}

async function main() {
  const dir = process.argv[2] || DEFAULT_DIR;
  if (!fs.existsSync(dir)) {
    throw new Error(`Dossier introuvable: ${dir}`);
  }
  console.log(`Import Lucca RH depuis ${dir}`);

  await prisma.$executeRawUnsafe(
    `ALTER TYPE "RhLeaveAccount" ADD VALUE IF NOT EXISTS 'SCHOOL'`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TYPE "RhLeaveAccount" ADD VALUE IF NOT EXISTS 'AUTHORIZED'`
  );

  const dossierPath = findFile(dir, "Rapport dossier RH");
  const soldesPath = findFile(dir, "Soldes");
  const evoPath = findFile(dir, "volution du solde");
  const absPath = findFile(dir, "par compte");
  const ndfPath = findFile(dir, "NDF");
  const tsPath = findFile(dir, "Feuilles de temps");
  const office2025 = findFile(dir, "31_12_2025");
  const office2026 = findFile(dir, "01_11_2026");

  const dossier = csvObjects(fs.readFileSync(dossierPath, "utf8"));
  const byLuccaId = new Map<string, Record<string, string>[]>();
  for (const row of dossier) {
    const id = row["Id"]?.trim();
    if (!id) continue;
    const list = byLuccaId.get(id) ?? [];
    list.push(row);
    byLuccaId.set(id, list);
  }

  const today = utcDate(2026, 8, 31);
  const existing = await prisma.rhEmployee.findMany({
    include: { user: { select: { id: true, email: true, prenom: true, nom: true } } },
  });
  const byEmail = new Map<string, (typeof existing)[number]>();
  const byName = new Map<string, (typeof existing)[number]>();
  for (const e of existing) {
    byEmail.set(e.user.email.toLowerCase(), e);
    byName.set(nameKey(e.user.prenom, e.user.nom), e);
  }

  const empByName = new Map<string, string>();
  const empMeta = new Map<
    string,
    { id: string; hireDate: Date; weeklyHours: number; prenom: string; nom: string }
  >();
  let createdUsers = 0;
  let updatedEmps = 0;
  const passwordHash = await bcrypt.hash("GlowUp2026!", 12);
  let colorIdx = 0;

  const people: Array<{
    luccaId: string;
    prenom: string;
    nom: string;
    email: string;
    row: Record<string, string>;
  }> = [];

  for (const [luccaId, rows] of byLuccaId) {
    const current =
      rows.find((r) => {
        const end = r["Cycles de travail (endsOn)"] || "";
        const d = parseFrDate(end);
        return !d || d.getUTCFullYear() >= 2200;
      }) || rows[0];
    const prenom = (current["Prénom"] || "").trim();
    const nom = (current["Nom"] || "").trim();
    const email = (current["Email professionnel"] || "").trim();
    if (!prenom || !nom) continue;
    people.push({ luccaId, prenom, nom, email, row: current });
  }

  const sofian = people.find((p) => fold(p.nom).includes("ayadzeddam"));

  for (const p of people) {
    const hire = parseFrDate(p.row["Début de contrat"]) ?? utcDate(2024, 1, 1);
    const ended = isContractEnded(p.row["Fin de contrat"], today);
    const deptRaw = p.row["Département (name)"] || "";
    const department = DEPT_MAP[deptRaw] || deptRaw || "Direction générale";
    const jobTitle =
      (p.row["Intitulé de poste"] || "").trim() ||
      (fold(p.nom).includes("ayadzeddam")
        ? "Fondateur"
        : fold(p.prenom) === "maud"
          ? "Assistante de direction"
          : department);
    const weeklyHours = /forfait/i.test(p.row["Cycles de travail (name)"] || "")
      ? 35
      : 35;
    const role = rhRoleFromLucca(p.row["Rôle principal"] || "");
    const emails = emailCandidates(p.email);
    let found =
      emails.map((e) => byEmail.get(e)).find(Boolean) ||
      byName.get(nameKey(p.prenom, p.nom));

    if (!found) {
      let user = await prisma.user.findFirst({
        where: {
          OR: emails.map((e) => ({ email: { equals: e, mode: "insensitive" as const } })),
        },
      });
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: emails[0],
            password: passwordHash,
            prenom: p.prenom,
            nom: p.nom,
            role: role === "HR" ? "ADMIN" : "TM",
            actif: !ended,
          },
        });
        createdUsers++;
      }
      const emp = await prisma.rhEmployee.create({
        data: {
          userId: user.id,
          matricule: `LUC-${p.luccaId.padStart(4, "0")}`,
          jobTitle,
          department,
          hireDate: hire,
          weeklyHours,
          avatarColor: AVATARS[colorIdx++ % AVATARS.length],
          remoteAgreement: 2,
          rhRole: role,
          actif: !ended,
        },
        include: { user: { select: { id: true, email: true, prenom: true, nom: true } } },
      });
      found = emp;
    } else {
      await prisma.rhEmployee.update({
        where: { id: found.id },
        data: {
          jobTitle,
          department,
          hireDate: hire,
          weeklyHours,
          rhRole: role,
          actif: !ended,
        },
      });
      if (
        found.user.prenom !== p.prenom ||
        found.user.nom !== p.nom
      ) {
        await prisma.user.update({
          where: { id: found.user.id },
          data: { prenom: p.prenom, nom: p.nom },
        });
      }
      updatedEmps++;
    }

    const empId = found.id;
    empByName.set(nameKey(p.prenom, p.nom), empId);
    empByName.set(nameKey(p.nom, p.prenom), empId);
    empByName.set(fold(p.prenom + p.nom), empId);
    empByName.set(fold(p.nom + p.prenom), empId);
    empMeta.set(empId, {
      id: empId,
      hireDate: hire,
      weeklyHours,
      prenom: p.prenom,
      nom: p.nom,
    });
  }

  if (sofian) {
    const sofianId = empByName.get(nameKey(sofian.prenom, sofian.nom));
    if (sofianId) {
      for (const meta of empMeta.values()) {
        if (meta.id === sofianId) continue;
        await prisma.rhEmployee.update({
          where: { id: meta.id },
          data: { managerId: sofianId },
        });
      }
    }
  }

  console.log(
    `Collaborateurs: ${empMeta.size} (MAJ ${updatedEmps}, users créés ${createdUsers})`
  );

  console.log("Purge des données RH opérationnelles…");
  await prisma.rhLeaveDay.deleteMany();
  await prisma.rhTimesheet.deleteMany();
  await prisma.rhExpenseReport.deleteMany();
  await prisma.rhRemoteDeclaration.deleteMany();
  await prisma.rhLeaveBalance.deleteMany();
  await prisma.rhRequest.deleteMany({
    where: {
      type: {
        in: ["LEAVE", "UNPAID_LEAVE", "TIMESHEET", "EXPENSE", "REMOTE_EXCEPTION"],
      },
    },
  });

  const soldes = await readXlsx(soldesPath);
  const evo = await readXlsx(evoPath);
  type BalKey = string;
  const balAcc = new Map<
    BalKey,
    {
      employeeId: string;
      accountCode: RhLeaveAccount;
      label: string;
      periodStart: Date;
      periodEnd: Date;
      accrued: number;
      taken: number;
      remaining: number;
    }
  >();

  function balKey(employeeId: string, code: RhLeaveAccount, start: Date) {
    return `${employeeId}|${code}|${start.toISOString().slice(0, 10)}`;
  }

  function upsertBal(
    employeeId: string,
    mapped: AccountMap,
    patch: { accrued?: number; taken?: number; remaining?: number }
  ) {
    const periodStart = mapped.periodStart ?? utcDate(2025, 6, 1);
    const periodEnd = mapped.periodEnd ?? utcDate(2026, 5, 31);
    const k = balKey(employeeId, mapped.code, periodStart);
    const prev = balAcc.get(k);
    const accrued = patch.accrued ?? prev?.accrued ?? 0;
    const taken = patch.taken ?? prev?.taken ?? 0;
    const remaining =
      patch.remaining ?? prev?.remaining ?? round4(Math.max(0, accrued - taken));
    balAcc.set(k, {
      employeeId,
      accountCode: mapped.code,
      label: mapped.label,
      periodStart,
      periodEnd,
      accrued,
      taken,
      remaining,
    });
  }

  for (const r of evo.slice(2)) {
    const empId = matchName(r[3] || "", r[2] || "", empByName);
    if (!empId || !r[4]) continue;
    const mapped = mapAccount(r[4]);
    let accrued = parseNum(r[6]);
    let taken = parseNum(r[7]);
    if (mapped.code === "RECUP") {
      accrued = round4(accrued / HOURS_PER_DAY);
      taken = round4(taken / HOURS_PER_DAY);
    }
    upsertBal(empId, mapped, {
      accrued,
      taken,
      remaining: round4(Math.max(0, accrued - taken)),
    });
  }

  const soldeHeaders = soldes[0] || [];
  for (const r of soldes.slice(2)) {
    const empId = matchName(r[3] || "", r[2] || "", empByName);
    if (!empId) continue;
    for (let c = 5; c < r.length; c++) {
      const label = soldeHeaders[c] || "";
      const remainingRaw = parseNum(r[c]);
      if (!label || remainingRaw === 0) continue;
      const mapped = mapAccount(label);
      const remaining =
        mapped.code === "RECUP"
          ? round4(remainingRaw / HOURS_PER_DAY)
          : remainingRaw;
      upsertBal(empId, mapped, { remaining });
    }
  }

  let balCount = 0;
  for (const b of balAcc.values()) {
    if (b.remaining === 0) continue;
    const accrued = b.accrued > 0 ? b.accrued : b.remaining + b.taken;
    const future = b.accountCode === "CP" && b.periodStart > today;
    const hire = empMeta.get(b.employeeId)?.hireDate ?? today;
    const unlock = new Date(hire.getTime());
    unlock.setUTCFullYear(unlock.getUTCFullYear() + 1);
    const bookable =
      b.accountCode === "CP"
        ? future || today < unlock
          ? 0
          : b.remaining
        : b.remaining;
    await prisma.rhLeaveBalance.create({
      data: {
        employeeId: b.employeeId,
        accountCode: b.accountCode,
        label: b.label,
        periodStart: b.periodStart,
        periodEnd: b.periodEnd,
        accrued,
        taken: b.taken,
        remaining: b.remaining,
        bookable,
      },
    });
    balCount++;
  }
  console.log(`Soldes: ${balCount}`);

  const absences = await readXlsx(absPath);
  let reqCount = 0;
  let dayCount = 0;
  const daySeen = new Set<string>();
  const leaveDays: Array<{
    employeeId: string;
    requestId: string;
    date: Date;
    accountCode: RhLeaveAccount;
    halfDay: boolean;
    half: string | null;
    days: number;
  }> = [];

  for (const r of absences.slice(2)) {
    const etat = (r[4] || "").trim();
    if (etat !== "Approuvée") continue;
    const empId = matchName(r[3] || "", r[2] || "", empByName);
    if (!empId) continue;
    const from = parseExcelSerial(r[7] || "");
    const to = parseExcelSerial(r[8] || "");
    if (!from || !to) continue;
    const mapped = mapAccount(r[5] || "");
    const duration = parseNum(r[9]);
    const unit = (r[6] || "").toLowerCase();
    const daysValue = unit.includes("heure")
      ? round4(duration / HOURS_PER_DAY)
      : duration;
    reqCount++;
    const request = await prisma.rhRequest.create({
      data: {
        reference: `LUC-${String(reqCount).padStart(5, "0")}`,
        type: mapped.code === "UNPAID" ? "UNPAID_LEAVE" : "LEAVE",
        status: "APPROVED" as RhRequestStatus,
        employeeId: empId,
        title: `${mapped.label} · ${String(daysValue).replace(".", ",")} j`,
        payload: {
          accountCode: mapped.code,
          luccaAccount: r[5],
          imported: true,
        },
        days: daysValue,
        dateFrom: from,
        dateTo: to,
        reviewedAt: to,
      },
    });
    const slots = expandAbsence({
      from,
      to,
      duration,
      unit,
    });
    for (const slot of slots) {
      const half = slot.half ?? "FULL";
      const key = `${empId}|${slot.date.toISOString().slice(0, 10)}|${half}`;
      if (daySeen.has(key)) {
        const prev = leaveDays.find(
          (d) =>
            d.employeeId === empId &&
            d.date.getTime() === slot.date.getTime() &&
            (d.half ?? "FULL") === half
        );
        if (prev) prev.days = round4(Math.min(1, prev.days + slot.days));
        continue;
      }
      daySeen.add(key);
      leaveDays.push({
        employeeId: empId,
        requestId: request.id,
        date: slot.date,
        accountCode: mapped.code,
        halfDay: slot.halfDay,
        half: slot.half,
        days: slot.days,
      });
    }
  }

  for (let i = 0; i < leaveDays.length; i += 500) {
    const chunk = leaveDays.slice(i, i + 500);
    await prisma.rhLeaveDay.createMany({ data: chunk });
    dayCount += chunk.length;
  }
  console.log(`Absences: ${reqCount} demandes, ${dayCount} jours`);

  const officeRows = [
    ...csvObjects(fs.readFileSync(office2025, "utf8")),
    ...csvObjects(fs.readFileSync(office2026, "utf8")),
  ];
  type WeekKey = string;
  const remoteWeeks = new Map<
    WeekKey,
    { employeeId: string; isoYear: number; isoWeek: number; weekStart: Date; weekEnd: Date; dates: Set<string> }
  >();
  for (const row of officeRows) {
    if ((row["work_location_name"] || "").trim() !== "Télétravail") continue;
    const empId = matchName(row["first_name"] || "", row["last_name"] || "", empByName);
    if (!empId) continue;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(row["date"] || "")
      ? utcDate(
          Number(row["date"].slice(0, 4)),
          Number(row["date"].slice(5, 7)),
          Number(row["date"].slice(8, 10))
        )
      : parseFrDate(row["date"] || "");
    if (!d) continue;
    const info = isoWeekInfo(d);
    const k = `${empId}|${info.isoYear}|${info.isoWeek}`;
    const prev = remoteWeeks.get(k);
    const iso = d.toISOString().slice(0, 10);
    if (prev) prev.dates.add(iso);
    else {
      remoteWeeks.set(k, {
        employeeId: empId,
        isoYear: info.isoYear,
        isoWeek: info.isoWeek,
        weekStart: info.weekStart,
        weekEnd: info.weekEnd,
        dates: new Set([iso]),
      });
    }
  }

  const ttCounts = new Map<string, Map<string, number>>();
  for (const w of remoteWeeks.values()) {
    if (w.isoYear !== 2026) continue;
    const perEmp = ttCounts.get(w.employeeId) ?? new Map();
    perEmp.set(`${w.isoYear}-${w.isoWeek}`, w.dates.size);
    ttCounts.set(w.employeeId, perEmp);
  }
  for (const [empId, weeks] of ttCounts) {
    const vals = [...weeks.values()].sort((a, b) => a - b);
    if (!vals.length) continue;
    const median = vals[Math.floor(vals.length / 2)] ?? 2;
    const agreement = median >= 3 ? 3 : 2;
    await prisma.rhEmployee.update({
      where: { id: empId },
      data: { remoteAgreement: agreement },
    });
  }

  let remoteCount = 0;
  const remoteRows = [...remoteWeeks.values()].map((w) => ({
    employeeId: w.employeeId,
    isoYear: w.isoYear,
    isoWeek: w.isoWeek,
    weekStart: w.weekStart,
    weekEnd: w.weekEnd,
    declaredDates: [...w.dates]
      .sort()
      .map((iso) =>
        utcDate(
          Number(iso.slice(0, 4)),
          Number(iso.slice(5, 7)),
          Number(iso.slice(8, 10))
        )
      ),
  }));
  for (let i = 0; i < remoteRows.length; i += 200) {
    await prisma.rhRemoteDeclaration.createMany({
      data: remoteRows.slice(i, i + 200),
    });
    remoteCount += remoteRows.slice(i, i + 200).length;
  }
  console.log(`Télétravail: ${remoteCount} semaines`);

  const tsRows = csvObjects(fs.readFileSync(tsPath, "utf8"));
  let tsCount = 0;
  for (const row of tsRows) {
    const full = (row["Nom complet"] || "").trim();
    if (!full) continue;
    const parts = full.split(/\s+/);
    const empId =
      matchName(parts[0] || "", parts.slice(1).join(" ") || "", empByName) ||
      matchName(parts.slice(1).join(" ") || "", parts[0] || "", empByName) ||
      matchName(parts[parts.length - 1] || "", parts.slice(0, -1).join(" ") || "", empByName);
    if (!empId) continue;
    const start = parseFrDate(row["Date de début"] || "");
    if (!start) continue;
    const info = isoWeekInfo(start);
    const hours = parseNum(row["Temps de travail (Heures)"]);
    const theoretical = parseNum(row["Temps théorique (Heures)"]);
    const totalMinutes = Math.round(hours * 60);
    const contractMin = Math.round((theoretical || 35) * 60);
    const overtime = Math.max(0, totalMinutes - (contractMin || 35 * 60));
    const ot25 = Math.min(overtime, 8 * 60);
    const ot50 = Math.max(0, overtime - 8 * 60);
    const signed = info.weekEnd.getTime() < today.getTime();
    const perDay = [0, 0, 0, 0, 0];
    let left = totalMinutes;
    for (let i = 0; i < 5; i++) {
      const take = Math.floor(left / (5 - i));
      perDay[i] = take;
      left -= take;
    }
    try {
      await prisma.rhTimesheet.create({
        data: {
          employeeId: empId,
          isoYear: info.isoYear,
          isoWeek: info.isoWeek,
          weekStart: info.weekStart,
          weekEnd: info.weekEnd,
          status: signed ? "SIGNED" : "DRAFT",
          totalMinutes,
          ot25Minutes: ot25,
          ot50Minutes: ot50,
          signedAt: signed ? info.weekEnd : null,
          days: {
            create: Array.from({ length: 7 }, (_, i) => {
              const date = new Date(info.weekStart);
              date.setUTCDate(info.weekStart.getUTCDate() + i);
              const work = i < 5 ? perDay[i] : 0;
              const built = slotsFor(work);
              return {
                date,
                slots: built.slots,
                breakMinutes: i < 5 ? built.breakMinutes : 0,
                totalMinutes: built.totalMinutes,
              };
            }),
          },
        },
      });
      tsCount++;
    } catch (e) {
      if (
        e instanceof Error &&
        e.message.includes("Unique constraint")
      ) {
        continue;
      }
      throw e;
    }
  }
  console.log(`Feuilles de temps: ${tsCount}`);

  const ndfRows = parseCsv(fs.readFileSync(ndfPath, "utf8"));
  const ndfHeaders = ndfRows[0] || [];
  const monthCols: Array<{ idx: number; year: number; month: number }> = [];
  for (let i = 3; i < ndfHeaders.length; i++) {
    const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(ndfHeaders[i] || "");
    if (!m) continue;
    monthCols.push({ idx: i, month: Number(m[2]), year: Number(m[3]) });
  }
  const mealCats = new Set(["Déjeuner", "Dîner", "Petit-Déjeuner", "Coffee Break"]);
  type ExpKey = string;
  const expMap = new Map<
    ExpKey,
    {
      employeeId: string;
      year: number;
      month: number;
      lines: Array<{
        category: string;
        amount: number;
        isMileage: boolean;
        isCompanyMeal: boolean;
      }>;
    }
  >();

  for (const r of ndfRows.slice(1)) {
    const user = (r[2] || "").trim();
    if (!user) continue;
    const parts = user.split(/\s+/);
    const empId =
      matchName(parts[0] || "", parts.slice(1).join(" ") || "", empByName) ||
      matchName(parts.slice(1).join(" ") || "", parts[0] || "", empByName) ||
      matchName(parts[parts.length - 1] || "", parts.slice(0, -1).join(" ") || "", empByName);
    if (!empId) continue;
    const category = (r[0] || "").trim();
    for (const col of monthCols) {
      const amount = parseNum(r[col.idx] || "");
      if (amount <= 0) continue;
      const k = `${empId}|${col.year}|${col.month}`;
      const prev = expMap.get(k) ?? {
        employeeId: empId,
        year: col.year,
        month: col.month,
        lines: [],
      };
      prev.lines.push({
        category,
        amount,
        isMileage: category === "Frais kilométriques",
        isCompanyMeal: mealCats.has(category),
      });
      expMap.set(k, prev);
    }
  }

  let expCount = 0;
  let lineCount = 0;
  for (const exp of expMap.values()) {
    const total = round4(exp.lines.reduce((s, l) => s + l.amount, 0));
    const rows = await prisma.$queryRaw<{ n: number }[]>`
      SELECT nextval('rh_expense_report_number_seq')::int AS n
    `;
    const report = await prisma.rhExpenseReport.create({
      data: {
        number: rows[0]?.n ?? Date.now() % 100000,
        employeeId: exp.employeeId,
        label: `NDF ${String(exp.month).padStart(2, "0")}/${exp.year}`,
        periodMonth: exp.month,
        periodYear: exp.year,
        status: "PAID",
        totalAmount: total,
      },
    });
    expCount++;
    await prisma.rhExpenseLine.createMany({
      data: exp.lines.map((l) => ({
        reportId: report.id,
        date: utcDate(exp.year, exp.month, 15),
        category: l.category,
        label: l.category,
        amount: l.amount,
        vatRate: 0,
        vatAmount: 0,
        comment: "Import Lucca (agrégat mensuel)",
        isCompanyMeal: l.isCompanyMeal,
        isMileage: l.isMileage,
        missingReceipt: false,
        status: "ok",
      })),
    });
    lineCount += exp.lines.length;
  }
  console.log(`Notes de frais: ${expCount} notes, ${lineCount} lignes`);

  await prisma.rhAuditLog.create({
    data: {
      action: "lucca.import",
      detail: {
        employees: empMeta.size,
        balances: balCount,
        leaveRequests: reqCount,
        leaveDays: dayCount,
        remoteWeeks: remoteCount,
        timesheets: tsCount,
        expenses: expCount,
      },
    },
  });

  console.log("Import Lucca RH terminé.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
