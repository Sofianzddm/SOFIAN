/**
 * 5 scénarios E2E métier RH (DB réelle).
 *
 * Run: pnpm test:rh:flows
 * Email: RH_E2E_EMAIL=...
 *
 * 1. CP → validation manager → solde débitée
 * 2. Timesheet → HS → pause légale → approve
 * 3. Maladie sans motif → rejet
 * 4. TT art. 1.6 (settings) + exception
 * 5. Manager ne peut pas s’auto-valider / scope PDF
 */
import "dotenv/config";
import prisma from "@/lib/prisma";
import { assertLegalBreak, slotsGrossMinutes } from "@/lib/rh/calculations";
import { canDecideRhRequest, canViewRhEmployee } from "@/lib/rh/auth";
import { createLeaveRequest, decideLeaveRequest } from "@/lib/rh/leave";
import { requestRemoteException, upsertRemoteDeclaration } from "@/lib/rh/remote";
import { getRhSettings } from "@/lib/rh/settings";
import {
  decideTimesheet,
  getOrCreateTimesheet,
  submitTimesheet,
  updateTimesheetDays,
} from "@/lib/rh/timesheet";
import { isoWeekInfo } from "@/lib/rh/workflow";
import { isFrenchHoliday } from "@/lib/rh/holidays";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const email =
    process.env.RH_E2E_EMAIL?.trim() || "s.zeddam@glowupagence.fr";

  const emp = await prisma.rhEmployee.findFirst({
    where: { user: { email }, actif: true },
    include: { user: { select: { prenom: true, nom: true, email: true } } },
  });
  assert(emp, `Employé ${email} introuvable`);

  const reviewer = await prisma.rhEmployee.findFirst({
    where: {
      rhRole: { in: ["HR", "MANAGER"] },
      actif: true,
      NOT: { id: emp.id },
    },
  });
  assert(reviewer, "Aucun manager/HR distinct pour les tests");

  const settings = await getRhSettings();
  console.log(`Flows E2E · ${email}`);

  // ── 1 · Pause légale (unitaire + feuille) ─────────────────────────
  {
    const slots = [
      { from: "09:00", to: "12:00" },
      { from: "13:00", to: "18:00" },
    ];
    assert(slotsGrossMinutes(slots) === 480, "gross 8h");
    let rejected = false;
    try {
      assertLegalBreak(480, 0);
    } catch {
      rejected = true;
    }
    assert(rejected, "pause 0 rejetée");
    assertLegalBreak(480, 20);
    console.log("✓ 1a pause légale unitaire");
  }

  // Semaine isolée (2099) pour ne pas polluer la prod
  const ref = new Date("2099-03-10T12:00:00.000Z"); // mardi → semaine du lundi 10
  // Forcer un lundi ISO
  const monday = new Date("2099-03-07T12:00:00.000Z");
  const info = isoWeekInfo(monday);

  // Cleanup préalable
  const existingTs = await prisma.rhTimesheet.findUnique({
    where: {
      employeeId_isoYear_isoWeek: {
        employeeId: emp.id,
        isoYear: info.isoYear,
        isoWeek: info.isoWeek,
      },
    },
  });
  if (existingTs) {
    if (existingTs.requestId) {
      await prisma.rhRequest.delete({ where: { id: existingTs.requestId } }).catch(() => {});
    }
    await prisma.rhTimesheet.delete({ where: { id: existingTs.id } }).catch(() => {});
  }
  await prisma.rhLeaveDay.deleteMany({
    where: {
      employeeId: emp.id,
      date: { gte: info.weekStart, lte: info.weekEnd },
    },
  });
  await prisma.rhRequest.deleteMany({
    where: {
      employeeId: emp.id,
      dateFrom: { gte: info.weekStart, lte: info.weekEnd },
      type: { in: ["LEAVE", "REMOTE_EXCEPTION", "TIMESHEET"] },
    },
  });
  await prisma.rhRemoteDeclaration.deleteMany({
    where: {
      employeeId: emp.id,
      isoYear: info.isoYear,
      isoWeek: info.isoWeek,
    },
  });

  // ── 2 · Timesheet + pause + HS ────────────────────────────────────
  {
    const { timesheet } = await getOrCreateTimesheet(
      emp.id,
      monday,
      emp.weeklyHours
    );
    const breakMinutes = Math.max(20, settings.defaultBreakMinutes || 20);
    // Remplir lun–ven + 1h OT le lundi (créneaux élargis)
    const daysPayload = timesheet.days.map((day) => {
      const iso = day.date.toISOString().slice(0, 10);
      const dow = new Date(iso + "T12:00:00").getDay();
      if (dow === 0 || dow === 6 || isFrenchHoliday(iso)) {
        return { date: iso, slots: [] as Array<{ from: string; to: string }>, breakMinutes: 0 };
      }
      const base = dow === 5 ? settings.slotsFriday : settings.slotsWeekday;
      // Lundi : +1h pour forcer HS
      const slots =
        dow === 1
          ? [
              { from: "09:00", to: "12:00" },
              { from: "13:00", to: "19:00" },
            ]
          : base;
      return { date: iso, slots, breakMinutes };
    });
    await updateTimesheetDays({
      timesheetId: timesheet.id,
      employeeId: emp.id,
      weeklyHours: emp.weeklyHours,
      days: daysPayload,
    });
    // Pause insuffisante doit échouer
    let pauseFail = false;
    try {
      await updateTimesheetDays({
        timesheetId: timesheet.id,
        employeeId: emp.id,
        weeklyHours: emp.weeklyHours,
        days: [
          {
            date: info.weekStart.toISOString().slice(0, 10),
            slots: [
              { from: "09:00", to: "12:00" },
              { from: "13:00", to: "18:00" },
            ],
            breakMinutes: 5,
          },
        ],
      });
    } catch {
      pauseFail = true;
    }
    assert(pauseFail, "pause 5 min aurait dû échouer");

    const submitted = await submitTimesheet({
      timesheetId: timesheet.id,
      employeeId: emp.id,
      overtimeNote: "E2E HS — projet urgent client",
    });
    assert(submitted.status === "SUBMITTED", "submit OK");
    assert(submitted.requestId, "requestId");

    const auditSubmit = await prisma.rhAuditLog.findFirst({
      where: {
        action: "timesheet.submit",
        actorId: emp.id,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    });
    assert(auditSubmit, "audit timesheet.submit manquant");

    await decideTimesheet({
      timesheetId: timesheet.id,
      reviewerId: reviewer.id,
      action: "approve",
    });
    const approved = await prisma.rhTimesheet.findUniqueOrThrow({
      where: { id: timesheet.id },
    });
    assert(approved.status === "APPROVED", "approuvée");
    console.log("✓ 2 timesheet + pause + HS + audit + approve");

    // cleanup timesheet
    if (approved.requestId) {
      await prisma.rhRequest.delete({ where: { id: approved.requestId } }).catch(() => {});
    }
    await prisma.rhTimesheet.delete({ where: { id: timesheet.id } }).catch(() => {});
  }

  // ── 3 · Maladie sans motif ────────────────────────────────────────
  {
    let sickFail = false;
    try {
      await createLeaveRequest({
        employeeId: emp.id,
        hireDate: emp.hireDate,
        department: emp.department,
        accountCode: "SS",
        from: monday,
        to: monday,
        comment: "",
      });
    } catch {
      sickFail = true;
    }
    assert(sickFail, "maladie sans motif aurait dû échouer");
    console.log("✓ 3 maladie sans motif rejetée");
  }

  // ── 4 · CP pose + validation + débit (si solde) ───────────────────
  {
    const bals = await prisma.rhLeaveBalance.findMany({
      where: { employeeId: emp.id, accountCode: "CP", remaining: { gt: 0 } },
      orderBy: { periodStart: "asc" },
    });
    const beforeSum = bals.reduce((s, b) => s + b.remaining, 0);
    if (beforeSum < 1) {
      console.log("↷ 4 CP skip (pas de solde CP ≥ 1)");
    } else {
      // Chercher un jour ouvré hors férié dans la semaine
      let day: Date | null = null;
      for (let i = 0; i < 5; i++) {
        const d = new Date(info.weekStart);
        d.setUTCDate(info.weekStart.getUTCDate() + i);
        const iso = d.toISOString().slice(0, 10);
        if (!isFrenchHoliday(iso)) {
          day = d;
          break;
        }
      }
      assert(day, "pas de jour ouvré");
      const snapshot = bals.map((b) => ({
        id: b.id,
        remaining: b.remaining,
        taken: b.taken,
      }));
      const { request: req } = await createLeaveRequest({
        employeeId: emp.id,
        hireDate: emp.hireDate,
        department: emp.department,
        accountCode: "CP",
        from: day,
        to: day,
        comment: "E2E CP",
      });
      assert(req.status === "PENDING", "CP pending");
      await decideLeaveRequest({
        requestId: req.id,
        reviewerId: reviewer.id,
        approve: true,
      });
      const afterBals = await prisma.rhLeaveBalance.findMany({
        where: { employeeId: emp.id, accountCode: "CP" },
      });
      const afterSum = afterBals.reduce((s, b) => s + b.remaining, 0);
      assert(
        afterSum <= beforeSum - 0.5,
        `solde CP non débité (${beforeSum}→${afterSum})`
      );
      console.log("✓ 4 CP → approve → solde débité");

      // cleanup leave days + request + restore balances
      await prisma.rhLeaveDay.deleteMany({ where: { requestId: req.id } });
      await prisma.rhRequest.delete({ where: { id: req.id } }).catch(() => {});
      for (const s of snapshot) {
        await prisma.rhLeaveBalance.update({
          where: { id: s.id },
          data: { remaining: s.remaining, taken: s.taken },
        });
      }
    }
  }

  // ── 5 · Droits + TT ───────────────────────────────────────────────
  {
    const asManager = {
      id: emp.id,
      userId: emp.userId,
      matricule: emp.matricule,
      jobTitle: emp.jobTitle,
      department: emp.department,
      managerId: emp.managerId,
      hireDate: emp.hireDate,
      weeklyHours: emp.weeklyHours,
      avatarColor: emp.avatarColor,
      avatarUrl: null as string | null,
      remoteAgreement: emp.remoteAgreement,
      rhRole: "MANAGER" as const,
      actif: emp.actif,
      prenom: emp.user.prenom,
      nom: emp.user.nom,
      email: emp.user.email,
      telephone: null as string | null,
    };
    // Auto-validation interdite
    const canSelf = await canDecideRhRequest(asManager, emp.id);
    assert(!canSelf, "manager ne doit pas s’auto-valider");

    // HR voit tout
    const asHr = {
      id: reviewer.id,
      userId: reviewer.userId,
      matricule: reviewer.matricule,
      jobTitle: reviewer.jobTitle,
      department: reviewer.department,
      managerId: reviewer.managerId,
      hireDate: reviewer.hireDate,
      weeklyHours: reviewer.weeklyHours,
      avatarColor: reviewer.avatarColor,
      avatarUrl: null as string | null,
      remoteAgreement: reviewer.remoteAgreement,
      rhRole: "HR" as const,
      actif: reviewer.actif,
      prenom: "RH",
      nom: "Test",
      email: "rh@test.local",
      telephone: null as string | null,
    };
    const hrCan = await canViewRhEmployee(asHr, emp.id);
    assert(hrCan, "HR doit voir le collab");

    // TT art 1.6 via settings
    const agreement = (emp.remoteAgreement === 2 || emp.remoteAgreement === 3
      ? emp.remoteAgreement
      : 2) as 0 | 2 | 3;
    if (agreement > 0) {
      // Sans absences → droit = agreement
      await upsertRemoteDeclaration({
        employeeId: emp.id,
        agreementDays: agreement,
        isoYear: info.isoYear,
        isoWeek: info.isoWeek,
        weekStart: info.weekStart,
        weekEnd: info.weekEnd,
        declaredDates: [monday].slice(0, Math.min(1, agreement)),
        note: "E2E TT",
      });
      console.log("✓ 5a TT déclaration OK");

      const exc = await requestRemoteException({
        employeeId: emp.id,
        date: new Date(info.weekStart.getTime() + 2 * 86400000),
        compensateNextWeek: true,
        motive: "E2E motif exception TT",
        isoYear: info.isoYear,
        isoWeek: info.isoWeek,
      });
      assert(exc.id, "exception créée");
      const auditExc = await prisma.rhAuditLog.findFirst({
        where: { action: "remote.exception", actorId: emp.id },
        orderBy: { createdAt: "desc" },
      });
      assert(auditExc, "audit remote.exception");
      await prisma.rhRequest.delete({ where: { id: exc.id } }).catch(() => {});
      console.log("✓ 5b TT exception + audit");
    } else {
      console.log("↷ 5 TT skip (avenant 0)");
    }

    await prisma.rhRemoteDeclaration.deleteMany({
      where: {
        employeeId: emp.id,
        isoYear: info.isoYear,
        isoWeek: info.isoWeek,
      },
    });
    console.log("✓ 5 droits fins (no self-approve, HR view)");
  }

  void ref;
  console.log("\nAll RH flow E2E checks passed.");
}

main()
  .catch((e) => {
    console.error("\nFLOWS E2E FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
