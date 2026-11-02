import { NextRequest, NextResponse } from "next/server";
import {
  canViewRhEmployee,
  displayName,
  isRhHr,
  isRhManager,
  requireRhSessionFromRequest,
} from "@/lib/rh/auth";
import {
  listAwaitingSignature,
  listSignedTimesheets,
  requestMonthlySignatures,
  requestTimesheetSignature,
} from "@/lib/rh/timesheet";
import prisma from "@/lib/prisma";

function mapSignatureRow(t: {
  id: string;
  employeeId: string;
  isoWeek: number;
  isoYear: number;
  totalMinutes: number;
  status: string;
  signatureRequestedAt: Date | null;
  signedAt: Date | null;
  weekStart: Date;
  pdfUrl: string | null;
  signedPdfUrl: string | null;
  docusealSigningUrl: string | null;
  docusealSubmissionId: string | null;
  employee: {
    user: { prenom: string; nom: string; email: string | null };
  };
}) {
  return {
    id: t.id,
    employeeId: t.employeeId,
    name: displayName(t.employee.user),
    email: t.employee.user.email,
    isoWeek: t.isoWeek,
    isoYear: t.isoYear,
    totalMinutes: t.totalMinutes,
    signatureRequestedAt: t.signatureRequestedAt?.toISOString() ?? null,
    signedAt: t.signedAt?.toISOString() ?? null,
    weekStart: t.weekStart.toISOString().slice(0, 10),
    pdfUrl: t.pdfUrl ?? null,
    signedPdfUrl: t.signedPdfUrl ?? null,
    docusealSigningUrl: t.docusealSigningUrl ?? null,
    docusealSubmissionId: t.docusealSubmissionId ?? null,
    status: t.status,
  };
}

/** Liste des feuilles en attente de signature + feuilles déjà signées. */
export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session || !isRhManager(session.employee.rhRole)) {
    return NextResponse.json({ error: "Interdit" }, { status: 403 });
  }
  const hr = isRhHr(session.employee.rhRole);
  const scope = hr ? { hr: true as const } : { managerId: session.employee.id };
  const [awaiting, signed] = await Promise.all([
    listAwaitingSignature(scope),
    listSignedTimesheets(scope),
  ]);
  return NextResponse.json({
    items: awaiting.map(mapSignatureRow),
    signed: signed.map(mapSignatureRow),
  });
}

/**
 * POST actions :
 * - { action: "request", timesheetId }
 * - { action: "monthly", year, month } — batch mensuel (HR ou cron secret)
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const cronSecret = process.env.RH_CRON_SECRET?.trim();
  const headerSecret = request.headers.get("x-rh-cron-secret");
  const isCron =
    !!cronSecret && headerSecret === cronSecret && body.action === "monthly";

  if (!isCron) {
    const session = await requireRhSessionFromRequest(request);
    if (!session || !isRhManager(session.employee.rhRole)) {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }
    try {
      if (body.action === "request") {
        const timesheetId = String(body.timesheetId);
        const ts = await prisma.rhTimesheet.findUnique({
          where: { id: timesheetId },
          select: { employeeId: true },
        });
        if (!ts) {
          return NextResponse.json({ error: "Introuvable" }, { status: 404 });
        }
        const allowed = await canViewRhEmployee(
          session.employee,
          ts.employeeId
        );
        if (!allowed) {
          return NextResponse.json({ error: "Interdit" }, { status: 403 });
        }
        const result = await requestTimesheetSignature({
          timesheetId,
          actorId: session.employee.id,
        });
        return NextResponse.json({ timesheet: result });
      }
      if (body.action === "monthly") {
        if (!isRhHr(session.employee.rhRole)) {
          return NextResponse.json({ error: "HR requis" }, { status: 403 });
        }
        const year = Number(body.year) || new Date().getFullYear();
        const month =
          Number(body.month) ||
          (new Date().getMonth() === 0 ? 12 : new Date().getMonth());
        const result = await requestMonthlySignatures({
          year,
          month,
          actorId: session.employee.id,
        });
        return NextResponse.json(result);
      }
      return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Erreur" },
        { status: 400 }
      );
    }
  }

  // Cron
  try {
    const year = Number(body.year) || new Date().getFullYear();
    const month =
      Number(body.month) ||
      (new Date().getMonth() === 0 ? 12 : new Date().getMonth());
    const hr = await prisma.rhEmployee.findFirst({
      where: { rhRole: "HR", actif: true },
      select: { id: true },
    });
    const result = await requestMonthlySignatures({
      year,
      month,
      actorId: hr?.id ?? "",
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
