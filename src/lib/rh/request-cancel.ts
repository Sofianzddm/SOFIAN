import type { RhLeaveAccount, RhRequestType } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  BALANCE_ACCOUNTS,
  bookableBalance,
} from "@/lib/rh/calculations";
import { getRhSettings } from "@/lib/rh/settings";
import { syncTimesheetAbsencesForDates } from "@/lib/rh/timesheet";
import { notifyRhRequestCancelled } from "@/lib/rh/notify";

const CANCELABLE_TYPES = new Set<RhRequestType>([
  "LEAVE",
  "UNPAID_LEAVE",
  "TIMESHEET",
]);

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Restaure le solde après annulation d’un congé déjà approuvé. */
async function restoreLeaveBalance(params: {
  employeeId: string;
  hireDate: Date;
  accountCode: RhLeaveAccount;
  days: number;
}) {
  if (!BALANCE_ACCOUNTS.has(params.accountCode) || params.days <= 0) return;
  const bals = await prisma.rhLeaveBalance.findMany({
    where: { employeeId: params.employeeId, accountCode: params.accountCode },
    orderBy: { periodStart: "desc" },
  });
  let left = params.days;
  for (const bal of bals) {
    if (left <= 0) break;
    const give = Math.min(bal.taken, left);
    if (give <= 0) continue;
    const taken = Math.max(0, bal.taken - give);
    const remaining = Math.max(0, bal.accrued - taken);
    await prisma.rhLeaveBalance.update({
      where: { id: bal.id },
      data: {
        taken,
        remaining,
        bookable:
          params.accountCode === "CP"
            ? bookableBalance(remaining, params.hireDate, new Date(), "CP")
            : remaining,
      },
    });
    left -= give;
  }
}

/** Annule une demande CP / sans solde / feuille (HS). */
export async function cancelRhRequest(params: {
  requestId: string;
  actorId: string;
  /** true = manager/HR ; false = le collaborateur propriétaire */
  asManager: boolean;
  note?: string;
}) {
  const req = await prisma.rhRequest.findUnique({
    where: { id: params.requestId },
    include: {
      leaveDays: true,
      employee: { select: { id: true, hireDate: true } },
      timesheet: true,
    },
  });
  if (!req) throw new Error("Demande introuvable");
  if (!CANCELABLE_TYPES.has(req.type)) {
    throw new Error("Ce type de demande ne peut pas être annulé ici");
  }

  if (!params.asManager && req.employeeId !== params.actorId) {
    throw new Error("Interdit");
  }

  const pending =
    req.status === "PENDING" ||
    req.status === "PAUSED" ||
    req.status === "DRAFT";
  const approved = req.status === "APPROVED";

  if (!pending && !approved) {
    throw new Error(
      "Cette demande ne peut plus être annulée (déjà refusée, signée ou annulée)"
    );
  }

  // Feuille signée : pas d’annulation self-service
  if (req.type === "TIMESHEET") {
    const ts =
      req.timesheet ||
      (typeof (req.payload as { timesheetId?: string })?.timesheetId === "string"
        ? await prisma.rhTimesheet.findUnique({
            where: {
              id: (req.payload as { timesheetId: string }).timesheetId,
            },
          })
        : null);
    if (ts?.status === "SIGNED" || ts?.signedAt) {
      throw new Error(
        "Feuille déjà signée — annulation impossible. Contacte les RH."
      );
    }
  }

  // Collab : congé approuvé seulement si pas encore commencé
  if (
    !params.asManager &&
    approved &&
    (req.type === "LEAVE" || req.type === "UNPAID_LEAVE")
  ) {
    const first = req.dateFrom || req.leaveDays[0]?.date;
    if (first && first < startOfToday()) {
      throw new Error(
        "Congé déjà commencé — demande aux RH d’annuler si besoin"
      );
    }
  }

  const leaveDates = req.leaveDays.map((d) => d.date);
  const accountCode = (req.payload as { accountCode?: RhLeaveAccount })
    ?.accountCode;

  await prisma.$transaction(async (tx) => {
    await tx.rhRequest.update({
      where: { id: req.id },
      data: {
        status: "CANCELLED",
        reviewedById: params.asManager ? params.actorId : req.reviewedById,
        reviewedAt: new Date(),
        reviewNote:
          params.note?.trim() ||
          (params.asManager
            ? "Annulée par le manager / RH"
            : "Annulée par le collaborateur"),
      },
    });

    if (req.type === "LEAVE" || req.type === "UNPAID_LEAVE") {
      await tx.rhLeaveDay.deleteMany({ where: { requestId: req.id } });
    }

    if (req.type === "TIMESHEET") {
      const tsId =
        req.timesheet?.id ||
        (req.payload as { timesheetId?: string })?.timesheetId;
      if (tsId) {
        const ts = await tx.rhTimesheet.findUnique({ where: { id: tsId } });
        if (ts) {
          // Si déjà approuvée : retirer le crédit récup HS
          if (approved && ts.ot25Minutes + ts.ot50Minutes > 0) {
            const settings = await getRhSettings();
            const dayH = Math.max(1, settings.workdayMinutes / 60);
            const otDays =
              Math.round(
                ((ts.ot25Minutes + ts.ot50Minutes) / 60 / dayH) * 10000
              ) / 10000;
            if (otDays > 0) {
              const bal = await tx.rhLeaveBalance.findFirst({
                where: { employeeId: ts.employeeId, accountCode: "RECUP" },
                orderBy: { periodStart: "desc" },
              });
              if (bal) {
                const takenBack = Math.min(bal.accrued, otDays);
                const accrued = Math.max(0, bal.accrued - takenBack);
                const remaining = Math.max(0, accrued - bal.taken);
                await tx.rhLeaveBalance.update({
                  where: { id: bal.id },
                  data: {
                    accrued,
                    remaining,
                    bookable: remaining,
                  },
                });
              }
            }
          }
          await tx.rhTimesheet.update({
            where: { id: ts.id },
            data: {
              status: "DRAFT",
              requestId: null,
              signatureRequestedAt: null,
              docusealSubmissionId: null,
              docusealSigningUrl: null,
            },
          });
        }
      }
    }

    await tx.rhAuditLog.create({
      data: {
        actorId: params.actorId,
        targetId: req.employeeId,
        action: params.asManager ? "request.cancel.admin" : "request.cancel",
        detail: {
          requestId: req.id,
          type: req.type,
          wasStatus: req.status,
          note: params.note || null,
        },
      },
    });
  });

  // Restauration solde CP/RTT/RECUP après congé approuvé
  const daysToRestore = req.days ?? 0;
  if (
    approved &&
    req.type === "LEAVE" &&
    accountCode &&
    BALANCE_ACCOUNTS.has(accountCode) &&
    daysToRestore > 0
  ) {
    await restoreLeaveBalance({
      employeeId: req.employeeId,
      hireDate: req.employee.hireDate,
      accountCode,
      days: daysToRestore,
    });
  }

  if (leaveDates.length) {
    try {
      await syncTimesheetAbsencesForDates(req.employeeId, leaveDates);
    } catch (e) {
      console.error("[rh.cancel] sync feuille", e);
    }
  }

  await notifyRhRequestCancelled({
    requestId: req.id,
    employeeId: req.employeeId,
    actorId: params.actorId,
    asManager: params.asManager,
    title: req.title,
    reference: req.reference,
    type: req.type,
    note: params.note,
  });

  return { ok: true as const };
}
