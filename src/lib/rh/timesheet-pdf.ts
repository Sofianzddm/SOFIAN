import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { v2 as cloudinary } from "cloudinary";
import prisma from "@/lib/prisma";
import { displayName } from "@/lib/rh/auth";
import { frenchHolidayLabel, isFrenchHoliday } from "@/lib/rh/holidays";
import {
  TimesheetPdfDocument,
  type TimesheetPdfData,
  type TimesheetPdfDay,
} from "@/lib/rh/timesheet-pdf-document";

function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmtDateTime(d: Date) {
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function weekdayLabel(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "long" });
}

type Slot = { from: string; to: string };

export async function buildTimesheetPdfData(
  timesheetId: string,
  opts?: {
    signed?: boolean;
    signatureName?: string | null;
    signatureImageDataUrl?: string | null;
  }
): Promise<TimesheetPdfData> {
  const ts = await prisma.rhTimesheet.findUniqueOrThrow({
    where: { id: timesheetId },
    include: {
      days: { orderBy: { date: "asc" } },
      employee: {
        include: {
          user: { select: { prenom: true, nom: true, email: true } },
          manager: {
            include: {
              user: { select: { prenom: true, nom: true, email: true } },
            },
          },
        },
      },
      request: {
        include: {
          reviewedBy: {
            include: {
              user: { select: { prenom: true, nom: true } },
            },
          },
        },
      },
    },
  });

  const days: TimesheetPdfDay[] = ts.days.map((d) => {
    const iso = d.date.toISOString().slice(0, 10);
    const slots = (Array.isArray(d.slots) ? d.slots : []) as Slot[];
    const holiday = frenchHolidayLabel(iso);
    const dow = new Date(iso + "T12:00:00").getDay();
    return {
      date: iso,
      weekday: weekdayLabel(iso),
      slotsLabel: slots.map((s) => `${s.from}–${s.to}`).join(" · "),
      breakMinutes: d.breakMinutes,
      totalMinutes: d.totalMinutes,
      isWeekend: dow === 0 || dow === 6,
      isHoliday: isFrenchHoliday(iso),
      holidayLabel: holiday,
    };
  });

  const signed = opts?.signed ?? ts.status === "SIGNED";
  const approverName = ts.request?.reviewedBy
    ? displayName(ts.request.reviewedBy.user)
    : ts.employee.manager
      ? displayName(ts.employee.manager.user)
      : null;

  return {
    reference: `FT-${ts.isoYear}-S${String(ts.isoWeek).padStart(2, "0")}-${ts.employee.matricule}`,
    employeeName: displayName(ts.employee.user),
    employeeEmail: ts.employee.user.email || "",
    matricule: ts.employee.matricule,
    jobTitle: ts.employee.jobTitle || "",
    department: ts.employee.department || "",
    managerName: ts.employee.manager
      ? displayName(ts.employee.manager.user)
      : null,
    weeklyHours: ts.employee.weeklyHours,
    isoWeek: ts.isoWeek,
    isoYear: ts.isoYear,
    weekStartLabel: fmtDate(ts.weekStart),
    weekEndLabel: fmtDate(ts.weekEnd),
    days,
    totalMinutes: ts.totalMinutes,
    ot25Minutes: ts.ot25Minutes,
    ot50Minutes: ts.ot50Minutes,
    overtimeNote: ts.overtimeNote,
    generatedAtLabel: fmtDateTime(new Date()),
    approvedAtLabel: ts.request?.reviewedAt
      ? fmtDateTime(ts.request.reviewedAt)
      : ts.signatureRequestedAt
        ? fmtDateTime(ts.signatureRequestedAt)
        : null,
    approverName,
    signatureRequested: !!ts.signatureRequestedAt || !!opts?.signed,
    signed,
    signedAtLabel: ts.signedAt ? fmtDateTime(ts.signedAt) : signed ? fmtDateTime(new Date()) : null,
    signatureName: opts?.signatureName ?? ts.signatureName,
    signatureImageDataUrl: opts?.signatureImageDataUrl ?? null,
  };
}

export async function renderTimesheetPdfBuffer(
  data: TimesheetPdfData
): Promise<Buffer> {
  const element = createElement(TimesheetPdfDocument, { data });
  const buf = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
  return Buffer.from(buf);
}

export async function uploadTimesheetPdf(params: {
  timesheetId: string;
  employeeId: string;
  buffer: Buffer;
  kind: "request" | "signed";
}): Promise<string> {
  configureCloudinary();
  const base64 = `data:application/pdf;base64,${params.buffer.toString("base64")}`;
  const uploaded = await cloudinary.uploader.upload(base64, {
    folder: "glowup-rh-timesheets",
    public_id: `ft-${params.employeeId}-${params.timesheetId}-${params.kind}-${Date.now()}`,
    resource_type: "raw",
    format: "pdf",
  });
  return uploaded.secure_url as string;
}

/** Génère le PDF « signature requise » et le stocke sur la feuille. */
export async function generateAndStoreTimesheetPdf(timesheetId: string) {
  const data = await buildTimesheetPdfData(timesheetId, { signed: false });
  data.signatureRequested = true;
  const buffer = await renderTimesheetPdfBuffer(data);
  const ts = await prisma.rhTimesheet.findUniqueOrThrow({
    where: { id: timesheetId },
    select: { employeeId: true },
  });
  const url = await uploadTimesheetPdf({
    timesheetId,
    employeeId: ts.employeeId,
    buffer,
    kind: "request",
  });
  return prisma.rhTimesheet.update({
    where: { id: timesheetId },
    data: { pdfUrl: url },
  });
}

/** Régénère le PDF signé (avec tampon + image éventuelle). */
export async function generateAndStoreSignedTimesheetPdf(params: {
  timesheetId: string;
  signatureName: string;
  signatureImageDataUrl?: string | null;
}) {
  const data = await buildTimesheetPdfData(params.timesheetId, {
    signed: true,
    signatureName: params.signatureName,
    signatureImageDataUrl: params.signatureImageDataUrl,
  });
  const buffer = await renderTimesheetPdfBuffer(data);
  const ts = await prisma.rhTimesheet.findUniqueOrThrow({
    where: { id: params.timesheetId },
    select: { employeeId: true },
  });
  const url = await uploadTimesheetPdf({
    timesheetId: params.timesheetId,
    employeeId: ts.employeeId,
    buffer,
    kind: "signed",
  });
  return { url, buffer };
}
