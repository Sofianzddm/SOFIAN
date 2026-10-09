import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  displayName,
  initials,
  requireRhSessionFromRequest,
} from "@/lib/rh/auth";
import { getBalancesForEmployee } from "@/lib/rh/leave";
import { computeTrForMonth } from "@/lib/rh/expenses";
import { minutesToLabel } from "@/lib/rh/calculations";
import { isoWeekInfo } from "@/lib/rh/workflow";

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const emp = session.employee;
  const balances = await getBalancesForEmployee(emp.id, emp.hireDate);
  const bookable = balances.reduce((s, b) => s + b.bookable, 0);
  const cpBalances = balances.filter((b) => b.accountCode === "CP");
  const cpRemaining = cpBalances.reduce((s, b) => s + b.remaining, 0);
  const cpBookable = cpBalances.reduce((s, b) => s + b.bookable, 0);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const tsMonth = await prisma.rhTimesheet.findMany({
    where: {
      employeeId: emp.id,
      weekStart: { gte: monthStart },
      status: { in: ["APPROVED", "SIGNED", "SUBMITTED"] },
    },
  });
  const ot25 = tsMonth.reduce((s, t) => s + t.ot25Minutes, 0);
  const ot50 = tsMonth.reduce((s, t) => s + t.ot50Minutes, 0);

  const drafts = await prisma.rhExpenseReport.findMany({
    where: { employeeId: emp.id, status: "DRAFT" },
  });
  const fraisTotal = drafts.reduce((s, r) => s + Number(r.totalAmount), 0);

  const pending = await prisma.rhRequest.findMany({
    where: {
      employeeId: emp.id,
      status: { in: ["PENDING", "PAUSED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const awayToday = await prisma.rhLeaveDay.findMany({
    where: {
      date: today,
      employee: { department: emp.department, actif: true },
      OR: [
        { requestId: null },
        { request: { status: { in: ["APPROVED", "PENDING", "SIGNED"] } } },
      ],
    },
    include: {
      employee: {
        include: { user: { select: { prenom: true, nom: true } } },
      },
    },
  });

  const remoteDecls = await prisma.rhRemoteDeclaration.findMany({
    where: {
      employee: { department: emp.department, actif: true },
      weekStart: { lte: today },
      weekEnd: { gte: today },
    },
    include: {
      employee: {
        include: { user: { select: { prenom: true, nom: true } } },
      },
    },
  });
  const todayKey = today.toISOString().slice(0, 10);
  const remoteToday = remoteDecls.filter((r) =>
    r.declaredDates.some((d) => d.toISOString().slice(0, 10) === todayKey)
  );

  const unlock = new Date(emp.hireDate);
  unlock.setFullYear(unlock.getFullYear() + 1);

  const tr = await computeTrForMonth({
    employeeId: emp.id,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  const info = isoWeekInfo(today);

  // Rappels pédagogiques (récup qui expire, timesheet non soumise, NDF brouillon)
  const reminders: Array<{
    id: string;
    bar: string;
    tag: string;
    tagBg: string;
    title: string;
    meta: string;
    cta: string;
    target: "leave" | "time" | "expenses" | "requests" | "remote" | "folder";
    urgent?: boolean;
  }> = [];

  // Présence / TT de la semaine
  const weekPlaces = await prisma.rhWorkDay.findMany({
    where: {
      employeeId: emp.id,
      date: { gte: info.weekStart, lte: info.weekEnd },
    },
  });
  const remoteApproved = weekPlaces.filter((p) => p.place === "REMOTE").length;
  const pendingTt = await prisma.rhRequest.findFirst({
    where: {
      employeeId: emp.id,
      type: "REMOTE_PLAN",
      status: "PENDING",
      dateFrom: { lte: info.weekEnd },
      dateTo: { gte: info.weekStart },
    },
    orderBy: { createdAt: "desc" },
  });
  const pendingTtDates =
    (pendingTt?.payload as { dates?: string[] } | null)?.dates?.length ?? 0;

  if (pendingTt) {
    reminders.push({
      id: "tt-pending",
      bar: "#7C8CF8",
      tag: "TT",
      tagBg: "#7C8CF8",
      title: pendingTt.title,
      meta: `${pendingTt.reference} · en attente de validation manager`,
      cta: "Voir",
      target: "requests",
      urgent: true,
    });
  } else if (
    emp.remoteAgreement > 0 &&
    remoteApproved === 0 &&
    today.getDay() !== 0 &&
    today.getDay() !== 6
  ) {
    reminders.push({
      id: "tt-declare",
      bar: "#7C8CF8",
      tag: "Présence",
      tagBg: "#7C8CF8",
      title: "Déclare ta présence de la semaine",
      meta: `Droit ${emp.remoteAgreement} j TT — le TT part en validation`,
      cta: "Déclarer",
      target: "remote",
    });
  }

  const addrPending = await prisma.rhRequest.findFirst({
    where: {
      employeeId: emp.id,
      type: "ADDRESS_CHANGE",
      status: "PENDING",
    },
  });
  if (addrPending) {
    reminders.push({
      id: "addr-pending",
      bar: "#7C8CF8",
      tag: "Adresse",
      tagBg: "#7C8CF8",
      title: "Adresse TT en validation",
      meta: addrPending.reference,
      cta: "Voir",
      target: "requests",
    });
  }
  const empRow = await prisma.rhEmployee.findUnique({
    where: { id: emp.id },
    select: { remoteAddressLine1: true },
  });
  if (!empRow?.remoteAddressLine1 && emp.remoteAgreement > 0 && !addrPending) {
    reminders.push({
      id: "addr-missing",
      bar: "#F0C24E",
      tag: "Adresse",
      tagBg: "#F0C24E",
      title: "Renseigne ton adresse de télétravail",
      meta: "Validation RH obligatoire",
      cta: "Compléter",
      target: "folder",
    });
  }
  void pendingTtDates;

  const recupBal = balances.find((b) => b.accountCode === "RECUP" && b.bookable > 0);
  if (recupBal?.expiresOn) {
    const daysLeft = Math.ceil(
      (recupBal.expiresOn.getTime() - today.getTime()) / 86400000
    );
    if (daysLeft <= 45) {
      reminders.push({
        id: "recup-expire",
        bar: "#F2874E",
        tag: "Récup",
        tagBg: "#F2874E",
        title: `Récupération à poser (${recupBal.bookable.toFixed(1).replace(".", ",")} j)`,
        meta:
          daysLeft <= 0
            ? "Échéance dépassée — pose-les rapidement"
            : `Expire dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""}`,
        cta: "Poser",
        target: "leave",
        urgent: daysLeft <= 14,
      });
    }
  }

  const openTs = await prisma.rhTimesheet.findFirst({
    where: {
      employeeId: emp.id,
      isoYear: info.isoYear,
      isoWeek: info.isoWeek,
      status: "DRAFT",
    },
  });
  if (openTs && today.getDay() >= 4) {
    reminders.push({
      id: "ts-week",
      bar: "#F0C24E",
      tag: "Temps",
      tagBg: "#F0C24E",
      title: `Feuille S${info.isoWeek} non soumise`,
      meta: "Pense à la valider avant la fin de semaine",
      cta: "Saisir",
      target: "time",
    });
  }

  if (drafts.length > 0) {
    reminders.push({
      id: "ndf-draft",
      bar: "#F2874E",
      tag: "Frais",
      tagBg: "#F2874E",
      title:
        drafts.length === 1
          ? "Une note de frais en brouillon"
          : `${drafts.length} notes de frais en brouillon`,
      meta: `${Math.round(fraisTotal)} € à finaliser`,
      cta: "Ouvrir",
      target: "expenses",
    });
  }

  const todos = [
    ...reminders,
    ...pending.map((p) => ({
      id: p.id,
      bar: p.status === "PAUSED" ? "#F2604E" : "#F0C24E",
      tag: p.type,
      tagBg: p.status === "PAUSED" ? "#F2604E" : "#F0C24E",
      title: p.title,
      meta: p.comment || p.reference,
      cta: "Voir",
      target: "requests" as const,
      urgent: p.status === "PAUSED",
    })),
  ];

  return NextResponse.json({
    today: {
      date: today.toISOString(),
      isoWeek: info.isoWeek,
    },
    kpis: [
      {
        id: "posable",
        label: "Jours posables",
        value: bookable.toFixed(1).replace(".", ","),
        unit: "j",
        sub: balances
          .filter((b) => b.bookable > 0)
          .map((b) => `${b.bookable.toFixed(1)} ${b.accountCode}`)
          .join(" · ") || "Aucun",
        tone: "#E5F2B5",
      },
      {
        id: "cp",
        label: "Congés payés",
        value: cpRemaining.toFixed(2).replace(".", ","),
        unit: "j",
        sub:
          cpBookable > 0
            ? "Disponibles"
            : `Disponibles le ${unlock.toLocaleDateString("fr-FR")}`,
        tone: "#46D6C0",
        locked: cpBookable === 0,
      },
      {
        id: "hs",
        label: "Heures supp. (mois)",
        value: ((ot25 + ot50) / 60).toFixed(1).replace(".", ","),
        unit: "h",
        sub: `${minutesToLabel(ot25)} à 25 % · ${minutesToLabel(ot50)} à 50 %`,
        tone: "#F0C24E",
      },
      {
        id: "frais",
        label: "Frais en cours",
        value: String(Math.round(fraisTotal)),
        unit: "€",
        sub: `${drafts.length} brouillon${drafts.length > 1 ? "s" : ""}`,
        tone: "#F2874E",
      },
    ],
    todos,
    awayToday: [
      ...awayToday.map((a) => ({
        name: displayName(a.employee.user),
        initials: initials(a.employee.user),
        color: a.employee.avatarColor,
        kind: a.accountCode,
      })),
      ...remoteToday.map((r) => ({
        name: displayName(r.employee.user),
        initials: initials(r.employee.user),
        color: r.employee.avatarColor,
        kind: "TT",
      })),
    ],
    tr,
    pendingCount: pending.length,
    presence: {
      isoWeek: info.isoWeek,
      weekStart: info.weekStart.toISOString().slice(0, 10),
      places: Object.fromEntries(
        weekPlaces.map((p) => [
          p.date.toISOString().slice(0, 10),
          p.place,
        ])
      ),
      pendingRemote:
        (pendingTt?.payload as { dates?: string[] } | null)?.dates ?? [],
      remoteAgreement: emp.remoteAgreement,
    },
  });
}
