import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  canViewRhEmployee,
  isRhManager,
  requireRhSessionFromRequest,
} from "@/lib/rh/auth";
import { getOrCreateTimesheet, getTimesheetPdfBuffer } from "@/lib/rh/timesheet";

type Ctx = { params: Promise<{ week: string }> };

function parseWeekParam(week: string): Date {
  if (/^\d{4}-W\d{2}$/.test(week)) {
    const [y, w] = week.split("-W").map(Number);
    return new Date(Date.UTC(y, 0, 1 + (w - 1) * 7));
  }
  return new Date(week);
}

/** Télécharge / regénère le PDF de la feuille (collab = sa feuille ; manager = ?employeeId). */
export async function GET(request: NextRequest, ctx: Ctx) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const { week } = await ctx.params;
  const employeeIdParam = request.nextUrl.searchParams.get("employeeId");
  let employeeId = session.employee.id;
  let weeklyHours = session.employee.weeklyHours;

  if (employeeIdParam && employeeIdParam !== session.employee.id) {
    if (!isRhManager(session.employee.rhRole)) {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }
    const allowed = await canViewRhEmployee(
      session.employee,
      employeeIdParam
    );
    if (!allowed) {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }
    employeeId = employeeIdParam;
    const target = await prisma.rhEmployee.findUnique({
      where: { id: employeeId },
      select: { weeklyHours: true },
    });
    weeklyHours = target?.weeklyHours ?? weeklyHours;
  }

  const { timesheet } = await getOrCreateTimesheet(
    employeeId,
    parseWeekParam(week),
    weeklyHours
  );

  const filename = `feuille-temps-S${timesheet.isoWeek}-${timesheet.isoYear}.pdf`;

  // Signé : proxy serveur de l’archive DocuSeal/Cloudinary (évite « Accès
  // non autorisé » si le navigateur ouvre l’URL raw privée).
  if (timesheet.signedPdfUrl && timesheet.status === "SIGNED") {
    try {
      const upstream = await fetch(timesheet.signedPdfUrl);
      if (upstream.ok) {
        const buf = Buffer.from(await upstream.arrayBuffer());
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${filename}"`,
            "Cache-Control": "private, max-age=60",
          },
        });
      }
    } catch {
      // fallback génération ci-dessous
    }
  }

  // Non signé (ou proxy KO) : régénération à la volée (HS / majorations à jour).
  try {
    const { buffer, filename: generatedName } = await getTimesheetPdfBuffer(
      timesheet.id
    );
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${generatedName}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PDF impossible" },
      { status: 400 }
    );
  }
}

/** Force régénération (manager/HR, scoped). */
export async function POST(request: NextRequest, ctx: Ctx) {
  const session = await requireRhSessionFromRequest(request);
  if (!session || !isRhManager(session.employee.rhRole)) {
    return NextResponse.json({ error: "Interdit" }, { status: 403 });
  }
  void ctx;
  const body = await request.json().catch(() => ({}));
  const timesheetId = String(body.timesheetId || "");
  if (!timesheetId) {
    return NextResponse.json({ error: "timesheetId requis" }, { status: 400 });
  }
  const ts = await prisma.rhTimesheet.findUnique({ where: { id: timesheetId } });
  if (!ts) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const allowed = await canViewRhEmployee(session.employee, ts.employeeId);
  if (!allowed) {
    return NextResponse.json({ error: "Interdit" }, { status: 403 });
  }

  const { generateAndStoreTimesheetPdf } = await import("@/lib/rh/timesheet-pdf");
  const updated = await generateAndStoreTimesheetPdf(ts.id);
  return NextResponse.json({ pdfUrl: updated.pdfUrl });
}
